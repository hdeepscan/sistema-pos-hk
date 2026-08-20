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
      const nuevoIntento = this.calcularProximoIntento(cambio.intentos);

      console.error(`[Sync Queue] Error en cambio ${cambio.id}:`, error);

      if (intentosRestantes > 0) {
        // Reintentar más tarde
        await (prisma as any).shopifySyncQueue.update({
          where: { id: cambio.id },
          data: {
            estado: "PENDIENTE",
            intentos: cambio.intentos + 1,
            proximoIntento: nuevoIntento,
            errorMensaje: error instanceof Error ? error.message : String(error),
          },
        });
      } else {
        // Máximo de intentos alcanzado
        await (prisma as any).shopifySyncQueue.update({
          where: { id: cambio.id },
          data: {
            estado: "ERROR",
            intentos: cambio.intentos + 1,
            errorMensaje: `Máximo de intentos alcanzado. Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
   * Sincronizar cambio de inventario con Shopify
   */
  private async sincronizarInventario(datos: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error("Cliente GraphQL no disponible");

    console.log(`[Sync] Sincronizando inventario:`, datos);

    const { shopifyInventoryItemId, locationId, cantidad } = datos;

    if (!shopifyInventoryItemId || !locationId || cantidad === undefined) {
      throw new Error("Datos incompletos para sincronizar inventario");
    }

    // Aquí iría la llamada a GraphQL para actualizar inventory en Shopify
    // Por ahora, solo logueamos
    console.log(
      `[Sync] Actualizando inventario Shopify: Item=${shopifyInventoryItemId}, Location=${locationId}, Cantidad=${cantidad}`
    );

    // TODO: Implementar mutation GraphQL de inventoryAdjust
    // await this.client.adjustInventory(shopifyInventoryItemId, locationId, cantidad);
  }

  /**
   * Sincronizar cambio de precio con Shopify
   */
  private async sincronizarPrecio(datos: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error("Cliente GraphQL no disponible");

    console.log(`[Sync] Sincronizando precio:`, datos);

    const { shopifyProductId, shopifyVariantId, nuevoPrecio } = datos;

    if (!shopifyVariantId || nuevoPrecio === undefined) {
      throw new Error("Datos incompletos para sincronizar precio");
    }

    // TODO: Implementar mutation GraphQL de productVariantUpdate
    console.log(
      `[Sync] Actualizando precio Shopify: Variante=${shopifyVariantId}, Precio=${nuevoPrecio}`
    );
  }

  /**
   * Sincronizar actualización de producto con Shopify
   */
  private async sincronizarProducto(datos: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error("Cliente GraphQL no disponible");

    console.log(`[Sync] Sincronizando producto:`, datos);

    const { shopifyProductId, nombre, descripcion, activo } = datos;

    if (!shopifyProductId) {
      throw new Error("Datos incompletos para sincronizar producto");
    }

    // TODO: Implementar mutation GraphQL de productUpdate
    console.log(`[Sync] Actualizando producto Shopify: ${shopifyProductId}`);
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
        case "products/update":
          await this.procesarProductoUpdate(payload.data);
          break;

        case "inventory_items/update":
          await this.procesarInventoryItemUpdate(payload.data);
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
   * Procesar webhook de actualización de inventory item
   */
  private async procesarInventoryItemUpdate(data: Record<string, any>): Promise<void> {
    console.log(`[Webhook] Inventory item actualizado en Shopify:`, data.id);

    const shopifyInventoryItemId = String(data.id);

    // TODO: Actualizar ShopifyInventoryItem con los nuevos datos
    // TODO: Sincronizar niveles de stock desde Shopify

    console.log(
      `[Webhook] Sincronizando inventory levels para item: ${shopifyInventoryItemId}`
    );
  }

  /**
   * Procesar webhook de orden (venta en Shopify)
   */
  private async procesarOrdenShopify(data: Record<string, any>): Promise<void> {
    console.log(`[Webhook] Orden procesada en Shopify:`, data.id);

    // TODO: Actualizar inventario en POS cuando se vende en Shopify
    // TODO: Crear registro de venta en POS si es necesario

    console.log(`[Webhook] Procesando orden Shopify: ${data.id}`);
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
