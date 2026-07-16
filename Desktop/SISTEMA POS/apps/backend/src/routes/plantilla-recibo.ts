import type { FastifyInstance } from "fastify";
import { GuardarPlantillaReciboSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

export async function plantillaReciboRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/plantilla-recibo", async (request) => {
    const { empresaId } = request.user;
    const plantilla = await prisma.plantillaRecibo.findUnique({ where: { empresaId } });
    return plantilla ?? {};
  });

  app.put("/plantilla-recibo", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    const parsed = GuardarPlantillaReciboSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const plantilla = await prisma.plantillaRecibo.upsert({
      where: { empresaId },
      update: parsed.data,
      create: { empresaId, ...parsed.data },
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ACTUALIZAR_PLANTILLA_RECIBO",
      entidad: "PlantillaRecibo",
      entidadId: plantilla.id,
    });

    return plantilla;
  });

  // Restaura la plantilla por defecto (borra la fila; el recibo vuelve a
  // mostrar solo los datos base de la empresa).
  app.delete("/plantilla-recibo", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    await prisma.plantillaRecibo.deleteMany({ where: { empresaId } });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "RESTAURAR_PLANTILLA_RECIBO",
      entidad: "PlantillaRecibo",
    });
    return reply.code(204).send();
  });
}
