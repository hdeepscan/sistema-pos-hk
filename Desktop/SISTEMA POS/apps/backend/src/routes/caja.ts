import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function cajaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post<{ Body: { montoInicial: number } }>("/caja/abrir", async (req, reply) => {
    try {
      const { empresaId, usuarioId } = req.user;
      const sucursal = await prisma.sucursal.findFirst({ where: { empresaId, activo: true } });
      if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

      const turno = await prisma.turnoCaja.create({
        data: {
          empresaId,
          sucursalId: sucursal.id,
          usuarioAperturaId: usuarioId,
          montoInicial: parseFloat(req.body.montoInicial.toString()),
        },
      });

      reply.send({ success: true, turno, mensaje: "Caja abierta" });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.get("/caja/estado", async (req, reply) => {
    try {
      const { empresaId } = req.user;
      const turno = await prisma.turnoCaja.findFirst({
        where: { empresaId, fechaCierre: null },
        include: { usuarioApertura: { select: { nombre: true } } },
      });

      if (!turno) return reply.send({ estado: "CERRADA", turno: null });

      const ventas = await prisma.venta.findMany({
        where: {
          empresaId,
          sucursalId: turno.sucursalId,
          fecha: { gte: turno.fechaApertura, lte: new Date() },
        },
      });

      let ventasEfectivo = 0, ventasTarjeta = 0;
      for (const v of ventas) {
        if (v.metodoPago === "EFECTIVO") ventasEfectivo += Number(v.total);
        else if (v.metodoPago === "TARJETA") ventasTarjeta += Number(v.total);
      }

      const esperadoEfectivo = Number(turno.montoInicial) + ventasEfectivo;

      reply.send({
        estado: "ABIERTA",
        turno: { id: turno.id, usuario: turno.usuarioApertura.nombre },
        montoInicial: Number(turno.montoInicial),
        ventasEfectivo,
        ventasTarjeta,
        esperadoEfectivo,
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.post<{ Body: { montoContado: number } }>("/caja/cerrar", async (req, reply) => {
    try {
      const { empresaId, usuarioId } = req.user;
      const turno = await prisma.turnoCaja.findFirst({
        where: { empresaId, fechaCierre: null },
      });

      if (!turno) return reply.code(400).send({ error: "No hay caja abierta" });

      const ventas = await prisma.venta.findMany({
        where: {
          empresaId,
          sucursalId: turno.sucursalId,
          fecha: { gte: turno.fechaApertura, lte: new Date() },
        },
      });

      let ventasEfectivo = 0;
      for (const v of ventas) if (v.metodoPago === "EFECTIVO") ventasEfectivo += Number(v.total);

      const totalEsperado = Number(turno.montoInicial) + ventasEfectivo;
      const diferencia = parseFloat(req.body.montoContado.toString()) - totalEsperado;

      await prisma.turnoCaja.update({
        where: { id: turno.id },
        data: {
          ventasEfectivo,
          totalEsperado,
          montoContado: parseFloat(req.body.montoContado.toString()),
          diferencia,
          usuarioCierreId: usuarioId,
          fechaCierre: new Date(),
        },
      });

      const estado = Math.abs(diferencia) < 0.01 ? "CUADRADO" : diferencia > 0 ? "SOBRANTE" : "FALTANTE";

      reply.send({
        success: true,
        estado,
        diferencia,
        mensaje: estado === "CUADRADO" ? "Caja cuadrada" : `${estado}: $${Math.abs(diferencia)}`,
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  app.get("/caja/historial", async (req, reply) => {
    try {
      const { empresaId } = req.user;
      const historial = await prisma.turnoCaja.findMany({
        where: { empresaId, fechaCierre: { not: null } },
        include: { usuarioApertura: { select: { nombre: true } } },
        orderBy: { fechaCierre: "desc" },
        take: 30,
      });

      reply.send({
        total: historial.length,
        turnos: historial.map((t) => ({
          fecha: t.fechaCierre,
          usuario: t.usuarioApertura.nombre,
          diferencia: Number(t.diferencia),
          estado: Math.abs(Number(t.diferencia)) < 0.01 ? "CUADRADO" : Number(t.diferencia) > 0 ? "SOBRANTE" : "FALTANTE",
        })),
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
