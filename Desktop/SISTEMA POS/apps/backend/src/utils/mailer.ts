import { Resend } from 'resend';

// Usar Resend API en lugar de SMTP directo (evita bloqueos de firewall en Railway)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'centrala_correos@centrala.com.co';

// Fallback a SMTP si Resend no está configurado
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let resendClient: Resend | null = null;
let useResend = false;

if (RESEND_API_KEY) {
  resendClient = new Resend(RESEND_API_KEY);
  useResend = true;
  console.log('✅ Email: Usando Resend API (HTTP/HTTPS)');
} else if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.warn('⚠️ Email: Ni Resend ni SMTP están configurados. Email features deshabilitados.');
} else {
  console.log('✅ Email: Usando SMTP directo');
}

/**
 * Enviar correo usando Resend o SMTP (fallback)
 */
async function enviarCorreo(destinatario: string, asunto: string, html: string): Promise<void> {
  console.log(`\n[MAILER DEBUG] Intentando enviar email...`);
  console.log(`  → Destinatario: ${destinatario}`);
  console.log(`  → Asunto: ${asunto}`);
  console.log(`  → Método: ${useResend ? 'Resend API' : 'SMTP'}`);

  try {
    if (useResend && resendClient) {
      // Usar Resend API (HTTP/HTTPS - siempre funciona en Railway)
      console.log(`  → Conectando a Resend API...`);
      const resultado = await resendClient.emails.send({
        from: EMAIL_FROM,
        to: destinatario,
        subject: asunto,
        html: html,
      });

      if (resultado.error) {
        console.error(`❌ Error de Resend:`, resultado.error);
        return;
      }

      console.log(`✅ Email enviado exitosamente vía Resend`);
      console.log(`  → Message ID: ${resultado.data?.id}`);
      console.log(`[MAILER DEBUG] ✅ Completado\n`);
    } else if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      // Fallback a SMTP
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465, // true para 465 (SMTPS), false para 587 (STARTTLS)
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      console.log(`  → Conectando a SMTP: ${SMTP_HOST}:${SMTP_PORT}...`);
      const resultado = await transporter.sendMail({
        from: EMAIL_FROM,
        to: destinatario,
        subject: asunto,
        html: html,
      });

      console.log(`✅ Email enviado exitosamente vía SMTP`);
      console.log(`  → Message ID: ${resultado.messageId}`);
      console.log(`[MAILER DEBUG] ✅ Completado\n`);
    } else {
      console.warn(`❌ No hay método de envío configurado (Resend o SMTP)`);
    }
  } catch (error: any) {
    console.error(`\n❌ ERROR AL ENVIAR EMAIL:`);
    console.error(`  → Destinatario: ${destinatario}`);
    console.error(`  → Error Type: ${error?.code || error?.name || 'Unknown'}`);
    console.error(`  → Error Message: ${error?.message}`);
    console.error(`  → Full Error:`, error);
    console.error(`[MAILER DEBUG] ❌ Error completado\n`);
    // NO lanzar excepción - el sistema debe continuar funcionando
  }
}

/**
 * Plantilla: Bienvenida de usuario
 */
export async function enviarCorreoBienvenida(usuario: { nombre: string; email: string }, contrasenaPlana: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { text-align: center; border-bottom: 3px solid #3B82F6; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #0f172a; margin: 0; font-size: 28px; }
    .subheader { color: #64748b; font-size: 14px; margin-top: 5px; }
    .content { color: #1e293b; line-height: 1.6; }
    .credentials { background-color: #f0f9ff; border-left: 4px solid #3B82F6; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .credentials p { margin: 8px 0; font-size: 14px; }
    .credentials strong { color: #0f172a; }
    .button { display: inline-block; background-color: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>¡Bienvenido a Centrala ERP!</h1>
      <p class="subheader">Tu sistema de gestión empresarial está listo</p>
    </div>

    <div class="content">
      <p>Hola <strong>${usuario.nombre}</strong>,</p>

      <p>Te damos la más cordial bienvenida a <strong>Centrala ERP</strong>. Tu cuenta ha sido creada exitosamente y ya puedes acceder al sistema.</p>

      <div class="credentials">
        <p><strong>Tus Credenciales de Acceso:</strong></p>
        <p>📧 <strong>Email:</strong> ${usuario.email}</p>
        <p>🔑 <strong>Contraseña Temporal:</strong> <code>${contrasenaPlana}</code></p>
        <p style="font-size: 12px; color: #64748b; margin-top: 16px;">⚠️ Por tu seguridad, te recomendamos cambiar tu contraseña en tu primer acceso.</p>
      </div>

      <p>Accede al sistema aquí:</p>
      <a href="https://centrala.up.railway.app/login" class="button">Acceder a Centrala ERP</a>

      <p style="margin-top: 30px;">Si tienes alguna pregunta o necesitas asistencia, no dudes en contactar a nuestro equipo de soporte.</p>
    </div>

    <div class="footer">
      <p>© 2026 Centrala ERP. Todos los derechos reservados.</p>
      <p>Este correo fue enviado automáticamente. Por favor no respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>
`;

  await enviarCorreo(usuario.email, '¡Bienvenido a Centrala ERP! 🚀', html);
}

/**
 * Plantilla: Confirmación de venta
 */
export async function enviarCorreoVenta(
  venta: { id: string; consecutivo: number; total: number; metodoPago: string; items: any[] },
  emailDestino: string,
  esAdmin: boolean = false
): Promise<void> {
  const productosHTML = venta.items
    .map(
      (item) =>
        `<tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; text-align: left;">${item.cantidad}x ${item.producto?.nombre || item.descripcionLibre || 'Producto'}</td>
          <td style="padding: 10px; text-align: right;">$${Number(item.precioUnitario).toLocaleString('es-CO')}</td>
        </tr>`
    )
    .join('');

  const titulo = esAdmin ? '¡Nueva venta registrada!' : '¡Gracias por tu compra!';
  const subtitulo = esAdmin ? 'Detalles de la transacción' : 'Tu compra ha sido procesada exitosamente';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { text-align: center; border-bottom: 3px solid #22C55E; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #0f172a; margin: 0; font-size: 28px; }
    .subheader { color: #64748b; font-size: 14px; margin-top: 5px; }
    .content { color: #1e293b; line-height: 1.6; }
    .venta-numero { background-color: #f0fdf4; padding: 16px; border-radius: 6px; margin-bottom: 20px; text-align: center; }
    .venta-numero p { margin: 0; color: #64748b; font-size: 12px; }
    .venta-numero strong { display: block; font-size: 24px; color: #22C55E; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .total-row { background-color: #f0fdf4; }
    .total-row td { padding: 16px; font-weight: 700; color: #0f172a; border-top: 2px solid #22C55E; }
    .metodo-pago { background-color: #eff6ff; border-left: 4px solid #3B82F6; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${titulo}</h1>
      <p class="subheader">${subtitulo}</p>
    </div>

    <div class="content">
      <div class="venta-numero">
        <p>Número de Transacción</p>
        <strong>#${venta.consecutivo}</strong>
      </div>

      <p><strong>Productos:</strong></p>
      <table>
        <tbody>
          ${productosHTML}
          <tr class="total-row">
            <td style="text-align: left;">TOTAL</td>
            <td style="text-align: right;">$${Number(venta.total).toLocaleString('es-CO')}</td>
          </tr>
        </tbody>
      </table>

      <div class="metodo-pago">
        <p style="margin: 0 0 8px 0;"><strong>Método de Pago:</strong></p>
        <p style="margin: 0; font-size: 14px;">${venta.metodoPago}</p>
      </div>

      <p style="margin-top: 30px;">${
        esAdmin
          ? 'Revisa los detalles de esta transacción en tu panel de administración.'
          : 'Gracias por confiar en nosotros. Si tienes alguna pregunta sobre tu compra, contáctanos.'
      }</p>
    </div>

    <div class="footer">
      <p>© 2026 Centrala ERP. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
`;

  await enviarCorreo(emailDestino, `${esAdmin ? 'Nueva Venta Registrada' : 'Tu Compra'} - #${venta.consecutivo}`, html);
}
