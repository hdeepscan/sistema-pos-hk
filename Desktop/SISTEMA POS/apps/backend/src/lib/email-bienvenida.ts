import { randomInt } from "node:crypto";

// Correo de acceso a CENTRALA (bienvenida o credenciales nuevas), con el logo y los datos
// de acceso. HTML en tablas y estilos en línea para que se vea bien en Gmail/Outlook.

export const URL_PLATAFORMA = (process.env.APP_URL || "https://centrala.up.railway.app").replace(/\/+$/, "");

// Sin caracteres que se confunden al copiar (0/O, 1/l/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generarPasswordTemporal(largo = 10): string {
  let password = "";
  for (let i = 0; i < largo; i++) password += ALFABETO[randomInt(ALFABETO.length)];
  return password;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface DatosCorreoAcceso {
  nombre: string;
  empresa: string;
  email: string;
  password: string;
  // "BIENVENIDA": cuenta nueva. "CREDENCIALES": se generó una contraseña nueva.
  tipo: "BIENVENIDA" | "CREDENCIALES";
}

export function construirCorreoAcceso(d: DatosCorreoAcceso): { asunto: string; html: string; texto: string } {
  const nombre = escapar(d.nombre);
  const empresa = escapar(d.empresa);
  const email = escapar(d.email);
  const password = escapar(d.password);
  const logo = `${URL_PLATAFORMA}/email/centrala-logo.png`;
  const esBienvenida = d.tipo === "BIENVENIDA";

  const asunto = esBienvenida ? `¡Bienvenido a CENTRALA, ${d.nombre}!` : "Tus nuevos datos de acceso a CENTRALA";
  const titulo = esBienvenida ? `¡Bienvenido a CENTRALA, ${nombre}!` : `Hola, ${nombre}`;
  const intro = esBienvenida
    ? `Tu cuenta para <strong style="color:#0f172a;">${empresa}</strong> ya está lista. Desde ahora puedes vender, controlar tu inventario, tu caja y tus reportes en un solo lugar.`
    : `Generamos una nueva contraseña para tu cuenta de <strong style="color:#0f172a;">${empresa}</strong>. Tu contraseña anterior ya no funciona.`;

  const paso = (numero: number, texto: string) => `
                <tr>
                  <td width="36" valign="top" style="padding:0 0 14px 0;">
                    <div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:#e0f2fe;color:#0369a1;font-size:13px;font-weight:700;text-align:center;">${numero}</div>
                  </td>
                  <td valign="top" style="padding:3px 0 14px 0;font-size:14px;line-height:21px;color:#475569;">${texto}</td>
                </tr>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapar(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tus datos de acceso a CENTRALA para ${empresa}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">

          <tr>
            <td align="center" style="padding:32px 32px 24px 32px;border-bottom:1px solid #eef2f7;">
              <img src="${logo}" width="200" alt="CENTRALA" style="display:block;width:200px;max-width:100%;height:auto;border:0;">
            </td>
          </tr>

          <tr>
            <td style="height:6px;line-height:6px;font-size:0;background:#1d6bff;background-image:linear-gradient(90deg,#1d4ed8,#1d6bff,#22d3ee);">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <h1 style="margin:0 0 14px 0;font-size:24px;line-height:32px;color:#0f172a;font-weight:700;">${titulo}</h1>
              <p style="margin:0;font-size:15px;line-height:24px;color:#475569;">${intro}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 8px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:20px 24px 6px 24px;font-size:12px;letter-spacing:1px;color:#64748b;font-weight:700;">TUS DATOS DE ACCESO</td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 4px 24px;font-size:13px;color:#64748b;">Usuario</td>
                </tr>
                <tr>
                  <td style="padding:0 24px 14px 24px;font-size:16px;color:#0f172a;font-weight:600;word-break:break-all;">${email}</td>
                </tr>
                <tr>
                  <td style="padding:0 24px 4px 24px;font-size:13px;color:#64748b;">Contraseña temporal</td>
                </tr>
                <tr>
                  <td style="padding:0 24px 22px 24px;">
                    <span style="display:inline-block;padding:10px 16px;background:#ffffff;border:1px dashed #94a3b8;border-radius:8px;font-family:Consolas,'Courier New',monospace;font-size:18px;letter-spacing:1px;color:#0f172a;font-weight:700;">${password}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:28px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:10px;background:#1d6bff;">
                    <a href="${URL_PLATAFORMA}/" target="_blank" style="display:inline-block;padding:15px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Ingresar a CENTRALA</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0 0;font-size:12px;color:#94a3b8;">o copia este enlace: <a href="${URL_PLATAFORMA}/" style="color:#1d6bff;text-decoration:none;">${URL_PLATAFORMA.replace(/^https?:\/\//, "")}</a></p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 40px 8px 40px;">
              <p style="margin:0 0 14px 0;font-size:15px;color:#0f172a;font-weight:700;">Para empezar</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${paso(1, `Entra a <a href="${URL_PLATAFORMA}/" style="color:#1d6bff;text-decoration:none;">CENTRALA</a> e inicia sesión con tu usuario y contraseña.`)}${paso(2, "Elige la sucursal desde la que vas a trabajar.")}${paso(3, "Cambia tu contraseña temporal en <strong>Perfil</strong> por una que solo tú conozcas.")}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 40px 32px 40px;">
              <p style="margin:0;padding:14px 16px;background:#fff7ed;border-radius:10px;font-size:13px;line-height:20px;color:#9a3412;">
                Por tu seguridad, no compartas esta contraseña con nadie. Si no esperabas este correo, ignóralo o escríbenos.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 40px;background:#f8fafc;border-top:1px solid #eef2f7;">
              <p style="margin:0;font-size:13px;color:#64748b;font-weight:600;">CENTRALA · Tu negocio, centralizado</p>
              <p style="margin:6px 0 0 0;font-size:12px;color:#94a3b8;">Este correo se envió a ${email} porque tienes una cuenta en CENTRALA.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const texto = [
    esBienvenida ? `¡Bienvenido a CENTRALA, ${d.nombre}!` : `Hola, ${d.nombre}`,
    "",
    esBienvenida
      ? `Tu cuenta para ${d.empresa} ya está lista.`
      : `Generamos una nueva contraseña para tu cuenta de ${d.empresa}.`,
    "",
    `Usuario: ${d.email}`,
    `Contraseña temporal: ${d.password}`,
    "",
    `Ingresa aquí: ${URL_PLATAFORMA}/`,
    "",
    "Después de entrar, cambia tu contraseña en Perfil.",
  ].join("\n");

  return { asunto, html, texto };
}
