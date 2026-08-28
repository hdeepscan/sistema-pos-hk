/**
 * Rutas de pagos y checkout
 */

import type { FastifyInstance } from "fastify";
import axios from "axios";
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

  // TEST: Intentar crear transacción de prueba en Wompi
  fastify.post("/pagos/test-wompi-transaction", async (request, reply) => {
    try {
      const privateKey = process.env.WOMPI_PRIVATE_KEY;

      const testData = {
        amount_in_cents: 4000000, // $40,000 COP
        currency: "COP",
        customer_email: "test@example.com",
        reference: `TEST-${Date.now()}`,
        description: "Test transaction",
        redirect_url: `${process.env.API_URL || "http://localhost:4000"}/api/checkout/confirmar`,
      };

      console.log("📨 Intentando transacción de prueba con datos:", testData);

      const response = await axios.post("https://api.wompi.co/v1/transactions", testData, {
        headers: {
          Authorization: `Bearer ${privateKey}`,
          "Content-Type": "application/json",
        },
      });

      return reply.send({
        success: true,
        wompiResponse: response.data,
      });
    } catch (error: any) {
      console.error("❌ Error en transacción de prueba:", error?.response?.data || error?.message);
      return reply.status(500).send({
        error: "Error en transacción de prueba",
        wompiError: error?.response?.data,
        status: error?.response?.status,
        message: error?.message,
      });
    }
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
