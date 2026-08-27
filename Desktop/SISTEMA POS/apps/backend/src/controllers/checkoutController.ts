/**
 * Controller para manejo de checkout y pagos
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { payuService } from "../services/payuService.js";
import { crearLicenciaPagada, registrarPago } from "../services/licenseService.js";

const prisma = new PrismaClient();

/**
 * GET /api/checkout/planes
 * Obtener lista de planes disponibles
 */
export async function obtenerPlanes(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const planes = await prisma.precioPlan.findMany({
      orderBy: { diasDuracion: "asc" },
    });

    return reply.send({
      success: true,
      planes: planes.map((p) => ({
        tipoPlan: p.tipoPlan,
        precio: Number(p.precio),
        descuento: Number(p.descuento),
        precioFinal: Number(p.precioFinal),
        diasDuracion: p.diasDuracion,
        precioXUsuarioAdicional: Number(p.precioXUsuarioAdicional),
      })),
    });
  } catch (error) {
    console.error("Error obteniendo planes:", error);
    return reply.status(500).send({
      error: "Error al obtener planes",
    });
  }
}

/**
 * POST /api/checkout/crear
 * Crear una orden de pago
 */
export async function crearCheckout(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const usuario = (request as any).usuario;
    const empresaId = (request as any).empresaId;

    if (!usuario || !empresaId) {
      return reply.status(401).send({ error: "No autenticado" });
    }

    const {
      tipoPlan,
      usuariosAdicionales = 0,
    }: {
      tipoPlan: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
      usuariosAdicionales?: number;
    } = request.body as any;

    // Validar plan
    if (!["MENSUAL", "TRIMESTRAL", "ANUAL"].includes(tipoPlan)) {
      return reply.status(400).send({ error: "Plan inválido" });
    }

    // Obtener precio del plan
    const precioPlan = await prisma.precioPlan.findUnique({
      where: { tipoPlan },
    });

    if (!precioPlan) {
      return reply.status(404).send({ error: "Plan no encontrado" });
    }

    // Calcular monto total
    const precioFinal = typeof precioPlan.precioFinal === "number"
      ? precioPlan.precioFinal
      : Number(precioPlan.precioFinal);
    const precioXUsuario = typeof precioPlan.precioXUsuarioAdicional === "number"
      ? precioPlan.precioXUsuarioAdicional
      : Number(precioPlan.precioXUsuarioAdicional);
    const montoTotal = precioFinal + (usuariosAdicionales * precioXUsuario);

    // Obtener datos de la empresa
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
    });

    if (!empresa) {
      return reply.status(404).send({ error: "Empresa no encontrada" });
    }

    // Crear orden de pago
    const referenciaPago = `POS-${empresaId}-${Date.now()}`;

    const checkoutData = await payuService.crearOrdenPago({
      empresaId,
      referenciaPago,
      tipoPlan,
      monto: montoTotal,
      usuariosAdicionales,
      email: usuario.email,
      nombre: usuario.nombre,
      telefono: usuario.telefono,
    });

    // Guardar referencia de pago en base de datos (estado PENDIENTE)
    const pago = await prisma.pago.create({
      data: {
        empresaId,
        referenciaPago,
        estado: "PENDIENTE",
        monto: montoTotal,
        tipoPlan,
        usuariosAdicionales,
      },
    });

    return reply.send({
      success: true,
      checkout: {
        url: checkoutData.url,
        referenciaPago: checkoutData.referenciaPago,
        monto: checkoutData.monto,
        tipoPlan: checkoutData.tipoPlan,
      },
    });
  } catch (error) {
    console.error("Error creando checkout:", error);
    return reply.status(500).send({
      error: "Error al crear checkout",
    });
  }
}

/**
 * POST /api/checkout/confirmar
 * Confirmación de pago (redirect desde PayU)
 * Este endpoint recibe los datos cuando el usuario vuelve de PayU
 */
export async function confirmarPago(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const {
      reference_sale,
      state,
      transaction_id,
      value,
      email,
      extra1,
    } = request.body as any;

    console.log(`📨 Confirmación de pago: ${reference_sale} - Estado: ${state}`);

    // Procesar webhook
    const esAprobado = await payuService.procesarWebhook(request.body);

    if (!esAprobado) {
      return reply.status(400).send({
        error: "Pago rechazado o pendiente",
        referenciaPago: reference_sale,
      });
    }

    // Parsear datos adicionales
    let empresaId = "";
    let tipoPlan = "";
    let usuariosAdicionales = 0;

    try {
      const extraData = JSON.parse(extra1);
      empresaId = extraData.empresaId;
      tipoPlan = extraData.tipoPlan;
      usuariosAdicionales = extraData.usuariosAdicionales || 0;
    } catch {
      console.error("Error parseando extra1:", extra1);
    }

    if (!empresaId || !tipoPlan) {
      return reply.status(400).send({
        error: "Datos de pago incompletos",
      });
    }

    // Actualizar pago a COMPLETADO
    await prisma.pago.update({
      where: { referenciaPago: reference_sale },
      data: {
        estado: "COMPLETADO",
        transaccionId: transaction_id,
        fechaPago: new Date(),
      },
    });

    // Crear/Actualizar licencia
    await crearLicenciaPagada(
      empresaId,
      tipoPlan as "MENSUAL" | "TRIMESTRAL" | "ANUAL",
      usuariosAdicionales
    );

    console.log(`✓ Licencia activada para empresa: ${empresaId}`);

    return reply.send({
      success: true,
      message: "Pago confirmado",
      referenciaPago: reference_sale,
    });
  } catch (error) {
    console.error("Error confirmando pago:", error);
    return reply.status(500).send({
      error: "Error al confirmar pago",
    });
  }
}

/**
 * POST /api/pagos/webhook
 * Webhook de confirmación de PayU
 * PayU envía confirmación de pago a este endpoint
 */
export async function webhookPago(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const {
      reference_sale,
      state,
      transaction_id,
      value,
      currency,
      merchant_id,
      signature,
      extra1,
    } = request.body as any;

    console.log(
      `📨 Webhook PayU recibido: ${reference_sale} - Estado: ${state}`
    );

    // Validar firma (opcional pero recomendado)
    if (signature) {
      const esValido = payuService.validarSignatureWebhook(
        signature,
        reference_sale,
        value,
        state,
        currency
      );

      if (!esValido) {
        console.warn("⚠️ Signature inválido en webhook");
        // Continuar de todas formas pero logged
      }
    }

    // Procesar webhook
    const esAprobado = await payuService.procesarWebhook(request.body);

    // Buscar el pago
    const pago = await prisma.pago.findUnique({
      where: { referenciaPago: reference_sale },
    });

    if (!pago) {
      console.warn(`⚠️ Pago no encontrado: ${reference_sale}`);
      return reply.status(404).send({ error: "Pago no encontrado" });
    }

    if (esAprobado && pago.estado === "PENDIENTE") {
      // Actualizar pago a COMPLETADO
      await prisma.pago.update({
        where: { referenciaPago: reference_sale },
        data: {
          estado: "COMPLETADO",
          transaccionId: transaction_id,
          fechaPago: new Date(),
        },
      });

      // Crear/Actualizar licencia
      await crearLicenciaPagada(
        pago.empresaId,
        pago.tipoPlan as "MENSUAL" | "TRIMESTRAL" | "ANUAL",
        pago.usuariosAdicionales || 0
      );

      console.log(`✓ Licencia activada por webhook: ${pago.empresaId}`);
    } else if (!esAprobado) {
      // Marcar como fallido
      await prisma.pago.update({
        where: { referenciaPago: reference_sale },
        data: {
          estado: "FALLIDO",
          transaccionId: transaction_id,
        },
      });

      console.log(`✗ Pago rechazado: ${reference_sale}`);
    }

    // PayU espera respuesta OK
    return reply.send("PROCESADO");
  } catch (error) {
    console.error("Error procesando webhook:", error);
    return reply.status(500).send({ error: "Error procesando webhook" });
  }
}

/**
 * GET /api/pagos/estado/:referenciaPago
 * Obtener estado de un pago
 */
export async function obtenerEstadoPago(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { referenciaPago } = request.params as any;
    const usuario = (request as any).usuario;

    if (!usuario) {
      return reply.status(401).send({ error: "No autenticado" });
    }

    const pago = await prisma.pago.findUnique({
      where: { referenciaPago },
    });

    if (!pago) {
      return reply.status(404).send({ error: "Pago no encontrado" });
    }

    // Verificar que el usuario sea dueño de la empresa
    if (pago.empresaId !== (request as any).empresaId) {
      return reply.status(403).send({ error: "No autorizado" });
    }

    return reply.send({
      referenciaPago: pago.referenciaPago,
      estado: pago.estado,
      monto: pago.monto,
      tipoPlan: pago.tipoPlan,
      fechaPago: pago.fechaPago,
    });
  } catch (error) {
    console.error("Error obteniendo estado de pago:", error);
    return reply.status(500).send({
      error: "Error al obtener estado de pago",
    });
  }
}
