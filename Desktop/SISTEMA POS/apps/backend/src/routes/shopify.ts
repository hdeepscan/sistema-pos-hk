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
      const resultado = await sincronizarProductos(empresaId);
      return resultado;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Error sincronizando con Shopify" });
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
      const resultado = await crearProductoEnShopify(empresaId, producto);
      return resultado;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Error publicando en Shopify" });
    }
  });
}
