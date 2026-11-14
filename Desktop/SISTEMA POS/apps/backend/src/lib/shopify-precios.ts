import { prisma } from "./prisma.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

// Trae a CENTRALA el precio de venta cuando se cambia en Shopify. Antes solo se traían productos
// y variantes nuevas: si se cambiaba el precio de un producto existente en Shopify, CENTRALA
// seguía con el precio viejo.
//
// Cada minuto se piden las variantes modificadas desde la última revisión (una consulta liviana:
// solo id y precio). La primera revisión tras un reinicio recorre todo el catálogo.

const POR_PAGINA = 250;
const PAGINAS_COMPLETO = 200;
const PAGINAS_RECIENTES = 4;
const SOLAPE_MS = 5 * 60_000;

const ultimaRevision = new Map<string, number>();

function idNumerico(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

export async function sincronizarPreciosDesdeShopify(
  empresaId: string,
  opciones: { todos?: boolean } = {}
): Promise<{ revisadas: number; actualizadas: { nombre: string; antes: number; ahora: number }[] }> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) return { revisadas: 0, actualizadas: [] };

  const inicio = Date.now();
  const previa = ultimaRevision.get(empresaId);
  const todos = opciones.todos || previa === undefined;
  const filtro = todos ? null : `updated_at:>'${new Date(previa! - SOLAPE_MS).toISOString()}'`;
  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);

  let revisadas = 0;
  const actualizadas: { nombre: string; antes: number; ahora: number }[] = [];
  let after: string | null = null;

  for (let pagina = 0; pagina < (todos ? PAGINAS_COMPLETO : PAGINAS_RECIENTES); pagina++) {
    const data: any = await client.query({
      query: `
        query PreciosVariantes($after: String, $filtro: String, $n: Int!) {
          productVariants(first: $n, after: $after, query: $filtro) {
            pageInfo { hasNextPage endCursor }
            nodes { id price }
          }
        }
      `,
      variables: { after, filtro, n: POR_PAGINA },
    });
    const variantes: { id: string; price: string }[] = data?.productVariants?.nodes ?? [];
    if (variantes.length === 0) break;
    revisadas += variantes.length;

    const precioPorVariante = new Map(variantes.map((v) => [idNumerico(v.id), Number(v.price)]));
    const locales = await prisma.producto.findMany({
      where: { empresaId, shopifyVariantId: { in: [...precioPorVariante.keys()] } },
      select: { id: true, nombre: true, varianteTitulo: true, precio: true, shopifyVariantId: true },
    });
    for (const p of locales) {
      const ahora = precioPorVariante.get(p.shopifyVariantId!);
      if (ahora === undefined || !Number.isFinite(ahora) || ahora === Number(p.precio)) continue;
      await prisma.producto.update({ where: { id: p.id }, data: { precio: ahora } });
      actualizadas.push({
        nombre: p.varianteTitulo ? `${p.nombre} (${p.varianteTitulo})` : p.nombre,
        antes: Number(p.precio),
        ahora,
      });
    }

    if (!data.productVariants.pageInfo.hasNextPage) break;
    after = data.productVariants.pageInfo.endCursor;
  }

  ultimaRevision.set(empresaId, inicio);
  if (actualizadas.length > 0) {
    console.log(
      `[shopify-precios] Empresa ${empresaId.slice(0, 8)}: ${actualizadas.length} precio(s) actualizados desde Shopify: ` +
        actualizadas.slice(0, 5).map((a) => `${a.nombre} ${a.antes} → ${a.ahora}`).join("; ")
    );
  }
  return { revisadas, actualizadas };
}
