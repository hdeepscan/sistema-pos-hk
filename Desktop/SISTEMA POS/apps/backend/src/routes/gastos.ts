import type { FastifyInstance } from "fastify";
import { CrearGastoSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";

export async function gastosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/gastos", async (request) => {
    const { empresaId } = request.user;
    const { sucursalId, desde, hasta } = request.query as {
      sucursalId?: string;
      desde?: string;
      hasta?: string;
    };
    return prisma.gasto.findMany({
      where: {
        empresaId,
        ...(sucursalId ? { sucursalId } : {}),
        ...(desde || hasta
          ? {
              fecha: {
                ...(desde ? { gte: new Date(desde) } : {}),
                ...(hasta ? { lte: new Date(hasta) } : {}),
              },
            }
          : {}),
      },
      orderBy: { fecha: "desc" },
      take: 200,
    });
  });

  app.post("/gastos", async (request, reply) => {
    if (!request.user.permisos.includes("gastos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para gestionar gastos" });
    }
    const { empresaId, usuarioId } = request.user;
    const parsed = CrearGastoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const gasto = await prisma.gasto.create({
      data: { empresaId, usuarioId, ...parsed.data },
    });
    return reply.code(201).send(gasto);
  });
}
