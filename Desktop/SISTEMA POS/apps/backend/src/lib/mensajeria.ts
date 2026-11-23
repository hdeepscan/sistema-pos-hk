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
  if (cuerpo?.object === "whatsapp_business_account") return procesarAvisoWhatsApp(cuerpo);
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

// ---------- WhatsApp ----------

const TIPO_WHATSAPP: Record<string, string> = {
  text: "TEXTO",
  image: "IMAGEN",
  audio: "AUDIO",
  voice: "AUDIO",
  video: "VIDEO",
  document: "ARCHIVO",
  sticker: "IMAGEN",
};

/**
 * Avisos de WhatsApp: mensajes que llegan (value.messages) y estados de los enviados
 * (value.statuses: entregado, leído, fallido). El canal se identifica por el id del número.
 */
async function procesarAvisoWhatsApp(cuerpo: any): Promise<void> {
  for (const entrada of cuerpo.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const valor = cambio.value ?? {};
      const numeroId = valor.metadata?.phone_number_id;
      if (!numeroId) continue;
      const canal = await prisma.canalMensajeria.findUnique({
        where: { tipo_externoId: { tipo: "WHATSAPP", externoId: String(numeroId) } },
      });
      if (!canal || !canal.activo) continue;

      for (const estado of valor.statuses ?? []) {
        if (!estado.id) continue;
        const nuevo = estado.status === "read" ? "LEIDO" : estado.status === "failed" ? "ERROR" : null;
        if (!nuevo) continue;
        await prisma.mensajeMensajeria.updateMany({
          where: { externoId: String(estado.id), empresaId: canal.empresaId },
          data: {
            estado: nuevo,
            ...(nuevo === "ERROR" ? { error: estado.errors?.[0]?.title || estado.errors?.[0]?.message || "No se pudo entregar" } : {}),
          },
        });
      }

      const nombres = new Map<string, string>(
        (valor.contacts ?? []).map((c: any) => [String(c.wa_id), c.profile?.name ?? ""])
      );
      for (const m of valor.messages ?? []) {
        try {
          if (!m.id || !m.from) continue;
          if (await prisma.mensajeMensajeria.findUnique({ where: { externoId: String(m.id) } })) continue;
          const contactoId = String(m.from);
          const tipoMensaje = TIPO_WHATSAPP[m.type] ?? "OTRO";
          const texto: string | null =
            m.text?.body ?? m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? m.button?.text ?? m.interactive?.button_reply?.title ?? null;
          const fecha = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
          const resumen =
            texto ?? (tipoMensaje === "IMAGEN" ? "📷 Foto" : tipoMensaje === "AUDIO" ? "🎤 Audio" : tipoMensaje === "VIDEO" ? "🎬 Video" : "📎 Adjunto");

          let conversacion = await prisma.conversacionMensajeria.findUnique({
            where: { canalId_contactoExternoId: { canalId: canal.id, contactoExternoId: contactoId } },
          });
          if (!conversacion) {
            conversacion = await prisma.conversacionMensajeria.create({
              data: {
                empresaId: canal.empresaId,
                canalId: canal.id,
                contactoExternoId: contactoId,
                contactoNombre: nombres.get(contactoId) || null,
                contactoUsuario: `+${contactoId}`,
              },
            });
          }
          const guardado = await prisma.mensajeMensajeria.create({
            data: {
              empresaId: canal.empresaId,
              conversacionId: conversacion.id,
              direccion: "ENTRANTE",
              tipo: tipoMensaje,
              texto,
              externoId: String(m.id),
              creadoEn: fecha,
            },
          });
          await prisma.conversacionMensajeria.update({
            where: { id: conversacion.id },
            data: {
              ultimoMensajeEn: fecha,
              ultimoMensajeTexto: resumen,
              ultimoEntranteEn: fecha,
              noLeidos: { increment: 1 },
              estado: "ABIERTA",
              ...(nombres.get(contactoId) && !conversacion.contactoNombre ? { contactoNombre: nombres.get(contactoId) } : {}),
            },
          });
          emitMensajeNuevo(canal.empresaId, { conversacionId: conversacion.id, mensajeId: guardado.id, tipoCanal: "WHATSAPP" });
        } catch (err) {
          console.error("[mensajeria] No se pudo procesar un mensaje de WhatsApp:", err instanceof Error ? err.message : err);
        }
      }
    }
  }
}

/** Envía un texto por Messenger, Instagram o WhatsApp. Devuelve el id del mensaje en Meta. */
export async function enviarTextoMeta(
  canal: { tipo: string; externoId: string; paginaId: string | null; tokenCifrado: string },
  contactoId: string,
  texto: string
): Promise<string> {
  const token = descifrar(canal.tokenCifrado);
  if (canal.tipo === "WHATSAPP") {
    const r = await graph<{ messages: { id: string }[] }>(`${canal.externoId}/messages`, {
      metodo: "POST",
      token,
      cuerpo: { messaging_product: "whatsapp", recipient_type: "individual", to: contactoId, type: "text", text: { body: texto } },
    });
    return r.messages?.[0]?.id;
  }
  // Instagram (conectado con la página de Facebook) se envía por la página.
  const remitente = canal.tipo === "INSTAGRAM" ? canal.paginaId ?? canal.externoId : canal.externoId;
  const r = await graph<{ message_id: string }>(`${remitente}/messages`, {
    metodo: "POST",
    token,
    cuerpo: { recipient: { id: contactoId }, messaging_type: "RESPONSE", message: { text: texto } },
  });
  return r.message_id;
}

// ---------- Historial: conversaciones que ya existían antes de conectar ----------

// Historial completo: todas las conversaciones y hasta 500 mensajes por conversación (Meta
// entrega de a 50; se siguen las páginas).
const CONVERSACIONES_MAX = 5000;
const MENSAJES_POR_PAGINA = 50;
const MENSAJES_MAX_POR_CONVERSACION = 500;

async function todosLosMensajes(conv: any): Promise<any[]> {
  const mensajes: any[] = [...(conv.messages?.data ?? [])];
  let siguiente: string | undefined = conv.messages?.paging?.next;
  while (siguiente && mensajes.length < MENSAJES_MAX_POR_CONVERSACION) {
    const res = await fetch(siguiente);
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) break;
    mensajes.push(...(data.data ?? []));
    siguiente = data.paging?.next;
  }
  return mensajes;
}

function adjuntoDe(m: any): { tipo: string; url: string | null } {
  const a = m.attachments?.data?.[0];
  if (!a) return { tipo: m.message ? "TEXTO" : "OTRO", url: null };
  if (a.image_data?.url) return { tipo: "IMAGEN", url: a.image_data.url };
  if (a.video_data?.url) return { tipo: "VIDEO", url: a.video_data.url };
  if (a.mime_type?.startsWith("audio")) return { tipo: "AUDIO", url: a.file_url ?? null };
  return { tipo: "ARCHIVO", url: a.file_url ?? null };
}

/**
 * Trae las conversaciones recientes de una página (Messenger) o de su Instagram, con sus últimos
 * mensajes. No marca nada como no leído: es historial. Los mensajes ya guardados no se repiten.
 */
export async function importarHistorial(canalId: string): Promise<{ conversaciones: number; mensajes: number }> {
  const canal = await prisma.canalMensajeria.findUnique({ where: { id: canalId } });
  if (!canal || !canal.activo || (canal.tipo !== "MESSENGER" && canal.tipo !== "INSTAGRAM")) {
    return { conversaciones: 0, mensajes: 0 };
  }
  const token = descifrar(canal.tokenCifrado);
  const paginaId = canal.tipo === "INSTAGRAM" ? canal.paginaId ?? canal.externoId : canal.externoId;
  let conversaciones = 0;
  let mensajesNuevos = 0;
  let after: string | undefined;

  while (conversaciones < CONVERSACIONES_MAX) {
    const data: any = await graph(`${paginaId}/conversations`, {
      token,
      params: {
        platform: canal.tipo === "INSTAGRAM" ? "instagram" : "messenger",
        fields: `participants,updated_time,messages.limit(${MENSAJES_POR_PAGINA}){id,created_time,from,message,attachments}`,
        limit: "25",
        ...(after ? { after } : {}),
      },
    });
    const lista: any[] = data?.data ?? [];
    if (lista.length === 0) break;

    for (const conv of lista) {
      const participantes: any[] = conv.participants?.data ?? [];
      const contacto = participantes.find((p) => p.id !== canal.externoId && p.id !== paginaId);
      if (!contacto?.id) continue;
      const mensajes: any[] = (await todosLosMensajes(conv)).reverse(); // de más antiguo a más reciente
      if (mensajes.length === 0) continue;

      let conversacion = await prisma.conversacionMensajeria.findUnique({
        where: { canalId_contactoExternoId: { canalId: canal.id, contactoExternoId: String(contacto.id) } },
      });
      if (!conversacion) {
        const perfil =
          canal.tipo === "INSTAGRAM"
            ? { nombre: contacto.name || contacto.username || null, usuario: contacto.username ? `@${contacto.username}` : null, foto: null }
            : { nombre: contacto.name || null, usuario: null, foto: null };
        const conPerfil = perfil.nombre ? perfil : await perfilContacto(canal.tipo as TipoCanal, String(contacto.id), token);
        conversacion = await prisma.conversacionMensajeria.create({
          data: {
            empresaId: canal.empresaId,
            canalId: canal.id,
            contactoExternoId: String(contacto.id),
            contactoNombre: conPerfil.nombre,
            contactoUsuario: conPerfil.usuario,
            contactoFoto: conPerfil.foto,
          },
        });
      }

      let ultimo: { fecha: Date; resumen: string } | null = null;
      let ultimoEntrante: Date | null = null;
      for (const m of mensajes) {
        const fecha = new Date(m.created_time);
        const saliente = String(m.from?.id) === canal.externoId || String(m.from?.id) === paginaId;
        const adj = adjuntoDe(m);
        const texto: string | null = m.message || null;
        if (!saliente) ultimoEntrante = fecha;
        ultimo = {
          fecha,
          resumen: texto ?? (adj.tipo === "IMAGEN" ? "📷 Foto" : adj.tipo === "AUDIO" ? "🎤 Audio" : adj.tipo === "VIDEO" ? "🎬 Video" : "📎 Adjunto"),
        };
        if (await prisma.mensajeMensajeria.findUnique({ where: { externoId: String(m.id) } })) continue;
        await prisma.mensajeMensajeria.create({
          data: {
            empresaId: canal.empresaId,
            conversacionId: conversacion.id,
            direccion: saliente ? "SALIENTE" : "ENTRANTE",
            tipo: texto ? "TEXTO" : adj.tipo,
            texto,
            adjuntoUrl: adj.url,
            externoId: String(m.id),
            creadoEn: fecha,
          },
        });
        mensajesNuevos++;
      }

      if (ultimo && ultimo.fecha >= conversacion.ultimoMensajeEn) {
        await prisma.conversacionMensajeria.update({
          where: { id: conversacion.id },
          data: {
            ultimoMensajeEn: ultimo.fecha,
            ultimoMensajeTexto: ultimo.resumen,
            ...(ultimoEntrante && (!conversacion.ultimoEntranteEn || ultimoEntrante > conversacion.ultimoEntranteEn)
              ? { ultimoEntranteEn: ultimoEntrante }
              : {}),
          },
        });
      }
      conversaciones++;
      // La bandeja se va llenando mientras se trae el historial.
      if (conversaciones % 10 === 0) emitMensajeNuevo(canal.empresaId, { conversacionId: "", mensajeId: "", tipoCanal: canal.tipo });
    }

    after = data?.paging?.cursors?.after;
    if (!data?.paging?.next || !after) break;
  }

  return { conversaciones, mensajes: mensajesNuevos };
}
