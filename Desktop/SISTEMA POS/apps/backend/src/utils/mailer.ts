import nodemailer from 'nodemailer';

// Validar variables de entorno
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
  console.warn('⚠️ SMTP variables not fully configured. Email features will be disabled.');
}

// Crear transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true, // Puerto 465 requiere secure: true
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Para cPanel y redes restrictivas
  },
});

// Función auxiliar para enviar correos (fire and forget)
async function enviarCorreo(destinatario: string, asunto: string, html: string): Promise<void> {
  if (!EMAIL_FROM) {
    console.warn('EMAIL_FROM not configured, skipping email send');
    return;
  }

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: destinatario,
      subject: asunto,
      html: html,
    });
    console.log(`✅ Email enviado a: ${destinatario}`);
  } catch (error) {
    console.error(`❌ Error enviando email a ${destinatario}:`, error);
    // NO lanzes la excepción - el sistema debe continuar funcionando
  }
}

// Plantilla: Bienvenida de usuario
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
      <a href="https://tu-dominio.com/login" class="button">Acceder a Centrala ERP</a>

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

// Plantilla: Confirmación de venta
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
