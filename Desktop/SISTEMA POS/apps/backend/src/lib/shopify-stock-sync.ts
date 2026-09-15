import { prisma } from './prisma.js';

/**
 * Sincroniza el stock de un producto POS hacia Shopify
 * Función de fuego y olvido (fire-and-forget) - no bloquea la venta
 */
export async function syncProductStockToShopify(
  productoId: string,
  sucursalId: string
): Promise<void> {
  try {
    // 1. Obtener producto y su empresa
    const producto = await prisma.producto.findUnique({
      where: { id: productoId },
      select: {
        id: true,
        nombre: true,
        empresaId: true,
        shopifyInventoryItemId: true,
      },
    });

    if (!producto || !producto.shopifyInventoryItemId) {
      console.log(`[shopify-stock-sync] ⏭️ Producto ${productoId} no está vinculado a Shopify`);
      return;
    }

    // 2. Obtener configuración Shopify de la empresa
    const shopifyConfig = await prisma.shopifyConfig.findUnique({
      where: { empresaId: producto.empresaId },
      select: {
        shopDomain: true,
        accessToken: true,
      },
    });

    if (!shopifyConfig?.accessToken) {
      console.error(
        `[shopify-stock-sync] ❌ No hay token de acceso para empresa ${producto.empresaId}`
      );
      return;
    }

    // 3. Obtener stock actual en la sucursal
    const inventario = await prisma.inventarioSucursal.findUnique({
      where: {
        productoId_sucursalId: {
          productoId,
          sucursalId,
        },
      },
      select: { cantidad: true },
    });

    const cantidadActual = inventario?.cantidad ?? 0;

    // 4. Enviar a Shopify GraphQL API
    const mutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        reason: "POS_STOCK_UPDATE",
        quantities: [
          {
            inventoryItemId: producto.shopifyInventoryItemId,
            availableQuantity: cantidadActual,
          },
        ],
      },
    };

    const response = await fetch(`https://${shopifyConfig.shopDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyConfig.accessToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables,
      }),
    });

    const data: any = await response.json();

    if (data.errors || data.data?.inventorySetQuantities?.userErrors?.length) {
      console.error(
        `[shopify-stock-sync] ❌ Error sincronizando stock de ${producto.nombre}:`,
        data.errors || data.data?.inventorySetQuantities?.userErrors
      );
      return;
    }

    console.log(
      `[shopify-stock-sync] ✅ Stock sincronizado para ${producto.nombre}: ${cantidadActual} unidades`
    );

    // 5. Registrar en cola de sincronización para auditoría
    await prisma.shopifySyncQueue.create({
      data: {
        empresaId: producto.empresaId,
        productoId,
        tipo: 'INVENTORY_UPDATE',
        estado: 'COMPLETADO',
        datos: JSON.stringify(data),
      },
    }).catch((err) => {
      console.error('[shopify-stock-sync] Error registrando en cola:', err);
    });
  } catch (error) {
    console.error('[shopify-stock-sync] ❌ Error crítico:', error);
    // NO lanzar excepción - el sistema debe continuar sin bloqueos
  }
}

/**
 * Sincroniza múltiples productos (ej. después de cierre de ventas)
 */
export async function syncMultipleStocksToShopify(
  productoIds: string[],
  sucursalId: string
): Promise<void> {
  const promises = productoIds.map((id) =>
    syncProductStockToShopify(id, sucursalId).catch((err) =>
      console.error(`[shopify-stock-sync] Error sincronizando ${id}:`, err)
    )
  );

  // Fire-and-forget: no esperar resultados
  Promise.all(promises).catch(() => {});
}

/**
 * Descuenta stock en POS desde webhook de Shopify
 * Se ejecuta cuando hay una venta en Shopify
 */
export async function decrementStockFromShopifyOrder(
  empresaId: string,
  lineItems: Array<{
    sku?: string;
    variantId?: string;
    quantity: number;
  }>
): Promise<{ descuentosAplicados: number; errores: string[] }> {
  const resultado = {
    descuentosAplicados: 0,
    errores: [] as string[],
  };

  try {
    // Obtener sucursal ecommerce para esta empresa
    const config = await prisma.shopifyConfig.findUnique({
      where: { empresaId },
      select: { sucursalEcommerceId: true },
    });

    if (!config?.sucursalEcommerceId) {
      resultado.errores.push('Sucursal ecommerce no configurada');
      return resultado;
    }

    for (const item of lineItems) {
      try {
        // Buscar producto por SKU o shopifyVariantId
        const producto = await prisma.producto.findFirst({
          where: {
            empresaId,
            OR: [
              item.sku ? { sku: item.sku } : undefined,
              item.variantId ? { shopifyVariantId: item.variantId } : undefined,
            ].filter(Boolean) as any[],
          },
        });

        if (!producto) {
          resultado.errores.push(`Producto no encontrado: SKU=${item.sku}, variantId=${item.variantId}`);
          continue;
        }

        // Decrementar stock
        const updated = await prisma.inventarioSucursal.update({
          where: {
            productoId_sucursalId: {
              productoId: producto.id,
              sucursalId: config.sucursalEcommerceId,
            },
          },
          data: {
            cantidad: {
              decrement: item.quantity,
            },
          },
        }).catch(async () => {
          // Si no existe, crear con stock negativo (backorder)
          return await prisma.inventarioSucursal.create({
            data: {
              productoId: producto.id,
              sucursalId: config.sucursalEcommerceId,
              cantidad: -item.quantity,
            },
          });
        });

        // Registrar movimiento (usando UncheckedCreateInput para webhook automático)
        await prisma.movimientoInventario.create({
          data: {
            productoId: producto.id,
            sucursalId: config.sucursalEcommerceId,
            tipo: 'VENTA', // TipoMovimiento enum
            cantidad: item.quantity,
            motivo: 'Venta Shopify (webhook)',
            usuarioId: 'system-webhook', // ID virtual para webhooks automáticos
          } as any, // Bypass strict typing for system webhooks
        }).catch(() => {});

        resultado.descuentosAplicados++;

        console.log(
          `[shopify-stock-sync] ✅ Stock decrementado para ${producto.nombre}: ${item.quantity} unidades`
        );
      } catch (err) {
        resultado.errores.push(
          `Error procesando item: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return resultado;
  } catch (error) {
    resultado.errores.push(
      `Error crítico: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error('[shopify-stock-sync] Error crítico en decrementStockFromShopifyOrder:', error);
    return resultado;
  }
}
