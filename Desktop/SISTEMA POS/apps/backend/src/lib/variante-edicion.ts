import { prisma } from "./prisma.js";
import { obtenerAccessToken } from "./shopify.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

// Abreviatura de un valor de variante, igual que al crear el producto ("ROJO" -> "ROJ", "42" -> "42").
export function abreviarValor(texto: string): string {
  const limpio = texto.trim();
  if (/^\d+$/.test(limpio)) return limpio;
  return limpio
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Si el SKU se armó con los valores de la variante ("BLU-L-ROJ" para "L / Rojo"), devuelve el
 * SKU con los valores nuevos ("BLU-M-ROJ"). Si el SKU no sigue ese patrón (lo escribieron a mano)
 * devuelve null: no hace falta cambiarlo.
 */
export function skuConNuevosValores(sku: string, valoresViejos: string[], valoresNuevos: string[]): string | null {
  const viejo = valoresViejos.map(abreviarValor).filter(Boolean).join("-");
  const nuevo = valoresNuevos.map(abreviarValor).filter(Boolean).join("-");
  if (!viejo || !nuevo || viejo === nuevo) return null;
  // Acepta el consecutivo que se agrega cuando el SKU ya existía ("BLU-L-ROJ-2").
  const m = sku.match(new RegExp(`^(.*)-${viejo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?$`, "i"));
  if (!m) return null;
  return `${m[1]}-${nuevo}`;
}

/**
 * SKU para una variante nueva: el prefijo del SKU del producto (sin la parte de sus valores)
 * más las abreviaturas de los valores nuevos. Ej. producto "BLU-L-ROJ" (L / Rojo) y variante
 * "M / Azul" -> "BLU-M-AZU". Si el SKU del producto no lleva sus valores: "ABCD1234-M-AZU".
 */
export function skuParaVariante(skuProducto: string, valoresProducto: string[], valoresNuevos: string[]): string {
  const viejo = valoresProducto.map(abreviarValor).filter(Boolean).join("-");
  const nuevo = valoresNuevos.map(abreviarValor).filter(Boolean).join("-") || "VAR";
  const m = viejo ? skuProducto.match(new RegExp(`^(.*)-${viejo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?$`, "i")) : null;
  return `${m ? m[1] : skuProducto}-${nuevo}`;
}

/** Devuelve `base`, o `base-2`, `base-3`... el primero que ningún otro producto de la empresa use. */
export async function skuDisponible(empresaId: string, base: string, productoId: string): Promise<string> {
  for (let i = 1; i < 500; i++) {
    const candidato = i === 1 ? base : `${base}-${i}`;
    const choca = await prisma.producto.findFirst({
      where: { empresaId, sku: candidato, id: { not: productoId } },
      select: { id: true },
    });
    if (!choca) return candidato;
  }
  throw new Error("No se encontró un SKU libre");
}

// EAN-13 válido con prefijo interno de tienda (20x), como al crear productos.
function generarEan13(): string {
  let base = "20";
  for (let i = 0; i < 10; i++) base += Math.floor(Math.random() * 10);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + ((10 - (suma % 10)) % 10);
}

export async function codigoBarrasEnUso(empresaId: string, codigo: string, productoId: string) {
  return prisma.producto.findFirst({
    where: { empresaId, codigoBarras: codigo, id: { not: productoId } },
    select: { id: true, nombre: true, varianteTitulo: true },
  });
}

export async function codigoBarrasNuevo(empresaId: string, productoId: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const codigo = generarEan13();
    if (!(await codigoBarrasEnUso(empresaId, codigo, productoId))) return codigo;
  }
  throw new Error("No se pudo generar un código de barras libre");
}

export class ShopifyRechazoVariante extends Error {}

/**
 * Actualiza la variante en Shopify (valores de opción, SKU, código de barras y precio).
 * Shopify crea solo los valores de opción nuevos. Lanza ShopifyRechazoVariante si Shopify
 * rechaza el cambio (ej. ya existe otra variante con esa combinación).
 */
export async function actualizarVarianteEnShopify(
  empresaId: string,
  shopifyProductId: string,
  shopifyVariantId: string,
  cambios: { valores?: string[]; sku: string; codigoBarras: string | null; precio: number }
): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const client = new ShopifyGraphQLClient(shopDomain, token);
  const productId = `gid://shopify/Product/${shopifyProductId}`;

  const variante: Record<string, unknown> = {
    id: `gid://shopify/ProductVariant/${shopifyVariantId}`,
    price: String(cambios.precio),
    barcode: cambios.codigoBarras ?? "",
    inventoryItem: { sku: cambios.sku },
  };

  if (cambios.valores) {
    const data = await client.query<{ product: { options: { name: string }[] } | null }>({
      query: `query Opciones($id: ID!) { product(id: $id) { options { name } } }`,
      variables: { id: productId },
    });
    const nombres = data.product?.options.map((o) => o.name) ?? [];
    if (nombres.length !== cambios.valores.length) {
      throw new ShopifyRechazoVariante(
        `En Shopify este producto tiene ${nombres.length} opción(es) (${nombres.join(", ") || "ninguna"}) y la variante editada tiene ${cambios.valores.length}.`
      );
    }
    variante.optionValues = nombres.map((optionName, i) => ({ optionName, name: cambios.valores![i] }));
  }

  const res = await client.query<{
    productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] };
  }>({
    query: `mutation EditarVariante($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
        userErrors { field message }
      }
    }`,
    variables: { productId, variants: [variante] },
  });
  const errores = res.productVariantsBulkUpdate?.userErrors ?? [];
  if (errores.length > 0) {
    throw new ShopifyRechazoVariante(errores.map((e) => e.message).join(", "));
  }
}
