import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface JwtPayload {
  usuarioId: string;
  empresaId: string;
  rol: "ADMIN" | "GERENTE" | "CAJERO";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
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

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: "No autorizado" });
    }
  });
}
