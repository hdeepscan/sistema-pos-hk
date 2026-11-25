import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "./prisma.js";
import { graph, URL_PLATAFORMA } from "./meta-mensajeria.js";

// Fotos, audios y documentos de la bandeja de mensajes.
//
// - Lo que se envía se guarda en CENTRALA y se le pasa a Meta un enlace público (Meta lo descarga).
// - Lo que llega se copia a CENTRALA: los enlaces de Messenger/Instagram vencen y los de WhatsApp
//   necesitan la clave de acceso para verse.

export const TAMANO_MAX_ENVIO = 16 * 1024 * 1024; // WhatsApp: audio y documentos hasta 16 MB
export const TAMANO_MAX_IMAGEN = 5 * 1024 * 1024; // WhatsApp: imágenes hasta 5 MB
const TAMANO_MAX_COPIA = 20 * 1024 * 1024;

export type TipoMedio = "IMAGEN" | "AUDIO" | "VIDEO" | "ARCHIVO";

export function tipoDeMime(mime: string): TipoMedio {
  if (mime.startsWith("image/")) return "IMAGEN";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  return "ARCHIVO";
}

export function urlAdjunto(id: string): string {
  return `${URL_PLATAFORMA}/mensajeria/adjuntos/${id}`;
}

export async function guardarAdjunto(empresaId: string, datos: Buffer, mime: string, nombre?: string | null) {
  const a = await prisma.adjuntoMensajeria.create({
    data: { empresaId, mime, nombre: nombre ?? null, tamano: datos.length, datos },
    select: { id: true },
  });
  return { id: a.id, url: urlAdjunto(a.id) };
}

// ---------- Conversión de audio (ffmpeg) ----------

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(`No se pudo convertir el audio (ffmpeg): ${e.message}`)));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`No se pudo convertir el audio: ${err.slice(0, 200)}`))));
  });
}

/**
 * Las notas de voz del navegador salen en WebM (Chrome) u OGG (Firefox). Cada canal acepta
 * formatos distintos:
 * - WhatsApp: OGG/Opus (se ve como nota de voz), MP3, AAC/M4A.
 * - Messenger e Instagram: M4A/AAC, MP3 o WAV.
 */
export async function convertirAudio(datos: Buffer, mime: string, canal: string): Promise<{ datos: Buffer; mime: string; ext: string }> {
  const base = mime.split(";")[0].trim();
  const paraWhatsapp = canal === "WHATSAPP";
  if (paraWhatsapp && (base === "audio/ogg" || base === "audio/mpeg" || base === "audio/aac" || base === "audio/mp4")) {
    return { datos, mime: base, ext: base === "audio/ogg" ? "ogg" : base === "audio/mpeg" ? "mp3" : "m4a" };
  }
  if (!paraWhatsapp && (base === "audio/mp4" || base === "audio/aac" || base === "audio/mpeg" || base === "audio/wav")) {
    return { datos, mime: base, ext: base === "audio/mpeg" ? "mp3" : base === "audio/wav" ? "wav" : "m4a" };
  }
  const dir = await mkdtemp(join(tmpdir(), "centrala-audio-"));
  try {
    const entrada = join(dir, "entrada");
    await writeFile(entrada, datos);
    if (paraWhatsapp) {
      const salida = join(dir, "salida.ogg");
      // El audio del navegador ya viene en Opus: si se puede, solo se cambia el "empaque".
      try {
        await ffmpeg(["-i", entrada, "-vn", "-c:a", "copy", "-f", "ogg", salida]);
      } catch {
        await ffmpeg(["-i", entrada, "-vn", "-c:a", "libopus", "-b:a", "32k", "-ac", "1", "-f", "ogg", salida]);
      }
      return { datos: await readFile(salida), mime: "audio/ogg", ext: "ogg" };
    }
    const salida = join(dir, "salida.m4a");
    await ffmpeg(["-i", entrada, "-vn", "-c:a", "aac", "-b:a", "64k", "-ac", "1", salida]);
    return { datos: await readFile(salida), mime: "audio/mp4", ext: "m4a" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- Copiar lo que llega ----------

async function descargar(url: string, headers?: Record<string, string>): Promise<{ datos: Buffer; mime: string } | null> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > TAMANO_MAX_COPIA) return null;
  const datos = Buffer.from(await res.arrayBuffer());
  if (datos.length > TAMANO_MAX_COPIA) return null;
  return { datos, mime: (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim() };
}

/** Copia un adjunto de Messenger/Instagram (enlace que vence). Si no se puede, deja el enlace original. */
export async function copiarAdjuntoMeta(empresaId: string, url: string): Promise<string> {
  try {
    const r = await descargar(url);
    if (!r) return url;
    return (await guardarAdjunto(empresaId, r.datos, r.mime)).url;
  } catch {
    return url;
  }
}

/** Descarga un adjunto de WhatsApp (por su id) con la clave del número. */
export async function copiarAdjuntoWhatsapp(
  empresaId: string,
  mediaId: string,
  token: string,
  nombre?: string | null
): Promise<string | null> {
  try {
    const info = await graph<{ url: string; mime_type?: string }>(mediaId, { token });
    const r = await descargar(info.url, { Authorization: `Bearer ${token}` });
    if (!r) return null;
    return (await guardarAdjunto(empresaId, r.datos, info.mime_type?.split(";")[0] || r.mime, nombre)).url;
  } catch (err) {
    console.error("[mensajeria] No se pudo descargar un adjunto de WhatsApp:", err instanceof Error ? err.message : err);
    return null;
  }
}
