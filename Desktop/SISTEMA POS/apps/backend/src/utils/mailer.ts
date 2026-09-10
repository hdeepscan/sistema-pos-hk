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
 * Plantilla: Confirmación de venta (Diseño Luxury Premium)
 * Plantilla responsive con imágenes reales de productos e inline CSS
 */
export async function enviarCorreoVenta(
  venta: { id: string; consecutivo: number; total: number; metodoPago: string; items: any[]; cliente?: { nombre: string } },
  emailDestino: string,
  esAdmin: boolean = false
): Promise<void> {
  // Utilidad: Formatear moneda colombiana
  const formatMoneda = (cantidad: number): string => {
    return Number(cantidad).toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  // Variables dinámicas
  const nombreCliente = venta.cliente?.nombre || 'Cliente';
  const numeroTransaccion = String(venta.consecutivo).padStart(6, '0');
  const metodoPago = venta.metodoPago || 'Efectivo';
  const totalFormateado = formatMoneda(venta.total);

  // Construir HTML de productos dinámicamente
  let itemsHtml = '';

  venta.items.forEach((item) => {
    const nombreProducto = item.producto?.nombre || item.nombre || 'Producto';
    const cantidad = item.cantidad || 1;
    const precioUnitario = item.precioUnitario || item.precio || 0;
    const totalItem = cantidad * precioUnitario;
    const imagenUrl = item.producto?.imagenUrl || item.imagenUrl;

    // Generar HTML para la miniatura
    let imagenHTML: string;
    if (imagenUrl) {
      imagenHTML = `<img src="${imagenUrl}" alt="${nombreProducto}" width="48" height="48" style="display:block; width:48px; height:48px; object-fit:cover; border-radius:6px; border:1px solid #e2e8f0;">`;
    } else {
      // Placeholder gris elegante con inicial del producto
      const inicial = nombreProducto.charAt(0).toUpperCase();
      imagenHTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="48" style="width:48px; height:48px; background-color:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px;">
        <tr><td align="center" valign="middle" height="46" style="height:46px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; color:#94a3b8;">${inicial}</td></tr>
      </table>`;
    }

    itemsHtml += `
        <tr>
          <td class="px" style="padding:0 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-bottom:1px solid #eef2f7;">
              <tr>
                <td width="48" valign="middle" style="width:48px; padding:16px 0;">
                  ${imagenHTML}
                </td>
                <td valign="middle" style="padding:16px 0 16px 14px;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:20px; font-weight:600; color:#0f172a;">${nombreProducto}</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:18px; color:#5a6579; padding-top:3px;">${cantidad} × $${formatMoneda(precioUnitario)}</div>
                </td>
                <td align="right" valign="middle" style="padding:16px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:20px; font-weight:600; color:#0f172a; white-space:nowrap;">
                  $${formatMoneda(totalItem)}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
  });

  // Plantilla HTML principal (responsive, inline CSS)
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Confirmación de compra — Centrala POS</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .amount { font-size:32px !important; }
    .txn { font-size:34px !important; }
    .hide-sm { display:none !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#eef2f7;">
<span style="display:none; font-size:1px; color:#eef2f7; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">Tu compra ha sido confirmada. Transacción #${numeroTransaccion} · ${venta.items.length} productos · Total $${totalFormateado} pagado con ${metodoPago}.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
  <tr>
    <td align="center" style="padding:28px 12px 44px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="wrap" style="width:600px; max-width:600px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">

        <!-- Header Ejecutivo -->
        <tr>
          <td bgcolor="#0f172a" style="background-color:#0f172a; padding:34px 40px 32px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td align="left" valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:20px; line-height:24px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:3px; color:#ffffff;">
                  CENTRALA
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:9px; line-height:14px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:3px; color:#93a3bb; padding-top:5px;">
                    POS · GESTIÓN EMPRESARIAL
                  </div>
                </td>
                <td align="right" valign="middle" class="hide-sm" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; color:#93a3bb;">
                  Recibo electrónico<br>
                  <span style="color:#ffffff; font-weight:600;">${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Título Principal -->
        <tr>
          <td class="px" style="padding:40px 40px 0 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="left" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:26px; line-height:32px; mso-line-height-rule:exactly; font-weight:700; letter-spacing:-0.4px; color:#0f172a; padding-bottom:8px;">
                  Gracias por tu compra, ${nombreCliente}
                </td>
              </tr>
              <tr>
                <td align="left" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:23px; mso-line-height-rule:exactly; color:#5a6579; padding-bottom:30px;">
                  Tu pago fue procesado exitosamente. Este es el detalle de tu transacción.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Tarjeta de Transacción y Estado -->
        <tr>
          <td class="px" style="padding:0 40px 34px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
              <tr>
                <td width="50%" align="left" style="width:50%; padding:20px 22px 20px 22px; border-right:1px solid #e2e8f0;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:1.6px; color:#8794aa; padding-bottom:6px;">TRANSACCIÓN</div>
                  <div class="txn" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:30px; line-height:34px; mso-line-height-rule:exactly; font-weight:700; letter-spacing:-0.5px; color:#0f172a;">#${numeroTransaccion}</div>
                </td>
                <td width="50%" align="left" style="width:50%; padding:20px 22px 20px 22px;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:1.6px; color:#8794aa; padding-bottom:6px;">ESTADO</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:20px; mso-line-height-rule:exactly; font-weight:600; color:#0f172a;">
                    <span style="display:inline-block; width:8px; height:8px; background-color:#1a9c55; border-radius:8px;">&nbsp;</span>&nbsp; Pago confirmado
                  </div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:18px; color:#5a6579; padding-top:4px;">${metodoPago}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Productos Comprados -->
        <tr>
          <td class="px" style="padding:0 40px 6px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td align="left" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:1.6px; color:#8794aa; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                  PRODUCTOS
                </td>
                <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:1.6px; color:#8794aa; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                  IMPORTE
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Filas dinámicas de productos -->
        ${itemsHtml}

        <!-- Totales -->
        <tr>
          <td class="px" style="padding:20px 40px 30px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
              <tr>
                <td style="padding:22px 24px 8px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
                    <tr>
                      <td align="left" valign="bottom" style="padding-top:14px;">
                        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:1.6px; color:#8794aa; padding-bottom:4px;">TOTAL PAGADO</div>
                        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:18px; color:#5a6579;">${metodoPago} · Aprobado</div>
                      </td>
                      <td align="right" valign="bottom" class="amount" style="padding-top:14px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:34px; line-height:38px; mso-line-height-rule:exactly; font-weight:700; letter-spacing:-0.8px; color:#0f172a; white-space:nowrap;">
                        $${totalFormateado}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td style="height:16px; font-size:0; line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding:26px 40px 30px 40px;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:11px; line-height:16px; mso-line-height-rule:exactly; font-weight:600; letter-spacing:2.4px; color:#0f172a; padding-bottom:8px;">CENTRALA ERP</div>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:11px; line-height:17px; mso-line-height-rule:exactly; color:#8794aa;">
              Correo automático generado por Centrala POS.
            </div>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;

  await enviarCorreo(emailDestino, `Confirmación de Compra - #${numeroTransaccion}`, html);
}
