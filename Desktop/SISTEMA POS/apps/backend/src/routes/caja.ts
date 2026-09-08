import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function cajaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // POST /caja/abrir - Abre turno de caja con saldo inicial
  app.post<{ Body: { saldoInicial: number } }>("/caja/abrir", async (req, reply) => {
    try {
      const { empresaId, usuarioId } = req.user;
      const sucursal = await prisma.sucursal.findFirst({ where: { empresaId, activo: true } });
      if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

      // Verificar que no haya caja abierta
      const cajaAbierta = await prisma.turnoCaja.findFirst({
        where: { empresaId, fechaCierre: null },
      });
      if (cajaAbierta) return reply.code(400).send({ error: "Caja ya está abierta" });

      const turno = await prisma.turnoCaja.create({
        data: {
          empresaId,
          sucursalId: sucursal.id,
          usuarioAperturaId: usuarioId,
          saldoInicial: parseFloat(req.body.saldoInicial.toString()),
        },
      });

      reply.send({ success: true, turno, mensaje: "Caja abierta" });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // GET /caja/estado - Retorna estado actual del turno con resumen multicanal
  app.get("/caja/estado", async (req, reply) => {
    try {
      const { empresaId } = req.user;
      const turno = await prisma.turnoCaja.findFirst({
        where: { empresaId, fechaCierre: null },
        include: { usuarioApertura: { select: { nombre: true } } },
      });

      if (!turno) return reply.send({ estado: "CERRADA", turno: null });

      // Obtener todas las ventas del turno
      const ventas = await prisma.venta.findMany({
        where: {
          empresaId,
          sucursalId: turno.sucursalId,
          fecha: { gte: turno.fechaApertura, lte: new Date() },
        },
      });

      // Agrupar ventas por método de pago
      let ventasEfectivo = 0,
        ventasTarjeta = 0,
        ventasTransferencia = 0,
        ventasCredito = 0,
        ventasOtro = 0;

      for (const v of ventas) {
        const total = Number(v.total);
        switch (v.metodoPago) {
          case "EFECTIVO":
            ventasEfectivo += total;
            break;
          case "TARJETA":
            ventasTarjeta += total;
            break;
          case "TRANSFERENCIA":
            ventasTransferencia += total;
            break;
          case "CREDITO":
            ventasCredito += total;
            break;
          default:
            ventasOtro += total;
        }
      }

      // Calcular esperados: Efectivo = saldo inicial + ventas - egresos + ingresos
      // Otros métodos = solo sus ventas
      const esperadoEfectivo =
        Number(turno.saldoInicial) + ventasEfectivo + Number(turno.ingresos) - Number(turno.egresos);

      // Actualizar esperados en BD (útil para auditoría)
      await prisma.turnoCaja.update({
        where: { id: turno.id },
        data: {
          ventasEfectivo,
          ventasTarjeta,
          ventasTransferencia,
          ventasCredito,
          ventasOtro,
          esperadoEfectivo,
          esperadoTarjeta: ventasTarjeta,
          esperadoTransferencia: ventasTransferencia,
          esperadoCredito: ventasCredito,
          esperadoOtro: ventasOtro,
        },
      });

      reply.send({
        estado: "ABIERTA",
        turno: {
          id: turno.id,
          usuario: turno.usuarioApertura.nombre,
          saldoInicial: Number(turno.saldoInicial),
        },
        canales: {
          efectivo: { esperado: esperadoEfectivo, vendido: ventasEfectivo },
          tarjeta: { esperado: ventasTarjeta, vendido: ventasTarjeta },
          transferencia: { esperado: ventasTransferencia, vendido: ventasTransferencia },
          credito: { esperado: ventasCredito, vendido: ventasCredito },
          otro: { esperado: ventasOtro, vendido: ventasOtro },
        },
        totales: {
          ventasTotales: ventasEfectivo + ventasTarjeta + ventasTransferencia + ventasCredito + ventasOtro,
          ingresos: Number(turno.ingresos),
          egresos: Number(turno.egresos),
        },
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /caja/movimiento - Registra movimiento manual (ingreso/egreso)
  app.post<{ Body: { tipo: "INGRESO" | "EGRESO"; monto: number; concepto: string } }>(
    "/caja/movimiento",
    async (req, reply) => {
      try {
        const { empresaId, usuarioId } = req.user;
        const turno = await prisma.turnoCaja.findFirst({
          where: { empresaId, fechaCierre: null },
        });

        if (!turno) return reply.code(400).send({ error: "No hay caja abierta" });

        const monto = parseFloat(req.body.monto.toString());
        const tipo = req.body.tipo;

        // Registrar movimiento
        await prisma.movimientoCaja.create({
          data: {
            turnoId: turno.id,
            tipo,
            monto,
            concepto: req.body.concepto,
          },
        });

        // Actualizar sumas en turno
        if (tipo === "INGRESO") {
          await prisma.turnoCaja.update({
            where: { id: turno.id },
            data: { ingresos: { increment: monto } },
          });
        } else {
          await prisma.turnoCaja.update({
            where: { id: turno.id },
            data: { egresos: { increment: monto } },
          });
        }

        reply.send({ success: true, mensaje: `${tipo} de $${monto} registrado` });
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // POST /caja/cerrar - Cierre multicanal (ciego para efectivo, verificación para otros)
  app.post<{
    Body: {
      reportadoEfectivo: number;
      reportadoTarjeta?: number;
      reportadoTransferencia?: number;
      reportadoCredito?: number;
      reportadoOtro?: number;
      observaciones?: string;
    };
  }>("/caja/cerrar", async (req, reply) => {
    try {
      const { empresaId, usuarioId } = req.user;
      const turno = await prisma.turnoCaja.findFirst({
        where: { empresaId, fechaCierre: null },
        include: { usuarioApertura: true },
      });

      if (!turno) return reply.code(400).send({ error: "No hay caja abierta" });

      // Obtener ventas del turno
      const ventas = await prisma.venta.findMany({
        where: {
          empresaId,
          sucursalId: turno.sucursalId,
          fecha: { gte: turno.fechaApertura, lte: new Date() },
        },
      });

      // Agrupar ventas por método
      let ventasEfectivo = 0,
        ventasTarjeta = 0,
        ventasTransferencia = 0,
        ventasCredito = 0,
        ventasOtro = 0;

      for (const v of ventas) {
        const total = Number(v.total);
        switch (v.metodoPago) {
          case "EFECTIVO":
            ventasEfectivo += total;
            break;
          case "TARJETA":
            ventasTarjeta += total;
            break;
          case "TRANSFERENCIA":
            ventasTransferencia += total;
            break;
          case "CREDITO":
            ventasCredito += total;
            break;
          default:
            ventasOtro += total;
        }
      }

      // Calcular esperados
      const esperadoEfectivo =
        Number(turno.saldoInicial) + ventasEfectivo + Number(turno.ingresos) - Number(turno.egresos);

      // Obtener montos reportados
      const reportadoEfectivo = parseFloat(req.body.reportadoEfectivo.toString());
      const reportadoTarjeta = req.body.reportadoTarjeta ? parseFloat(req.body.reportadoTarjeta.toString()) : 0;
      const reportadoTransferencia = req.body.reportadoTransferencia
        ? parseFloat(req.body.reportadoTransferencia.toString())
        : 0;
      const reportadoCredito = req.body.reportadoCredito ? parseFloat(req.body.reportadoCredito.toString()) : 0;
      const reportadoOtro = req.body.reportadoOtro ? parseFloat(req.body.reportadoOtro.toString()) : 0;

      // Calcular diferencias
      const diferenciaEfectivo = reportadoEfectivo - esperadoEfectivo;
      const diferenciaTarjeta = reportadoTarjeta - ventasTarjeta;
      const diferenciaTransferencia = reportadoTransferencia - ventasTransferencia;
      const diferenciaCredito = reportadoCredito - ventasCredito;
      const diferenciaOtro = reportadoOtro - ventasOtro;

      // Actualizar turno con cierre multicanal
      await prisma.turnoCaja.update({
        where: { id: turno.id },
        data: {
          ventasEfectivo,
          ventasTarjeta,
          ventasTransferencia,
          ventasCredito,
          ventasOtro,
          esperadoEfectivo,
          esperadoTarjeta: ventasTarjeta,
          esperadoTransferencia: ventasTransferencia,
          esperadoCredito: ventasCredito,
          esperadoOtro: ventasOtro,
          reportadoEfectivo,
          reportadoTarjeta,
          reportadoTransferencia,
          reportadoCredito,
          reportadoOtro,
          diferenciaEfectivo,
          diferenciaTarjeta,
          diferenciaTransferencia,
          diferenciaCredito,
          diferenciaOtro,
          usuarioCierreId: usuarioId,
          fechaCierre: new Date(),
          observaciones: req.body.observaciones,
        },
      });

      // Determinar estado por cada canal
      const calcularEstado = (diferencia: number) => {
        const abs = Math.abs(diferencia);
        if (abs < 0.01) return "CUADRADO";
        return diferencia > 0 ? "SOBRANTE" : "FALTANTE";
      };

      reply.send({
        success: true,
        cierre: {
          efectivo: {
            esperado: esperadoEfectivo,
            reportado: reportadoEfectivo,
            diferencia: diferenciaEfectivo,
            estado: calcularEstado(diferenciaEfectivo),
          },
          tarjeta: {
            esperado: ventasTarjeta,
            reportado: reportadoTarjeta,
            diferencia: diferenciaTarjeta,
            estado: calcularEstado(diferenciaTarjeta),
          },
          transferencia: {
            esperado: ventasTransferencia,
            reportado: reportadoTransferencia,
            diferencia: diferenciaTransferencia,
            estado: calcularEstado(diferenciaTransferencia),
          },
          credito: {
            esperado: ventasCredito,
            reportado: reportadoCredito,
            diferencia: diferenciaCredito,
            estado: calcularEstado(diferenciaCredito),
          },
          otro: {
            esperado: ventasOtro,
            reportado: reportadoOtro,
            diferencia: diferenciaOtro,
            estado: calcularEstado(diferenciaOtro),
          },
        },
        mensaje: "Caja cerrada - Arqueo multicanal completado",
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // GET /caja/historial - Últimos 30 cierres para auditoría
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
          canales: {
            efectivo: {
              diferencia: Number(t.diferenciaEfectivo),
              estado:
                Math.abs(Number(t.diferenciaEfectivo || 0)) < 0.01
                  ? "CUADRADO"
                  : Number(t.diferenciaEfectivo) > 0
                    ? "SOBRANTE"
                    : "FALTANTE",
            },
            tarjeta: {
              diferencia: Number(t.diferenciaTarjeta),
              estado:
                Math.abs(Number(t.diferenciaTarjeta || 0)) < 0.01
                  ? "CUADRADO"
                  : Number(t.diferenciaTarjeta) > 0
                    ? "SOBRANTE"
                    : "FALTANTE",
            },
            transferencia: {
              diferencia: Number(t.diferenciaTransferencia),
              estado:
                Math.abs(Number(t.diferenciaTransferencia || 0)) < 0.01
                  ? "CUADRADO"
                  : Number(t.diferenciaTransferencia) > 0
                    ? "SOBRANTE"
                    : "FALTANTE",
            },
            credito: {
              diferencia: Number(t.diferenciaCredito),
              estado:
                Math.abs(Number(t.diferenciaCredito || 0)) < 0.01
                  ? "CUADRADO"
                  : Number(t.diferenciaCredito) > 0
                    ? "SOBRANTE"
                    : "FALTANTE",
            },
            otro: {
              diferencia: Number(t.diferenciaOtro),
              estado:
                Math.abs(Number(t.diferenciaOtro || 0)) < 0.01
                  ? "CUADRADO"
                  : Number(t.diferenciaOtro) > 0
                    ? "SOBRANTE"
                    : "FALTANTE",
            },
          },
        })),
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
