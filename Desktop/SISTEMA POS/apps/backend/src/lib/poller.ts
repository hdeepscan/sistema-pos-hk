import { prisma } from "./prisma.js";
import { revisarPedidosNuevos, type OrdenShopify } from "./shopify.js";
import { emitPedidoShopify, emitVentaCreada, emitInventarioActualizado } from "./ws.js";

const INTERVALO_MS = 60_000;
let timer: ReturnType<typeof setInterval> | undefined;

// Crea una Venta real (canal SHOPIFY) a partir de un pedido de Shopify, para
// que aparezca en el modulo de Ventas junto a las del punto fisico. Descuenta
// el inventario local de la sucursal ecommerce SIN empujar el ajuste de vuelta
// a Shopify (alla ya se desconto al hacerse el pedido).
async function crearVentaDesdeShopify(empresaId: string, sucursalEcommerceId: string, orden: OrdenShopify) {
  const clienteUuid = `shopify-${orden.id}`;
  const yaExiste = await prisma.venta.findUnique({ where: { clienteUuid } });
  if (yaExiste) return;

  const admin = await prisma.usuario.findFirst({
    where: { empresaId, rol: "ADMIN", activo: true },
    orderBy: { creadoEn: "asc" },
  });
  if (!admin) return;

  const skus = (orden.line_items ?? []).map((li) => li.sku).filter((s): s is string => !!s);
  const productos = skus.length
    ? await prisma.producto.findMany({ where: { empresaId, sku: { in: skus } } })
    : [];
  const productoPorSku = new Map(productos.map((p) => [p.sku, p]));

  const itemsMapeados = (orden.line_items ?? [])
    .map((li) => {
      const producto = li.sku ? productoPorSku.get(li.sku) : undefined;
      if (!producto) return null;
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
      await tx.inventarioSucursal.upsert({
        where: { productoId_sucursalId: { productoId: item.productoId, sucursalId: sucursalEcommerceId } },
        update: { cantidad: { decrement: item.cantidad } },
        create: { productoId: item.productoId, sucursalId: sucursalEcommerceId, cantidad: -item.cantidad },
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
  });

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
  let configs: { empresaId: string; sucursalEcommerceId: string }[];
  try {
    configs = await prisma.shopifyConfig.findMany({ select: { empresaId: true, sucursalEcommerceId: true } });
  } catch (err) {
    console.error("[poller] Error consultando configuraciones de Shopify:", err);
    return;
  }
  for (const { empresaId, sucursalEcommerceId } of configs) {
    try {
      const ordenes = await revisarPedidosNuevos(empresaId);
      for (const orden of ordenes) {
        const existente = await prisma.pedidoShopifyNotificacion.findUnique({
          where: { empresaId_ordenId: { empresaId, ordenId: String(orden.id) } },
        });
        if (existente) continue;

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
          console.error(`[poller] No se pudo crear la venta del pedido ${orden.name}:`, err);
        });
      }
    } catch (err) {
      console.error(`[poller] Error revisando pedidos de la empresa ${empresaId}:`, err);
    }
  }
}

export function iniciarPollerShopify() {
  if (timer) return;
  timer = setInterval(() => {
    void revisarTodasLasEmpresas();
  }, INTERVALO_MS);
}
