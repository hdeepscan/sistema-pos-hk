import nodemailer from "nodemailer";

// Configurar transporte de Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "", // tu correo Gmail
    pass: process.env.EMAIL_PASSWORD || "", // tu contraseña de aplicación de Gmail
  },
});

/**
 * Enviar email de bienvenida con credenciales
 */
export async function enviarEmailBienvenida(
  email: string,
  nombreEmpresa: string,
  nombreAdmin: string,
  passwordTemporal: string
) {
  try {
    const asunto = `¡Bienvenido a CENTRALA! - ${nombreEmpresa}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #667eea; margin: 0;">CENTRALA</h1>
            <p style="color: #666; font-size: 14px; margin: 5px 0;">Tu Negocio, Centralizado</p>
          </div>

          <!-- Contenido principal -->
          <div style="margin-bottom: 30px;">
            <h2 style="color: #2d3748; font-size: 24px; margin-bottom: 15px;">¡Bienvenido, ${nombreAdmin}! 🎉</h2>

            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              Tu empresa <strong>${nombreEmpresa}</strong> está lista para usar. Tu pago ha sido confirmado y ya tienes acceso a todas las funciones del sistema.
            </p>

            <!-- Credenciales -->
            <div style="background-color: #f7fafc; border-left: 4px solid #667eea; padding: 20px; margin-bottom: 20px; border-radius: 5px;">
              <h3 style="color: #2d3748; margin-top: 0;">Tus Credenciales de Acceso</h3>

              <div style="background-color: white; padding: 15px; border-radius: 5px; margin-bottom: 12px;">
                <p style="color: #718096; font-size: 12px; margin: 0 0 5px 0;">Email:</p>
                <p style="color: #2d3748; font-weight: bold; margin: 0; font-size: 14px;">${email}</p>
              </div>

              <div style="background-color: white; padding: 15px; border-radius: 5px;">
                <p style="color: #718096; font-size: 12px; margin: 0 0 5px 0;">Contraseña Temporal:</p>
                <p style="color: #2d3748; font-weight: bold; margin: 0; font-size: 14px; font-family: monospace; letter-spacing: 1px;">${passwordTemporal}</p>
              </div>
            </div>

            <!-- Advertencia -->
            <div style="background-color: #fff5f5; border-left: 4px solid #fc8181; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              <p style="color: #c53030; font-size: 14px; margin: 0;">
                ⚠️ <strong>Importante:</strong> Por seguridad, cambia tu contraseña temporal en tu primer ingreso.
              </p>
            </div>

            <!-- Pasos -->
            <h3 style="color: #2d3748; margin-bottom: 15px;">🚀 Pasos Siguientes:</h3>
            <ol style="color: #4a5568; font-size: 14px; line-height: 1.8;">
              <li>Ingresa a https://centrala.up.railway.app/</li>
              <li>Usa las credenciales de arriba</li>
              <li>Cambia tu contraseña temporal</li>
              <li>¡Empieza a usar tu POS!</li>
            </ol>

            <!-- Soporte -->
            <div style="background-color: #edf2f7; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <h4 style="color: #2d3748; margin-top: 0;">📞 ¿Necesitas Ayuda?</h4>
              <p style="color: #4a5568; font-size: 14px; margin: 0;">
                Si tienes problemas, responde a este email o contacta a nuestro equipo de soporte.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; color: #718096; font-size: 12px;">
            <p style="margin: 5px 0;">© 2026 CENTRALA. Todos los derechos reservados.</p>
            <p style="margin: 5px 0;">Este es un correo automático. No respondas directamente.</p>
          </div>

        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: asunto,
      html,
    });

    console.log(`✉️ Email enviado a ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error enviando email:", error);
    throw error;
  }
}

/**
 * Validar si el email existe en la base de datos
 */
export async function validarEmailNoExiste(email: string): Promise<boolean> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email },
    });

    await prisma.$disconnect();

    return !usuarioExistente; // true si NO existe, false si existe
  } catch (error) {
    console.error("Error validando email:", error);
    throw error;
  }
}
