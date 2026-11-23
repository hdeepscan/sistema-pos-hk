import { prisma } from "./prisma.js";
import { obtenerAccessToken } from "./shopify.js";

// Cuando entra un pedido de Shopify con un producto que todavía no estaba en CENTRALA, la venta se
// crea sin esa línea (el total sí queda bien). En cuanto el producto llega a CENTRALA, esto agrega
// las líneas que faltan. No mueve inventario: el stock que se importa de Shopify ya trae descontada
// esa venta.

const DIAS = 15;
const API_VERSION = "2026-07";

export async function completarVentasShopify(empresaId: string): Promise<number> {
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);
  const notificaciones = await prisma.pedidoShopifyNotificacion.findMany({
    where: { empresaId, fechaPedido: { gte: desde } },
    select: { ordenId: true, numeroOrden: true, productos: true },
  });

  let lineasAgregadas = 0;
  let acceso: { token: string; shopDomain: string } | null = null;

  for (const n of notificaciones) {
    let unidadesPedido = 0;
    try {
      unidadesPedido = (JSON.parse(n.productos) as { cantidad: number }[]).reduce((a, p) => a + (Number(p.cantidad) || 0), 0);
    } catch {
      continue;
    }
    const venta = await prisma.venta.findUnique({
      where: { clienteUuid: `shopify-${n.ordenId}` },
      select: { id: true, items: { select: { productoId: true, cantidad: true } } },
    });
    if (!venta) continue;
    const unidadesVenta = venta.items.reduce((a, i) => a + i.cantidad, 0);
    if (unidadesVenta >= unidadesPedido) continue;

    acceso ??= await obtenerAccessToken(empresaId);
    const res = await fetch(
      `https://${acceso.shopDomain}/admin/api/${API_VERSION}/orders/${n.ordenId}.json?fields=id,line_items`,
      { headers: { "X-Shopify-Access-Token": acceso.token } }
    );
    if (!res.ok) continue;
    const orden = ((await res.json()) as { order?: { line_items?: { variant_id: number | null; quantity: number; price: string }[] } }).order;

    const yaEnVenta = new Set(venta.items.map((i) => i.productoId).filter(Boolean));
    for (const li of orden?.line_items ?? []) {
      if (li.variant_id == null) continue;
      const producto = await prisma.producto.findFirst({
        where: { empresaId, shopifyVariantId: String(li.variant_id) },
        select: { id: true },
      });
      if (!producto || yaEnVenta.has(producto.id)) continue;
      await prisma.ventaItem.create({
        data: { ventaId: venta.id, productoId: producto.id, cantidad: li.quantity, precioUnitario: Number(li.price ?? 0) },
      });
      yaEnVenta.add(producto.id);
      lineasAgregadas++;
      console.log(`[ventas-shopify] Pedido ${n.numeroOrden}: se agregó la línea que faltaba (variante ${li.variant_id})`);
    }
  }
  return lineasAgregadas;
}
