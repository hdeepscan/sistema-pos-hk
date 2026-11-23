// Estado de la sincronización automática con Shopify, por empresa y por paso, para mostrarlo en
// la pantalla de Shopify (sin tener que leer los registros del servidor). Vive en memoria: se
// reinicia con cada despliegue.

export interface EstadoPaso {
  ultimaVez: string;
  ok: boolean;
  detalle: string | null;
}

const estados = new Map<string, Record<string, EstadoPaso>>();

export function registrarPaso(empresaId: string, paso: string, ok: boolean, detalle: string | null = null) {
  const actual = estados.get(empresaId) ?? {};
  actual[paso] = { ultimaVez: new Date().toISOString(), ok, detalle };
  estados.set(empresaId, actual);
}

export function estadoSincronizacion(empresaId: string): Record<string, EstadoPaso> {
  return estados.get(empresaId) ?? {};
}
