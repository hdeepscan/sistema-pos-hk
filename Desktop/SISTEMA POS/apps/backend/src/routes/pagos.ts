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

  // TEST: Verificar credenciales de Wompi
  fastify.get("/pagos/test-wompi", async (request, reply) => {
    const publicKey = process.env.WOMPI_PUBLIC_KEY;
    const privateKey = process.env.WOMPI_PRIVATE_KEY;

    return reply.send({
      hasPublicKey: !!publicKey,
      hasPrivateKey: !!privateKey,
      publicKeyLength: publicKey?.length || 0,
      privateKeyLength: privateKey?.length || 0,
      publicKeyPrefix: publicKey ? publicKey.substring(0, 10) + "..." : "N/A",
      privateKeyPrefix: privateKey ? privateKey.substring(0, 10) + "..." : "N/A",
    });
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
