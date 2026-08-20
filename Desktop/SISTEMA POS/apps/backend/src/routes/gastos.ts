import type { FastifyInstance } from "fastify";
import type { Prisma } from '@prisma/client';
import { CrearGastoSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { mensajeDeValidacion } from "../lib/errores.js";

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
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const gasto = await prisma.gasto.create({
      data: { empresaId, usuarioId, ...parsed.data } as Prisma.GastoUncheckedCreateInput,
    });
    return reply.code(201).send(gasto);
  });

  // Eliminar un gasto
  app.delete("/gastos/:id", async (request, reply) => {
    if (!request.user.permisos.includes("gastos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para eliminar gastos" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };

    // Verificar que el gasto existe y pertenece a la empresa del usuario
    const gasto = await prisma.gasto.findFirst({
      where: { id, empresaId },
    });

    if (!gasto) {
      return reply.code(404).send({ error: "Gasto no encontrado" });
    }

    // Eliminar el gasto
    await prisma.gasto.delete({
      where: { id },
    });

    return reply.code(200).send({ mensaje: "Gasto eliminado correctamente" });
  });
}
