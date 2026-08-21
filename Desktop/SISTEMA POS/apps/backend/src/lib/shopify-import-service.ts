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

export interface ImportInventoryStats {
  ubicacionesEncontradas: number;
  ubicacionesImportadas: number;
  itemsDeInventarioImportados: number;
  nivelesDeInventarioImportados: number;
  errores: number;
  erroresDetalle: Array<{ ubicacion?: string; error: string }>;
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

        // Validar que productsData sea válido
        if (!productsData || !productsData.products) {
          console.error("[Import Error] No data returned from Shopify. Response:", productsData);
          throw new Error("No se obtuvieron datos de productos desde Shopify. Verifica tu conexión y token.");
        }

        // LOG DETALLADO: Ver estructura de productsData.products
        console.log(`[Import] productsData.products estructura:`, JSON.stringify(productsData.products).substring(0, 500));
        console.log(`[Import] ¿Tiene edges?:`, Array.isArray(productsData.products?.edges));
        console.log(`[Import] ¿Es array?:`, Array.isArray(productsData.products));

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

  /**
   * FASE 3: Importar inventario (ubicaciones y niveles de stock)
   */
  async importarInventario(): Promise<ImportInventoryStats> {
    const invStats: ImportInventoryStats = {
      ubicacionesEncontradas: 0,
      ubicacionesImportadas: 0,
      itemsDeInventarioImportados: 0,
      nivelesDeInventarioImportados: 0,
      errores: 0,
      erroresDetalle: [],
    };

    try {
      console.log(`[Inventory] Iniciando importación de inventario para empresa ${this.empresaId}`);

      // Paso 1: Importar ubicaciones (locations)
      const locationsData = await this.client.getLocations();
      const locations = locationsData.locations?.edges || [];
      invStats.ubicacionesEncontradas = locations.length;

      for (const { node: location } of locations) {
        try {
          await this.guardarUbicacion(location);
          invStats.ubicacionesImportadas++;
        } catch (error) {
          invStats.errores++;
          invStats.erroresDetalle.push({
            ubicacion: location.name,
            error: error instanceof Error ? error.message : String(error),
          });
          console.error(`[Inventory Error] Ubicación ${location.name}:`, error);
        }
      }

      // Paso 2: Obtener todas las variantes de productos importados y sincronizar inventario
      const productosConShopifyId = await prisma.producto.findMany({
        where: {
          empresaId: this.empresaId,
          shopifyInventoryItemId: { not: null },
        },
        select: {
          id: true,
          shopifyInventoryItemId: true,
          nombre: true,
        },
      });

      for (const producto of productosConShopifyId) {
        try {
          if (!producto.shopifyInventoryItemId) continue;

          await this.guardarInventarioItem(producto.id, producto.shopifyInventoryItemId);
          invStats.itemsDeInventarioImportados++;

          // Obtener levels para este item
          const levelsData = await this.client.getInventoryLevels(producto.shopifyInventoryItemId);
          const levels = levelsData.inventoryItem?.inventoryLevels?.edges || [];

          for (const { node: level } of levels) {
            try {
              await this.guardarNivelInventario(
                producto.shopifyInventoryItemId,
                level.location.id,
                level
              );
              invStats.nivelesDeInventarioImportados++;
            } catch (error) {
              console.error(`[Inventory Level Error]`, error);
            }
          }
        } catch (error) {
          invStats.errores++;
          invStats.erroresDetalle.push({
            error: error instanceof Error ? error.message : String(error),
          });
          console.error(`[Inventory Error] Producto ${producto.nombre}:`, error);
        }
      }

      console.log(`[Inventory] Importación completada:`, invStats);
      return invStats;
    } catch (error) {
      console.error("[Inventory Fatal Error]", error);
      throw error;
    }
  }

  private async guardarUbicacion(location: any): Promise<void> {
    const shopifyLocationId = location.id;
    const ubicacionExistente = await (prisma as any).shopifyLocation.findFirst({
      where: {
        empresaId: this.empresaId,
        shopifyLocationId,
      },
    });

    if (ubicacionExistente) {
      console.log(`[Inventory] Ubicación ya existe: ${location.name}`);
      return;
    }

    await (prisma as any).shopifyLocation.create({
      data: {
        empresaId: this.empresaId,
        shopifyLocationId,
        nombre: location.name,
        activa: location.isActive,
      },
    });

    console.log(`[Inventory] Ubicación guardada: ${location.name}`);
  }

  private async guardarInventarioItem(productoId: string, shopifyInventoryItemId: string): Promise<void> {
    const itemExistente = await (prisma as any).shopifyInventoryItem.findFirst({
      where: {
        empresaId: this.empresaId,
        shopifyInventoryItemId,
      },
    });

    if (itemExistente) {
      // Actualizar vínculo con producto si no tiene
      if (!itemExistente.productoId) {
        await (prisma as any).shopifyInventoryItem.update({
          where: { id: itemExistente.id },
          data: { productoId },
        });
      }
      return;
    }

    await (prisma as any).shopifyInventoryItem.create({
      data: {
        empresaId: this.empresaId,
        shopifyInventoryItemId,
        productoId,
      },
    });

    console.log(`[Inventory] Item de inventario guardado: ${shopifyInventoryItemId}`);
  }

  private async guardarNivelInventario(
    shopifyInventoryItemId: string,
    shopifyLocationId: string,
    level: any
  ): Promise<void> {
    // Obtener IDs locales
    const inventoryItem = await (prisma as any).shopifyInventoryItem.findFirst({
      where: {
        empresaId: this.empresaId,
        shopifyInventoryItemId,
      },
    });

    const location = await (prisma as any).shopifyLocation.findFirst({
      where: {
        empresaId: this.empresaId,
        shopifyLocationId,
      },
    });

    if (!inventoryItem || !location) {
      throw new Error(`Item o ubicación no encontrados para ${shopifyInventoryItemId}`);
    }

    const levelExistente = await (prisma as any).shopifyInventoryLevel.findFirst({
      where: {
        inventoryItemId: inventoryItem.id,
        locationId: location.id,
      },
    });

    if (levelExistente) {
      // Actualizar
      await (prisma as any).shopifyInventoryLevel.update({
        where: { id: levelExistente.id },
        data: {
          disponible: level.available || 0,
          enMano: level.onHand || 0,
          comprometida: level.committed || 0,
          entrante: level.incoming || 0,
        },
      });
    } else {
      // Crear
      await (prisma as any).shopifyInventoryLevel.create({
        data: {
          empresaId: this.empresaId,
          inventoryItemId: inventoryItem.id,
          locationId: location.id,
          disponible: level.available || 0,
          enMano: level.onHand || 0,
          comprometida: level.committed || 0,
          entrante: level.incoming || 0,
        },
      });
    }
  }

  // private async guardarLocations(locationsData: any): Promise<void> {
  //   // Implementado en versión posterior
  // }
}
