import { prisma } from "./prisma.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

// Variantes que Shopify vende aunque no haya unidades: las que tienen "Seguir vendiendo cuando no
// haya stock" (inventoryPolicy CONTINUE) o las que no llevan seguimiento de inventario
// (tracked = false). Con cualquiera de las dos, la tienda online acepta pedidos con 0 unidades.

const POR_PAGINA = 100;
const PAGINAS_MAX = 100;

export interface VarianteSinControl {
  shopifyProductId: string;
  shopifyVariantId: string;
  producto: string;
  variante: string;
  disponible: number | null;
  motivo: "SIGUE_VENDIENDO" | "SIN_SEGUIMIENTO" | "AMBOS";
}

function idNumerico(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

async function cliente(empresaId: string): Promise<ShopifyGraphQLClient> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) throw new Error("Conecta Shopify antes de revisar las variantes");
  return new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
}

/** Lista las variantes de productos activos que se pueden vender sin stock. */
export async function buscarVentaSinStock(empresaId: string): Promise<{ revisadas: number; variantes: VarianteSinControl[] }> {
  const client = await cliente(empresaId);
  const variantes: VarianteSinControl[] = [];
  let revisadas = 0;
  let after: string | null = null;

  for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
    const data: any = await client.query({
      query: `
        query VentaSinStock($after: String, $n: Int!) {
          productVariants(first: $n, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              title
              inventoryPolicy
              inventoryQuantity
              inventoryItem { tracked }
              product { id title status }
            }
          }
        }
      `,
      variables: { after, n: POR_PAGINA },
    });
    const nodos: any[] = data?.productVariants?.nodes ?? [];
    revisadas += nodos.length;
    for (const v of nodos) {
      // Solo productos publicados (activos); los borradores y archivados no se venden.
      if (v.product?.status !== "ACTIVE") continue;
      const sigue = v.inventoryPolicy === "CONTINUE";
      const sinSeguimiento = v.inventoryItem?.tracked === false;
      if (!sigue && !sinSeguimiento) continue;
      variantes.push({
        shopifyProductId: idNumerico(v.product.id),
        shopifyVariantId: idNumerico(v.id),
        producto: v.product.title,
        variante: v.title === "Default Title" ? "" : v.title,
        disponible: typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : null,
        motivo: sigue && sinSeguimiento ? "AMBOS" : sigue ? "SIGUE_VENDIENDO" : "SIN_SEGUIMIENTO",
      });
    }
    if (!data?.productVariants?.pageInfo?.hasNextPage) break;
    after = data.productVariants.pageInfo.endCursor;
  }

  return { revisadas, variantes };
}

/**
 * Deja las variantes en "no vender sin stock" con seguimiento de inventario. Si se pasan
 * `variantIds`, solo esas; si no, todas las que encuentre la revisión.
 */
export async function corregirVentaSinStock(
  empresaId: string,
  variantIds?: string[]
): Promise<{ corregidas: number; fallidas: string[] }> {
  const client = await cliente(empresaId);
  const { variantes } = await buscarVentaSinStock(empresaId);
  const elegidas = variantIds ? variantes.filter((v) => variantIds.includes(v.shopifyVariantId)) : variantes;

  // productVariantsBulkUpdate trabaja por producto.
  const porProducto = new Map<string, VarianteSinControl[]>();
  for (const v of elegidas) porProducto.set(v.shopifyProductId, [...(porProducto.get(v.shopifyProductId) ?? []), v]);

  let corregidas = 0;
  const fallidas: string[] = [];
  for (const [productId, lista] of porProducto) {
    try {
      const r: any = await client.query({
        query: `mutation NoVenderSinStock($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
        }`,
        variables: {
          productId: `gid://shopify/Product/${productId}`,
          variants: lista.map((v) => ({
            id: `gid://shopify/ProductVariant/${v.shopifyVariantId}`,
            inventoryPolicy: "DENY",
            inventoryItem: { tracked: true },
          })),
        },
      });
      const errores = r?.productVariantsBulkUpdate?.userErrors ?? [];
      if (errores.length) throw new Error(errores.map((e: any) => e.message).join(", "));
      corregidas += lista.length;
    } catch (err) {
      console.error(`[venta-sin-stock] No se pudo corregir "${lista[0].producto}":`, err instanceof Error ? err.message : err);
      fallidas.push(lista[0].producto);
    }
  }
  return { corregidas, fallidas };
}
