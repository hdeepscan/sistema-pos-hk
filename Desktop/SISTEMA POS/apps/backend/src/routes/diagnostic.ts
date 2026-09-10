import type { FastifyInstance } from "fastify";
import nodemailer from "nodemailer";

/**
 * Rutas de diagnóstico para debugging (production-safe)
 * No requiere autenticación
 */

export async function diagnosticRoutes(app: FastifyInstance) {
  /**
   * Endpoint de prueba de SMTP
   * GET /diagnostic/test-email?to=email@example.com
   */
  app.get("/diagnostic/test-email", async (request, reply) => {
    const { to } = request.query as { to?: string };
    const destinatario = to || "test@example.com";

    console.log("\n[DIAGNOSTIC] Iniciando prueba de SMTP...");

    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const EMAIL_FROM = process.env.EMAIL_FROM;

    const diagnostico: any = {
      timestamp: new Date().toISOString(),
      smtp_config: {
        SMTP_HOST: SMTP_HOST ? "✓" : "✗",
        SMTP_PORT: SMTP_PORT,
        SMTP_USER: SMTP_USER ? "✓" : "✗",
        SMTP_PASS: SMTP_PASS ? "✓" : "✗",
        EMAIL_FROM: EMAIL_FROM || "no configurado",
      },
      resultado: null,
      error: null,
    };

    // Validar configuración
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
      diagnostico.error = "SMTP configuration incomplete";
      console.log("[DIAGNOSTIC] ❌ Configuración incompleta");
      return reply.code(400).send(diagnostico);
    }

    try {
      // Crear transporter de prueba
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      console.log(`[DIAGNOSTIC] Conectando a ${SMTP_HOST}:${SMTP_PORT}...`);

      // Verificar conexión
      const verificacion = await transporter.verify();
      diagnostico.verificacion = verificacion ? "✓ Conexión exitosa" : "✗ Verificación fallida";
      console.log(`[DIAGNOSTIC] Verificación: ${diagnostico.verificacion}`);

      // Enviar correo de prueba
      console.log(`[DIAGNOSTIC] Enviando email de prueba a ${destinatario}...`);
      const resultado = await transporter.sendMail({
        from: EMAIL_FROM,
        to: destinatario,
        subject: "🧪 Prueba de SMTP - Centrala ERP",
        html: `<h1>✅ Prueba de SMTP Exitosa</h1><p>Este es un email de prueba desde Centrala ERP.</p><p>Timestamp: ${new Date().toISOString()}</p>`,
      });

      diagnostico.resultado = {
        status: "✅ Enviado",
        messageId: resultado.messageId,
        destinatario: destinatario,
      };

      console.log(`[DIAGNOSTIC] ✅ Email enviado: ${resultado.messageId}`);
      return reply.send(diagnostico);
    } catch (error: any) {
      diagnostico.error = {
        code: error?.code,
        message: error?.message,
        command: error?.command,
      };

      console.error("[DIAGNOSTIC] ❌ Error:", error);
      return reply.code(500).send(diagnostico);
    }
  });

  /**
   * Endpoint de salud del SMTP (con timeout para no bloquear)
   * GET /diagnostic/smtp-health
   */
  app.get("/diagnostic/smtp-health", async (request, reply) => {
    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const EMAIL_FROM = process.env.EMAIL_FROM;

    const health: any = {
      configured: !!(SMTP_HOST && SMTP_USER && SMTP_PASS && EMAIL_FROM),
      variables: {
        SMTP_HOST: SMTP_HOST ? "***" : null,
        SMTP_PORT: SMTP_PORT,
        SMTP_USER: SMTP_USER ? "***" : null,
        SMTP_PASS: SMTP_PASS ? "***" : null,
        EMAIL_FROM: EMAIL_FROM || null,
      },
    };

    // Si no está configurado, responde inmediatamente
    if (!health.configured) {
      return reply.code(400).send({
        ...health,
        status: "UNCONFIGURED",
        message: "Missing SMTP configuration variables",
      });
    }

    // Verificación con timeout de 5 segundos
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        tls: { rejectUnauthorized: false },
        connectionUrl: `smtps://${SMTP_USER}:${SMTP_PASS}@${SMTP_HOST}:${SMTP_PORT}`,
      });

      // Usar Promise.race con timeout
      const verifyWithTimeout = Promise.race([
        transporter.verify(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("SMTP verify timeout")), 5000)
        ),
      ]);

      const connection = await verifyWithTimeout;
      health.connection = !!connection;
      health.status = "OK";
      return reply.send(health);
    } catch (err: any) {
      health.connection = false;
      health.status = "ERROR";
      health.error = err?.message || "Unknown error";
      return reply.code(500).send(health);
    }
  });
}
