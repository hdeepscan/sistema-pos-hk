/**
 * Servicio de sincronización bidireccional con Shopify
 * Gestiona cola de cambios y webhooks
 */

import { prisma } from "./prisma.js";
import { ShopifyGraphQLClient } from "./shopify-graphql.js";

export interface SyncQueueItem {
  id: string;
  tipo: string;
  estado: string;
  productoId?: string;
  datos: Record<string, any> | string;
  intentos: number;
  maxIntentos: number;
  proximoIntento: Date;
}

export interface WebhookPayload {
  type: string;
  resourceId: string;
  resourceGid?: string;
  data: Record<string, any>;
}

export class ShopifySyncService {
  private client?: ShopifyGraphQLClient;
  private empresaId: string;

  constructor(empresaId: string, shopDomain?: string, accessToken?: string) {
    this.empresaId = empresaId;
    if (shopDomain && accessToken) {
      this.client = new ShopifyGraphQLClient(shopDomain, accessToken);
    }
  }

  /**
   * Agregar un cambio a la cola de sincronización
   */
  async agregarACola(
    tipo: string,
    datos: Record<string, any>,
    productoId?: string
  ): Promise<void> {
    try {
      await (prisma as any).shopifySyncQueue.create({
        data: {
          empresaId: this.empresaId,
          productoId: productoId || null,
          tipo,
          datos: JSON.stringify(datos),
          estado: "PENDIENTE",
          proximoIntento: new Date(),
        },
      });

      console.log(`[Sync Queue] Cambio agregado: ${tipo} para producto ${productoId}`);
    } catch (error) {
      console.error(`[Sync Queue Error] No se pudo agregar cambio:`, error);
      throw error;
    }
  }

  /**
   * Procesar cambios pendientes en la cola
   */
  async procesarCola(): Promise<{ procesados: number; errores: number }> {
    console.log(`[Sync Queue] Iniciando procesamiento de cola para empresa ${this.empresaId}`);

    const resultado = { procesados: 0, errores: 0 };

    if (!this.client) {
      console.warn(`[Sync Queue] No hay cliente GraphQL configurado`);
      return resultado;
    }

    try {
      // Obtener cambios pendientes que están listos para procesarse
      const cambiosPendientes = await (prisma as any).shopifySyncQueue.findMany({
        where: {
          empresaId: this.empresaId,
          estado: "PENDIENTE",
          proximoIntento: { lte: new Date() },
        },
        orderBy: { creadoEn: "asc" },
        take: 10, // Procesar máximo 10 a la vez
      });

      console.log(`[Sync Queue] Encontrados ${cambiosPendientes.length} cambios pendientes`);

      for (const cambio of cambiosPendientes) {
        try {
          await this.procesarCambio(cambio);
          resultado.procesados++;
        } catch (error) {
          resultado.errores++;
          console.error(`[Sync Queue Error] Error procesando cambio ${cambio.id}:`, error);
        }
      }

      return resultado;
    } catch (error) {
      console.error("[Sync Queue Fatal Error]", error);
      throw error;
    }
  }

  /**
   * Procesar un cambio individual
   */
  private async procesarCambio(cambio: SyncQueueItem): Promise<void> {
    console.log(`[Sync Queue] Procesando cambio ${cambio.id}: ${cambio.tipo}`);

    try {
      // Marcar como procesando
      await (prisma as any).shopifySyncQueue.update({
        where: { id: cambio.id },
        data: { estado: "PROCESANDO" },
      });

      const datos = typeof cambio.datos === "string" ? JSON.parse(cambio.datos) : cambio.datos;

      // Procesar según el tipo de cambio
      switch (cambio.tipo) {
        case "INVENTORY_UPDATE":
          await this.sincronizarInventario(datos);
          break;

        case "PRICE_UPDATE":
          await this.sincronizarPrecio(datos);
          break;

        case "PRODUCT_UPDATE":
          await this.sincronizarProducto(datos);
          break;

        default:
          throw new Error(`Tipo de cambio no reconocido: ${cambio.tipo}`);
      }

      // Marcar como completado
      await (prisma as any).shopifySyncQueue.update({
        where: { id: cambio.id },
        data: {
          estado: "COMPLETADO",
          procesadoEn: new Date(),
          intentos: cambio.intentos + 1,
        },
      });

      console.log(`[Sync Queue] Cambio ${cambio.id} completado exitosamente`);
    } catch (error) {
      const intentosRestantes = cambio.maxIntentos - cambio.intentos - 1;
      const errorAnalisis = this.esErrorReintentable(error);
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error(`[Sync Queue] ❌ Error en cambio ${cambio.id}: ${errorAnalisis.razon}`);
      console.error(`[Sync Queue] Mensaje: ${errorMsg}`);

      // Verificar si es reintentable
      if (errorAnalisis.reintentable && intentosRestantes > 0) {
        // Reintentar más tarde con backoff exponencial
        let nuevoIntento = this.calcularProximoIntento(cambio.intentos);

        // Si es rate limit, esperar más tiempo
        if (errorAnalisis.delayExtra) {
          nuevoIntento = new Date(Date.now() + errorAnalisis.delayExtra * 1000);
          console.log(`[Sync Queue] ⏳ Rate limit detectado - esperando ${errorAnalisis.delayExtra}s`);
        }

        await (prisma as any).shopifySyncQueue.update({
          where: { id: cambio.id },
          data: {
            estado: "PENDIENTE",
            intentos: cambio.intentos + 1,
            proximoIntento: nuevoIntento,
            errorMensaje: `[Intento ${cambio.intentos + 1}/${cambio.maxIntentos}] ${errorAnalisis.razon}: ${errorMsg.slice(0, 100)}`,
          },
        });
      } else {
        // No reintentable o máximo de intentos alcanzado
        const estado = errorAnalisis.reintentable ? "ERROR" : "ERROR";
        const mensajeFinal = errorAnalisis.reintentable
          ? `Máximo de intentos alcanzado (${cambio.maxIntentos}). Error: ${errorMsg.slice(0, 200)}`
          : `No reintentable: ${errorAnalisis.razon}. Error: ${errorMsg.slice(0, 200)}`;

        await (prisma as any).shopifySyncQueue.update({
          where: { id: cambio.id },
          data: {
            estado,
            intentos: cambio.intentos + 1,
            errorMensaje: mensajeFinal,
          },
        });

        console.error(`[Sync Queue] 🛑 Cambio marcado como ERROR: ${mensajeFinal}`);
      }
    }
  }

  /**
   * Calcular próximo intento con backoff exponencial
   * Intento 1: 5s, Intento 2: 30s, Intento 3: 300s (5m)
   */
  private calcularProximoIntento(numIntento: number): Date {
    const delays = [5, 30, 300]; // segundos
    const delay = delays[Math.min(numIntento, delays.length - 1)] * 1000;
    return new Date(Date.now() + delay);
  }

  /**
   * Analizar error de Shopify y determinar si es reintentable
   */
  private esErrorReintentable(error: any): {
    reintentable: boolean;
    razon: string;
    delayExtra?: number; // Segundos adicionales si es rate limit
  } {
    const mensaje = error.message || String(error);

    // Rate limit (HTTP 429)
    if (
      mensaje.includes("429") ||
      mensaje.includes("rate limit") ||
      mensaje.includes("throttle")
    ) {
      return {
        reintentable: true,
        razon: "Rate limit de Shopify",
        delayExtra: 60, // Esperar 1 minuto más
      };
    }

    // Timeout/conexión
    if (
      mensaje.includes("timeout") ||
      mensaje.includes("ECONNREFUSED") ||
      mensaje.includes("ENOTFOUND")
    ) {
      return {
        reintentable: true,
        razon: "Error de conexión",
      };
    }

    // Errores de validación (no reintentables)
    if (
      mensaje.includes("Invalid") ||
      mensaje.includes("validation") ||
      mensaje.includes("not found")
    ) {
      return {
        reintentable: false,
        razon: "Error de validación - no se reintentará",
      };
    }

    // Por defecto, reintentar
    return {
      reintentable: true,
      razon: "Error genérico - se reintentará",
    };
  }

  /**
   * Sincronizar cambio de inventario con Shopify
   */
  private async sincronizarInventario(datos: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error("Cliente GraphQL no disponible");

    const { shopifyInventoryItemId, locationId, cantidad } = datos;

    if (!shopifyInventoryItemId || !locationId || cantidad === undefined) {
      throw new Error("Datos incompletos para sincronizar inventario");
    }

    console.log(
      `[Sync] Actualizando inventario Shopify: Item=${shopifyInventoryItemId}, Delta=${cantidad}`
    );

    try {
      const resultado = await this.client.adjustInventory(shopifyInventoryItemId, locationId, cantidad);

      if (resultado.inventoryAdjustQuantity?.userErrors?.length > 0) {
        const errores = resultado.inventoryAdjustQuantity.userErrors;
        throw new Error(`Error Shopify: ${errores.map((e: any) => e.message).join(", ")}`);
      }

      console.log(`[Sync] ✅ Inventario sincronizado exitosamente`);
    } catch (error) {
      console.error(`[Sync] ❌ Error sincronizando inventario:`, error);
      throw error;
    }
  }

  /**
   * Sincronizar cambio de precio con Shopify
   */
  private async sincronizarPrecio(datos: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error("Cliente GraphQL no disponible");

    const { shopifyVariantId, nuevoPrecio } = datos;

    if (!shopifyVariantId || nuevoPrecio === undefined) {
      throw new Error("Datos incompletos para sincronizar precio");
    }

    console.log(`[Sync] Actualizando precio Shopify: Variante=${shopifyVariantId}, Precio=${nuevoPrecio}`);

    try {
      const resultado = await this.client.updateVariantPrice(
        shopifyVariantId,
        String(nuevoPrecio)
      );

      if (resultado.productVariantUpdate?.userErrors?.length > 0) {
        const errores = resultado.productVariantUpdate.userErrors;
        throw new Error(`Error Shopify: ${errores.map((e: any) => e.message).join(", ")}`);
      }

      console.log(`[Sync] ✅ Precio sincronizado exitosamente`);
    } catch (error) {
      console.error(`[Sync] ❌ Error sincronizando precio:`, error);
      throw error;
    }
  }

  /**
   * Sincronizar actualización de producto con Shopify
   */
  private async sincronizarProducto(datos: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error("Cliente GraphQL no disponible");

    const { shopifyProductId, nombre, descripcion, activo } = datos;

    if (!shopifyProductId) {
      throw new Error("Datos incompletos para sincronizar producto");
    }

    console.log(`[Sync] Actualizando producto Shopify: ${shopifyProductId}`);

    try {
      const resultado = await this.client.updateProduct(shopifyProductId, {
        nombre,
        descripcion,
        activo,
      });

      if (resultado.productUpdate?.userErrors?.length > 0) {
        const errores = resultado.productUpdate.userErrors;
        throw new Error(`Error Shopify: ${errores.map((e: any) => e.message).join(", ")}`);
      }

      console.log(`[Sync] ✅ Producto sincronizado exitosamente`);
    } catch (error) {
      console.error(`[Sync] ❌ Error sincronizando producto:`, error);
      throw error;
    }
  }

  /**
   * Procesar webhook recibido desde Shopify
   */
  async procesarWebhook(payload: WebhookPayload): Promise<void> {
    console.log(`[Webhook] Recibido: ${payload.type} - ${payload.resourceId}`);

    try {
      // Guardar evento en log
      const evento = await (prisma as any).shopifyWebhookEvent.create({
        data: {
          empresaId: this.empresaId,
          tipo: payload.type,
          shopifyResourceId: payload.resourceId,
          shopifyResourceGid: payload.resourceGid || null,
          datos: JSON.stringify(payload.data),
          procesado: false,
        },
      });

      // Procesar según el tipo de evento
      switch (payload.type) {
        case "products/create":
          await this.procesarProductoCreate(payload.data);
          break;

        case "products/update":
          await this.procesarProductoUpdate(payload.data);
          break;

        case "inventory_levels/update":
          await this.procesarInventoryLevelUpdate(payload.data);
          break;

        case "orders/create":
        case "orders/updated":
          await this.procesarOrdenShopify(payload.data);
          break;

        default:
          console.log(`[Webhook] Tipo de evento no manejado: ${payload.type}`);
      }

      // Marcar como procesado
      await (prisma as any).shopifyWebhookEvent.update({
        where: { id: evento.id },
        data: { procesado: true },
      });
    } catch (error) {
      console.error(`[Webhook Error] Error procesando webhook:`, error);
      throw error;
    }
  }

  /**
   * Procesar webhook de actualización de producto
   */
  private async procesarProductoUpdate(data: Record<string, any>): Promise<void> {
    console.log(`[Webhook] Producto actualizado en Shopify:`, data.id);

    const shopifyProductId = String(data.id);

    // Buscar producto vinculado
    const producto = await prisma.producto.findFirst({
      where: {
        empresaId: this.empresaId,
        shopifyProductId,
      },
    });

    if (!producto) {
      console.log(`[Webhook] Producto no encontrado en POS: ${shopifyProductId}`);
      return;
    }

    // Actualizar fields relevantes del producto
    const actualizaciones: Record<string, any> = {};

    if (data.title) actualizaciones.nombre = data.title;
    if (data.body_html) actualizaciones.descripcion = data.body_html;
    if (data.status) actualizaciones.activo = data.status === "active";

    if (Object.keys(actualizaciones).length > 0) {
      await prisma.producto.update({
        where: { id: producto.id },
        data: actualizaciones,
      });

      console.log(`[Webhook] Producto actualizado en POS: ${producto.id}`);
    }
  }

  /**
   * Procesar webhook de creación de producto en Shopify
   * Crea el producto base + todas sus variantes en POS
   */
  private async procesarProductoCreate(data: Record<string, any>): Promise<void> {
    console.log(`[Webhook] Nuevo producto creado en Shopify:`, data.id, data.title);

    try {
      const shopifyProductId = String(data.id);
      const shopifyGid = data.admin_graphql_api_id;

      // Verificar si ya existe
      const productoExistente = await prisma.producto.findFirst({
        where: {
          empresaId: this.empresaId,
          shopifyProductId,
        },
      });

      if (productoExistente) {
        console.log(`[Webhook] Producto ya existe en POS: ${shopifyProductId}`);
        return;
      }

      // Crear producto base
      const producto = await prisma.producto.create({
        data: {
          empresaId: this.empresaId,
          sku: `SKU-${shopifyProductId}`,
          nombre: data.title,
          descripcion: data.body_html || null,
          activo: data.status === "active",
          shopifyProductId,
          precio: 0, // Se actualiza con variantes
          costo: 0,
        },
      });

      console.log(`[Webhook] Producto creado en POS: ${producto.id}`);

      // Crear variantes
      if (data.variants && data.variants.length > 0) {
        for (const variant of data.variants) {
          await prisma.producto.create({
            data: {
              empresaId: this.empresaId,
              nombre: data.title,
              sku: variant.sku || `SKU-${variant.id}`,
              precio: parseFloat(variant.price || "0"),
              costo: 0,
              activo: data.status === "active",
              shopifyProductId: shopifyProductId,
              shopifyVariantId: String(variant.id),
              shopifyInventoryItemId: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
              varianteTitulo: variant.title,
            },
          });

          console.log(`[Webhook] Variante creada: ${variant.sku || variant.title}`);
        }
      }
    } catch (error) {
      console.error(`[Webhook Error] Error creando producto desde Shopify:`, error);
      throw error;
    }
  }

  /**
   * Procesar webhook de actualización de inventario desde Shopify
   * Sincroniza los niveles de stock hacia el POS
   */
  private async procesarInventoryLevelUpdate(data: Record<string, any>): Promise<void> {
    console.log(`[Webhook] Inventory level actualizado en Shopify:`, data.inventory_item_id);

    try {
      const shopifyInventoryItemId = String(data.inventory_item_id);
      const shopifyLocationId = String(data.location_id);
      const nuevoStock = data.available || 0;

      // Buscar variante con este inventory_item_id
      const variante = await prisma.producto.findFirst({
        where: {
          empresaId: this.empresaId,
          shopifyInventoryItemId,
        },
        include: { inventario: true },
      });

      if (!variante) {
        console.log(`[Webhook] Variante no encontrada para inventory_item: ${shopifyInventoryItemId}`);
        return;
      }

      // Actualizar stock en sucursal (por defecto, la primera activa)
      const sucursales = await prisma.sucursal.findMany({
        where: { empresaId: this.empresaId, activo: true },
        orderBy: { creadoEn: "asc" },
        take: 1,
      });

      if (sucursales.length === 0) {
        console.warn(`[Webhook] No hay sucursales activas para actualizar stock`);
        return;
      }

      const sucursal = sucursales[0];

      // Buscar o crear inventario de la sucursal
      const inventario = await prisma.inventarioSucursal.findFirst({
        where: {
          productoId: variante.id,
          sucursalId: sucursal.id,
        },
      });

      if (inventario) {
        await prisma.inventarioSucursal.update({
          where: { id: inventario.id },
          data: { cantidad: nuevoStock },
        });
      } else {
        await prisma.inventarioSucursal.create({
          data: {
            productoId: variante.id,
            sucursalId: sucursal.id,
            cantidad: nuevoStock,
          },
        });
      }

      console.log(`[Webhook] Stock sincronizado: ${variante.sku} = ${nuevoStock}`);
    } catch (error) {
      console.error(`[Webhook Error] Error sincronizando inventory level:`, error);
      throw error;
    }
  }

  /**
   * Procesar webhook de orden (venta en Shopify)
   */
  private async procesarOrdenShopify(data: Record<string, any>): Promise<void> {
    console.log(`[Webhook] Procesando orden Shopify #${data.order_number}`);

    try {
      const shopifyOrderId = String(data.id);
      const orderNumber = data.order_number;

      // Verificar si ya existe en POS (evitar duplicados)
      const ordenExistente = await (prisma as any).shopifyWebhookEvent.findFirst({
        where: {
          empresaId: this.empresaId,
          shopifyResourceId: shopifyOrderId,
          tipo: "orders/create",
          procesado: true,
        },
      });

      if (ordenExistente) {
        console.log(`[Webhook] Orden ya procesada: #${orderNumber}`);
        return;
      }

      // Procesar solo órdenes pagadas/confirmadas
      const financialStatus = data.financial_status; // authorized, captured, refunded, etc.
      const fulfillmentStatus = data.fulfillment_status; // fulfilled, partial, unshipped, etc.

      if (financialStatus === "paid" || financialStatus === "captured") {
        // Actualizar inventario por cada line item vendido
        for (const lineItem of data.line_items || []) {
          const sku = lineItem.sku;
          const cantidad = lineItem.quantity;

          // Buscar producto en POS por SKU
          const producto = await prisma.producto.findFirst({
            where: {
              empresaId: this.empresaId,
              sku,
            },
          });

          if (producto) {
            // Restar cantidad del inventario en la sucursal de ecommerce
            const sucursal = await prisma.sucursal.findFirst({
              where: { empresaId: this.empresaId, tipo: "ECOMMERCE" },
            });

            if (sucursal) {
              // Actualizar inventario
              const invActual = await prisma.inventarioSucursal.findUnique({
                where: { productoId_sucursalId: { productoId: producto.id, sucursalId: sucursal.id } },
              });

              const nuevaCantidad = Math.max(0, (invActual?.cantidad ?? 0) - cantidad);

              await prisma.inventarioSucursal.upsert({
                where: { productoId_sucursalId: { productoId: producto.id, sucursalId: sucursal.id } },
                update: { cantidad: nuevaCantidad },
                create: { productoId: producto.id, sucursalId: sucursal.id, cantidad: nuevaCantidad },
              });

              console.log(`[Webhook] ✅ Actualizado inventario: ${producto.nombre} (-${cantidad})`);
            }
          } else {
            console.warn(`[Webhook] ⚠️ Producto no encontrado en POS: SKU=${sku}`);
          }
        }

        console.log(`[Webhook] ✅ Orden #${orderNumber} procesada exitosamente`);
      } else {
        console.log(`[Webhook] ⚠️ Orden #${orderNumber} no pagada aún: ${financialStatus}`);
      }
    } catch (error) {
      console.error(`[Webhook] ❌ Error procesando orden:`, error);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Sincronizar inventario del POS hacia Shopify
   * Cuando se vende, devuelve o ajusta stock en POS, actualizar en Shopify
   */
  async actualizarInventarioEnShopify(
    variante: { shopifyInventoryItemId?: string; sku: string; nombre: string },
    nuevoStock: number,
    shopifyLocationId?: string
  ): Promise<void> {
    if (!this.client) {
      console.warn(`[Sync] No hay cliente Shopify configurado`);
      return;
    }

    if (!variante.shopifyInventoryItemId) {
      console.warn(`[Sync] Variante sin shopifyInventoryItemId: ${variante.sku}`);
      return;
    }

    try {
      console.log(`[Sync] Actualizando inventario en Shopify: ${variante.sku} = ${nuevoStock}`);

      // Usar query GraphQL para actualizar inventory level
      const query = `
        mutation updateInventoryLevel($input: InventoryLevelAdjustQuantityInput!) {
          inventoryLevelAdjustQuantity(input: $input) {
            inventoryLevel {
              available
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Por ahora, agregar a cola para procesarse después
      await this.agregarACola("ACTUALIZAR_INVENTARIO", {
        shopifyInventoryItemId: variante.shopifyInventoryItemId,
        shopifyLocationId: shopifyLocationId || "gid://shopify/Location/1",
        nuevoStock,
      });

      console.log(`[Sync] ✅ Actualización de inventario en cola: ${variante.sku}`);
    } catch (error) {
      console.error(`[Sync Error] Error actualizando inventario en Shopify:`, error);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Sincronizar cambios de producto del POS hacia Shopify
   * Cuando se edita nombre, precio o código de barras en POS
   */
  async actualizarProductoEnShopify(
    producto: {
      shopifyProductId?: string;
      shopifyVariantId?: string;
      nombre: string;
      precio: number;
      codigoBarras?: string | null;
    }
  ): Promise<void> {
    if (!this.client) {
      console.warn(`[Sync] No hay cliente Shopify configurado`);
      return;
    }

    if (!producto.shopifyProductId) {
      console.warn(`[Sync] Producto sin shopifyProductId`);
      return;
    }

    try {
      console.log(`[Sync] Actualizando producto en Shopify: ${producto.nombre}`);

      // Agregar a cola para procesarse después
      await this.agregarACola("ACTUALIZAR_PRODUCTO", {
        shopifyProductId: producto.shopifyProductId,
        shopifyVariantId: producto.shopifyVariantId || null,
        nombre: producto.nombre,
        precio: producto.precio,
        codigoBarras: producto.codigoBarras,
      });

      console.log(`[Sync] ✅ Actualización de producto en cola: ${producto.nombre}`);
    } catch (error) {
      console.error(`[Sync Error] Error actualizando producto en Shopify:`, error);
      throw error;
    }
  }

  /**
   * Obtener estado de la cola de sincronización
   */
  async obtenerEstadoCola(): Promise<{
    pendientes: number;
    procesando: number;
    completados: number;
    errores: number;
  }> {
    const [pendientes, procesando, completados, errores] = await Promise.all([
      (prisma as any).shopifySyncQueue.count({
        where: { empresaId: this.empresaId, estado: "PENDIENTE" },
      }),
      (prisma as any).shopifySyncQueue.count({
        where: { empresaId: this.empresaId, estado: "PROCESANDO" },
      }),
      (prisma as any).shopifySyncQueue.count({
        where: { empresaId: this.empresaId, estado: "COMPLETADO" },
      }),
      (prisma as any).shopifySyncQueue.count({
        where: { empresaId: this.empresaId, estado: "ERROR" },
      }),
    ]);

    return { pendientes, procesando, completados, errores };
  }
}
