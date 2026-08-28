/**
 * Rutas de pagos y checkout
 */

import type { FastifyInstance } from "fastify";
import {
  obtenerPlanes,
  crearCheckout,
  confirmarPago,
  webhookPago,
  obtenerEstadoPago,
} from "../controllers/checkoutController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export async function rutasPagos(fastify: FastifyInstance) {
  // Rutas públicas (sin autenticación)
  fastify.get("/pagos/planes", async (request, reply) => {
    return obtenerPlanes(request, reply);
  });

  // Webhook de Wompi (público)
  fastify.post("/pagos/webhook", async (request, reply) => {
    return webhookPago(request, reply);
  });

  // Crear checkout (público - funciona para registro y usuarios autenticados)
  fastify.post("/checkout/crear", async (request, reply) => {
    return crearCheckout(request, reply);
  });

  // Obtener estado de pago (público - necesario para flujo de registro)
  fastify.get("/pagos/estado/:referenciaPago", async (request, reply) => {
    return obtenerEstadoPago(request, reply);
  });

  // Rutas protegidas (requieren autenticación)
  fastify.post(
    "/checkout/confirmar",
    { preHandler: authMiddleware },
    async (request, reply) => {
      return confirmarPago(request, reply);
    }
  );
}
