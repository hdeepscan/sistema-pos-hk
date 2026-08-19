import { prisma } from "./prisma.js";

const API_VERSION = "2024-10";

export function normalizarDominio(input: string): string {
  let d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d.includes(".")) {
    d = `${d}.myshopify.com`;
  }
  return d;
}

// El endpoint de token (client_credentials) SOLO existe en el dominio interno
// *.myshopify.com. Si se usa el dominio publico personalizado (ej. valcris.co),
// Shopify redirige a admin.shopify.com, que esta detras de Cloudflare y
// responde con una pagina de desafio en HTML en vez de un token. No se puede
// deducir el dominio .myshopify.com a partir del personalizado, asi que se
// rechaza de entrada con una explicacion en vez de fallar despues.
export function validarDominioShopify(dominio: string): string | null {
  if (dominio.endsWith(".myshopify.com")) return null;
  return (
    `"${dominio}" es tu dominio publico, y con ese Shopify no entrega el token. ` +
    `Usa el dominio interno que termina en .myshopify.com (ejemplo: mi-tienda.myshopify.com). ` +
    `Lo encuentras en el admin de Shopify, en Configuracion > Dominios, marcado como "dominio de Shopify".`
  );
}

// Las respuestas de error de Shopify a veces son paginas HTML enteras (por
// ejemplo el desafio de Cloudflare). Volcarlas tal cual en pantalla no le
// dice nada al usuario, asi que se traducen a un mensaje corto.
function resumirErrorShopify(status: number, cuerpo: string): string {
  const esHtml = /^\s*<(!doctype|html)/i.test(cuerpo);

  if (esHtml) {
    if (/cf_chl|cloudflare|verifying your connection/i.test(cuerpo)) {
      return (
        `Shopify no entrego el token (${status}): la peticion termino en una pagina de verificacion de Cloudflare. ` +
        `Casi siempre es porque el dominio configurado no es el de tipo .myshopify.com. ` +
        `Revisalo en la configuracion de Shopify del sistema.`
      );
    }
    return `Shopify respondio con una pagina web en vez de un token (${status}). Revisa que el dominio de la tienda sea correcto.`;
  }

  try {
    const json = JSON.parse(cuerpo);
    const detalle = json.error_description || json.error || json.errors;
    if (detalle) return `Shopify rechazo la conexion (${status}): ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  } catch {
    // no era JSON; se usa el texto crudo recortado
  }

  const corto = cuerpo.replace(/\s+/g, " ").trim().slice(0, 200);
  return `No se pudo obtener el token de Shopify (${status})${corto ? `: ${corto}` : ""}`;
}

// Obtiene un access token vigente para la empresa, renovandolo automaticamente
// via el flujo client_credentials si el guardado ya expiro o esta por expirar.
// Ver: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
export async function obtenerAccessToken(empresaId: string): Promise<{ token: string; shopDomain: string }> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config) throw new Error("Shopify no esta configurado para esta empresa");

  const margenSeguridadMs = 5 * 60 * 1000;
  if (config.accessToken && config.tokenExpiraEn && config.tokenExpiraEn.getTime() - margenSeguridadMs > Date.now()) {
    return { token: config.accessToken, shopDomain: config.shopDomain };
  }

  const res = await fetch(`https://${config.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(resumirErrorShopify(res.status, texto));
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const tokenExpiraEn = new Date(Date.now() + data.expires_in * 1000);

  await prisma.shopifyConfig.update({
    where: { empresaId },
    data: { accessToken: data.access_token, tokenExpiraEn },
  });

  return { token: data.access_token, shopDomain: config.shopDomain };
}

interface ShopifyVariant {
  id: number;
  sku: string | null;
  price: string;
  barcode: string | null;
  inventory_quantity: number | null;
  inventory_item_id: number;
  title: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  product_type: string | null;
  variants: ShopifyVariant[];
  image?: { src: string } | null;
}

export async function obtenerProductosShopify(empresaId: string): Promise<ShopifyProduct[]> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const productos: ShopifyProduct[] = [];
  let url: string | null =
    `https://${shopDomain}/admin/api/${API_VERSION}/products.json?limit=250&status=any`;

  while (url) {
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
    if (!res.ok) {
      const texto = await res.text();
      throw new Error(`Error consultando productos de Shopify (${res.status}): ${texto}`);
    }
    const data = (await res.json()) as { products: ShopifyProduct[] };
    productos.push(...data.products);

    const link = res.headers.get("link");
    const siguiente = link?.split(",").find((p) => p.includes('rel="next"'));
    const match = siguiente?.match(/<([^>]+)>/);
    url = match ? match[1] : null;
  }

  return productos;
}

export interface ResultadoSync {
  productosCreados: number;
  productosActualizados: number;
  variantesOmitidas: number;
}

interface ShopifyLocation {
  id: number;
  name: string;
}

export async function obtenerUbicaciones(empresaId: string): Promise<ShopifyLocation[]> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/locations.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok) throw new Error(`No se pudieron obtener las ubicaciones de Shopify (${res.status})`);
  const data = (await res.json()) as { locations: ShopifyLocation[] };
  return data.locations;
}

// La primera vez que se sincroniza, vincula la sucursal ecommerce a la
// primera ubicacion (location) de Shopify, para poder ajustar inventario ahi.
async function asegurarUbicacionEcommerceInterno(empresaId: string, sucursalEcommerceId: string) {
  const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalEcommerceId } });
  if (sucursal?.shopifyLocationId) return;

  const ubicaciones = await obtenerUbicaciones(empresaId);
  if (ubicaciones.length === 0) return;

  await prisma.sucursal.update({
    where: { id: sucursalEcommerceId },
    data: { shopifyLocationId: String(ubicaciones[0].id) },
  });
}

// Trae el catalogo de Shopify y lo refleja en Producto (por SKU) + el stock
// de la sucursal ecommerce configurada. Cada variante se trata como un
// producto independiente (granularidad SKU, igual que el resto del sistema).
export async function sincronizarProductos(empresaId: string): Promise<ResultadoSync> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config) throw new Error("Shopify no esta configurado para esta empresa");

  await asegurarUbicacionEcommerce(empresaId, config.sucursalEcommerceId);

  const productosShopify = await obtenerProductosShopify(empresaId);

  let productosCreados = 0;
  let productosActualizados = 0;
  let variantesOmitidas = 0;

  for (const producto of productosShopify) {
    for (const variante of producto.variants) {
      const sku = variante.sku || `SHOP${producto.id}V${variante.id}`;
      const nombre =
        variante.title && variante.title !== "Default Title"
          ? `${producto.title} - ${variante.title}`
          : producto.title;

      const existente = await prisma.producto.findUnique({
        where: { empresaId_sku: { empresaId, sku } },
      });

      // Shopify es la fuente de verdad: si el producto no existe, se crea con
      // datos de Shopify. Si ya existe, se actualiza TODO EXCEPTO el nombre
      // (que viene del Sistema POS, para mantener consistencia).
      const datosCreacion = {
        nombre,
        categoria: producto.product_type || undefined,
        precio: Number(variante.price),
        codigoBarras: variante.barcode || undefined,
        shopifyProductId: String(producto.id),
        shopifyVariantId: String(variante.id),
        shopifyInventoryItemId: String(variante.inventory_item_id),
        imagenUrl: producto.image?.src || undefined,
      };

      const datosActualizacion = {
        // NO actualizamos el nombre: viene del Sistema POS
        categoria: producto.product_type || undefined,
        precio: Number(variante.price),
        codigoBarras: variante.barcode || undefined,
        shopifyProductId: String(producto.id),
        shopifyVariantId: String(variante.id),
        shopifyInventoryItemId: String(variante.inventory_item_id),
        imagenUrl: producto.image?.src || existente?.imagenUrl || undefined,
      };

      const productoDb = existente
        ? await prisma.producto.update({ where: { id: existente.id }, data: datosActualizacion })
        : await prisma.producto.create({ data: { empresaId, sku, costo: 0, ...datosCreacion } });

      if (existente) productosActualizados += 1;
      else productosCreados += 1;

      await prisma.inventarioSucursal.upsert({
        where: { productoId_sucursalId: { productoId: productoDb.id, sucursalId: config.sucursalEcommerceId } },
        update: { cantidad: variante.inventory_quantity ?? 0 },
        create: {
          productoId: productoDb.id,
          sucursalId: config.sucursalEcommerceId,
          cantidad: variante.inventory_quantity ?? 0,
        },
      });
    }
  }

  await prisma.shopifyConfig.update({ where: { empresaId }, data: { ultimaSincronizacion: new Date() } });

  return { productosCreados, productosActualizados, variantesOmitidas };
}

// ---------- Escritura hacia Shopify (POS -> Shopify) ----------

interface ProductoLocal {
  id: string;
  empresaId: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  precio: unknown;
  codigoBarras: string | null;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  shopifyInventoryItemId: string | null;
}

// Crea el producto en Shopify (con una sola variante = el SKU local) y
// devuelve los ids de Shopify para guardarlos en el producto local.
export async function crearProductoEnShopify(
  producto: ProductoLocal,
  publicar = true
): Promise<{ shopifyProductId: string; shopifyVariantId: string; shopifyInventoryItemId: string }> {
  const { token, shopDomain } = await obtenerAccessToken(producto.empresaId);

  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      product: {
        title: producto.nombre,
        product_type: producto.categoria || undefined,
        status: publicar ? "active" : "draft",
        variants: [
          {
            sku: producto.sku,
            price: String(producto.precio),
            barcode: producto.codigoBarras || undefined,
            inventory_management: "shopify",
          },
        ],
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo crear el producto en Shopify (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { product: ShopifyProduct };
  const variante = data.product.variants[0];
  return {
    shopifyProductId: String(data.product.id),
    shopifyVariantId: String(variante.id),
    shopifyInventoryItemId: String(variante.inventory_item_id),
  };
}

// Crea UN producto en Shopify con TODAS sus variantes en una sola llamada, con
// las opciones (Color, Talla, ...) nombradas. Devuelve el id del producto y el
// mapeo de cada SKU a sus ids de variante/inventario.
export async function crearProductoConVariantesEnShopify(
  empresaId: string,
  base: { nombre: string; categoria?: string | null },
  nombresOpciones: string[],
  variantes: { titulo: string; sku: string; precio: number; codigoBarras?: string | null }[],
  publicar = true
): Promise<{ shopifyProductId: string; variantes: { sku: string; shopifyVariantId: string; shopifyInventoryItemId: string }[] }> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);

  const variantsBody = variantes.map((v) => {
    const partes = v.titulo.split("/").map((p) => p.trim()).filter(Boolean);
    const opciones: Record<string, string> = {};
    partes.slice(0, 3).forEach((valor, i) => {
      opciones[`option${i + 1}`] = valor;
    });
    return {
      ...opciones,
      sku: v.sku,
      price: String(v.precio),
      barcode: v.codigoBarras || undefined,
      inventory_management: "shopify",
    };
  });

  const options =
    nombresOpciones.length > 0 ? nombresOpciones.slice(0, 3).map((name) => ({ name })) : undefined;

  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      product: {
        title: base.nombre,
        product_type: base.categoria || undefined,
        status: publicar ? "active" : "draft",
        options,
        variants: variantsBody,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo crear el producto con variantes en Shopify (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { product: ShopifyProduct };
  return {
    shopifyProductId: String(data.product.id),
    variantes: data.product.variants.map((v) => ({
      sku: v.sku ?? "",
      shopifyVariantId: String(v.id),
      shopifyInventoryItemId: String(v.inventory_item_id),
    })),
  };
}

// Actualiza tipo del producto y precio/sku/codigo de barras de la variante
// en Shopify. NO actualiza el nombre (title) porque Shopify es la fuente de
// verdad: el nombre debe venir desde Shopify, no ir hacia allá.
// Requiere que el producto ya tenga ids de Shopify.
export async function actualizarProductoEnShopify(producto: ProductoLocal): Promise<void> {
  if (!producto.shopifyProductId || !producto.shopifyVariantId) return;
  const { token, shopDomain } = await obtenerAccessToken(producto.empresaId);

  // Actualiza el producto en Shopify con los valores del Sistema POS
  // Incluye el nombre (title) para que los cambios locales se reflejen en Shopify
  await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${producto.shopifyProductId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      product: {
        id: Number(producto.shopifyProductId),
        title: producto.nombre,
        product_type: producto.categoria || undefined,
      },
    }),
  });

  await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/variants/${producto.shopifyVariantId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      variant: {
        id: Number(producto.shopifyVariantId),
        title: producto.nombre,
        sku: producto.sku,
        price: String(producto.precio),
        barcode: producto.codigoBarras || undefined,
      },
    }),
  });
}

// Sube una imagen (base64, sin el prefijo data:...;base64,) y la asocia al
// producto en Shopify. Devuelve la URL publica (CDN) resultante.
export async function subirImagenAShopify(
  empresaId: string,
  shopifyProductId: string,
  base64: string,
  variantIds?: string[]
): Promise<string> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const image: Record<string, unknown> = { attachment: base64 };
  // Si se pasan variantes, la imagen queda asociada a esas variantes puntuales.
  if (variantIds && variantIds.length > 0) image.variant_ids = variantIds.map((v) => Number(v));
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}/images.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo subir la imagen a Shopify (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { image: { src: string } };
  return data.image.src;
}

// Ajusta el inventario disponible en Shopify para un producto/ubicacion.
// delta positivo = entra stock, negativo = sale stock (ej. una venta).
export async function ajustarInventarioEnShopify(
  empresaId: string,
  inventoryItemId: string,
  locationId: string,
  delta: number
): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/inventory_levels/adjust.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      location_id: Number(locationId),
      inventory_item_id: Number(inventoryItemId),
      available_adjustment: delta,
    }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo ajustar el inventario en Shopify (${res.status}): ${await res.text()}`);
  }
}

// Fija el inventario disponible (cantidad absoluta) de un item en una ubicacion.
// Si el item no esta conectado a la ubicacion, lo conecta y reintenta.
export async function fijarInventarioEnShopify(
  empresaId: string,
  inventoryItemId: string,
  locationId: string,
  cantidad: number
): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const set = () =>
    fetch(`https://${shopDomain}/admin/api/${API_VERSION}/inventory_levels/set.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({
        location_id: Number(locationId),
        inventory_item_id: Number(inventoryItemId),
        available: cantidad,
      }),
    });

  let res = await set();
  if (!res.ok) {
    // Conectar el item a la ubicacion y reintentar (error tipico si el item
    // aun no esta "stocked" en esa location).
    await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/inventory_levels/connect.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ location_id: Number(locationId), inventory_item_id: Number(inventoryItemId) }),
    });
    res = await set();
  }
  if (!res.ok) {
    throw new Error(`No se pudo fijar el inventario en Shopify (${res.status}): ${await res.text()}`);
  }
}

// Vincula la sucursal ecommerce a una ubicacion de Shopify si aun no lo esta, y
// devuelve el locationId. Se usa para poder empujar inventario.
export async function asegurarUbicacionEcommerce(empresaId: string, sucursalEcommerceId: string): Promise<string | null> {
  await asegurarUbicacionEcommerceInterno(empresaId, sucursalEcommerceId);
  const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalEcommerceId } });
  return sucursal?.shopifyLocationId ?? null;
}

// Devuelve las opciones de un producto de Shopify (ej. [{name:"Color",
// values:["Rojo","Azul"]}, {name:"Talla", values:["S","M"]}]).
export async function obtenerOpcionesShopifyProducto(
  empresaId: string,
  shopifyProductId: string
): Promise<{ name: string; values: string[] }[]> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok) throw new Error(`No se pudieron leer las opciones del producto (${res.status})`);
  const data = (await res.json()) as { product: { options: { name: string; values: string[] }[] } };
  return (data.product.options ?? []).map((o) => ({ name: o.name, values: o.values ?? [] }));
}

// Elimina una sola variante de un producto en Shopify. 404 = exito.
export async function eliminarVarianteEnShopify(
  empresaId: string,
  shopifyProductId: string,
  shopifyVariantId: string
): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}/variants/${shopifyVariantId}.json`,
    { method: "DELETE", headers: { "X-Shopify-Access-Token": token } }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`No se pudo eliminar la variante en Shopify (${res.status}): ${await res.text()}`);
  }
}

// Sube una imagen a Shopify y devuelve su id y URL (para la galeria).
export async function subirImagenGaleria(
  empresaId: string,
  shopifyProductId: string,
  base64: string
): Promise<{ shopifyImageId: string; url: string }> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}/images.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ image: { attachment: base64 } }),
  });
  if (!res.ok) throw new Error(`No se pudo subir la imagen a Shopify (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { image: { id: number; src: string } };
  return { shopifyImageId: String(data.image.id), url: data.image.src };
}

export async function eliminarImagenEnShopify(
  empresaId: string,
  shopifyProductId: string,
  shopifyImageId: string
): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}/images/${shopifyImageId}.json`,
    { method: "DELETE", headers: { "X-Shopify-Access-Token": token } }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`No se pudo eliminar la imagen en Shopify (${res.status}): ${await res.text()}`);
  }
}

// Elimina un producto de Shopify (con todas sus variantes). Un 404 se considera
// exito (ya no existe alla).
export async function eliminarProductoEnShopify(empresaId: string, shopifyProductId: string): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}.json`, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`No se pudo eliminar el producto en Shopify (${res.status}): ${await res.text()}`);
  }
}

// ---------- Wrappers "best-effort" para usar desde las rutas ----------
// Si Shopify no esta configurado o la llamada falla (token invalido, app sin
// permisos, tienda caida, etc.) no se lanza excepcion: la operacion local del
// POS no debe depender de la disponibilidad de Shopify. El error solo se
// registra en el log.

export async function empujarProductoAShopify(producto: ProductoLocal): Promise<ProductoLocal> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId: producto.empresaId } });
  if (!config) return producto;

  try {
    if (!producto.shopifyProductId) {
      const ids = await crearProductoEnShopify(producto);
      return { ...producto, ...ids };
    }
    await actualizarProductoEnShopify(producto);
    return producto;
  } catch (err) {
    console.error("[shopify] No se pudo sincronizar el producto:", err);
    return producto;
  }
}

export async function ajustarInventarioEnShopifySiCorresponde(
  empresaId: string,
  sucursalId: string,
  producto: { shopifyInventoryItemId: string | null },
  delta: number
): Promise<void> {
  if (!producto.shopifyInventoryItemId || delta === 0) return;
  try {
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config || config.sucursalEcommerceId !== sucursalId) return;

    const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!sucursal?.shopifyLocationId) return;

    await ajustarInventarioEnShopify(empresaId, producto.shopifyInventoryItemId, sucursal.shopifyLocationId, delta);
  } catch (err) {
    console.error("[shopify] No se pudo ajustar el inventario:", err);
  }
}

// ---------- Colecciones ----------

interface ShopifyCollection {
  id: number;
  title: string;
  body_html: string | null;
  image?: { src: string } | null;
}

async function obtenerColeccionesShopify(empresaId: string): Promise<ShopifyCollection[]> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const colecciones: ShopifyCollection[] = [];

  for (const tipo of ["custom_collections", "smart_collections"]) {
    let url: string | null = `https://${shopDomain}/admin/api/${API_VERSION}/${tipo}.json?limit=250`;
    while (url) {
      const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
      if (!res.ok) throw new Error(`Error consultando ${tipo} de Shopify (${res.status})`);
      const data = (await res.json()) as Record<string, ShopifyCollection[]>;
      colecciones.push(...data[tipo]);
      const link = res.headers.get("link");
      const siguiente = link?.split(",").find((p) => p.includes('rel="next"'));
      const match = siguiente?.match(/<([^>]+)>/);
      url = match ? match[1] : null;
    }
  }
  return colecciones;
}

async function obtenerProductIdsDeColeccion(empresaId: string, shopifyCollectionId: string): Promise<string[]> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const ids: string[] = [];
  let url: string | null =
    `https://${shopDomain}/admin/api/${API_VERSION}/products.json?collection_id=${shopifyCollectionId}&limit=250&fields=id`;
  while (url) {
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
    if (!res.ok) throw new Error(`Error consultando productos de la coleccion (${res.status})`);
    const data = (await res.json()) as { products: { id: number }[] };
    ids.push(...data.products.map((p) => String(p.id)));
    const link = res.headers.get("link");
    const siguiente = link?.split(",").find((p) => p.includes('rel="next"'));
    const match = siguiente?.match(/<([^>]+)>/);
    url = match ? match[1] : null;
  }
  return ids;
}

export interface ResultadoSyncColecciones {
  coleccionesCreadas: number;
  coleccionesActualizadas: number;
}

export async function sincronizarColecciones(empresaId: string): Promise<ResultadoSyncColecciones> {
  const coleccionesShopify = await obtenerColeccionesShopify(empresaId);
  let coleccionesCreadas = 0;
  let coleccionesActualizadas = 0;

  for (const c of coleccionesShopify) {
    const existente = await prisma.coleccion.findFirst({
      where: { empresaId, shopifyCollectionId: String(c.id) },
    });

    const datos = {
      titulo: c.title,
      descripcion: c.body_html ? c.body_html.replace(/<[^>]+>/g, "").slice(0, 500) : null,
      imagenUrl: c.image?.src || undefined,
      shopifyCollectionId: String(c.id),
    };

    const coleccion = existente
      ? await prisma.coleccion.update({ where: { id: existente.id }, data: datos })
      : await prisma.coleccion.create({ data: { empresaId, ...datos } });

    if (existente) coleccionesActualizadas += 1;
    else coleccionesCreadas += 1;

    const productIdsShopify = await obtenerProductIdsDeColeccion(empresaId, String(c.id));
    const productosLocales = await prisma.producto.findMany({
      where: { empresaId, shopifyProductId: { in: productIdsShopify } },
      select: { id: true },
    });

    await prisma.productoColeccion.deleteMany({ where: { coleccionId: coleccion.id } });
    if (productosLocales.length > 0) {
      await prisma.productoColeccion.createMany({
        data: productosLocales.map((p) => ({ productoId: p.id, coleccionId: coleccion.id })),
        skipDuplicates: true,
      });
    }
  }

  return { coleccionesCreadas, coleccionesActualizadas };
}

export async function crearColeccionEnShopify(
  empresaId: string,
  titulo: string,
  descripcion?: string
): Promise<string> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/custom_collections.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ custom_collection: { title: titulo, body_html: descripcion || "" } }),
  });
  if (!res.ok) throw new Error(`No se pudo crear la coleccion en Shopify (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { custom_collection: { id: number } };
  return String(data.custom_collection.id);
}

export async function agregarProductoAColeccionShopify(
  empresaId: string,
  shopifyCollectionId: string,
  shopifyProductId: string
): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/collects.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      collect: { collection_id: Number(shopifyCollectionId), product_id: Number(shopifyProductId) },
    }),
  });
  if (!res.ok) throw new Error(`No se pudo agregar el producto a la coleccion (${res.status}): ${await res.text()}`);
}

export async function quitarProductoDeColeccionShopify(
  empresaId: string,
  shopifyCollectionId: string,
  shopifyProductId: string
): Promise<void> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);
  const busqueda = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/collects.json?collection_id=${shopifyCollectionId}&product_id=${shopifyProductId}`,
    { headers: { "X-Shopify-Access-Token": token } }
  );
  if (!busqueda.ok) return;
  const data = (await busqueda.json()) as { collects: { id: number }[] };
  const collect = data.collects[0];
  if (!collect) return;

  await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/collects/${collect.id}.json`, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": token },
  });
}

// ---------- Variantes ----------

// El producto puede tener 1-3 opciones (ej. Talla, Color). El valor se
// escribe separado por "/" en el mismo orden que las opciones del producto
// en Shopify (ej. "L / Rojo"); si el producto solo tiene una opcion, basta
// con un valor simple (ej. "Rojo").
export async function crearVarianteEnShopify(
  empresaId: string,
  shopifyProductId: string,
  args: { opcionValor: string; sku: string; precio: number; codigoBarras?: string }
): Promise<{ shopifyVariantId: string; shopifyInventoryItemId: string }> {
  const { token, shopDomain } = await obtenerAccessToken(empresaId);

  const partes = args.opcionValor.split("/").map((p) => p.trim()).filter(Boolean);
  const opciones: Record<string, string> = {};
  partes.slice(0, 3).forEach((valor, i) => {
    opciones[`option${i + 1}`] = valor;
  });

  // Shopify (API 2024+) exige que el valor de opcion ya exista en la lista de
  // opciones del producto antes de crear la variante; si no, responde 422
  // "You need to add option values for Color". Por eso primero leemos las
  // opciones del producto y agregamos los valores nuevos que falten.
  try {
    const prodRes = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    if (prodRes.ok) {
      const prod = ((await prodRes.json()) as any).product as {
        id: number;
        options: { id: number; name: string; position: number; values: string[] }[];
      };
      let hayNuevos = false;
      const opcionesActualizadas = prod.options.map((opt, i) => {
        const valor = partes[i];
        if (valor && !opt.values.includes(valor)) {
          hayNuevos = true;
          return { id: opt.id, name: opt.name, values: [...opt.values, valor] };
        }
        return { id: opt.id, name: opt.name, values: opt.values };
      });
      if (hayNuevos) {
        await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({ product: { id: Number(shopifyProductId), options: opcionesActualizadas } }),
        });
      }
    }
  } catch {
    // Si falla la lectura/actualizacion de opciones, se intenta crear igual; el
    // error real se reportara abajo.
  }

  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/products/${shopifyProductId}/variants.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      variant: {
        ...opciones,
        sku: args.sku,
        price: String(args.precio),
        barcode: args.codigoBarras || undefined,
      },
    }),
  });
  if (!res.ok) throw new Error(`No se pudo crear la variante en Shopify (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { variant: ShopifyVariant };
  return {
    shopifyVariantId: String(data.variant.id),
    shopifyInventoryItemId: String(data.variant.inventory_item_id),
  };
}

// ---------- Alertas de pedidos nuevos ----------
// Como el backend no tiene todavia una URL publica para recibir webhooks de
// Shopify, se revisan pedidos nuevos por sondeo (polling) periodico en vez de
// tiempo real instantaneo. Una vez el backend este desplegado en internet,
// esto se puede reemplazar por un webhook orders/create.

export interface OrdenShopify {
  id: number;
  name: string;
  total_price: string;
  created_at: string;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  line_items: { name: string; quantity: number; sku?: string | null; price?: string }[];
}

export async function revisarPedidosNuevos(empresaId: string): Promise<OrdenShopify[]> {
  const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
  if (!config) return [];

  const desde = config.ultimaAlertaOrdenes ?? new Date(Date.now() - 10 * 60 * 1000);
  const { token, shopDomain } = await obtenerAccessToken(empresaId);

  const res = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/orders.json?status=any&created_at_min=${desde.toISOString()}&limit=50`,
    { headers: { "X-Shopify-Access-Token": token } }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { orders: OrdenShopify[] };

  await prisma.shopifyConfig.update({ where: { empresaId }, data: { ultimaAlertaOrdenes: new Date() } });

  return data.orders;
}
