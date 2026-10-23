import { prisma } from "./prisma.js";
import { asegurarUbicacionEcommerce, fijarInventarioEnShopify, obtenerUbicaciones } from "./shopify.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";
import { emitInventarioActualizado } from "./ws.js";

const MAX_CAMBIOS_POR_LOTE = 100;
// Un ajuste de venta "en curso" bloquea la corrección solo si es reciente. Antes cualquier
// ajuste PENDIENTE/PROCESANDO (aunque llevara días trabado, p. ej. tras un reinicio del
// servidor) bloqueaba la conciliación para siempre y Shopify quedaba desactualizado.
const MINUTOS_COLA_RECIENTE = 30;
const MINUTOS_PROCESANDO_ATASCADO = 10;

interface FilaProducto {
  productoId: string;
  nombre: string;
  sku: string;
  varianteTitulo: string | null;
  centrala: number;
}

export interface ResultadoConciliacion {
  revisadoEn: string;
  sucursal: { id: string; nombre: string } | null;
  ubicacion: { id: string; nombre: string } | null;
  totalShopify: number;
  totalVinculados: number;
  coinciden: number;
  diferencias: (FilaProducto & { shopify: number; diferencia: number })[];
  noEnShopify: FilaProducto[];
  sinVincular: { sku: string | null; inventoryItemId: string; shopify: number }[];
  corregidos: number;
  corregidosCentrala: number;
  fallidos: string[];
  omitido: string | null;
}

/**
 * Libera la cola de ajustes: los que quedaron "Procesando" por un reinicio pasan a ERROR, y
 * devuelve cuántos ajustes recientes siguen en curso (con esos no conviene corregir todavía).
 */
async function revisarColaInventario(empresaId: string): Promise<number> {
  const ahora = Date.now();
  await prisma.shopifySyncQueue.updateMany({
    where: {
      empresaId,
      tipo: "INVENTORY_UPDATE",
      estado: "PROCESANDO",
      creadoEn: { lt: new Date(ahora - MINUTOS_PROCESANDO_ATASCADO * 60_000) },
    },
    data: { estado: "ERROR", errorMensaje: "Interrumpido (reinicio del servidor). Lo corrige la conciliación de inventario." },
  });
  return prisma.shopifySyncQueue.count({
    where: {
      empresaId,
      tipo: "INVENTORY_UPDATE",
      estado: { in: ["PENDIENTE", "PROCESANDO"] },
      creadoEn: { gte: new Date(ahora - MINUTOS_COLA_RECIENTE * 60_000) },
    },
  });
}

// Tras igualar ambos lados, los ajustes viejos que siguen en cola ya no deben aplicarse
// (descontarían dos veces).
async function descartarAjustesViejos(empresaId: string) {
  await prisma.shopifySyncQueue.updateMany({
    where: {
      empresaId,
      tipo: "INVENTORY_UPDATE",
      estado: "PENDIENTE",
      creadoEn: { lt: new Date(Date.now() - MINUTOS_COLA_RECIENTE * 60_000) },
    },
    data: { estado: "ERROR", errorMensaje: "Reemplazado por la conciliación de inventario." },
  });
}

/**
 * Compara el stock de la sucursal ecommerce de CENTRALA con el "available" de su ubicación
 * en Shopify.
 * - modo "revisar": solo informa.
 * - modo "shopify": corrige Shopify para que quede igual a CENTRALA (también conecta a la
 *   ubicación los artículos que no estaban en ella).
 * - modo "centrala": corrige CENTRALA para que quede igual a Shopify.
 * Solo toca artículos vinculados a un producto de CENTRALA.
 */
export async function conciliarInventario(
  empresaId: string,
  modo: boolean | "revisar" | "shopify" | "centrala",
  usuarioId?: string
): Promise<ResultadoConciliacion> {
  const accion = modo === true ? "shopify" : modo === false ? "revisar" : modo;
  // Conectar a la ubicación artículos que no están en ella solo se hace a pedido del usuario
  // (en tiendas con varias ubicaciones puede ser intencional que no estén).
  const conectarFaltantes = modo === "shopify";
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) throw new Error("Conecta Shopify antes de revisar el inventario");

  const locationId = await asegurarUbicacionEcommerce(empresaId, config.sucursalEcommerceId);
  if (!locationId) throw new Error("No se encontró la ubicación de Shopify de la sucursal ecommerce");

  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const [niveles, sucursal, ubicaciones] = await Promise.all([
    client.obtenerInventarioUbicacion(locationId),
    prisma.sucursal.findUnique({ where: { id: config.sucursalEcommerceId }, select: { id: true, nombre: true } }),
    obtenerUbicaciones(empresaId).catch(() => []),
  ]);
  const ubicacion = ubicaciones.find((u) => String(u.id) === String(locationId));

  const productos = await prisma.producto.findMany({
    where: { empresaId, activo: true, shopifyInventoryItemId: { not: null } },
    select: {
      id: true,
      nombre: true,
      sku: true,
      varianteTitulo: true,
      shopifyInventoryItemId: true,
      inventario: { where: { sucursalId: config.sucursalEcommerceId }, select: { cantidad: true } },
    },
    orderBy: { nombre: "asc" },
  });

  const nivelPorItem = new Map(niveles.map((n) => [n.inventoryItemId, n]));
  const diferencias: ResultadoConciliacion["diferencias"] = [];
  const noEnShopify: (FilaProducto & { inventoryItemId: string })[] = [];

  for (const p of productos) {
    const centrala = p.inventario[0]?.cantidad ?? 0;
    const fila = { productoId: p.id, nombre: p.nombre, sku: p.sku, varianteTitulo: p.varianteTitulo, centrala };
    const nivel = nivelPorItem.get(p.shopifyInventoryItemId!);
    if (!nivel) {
      noEnShopify.push({ ...fila, inventoryItemId: p.shopifyInventoryItemId! });
      continue;
    }
    if (nivel.disponible === Math.max(0, centrala)) continue;
    diferencias.push({ ...fila, shopify: nivel.disponible, diferencia: nivel.disponible - centrala });
  }

  const vinculados = new Set(productos.map((p) => p.shopifyInventoryItemId));
  const sinVincular = niveles
    .filter((n) => !vinculados.has(n.inventoryItemId))
    .map((n) => ({ sku: n.sku, inventoryItemId: n.inventoryItemId, shopify: n.disponible }));

  let corregidos = 0;
  let corregidosCentrala = 0;
  const fallidos: string[] = [];
  let omitido: string | null = null;

  if (accion !== "revisar" && (diferencias.length > 0 || (conectarFaltantes && noEnShopify.length > 0))) {
    // Si una venta de CENTRALA aún no llegó a Shopify, corregir ahora contaría mal.
    const enCurso = await revisarColaInventario(empresaId);
    if (enCurso > 0) {
      omitido = `Hay ${enCurso} ajuste(s) de ventas recientes enviándose a Shopify. Espera un minuto y vuelve a intentar.`;
    } else if (accion === "shopify") {
      const cambios = diferencias.map((d) => ({
        inventoryItemId: productos.find((p) => p.id === d.productoId)!.shopifyInventoryItemId!,
        locationId,
        delta: Math.max(0, d.centrala) - d.shopify,
        changeFromQuantity: d.shopify,
        nombre: d.nombre,
      }));
      const r = await aplicarCambios(client, cambios);
      corregidos = r.aplicados;
      fallidos.push(...r.fallidos);
      // Artículos que no estaban conectados a la ubicación: se conectan y se fija el stock.
      for (const p of conectarFaltantes ? noEnShopify : []) {
        try {
          await fijarInventarioEnShopify(empresaId, p.inventoryItemId, locationId, Math.max(0, p.centrala));
          corregidos++;
        } catch {
          fallidos.push(p.varianteTitulo ? `${p.nombre} (${p.varianteTitulo})` : p.nombre);
        }
      }
      await descartarAjustesViejos(empresaId);
    } else if (accion === "centrala") {
      corregidosCentrala = await igualarCentrala(empresaId, config.sucursalEcommerceId, diferencias, usuarioId);
      await descartarAjustesViejos(empresaId);
    }
  }

  return {
    revisadoEn: new Date().toISOString(),
    sucursal,
    ubicacion: ubicacion ? { id: String(ubicacion.id), nombre: ubicacion.name } : { id: String(locationId), nombre: `Ubicación ${locationId}` },
    totalShopify: niveles.length,
    totalVinculados: productos.length,
    coinciden: productos.length - diferencias.length - noEnShopify.length,
    diferencias,
    noEnShopify: noEnShopify.map(({ inventoryItemId: _, ...f }) => f),
    sinVincular,
    corregidos,
    corregidosCentrala,
    fallidos,
    omitido,
  };
}

// Deja el stock de la sucursal ecommerce igual al de Shopify. No se envía nada a Shopify.
async function igualarCentrala(
  empresaId: string,
  sucursalId: string,
  diferencias: ResultadoConciliacion["diferencias"],
  usuarioId?: string
): Promise<number> {
  const responsable =
    usuarioId ??
    (await prisma.usuario.findFirst({ where: { empresaId, rol: "ADMIN", activo: true }, orderBy: { creadoEn: "asc" } }))?.id;
  let aplicados = 0;
  for (const d of diferencias) {
    const nueva = Math.max(0, d.shopify);
    await prisma.$transaction(async (tx) => {
      await tx.inventarioSucursal.upsert({
        where: { productoId_sucursalId: { productoId: d.productoId, sucursalId } },
        update: { cantidad: nueva },
        create: { productoId: d.productoId, sucursalId, cantidad: nueva },
      });
      if (responsable) {
        await tx.movimientoInventario.create({
          data: {
            productoId: d.productoId,
            sucursalId,
            tipo: "AJUSTE",
            cantidad: Math.abs(nueva - d.centrala),
            motivo: `Igualado con Shopify (${d.centrala} → ${nueva})`,
            usuarioId: responsable,
          },
        });
      }
    });
    emitInventarioActualizado(empresaId, { productoId: d.productoId, sucursalId, cantidad: nueva });
    aplicados++;
  }
  return aplicados;
}

async function aplicarCambios(
  client: ShopifyGraphQLClient,
  cambios: { inventoryItemId: string; locationId: string; delta: number; changeFromQuantity: number; nombre: string }[]
): Promise<{ aplicados: number; fallidos: string[] }> {
  const referencia = `gid://centrala/InventorySyncJob/${Date.now()}`;
  let aplicados = 0;
  const fallidos: string[] = [];

  for (let i = 0; i < cambios.length; i += MAX_CAMBIOS_POR_LOTE) {
    const lote = cambios.slice(i, i + MAX_CAMBIOS_POR_LOTE);
    try {
      await client.ajustarInventarioLote(lote, referencia, `${referencia}-lote-${i}`);
      aplicados += lote.length;
    } catch {
      // Un solo artículo que cambió desde la lectura rechaza el lote completo: se aplican uno por uno.
      for (const cambio of lote) {
        try {
          await client.ajustarInventarioLote(
            [cambio],
            referencia,
            `${referencia}-${cambio.inventoryItemId}-${cambio.changeFromQuantity}`
          );
          aplicados++;
        } catch (err) {
          fallidos.push(cambio.nombre);
          console.warn(
            `[conciliacion] No se corrigió el item ${cambio.inventoryItemId}: ${err instanceof Error ? err.message : err}`
          );
        }
      }
    }
  }

  return { aplicados, fallidos };
}
