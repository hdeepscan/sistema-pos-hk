/**
 * Resolver conflictos cuando hay cambios simultáneos en POS y Shopify
 * Estrategia: "Last Write Wins" con logging de conflictos
 */

import { prisma } from "./prisma.js";

export interface ConflictResolutionStrategy {
  tipo: "LAST_WRITE_WINS" | "POS_PRIORITY" | "SHOPIFY_PRIORITY" | "MANUAL";
  descripcion: string;
}

export class ConflictResolver {
  private estrategia: ConflictResolutionStrategy = {
    tipo: "LAST_WRITE_WINS",
    descripcion: "El cambio más reciente prevalece",
  };

  constructor(empresaId: string) {
    // La estrategia podría guardarse en BD por empresa
    // Por ahora, LAST_WRITE_WINS es la default
  }

  /**
   * Detectar y resolver conflicto de inventario
   * Conflicto: POS dice stock=10, Shopify dice stock=5
   */
  async resolverConflictoInventario(
    productoId: string,
    stockPOS: number,
    stockShopify: number,
    ultimaModificacionPOS: Date,
    ultimaModificacionShopify: Date
  ): Promise<{ stockFinal: number; fuente: "POS" | "SHOPIFY"; razon: string }> {
    console.log(
      `[Conflict] Inventario: POS=${stockPOS}, Shopify=${stockShopify}, Diff=${Math.abs(
        stockPOS - stockShopify
      )}`
    );

    // Diferencia mayor a 5 unidades = probable conflicto
    if (Math.abs(stockPOS - stockShopify) > 5) {
      console.warn(`[Conflict] ⚠️ Diferencia significativa de inventario detectada`);

      // Registrar conflicto en logs
      await this.registrarConflicto({
        tipo: "INVENTORY_MISMATCH",
        productoId,
        datos: {
          stockPOS,
          stockShopify,
          diferencia: Math.abs(stockPOS - stockShopify),
        },
      });
    }

    // LAST_WRITE_WINS: el más reciente prevalece
    if (ultimaModificacionPOS > ultimaModificacionShopify) {
      return {
        stockFinal: stockPOS,
        fuente: "POS",
        razon: `POS más reciente (${ultimaModificacionPOS.toISOString()})`,
      };
    } else {
      return {
        stockFinal: stockShopify,
        fuente: "SHOPIFY",
        razon: `Shopify más reciente (${ultimaModificacionShopify.toISOString()})`,
      };
    }
  }

  /**
   * Detectar y resolver conflicto de precio
   */
  async resolverConflictoPrecio(
    productoId: string,
    precioPOS: number,
    precioShopify: number,
    ultimaModificacionPOS: Date,
    ultimaModificacionShopify: Date
  ): Promise<{ precioFinal: number; fuente: "POS" | "SHOPIFY"; razon: string }> {
    console.log(
      `[Conflict] Precio: POS=$${precioPOS}, Shopify=$${precioShopify}, Diff=$${Math.abs(
        precioPOS - precioShopify
      )}`
    );

    // Diferencia mayor a 10% = probable conflicto
    const diferenciaPorcentaje = Math.abs(precioPOS - precioShopify) / Math.max(precioPOS, precioShopify);

    if (diferenciaPorcentaje > 0.1) {
      console.warn(`[Conflict] ⚠️ Diferencia de precio >= 10% detectada`);

      await this.registrarConflicto({
        tipo: "PRICE_MISMATCH",
        productoId,
        datos: {
          precioPOS,
          precioShopify,
          diferenciaPorcentaje: Math.round(diferenciaPorcentaje * 100),
        },
      });
    }

    // LAST_WRITE_WINS
    if (ultimaModificacionPOS > ultimaModificacionShopify) {
      return {
        precioFinal: precioPOS,
        fuente: "POS",
        razon: `POS más reciente`,
      };
    } else {
      return {
        precioFinal: precioShopify,
        fuente: "SHOPIFY",
        razon: `Shopify más reciente`,
      };
    }
  }

  /**
   * Detectar si hay cambios simultáneos (conflicto potencial)
   */
  async detectarCambiosSimultaneos(
    productoId: string,
    ventanaSegundos: number = 60
  ): Promise<boolean> {
    // Buscar si hay cambios en la cola dentro de los últimos N segundos
    const hastaHace = new Date(Date.now() - ventanaSegundos * 1000);

    const cambiosPendientes = await (prisma as any).shopifySyncQueue.findMany({
      where: {
        productoId,
        creadoEn: { gte: hastaHace },
        estado: { in: ["PENDIENTE", "PROCESANDO"] },
      },
      take: 1,
    });

    return cambiosPendientes.length > 0;
  }

  /**
   * Registrar conflicto en logs para auditoría
   */
  private async registrarConflicto(conflicto: {
    tipo: string;
    productoId?: string;
    datos: Record<string, any>;
  }): Promise<void> {
    console.warn(`[Conflict Log] ${conflicto.tipo}:`, conflicto.datos);

    // TODO: Guardar en tabla de logs de conflictos para auditoría
    // await prisma.shopifyConflictLog.create({
    //   data: {
    //     tipo: conflicto.tipo,
    //     productoId: conflicto.productoId,
    //     datos: JSON.stringify(conflicto.datos),
    //     resueltoManualmente: false,
    //   },
    // });
  }

  /**
   * Obtener resumen de conflictos sin resolver
   */
  async obtenerConflictosActivos(): Promise<{
    total: number;
    resumen: Record<string, number>;
  }> {
    // TODO: Implementar cuando tengamos tabla de conflictos

    return {
      total: 0,
      resumen: {},
    };
  }
}
