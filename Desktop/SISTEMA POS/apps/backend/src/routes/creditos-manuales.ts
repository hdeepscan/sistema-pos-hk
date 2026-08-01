import type { FastifyInstance } from "fastify";
import {
  CrearCreditoManualSchema,
  RegistrarPagoCreditoManualSchema,
  type FrecuenciaPago,
  type EstadoCuota,
} from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

const MS_DIA = 24 * 60 * 60 * 1000;

// Suma un periodo a una fecha segun la frecuencia de pago.
function sumarPeriodo(fecha: Date, frecuencia: FrecuenciaPago, veces: number): Date {
  const d = new Date(fecha);
  switch (frecuencia) {
    case "DIARIA":
      d.setDate(d.getDate() + veces);
      break;
    case "SEMANAL":
      d.setDate(d.getDate() + veces * 7);
      break;
    case "QUINCENAL":
      d.setDate(d.getDate() + veces * 15);
      break;
    case "MENSUAL":
      d.setMonth(d.getMonth() + veces);
      break;
  }
  return d;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

interface CuotaConEstado {
  id: string;
  numero: number;
  fechaVencimiento: Date;
  valor: number;
  pagado: number;
  pendiente: number;
  diasRetraso: number;
  estado: EstadoCuota;
}

function estadoDeCuota(valor: number, pagado: number, fechaVencimiento: Date, ahora: number): CuotaConEstado["estado"] {
  const pendiente = redondear(valor - pagado);
  if (pendiente <= 0) return "PAGADA";
  if (ahora > fechaVencimiento.getTime()) return "VENCIDA";
  if (pagado > 0) return "PARCIAL";
  return "PENDIENTE";
}

function mapearCuota(c: { id: string; numero: number; fechaVencimiento: Date; valor: unknown; pagado: unknown }, ahora: number): CuotaConEstado {
  const valor = Number(c.valor);
  const pagado = Number(c.pagado);
  const pendiente = redondear(valor - pagado);
  const diasRetraso = pendiente > 0 ? Math.max(0, Math.floor((ahora - c.fechaVencimiento.getTime()) / MS_DIA)) : 0;
  return {
    id: c.id,
    numero: c.numero,
    fechaVencimiento: c.fechaVencimiento,
    valor,
    pagado,
    pendiente,
    diasRetraso,
    estado: estadoDeCuota(valor, pagado, c.fechaVencimiento, ahora),
  };
}

// Estado global del credito para el semaforo (al dia / proximo a vencer / vencido).
function estadoCredito(cuotas: CuotaConEstado[], diasAviso: number): "AL_DIA" | "PROXIMO" | "VENCIDO" | "PAGADO" {
  if (cuotas.every((c) => c.estado === "PAGADA")) return "PAGADO";
  if (cuotas.some((c) => c.estado === "VENCIDA")) return "VENCIDO";
  const ahora = Date.now();
  const proximo = cuotas.some(
    (c) => c.pendiente > 0 && c.fechaVencimiento.getTime() - ahora <= diasAviso * MS_DIA
  );
  return proximo ? "PROXIMO" : "AL_DIA";
}

export async function creditosManualesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  async function diasAviso(empresaId: string): Promise<number> {
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { diasAvisoCuota: true } });
    return empresa?.diasAvisoCuota ?? 3;
  }

  app.get("/creditos-manuales/config", async (request) => {
    const { empresaId } = request.user;
    return { diasAvisoCuota: await diasAviso(empresaId) };
  });

  app.patch("/creditos-manuales/config", async (request, reply) => {
    if (!request.user.permisos.includes("creditos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar creditos" });
    }
    const { empresaId } = request.user;
    const { diasAvisoCuota } = request.body as { diasAvisoCuota?: number };
    if (typeof diasAvisoCuota !== "number" || diasAvisoCuota < 0 || diasAvisoCuota > 60) {
      return reply.code(400).send({ error: "Los dias de aviso deben estar entre 0 y 60" });
    }
    await prisma.empresa.update({ where: { id: empresaId }, data: { diasAvisoCuota: Math.round(diasAvisoCuota) } });
    return { diasAvisoCuota: Math.round(diasAvisoCuota) };
  });

  // Crear un credito manual (sin venta asociada) y generar su cronograma.
  app.post("/creditos-manuales", async (request, reply) => {
    if (!request.user.permisos.includes("creditos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar creditos" });
    }
    const { empresaId } = request.user;
    const parsed = CrearCreditoManualSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const { clienteId, valorTotal, fechaInicio, fechaPrimerPago, numeroCuotas, frecuencia, valorCuota, observaciones } =
      parsed.data;

    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
    if (!cliente) return reply.code(404).send({ error: "Cliente no encontrado" });

    const inicio = new Date(fechaInicio);
    const primerPago = new Date(fechaPrimerPago);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(primerPago.getTime())) {
      return reply.code(400).send({ error: "Las fechas no son validas" });
    }

    // Valor de cada cuota: el enviado (editable) o valorTotal/numeroCuotas; el
    // residuo por redondeo se ajusta en la ultima cuota para que sume el total.
    const base = valorCuota ?? redondear(valorTotal / numeroCuotas);
    const valores: number[] = [];
    let acumulado = 0;
    for (let i = 0; i < numeroCuotas; i++) {
      if (i === numeroCuotas - 1) {
        valores.push(redondear(valorTotal - acumulado));
      } else {
        valores.push(base);
        acumulado = redondear(acumulado + base);
      }
    }

    const credito = await prisma.$transaction(async (tx) => {
      const ultimo = await tx.creditoManual.findFirst({
        where: { empresaId },
        orderBy: { numero: "desc" },
        select: { numero: true },
      });
      const nuevo = await tx.creditoManual.create({
        data: {
          empresaId,
          numero: (ultimo?.numero ?? 0) + 1,
          clienteId,
          valorTotal,
          fechaInicio: inicio,
          numeroCuotas,
          frecuencia,
          observaciones,
          cuotas: {
            create: valores.map((valor, i) => ({
              numero: i + 1,
              fechaVencimiento: sumarPeriodo(primerPago, frecuencia, i),
              valor,
            })),
          },
        },
        include: { cuotas: true, cliente: { select: { nombre: true } } },
      });
      return nuevo;
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_CREDITO_MANUAL",
      entidad: "CreditoManual",
      entidadId: credito.id,
      detalle: `Credito #${credito.numero} a ${credito.cliente.nombre} por ${valorTotal}`,
    });

    return reply.code(201).send(credito);
  });

  // Lista de creditos con busqueda por cliente/numero/estado.
  app.get("/creditos-manuales", async (request) => {
    const { empresaId } = request.user;
    const { q, estado } = request.query as { q?: string; estado?: string };

    const numeroBuscado = q && /^\d+$/.test(q.trim()) ? Number(q.trim()) : undefined;
    const creditos = await prisma.creditoManual.findMany({
      where: {
        empresaId,
        ...(q
          ? {
              OR: [
                { cliente: { nombre: { contains: q, mode: "insensitive" } } },
                ...(numeroBuscado !== undefined ? [{ numero: numeroBuscado }] : []),
              ],
            }
          : {}),
      },
      include: { cuotas: true, cliente: { select: { nombre: true } } },
      orderBy: { creadoEn: "desc" },
    });

    const dias = await diasAviso(empresaId);
    const ahora = Date.now();
    const resultado = creditos.map((c) => {
      const cuotas = c.cuotas.map((q2) => mapearCuota(q2, ahora)).sort((a, b) => a.numero - b.numero);
      const valorTotal = Number(c.valorTotal);
      const pagado = redondear(cuotas.reduce((acc, q2) => acc + q2.pagado, 0));
      const pendiente = redondear(valorTotal - pagado);
      return {
        id: c.id,
        numero: c.numero,
        clienteId: c.clienteId,
        clienteNombre: c.cliente.nombre,
        valorTotal,
        pagado,
        pendiente,
        numeroCuotas: c.numeroCuotas,
        frecuencia: c.frecuencia,
        fechaInicio: c.fechaInicio,
        observaciones: c.observaciones,
        estado: estadoCredito(cuotas, dias),
        proximaCuota: cuotas.find((q2) => q2.pendiente > 0) ?? null,
        cuotasVencidas: cuotas.filter((q2) => q2.estado === "VENCIDA").length,
      };
    });

    return estado ? resultado.filter((c) => c.estado === estado) : resultado;
  });

  // Detalle con cronograma completo e historial de pagos.
  app.get("/creditos-manuales/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const credito = await prisma.creditoManual.findFirst({
      where: { id, empresaId },
      include: {
        cliente: true,
        cuotas: { include: { pagos: { orderBy: { fecha: "asc" } } }, orderBy: { numero: "asc" } },
      },
    });
    if (!credito) return reply.code(404).send({ error: "Credito no encontrado" });

    const ahora = Date.now();
    const cuotas = credito.cuotas.map((c) => ({
      ...mapearCuota(c, ahora),
      pagos: c.pagos.map((p) => ({ id: p.id, monto: Number(p.monto), fecha: p.fecha })),
    }));
    const valorTotal = Number(credito.valorTotal);
    const pagado = redondear(cuotas.reduce((acc, c) => acc + c.pagado, 0));

    return {
      id: credito.id,
      numero: credito.numero,
      cliente: credito.cliente,
      valorTotal,
      pagado,
      pendiente: redondear(valorTotal - pagado),
      numeroCuotas: credito.numeroCuotas,
      frecuencia: credito.frecuencia,
      fechaInicio: credito.fechaInicio,
      observaciones: credito.observaciones,
      estado: estadoCredito(cuotas, await diasAviso(empresaId)),
      cuotas,
    };
  });

  // Registra un abono; se aplica a las cuotas mas antiguas pendientes (FIFO) y
  // recalcula el saldo. Acepta pago parcial o total.
  app.post("/creditos-manuales/:id/pagos", async (request, reply) => {
    if (!request.user.permisos.includes("creditos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar creditos" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = RegistrarPagoCreditoManualSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const credito = await prisma.creditoManual.findFirst({
      where: { id, empresaId },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    });
    if (!credito) return reply.code(404).send({ error: "Credito no encontrado" });

    const pendienteTotal = redondear(
      credito.cuotas.reduce((acc, c) => acc + (Number(c.valor) - Number(c.pagado)), 0)
    );
    if (pendienteTotal <= 0) return reply.code(400).send({ error: "Este credito ya esta pagado por completo" });

    let restante = parsed.data.monto;
    if (restante > pendienteTotal + 0.01) {
      return reply.code(400).send({ error: `El abono supera el saldo pendiente (${pendienteTotal})` });
    }

    await prisma.$transaction(async (tx) => {
      for (const cuota of credito.cuotas) {
        if (restante <= 0) break;
        const pendienteCuota = redondear(Number(cuota.valor) - Number(cuota.pagado));
        if (pendienteCuota <= 0) continue;
        const aplicar = redondear(Math.min(restante, pendienteCuota));
        await tx.pagoCreditoManual.create({
          data: { cuotaId: cuota.id, monto: aplicar, usuarioId: request.user.usuarioId },
        });
        await tx.cuotaCredito.update({
          where: { id: cuota.id },
          data: { pagado: { increment: aplicar } },
        });
        restante = redondear(restante - aplicar);
      }
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ABONO_CREDITO_MANUAL",
      entidad: "CreditoManual",
      entidadId: credito.id,
      detalle: `Abono de ${parsed.data.monto} al credito #${credito.numero}`,
    });

    return { ok: true };
  });

  // Alertas de cobro para el centro de notificaciones: cuotas por vencer
  // (dentro del margen de aviso), vencidas hoy y en mora.
  app.get("/creditos-manuales/alertas", async (request) => {
    const { empresaId } = request.user;
    const dias = await diasAviso(empresaId);
    const ahora = Date.now();
    const limiteAviso = ahora + dias * MS_DIA;

    const creditos = await prisma.creditoManual.findMany({
      where: { empresaId, activo: true },
      include: { cuotas: true, cliente: { select: { nombre: true } } },
    });

    const alertas: {
      creditoId: string;
      numeroCredito: number;
      clienteNombre: string;
      numeroCuota: number;
      valorPendiente: number;
      fechaVencimiento: Date;
      diasRetraso: number;
      tipo: "VENCIDA" | "HOY" | "PROXIMA";
    }[] = [];

    for (const c of creditos) {
      for (const cuota of c.cuotas) {
        const info = mapearCuota(cuota, ahora);
        if (info.pendiente <= 0) continue;
        const venc = cuota.fechaVencimiento.getTime();
        const esHoy = new Date(venc).toDateString() === new Date(ahora).toDateString();
        let tipo: "VENCIDA" | "HOY" | "PROXIMA" | null = null;
        if (info.estado === "VENCIDA" && !esHoy) tipo = "VENCIDA";
        else if (esHoy) tipo = "HOY";
        else if (venc <= limiteAviso) tipo = "PROXIMA";
        if (!tipo) continue;

        alertas.push({
          creditoId: c.id,
          numeroCredito: c.numero,
          clienteNombre: c.cliente.nombre,
          numeroCuota: cuota.numero,
          valorPendiente: info.pendiente,
          fechaVencimiento: cuota.fechaVencimiento,
          diasRetraso: info.diasRetraso,
          tipo,
        });
      }
    }

    alertas.sort((a, b) => b.diasRetraso - a.diasRetraso || a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
    return alertas;
  });

  app.get("/creditos-manuales/resumen", async (request) => {
    const { empresaId } = request.user;
    const dias = await diasAviso(empresaId);
    const ahora = Date.now();
    const limiteAviso = ahora + dias * MS_DIA;
    const creditos = await prisma.creditoManual.findMany({
      where: { empresaId, activo: true },
      include: { cuotas: true },
    });
    let alertas = 0;
    let vencidas = 0;
    for (const c of creditos) {
      for (const cuota of c.cuotas) {
        const pendiente = Number(cuota.valor) - Number(cuota.pagado);
        if (pendiente <= 0) continue;
        const venc = cuota.fechaVencimiento.getTime();
        if (venc < ahora) vencidas++;
        if (venc <= limiteAviso) alertas++;
      }
    }
    return { alertas, vencidas };
  });

  app.delete("/creditos-manuales/:id", async (request, reply) => {
    if (!request.user.permisos.includes("creditos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar creditos" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const credito = await prisma.creditoManual.findFirst({ where: { id, empresaId } });
    if (!credito) return reply.code(404).send({ error: "Credito no encontrado" });
    await prisma.creditoManual.delete({ where: { id } });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ELIMINAR_CREDITO_MANUAL",
      entidad: "CreditoManual",
      entidadId: id,
      detalle: `Credito #${credito.numero}`,
    });
    return reply.code(204).send();
  });
}
