/**
 * Worker que procesa la cola de sincronización cada 10 segundos
 * Se ejecuta en background sin bloquear la API
 */

import { prisma } from "./prisma.js";
import { ShopifySyncService } from "./shopify-sync-service.js";

export class ShopifyQueueWorker {
  private static instance: ShopifyQueueWorker;
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly INTERVAL_MS = 10000; // 10 segundos

  private constructor() {}

  static getInstance(): ShopifyQueueWorker {
    if (!ShopifyQueueWorker.instance) {
      ShopifyQueueWorker.instance = new ShopifyQueueWorker();
    }
    return ShopifyQueueWorker.instance;
  }

  /**
   * Iniciar worker
   */
  start(): void {
    if (this.interval) {
      console.log("[Shopify Queue Worker] Ya está ejecutándose");
      return;
    }

    console.log(`[Shopify Queue Worker] Iniciando (cada ${this.INTERVAL_MS}ms)`);

    this.interval = setInterval(() => {
      this.procesarEmpresas();
    }, this.INTERVAL_MS);

    // Ejecutar una vez al iniciar
    void this.procesarEmpresas();
  }

  /**
   * Detener worker
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[Shopify Queue Worker] Detenido");
    }
  }

  /**
   * Procesar todas las empresas que tienen Shopify configurado
   */
  private async procesarEmpresas(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    try {
      // Obtener todas las empresas con Shopify configurado
      const empresasConShopify = await prisma.shopifyConfig.findMany({
        select: { empresaId: true, shopDomain: true, accessToken: true },
      });

      if (empresasConShopify.length === 0) {
        return; // Sin empresas, no hay nada que procesar
      }

      // Procesar cada empresa en paralelo (máximo 5 simultáneas)
      const chunks = [];
      for (let i = 0; i < empresasConShopify.length; i += 5) {
        chunks.push(empresasConShopify.slice(i, i + 5));
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map((empresa) =>
            this.procesarEmpresa(empresa.empresaId, empresa.shopDomain, empresa.accessToken)
          )
        );
      }
    } catch (error) {
      console.error("[Shopify Queue Worker Error]", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Procesar cola de una empresa específica
   */
  private async procesarEmpresa(
    empresaId: string,
    shopDomain: string,
    accessToken: string | null
  ): Promise<void> {
    try {
      // Obtener cantidad de cambios pendientes
      const pendientes = await (prisma as any).shopifySyncQueue.count({
        where: { empresaId, estado: "PENDIENTE", proximoIntento: { lte: new Date() } },
      });

      if (pendientes === 0) return;

      // Crear servicio y procesar
      const syncService = new ShopifySyncService(empresaId, shopDomain, accessToken || undefined);
      const resultado = await syncService.procesarCola();

      if (resultado.procesados > 0 || resultado.errores > 0) {
        console.log(
          `[Shopify Queue Worker] Empresa ${empresaId.slice(0, 8)}: ${resultado.procesados} procesados, ${resultado.errores} errores`
        );
      }
    } catch (error) {
      console.error(`[Shopify Queue Worker Error] Empresa ${empresaId}:`, error);
    }
  }
}

// Exportar función para inicializar desde main
export function iniciarShopifyQueueWorker(): void {
  const worker = ShopifyQueueWorker.getInstance();
  worker.start();
}

export function detenerShopifyQueueWorker(): void {
  const worker = ShopifyQueueWorker.getInstance();
  worker.stop();
}
