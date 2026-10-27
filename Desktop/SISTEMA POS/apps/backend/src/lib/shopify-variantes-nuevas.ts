import { prisma } from "./prisma.js";
import { asegurarUbicacionEcommerce } from "./shopify.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";
import { skuDisponible, skuParaVariante } from "./variante-edicion.js";

// Trae a CENTRALA las variantes creadas directamente en Shopify en productos que ya están en
// CENTRALA (los productos completamente nuevos los trae shopify-productos-nuevos.ts).
// Si la variante viene sin SKU, se le arma uno como en CENTRALA (ej. BLU-M-AZU).

const PAGINAS_POLLER = 3;
const PAGINAS_TODOS = 100;
// Una variante que CENTRALA acaba de crear en Shopify se guarda localmente unos segundos
// después: se espera este tiempo antes de importarla para no duplicarla.
const ESPERA_VARIANTE_RECIENTE_MS = 90_000;
// Margen al revisar "productos modificados desde la última revisión".
const SOLAPE_MS = 5 * 60_000;

const ultimaRevision = new Map<string, number>();

function idNumerico(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

function valoresDeTitulo(titulo: string | null | undefined): string[] {
  return titulo ? titulo.split("/").map((v) => v.trim()).filter(Boolean) : [];
}

export interface ResultadoVariantesNuevas {
  importadas: number;
  detalle: { producto: string; variante: string; sku: string }[];
}

/**
 * Busca productos de Shopify modificados recientemente (o todos, con `todos`) que ya existen en
 * CENTRALA y crea las variantes que falten.
 */
export async function importarVariantesNuevasDeShopify(
  empresaId: string,
  opciones: { todos?: boolean } = {}
): Promise<ResultadoVariantesNuevas> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config?.accessToken) return { importadas: 0, detalle: [] };

  const inicio = Date.now();
  // Primera revisión tras un reinicio: las últimas 24 horas.
  const desde = ultimaRevision.get(empresaId) ?? inicio - 24 * 60 * 60_000;
  const filtro = opciones.todos ? null : `updated_at:>'${new Date(desde - SOLAPE_MS).toISOString()}'`;

  const locationId = await asegurarUbicacionEcommerce(empresaId, config.sucursalEcommerceId);
  const client = new ShopifyGraphQLClient(config.shopDomain, config.accessToken);
  const resultado: ResultadoVariantesNuevas = { importadas: 0, detalle: [] };
  let after: string | null = null;

  for (let pagina = 0; pagina < (opciones.todos ? PAGINAS_TODOS : PAGINAS_POLLER); pagina++) {
    const data: any = await client.query({
      query: `
        query ProductosModificados($after: String, $filtro: String, $locationId: ID!, $conUbicacion: Boolean!) {
          products(first: 50, after: $after, sortKey: UPDATED_AT, reverse: true, query: $filtro) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              title
              variants(first: 100) {
                nodes {
                  id
                  title
                  sku
                  barcode
                  price
                  createdAt
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
        }
      `,
      variables: {
        after,
        filtro,
        locationId: locationId ? `gid://shopify/Location/${idNumerico(locationId)}` : "gid://shopify/Location/0",
        conUbicacion: !!locationId,
      },
    });
    const productos: any[] = data?.products?.nodes ?? [];
    if (productos.length === 0) break;

    for (const p of productos) {
      try {
        await importarVariantesDeProducto(client, empresaId, config.sucursalEcommerceId, idNumerico(p.id), p.variants?.nodes ?? [], resultado);
      } catch (err) {
        console.error(
          `[shopify-variantes-nuevas] "${p.title}": no se pudieron importar sus variantes nuevas:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  if (!opciones.todos) ultimaRevision.set(empresaId, inicio);
  return resultado;
}

async function importarVariantesDeProducto(
  client: ShopifyGraphQLClient,
  empresaId: string,
  sucursalEcommerceId: string,
  shopifyProductId: string,
  variantes: any[],
  resultado: ResultadoVariantesNuevas
) {
  // Solo productos que ya están en CENTRALA (activos o archivados).
  const locales = await prisma.producto.findMany({
    where: { empresaId, shopifyProductId },
    orderBy: [{ activo: "desc" }, { creadoEn: "asc" }],
  });
  if (locales.length === 0) return;

  const conocidas = new Set(locales.map((l) => l.shopifyVariantId).filter(Boolean));
  const nuevas = variantes.filter(
    (v) =>
      !conocidas.has(idNumerico(v.id)) &&
      Date.now() - new Date(v.createdAt).getTime() > ESPERA_VARIANTE_RECIENTE_MS
  );
  if (nuevas.length === 0) return;

  const modelo = locales[0];
  const [sucursales, admin, disponibilidad] = await Promise.all([
    prisma.sucursal.findMany({ where: { empresaId, activo: true }, select: { id: true } }),
    prisma.usuario.findFirst({ where: { empresaId, rol: "ADMIN", activo: true }, orderBy: { creadoEn: "asc" } }),
    prisma.productoSucursal.findMany({ where: { productoId: modelo.id }, select: { sucursalId: true } }),
  ]);

  for (const v of nuevas) {
    const variantId = idNumerico(v.id);
    const inventoryItemId = v.inventoryItem?.id ? idNumerico(v.inventoryItem.id) : null;
    const varianteTitulo = v.title && v.title !== "Default Title" ? (v.title as string) : null;
    const skuShopify = (v.sku as string | null)?.trim() || "";

    // Un producto de CENTRALA con ese SKU y sin vínculo a Shopify es el mismo artículo: se vincula.
    if (skuShopify) {
      const mismo = await prisma.producto.findFirst({
        where: { empresaId, sku: skuShopify, shopifyVariantId: null },
      });
      if (mismo) {
        await prisma.producto.update({
          where: { id: mismo.id },
          data: { shopifyProductId, shopifyVariantId: variantId, shopifyInventoryItemId: inventoryItemId },
        });
        continue;
      }
    }

    // SKU: el de Shopify; si viene vacío se arma como en CENTRALA. Nunca repetido.
    const valores = valoresDeTitulo(varianteTitulo);
    const skuBase =
      skuShopify || skuParaVariante(modelo.sku, valoresDeTitulo(modelo.varianteTitulo), valores.length ? valores : [variantId]);
    const sku = await skuDisponible(empresaId, skuBase, "");

    // Código de barras: el de Shopify, salvo que ya lo use otro producto de CENTRALA.
    let codigoBarras: string | null = (v.barcode as string | null)?.trim() || null;
    if (codigoBarras && (await prisma.producto.findFirst({ where: { empresaId, codigoBarras }, select: { id: true } }))) {
      codigoBarras = null;
    }

    const disponible = v.inventoryItem?.inventoryLevel?.quantities?.find(
      (q: { name: string; quantity: number }) => q.name === "available"
    )?.quantity;
    const stock = Math.max(0, typeof disponible === "number" ? disponible : 0);

    await prisma.$transaction(async (tx) => {
      const creada = await tx.producto.create({
        data: {
          empresaId,
          nombre: modelo.nombre,
          descripcion: modelo.descripcion,
          categoria: modelo.categoria,
          marca: modelo.marca,
          proveedorId: modelo.proveedorId,
          impuestoPorcentaje: modelo.impuestoPorcentaje,
          activo: modelo.activo,
          sku,
          codigoBarras,
          precio: Number(v.price ?? modelo.precio),
          costo: modelo.costo,
          imagenUrl: (v.image?.url as string | undefined) ?? modelo.imagenUrl,
          varianteTitulo,
          grupoOpciones: modelo.grupoOpciones,
          grupoVariantes: modelo.grupoVariantes ?? shopifyProductId,
          shopifyProductId,
          shopifyVariantId: variantId,
          shopifyInventoryItemId: inventoryItemId,
        },
      });
      if (sucursales.length > 0) {
        await tx.inventarioSucursal.createMany({
          data: sucursales.map((s) => ({
            productoId: creada.id,
            sucursalId: s.id,
            cantidad: s.id === sucursalEcommerceId ? stock : 0,
          })),
        });
      }
      if (disponibilidad.length > 0) {
        await tx.productoSucursal.createMany({
          data: disponibilidad.map((d) => ({ productoId: creada.id, sucursalId: d.sucursalId })),
        });
      }
      if (stock > 0 && admin && sucursales.some((s) => s.id === sucursalEcommerceId)) {
        await tx.movimientoInventario.create({
          data: {
            productoId: creada.id,
            sucursalId: sucursalEcommerceId,
            tipo: "ENTRADA",
            cantidad: stock,
            motivo: "Stock inicial (variante creada en Shopify)",
            usuarioId: admin.id,
          },
        });
      }
    });

    // Si el SKU lo generó CENTRALA, se escribe también en Shopify para que ambos coincidan.
    if (sku !== skuShopify) {
      await client
        .query({
          query: `mutation SkuVariante($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
          }`,
          variables: {
            productId: `gid://shopify/Product/${shopifyProductId}`,
            variants: [{ id: v.id, inventoryItem: { sku } }],
          },
        })
        .catch((err) => console.warn(`[shopify-variantes-nuevas] No se pudo escribir el SKU ${sku} en Shopify:`, err instanceof Error ? err.message : err));
    }

    console.log(`[shopify-variantes-nuevas] "${modelo.nombre}": variante ${varianteTitulo ?? variantId} importada con SKU ${sku}`);
    resultado.importadas++;
    resultado.detalle.push({ producto: modelo.nombre, variante: varianteTitulo ?? "", sku });
  }
}
