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
 * Plantilla: Confirmación de venta (Diseño Premium)
 */
export async function enviarCorreoVenta(
  venta: { id: string; consecutivo: number; total: number; metodoPago: string; items: any[] },
  emailDestino: string,
  esAdmin: boolean = false
): Promise<void> {
  // Construir filas de productos con imágenes y alternancia de colores
  const productosHTML = venta.items
    .map(
      (item, index) => {
        const imagenHTML = item.producto?.imagenUrl
          ? `<div style="text-align: center; margin-bottom: 8px;"><img src="${item.producto.imagenUrl}" style="max-width: 80px; max-height: 80px; border-radius: 4px;" alt="${item.producto.nombre}"></div>`
          : '';

        return `<tr style="background-color: ${index % 2 === 0 ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 14px 12px; text-align: left; font-size: 14px; color: #1e293b;">
            ${imagenHTML}
            <strong>${item.cantidad}x</strong> ${item.producto?.nombre || item.descripcionLibre || 'Producto'}
          </td>
          <td style="padding: 14px 12px; text-align: right; font-size: 14px; color: #1e293b;">
            $${Number(item.precioUnitario).toLocaleString('es-CO')}
          </td>
        </tr>`;
      }
    )
    .join('');

  const titulo = esAdmin ? 'Nueva venta registrada' : 'Gracias por tu compra';
  const subtitulo = esAdmin ? 'Detalles de la transacción' : 'Tu compra ha sido procesada exitosamente';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">

  <!-- Contenedor Principal -->
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">

    <!-- Header con Degradado -->
    <div style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); padding: 40px 30px; text-align: center; color: white;">
      <div style="font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px;">
        CENTRALA POS
      </div>
      <div style="font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px;">
        Sistema de Gestión Empresarial
      </div>
    </div>

    <!-- Contenido Principal -->
    <div style="padding: 40px 30px;">

      <!-- Título y Subtítulo -->
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="margin: 0 0 8px 0; font-size: 26px; color: #0f172a; font-weight: 700;">
          ${titulo}
        </h1>
        <p style="margin: 0; font-size: 14px; color: #64748b; font-weight: 500;">
          ${subtitulo}
        </p>
      </div>

      <!-- Tarjeta de Número de Transacción -->
      <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 12px; padding: 24px; margin-bottom: 32px; text-align: center; border-left: 4px solid #3B82F6;">
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; font-weight: 600;">
          Número de Transacción
        </div>
        <div style="font-size: 36px; font-weight: 800; color: #3B82F6; font-family: 'Courier New', monospace;">
          #${venta.consecutivo}
        </div>
      </div>

      <!-- Tabla de Productos -->
      <div style="margin-bottom: 32px;">
        <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 12px; letter-spacing: 0.5px;">
          Productos Comprados
        </div>
        <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; overflow: hidden;">
          <tbody>
            <tr style="border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; background-color: #f1f5f9;">
                Descripción
              </th>
              <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; background-color: #f1f5f9;">
                Precio
              </th>
            </tr>
            ${productosHTML}
          </tbody>
        </table>
      </div>

      <!-- Resumen de Pago -->
      <div style="background-color: #eff6ff; border-radius: 12px; padding: 24px; margin-bottom: 32px; border-left: 4px solid #3B82F6;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Total -->
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">
              Total a Pagar
            </div>
            <div style="font-size: 32px; font-weight: 800; color: #3B82F6;">
              $${Number(venta.total).toLocaleString('es-CO')}
            </div>
          </div>
          <!-- Método de Pago -->
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">
              Método de Pago
            </div>
            <div style="font-size: 16px; font-weight: 700; color: #1e293b;">
              ${venta.metodoPago}
            </div>
          </div>
        </div>
      </div>

      <!-- Mensaje Personalizado -->
      <div style="background-color: #eff6ff; border-radius: 8px; padding: 16px; border-left: 4px solid #3B82F6; margin-bottom: 32px;">
        <p style="margin: 0; font-size: 13px; color: #1e293b; line-height: 1.6; font-weight: 500;">
          ${
            esAdmin
              ? '<strong>Esta es una notificación de venta.</strong> Revisa los detalles en tu panel de administración para actualizar estados de pedidos, inventario y análisis de ventas.'
              : '<strong>Gracias por tu compra.</strong> Si tienes preguntas o necesitas ayuda con tu pedido, no dudes en contactar a nuestro equipo de soporte. Estamos aquí para ayudarte.'
          }
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 32px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
      <div style="margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
          Centrala ERP
        </p>
        <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.8; font-weight: 500;">
          Sistema integral de gestión empresarial<br>
          <strong style="color: #1e293b;">www.centrala.com.co</strong><br>
          <strong style="color: #1e293b;">Soporte: +57 (300) XXXXX</strong>
        </p>
      </div>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8;">
        <p style="margin: 0;">
          © 2026 Centrala ERP. Todos los derechos reservados.<br>
          <em>Este correo fue enviado automáticamente. Por favor no respondas a este mensaje.</em>
        </p>
      </div>
    </div>

  </div>

  <!-- Espaciador inferior -->
  <div style="height: 20px;"></div>

</body>
</html>
`;

  await enviarCorreo(emailDestino, `${esAdmin ? '📊 Nueva Venta Registrada' : '✅ Tu Compra'} - #${venta.consecutivo}`, html);
}
