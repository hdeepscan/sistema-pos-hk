import { prisma } from "./prisma.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";
import { registrarAuditoria } from "./auditoria.js";

// Archiva en CENTRALA los productos (o variantes) que se eliminaron en Shopify. Se archivan
// (activo = false) en vez de borrarse para conservar el historial de ventas; dejan de verse en
// el POS y en Productos. Se ejecuta desde el poller cada 15 minutos.

const LOTE = 250;

export async function archivarProductosEliminadosEnShopify(empresaId: string): Promise<number> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) return 0;

  const vinculados = await prisma.producto.findMany({
    where: { empresaId, activo: true, shopifyVariantId: { not: null } },
    select: { id: true, nombre: true, varianteTitulo: true, shopifyVariantId: true },
  });
  if (vinculados.length === 0) return 0;

  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const existentes = new Set<string>();
  const variantIds = [...new Set(vinculados.map((p) => p.shopifyVariantId!))];

  for (let i = 0; i < variantIds.length; i += LOTE) {
    const lote = variantIds.slice(i, i + LOTE);
    const data: any = await client.query({
      query: `
        query VariantesExistentes($ids: [ID!]!) {
          nodes(ids: $ids) { ... on ProductVariant { id } }
        }
      `,
      variables: { ids: lote.map((id) => `gid://shopify/ProductVariant/${id}`) },
    });
    for (const nodo of data?.nodes ?? []) {
      if (nodo?.id) existentes.add(String(nodo.id).slice(String(nodo.id).lastIndexOf("/") + 1));
    }
  }

  const eliminados = vinculados.filter((p) => !existentes.has(p.shopifyVariantId!));
  if (eliminados.length === 0) return 0;

  // Protección: si "desaparece" la mayoría del catálogo, lo más probable es que se haya
  // conectado otra tienda o que Shopify respondió mal, no que se borrara todo. No se toca nada.
  if (eliminados.length > 20 && eliminados.length > vinculados.length / 2) {
    console.warn(
      `[shopify-eliminados] Empresa ${empresaId.slice(0, 8)}: ${eliminados.length} de ${vinculados.length} ` +
        `variantes no aparecen en Shopify; no se archiva nada por seguridad`
    );
    return 0;
  }

  await prisma.producto.updateMany({
    where: { id: { in: eliminados.map((p) => p.id) }, empresaId },
    data: { activo: false },
  });

  for (const p of eliminados) {
    const nombre = p.varianteTitulo ? `${p.nombre} (${p.varianteTitulo})` : p.nombre;
    console.log(`[shopify-eliminados] Archivado "${nombre}": se eliminó en Shopify`);
    registrarAuditoria({
      empresaId,
      accion: "ARCHIVAR_PRODUCTO",
      entidad: "Producto",
      entidadId: p.id,
      detalle: `${nombre} (eliminado en Shopify)`,
    });
  }
  return eliminados.length;
}
