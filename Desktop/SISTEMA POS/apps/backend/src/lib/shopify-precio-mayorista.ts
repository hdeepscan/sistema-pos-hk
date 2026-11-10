import { prisma } from "./prisma.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

// Precio mayorista desde un metacampo de producto de Shopify (ej. "Precio Mayorista",
// custom.precio_mayorista). No hace falta configurar nada: se busca el metacampo cuyo nombre o
// clave diga "mayorista" (o "wholesale").
//
// - Cada minuto se revisan los productos modificados en Shopify; la primera revisión tras un
//   reinicio recorre todo el catálogo.
// - Si se edita el precio mayorista en CENTRALA, se escribe también en el metacampo de Shopify.

const PATRON = /mayorist|wholesale/i;
const PAGINAS_COMPLETO = 250;
const PAGINAS_RECIENTES = 5;
const SOLAPE_MS = 5 * 60_000;
// Páginas de 20 productos con 15 metacampos: así cada consulta queda bajo el límite de costo de
// Shopify (1000 puntos).

const ultimaRevision = new Map<string, number>();

interface Metacampo {
  namespace: string;
  key: string;
  value: string | null;
  type?: string;
  definition?: { name: string } | null;
}

function esMayorista(m: Pick<Metacampo, "namespace" | "key" | "definition">): boolean {
  return PATRON.test(m.key) || PATRON.test(m.definition?.name ?? "") || PATRON.test(m.namespace);
}

/** Convierte "25000", "25.000", "$ 25.000,50" o {"amount":"25000.0"} a número. null si está vacío. */
export function leerValorPrecio(valor: string | null | undefined): number | null {
  if (valor == null) return null;
  let texto = valor.trim();
  if (!texto) return null;
  if (texto.startsWith("{")) {
    try {
      texto = String(JSON.parse(texto).amount ?? "");
    } catch {
      return null;
    }
  }
  texto = texto.replace(/[^\d.,-]/g, "");
  if (/^\d+(\.\d+)?$/.test(texto)) {
    // "25000" o "25000.0"; pero "25.000" es miles.
    if (/^\d{1,3}(\.\d{3})+$/.test(texto)) return Number(texto.replace(/\./g, ""));
    return Number(texto);
  }
  // Formato colombiano: puntos de miles y coma decimal.
  const numero = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/** El valor del metacampo mayorista de un producto: undefined si el producto no tiene ese metacampo. */
export function precioMayoristaDe(metacampos: Metacampo[]): number | null | undefined {
  const m = metacampos.find(esMayorista);
  if (!m) return undefined;
  return leerValorPrecio(m.value);
}

/**
 * Trae el precio mayorista de los productos de Shopify a CENTRALA. `todos` recorre el catálogo
 * completo; si no, solo los productos modificados desde la última revisión.
 */
export async function sincronizarPreciosMayoristas(
  empresaId: string,
  opciones: { todos?: boolean } = {}
): Promise<{ revisados: number; actualizados: number }> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) return { revisados: 0, actualizados: 0 };

  const inicio = Date.now();
  const previa = ultimaRevision.get(empresaId);
  const todos = opciones.todos || previa === undefined;
  const filtro = todos ? null : `updated_at:>'${new Date(previa! - SOLAPE_MS).toISOString()}'`;
  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);

  let revisados = 0;
  let actualizados = 0;
  let after: string | null = null;
  for (let pagina = 0; pagina < (todos ? PAGINAS_COMPLETO : PAGINAS_RECIENTES); pagina++) {
    const data: any = await client.query({
      query: `
        query PreciosMayoristas($after: String, $filtro: String) {
          products(first: 20, after: $after, sortKey: UPDATED_AT, reverse: true, query: $filtro) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              metafields(first: 15) { nodes { namespace key value type definition { name } } }
            }
          }
        }
      `,
      variables: { after, filtro },
    });
    const productos: any[] = data?.products?.nodes ?? [];
    if (productos.length === 0) break;

    for (const p of productos) {
      revisados++;
      const precio = precioMayoristaDe(p.metafields?.nodes ?? []);
      // Sin metacampo mayorista en este producto: no se toca lo que tenga CENTRALA.
      if (precio === undefined) continue;
      const shopifyProductId = p.id.slice(p.id.lastIndexOf("/") + 1);
      const r = await prisma.producto.updateMany({
        where: {
          empresaId,
          shopifyProductId,
          // Solo filas con un valor distinto (evita escrituras cada minuto).
          OR: precio === null ? [{ precioMayorista: { not: null } }] : [{ precioMayorista: null }, { precioMayorista: { not: precio } }],
        },
        data: { precioMayorista: precio },
      });
      actualizados += r.count;
    }

    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  ultimaRevision.set(empresaId, inicio);
  return { revisados, actualizados };
}

/** Escribe el precio mayorista en el metacampo del producto en Shopify (crea el valor si no estaba). */
export async function escribirPrecioMayoristaEnShopify(
  empresaId: string,
  shopifyProductId: string,
  precio: number | null
): Promise<void> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) return;
  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const ownerId = `gid://shopify/Product/${shopifyProductId}`;

  // El metacampo que usa la tienda: el que ya tiene el producto o la definición de la tienda.
  const data: any = await client.query({
    query: `
      query MetacampoMayorista($id: ID!) {
        product(id: $id) { metafields(first: 30) { nodes { id namespace key type definition { name } } } }
        metafieldDefinitions(ownerType: PRODUCT, first: 100) { nodes { namespace key name type { name } } }
      }
    `,
    variables: { id: ownerId },
  });
  const existente = (data?.product?.metafields?.nodes ?? []).find(esMayorista);
  const definicion = (data?.metafieldDefinitions?.nodes ?? []).find((d: any) =>
    esMayorista({ namespace: d.namespace, key: d.key, definition: { name: d.name } })
  );
  const namespace = existente?.namespace ?? definicion?.namespace ?? "custom";
  const key = existente?.key ?? definicion?.key ?? "precio_mayorista";
  const tipo: string = existente?.type ?? definicion?.type?.name ?? "number_decimal";

  if (precio === null) {
    if (!existente) return;
    const r: any = await client.query({
      query: `mutation BorrarMayorista($m: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $m) { userErrors { message } }
      }`,
      variables: { m: [{ ownerId, namespace, key }] },
    });
    const errores = r?.metafieldsDelete?.userErrors ?? [];
    if (errores.length) throw new Error(errores.map((e: any) => e.message).join(", "));
    return;
  }

  const valor =
    tipo === "money"
      ? JSON.stringify({ amount: precio.toFixed(2), currency_code: "COP" })
      : tipo === "number_integer"
        ? String(Math.round(precio))
        : String(precio);
  const r: any = await client.query({
    query: `mutation EscribirMayorista($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) { userErrors { field message } }
    }`,
    variables: { m: [{ ownerId, namespace, key, type: tipo, value: valor }] },
  });
  const errores = r?.metafieldsSet?.userErrors ?? [];
  if (errores.length) throw new Error(errores.map((e: any) => e.message).join(", "));
}
