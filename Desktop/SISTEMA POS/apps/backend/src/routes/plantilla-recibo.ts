import type { FastifyInstance } from "fastify";
import { GuardarPlantillaReciboSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

// Deja una sola plantilla marcada como predeterminada dentro de la empresa.
async function fijarPredeterminada(empresaId: string, plantillaId: string) {
  await prisma.$transaction([
    prisma.plantillaRecibo.updateMany({ where: { empresaId }, data: { esPredeterminada: false } }),
    prisma.plantillaRecibo.update({ where: { id: plantillaId }, data: { esPredeterminada: true } }),
  ]);
}

export async function plantillaReciboRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Compatibilidad: el POS y la impresion piden "la plantilla" (la
  // predeterminada). Si no hay ninguna, devuelve {} y el recibo sale con los
  // datos base.
  app.get("/plantilla-recibo", async (request) => {
    const { empresaId } = request.user;
    const plantilla =
      (await prisma.plantillaRecibo.findFirst({ where: { empresaId, esPredeterminada: true } })) ??
      (await prisma.plantillaRecibo.findFirst({ where: { empresaId }, orderBy: { actualizadoEn: "desc" } }));
    return plantilla ?? {};
  });

  // Lista todas las plantillas de la empresa.
  app.get("/plantillas-recibo", async (request) => {
    const { empresaId } = request.user;
    return prisma.plantillaRecibo.findMany({ where: { empresaId }, orderBy: { actualizadoEn: "asc" } });
  });

  // Crea una plantilla nueva. La primera de la empresa queda como predeterminada.
  app.post("/plantillas-recibo", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    const parsed = GuardarPlantillaReciboSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const total = await prisma.plantillaRecibo.count({ where: { empresaId } });
    const { esPredeterminada, ...datos } = parsed.data;
    const plantilla = await prisma.plantillaRecibo.create({
      data: { empresaId, ...datos, nombre: datos.nombre ?? `Plantilla ${total + 1}` },
    });
    if (total === 0 || esPredeterminada) await fijarPredeterminada(empresaId, plantilla.id);

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_PLANTILLA_RECIBO",
      entidad: "PlantillaRecibo",
      entidadId: plantilla.id,
      detalle: plantilla.nombre,
    });
    return reply.code(201).send(plantilla);
  });

  // Edita una plantilla. Si trae esPredeterminada=true, la fija como tal.
  app.put("/plantillas-recibo/:id", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = GuardarPlantillaReciboSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const existe = await prisma.plantillaRecibo.findFirst({ where: { id, empresaId } });
    if (!existe) return reply.code(404).send({ error: "Plantilla no encontrada" });

    const { esPredeterminada, ...datos } = parsed.data;
    const plantilla = await prisma.plantillaRecibo.update({ where: { id }, data: datos });
    if (esPredeterminada) await fijarPredeterminada(empresaId, id);

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ACTUALIZAR_PLANTILLA_RECIBO",
      entidad: "PlantillaRecibo",
      entidadId: id,
    });
    return prisma.plantillaRecibo.findUnique({ where: { id } });
  });

  // Marca una plantilla como la predeterminada.
  app.patch("/plantillas-recibo/:id/predeterminada", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const existe = await prisma.plantillaRecibo.findFirst({ where: { id, empresaId } });
    if (!existe) return reply.code(404).send({ error: "Plantilla no encontrada" });
    await fijarPredeterminada(empresaId, id);
    return { ok: true };
  });

  app.delete("/plantillas-recibo/:id", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const plantilla = await prisma.plantillaRecibo.findFirst({ where: { id, empresaId } });
    if (!plantilla) return reply.code(404).send({ error: "Plantilla no encontrada" });

    await prisma.plantillaRecibo.delete({ where: { id } });
    // Si se borro la predeterminada, promover otra para que el POS no quede sin plantilla.
    if (plantilla.esPredeterminada) {
      const otra = await prisma.plantillaRecibo.findFirst({ where: { empresaId }, orderBy: { actualizadoEn: "asc" } });
      if (otra) await fijarPredeterminada(empresaId, otra.id);
    }
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ELIMINAR_PLANTILLA_RECIBO",
      entidad: "PlantillaRecibo",
      entidadId: id,
      detalle: plantilla.nombre,
    });
    return reply.code(204).send();
  });
}
