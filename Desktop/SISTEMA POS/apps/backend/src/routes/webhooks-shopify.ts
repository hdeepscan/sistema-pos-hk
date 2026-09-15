import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { decrementStockFromShopifyOrder } from '../lib/shopify-stock-sync.js';

/**
 * Verifica la firma HMAC del webhook de Shopify
 * Garantiza que el webhook proviene de Shopify
 */
function verificarFirmaWebhook(request: FastifyRequest, secret: string): boolean {
  const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;

  if (!hmacHeader) {
    console.error('[webhooks-shopify] ❌ Falta HMAC header');
    return false;
  }

  // Crear cuerpo en buffer
  const rawRequest = request as any;
  const body = rawRequest.rawBody || Buffer.from(JSON.stringify(request.body));

  // Calcular HMAC
  const calculada = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  const valida = calculada === hmacHeader;

  if (!valida) {
    console.error('[webhooks-shopify] ❌ HMAC inválido. Esperado:', hmacHeader, 'Calculado:', calculada);
  }

  return valida;
}

export async function webhooksShopifyRoutes(app: FastifyInstance) {
  /**
   * POST /webhooks/shopify/orders-create
   * Se ejecuta cuando se crea una orden en Shopify
   */
  app.post('/webhooks/shopify/orders-create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body: any = request.body;
      const shopDomain = body.shop?.myshopify_domain || 'desconocido';

      console.log(`[webhooks-shopify/orders-create] 📦 Orden recibida de ${shopDomain}`);
      console.log(`[webhooks-shopify/orders-create] Order ID: ${body.id}`);
      console.log(`[webhooks-shopify/orders-create] Items: ${body.line_items?.length || 0}`);

      // 1. Verificar firma HMAC
      const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
      if (!secret) {
        console.error('[webhooks-shopify] ❌ SHOPIFY_WEBHOOK_SECRET no configurado');
        return reply.code(400).send({ error: 'Webhook secret no configurado' });
      }

      const firmaValida = verificarFirmaWebhook(request, secret);
      if (!firmaValida) {
        console.error('[webhooks-shopify] ❌ Firma HMAC inválida');
        return reply.code(401).send({ error: 'Firma inválida' });
      }

      console.log('[webhooks-shopify] ✅ Firma HMAC válida');

      // 2. Buscar empresa por dominio Shopify
      const shopifyConfig = await prisma.shopifyConfig.findFirst({
        where: { shopDomain: body.shop?.myshopify_domain || '' },
        select: { empresaId: true, shopDomain: true },
      });

      if (!shopifyConfig) {
        console.warn(
          `[webhooks-shopify] ⚠️ No se encontró empresa para dominio: ${body.shop?.myshopify_domain}`
        );
        // Retornar 200 de todas formas para no reintentar
        return reply.code(200).send({ ok: true, warning: 'Empresa no encontrada' });
      }

      console.log(`[webhooks-shopify] Empresa encontrada: ${shopifyConfig.empresaId}`);

      // 3. Convertir line_items al formato esperado
      const lineItems = (body.line_items || []).map((item: any) => ({
        sku: item.sku,
        variantId: String(item.variant_id),
        quantity: item.quantity,
      }));

      console.log(`[webhooks-shopify] Procesando ${lineItems.length} items`);

      // 4. Decrementar stock en POS
      const resultado = await decrementStockFromShopifyOrder(shopifyConfig.empresaId, lineItems);

      console.log(
        `[webhooks-shopify] ✅ Resultado: ${resultado.descuentosAplicados} productos actualizados`
      );

      if (resultado.errores.length > 0) {
        console.warn(`[webhooks-shopify] ⚠️ Errores: ${resultado.errores.join(', ')}`);
      }

      // 5. Registrar evento de webhook para auditoría
      await prisma.shopifyWebhookEvent.create({
        data: {
          empresaId: shopifyConfig.empresaId,
          tipo: 'orders/create',
          shopifyResourceId: String(body.id),
          shopifyResourceGid: body.admin_graphql_api_id || undefined,
          datos: JSON.stringify(body),
          procesado: resultado.errores.length === 0,
          procesoError: resultado.errores.length > 0 ? resultado.errores.join('; ') : undefined,
        },
      }).catch((err) => {
        console.error('[webhooks-shopify] Error registrando evento:', err);
      });

      // 6. Responder OK (Shopify no necesita datos, solo confirmación)
      return reply.code(200).send({
        ok: true,
        descuentosAplicados: resultado.descuentosAplicados,
        errores: resultado.errores,
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[webhooks-shopify/orders-create] ❌ Error:', mensaje);
      console.error('[webhooks-shopify/orders-create] Stack:', error instanceof Error ? error.stack : '');

      // Retornar 500 para que Shopify reintente (si falla por error nuestro)
      return reply.code(500).send({ error: mensaje });
    }
  });

  /**
   * POST /webhooks/shopify/orders-updated
   * Se ejecuta cuando se actualiza una orden (cambios de dirección, etc)
   */
  app.post('/webhooks/shopify/orders-updated', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body: any = request.body;
      console.log('[webhooks-shopify/orders-updated] 📝 Orden actualizada');

      const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
      if (!secret || !verificarFirmaWebhook(request, secret)) {
        return reply.code(401).send({ error: 'Firma inválida' });
      }

      // Por ahora, solo registrar el evento
      await prisma.shopifyWebhookEvent.create({
        data: {
          empresaId: 'unknown', // Se puede mejorar extrayendo del body
          tipo: 'orders/updated',
          shopifyResourceId: String(body.id || 'unknown'),
          datos: JSON.stringify(body),
        },
      }).catch(() => {});

      return reply.code(200).send({ ok: true });
    } catch (error) {
      console.error('[webhooks-shopify/orders-updated] ❌ Error:', error);
      return reply.code(500).send({ error: 'Error procesando webhook' });
    }
  });

  /**
   * POST /webhooks/shopify/products-create
   * Se ejecuta cuando se crea un producto en Shopify (para futuros features)
   */
  app.post('/webhooks/shopify/products-create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body: any = request.body;
      console.log('[webhooks-shopify/products-create] 🆕 Producto creado');

      const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
      if (!secret || !verificarFirmaWebhook(request, secret)) {
        return reply.code(401).send({ error: 'Firma inválida' });
      }

      // Registrar evento
      await prisma.shopifyWebhookEvent.create({
        data: {
          empresaId: 'unknown',
          tipo: 'products/create',
          shopifyResourceId: String(body.id || 'unknown'),
          datos: JSON.stringify(body),
        },
      }).catch(() => {});

      return reply.code(200).send({ ok: true });
    } catch (error) {
      console.error('[webhooks-shopify/products-create] ❌ Error:', error);
      return reply.code(500).send({ error: 'Error procesando webhook' });
    }
  });
}
