/**
 * Rutas de pagos y checkout
 */

import type { FastifyInstance } from "fastify";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  obtenerPlanes,
  crearCheckout,
  confirmarPago,
  webhookPago,
  obtenerEstadoPago,
} from "../controllers/checkoutController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const prisma = new PrismaClient();

export async function rutasPagos(fastify: FastifyInstance) {
  // Rutas públicas (sin autenticación)
  fastify.get("/pagos/planes", async (request, reply) => {
    return obtenerPlanes(request, reply);
  });

  // Webhook de Wompi (público)
  fastify.post("/pagos/webhook", async (request, reply) => {
    return webhookPago(request, reply);
  });

  // TEST: Seed de planes de pago (temporal - solo para testing)
  fastify.get("/pagos/seed", async (request, reply) => {
    try {
      const planesExistentes = await prisma.precioPlan.findMany();

      if (planesExistentes.length > 0) {
        return reply.send({
          mensaje: "Los planes ya existen",
          planes: planesExistentes,
        });
      }

      const planes = [
        {
          tipoPlan: "MENSUAL",
          precio: new Decimal(40000),
          descuento: new Decimal(0),
          precioFinal: new Decimal(40000),
          diasDuracion: 30,
          precioXUsuarioAdicional: new Decimal(5000),
          activo: true,
        },
        {
          tipoPlan: "TRIMESTRAL",
          precio: new Decimal(110000),
          descuento: new Decimal(0),
          precioFinal: new Decimal(110000),
          diasDuracion: 90,
          precioXUsuarioAdicional: new Decimal(5000),
          activo: true,
        },
        {
          tipoPlan: "ANUAL",
          precio: new Decimal(360000),
          descuento: new Decimal(0),
          precioFinal: new Decimal(360000),
          diasDuracion: 365,
          precioXUsuarioAdicional: new Decimal(5000),
          activo: true,
        },
      ];

      const planesCreados = [];
      for (const plan of planes) {
        const created = await prisma.precioPlan.create({
          data: plan as any,
        });
        planesCreados.push(created);
      }

      return reply.send({
        mensaje: "✅ Planes creados exitosamente",
        planesCreados,
      });
    } catch (error: any) {
      return reply.status(500).send({
        error: "Error creando planes",
        detalle: error?.message,
      });
    }
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
