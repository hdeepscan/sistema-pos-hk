import type { FastifyInstance } from "fastify";
import { GuardarShopifyConfigSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { normalizarDominio, validarDominioShopify, sincronizarProductos } from "../lib/shopify.js";
import { mensajeDeValidacion } from "../lib/errores.js";

function enmascarar(secreto: string) {
  return secreto.length <= 4 ? "****" : `${"*".repeat(secreto.length - 4)}${secreto.slice(-4)}`;
}

export async function shopifyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/shopify/config", async (request) => {
    const { empresaId } = request.user;
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return { conectado: false };
    return {
      conectado: true,
      shopDomain: config.shopDomain,
      clientId: config.clientId,
      clientSecret: enmascarar(config.clientSecret),
      sucursalEcommerceId: config.sucursalEcommerceId,
      ultimaSincronizacion: config.ultimaSincronizacion,
    };
  });

  app.post("/shopify/config", async (request, reply) => {
    const { empresaId } = request.user;
    const parsed = GuardarShopifyConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const sucursal = await prisma.sucursal.findFirst({
      where: { id: parsed.data.sucursalEcommerceId, empresaId },
    });
    if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

    const shopDomain = normalizarDominio(parsed.data.shopDomain);
    const problemaDominio = validarDominioShopify(shopDomain);
    if (problemaDominio) return reply.code(400).send({ error: problemaDominio });

    const config = await prisma.shopifyConfig.upsert({
      where: { empresaId },
      update: {
        shopDomain,
        clientId: parsed.data.clientId,
        clientSecret: parsed.data.clientSecret,
        sucursalEcommerceId: parsed.data.sucursalEcommerceId,
        accessToken: null,
        tokenExpiraEn: null,
      },
      create: {
        empresaId,
        shopDomain,
        clientId: parsed.data.clientId,
        clientSecret: parsed.data.clientSecret,
        sucursalEcommerceId: parsed.data.sucursalEcommerceId,
      },
    });

    return reply.code(201).send({ conectado: true, shopDomain: config.shopDomain });
  });

  app.post("/shopify/sync", async (request, reply) => {
    const { empresaId } = request.user;
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Configura Shopify antes de sincronizar" });

    try {
      request.log.info(`[shopify-sync] Iniciando sincronización para empresa ${empresaId} en dominio ${config.shopDomain}`);
      const resultado = await sincronizarProductos(empresaId);
      request.log.info(`[shopify-sync] Completado: ${resultado.productosCreados} creados, ${resultado.productosActualizados} actualizados`);
      return resultado;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido sincronizando con Shopify";
      request.log.error(`[shopify-sync] Error: ${mensaje}`);
      return reply.code(502).send({
        error: mensaje,
        detalles: process.env.NODE_ENV === "development" ? String(err) : undefined
      });
    }
  });

  app.post("/shopify/publicar-producto", async (request, reply) => {
    const { empresaId } = request.user;
    const { productoId } = request.body as { productoId: string };

    if (!productoId) return reply.code(400).send({ error: "falta productoId" });

    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Configura Shopify antes de publicar" });

    const producto = await prisma.producto.findUnique({
      where: { id: productoId },
    });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    if (producto.shopifyProductId) return reply.code(400).send({ error: "Este producto ya está en Shopify" });

    try {
      const { crearProductoEnShopify } = await import("../lib/shopify.js");
      const resultado = await crearProductoEnShopify(producto);
      return resultado;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Error publicando en Shopify" });
    }
  });

  // Importación inicial de productos desde Shopify
  app.post("/shopify/sync-inicial", async (request, reply) => {
    const { empresaId } = request.user;
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Configura Shopify antes de importar" });
    if (!config.accessToken) return reply.code(400).send({ error: "Token de acceso no disponible. Reconecta Shopify." });

    try {
      request.log.info(`[shopify-import] Iniciando importación para empresa ${empresaId}`);

      const { ShopifyImportService } = await import("../lib/shopify-import-service.js");
      const importService = new ShopifyImportService(config.shopDomain, config.accessToken, empresaId);

      const stats = await importService.importarProductosInicial((progress) => {
        request.log.info(`[shopify-import] Progreso: ${progress.productosImportados}/${progress.productosEncontrados} productos`);
      });

      // Actualizar última sincronización
      await prisma.shopifyConfig.update({
        where: { empresaId },
        data: { ultimaSincronizacion: new Date() },
      });

      return reply.code(200).send(stats);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      request.log.error(`[shopify-import] Error: ${mensaje}`);
      return reply.code(502).send({
        error: mensaje,
        detalles: process.env.NODE_ENV === "development" ? String(err) : undefined,
      });
    }
  });

  // Sincronización de inventario (FASE 3)
  app.post("/shopify/sync-inventario", async (request, reply) => {
    const { empresaId } = request.user;
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Configura Shopify antes de sincronizar inventario" });
    if (!config.accessToken) return reply.code(400).send({ error: "Token de acceso no disponible. Reconecta Shopify." });

    try {
      request.log.info(`[shopify-inventory] Iniciando sincronización de inventario para empresa ${empresaId}`);

      const { ShopifyImportService } = await import("../lib/shopify-import-service.js");
      const importService = new ShopifyImportService(config.shopDomain, config.accessToken, empresaId);

      const stats = await importService.importarInventario();

      // Actualizar última sincronización
      await prisma.shopifyConfig.update({
        where: { empresaId },
        data: { ultimaSincronizacion: new Date() },
      });

      return reply.code(200).send(stats);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      request.log.error(`[shopify-inventory] Error: ${mensaje}`);
      return reply.code(502).send({
        error: mensaje,
        detalles: process.env.NODE_ENV === "development" ? String(err) : undefined,
      });
    }
  });

  // Procesar cola de sincronización (FASE 4)
  app.post("/shopify/procesar-cola", async (request, reply) => {
    const { empresaId } = request.user;
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Configura Shopify antes de procesar cola" });

    try {
      request.log.info(`[shopify-queue] Iniciando procesamiento de cola para empresa ${empresaId}`);

      const { ShopifySyncService } = await import("../lib/shopify-sync-service.js");
      const syncService = new ShopifySyncService(empresaId, config.shopDomain, config.accessToken);

      const resultado = await syncService.procesarCola();

      return reply.code(200).send({
        procesados: resultado.procesados,
        errores: resultado.errores,
        timestamp: new Date(),
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      request.log.error(`[shopify-queue] Error: ${mensaje}`);
      return reply.code(502).send({
        error: mensaje,
        detalles: process.env.NODE_ENV === "development" ? String(err) : undefined,
      });
    }
  });

  // Obtener estado de la cola
  app.get("/shopify/cola-estado", async (request, reply) => {
    const { empresaId } = request.user;

    try {
      const { ShopifySyncService } = await import("../lib/shopify-sync-service.js");
      const syncService = new ShopifySyncService(empresaId);

      const estado = await syncService.obtenerEstadoCola();

      return reply.code(200).send(estado);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      request.log.error(`[shopify-queue-status] Error: ${mensaje}`);
      return reply.code(502).send({ error: mensaje });
    }
  });

  // Webhook de Shopify (FASE 4)
  // IMPORTANTE: Este endpoint NO requiere autenticación (es llamado por Shopify)
  app.post<{ Body: Record<string, any> }>("/shopify/webhooks", async (request, reply) => {
    try {
      const payload = request.body;

      // Extraer empresaId del header personalizado o del payload
      // (esto debería configurarse en Shopify con un query param o header seguro)
      const empresaId = (request.headers["x-empresaid"] as string) || null;

      if (!empresaId) {
        request.log.warn(`[shopify-webhook] Webhook recibido sin empresaId`);
        return reply.code(400).send({ error: "empresaId requerido" });
      }

      request.log.info(`[shopify-webhook] Webhook recibido para empresa ${empresaId}`);

      // Verificar que la empresa existe y tiene Shopify configurado
      const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
      if (!config) {
        return reply.code(400).send({ error: "Empresa no tiene Shopify configurado" });
      }

      // Procesar webhook
      const { ShopifySyncService } = await import("../lib/shopify-sync-service.js");
      const syncService = new ShopifySyncService(empresaId);

      await syncService.procesarWebhook({
        type: (request.headers["x-shopify-topic"] as string) || "unknown",
        resourceId: payload.id?.toString() || "unknown",
        resourceGid: payload.admin_graphql_api_id,
        data: payload,
      });

      return reply.code(202).send({ status: "accepted" });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      request.log.error(`[shopify-webhook] Error: ${mensaje}`);
      return reply.code(502).send({
        error: mensaje,
        detalles: process.env.NODE_ENV === "development" ? String(err) : undefined,
      });
    }
  });

  // Callback URL para OAuth2 de Shopify (cuando se implemente flujo con redirección)
  app.get("/shopify/callback", async (request, reply) => {
    const code = (request.query as any).code;
    const state = (request.query as any).state;

    if (!code || !state) {
      return reply.code(400).send({ error: "Parámetros code y state requeridos" });
    }

    // Esta ruta es un placeholder para futuro flujo OAuth2 con redirección.
    // Actualmente se usa un flujo simplificado donde el usuario ingresa
    // manualmente el Client ID y Refresh Token.
    request.log.info(`[shopify-oauth] Callback recibido. State: ${state}`);
    return reply.send({ status: "ok", message: "OAuth callback recibido" });
  });
}
