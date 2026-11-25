import { prisma } from "./prisma.js";
import { emitMensajeNuevo } from "./ws.js";
import { enviarTextoMeta } from "./mensajeria.js";

// Mensajes automáticos de la bandeja:
// - Bienvenida: cuando una persona escribe por primera vez.
// - Fuera de horario: cuando escriben fuera del horario de atención (máximo una vez cada 12 horas
//   por conversación, para no repetirlo en cada mensaje).
// Solo responden a un mensaje que acaba de llegar, así que siempre están dentro de las 24 horas
// que permite Meta.

const REPETIR_AUSENCIA_MS = 12 * 60 * 60_000;
const DIAS = ["0", "1", "2", "3", "4", "5", "6"] as const;

export interface HorarioDia {
  abre: string; // "08:00"
  cierra: string; // "18:00"
}
export type Horario = Partial<Record<(typeof DIAS)[number], HorarioDia | null>>;

function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** ¿Está la tienda atendiendo en este momento según su horario? */
export function dentroDeHorario(horario: Horario | null | undefined, zonaHoraria: string, ahora = new Date()): boolean {
  if (!horario) return true;
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat("en-US", {
      timeZone: zonaHoraria,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(ahora);
  } catch {
    return true;
  }
  const dia = String(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.find((p) => p.type === "weekday")!.value));
  const actual = Number(partes.find((p) => p.type === "hour")!.value) * 60 + Number(partes.find((p) => p.type === "minute")!.value);
  const hoy = horario[dia as (typeof DIAS)[number]];
  if (!hoy) return false;
  const abre = minutos(hoy.abre);
  const cierra = minutos(hoy.cierra);
  if (abre === null || cierra === null) return true;
  // Horario que pasa la medianoche (ej. 18:00 a 02:00).
  return cierra > abre ? actual >= abre && actual < cierra : actual >= abre || actual < cierra;
}

async function enviarAutomatico(conversacionId: string, texto: string) {
  const conversacion = await prisma.conversacionMensajeria.findUnique({ where: { id: conversacionId }, include: { canal: true } });
  if (!conversacion || !conversacion.canal.activo) return;
  const externoId = await enviarTextoMeta(conversacion.canal, conversacion.contactoExternoId, texto);
  const mensaje = await prisma.mensajeMensajeria.create({
    data: {
      empresaId: conversacion.empresaId,
      conversacionId,
      direccion: "SALIENTE",
      texto,
      externoId,
      automatico: true,
    },
  });
  await prisma.conversacionMensajeria.update({
    where: { id: conversacionId },
    data: { ultimoMensajeEn: mensaje.creadoEn, ultimoMensajeTexto: texto },
  });
  emitMensajeNuevo(conversacion.empresaId, {
    conversacionId,
    mensajeId: mensaje.id,
    tipoCanal: conversacion.canal.tipo,
    direccion: "SALIENTE",
  });
}

/** Personaliza el texto: {nombre} se cambia por el nombre del cliente (o se quita si no hay). */
export function personalizar(texto: string, nombre: string | null): string {
  const primerNombre = nombre?.trim().split(/\s+/)[0] ?? "";
  return texto
    .replace(/\{nombre\}/gi, primerNombre)
    .replace(/\s+([,!.?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function ejecutarAutomatizaciones(empresaId: string, conversacionId: string, esNueva: boolean): Promise<void> {
  const config = await prisma.automatizacionMensajeria.findUnique({ where: { empresaId } });
  if (!config || (!config.bienvenidaActiva && !config.ausenciaActiva)) return;
  const conversacion = await prisma.conversacionMensajeria.findUnique({ where: { id: conversacionId } });
  if (!conversacion) return;
  const nombre = conversacion.contactoNombre;

  if (esNueva && config.bienvenidaActiva && config.bienvenidaTexto?.trim()) {
    await enviarAutomatico(conversacionId, personalizar(config.bienvenidaTexto, nombre));
  }

  if (
    config.ausenciaActiva &&
    config.ausenciaTexto?.trim() &&
    !dentroDeHorario(config.horario as Horario | null, config.zonaHoraria) &&
    (!conversacion.ultimaAusenciaEn || Date.now() - conversacion.ultimaAusenciaEn.getTime() > REPETIR_AUSENCIA_MS)
  ) {
    // Se marca antes de enviar: si llegan varios mensajes seguidos, solo uno dispara el aviso.
    const marcado = await prisma.conversacionMensajeria.updateMany({
      where: {
        id: conversacionId,
        OR: [{ ultimaAusenciaEn: null }, { ultimaAusenciaEn: { lt: new Date(Date.now() - REPETIR_AUSENCIA_MS) } }],
      },
      data: { ultimaAusenciaEn: new Date() },
    });
    if (marcado.count === 1) await enviarAutomatico(conversacionId, personalizar(config.ausenciaTexto, nombre));
  }
}
