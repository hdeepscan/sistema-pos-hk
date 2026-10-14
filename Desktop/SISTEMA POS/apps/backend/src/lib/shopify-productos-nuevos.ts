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
// Revisión completa desde el botón: hasta 10.000 productos.
const MAX_PAGINAS_TODOS = 100;

// Productos que no se importan (SKU ya usado en CENTRALA): se recuerdan para no
// consultarlos ni registrarlos en el log cada minuto.
const omitidos = new Set<string>();

function idNumerico(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

export interface ResultadoProducto {
  shopifyProductId: string;
  titulo: string;
  estado: "importado" | "ya_existe" | "omitido" | "error";
  motivo?: string;
  variantes?: number;
}

export interface ResultadoImportacion {
  revisados: number;
  importados: number;
  productos: ResultadoProducto[];
}

/**
 * Busca productos de Shopify que todavía no están en CENTRALA y los importa.
 * - Automático (poller): solo los creados después de conectar la tienda, y se detiene en la
 *   primera página que ya está completa.
 * - todos = true (botón en la pantalla de Shopify): revisa todo el catálogo y reporta por qué
 *   se omitió cada producto.
 */
export async function importarProductosFaltantesDeShopify(
  empresaId: string,
  opciones: { todos?: boolean } = {}
): Promise<ResultadoImportacion> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) throw new Error("Conecta Shopify antes de importar productos");

  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const filtro = opciones.todos ? "" : `created_at:>'${config.creadoEn.toISOString()}'`;
  const maxPaginas = opciones.todos ? MAX_PAGINAS_TODOS : MAX_PAGINAS;
  const faltantes: { id: string; titulo: string }[] = [];
  let revisados = 0;
  let after: string | null = null;

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const data: any = await client.query({
      query: `
        query ProductosRecientes($after: String, $filtro: String) {
          products(first: 100, after: $after, sortKey: CREATED_AT, reverse: true, query: $filtro) {
            pageInfo { hasNextPage endCursor }
            nodes { id title }
          }
        }
      `,
      variables: { after, filtro: filtro || null },
    });
    const nodos: { id: string; title: string }[] = data?.products?.nodes ?? [];
    if (nodos.length === 0) break;
    revisados += nodos.length;
    const ids = nodos.map((n) => idNumerico(n.id));

    const existentes = await prisma.producto.findMany({
      where: { empresaId, shopifyProductId: { in: ids } },
      select: { shopifyProductId: true },
      distinct: ["shopifyProductId"],
    });
    const conocidos = new Set(existentes.map((p) => p.shopifyProductId));
    const nuevosPagina = nodos
      .map((n) => ({ id: idNumerico(n.id), titulo: n.title }))
      .filter((n) => !conocidos.has(n.id) && (opciones.todos || !omitidos.has(`${empresaId}:${n.id}`)));
    faltantes.push(...nuevosPagina);

    if (!data.products.pageInfo.hasNextPage) break;
    // Los más recientes vienen primero: una página sin faltantes significa que lo anterior ya está.
    if (!opciones.todos && nuevosPagina.length === 0) break;
    after = data.products.pageInfo.endCursor;
  }

  const productos: ResultadoProducto[] = [];
  for (const { id, titulo } of faltantes) {
    try {
      productos.push(await importarProductoShopify(empresaId, id));
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      console.error(`[shopify-productos-nuevos] No se pudo importar "${titulo}" (${id}):`, motivo);
      productos.push({ shopifyProductId: id, titulo, estado: "error", motivo });
    }
  }

  return { revisados, importados: productos.filter((p) => p.estado === "importado").length, productos };
}

// Usado por el poller cada minuto.
export async function importarProductosNuevosDeShopify(empresaId: string): Promise<number> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId }, select: { accessToken: true } });
  if (!config?.accessToken) return 0;
  return (await importarProductosFaltantesDeShopify(empresaId)).importados;
}

/**
 * Importa un producto de Shopify (con todas sus variantes y su stock).
 */
export async function importarProductoShopify(empresaId: string, shopifyProductId: string): Promise<ResultadoProducto> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) throw new Error("Shopify no está conectado");

  const yaExiste = await prisma.producto.findFirst({
    where: { empresaId, shopifyProductId },
    select: { nombre: true },
  });
  if (yaExiste) return { shopifyProductId, titulo: yaExiste.nombre, estado: "ya_existe" };

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
  if (!producto) return { shopifyProductId, titulo: shopifyProductId, estado: "omitido", motivo: "No se encontró en Shopify" };
  const variantes: any[] = producto.variants?.nodes ?? [];
  if (variantes.length === 0) {
    return { shopifyProductId, titulo: producto.title, estado: "omitido", motivo: "El producto no tiene variantes" };
  }

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

  // Shopify permite SKUs repetidos; en CENTRALA el SKU es único por empresa.
  const vistos = new Set<string>();
  for (const f of filas) {
    if (vistos.has(f.sku)) f.sku = `${f.sku}-${f.shopifyVariantId}`;
    vistos.add(f.sku);
  }

  // Un SKU ya usado en CENTRALA indica que el producto ya existe aquí (o que CENTRALA lo está
  // creando en Shopify en este momento): no se duplica.
  const skuRepetido = await prisma.producto.findFirst({
    where: { empresaId, sku: { in: filas.map((f) => f.sku) } },
    select: { sku: true, nombre: true, varianteTitulo: true },
  });
  if (skuRepetido) {
    const motivo = `El SKU ${skuRepetido.sku} ya lo usa "${skuRepetido.nombre}${
      skuRepetido.varianteTitulo ? ` (${skuRepetido.varianteTitulo})` : ""
    }" en CENTRALA`;
    if (!omitidos.has(`${empresaId}:${shopifyProductId}`)) {
      console.warn(`[shopify-productos-nuevos] "${producto.title}" (${shopifyProductId}) no se importó: ${motivo}`);
    }
    omitidos.add(`${empresaId}:${shopifyProductId}`);
    return { shopifyProductId, titulo: producto.title, estado: "omitido", motivo };
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
  omitidos.delete(`${empresaId}:${shopifyProductId}`);
  return { shopifyProductId, titulo: producto.title, estado: "importado", variantes: filas.length };
}
