import type { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { enviarEmailBienvenida } from "../services/emailService.js";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * POST /api/wompi-webhook (y /api/pagos/webhook)
 * Solo procesa eventos firmados por Wompi. Sin firma válida no se toca la base de datos.
 */
export async function webhookWompi(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as any;
    const { event, data, signature } = body;
    const transaction = data?.transaction || data;

    if (!validarSignatureWebhook(body, signature)) {
      console.error("🚫 Webhook Wompi rechazado: firma inválida");
      return reply.status(401).send({ error: "Firma inválida" });
    }

    if (event === "transaction.updated" && transaction?.status === "APPROVED") {
      await procesarPagoAprobado(transaction);
    }

    return reply.send({ received: true });
  } catch (error) {
    console.error("❌ Error en webhook Wompi:", error);
    return reply.status(500).send({ error: "Error procesando webhook" });
  }
}

async function procesarPagoAprobado(transaccion: any) {
  const { reference, amount_in_cents, id } = transaccion;

  const pago = await prisma.pago.findUnique({ where: { referenciaPago: reference } });
  if (!pago) {
    console.warn(`⚠️ Pago no encontrado: ${reference}`);
    return;
  }

  if (Number(amount_in_cents) !== Math.round(Number(pago.monto) * 100)) {
    throw new Error(`Monto no coincide para ${reference}: recibido ${amount_in_cents}`);
  }

  // Reclamo atómico: solo un webhook procesa un pago PENDIENTE (idempotencia ante reintentos de Wompi)
  const reclamado = await prisma.pago.updateMany({
    where: { referenciaPago: reference, estado: "PENDIENTE" },
    data: { estado: "COMPLETADO", transaccionId: id, fechaPago: new Date() },
  });
  if (reclamado.count === 0) {
    console.log(`ℹ️ Pago ya procesado: ${reference}`);
    return;
  }

  try {
    const datosRegistro = pago.datosRegistro ? JSON.parse(pago.datosRegistro) : {};

    if (datosRegistro.tipoCompra === "USUARIOS_ADICIONALES") {
      await procesarUsuariosAdicionales(pago.empresaId, datosRegistro);
      return;
    }

    const esRenovacion = !!pago.empresaId && !pago.empresaId.startsWith("temp-");
    if (esRenovacion) {
      await prisma.empresa.update({
        where: { id: pago.empresaId! },
        data: {
          planSuscripcion: pago.tipoPlan,
          plan: pago.tipoPlan,
          fechaVencimiento: calcularFechaVencimiento(pago.tipoPlan),
          estado: "activa",
        },
      });
      return;
    }

    await crearEmpresaDesdeRegistro(pago.referenciaPago, datosRegistro, pago.tipoPlan);
  } catch (error) {
    await prisma.pago.updateMany({
      where: { referenciaPago: reference, estado: "COMPLETADO", transaccionId: id },
      data: { estado: "PENDIENTE", transaccionId: null, fechaPago: null },
    });
    throw error;
  }
}

async function procesarUsuariosAdicionales(empresaId: string | null, datosRegistro: any) {
  const cantidadUsuarios = Number(datosRegistro.cantidadUsuarios) || 0;
  if (!empresaId || cantidadUsuarios < 1) return;

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { limiteUsuarios: { increment: cantidadUsuarios } },
  });

  const du = datosRegistro.datosUsuario;
  if (du?.nombre && du?.email && du?.passwordHash) {
    try {
      await prisma.usuario.create({
        data: {
          empresaId,
          nombre: du.nombre,
          email: du.email,
          passwordHash: du.passwordHash,
          rol: du.rol || "CAJERO",
          permisos: du.permisos || [],
          activo: true,
        },
      });
    } catch (error: any) {
      console.error("⚠️ Pago confirmado pero no se pudo crear el usuario adicional:", {
        email: du.email,
        mensaje: error?.message,
      });
    }
  }
}

async function crearEmpresaDesdeRegistro(referenciaPago: string, datosRegistro: any, tipoPlanPago: string) {
  const { empresaNombre, adminNombre, adminEmail, adminPasswordHash } = datosRegistro;
  if (!empresaNombre || !adminNombre || !adminEmail || !adminPasswordHash) {
    throw new Error(`Datos de registro incompletos para ${referenciaPago}`);
  }
  if (await prisma.usuario.findUnique({ where: { email: adminEmail } })) {
    throw new Error(`El email ${adminEmail} ya está registrado (pago ${referenciaPago})`);
  }

  const tipoPlan = datosRegistro.tipoPlan || tipoPlanPago;

  const empresa = await prisma.$transaction(async (tx) => {
    const nuevaEmpresa = await tx.empresa.create({
      data: {
        nombre: empresaNombre,
        plan: tipoPlan,
        planSuscripcion: tipoPlan,
        fechaVencimiento: calcularFechaVencimiento(tipoPlan),
        activo: true,
      },
    });
    await tx.usuario.create({
      data: {
        empresaId: nuevaEmpresa.id,
        nombre: adminNombre,
        email: adminEmail,
        passwordHash: adminPasswordHash,
        rol: "ADMIN",
        activo: true,
        permisos: [],
      },
    });
    await tx.sucursal.create({
      data: { empresaId: nuevaEmpresa.id, nombre: "Sucursal Principal", tipo: "FISICA", activo: true },
    });
    return nuevaEmpresa;
  });

  await prisma.pago.update({
    where: { referenciaPago },
    data: { empresaId: empresa.id },
  });

  try {
    await enviarEmailBienvenida(adminEmail, empresaNombre, adminNombre);
  } catch (error: any) {
    console.error("⚠️ Cuenta creada pero falló el correo de bienvenida:", { email: adminEmail, mensaje: error?.message });
  }
}

/**
 * Calcular fecha de vencimiento según el tipo de plan
 */
function calcularFechaVencimiento(tipoPlan: string): Date {
  const ahora = new Date();

  if (tipoPlan === "TRIAL_5D") {
    ahora.setDate(ahora.getDate() + 5);
  } else if (tipoPlan === "MENSUAL") {
    ahora.setDate(ahora.getDate() + 30);
  } else if (tipoPlan === "TRIMESTRAL") {
    ahora.setDate(ahora.getDate() + 90);
  } else if (tipoPlan === "ANUAL") {
    ahora.setFullYear(ahora.getFullYear() + 1);
  }

  return ahora;
}

/**
 * Validar firma del webhook de Wompi
 * Hash = SHA256(property1_value + property2_value + ... + timestamp + WOMPI_EVENTS_SECRET)
 */
function validarSignatureWebhook(payload: any, signatureObj: any): boolean {
  try {
    const eventsSecret = process.env.WOMPI_EVENTS_SECRET || "";
    if (!eventsSecret) {
      console.error("⚠️ WOMPI_EVENTS_SECRET no configurada - no se pueden validar webhooks");
      return false;
    }

    if (!signatureObj?.checksum || !Array.isArray(signatureObj?.properties) || !payload?.data || !payload?.timestamp) {
      return false;
    }

    const { timestamp } = payload;
    const { properties, checksum } = signatureObj;
    const transaction = payload.data?.transaction || payload.data;

    let dataToSign = "";
    for (const prop of properties) {
      const key = String(prop).replace("transaction.", "");
      const value = transaction?.[key];
      if (value === undefined) return false;
      dataToSign += value;
    }

    dataToSign += timestamp + eventsSecret;

    const calculado = crypto.createHash("sha256").update(dataToSign).digest("hex");
    return checksum === calculado;
  } catch (error) {
    console.error("❌ Error validando firma del webhook:", error);
    return false;
  }
}
