// Quién puede entrar al panel de administración de CENTRALA (clientes, licencias, accesos):
// solo el dueño de la plataforma, por su correo (variable SUPER_ADMIN_EMAIL en Railway, o el
// correo por defecto).
export const CORREO_DUENO = (process.env.SUPER_ADMIN_EMAIL || "hnieto@deepscan.com.co").trim().toLowerCase();

export function esSuperAdmin(usuario: { email: string }): boolean {
  return usuario.email.trim().toLowerCase() === CORREO_DUENO;
}
