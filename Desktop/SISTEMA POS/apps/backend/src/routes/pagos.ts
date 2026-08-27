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
import { autenticarMiddleware } from "../middleware/autenticar.js";
import { validarLicensiaMiddleware } from "../middleware/licenseMiddleware.js";

export async function rutasPagos(fastify: FastifyInstance) {
  // Rutas públicas (sin autenticación)
  fastify.get("/pagos/planes", async (request, reply) => {
    return obtenerPlanes(request, reply);
  });

  // Webhook de PayU (público)
  fastify.post("/pagos/webhook", async (request, reply) => {
    return webhookPago(request, reply);
  });

  // Rutas protegidas (requieren autenticación)
  fastify.post(
    "/checkout/crear",
    { preHandler: autenticarMiddleware },
    async (request, reply) => {
      return crearCheckout(request, reply);
    }
  );

  fastify.post(
    "/checkout/confirmar",
    { preHandler: autenticarMiddleware },
    async (request, reply) => {
      return confirmarPago(request, reply);
    }
  );

  fastify.get(
    "/pagos/estado/:referenciaPago",
    { preHandler: autenticarMiddleware },
    async (request, reply) => {
      return obtenerEstadoPago(request, reply);
    }
  );
}
