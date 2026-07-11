import type { FastifyInstance } from "fastify";
import { CrearSucursalSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";

export async function sucursalesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/sucursales", async (request) => {
    const { empresaId } = request.user;
    return prisma.sucursal.findMany({
      where: { empresaId, activo: true },
      orderBy: { nombre: "asc" },
    });
  });

  app.post("/sucursales", async (request, reply) => {
    const { empresaId } = request.user;
    const parsed = CrearSucursalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const sucursal = await prisma.sucursal.create({
      data: { empresaId, ...parsed.data },
    });
    return reply.code(201).send(sucursal);
  });

  app.delete("/sucursales/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const sucursal = await prisma.sucursal.findFirst({ where: { id, empresaId } });
    if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });
    await prisma.sucursal.update({ where: { id }, data: { activo: false } });
    return reply.code(204).send();
  });
}
