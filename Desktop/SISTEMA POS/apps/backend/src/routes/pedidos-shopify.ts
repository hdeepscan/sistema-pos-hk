import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function pedidosShopifyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Centro de notificaciones: historial de pedidos de Shopify detectados.
  app.get("/pedidos-shopify", async (request) => {
    const { empresaId } = request.user;
    const { atendido, limit } = request.query as { atendido?: string; limit?: string };

    const pedidos = await prisma.pedidoShopifyNotificacion.findMany({
      where: {
        empresaId,
        ...(atendido !== undefined ? { atendido: atendido === "true" } : {}),
      },
      orderBy: { fechaPedido: "desc" },
      take: Math.min(Number(limit) || 50, 200),
    });

    return pedidos.map((p) => ({ ...p, productos: JSON.parse(p.productos) as { nombre: string; cantidad: number }[] }));
  });

  app.get("/pedidos-shopify/resumen", async (request) => {
    const { empresaId } = request.user;
    const pendientes = await prisma.pedidoShopifyNotificacion.count({ where: { empresaId, atendido: false } });
    return { pendientes };
  });

  app.patch("/pedidos-shopify/:id/atender", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const pedido = await prisma.pedidoShopifyNotificacion.findFirst({ where: { id, empresaId } });
    if (!pedido) return reply.code(404).send({ error: "Pedido no encontrado" });

    const actualizado = await prisma.pedidoShopifyNotificacion.update({
      where: { id },
      data: { atendido: true, fechaAtendido: new Date() },
    });
    return { ...actualizado, productos: JSON.parse(actualizado.productos) };
  });
}
