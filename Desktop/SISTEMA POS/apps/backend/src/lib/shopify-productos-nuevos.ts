import { prisma } from "./prisma.js";
import { asegurarUbicacionEcommerce } from "./shopify.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

// Trae a CENTRALA los productos creados directamente en Shopify. Se ejecuta desde el
// poller (cada minuto) y desde el webhook products/create.
//
// Cada variante queda como un Producto (mismo formato que los creados en CENTRALA) y su
// stock de la sucursal ecommerce se toma del "available" de su ubicación en Shopify, para
// que la conciliación no lo deje en 0 en Shopify.

const MAX_PAGINAS = 10;

// Productos que no se importan (SKU ya usado en CENTRALA): se recuerdan para no
// consultarlos ni registrarlos en el log cada minuto.
const omitidos = new Set<string>();

function idNumerico(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

/**
 * Busca productos creados en Shopify después de conectar la tienda que todavía no están
 * en CENTRALA y los importa. Devuelve cuántos productos se importaron.
 */
export async function importarProductosNuevosDeShopify(empresaId: string): Promise<number> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) return 0;

  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const filtro = `created_at:>'${config.creadoEn.toISOString()}'`;
  const nuevos: string[] = [];
  let after: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const data: any = await client.query({
      query: `
        query ProductosRecientes($after: String, $filtro: String!) {
          products(first: 100, after: $after, sortKey: CREATED_AT, reverse: true, query: $filtro) {
            pageInfo { hasNextPage endCursor }
            nodes { id }
          }
        }
      `,
      variables: { after, filtro },
    });
    const ids: string[] = (data?.products?.nodes ?? []).map((n: { id: string }) => idNumerico(n.id));
    if (ids.length === 0) break;

    const existentes = await prisma.producto.findMany({
      where: { empresaId, shopifyProductId: { in: ids } },
      select: { shopifyProductId: true },
      distinct: ["shopifyProductId"],
    });
    const conocidos = new Set(existentes.map((p) => p.shopifyProductId));
    const faltantes = ids.filter((id) => !conocidos.has(id) && !omitidos.has(`${empresaId}:${id}`));
    nuevos.push(...faltantes);

    // Los más recientes vienen primero: una página sin faltantes significa que lo anterior ya está.
    if (faltantes.length === 0 || !data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  let importados = 0;
  for (const shopifyProductId of nuevos) {
    try {
      if (await importarProductoShopify(empresaId, shopifyProductId)) importados++;
    } catch (err) {
      console.error(
        `[shopify-productos-nuevos] No se pudo importar el producto ${shopifyProductId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return importados;
}

/**
 * Importa un producto de Shopify (con todas sus variantes y su stock). Devuelve false si
 * ya existía o si se omitió.
 */
export async function importarProductoShopify(empresaId: string, shopifyProductId: string): Promise<boolean> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) return false;

  const yaExiste = await prisma.producto.findFirst({ where: { empresaId, shopifyProductId }, select: { id: true } });
  if (yaExiste) return false;

  const locationId = await asegurarUbicacionEcommerce(empresaId, config.sucursalEcommerceId);
  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const data: any = await client.query({
    query: `
      query ProductoNuevo($id: ID!, $locationId: ID!, $conUbicacion: Boolean!) {
        product(id: $id) {
          title
          descriptionHtml
          productType
          vendor
          status
          options { name }
          media(first: 1) { nodes { preview { image { url } } } }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              barcode
              price
              image { url }
              inventoryItem {
                id
                inventoryLevel(locationId: $locationId) @include(if: $conUbicacion) {
                  quantities(names: ["available"]) { name quantity }
                }
              }
            }
          }
        }
      }
    `,
    variables: {
      id: `gid://shopify/Product/${shopifyProductId}`,
      locationId: locationId ? `gid://shopify/Location/${idNumerico(locationId)}` : "gid://shopify/Location/0",
      conUbicacion: !!locationId,
    },
  });

  const producto = data?.product;
  if (!producto) return false;
  const variantes: any[] = producto.variants?.nodes ?? [];
  if (variantes.length === 0) return false;

  const filas = variantes.map((v) => {
    const variantId = idNumerico(v.id);
    const disponible = v.inventoryItem?.inventoryLevel?.quantities?.find(
      (q: { name: string; quantity: number }) => q.name === "available"
    )?.quantity;
    return {
      sku: (v.sku as string | null)?.trim() || `SHOP-${variantId}`,
      codigoBarras: (v.barcode as string | null)?.trim() || null,
      precio: Number(v.price ?? 0),
      varianteTitulo: v.title && v.title !== "Default Title" ? (v.title as string) : null,
      imagenUrl: (v.image?.url as string | undefined) ?? null,
      shopifyVariantId: variantId,
      shopifyInventoryItemId: v.inventoryItem?.id ? idNumerico(v.inventoryItem.id) : null,
      stock: Math.max(0, typeof disponible === "number" ? disponible : 0),
    };
  });

  // Un SKU ya usado en CENTRALA indica que el producto ya existe aquí (o que CENTRALA lo está
  // creando en Shopify en este momento): no se duplica.
  const skuRepetido = await prisma.producto.findFirst({
    where: { empresaId, sku: { in: filas.map((f) => f.sku) } },
    select: { sku: true },
  });
  if (skuRepetido) {
    omitidos.add(`${empresaId}:${shopifyProductId}`);
    console.warn(
      `[shopify-productos-nuevos] "${producto.title}" (${shopifyProductId}) no se importó: el SKU ${skuRepetido.sku} ya existe en CENTRALA`
    );
    return false;
  }

  const imagenProducto: string | null = producto.media?.nodes?.[0]?.preview?.image?.url ?? null;
  const tieneVariantes = filas.some((f) => f.varianteTitulo);
  const nombresOpciones = (producto.options ?? []).map((o: { name: string }) => o.name).join("|");

  const [sucursales, admin] = await Promise.all([
    prisma.sucursal.findMany({ where: { empresaId, activo: true }, select: { id: true } }),
    prisma.usuario.findFirst({ where: { empresaId, rol: "ADMIN", activo: true }, orderBy: { creadoEn: "asc" } }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const fila of filas) {
      const creado = await tx.producto.create({
        data: {
          empresaId,
          nombre: producto.title,
          descripcion: producto.descriptionHtml || null,
          categoria: producto.productType || null,
          marca: producto.vendor || null,
          activo: producto.status !== "ARCHIVED",
          sku: fila.sku,
          codigoBarras: fila.codigoBarras,
          precio: fila.precio,
          costo: 0,
          imagenUrl: fila.imagenUrl ?? imagenProducto,
          varianteTitulo: fila.varianteTitulo,
          grupoOpciones: tieneVariantes && nombresOpciones ? nombresOpciones : null,
          grupoVariantes: shopifyProductId,
          shopifyProductId,
          shopifyVariantId: fila.shopifyVariantId,
          shopifyInventoryItemId: fila.shopifyInventoryItemId,
        },
      });

      if (sucursales.length > 0) {
        await tx.inventarioSucursal.createMany({
          data: sucursales.map((s) => ({
            productoId: creado.id,
            sucursalId: s.id,
            cantidad: s.id === config.sucursalEcommerceId ? fila.stock : 0,
          })),
        });
      }
      if (fila.stock > 0 && admin && sucursales.some((s) => s.id === config.sucursalEcommerceId)) {
        await tx.movimientoInventario.create({
          data: {
            productoId: creado.id,
            sucursalId: config.sucursalEcommerceId,
            tipo: "ENTRADA",
            cantidad: fila.stock,
            motivo: "Stock inicial (producto creado en Shopify)",
            usuarioId: admin.id,
          },
        });
      }
    }
  });

  console.log(
    `[shopify-productos-nuevos] Importado "${producto.title}" (${shopifyProductId}) con ${filas.length} variante(s)`
  );
  return true;
}
