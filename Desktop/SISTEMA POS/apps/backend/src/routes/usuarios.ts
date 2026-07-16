import type { FastifyInstance } from "fastify";
import { CrearUsuarioSchema, ActualizarUsuarioSchema, PERMISOS_POR_ROL } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { registrarAuditoria } from "../lib/auditoria.js";

function permisosDe(usuario: { rol: keyof typeof PERMISOS_POR_ROL; permisos: string[] }) {
  return usuario.permisos.length > 0 ? usuario.permisos : PERMISOS_POR_ROL[usuario.rol];
}

function sinPassword<T extends { passwordHash: string }>(usuario: T) {
  const { passwordHash, ...resto } = usuario;
  return resto;
}

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/usuarios", async (request, reply) => {
    if (!request.user.permisos.includes("usuarios.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar usuarios" });
    }
    const { empresaId } = request.user;
    const usuarios = await prisma.usuario.findMany({ where: { empresaId }, orderBy: { creadoEn: "asc" } });
    return usuarios.map((u) => ({ ...sinPassword(u), permisosEfectivos: permisosDe(u) }));
  });

  app.post("/usuarios", async (request, reply) => {
    if (!request.user.permisos.includes("usuarios.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar usuarios" });
    }
    const { empresaId } = request.user;
    const parsed = CrearUsuarioSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
    if (existente) return reply.code(409).send({ error: "Ya existe un usuario con ese email" });

    const passwordHash = await hashPassword(parsed.data.password);
    const usuario = await prisma.usuario.create({
      data: {
        empresaId,
        nombre: parsed.data.nombre,
        email: parsed.data.email,
        passwordHash,
        rol: parsed.data.rol,
        permisos: parsed.data.permisos ?? [],
      },
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_USUARIO",
      entidad: "Usuario",
      entidadId: usuario.id,
      detalle: `${usuario.nombre} (${usuario.email}) - rol ${usuario.rol}`,
    });

    return reply.code(201).send({ ...sinPassword(usuario), permisosEfectivos: permisosDe(usuario) });
  });

  app.patch("/usuarios/:id", async (request, reply) => {
    if (!request.user.permisos.includes("usuarios.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar usuarios" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = ActualizarUsuarioSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const usuario = await prisma.usuario.findFirst({ where: { id, empresaId } });
    if (!usuario) return reply.code(404).send({ error: "Usuario no encontrado" });

    const dejaDeSerAdminActivo =
      usuario.rol === "ADMIN" &&
      usuario.activo &&
      ((parsed.data.rol && parsed.data.rol !== "ADMIN") || parsed.data.activo === false);
    if (dejaDeSerAdminActivo) {
      const otrosAdmins = await prisma.usuario.count({
        where: { empresaId, rol: "ADMIN", activo: true, id: { not: id } },
      });
      if (otrosAdmins === 0) {
        return reply.code(400).send({ error: "Debe quedar al menos un administrador activo" });
      }
    }

    const { password, ...resto } = parsed.data;
    const actualizado = await prisma.usuario.update({
      where: { id },
      data: {
        ...resto,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ACTUALIZAR_USUARIO",
      entidad: "Usuario",
      entidadId: id,
      detalle: `${actualizado.nombre}: ${Object.keys(resto).join(", ")}${password ? ", password" : ""}`,
    });

    return { ...sinPassword(actualizado), permisosEfectivos: permisosDe(actualizado) };
  });

  app.get("/auditoria", async (request, reply) => {
    if (!request.user.permisos.includes("usuarios.administrar") && !request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para ver la auditoria" });
    }
    const { empresaId } = request.user;
    const { limit, usuarioId, accion, desde, hasta } = request.query as {
      limit?: string;
      usuarioId?: string;
      accion?: string;
      desde?: string;
      hasta?: string;
    };
    return prisma.registroAuditoria.findMany({
      where: {
        empresaId,
        ...(usuarioId ? { usuarioId } : {}),
        ...(accion ? { accion } : {}),
        ...(desde || hasta
          ? {
              fecha: {
                ...(desde ? { gte: new Date(desde) } : {}),
                ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999`) } : {}),
              },
            }
          : {}),
      },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { fecha: "desc" },
      take: Math.min(Number(limit) || 100, 500),
    });
  });
}
