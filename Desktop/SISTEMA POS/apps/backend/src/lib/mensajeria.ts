import { prisma } from "./prisma.js";
import { descifrar, graph } from "./meta-mensajeria.js";
import { emitMensajeNuevo } from "./ws.js";

// Bandeja de mensajes: guarda lo que llega de Messenger e Instagram y envía las respuestas.

export const VENTANA_RESPUESTA_MS = 24 * 60 * 60 * 1000;

type TipoCanal = "MESSENGER" | "INSTAGRAM" | "WHATSAPP";

function tipoAdjunto(t: string | undefined): string {
  switch (t) {
    case "image":
      return "IMAGEN";
    case "audio":
      return "AUDIO";
    case "video":
      return "VIDEO";
    case "file":
      return "ARCHIVO";
    default:
      return "OTRO";
  }
}

// Nombre y foto del cliente (solo la primera vez que escribe). Si Meta no los da, queda sin nombre.
async function perfilContacto(tipo: TipoCanal, contactoId: string, token: string) {
  try {
    if (tipo === "INSTAGRAM") {
      const p = await graph<{ name?: string; username?: string; profile_pic?: string }>(contactoId, {
        token,
        params: { fields: "name,username,profile_pic" },
      });
      return { nombre: p.name || p.username || null, usuario: p.username ? `@${p.username}` : null, foto: p.profile_pic ?? null };
    }
    const p = await graph<{ first_name?: string; last_name?: string; profile_pic?: string }>(contactoId, {
      token,
      params: { fields: "first_name,last_name,profile_pic" },
    });
    const nombre = [p.first_name, p.last_name].filter(Boolean).join(" ");
    return { nombre: nombre || null, usuario: null, foto: p.profile_pic ?? null };
  } catch {
    return { nombre: null, usuario: null, foto: null };
  }
}

/**
 * Procesa un aviso de Meta (objeto "page" = Messenger, "instagram" = Instagram). Cada mensaje se
 * guarda una sola vez (por su id de Meta) y se avisa en tiempo real a la empresa.
 */
export async function procesarAvisoMeta(cuerpo: any): Promise<void> {
  const tipo: TipoCanal | null = cuerpo?.object === "page" ? "MESSENGER" : cuerpo?.object === "instagram" ? "INSTAGRAM" : null;
  if (!tipo) return;

  for (const entrada of cuerpo.entry ?? []) {
    const canal = await prisma.canalMensajeria.findUnique({
      where: { tipo_externoId: { tipo, externoId: String(entrada.id) } },
    });
    if (!canal || !canal.activo) continue;

    for (const evento of entrada.messaging ?? []) {
      try {
        await procesarEvento(canal, tipo, evento);
      } catch (err) {
        console.error(`[mensajeria] No se pudo procesar un mensaje de ${tipo}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}

async function procesarEvento(
  canal: { id: string; empresaId: string; externoId: string; tokenCifrado: string },
  tipo: TipoCanal,
  evento: any
) {
  // Leído por el cliente (Messenger): todo lo enviado antes de esa hora queda como leído.
  if (evento.read?.watermark && evento.sender?.id) {
    const conversacion = await prisma.conversacionMensajeria.findUnique({
      where: { canalId_contactoExternoId: { canalId: canal.id, contactoExternoId: String(evento.sender.id) } },
    });
    if (conversacion) {
      await prisma.mensajeMensajeria.updateMany({
        where: {
          conversacionId: conversacion.id,
          direccion: "SALIENTE",
          estado: "ENVIADO",
          creadoEn: { lte: new Date(Number(evento.read.watermark)) },
        },
        data: { estado: "LEIDO" },
      });
    }
    return;
  }

  const mensaje = evento.message;
  if (!mensaje?.mid) return;

  // "Eco": un mensaje que la tienda mandó desde el celular u otra herramienta. Se guarda como
  // saliente para que la conversación quede completa (si lo mandó CENTRALA, ya existe).
  const esEco = mensaje.is_echo === true;
  const contactoId = String(esEco ? evento.recipient?.id : evento.sender?.id);
  if (!contactoId || contactoId === canal.externoId) return;

  if (await prisma.mensajeMensajeria.findUnique({ where: { externoId: String(mensaje.mid) } })) return;

  const adjunto = mensaje.attachments?.[0];
  const tipoMensaje = mensaje.text ? "TEXTO" : adjunto ? tipoAdjunto(adjunto.type) : "OTRO";
  const texto: string | null = mensaje.text ?? null;
  const fecha = evento.timestamp ? new Date(Number(evento.timestamp)) : new Date();
  const resumen = texto ?? (tipoMensaje === "IMAGEN" ? "📷 Foto" : tipoMensaje === "AUDIO" ? "🎤 Audio" : tipoMensaje === "VIDEO" ? "🎬 Video" : "📎 Adjunto");

  let conversacion = await prisma.conversacionMensajeria.findUnique({
    where: { canalId_contactoExternoId: { canalId: canal.id, contactoExternoId: contactoId } },
  });
  if (!conversacion) {
    const perfil = await perfilContacto(tipo, contactoId, descifrar(canal.tokenCifrado));
    conversacion = await prisma.conversacionMensajeria.create({
      data: {
        empresaId: canal.empresaId,
        canalId: canal.id,
        contactoExternoId: contactoId,
        contactoNombre: perfil.nombre,
        contactoUsuario: perfil.usuario,
        contactoFoto: perfil.foto,
      },
    });
  }

  const guardado = await prisma.mensajeMensajeria.create({
    data: {
      empresaId: canal.empresaId,
      conversacionId: conversacion.id,
      direccion: esEco ? "SALIENTE" : "ENTRANTE",
      tipo: tipoMensaje,
      texto,
      adjuntoUrl: adjunto?.payload?.url ?? null,
      externoId: String(mensaje.mid),
      creadoEn: fecha,
    },
  });

  await prisma.conversacionMensajeria.update({
    where: { id: conversacion.id },
    data: {
      ultimoMensajeEn: fecha,
      ultimoMensajeTexto: resumen,
      ...(esEco ? {} : { ultimoEntranteEn: fecha, noLeidos: { increment: 1 }, estado: "ABIERTA" }),
    },
  });

  emitMensajeNuevo(canal.empresaId, { conversacionId: conversacion.id, mensajeId: guardado.id, tipoCanal: tipo });
}

/** Envía un texto por Messenger o Instagram. Devuelve el id del mensaje en Meta. */
export async function enviarTextoMeta(
  canal: { tipo: string; externoId: string; paginaId: string | null; tokenCifrado: string },
  contactoId: string,
  texto: string
): Promise<string> {
  const token = descifrar(canal.tokenCifrado);
  // Instagram (conectado con la página de Facebook) se envía por la página.
  const remitente = canal.tipo === "INSTAGRAM" ? canal.paginaId ?? canal.externoId : canal.externoId;
  const r = await graph<{ message_id: string }>(`${remitente}/messages`, {
    metodo: "POST",
    token,
    cuerpo: { recipient: { id: contactoId }, messaging_type: "RESPONSE", message: { text: texto } },
  });
  return r.message_id;
}
