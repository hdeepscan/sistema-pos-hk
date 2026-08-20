/**
 * Servicio de importación inicial de Shopify
 * Descarga productos, variantes, imágenes, colecciones e inventario
 */

import { prisma } from "./prisma.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

export interface ImportStats {
  productosEncontrados: number;
  productosImportados: number;
  productosVinculados: number;
  duplicadosDetectados: number;
  variantesImportadas: number;
  errores: number;
  erroresDetalle: Array<{ producto: string; error: string }>;
}

export class ShopifyImportService {
  private client: ShopifyGraphQLClient;
  private empresaId: string;
  private stats: ImportStats = {
    productosEncontrados: 0,
    productosImportados: 0,
    productosVinculados: 0,
    duplicadosDetectados: 0,
    variantesImportadas: 0,
    errores: 0,
    erroresDetalle: [],
  };

  constructor(shopDomain: string, accessToken: string, empresaId: string) {
    this.client = new ShopifyGraphQLClient(shopDomain, accessToken);
    this.empresaId = empresaId;
  }

  async importarProductosInicial(onProgress?: (stats: ImportStats) => void): Promise<ImportStats> {
    try {
      console.log(`[Import] Iniciando importación de productos para empresa ${this.empresaId}`);

      // Paso 1: Obtener locations de Shopify (guardado en versión posterior)
      // console.log("[Import] Obteniendo ubicaciones de Shopify...");
      // const locationsData = await this.client.getLocations();
      // await this.guardarLocations(locationsData);

      // Paso 2: Importar productos con paginación
      let cursor: string | null = null;
      let iteracion = 0;

      do {
        iteracion++;
        console.log(`[Import] Cargando lote ${iteracion} de productos...`);

        const productsData = await this.client.getProductsInitial(cursor);
        const products = productsData.products?.edges || [];
        this.stats.productosEncontrados += products.length;

        for (const { node: product } of products) {
          try {
            await this.importarProducto(product);

            if (onProgress) {
              onProgress(this.stats);
            }
          } catch (error) {
            this.stats.errores++;
            this.stats.erroresDetalle.push({
              producto: product.title,
              error: error instanceof Error ? error.message : String(error),
            });
            console.error(`[Import Error] ${product.title}:`, error);
          }
        }

        // Verificar si hay más páginas
        const hasNextPage = productsData.products?.pageInfo?.hasNextPage;
        cursor = productsData.products?.pageInfo?.endCursor || null;

        if (!hasNextPage) break;
      } while (cursor);

      console.log(`[Import] Importación completada:`, this.stats);
      return this.stats;
    } catch (error) {
      console.error("[Import Fatal Error]", error);
      throw error;
    }
  }

  private async importarProducto(shopifyProduct: any): Promise<void> {
    const shopifyProductId = shopifyProduct.id.replace("gid://shopify/Product/", "");

    // Verificar si ya existe
    const existing = await prisma.producto.findFirst({
      where: {
        empresaId: this.empresaId,
        shopifyProductId: shopifyProductId,
      },
    });

    if (existing) {
      this.stats.productosVinculados++;
      console.log(`[Import] Producto ya existe: ${shopifyProduct.title} (ID: ${shopifyProductId})`);
      return;
    }

    // Verificar duplicados por SKU
    const variants = shopifyProduct.variants?.edges || [];
    const skus = variants.map((v: any) => v.node.sku).filter((s: string) => s);

    const duplicados = await prisma.producto.findMany({
      where: {
        empresaId: this.empresaId,
        sku: { in: skus },
      },
    });

    if (duplicados.length > 0) {
      this.stats.duplicadosDetectados += duplicados.length;
      console.log(`[Import] Detectados ${duplicados.length} posibles duplicados para: ${shopifyProduct.title}`);
      // Aquí se podría ofrecer una opción de vincular en lugar de crear duplicado
      return;
    }

    // Crear producto principal (sin variantes, será agrupado si hay múltiples variantes)
    const [primeraVariante] = variants;
    if (!primeraVariante) {
      console.warn(`[Import] Producto sin variantes: ${shopifyProduct.title}`);
      return;
    }

    const primeraVarianteNode = primeraVariante.node;
    const imagenUrl = shopifyProduct.images?.edges?.[0]?.node?.url || null;

    const producto = await prisma.producto.create({
      data: {
        empresaId: this.empresaId,
        nombre: shopifyProduct.title,
        descripcion: shopifyProduct.description || "",
        sku: primeraVarianteNode.sku || `SKU-${shopifyProductId}`,
        codigoBarras: primeraVarianteNode.barcode || null,
        precio: parseFloat(primeraVarianteNode.price || "0"),
        categoria: shopifyProduct.productType || null,
        marca: shopifyProduct.vendor || null,
        imagenUrl: imagenUrl,
        activo: shopifyProduct.status === "active",
        varianteTitulo: primeraVarianteNode.title || "Default",
        grupoOpciones: JSON.stringify(primeraVarianteNode.selectedOptions || []),
        grupoVariantes: shopifyProductId,
        shopifyProductId: shopifyProductId,
      },
    });

    this.stats.productosImportados++;

    // Crear variantes adicionales si hay más de 1
    if (variants.length > 1) {
      for (let i = 1; i < variants.length; i++) {
        const variantNode = variants[i].node;
        const variantImageUrl = variantNode.image?.url || imagenUrl;

        await prisma.producto.create({
          data: {
            empresaId: this.empresaId,
            nombre: shopifyProduct.title,
            descripcion: shopifyProduct.description || "",
            sku: variantNode.sku || `SKU-${variantNode.id.replace("gid://shopify/ProductVariant/", "")}`,
            codigoBarras: variantNode.barcode || null,
            precio: parseFloat(variantNode.price || "0"),
            categoria: shopifyProduct.productType || null,
            marca: shopifyProduct.vendor || null,
            imagenUrl: variantImageUrl,
            activo: shopifyProduct.status === "active",
            varianteTitulo: variantNode.title || `Variante ${i + 1}`,
            grupoOpciones: JSON.stringify(variantNode.selectedOptions || []),
            grupoVariantes: shopifyProductId,
            shopifyProductId: shopifyProductId,
          },
        });

        this.stats.variantesImportadas++;
      }
    }

    console.log(`[Import] Producto importado: ${shopifyProduct.title} (${variants.length} variante(s))`);
  }

  // private async guardarLocations(locationsData: any): Promise<void> {
  //   // Implementado en versión posterior
  // }
}
