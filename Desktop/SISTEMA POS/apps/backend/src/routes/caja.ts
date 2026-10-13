import type { FastifyInstance } from "fastify";
import type { TurnoCaja } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Canal = "efectivo" | "tarjeta" | "transferencia" | "credito" | "otro";
type PorCanal = Record<Canal, number>;

const CANAL_POR_METODO: Record<string, Canal> = {
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  TRANSFERENCIA: "transferencia",
  CREDITO: "credito",
};

function montoNoNegativo(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") return 0;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Cada canal espera su saldo inicial más sus ventas del turno. Solo el efectivo suma
// ingresos y resta egresos manuales, porque esos movimientos son dinero físico.
async function calcularCanales(empresaId: string, turno: TurnoCaja) {
  const ventas = await prisma.venta.findMany({
    where: {
      empresaId,
      sucursalId: turno.sucursalId,
      fecha: { gte: turno.fechaApertura, lte: new Date() },
    },
    select: { total: true, metodoPago: true },
  });

  const vendido: PorCanal = { efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0, otro: 0 };
  for (const v of ventas) {
    vendido[CANAL_POR_METODO[v.metodoPago] ?? "otro"] += Number(v.total);
  }

  const inicial: PorCanal = {
    efectivo: Number(turno.saldoInicial),
    tarjeta: Number(turno.saldoInicialTarjeta),
    transferencia: Number(turno.saldoInicialTransferencia),
    credito: Number(turno.saldoInicialCredito),
    otro: Number(turno.saldoInicialOtro),
  };

  const esperado: PorCanal = {
    efectivo: inicial.efectivo + vendido.efectivo + Number(turno.ingresos) - Number(turno.egresos),
    tarjeta: inicial.tarjeta + vendido.tarjeta,
    transferencia: inicial.transferencia + vendido.transferencia,
    credito: inicial.credito + vendido.credito,
    otro: inicial.otro + vendido.otro,
  };

  return { vendido, inicial, esperado };
}

function datosEsperados(vendido: PorCanal, esperado: PorCanal) {
  return {
    ventasEfectivo: vendido.efectivo,
    ventasTarjeta: vendido.tarjeta,
    ventasTransferencia: vendido.transferencia,
    ventasCredito: vendido.credito,
    ventasOtro: vendido.otro,
    esperadoEfectivo: esperado.efectivo,
    esperadoTarjeta: esperado.tarjeta,
    esperadoTransferencia: esperado.transferencia,
    esperadoCredito: esperado.credito,
    esperadoOtro: esperado.otro,
  };
}

const suma = (valores: PorCanal) => Object.values(valores).reduce((a, b) => a + b, 0);

export async function cajaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // POST /caja/abrir - Abre turno de caja con el saldo inicial de cada canal
  app.post<{
    Body: {
      saldoInicial?: number;
      saldoInicialTarjeta?: number;
      saldoInicialTransferencia?: number;
      saldoInicialCredito?: number;
      saldoInicialOtro?: number;
    };
  }>("/caja/abrir", async (req, reply) => {
    try {
      const { empresaId, usuarioId } = req.user;
      const sucursal = await prisma.sucursal.findFirst({ where: { empresaId, activo: true } });
      if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

      const cajaAbierta = await prisma.turnoCaja.findFirst({
        where: { empresaId, fechaCierre: null },
      });
      if (cajaAbierta) return reply.code(400).send({ error: "Caja ya está abierta" });

      const efectivo = montoNoNegativo(req.body.saldoInicial);
      const tarjeta = montoNoNegativo(req.body.saldoInicialTarjeta);
      const transferencia = montoNoNegativo(req.body.saldoInicialTransferencia);
      const credito = montoNoNegativo(req.body.saldoInicialCredito);
      const otro = montoNoNegativo(req.body.saldoInicialOtro);
      if ([efectivo, tarjeta, transferencia, credito, otro].some((v) => v === null)) {
        return reply.code(400).send({ error: "Los saldos iniciales deben ser números mayores o iguales a 0" });
      }

      const turno = await prisma.turnoCaja.create({
        data: {
          empresaId,
          sucursalId: sucursal.id,
          usuarioAperturaId: usuarioId,
          saldoInicial: efectivo!,
          saldoInicialTarjeta: tarjeta!,
          saldoInicialTransferencia: transferencia!,
          saldoInicialCredito: credito!,
          saldoInicialOtro: otro!,
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

      const { vendido, inicial, esperado } = await calcularCanales(empresaId, turno);

      // Guardar esperados en BD (útil para auditoría)
      await prisma.turnoCaja.update({
        where: { id: turno.id },
        data: datosEsperados(vendido, esperado),
      });

      const canal = (c: Canal) => ({ esperado: esperado[c], vendido: vendido[c], inicial: inicial[c] });

      reply.send({
        estado: "ABIERTA",
        turno: {
          id: turno.id,
          usuario: turno.usuarioApertura.nombre,
          saldoInicial: inicial.efectivo,
        },
        canales: {
          efectivo: canal("efectivo"),
          tarjeta: canal("tarjeta"),
          transferencia: canal("transferencia"),
          credito: canal("credito"),
          otro: canal("otro"),
        },
        totales: {
          ventasTotales: suma(vendido),
          totalEsperado: suma(esperado),
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
        const { empresaId } = req.user;
        const turno = await prisma.turnoCaja.findFirst({
          where: { empresaId, fechaCierre: null },
        });

        if (!turno) return reply.code(400).send({ error: "No hay caja abierta" });

        const monto = parseFloat(req.body.monto.toString());
        const tipo = req.body.tipo;

        await prisma.movimientoCaja.create({
          data: {
            turnoId: turno.id,
            tipo,
            monto,
            concepto: req.body.concepto,
          },
        });

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
      });

      if (!turno) return reply.code(400).send({ error: "No hay caja abierta" });

      const { vendido, esperado } = await calcularCanales(empresaId, turno);

      const reportado: PorCanal = {
        efectivo: Number(req.body.reportadoEfectivo) || 0,
        tarjeta: Number(req.body.reportadoTarjeta) || 0,
        transferencia: Number(req.body.reportadoTransferencia) || 0,
        credito: Number(req.body.reportadoCredito) || 0,
        otro: Number(req.body.reportadoOtro) || 0,
      };

      const diferencia: PorCanal = {
        efectivo: reportado.efectivo - esperado.efectivo,
        tarjeta: reportado.tarjeta - esperado.tarjeta,
        transferencia: reportado.transferencia - esperado.transferencia,
        credito: reportado.credito - esperado.credito,
        otro: reportado.otro - esperado.otro,
      };

      await prisma.turnoCaja.update({
        where: { id: turno.id },
        data: {
          ...datosEsperados(vendido, esperado),
          reportadoEfectivo: reportado.efectivo,
          reportadoTarjeta: reportado.tarjeta,
          reportadoTransferencia: reportado.transferencia,
          reportadoCredito: reportado.credito,
          reportadoOtro: reportado.otro,
          diferenciaEfectivo: diferencia.efectivo,
          diferenciaTarjeta: diferencia.tarjeta,
          diferenciaTransferencia: diferencia.transferencia,
          diferenciaCredito: diferencia.credito,
          diferenciaOtro: diferencia.otro,
          usuarioCierreId: usuarioId,
          fechaCierre: new Date(),
          observaciones: req.body.observaciones,
        },
      });

      const calcularEstado = (dif: number) => {
        if (Math.abs(dif) < 0.01) return "CUADRADO";
        return dif > 0 ? "SOBRANTE" : "FALTANTE";
      };

      const resumen = (c: Canal) => ({
        esperado: esperado[c],
        reportado: reportado[c],
        diferencia: diferencia[c],
        estado: calcularEstado(diferencia[c]),
      });

      reply.send({
        success: true,
        cierre: {
          efectivo: resumen("efectivo"),
          tarjeta: resumen("tarjeta"),
          transferencia: resumen("transferencia"),
          credito: resumen("credito"),
          otro: resumen("otro"),
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
