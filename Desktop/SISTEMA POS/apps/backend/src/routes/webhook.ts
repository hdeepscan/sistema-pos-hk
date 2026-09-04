import type { FastifyInstance } from "fastify";
import { webhookWompi } from "../controllers/webhookController.js";

export async function rutasWebhook(fastify: FastifyInstance) {
  /**
   * POST /api/wompi-webhook
   * Webhook público que recibe notificaciones de Wompi
   * Wompi envía notificaciones cuando hay cambios en transacciones
   */
  fastify.post("/api/wompi-webhook", async (request, reply) => {
    return webhookWompi(request, reply);
  });
}
