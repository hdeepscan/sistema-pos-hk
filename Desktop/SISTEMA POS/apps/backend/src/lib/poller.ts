import { prisma } from "./prisma.js";
import { revisarPedidosNuevos, type OrdenShopify } from "./shopify.js";
import { emitPedidoShopify, emitVentaCreada, emitInventarioActualizado } from "./ws.js";
import { conciliarInventario } from "./shopify-conciliacion.js";

const INTERVALO_MS = 60_000;
// Cada cuántos ciclos (minutos) se corrige Shopify para igualar a CENTRALA.
const CICLOS_CONCILIACION = Math.max(1, Number(process.env.SHOPIFY_CONCILIACION_MINUTOS) || 15);
let timer: ReturnType<typeof setInterval> | undefined;
let ciclo = 0;

// Crea una Venta real (canal SHOPIFY) a partir de un pedido de Shopify, para
// que aparezca en el modulo de Ventas junto a las del punto fisico. Descuenta
// el inventario local de la sucursal ecommerce SIN empujar el ajuste de vuelta
// a Shopify (alla ya se desconto al hacerse el pedido).
export async function crearVentaDesdeShopify(empresaId: string, sucursalEcommerceId: string, orden: OrdenShopify) {
  const clienteUuid = `shopify-${orden.id}`;
  const yaExiste = await prisma.venta.findUnique({ where: { clienteUuid } });
  if (yaExiste) return;

  const admin = await prisma.usuario.findFirst({
    where: { empresaId, rol: "ADMIN", activo: true },
    orderBy: { creadoEn: "asc" },
  });
  if (!admin) throw new Error(`La empresa ${empresaId} no tiene un administrador activo para registrar el pedido`);

  // Se vincula por variant_id (exacto); el SKU solo es respaldo si la variante no está vinculada.
  const lineas = orden.line_items ?? [];
  const variantIds = lineas.map((li) => li.variant_id).filter((v): v is number => v != null).map(String);
  const skus = lineas.map((li) => li.sku).filter((s): s is string => !!s);
  const productos = await prisma.producto.findMany({
    where: {
      empresaId,
      OR: [
        ...(variantIds.length ? [{ shopifyVariantId: { in: variantIds } }] : []),
        ...(skus.length ? [{ sku: { in: skus } }] : []),
      ],
    },
  });
  const productoPorVariante = new Map(productos.filter((p) => p.shopifyVariantId).map((p) => [p.shopifyVariantId!, p]));
  const productoPorSku = new Map(productos.map((p) => [p.sku, p]));

  const itemsMapeados = lineas
    .map((li) => {
      const producto =
        (li.variant_id != null ? productoPorVariante.get(String(li.variant_id)) : undefined) ??
        (li.sku ? productoPorSku.get(li.sku) : undefined);
      if (!producto) {
        console.warn(`[poller] Pedido ${orden.name}: línea "${li.name}" sin producto vinculado en CENTRALA`);
        return null;
      }
      return { productoId: producto.id, cantidad: li.quantity, precioUnitario: Number(li.price ?? 0) };
    })
    .filter((i): i is NonNullable<typeof i> => i !== null);

  const venta = await prisma.$transaction(async (tx) => {
    const ultima = await tx.venta.findFirst({
      where: { empresaId },
      orderBy: { consecutivo: "desc" },
      select: { consecutivo: true },
    });
    const venta = await tx.venta.create({
      data: {
        clienteUuid,
        empresaId,
        sucursalId: sucursalEcommerceId,
        usuarioId: admin.id,
        consecutivo: (ultima?.consecutivo ?? 0) + 1,
        total: Number(orden.total_price),
        metodoPago: "OTRO",
        canal: "SHOPIFY",
        items: { create: itemsMapeados },
      },
    });
    for (const item of itemsMapeados) {
      const invActual = await tx.inventarioSucursal.findUnique({
        where: { productoId_sucursalId: { productoId: item.productoId, sucursalId: sucursalEcommerceId } },
      });
      const nuevaCantidad = Math.max(0, (invActual?.cantidad ?? 0) - item.cantidad);
      await tx.inventarioSucursal.upsert({
        where: { productoId_sucursalId: { productoId: item.productoId, sucursalId: sucursalEcommerceId } },
        update: { cantidad: nuevaCantidad },
        create: { productoId: item.productoId, sucursalId: sucursalEcommerceId, cantidad: nuevaCantidad },
      });
      await tx.movimientoInventario.create({
        data: {
          productoId: item.productoId,
          sucursalId: sucursalEcommerceId,
          tipo: "VENTA",
          cantidad: item.cantidad,
          motivo: `Pedido Shopify ${orden.name}`,
          usuarioId: admin.id,
        },
      });
    }
    return venta;
  }).catch((err) => {
    // La restricción única de clienteUuid garantiza un solo registro por pedido aunque dos procesos lo reciban a la vez.
    if (err?.code === "P2002") return null;
    throw err;
  });
  if (!venta) return;

  emitVentaCreada(empresaId, {
    ventaId: venta.id,
    sucursalId: sucursalEcommerceId,
    total: Number(venta.total),
    fecha: venta.fecha.toISOString(),
  });
  for (const item of itemsMapeados) {
    const inv = await prisma.inventarioSucursal.findUnique({
      where: { productoId_sucursalId: { productoId: item.productoId, sucursalId: sucursalEcommerceId } },
    });
    if (inv) {
      emitInventarioActualizado(empresaId, {
        productoId: item.productoId,
        sucursalId: sucursalEcommerceId,
        cantidad: inv.cantidad,
      });
    }
  }
}

async function revisarTodasLasEmpresas() {
  ciclo++;
  const tocaConciliar = ciclo % CICLOS_CONCILIACION === 0;
  let configs: { empresaId: string; sucursalEcommerceId: string }[];
  try {
    configs = await prisma.shopifyConfig.findMany({
      where: { accessToken: { not: null } },
      select: { empresaId: true, sucursalEcommerceId: true },
    });
  } catch (err) {
    console.error("[poller] Error consultando configuraciones de Shopify:", err);
    return;
  }
  for (const { empresaId, sucursalEcommerceId } of configs) {
    let algunPedidoFallo = false;
    try {
      const ordenes = await revisarPedidosNuevos(empresaId);
      for (const orden of ordenes) {
        const existente = await prisma.pedidoShopifyNotificacion.findUnique({
          where: { empresaId_ordenId: { empresaId, ordenId: String(orden.id) } },
        });
        if (existente) {
          // La notificación ya existe, pero la venta pudo fallar antes: se reintenta (es idempotente).
          await crearVentaDesdeShopify(empresaId, sucursalEcommerceId, orden).catch((err) => {
            algunPedidoFallo = true;
            console.error(`[poller] No se pudo crear la venta del pedido ${orden.name}:`, err);
          });
          continue;
        }

        const clienteNombre = orden.customer
          ? [orden.customer.first_name, orden.customer.last_name].filter(Boolean).join(" ") || null
          : null;
        const productos = (orden.line_items ?? []).map((li) => ({ nombre: li.name, cantidad: li.quantity }));

        const notificacion = await prisma.pedidoShopifyNotificacion.create({
          data: {
            empresaId,
            ordenId: String(orden.id),
            numeroOrden: orden.name,
            clienteNombre,
            total: Number(orden.total_price),
            productos: JSON.stringify(productos),
            fechaPedido: new Date(orden.created_at),
          },
        });

        emitPedidoShopify(empresaId, {
          id: notificacion.id,
          ordenId: String(orden.id),
          nombre: orden.name,
          clienteNombre,
          total: Number(orden.total_price),
          productos,
          fecha: orden.created_at,
        });

        await crearVentaDesdeShopify(empresaId, sucursalEcommerceId, orden).catch((err) => {
          algunPedidoFallo = true;
          console.error(`[poller] No se pudo crear la venta del pedido ${orden.name}:`, err);
        });
      }
    } catch (err) {
      console.error(`[poller] Error revisando pedidos de la empresa ${empresaId}:`, err);
      // Sin los pedidos al día, corregir Shopify podría devolverle unidades ya vendidas allá.
      continue;
    }

    if (!tocaConciliar || algunPedidoFallo) continue;
    try {
      const r = await conciliarInventario(empresaId, true);
      if (r.corregidos > 0 || r.omitido) {
        console.log(
          `[conciliacion] Empresa ${empresaId.slice(0, 8)}: ${r.corregidos} corregido(s) de ${r.diferencias.length} diferencia(s)` +
            (r.omitido ? ` — ${r.omitido}` : "")
        );
      }
    } catch (err) {
      console.error(`[conciliacion] Error en la empresa ${empresaId}:`, err instanceof Error ? err.message : err);
    }
  }
}

export function iniciarPollerShopify() {
  if (timer) return;
  timer = setInterval(() => {
    void revisarTodasLasEmpresas();
  }, INTERVALO_MS);
}
