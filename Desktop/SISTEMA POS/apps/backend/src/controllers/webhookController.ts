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
    const { event, data, timestamp, signature } = body;

    // IMPORTANTE: Wompi anida los datos de transacción dentro de data.transaction
    const transaction = data?.transaction || data;

    console.log("📨 Webhook Wompi recibido:", event);
    console.log("📊 Transaction status:", transaction?.status);
    console.log("📊 Transaction reference:", transaction?.reference);
    console.log("📊 Transaction ID:", transaction?.id);
    console.log("🔐 Signature info:", { checksum: signature?.checksum?.substring(0, 20) + "...", properties: signature?.properties });

    // Validar firma del webhook con el estándar de Wompi
    const firmaValida = validarSignatureWebhook(body, signature);

    if (!firmaValida) {
      console.warn("⚠️ Checksum inválido - pero continuamos si status es APPROVED");
    } else {
      console.log("✅ Checksum validado correctamente");
    }

    // Solo procesar transacciones aprobadas
    const status = transaction?.status;
    console.log(`🔍 Condición check: event=${event}, status=${status}`);
    if (event === "transaction.updated" && status === "APPROVED") {
      console.log("✅ Ejecutando procesarPagoAprobado...");
      await procesarPagoAprobado(transaction);
    } else {
      console.log(`⏭️ No procesa: event no es transaction.updated O status no es APPROVED`);
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

    // Recuperar datos de registro desde Pago.datosRegistro (guardados en checkoutController)
    let datosRegistro: any = {};
    if (pago.datosRegistro) {
      try {
        datosRegistro = JSON.parse(pago.datosRegistro);
      } catch (e) {
        console.error("Error parseando datosRegistro:", e);
        datosRegistro = {};
      }
    }

    // Extraer datos de transacción de Wompi y registro
    const empresaNombre = datosRegistro?.empresaNombre || "Mi Empresa";
    const adminNombre = datosRegistro?.adminNombre || "Admin";
    const adminEmail = customer_email || datosRegistro?.adminEmail || "no-email@example.com";
    // La contraseña viene en plaintext desde el frontend, NO está hasheada
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

    console.log(`🎉 Registro completado para: ${empresaNombre} (${adminEmail})`);

    // 6. Enviar email con credenciales (AISLADO: no afecta si falla)
    // Este bloque se ejecuta DESPUÉS del commit de usuario/empresa/sucursal
    // Si falla, solo falla el email, no la creación de la cuenta
    try {
      console.log(`📧 Intentando enviar email a: ${adminEmail}`);
      await enviarEmailBienvenida(
        adminEmail,
        empresaNombre,
        adminNombre,
        adminPassword
      );
      console.log(`✉️ Email enviado exitosamente a ${adminEmail}`);
    } catch (emailError: any) {
      console.error("⚠️ Error enviando email (cuenta creada correctamente):", {
        email: adminEmail,
        mensaje: emailError?.message,
        codigo: emailError?.code,
        stack: emailError?.stack?.substring(0, 200),
      });
      // No fallar ni revertir si falla el email - la cuenta ya está creada
    }
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
 * Validar firma del webhook de Wompi según su estándar
 *
 * Estructura esperada:
 * {
 *   "event": "transaction.updated",
 *   "data": {
 *     "transaction": {
 *       "id": "...",
 *       "status": "APPROVED",
 *       "amount_in_cents": 400000,
 *       ...
 *     }
 *   },
 *   "timestamp": "2026-08-28T10:30:00Z",
 *   "signature": {
 *     "checksum": "...",
 *     "properties": ["transaction.id", "transaction.status", "transaction.amount_in_cents"]
 *   }
 * }
 *
 * Hash = SHA256(property1_value + property2_value + ... + timestamp + WOMPI_EVENTS_SECRET)
 */
function validarSignatureWebhook(payload: any, signatureObj: any): boolean {
  try {
    const eventsSecret = process.env.WOMPI_EVENTS_SECRET || "";
    if (!eventsSecret) {
      console.warn("⚠️ WOMPI_EVENTS_SECRET no configurada - signature no puede validarse");
      return false;
    }

    if (!signatureObj || !signatureObj.checksum || !signatureObj.properties) {
      console.warn("⚠️ Estructura de signature incompleta en webhook");
      return false;
    }

    const { data, timestamp } = payload;
    const { properties, checksum } = signatureObj;

    if (!data || !timestamp) {
      console.warn("⚠️ Datos incompletos en webhook para validar firma (data o timestamp)");
      return false;
    }

    // IMPORTANTE: Wompi anida los datos en data.transaction
    const transaction = data?.transaction || data;

    // Construir la cadena a hashear siguiendo el orden de properties
    let dataToSign = "";

    for (const prop of properties) {
      // Ejemplo: "transaction.id" -> extraer "id" de transaction.id
      const key = prop.replace("transaction.", "");
      const value = transaction?.[key];

      if (value === undefined) {
        console.warn(`⚠️ Property ${prop} no encontrada en transaction (buscó en transaction.${key})`);
        return false;
      }

      dataToSign += value;
    }

    // Agregar timestamp y secret
    dataToSign += timestamp + eventsSecret;

    // Generar hash
    const calculatedChecksum = crypto
      .createHash("sha256")
      .update(dataToSign)
      .digest("hex");

    console.log("🔐 Validación de checksum webhook:");
    console.log(`  - Properties a hashear: ${properties.join(", ")}`);
    console.log(`  - Timestamp: ${timestamp}`);
    console.log(`  - Data to hash (primeros 50 chars): ${dataToSign.substring(0, 50)}...`);
    console.log(`  - Checksum recibido:   ${checksum.substring(0, 32)}...`);
    console.log(`  - Checksum calculado:  ${calculatedChecksum.substring(0, 32)}...`);

    const esValida = checksum === calculatedChecksum;

    if (!esValida) {
      console.warn("⚠️ Checksum inválido - continuamos si status es APPROVED");
    } else {
      console.log("✅ Checksum válido");
    }

    return esValida;
  } catch (error) {
    console.error("❌ Error validando checksum:", error);
    return false;
  }
}
