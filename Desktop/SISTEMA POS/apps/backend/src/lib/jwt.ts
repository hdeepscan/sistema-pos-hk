import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Permiso, RolUsuario } from "@sistema-pos/shared";
import { PERMISOS_POR_ROL } from "@sistema-pos/shared";
import { prisma } from "./prisma.js";

export interface JwtPayload {
  usuarioId: string;
  empresaId: string;
  rol: RolUsuario;
  // No se firma en el token: se completa en cada request en el hook
  // `authenticate` con datos frescos de la DB (ver mas abajo).
  permisos: Permiso[];
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { usuarioId: string; empresaId: string; rol: RolUsuario };
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerJwt(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  });

  // Ademas de validar la firma del token, resuelve el usuario fresco en cada
  // request: asi, desactivar un usuario o cambiar su rol/permisos aplica de
  // inmediato sin esperar a que expire o se renueve el token.
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    // SKIP: /shopify/callback no requiere autenticación de usuario (OAuth requiere state CSRF en BD)
    if (request.url.startsWith("/shopify/callback")) {
      return; // Sin autenticación, continúa normalmente
    }

    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "No autorizado" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: request.user.usuarioId },
      select: { activo: true, rol: true, permisos: true, empresa: { select: { activo: true } } },
    });
    if (!usuario || !usuario.activo || !usuario.empresa.activo) {
      return reply.code(401).send({ error: "Usuario inactivo o no encontrado" });
    }

    request.user.rol = usuario.rol;
    request.user.permisos = (
      usuario.permisos.length > 0 ? usuario.permisos : PERMISOS_POR_ROL[usuario.rol]
    ) as Permiso[];
  });
}

// preHandler factory: exige que el usuario autenticado tenga un permiso
// puntual (ej. "usuarios.administrar"). Usar junto a app.authenticate.
export function requierePermiso(permiso: Permiso) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user.permisos?.includes(permiso)) {
      return reply.code(403).send({ error: "No tienes permiso para realizar esta accion" });
    }
  };
}
