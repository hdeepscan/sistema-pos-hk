import { prisma } from "./prisma.js";
import { asegurarUbicacionEcommerce } from "./shopify.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

const MAX_CAMBIOS_POR_LOTE = 100;

interface FilaProducto {
  productoId: string;
  nombre: string;
  sku: string;
  varianteTitulo: string | null;
  centrala: number;
}

export interface ResultadoConciliacion {
  revisadoEn: string;
  totalShopify: number;
  totalVinculados: number;
  coinciden: number;
  diferencias: (FilaProducto & { shopify: number; diferencia: number })[];
  noEnShopify: FilaProducto[];
  sinVincular: { sku: string | null; inventoryItemId: string; shopify: number }[];
  corregidos: number;
  omitido: string | null;
}

/**
 * Compara el stock de la sucursal ecommerce de CENTRALA con el "available" de su ubicación
 * en Shopify. Con aplicar = true, corrige Shopify para que quede igual que CENTRALA.
 * Solo toca artículos vinculados a un producto de CENTRALA.
 */
export async function conciliarInventario(empresaId: string, aplicar: boolean): Promise<ResultadoConciliacion> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) throw new Error("Conecta Shopify antes de revisar el inventario");

  const locationId = await asegurarUbicacionEcommerce(empresaId, config.sucursalEcommerceId);
  if (!locationId) throw new Error("No se encontró la ubicación de Shopify de la sucursal ecommerce");

  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const niveles = await client.obtenerInventarioUbicacion(locationId);

  const productos = await prisma.producto.findMany({
    where: { empresaId, shopifyInventoryItemId: { not: null } },
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
  const noEnShopify: FilaProducto[] = [];
  const cambios: { inventoryItemId: string; locationId: string; delta: number; changeFromQuantity: number }[] = [];

  for (const p of productos) {
    const centrala = p.inventario[0]?.cantidad ?? 0;
    const fila = { productoId: p.id, nombre: p.nombre, sku: p.sku, varianteTitulo: p.varianteTitulo, centrala };
    const nivel = nivelPorItem.get(p.shopifyInventoryItemId!);
    if (!nivel) {
      noEnShopify.push(fila);
      continue;
    }
    if (nivel.disponible === centrala) continue;

    diferencias.push({ ...fila, shopify: nivel.disponible, diferencia: nivel.disponible - centrala });
    // Shopify no debe quedar en negativo aunque CENTRALA lo esté por ventas sin stock.
    const delta = Math.max(0, centrala) - nivel.disponible;
    if (delta !== 0) {
      cambios.push({
        inventoryItemId: p.shopifyInventoryItemId!,
        locationId,
        delta,
        changeFromQuantity: nivel.disponible,
      });
    }
  }

  const vinculados = new Set(productos.map((p) => p.shopifyInventoryItemId));
  const sinVincular = niveles
    .filter((n) => !vinculados.has(n.inventoryItemId))
    .map((n) => ({ sku: n.sku, inventoryItemId: n.inventoryItemId, shopify: n.disponible }));

  let corregidos = 0;
  let omitido: string | null = null;

  if (aplicar && cambios.length > 0) {
    // Si una venta de CENTRALA aún no llegó a Shopify, corregir ahora y luego aplicar la cola
    // descontaría dos veces. Se espera a la siguiente revisión.
    const pendientes = await prisma.shopifySyncQueue.count({
      where: { empresaId, tipo: "INVENTORY_UPDATE", estado: { in: ["PENDIENTE", "PROCESANDO"] } },
    });
    if (pendientes > 0) {
      omitido = `Hay ${pendientes} ajuste(s) pendientes en la cola; se corregirá en la siguiente revisión`;
    } else {
      corregidos = await aplicarCambios(client, cambios);
    }
  }

  return {
    revisadoEn: new Date().toISOString(),
    totalShopify: niveles.length,
    totalVinculados: productos.length,
    coinciden: productos.length - diferencias.length - noEnShopify.length,
    diferencias,
    noEnShopify,
    sinVincular,
    corregidos,
    omitido,
  };
}

async function aplicarCambios(
  client: ShopifyGraphQLClient,
  cambios: { inventoryItemId: string; locationId: string; delta: number; changeFromQuantity: number }[]
): Promise<number> {
  const referencia = `gid://centrala/InventorySyncJob/${Date.now()}`;
  let aplicados = 0;

  for (let i = 0; i < cambios.length; i += MAX_CAMBIOS_POR_LOTE) {
    const lote = cambios.slice(i, i + MAX_CAMBIOS_POR_LOTE);
    try {
      await client.ajustarInventarioLote(lote, referencia);
      aplicados += lote.length;
    } catch {
      // Un solo artículo que cambió desde la lectura rechaza el lote completo: se aplican uno por uno.
      for (const cambio of lote) {
        try {
          await client.ajustarInventarioLote([cambio], referencia);
          aplicados++;
        } catch (err) {
          console.warn(
            `[conciliacion] No se corrigió el item ${cambio.inventoryItemId}: ${err instanceof Error ? err.message : err}`
          );
        }
      }
    }
  }

  return aplicados;
}
