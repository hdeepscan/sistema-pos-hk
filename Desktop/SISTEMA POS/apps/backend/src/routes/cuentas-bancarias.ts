import type { FastifyInstance } from "fastify";
import { CrearCuentaBancariaSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

export async function cuentasBancariasRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/cuentas-bancarias", async (request) => {
    const { empresaId } = request.user;
    const { soloActivas } = request.query as { soloActivas?: string };
    return prisma.cuentaBancaria.findMany({
      where: { empresaId, ...(soloActivas === "true" ? { activa: true } : {}) },
      orderBy: { creadoEn: "asc" },
    });
  });

  app.post("/cuentas-bancarias", async (request, reply) => {
    if (!request.user.permisos.includes("caja.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar cuentas" });
    }
    const { empresaId } = request.user;
    const parsed = CrearCuentaBancariaSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const cuenta = await prisma.cuentaBancaria.create({ data: { empresaId, ...parsed.data } });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_CUENTA_BANCARIA",
      entidad: "CuentaBancaria",
      entidadId: cuenta.id,
      detalle: cuenta.nombre,
    });
    return reply.code(201).send(cuenta);
  });

  app.put("/cuentas-bancarias/:id", async (request, reply) => {
    if (!request.user.permisos.includes("caja.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar cuentas" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = CrearCuentaBancariaSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const existe = await prisma.cuentaBancaria.findFirst({ where: { id, empresaId } });
    if (!existe) return reply.code(404).send({ error: "Cuenta no encontrada" });

    const cuenta = await prisma.cuentaBancaria.update({ where: { id }, data: parsed.data });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ACTUALIZAR_CUENTA_BANCARIA",
      entidad: "CuentaBancaria",
      entidadId: id,
    });
    return cuenta;
  });

  app.delete("/cuentas-bancarias/:id", async (request, reply) => {
    if (!request.user.permisos.includes("caja.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar cuentas" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const cuenta = await prisma.cuentaBancaria.findFirst({ where: { id, empresaId } });
    if (!cuenta) return reply.code(404).send({ error: "Cuenta no encontrada" });
    await prisma.cuentaBancaria.delete({ where: { id } });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ELIMINAR_CUENTA_BANCARIA",
      entidad: "CuentaBancaria",
      entidadId: id,
      detalle: cuenta.nombre,
    });
    return reply.code(204).send();
  });
}
