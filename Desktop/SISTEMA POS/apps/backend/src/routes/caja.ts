import type { FastifyInstance } from "fastify";
import { AbrirCajaSchema, CerrarCajaSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";

export async function cajaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Turno abierto actualmente en una sucursal (o null).
  app.get("/caja/actual", async (request) => {
    const { empresaId } = request.user;
    const { sucursalId } = request.query as { sucursalId?: string };
    const turno = await prisma.turnoCaja.findFirst({
      where: { empresaId, ...(sucursalId ? { sucursalId } : {}), fechaCierre: null },
      include: { usuarioApertura: { select: { nombre: true } } },
      orderBy: { fechaApertura: "desc" },
    });
    return turno ?? null;
  });

  app.post("/caja/abrir", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("caja.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para abrir la caja" });
    }
    const parsed = AbrirCajaSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { sucursalId, montoInicial } = parsed.data;

    const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

    const abierto = await prisma.turnoCaja.findFirst({ where: { empresaId, sucursalId, fechaCierre: null } });
    if (abierto) {
      return reply.code(409).send({ error: "Ya hay una caja abierta en esta sucursal. Cierrala antes de abrir otra." });
    }

    const turno = await prisma.turnoCaja.create({
      data: { empresaId, sucursalId, usuarioAperturaId: usuarioId, montoInicial },
      include: { usuarioApertura: { select: { nombre: true } } },
    });

    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "APERTURA_CAJA",
      entidad: "TurnoCaja",
      entidadId: turno.id,
      detalle: `${sucursal.nombre}: monto inicial $${montoInicial}`,
    });

    return reply.code(201).send(turno);
  });

  app.post("/caja/cerrar", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("caja.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para cerrar la caja" });
    }
    const parsed = CerrarCajaSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { sucursalId, montoContado } = parsed.data;

    const turno = await prisma.turnoCaja.findFirst({
      where: { empresaId, sucursalId, fechaCierre: null },
      orderBy: { fechaApertura: "desc" },
    });
    if (!turno) return reply.code(404).send({ error: "No hay una caja abierta en esta sucursal" });

    const fechaCierre = new Date();
    const ventasEfectivoAgg = await prisma.venta.aggregate({
      where: {
        empresaId,
        sucursalId,
        metodoPago: "EFECTIVO",
        fecha: { gte: turno.fechaApertura, lte: fechaCierre },
      },
      _sum: { total: true },
      _count: true,
    });
    const ventasEfectivo = Number(ventasEfectivoAgg._sum.total ?? 0);
    const totalEsperado = Number(turno.montoInicial) + ventasEfectivo;
    const diferencia = Math.round((montoContado - totalEsperado) * 100) / 100;

    const cerrado = await prisma.turnoCaja.update({
      where: { id: turno.id },
      data: {
        fechaCierre,
        usuarioCierreId: usuarioId,
        ventasEfectivo,
        totalEsperado,
        montoContado,
        diferencia,
      },
      include: {
        usuarioApertura: { select: { nombre: true } },
        usuarioCierre: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
      },
    });

    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "CIERRE_CAJA",
      entidad: "TurnoCaja",
      entidadId: turno.id,
      detalle: `Esperado $${totalEsperado}, contado $${montoContado}, diferencia $${diferencia}`,
    });

    return { ...cerrado, numeroVentasEfectivo: ventasEfectivoAgg._count };
  });

  app.get("/caja/historial", async (request) => {
    const { empresaId } = request.user;
    const { sucursalId, limit } = request.query as { sucursalId?: string; limit?: string };
    return prisma.turnoCaja.findMany({
      where: { empresaId, ...(sucursalId ? { sucursalId } : {}), fechaCierre: { not: null } },
      include: {
        usuarioApertura: { select: { nombre: true } },
        usuarioCierre: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
      },
      orderBy: { fechaApertura: "desc" },
      take: Math.min(Number(limit) || 50, 200),
    });
  });
}
