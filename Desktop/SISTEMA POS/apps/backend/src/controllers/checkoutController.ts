/**
 * Controller para manejo de checkout y pagos
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { wompiService } from "../services/wompiService.js";
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
 * Funciona en dos modos:
 * 1. Autenticado: usuario existente con empresaId
 * 2. Registro: nuevo usuario sin autenticación, envía email y nombre
 */
export async function crearCheckout(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const usuario = (request as any).usuario;
    const empresaId = (request as any).empresaId;
    const { tipoPlan, usuariosAdicionales = 0, email, nombre, isRegistration } = request.body as any;

    // Validar plan
    if (!["MENSUAL", "TRIMESTRAL", "ANUAL"].includes(tipoPlan)) {
      return reply.status(400).send({ error: "Plan inválido" });
    }

    // Modo registro: validar email y nombre
    let userEmail = usuario?.email;
    let userName = usuario?.nombre;
    let actualEmpresaId = empresaId;

    if (isRegistration) {
      // Flujo de registro: no hay usuario autenticado
      if (!email || !nombre) {
        return reply.status(400).send({ error: "Email y nombre requeridos para registro" });
      }
      userEmail = email;
      userName = nombre;
      // En modo registro, generar un ID temporal para la empresa
      actualEmpresaId = `temp-${Date.now()}`;
    } else {
      // Flujo normal: verificar que esté autenticado
      if (!usuario || !empresaId) {
        return reply.status(401).send({ error: "No autenticado" });
      }

      // Obtener datos de la empresa
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
      });

      if (!empresa) {
        return reply.status(404).send({ error: "Empresa no encontrada" });
      }
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

    // Crear orden de pago
    const referenciaPago = `POS-${actualEmpresaId}-${Date.now()}`;

    const checkoutData = await wompiService.crearOrdenPago({
      empresaId: actualEmpresaId,
      referenciaPago,
      tipoPlan,
      monto: montoTotal,
      usuariosAdicionales,
      email: userEmail,
      nombre: userName,
      telefono: "",
    });

    // Guardar referencia de pago en base de datos (estado PENDIENTE)
    // En modo registro, usar null para empresaId (se asociará después)
    const pago = await prisma.pago.create({
      data: {
        empresaId: isRegistration ? null : actualEmpresaId,
        referenciaPago,
        estado: "PENDIENTE",
        monto: montoTotal,
        tipoPlan,
        usuariosAdicionales,
        // Guardar email para identificar el pago en modo registro
        email: userEmail,
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
  } catch (error: any) {
    console.error("Error creando checkout:", error?.response?.data || error?.message || error);
    return reply.status(500).send({
      error: "Error al crear checkout",
      detalles: error?.response?.data?.message || error?.message || "Error desconocido",
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
    const esAprobado = await wompiService.procesarWebhook(request.body);

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

    // Validar firma Wompi (opcional pero recomendado)
    // Wompi usa HMAC-SHA256 con timestamp y body
    // Por ahora confiamos en HTTPS y procesamos

    // Procesar webhook
    const esAprobado = await wompiService.procesarWebhook(request.body);

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
 * Público: funciona para usuarios autenticados y en flujo de registro
 * La referenciaPago es suficientemente única como para no exponer información sensible
 */
export async function obtenerEstadoPago(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { referenciaPago } = request.params as any;
    const usuario = (request as any).usuario;
    const empresaId = (request as any).empresaId;

    const pago = await prisma.pago.findUnique({
      where: { referenciaPago },
    });

    if (!pago) {
      return reply.status(404).send({ error: "Pago no encontrado" });
    }

    // Validar acceso:
    // 1. Si está autenticado, solo puede ver pagos de su empresa
    // 2. Si no está autenticado, puede ver cualquier pago (flujo de registro)
    if (usuario && empresaId) {
      if (pago.empresaId && pago.empresaId !== empresaId) {
        return reply.status(403).send({ error: "No autorizado" });
      }
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
