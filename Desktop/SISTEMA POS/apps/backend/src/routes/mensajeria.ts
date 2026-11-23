import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { esSuperAdmin } from "../lib/super-admin.js";
import {
  configMeta,
  cifrar,
  ErrorMeta,
  graph,
  PERMISOS_META,
  REDIRECT_META,
  URL_PLATAFORMA,
  WEBHOOK_META,
} from "../lib/meta-mensajeria.js";
import { enviarTextoMeta, importarHistorial, VENTANA_RESPUESTA_MS } from "../lib/mensajeria.js";
import { emitMensajeNuevo } from "../lib/ws.js";

const CANALES = ["MESSENGER", "INSTAGRAM", "WHATSAPP"] as const;

// Regreso de Facebook después de que la tienda autoriza su página e Instagram. No lleva sesión de
// CENTRALA (viene de Facebook): la empresa sale del "state" firmado al iniciar la conexión.
export async function mensajeriaCallbackRoutes(app: FastifyInstance) {
  app.get("/mensajeria/meta/callback", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const volver = (params: Record<string, string>) =>
      reply.redirect(`${URL_PLATAFORMA}/#/mensajes?${new URLSearchParams(params).toString()}`);

    if (q.error) return volver({ error: q.error_description || "Se canceló la conexión con Facebook" });
    if (!q.code || !q.state) return volver({ error: "Faltan datos de Facebook" });

    let empresaId: string;
    let usuarioId: string;
    try {
      const estado = app.jwt.verify<{ empresaId: string; usuarioId: string }>(q.state);
      empresaId = estado.empresaId;
      usuarioId = estado.usuarioId;
    } catch {
      return volver({ error: "La conexión venció. Vuelve a intentarlo." });
    }

    try {
      const { appId, appSecret } = configMeta();
      // Código → token corto del usuario → token largo (las claves de página que salen de él no vencen).
      const corto = await graph<{ access_token: string }>("oauth/access_token", {
        params: { client_id: appId, client_secret: appSecret, redirect_uri: REDIRECT_META, code: q.code },
      });
      const largo = await graph<{ access_token: string }>("oauth/access_token", {
        params: {
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: corto.access_token,
        },
      });

      const paginas = await graph<{
        data: {
          id: string;
          name: string;
          access_token: string;
          picture?: { data?: { url?: string } };
          instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
        }[];
      }>("me/accounts", {
        token: largo.access_token,
        params: {
          fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
          limit: "100",
        },
      });

      let conectados = 0;
      const avisos: string[] = [];
      for (const p of paginas.data ?? []) {
        // Recibir los mensajes de esta página (y de su Instagram) en el webhook de CENTRALA.
        try {
          await graph(`${p.id}/subscribed_apps`, {
            metodo: "POST",
            token: p.access_token,
            params: { subscribed_fields: "messages,messaging_postbacks,message_echoes,message_reads" },
          });
        } catch (err) {
          avisos.push(`${p.name}: ${err instanceof Error ? err.message : "no se pudo suscribir"}`);
          continue;
        }

        const canales = [
          { tipo: "MESSENGER", externoId: p.id, paginaId: null, nombre: p.name, usuario: null, fotoUrl: p.picture?.data?.url ?? null },
          ...(p.instagram_business_account
            ? [
                {
                  tipo: "INSTAGRAM",
                  externoId: p.instagram_business_account.id,
                  paginaId: p.id,
                  nombre: p.instagram_business_account.name || p.instagram_business_account.username || p.name,
                  usuario: p.instagram_business_account.username ? `@${p.instagram_business_account.username}` : null,
                  fotoUrl: p.instagram_business_account.profile_picture_url ?? null,
                },
              ]
            : []),
        ];
        for (const c of canales) {
          const existente = await prisma.canalMensajeria.findUnique({
            where: { tipo_externoId: { tipo: c.tipo, externoId: c.externoId } },
          });
          // Una página solo puede estar en una empresa de CENTRALA.
          if (existente && existente.empresaId !== empresaId && existente.activo) {
            avisos.push(`${c.nombre} ya está conectada en otra cuenta de CENTRALA`);
            continue;
          }
          const datos = { ...c, empresaId, tokenCifrado: cifrar(p.access_token), activo: true };
          if (existente) await prisma.canalMensajeria.update({ where: { id: existente.id }, data: datos });
          else await prisma.canalMensajeria.create({ data: datos });
          conectados++;
        }
      }

      // Trae en segundo plano las conversaciones que ya existían (la pantalla se actualiza sola).
      void (async () => {
        const canales = await prisma.canalMensajeria.findMany({ where: { empresaId, activo: true } });
        for (const c of canales) {
          await importarHistorial(c.id).catch((err) =>
            console.error(`[mensajeria] No se pudo traer el historial de ${c.nombre}:`, err instanceof Error ? err.message : err)
          );
        }
      })();

      registrarAuditoria({
        empresaId,
        usuarioId,
        accion: "MENSAJERIA_CONECTAR_META",
        entidad: "CanalMensajeria",
        detalle: `${conectados} canal(es) conectados`,
      });
      return volver({ conectados: String(conectados), ...(avisos.length ? { aviso: avisos.join(" · ") } : {}) });
    } catch (err) {
      request.log.error(err);
      return volver({ error: err instanceof Error ? err.message : "No se pudo conectar con Facebook" });
    }
  });
}

export async function mensajeriaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  const puedeAtender = (permisos: string[]) => permisos.includes("mensajes.atender");
  const puedeConfigurar = (permisos: string[]) => permisos.includes("configuracion.administrar");

  // Datos para configurar la app de Meta (solo el dueño de la plataforma).
  app.get("/mensajeria/meta/info", async (request, reply) => {
    const usuario = await prisma.usuario.findUnique({ where: { id: request.user.usuarioId }, select: { email: true } });
    if (!usuario || !esSuperAdmin(usuario)) return reply.code(403).send({ error: "Solo el administrador de la plataforma" });
    return {
      webhookUrl: WEBHOOK_META,
      redirectUri: REDIRECT_META,
      appIdConfigurado: !!process.env.META_APP_ID,
      appSecretConfigurado: !!process.env.META_APP_SECRET,
      verifyTokenConfigurado: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    };
  });

  // Enlace a Facebook para que la tienda autorice su página e Instagram.
  app.get("/mensajeria/meta/conectar-url", async (request, reply) => {
    if (!puedeConfigurar(request.user.permisos)) {
      return reply.code(403).send({ error: "No tienes permiso para conectar canales" });
    }
    let appId: string;
    try {
      appId = configMeta().appId;
    } catch (err) {
      return reply.code(503).send({ error: err instanceof Error ? err.message : "Meta no está configurado" });
    }
    const state = app.jwt.sign(
      { usuarioId: request.user.usuarioId, empresaId: request.user.empresaId, rol: request.user.rol },
      { expiresIn: "15m" }
    );
    const url = new URL("https://www.facebook.com/v23.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", REDIRECT_META);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", PERMISOS_META.join(","));
    url.searchParams.set("response_type", "code");
    return { url: url.toString() };
  });

  app.get("/mensajeria/canales", async (request, reply) => {
    if (!puedeAtender(request.user.permisos) && !puedeConfigurar(request.user.permisos)) {
      return reply.code(403).send({ error: "No tienes permiso para ver los mensajes" });
    }
    return prisma.canalMensajeria.findMany({
      where: { empresaId: request.user.empresaId, activo: true },
      select: { id: true, tipo: true, nombre: true, usuario: true, fotoUrl: true, creadoEn: true },
      orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
    });
  });

  app.delete("/mensajeria/canales/:id", async (request, reply) => {
    if (!puedeConfigurar(request.user.permisos)) {
      return reply.code(403).send({ error: "No tienes permiso para desconectar canales" });
    }
    const { id } = request.params as { id: string };
    const r = await prisma.canalMensajeria.updateMany({
      where: { id, empresaId: request.user.empresaId },
      data: { activo: false },
    });
    if (r.count === 0) return reply.code(404).send({ error: "Canal no encontrado" });
    registrarAuditoria({
      empresaId: request.user.empresaId,
      usuarioId: request.user.usuarioId,
      accion: "MENSAJERIA_DESCONECTAR",
      entidad: "CanalMensajeria",
      entidadId: id,
    });
    return { ok: true };
  });

  // Trae las conversaciones recientes de todos los canales conectados (historial).
  app.post("/mensajeria/canales/importar", async (request, reply) => {
    if (!puedeAtender(request.user.permisos)) return reply.code(403).send({ error: "No tienes permiso" });
    const canales = await prisma.canalMensajeria.findMany({
      where: { empresaId: request.user.empresaId, activo: true, tipo: { in: ["MESSENGER", "INSTAGRAM"] } },
    });
    // Con el historial completo puede tardar varios minutos: se hace en segundo plano y la
    // bandeja se va llenando sola (cada conversación avisa en tiempo real).
    const empresaId = request.user.empresaId;
    void (async () => {
      for (const c of canales) {
        try {
          const r = await importarHistorial(c.id);
          console.log(`[mensajeria] Historial de ${c.usuario || c.nombre}: ${r.conversaciones} conversaciones, ${r.mensajes} mensajes nuevos`);
        } catch (err) {
          console.error(`[mensajeria] No se pudo traer el historial de ${c.nombre}:`, err instanceof Error ? err.message : err);
        }
      }
      emitMensajeNuevo(empresaId, { conversacionId: "", mensajeId: "", tipoCanal: "HISTORIAL" });
    })();
    return { enProceso: true, canales: canales.length };
  });

  // No leídos por canal (para las pestañas y el menú).
  app.get("/mensajeria/resumen", async (request) => {
    if (!puedeAtender(request.user.permisos)) return { total: 0, porCanal: {} };
    const filas = await prisma.conversacionMensajeria.findMany({
      where: { empresaId: request.user.empresaId, noLeidos: { gt: 0 }, canal: { activo: true } },
      select: { noLeidos: true, canal: { select: { tipo: true } } },
    });
    const porCanal: Record<string, number> = {};
    for (const f of filas) porCanal[f.canal.tipo] = (porCanal[f.canal.tipo] ?? 0) + 1;
    return { total: filas.length, porCanal };
  });

  app.get("/mensajeria/conversaciones", async (request, reply) => {
    if (!puedeAtender(request.user.permisos)) return reply.code(403).send({ error: "No tienes permiso para ver los mensajes" });
    const q = request.query as { tipo?: string; buscar?: string };
    const tipo = CANALES.includes(q.tipo as (typeof CANALES)[number]) ? q.tipo : undefined;
    const buscar = q.buscar?.trim();
    const conversaciones = await prisma.conversacionMensajeria.findMany({
      where: {
        empresaId: request.user.empresaId,
        canal: { activo: true, ...(tipo ? { tipo } : {}) },
        ...(buscar
          ? {
              OR: [
                { contactoNombre: { contains: buscar, mode: "insensitive" } },
                { contactoUsuario: { contains: buscar, mode: "insensitive" } },
                { ultimoMensajeTexto: { contains: buscar, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { canal: { select: { tipo: true, nombre: true, usuario: true } } },
      orderBy: { ultimoMensajeEn: "desc" },
      take: 200,
    });
    return conversaciones.map(({ canal, ...c }) => ({
      ...c,
      tipoCanal: canal.tipo,
      canalNombre: canal.usuario || canal.nombre,
      ventanaAbierta: !!c.ultimoEntranteEn && Date.now() - c.ultimoEntranteEn.getTime() < VENTANA_RESPUESTA_MS,
    }));
  });

  // Mensajes de una conversación (al abrirla queda leída).
  app.get("/mensajeria/conversaciones/:id/mensajes", async (request, reply) => {
    if (!puedeAtender(request.user.permisos)) return reply.code(403).send({ error: "No tienes permiso para ver los mensajes" });
    const { id } = request.params as { id: string };
    const conversacion = await prisma.conversacionMensajeria.findFirst({
      where: { id, empresaId: request.user.empresaId },
    });
    if (!conversacion) return reply.code(404).send({ error: "Conversación no encontrada" });
    if (conversacion.noLeidos > 0) {
      await prisma.conversacionMensajeria.update({ where: { id }, data: { noLeidos: 0 } });
    }
    const mensajes = await prisma.mensajeMensajeria.findMany({
      where: { conversacionId: id },
      orderBy: { creadoEn: "desc" },
      take: 300,
    });
    const cliente = conversacion.clienteId
      ? await prisma.cliente.findFirst({
          where: { id: conversacion.clienteId, empresaId: request.user.empresaId },
          select: { id: true, nombre: true, telefono: true, email: true, cedula: true, puntos: true },
        })
      : null;
    return { mensajes: mensajes.reverse(), cliente };
  });

  app.post("/mensajeria/conversaciones/:id/mensajes", async (request, reply) => {
    if (!puedeAtender(request.user.permisos)) return reply.code(403).send({ error: "No tienes permiso para responder" });
    const { id } = request.params as { id: string };
    const texto = String((request.body as { texto?: string })?.texto ?? "").trim();
    if (!texto) return reply.code(400).send({ error: "Escribe un mensaje" });
    if (texto.length > 1000) return reply.code(400).send({ error: "El mensaje es muy largo (máximo 1000 caracteres)" });

    const conversacion = await prisma.conversacionMensajeria.findFirst({
      where: { id, empresaId: request.user.empresaId },
      include: { canal: true },
    });
    if (!conversacion || !conversacion.canal.activo) return reply.code(404).send({ error: "Conversación no encontrada" });

    // Meta solo deja responder libremente durante 24 horas después del último mensaje del cliente.
    const abierta =
      !!conversacion.ultimoEntranteEn && Date.now() - conversacion.ultimoEntranteEn.getTime() < VENTANA_RESPUESTA_MS;
    if (!abierta) {
      return reply.code(409).send({
        error: "Pasaron más de 24 horas desde el último mensaje del cliente: Meta no permite responder hasta que vuelva a escribir.",
      });
    }
    if (conversacion.canal.tipo === "WHATSAPP") {
      return reply.code(501).send({ error: "WhatsApp todavía no está disponible" });
    }

    try {
      const externoId = await enviarTextoMeta(conversacion.canal, conversacion.contactoExternoId, texto);
      const mensaje = await prisma.mensajeMensajeria.create({
        data: {
          empresaId: conversacion.empresaId,
          conversacionId: id,
          direccion: "SALIENTE",
          texto,
          externoId,
          usuarioId: request.user.usuarioId,
        },
      });
      await prisma.conversacionMensajeria.update({
        where: { id },
        data: { ultimoMensajeEn: mensaje.creadoEn, ultimoMensajeTexto: texto, noLeidos: 0 },
      });
      emitMensajeNuevo(conversacion.empresaId, { conversacionId: id, mensajeId: mensaje.id, tipoCanal: conversacion.canal.tipo });
      return mensaje;
    } catch (err) {
      request.log.error(err);
      const msg = err instanceof ErrorMeta ? err.message : "No se pudo enviar el mensaje";
      return reply.code(502).send({ error: `Meta no aceptó el mensaje: ${msg}` });
    }
  });

  // Vincular un cliente de CENTRALA, asignar a un usuario o cerrar la conversación.
  app.patch("/mensajeria/conversaciones/:id", async (request, reply) => {
    if (!puedeAtender(request.user.permisos)) return reply.code(403).send({ error: "No tienes permiso" });
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { clienteId?: string | null; asignadoAId?: string | null; estado?: string };
    const data: Record<string, unknown> = {};
    if (body.clienteId !== undefined) {
      if (body.clienteId) {
        const cliente = await prisma.cliente.findFirst({ where: { id: body.clienteId, empresaId: request.user.empresaId } });
        if (!cliente) return reply.code(400).send({ error: "Cliente no encontrado" });
      }
      data.clienteId = body.clienteId || null;
    }
    if (body.asignadoAId !== undefined) data.asignadoAId = body.asignadoAId || null;
    if (body.estado === "ABIERTA" || body.estado === "CERRADA") data.estado = body.estado;
    const r = await prisma.conversacionMensajeria.updateMany({ where: { id, empresaId: request.user.empresaId }, data });
    if (r.count === 0) return reply.code(404).send({ error: "Conversación no encontrada" });
    return { ok: true };
  });
}
