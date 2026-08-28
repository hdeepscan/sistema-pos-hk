import type { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { wompiService } from "../services/wompiService.js";
import { enviarEmailBienvenida } from "../services/emailService.js";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * POST /api/wompi-webhook
 * Recibe notificaciones de Wompi cuando hay un pago
 * Wompi envía: { event: "transaction.updated", data: { ... } }
 */
export async function webhookWompi(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as any;
    const { event, data } = body;

    console.log("📨 Webhook Wompi recibido:", event);

    // Validar firma del webhook (opcional pero recomendado)
    const signature = (request.headers["x-signature"] as string) || "";
    if (!validarSignatureWebhook(body, signature)) {
      console.warn("⚠️ Signature inválida en webhook");
      // Por ahora, continúa igualmente para debugging
    }

    // Solo procesar transacciones aprobadas
    if (event === "transaction.updated" && data?.status === "APPROVED") {
      await procesarPagoAprobado(data);
    }

    // Wompi espera un 200 OK
    return reply.send({ received: true });
  } catch (error) {
    console.error("❌ Error en webhook Wompi:", error);
    return reply.status(500).send({ error: "Error procesando webhook" });
  }
}

/**
 * Procesar pago aprobado: Crear empresa, usuario y enviar email
 */
async function procesarPagoAprobado(transaccion: any) {
  try {
    const { reference, amount_in_cents, customer_email, metadata } = transaccion;

    console.log(`💰 Procesando pago aprobado: ${reference}`);

    // Recuperar el pago pendiente de la BD
    const pago = await prisma.pago.findUnique({
      where: { referenciaPago: reference },
    });

    if (!pago) {
      console.warn(`⚠️ Pago no encontrado: ${reference}`);
      return;
    }

    // Si el pago ya fue procesado, no hacer nada
    if (pago.estado === "COMPLETADO") {
      console.log(`ℹ️ Pago ya procesado: ${reference}`);
      return;
    }

    // Recuperar datos de registro desde localStorage del cliente (enviado en metadata)
    // NOTA: En producción, estos datos deberían estar guardados en una tabla temporal
    const datosRegistro = metadata || {};

    // Extraer datos de transacción de Wompi
    const empresaNombre = datosRegistro?.empresaNombre || "Mi Empresa";
    const adminNombre = datosRegistro?.adminNombre || "Admin";
    const adminEmail = customer_email || datosRegistro?.adminEmail || "no-email@example.com";
    const adminPassword = datosRegistro?.adminPassword || generarPasswordTemporal();
    const tipoPlan = datosRegistro?.tipoPlan || pago?.tipoPlan || "MENSUAL";

    console.log(`📝 Creando empresa: ${empresaNombre}`);
    console.log(`👤 Admin: ${adminNombre} (${adminEmail})`);
    console.log(`💳 Plan: ${tipoPlan}`);
    console.log(`📊 Pago encontrado en BD:`, pago ? { estado: pago.estado, tipoPlan: pago.tipoPlan } : "NO ENCONTRADO");

    // Calcular fecha de vencimiento según el plan
    const fechaVencimiento = calcularFechaVencimiento(tipoPlan);
    console.log(`📅 Fecha de vencimiento: ${fechaVencimiento.toISOString().split("T")[0]}`);

    // 1. Crear la empresa CON fechaVencimiento
    const empresa = await prisma.empresa.create({
      data: {
        nombre: empresaNombre,
        plan: tipoPlan,
        planSuscripcion: tipoPlan,
        fechaVencimiento,
        activo: true,
      },
    });

    console.log(`✅ Empresa creada: ${empresa.id}`);

    // 2. Hashear contraseña
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // 3. Crear usuario admin
    const usuario = await prisma.usuario.create({
      data: {
        empresaId: empresa.id,
        nombre: adminNombre,
        email: adminEmail,
        passwordHash,
        rol: "ADMIN",
        activo: true,
        permisos: [
          "crear_venta",
          "editar_venta",
          "eliminar_venta",
          "ver_reportes",
          "gestionar_usuarios",
        ],
      },
    });

    console.log(`✅ Usuario creado: ${usuario.id}`);

    // 4. Actualizar pago a COMPLETADO
    await prisma.pago.update({
      where: { referenciaPago: reference },
      data: {
        empresaId: empresa.id,
        estado: "COMPLETADO",
        transaccionId: transaccion.id,
        fechaPago: new Date(),
      },
    });

    console.log(`✅ Pago actualizado: COMPLETADO`);

    // 5. Crear sucursal por defecto
    await prisma.sucursal.create({
      data: {
        empresaId: empresa.id,
        nombre: "Sucursal Principal",
        tipo: "FISICA",
        activo: true,
      },
    });

    console.log(`✅ Sucursal creada`);

    // 6. Enviar email con credenciales
    try {
      console.log(`📧 Intentando enviar email a: ${adminEmail}`);
      await enviarEmailBienvenida(
        adminEmail,
        empresaNombre,
        adminNombre,
        adminPassword
      );
      console.log(`✉️ Email enviado exitosamente`);
    } catch (emailError: any) {
      console.error("⚠️ Error enviando email:", {
        mensaje: emailError?.message,
        codigo: emailError?.code,
        stack: emailError?.stack?.substring(0, 200),
      });
      // No fallar el webhook si falla el email
    }

    console.log(`🎉 Registro completado para: ${empresaNombre} (${adminEmail})`);
  } catch (error: any) {
    console.error("❌ Error CRÍTICO procesando pago aprobado:", {
      mensaje: error?.message,
      codigo: error?.code,
      stack: error?.stack?.substring(0, 300),
      reference: transaccion?.reference || "DESCONOCIDA",
    });
    throw error;
  }
}

/**
 * Generar contraseña temporal segura
 */
function generarPasswordTemporal(): string {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

/**
 * Calcular fecha de vencimiento según el tipo de plan
 */
function calcularFechaVencimiento(tipoPlan: string): Date {
  const ahora = new Date();

  if (tipoPlan === "TRIAL_5D") {
    ahora.setDate(ahora.getDate() + 5);
    console.log("⏰ Plan TRIAL: +5 días");
  } else if (tipoPlan === "MENSUAL") {
    ahora.setDate(ahora.getDate() + 30);
    console.log("📅 Plan MENSUAL: +30 días");
  } else if (tipoPlan === "TRIMESTRAL") {
    ahora.setDate(ahora.getDate() + 90);
    console.log("📅 Plan TRIMESTRAL: +90 días");
  } else if (tipoPlan === "ANUAL") {
    ahora.setFullYear(ahora.getFullYear() + 1);
    console.log("📅 Plan ANUAL: +1 año (365 días)");
  }

  return ahora;
}

/**
 * Validar firma del webhook (HMAC-SHA256)
 */
function validarSignatureWebhook(payload: any, signature: string): boolean {
  try {
    const secret = process.env.WOMPI_INTEGRITY_SECRET || "";
    if (!secret) {
      console.warn("⚠️ WOMPI_INTEGRITY_SECRET no configurada");
      return false;
    }

    const payloadString = JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payloadString)
      .digest("hex");

    return signature === expectedSignature;
  } catch (error) {
    console.error("Error validando signature:", error);
    return false;
  }
}
