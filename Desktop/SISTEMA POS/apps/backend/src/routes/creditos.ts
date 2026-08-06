import type { FastifyInstance } from "fastify";
import { ActualizarConfigCreditoSchema } from "@sistema-pos/shared";
import type { EstadoCredito } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

const MS_DIA = 24 * 60 * 60 * 1000;
const DIAS_PROXIMO_A_VENCER = 5;

interface CreditoCalculado {
  ventaId: string;
  consecutivo: number;
  clienteId: string;
  clienteNombre: string;
  sucursalId: string;
  total: number;
  pendiente: number;
  fecha: Date;
  fechaVencimiento: Date;
  diasRetraso: number;
  estado: EstadoCredito;
}

// Calcula, para cada venta a credito de la empresa, cuanto queda pendiente.
// Los abonos de un cliente se aplican primero a sus creditos mas antiguos
// (FIFO), igual que el saldo agregado que ya se muestra en Clientes.
async function calcularCreditos(empresaId: string): Promise<CreditoCalculado[]> {
  const [ventas, abonosPorCliente] = await Promise.all([
    prisma.venta.findMany({
      where: { empresaId, metodoPago: "CREDITO" },
      include: { cliente: { select: { nombre: true } } },
      orderBy: { fecha: "asc" },
    }),
    prisma.abono.groupBy({
      by: ["clienteId"],
      where: { cliente: { empresaId } },
      _sum: { monto: true },
    }),
  ]);

  const poolAbonos = new Map(abonosPorCliente.map((a) => [a.clienteId, Number(a._sum.monto ?? 0)]));
  const ahora = Date.now();
  const resultado: CreditoCalculado[] = [];

  for (const venta of ventas) {
    if (!venta.clienteId) continue;
    const total = Number(venta.total);
    const disponible = poolAbonos.get(venta.clienteId) ?? 0;
    const aplicado = Math.min(disponible, total);
    poolAbonos.set(venta.clienteId, disponible - aplicado);
    const pendiente = Math.round((total - aplicado) * 100) / 100;

    const fechaVencimiento = venta.fechaVencimientoCredito ?? venta.fecha;
    const diasRetraso = Math.max(0, Math.floor((ahora - fechaVencimiento.getTime()) / MS_DIA));

    let estado: EstadoCredito;
    if (pendiente <= 0) {
      estado = "PAGADO";
    } else if (ahora > fechaVencimiento.getTime()) {
      estado = "VENCIDO";
    } else if (fechaVencimiento.getTime() - ahora <= DIAS_PROXIMO_A_VENCER * MS_DIA) {
      estado = "PROXIMO_A_VENCER";
    } else {
      estado = "VIGENTE";
    }

    resultado.push({
      ventaId: venta.id,
      consecutivo: venta.consecutivo,
      clienteId: venta.clienteId,
      clienteNombre: venta.cliente?.nombre ?? "Cliente sin nombre",
      sucursalId: venta.sucursalId,
      total,
      pendiente,
      fecha: venta.fecha,
      fechaVencimiento,
      diasRetraso,
      estado,
    });
  }

  return resultado;
}

export async function creditosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/creditos/config", async (request) => {
    const { empresaId } = request.user;
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { diasVencimientoCredito: true },
    });
    return { diasVencimientoCredito: empresa?.diasVencimientoCredito ?? 20 };
  });

  app.patch("/creditos/config", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para realizar esta accion" });
    }
    const { empresaId } = request.user;
    const parsed = ActualizarConfigCreditoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const empresa = await prisma.empresa.update({
      where: { id: empresaId },
      data: { diasVencimientoCredito: parsed.data.diasVencimientoCredito },
    });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ACTUALIZAR_CONFIG_CREDITO",
      entidad: "Empresa",
      entidadId: empresaId,
      detalle: `dias de vencimiento -> ${empresa.diasVencimientoCredito}`,
    });
    return { diasVencimientoCredito: empresa.diasVencimientoCredito };
  });

  app.get("/creditos", async (request) => {
    const { empresaId } = request.user;
    const { estado, sucursalId, clienteId } = request.query as { estado?: EstadoCredito; sucursalId?: string; clienteId?: string };

    let creditos = await calcularCreditos(empresaId);
    if (sucursalId) creditos = creditos.filter((c) => c.sucursalId === sucursalId);
    if (clienteId) creditos = creditos.filter((c) => c.clienteId === clienteId);
    if (estado) {
      creditos = creditos.filter((c) => c.estado === estado);
    } else {
      creditos = creditos.filter((c) => c.estado !== "PAGADO");
    }
    creditos.sort((a, b) => b.diasRetraso - a.diasRetraso || a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
    return creditos;
  });

  app.get("/creditos/resumen", async (request) => {
    const { empresaId } = request.user;
    const creditos = await calcularCreditos(empresaId);
    const activos = creditos.filter((c) => c.estado !== "PAGADO");

    return {
      vigentes: activos.filter((c) => c.estado === "VIGENTE").length,
      proximosAVencer: activos.filter((c) => c.estado === "PROXIMO_A_VENCER").length,
      vencidos: activos.filter((c) => c.estado === "VENCIDO").length,
      valorVencido: activos.filter((c) => c.estado === "VENCIDO").reduce((acc, c) => acc + c.pendiente, 0),
      valorTotalPendiente: activos.reduce((acc, c) => acc + c.pendiente, 0),
    };
  });

  app.get("/creditos/:ventaId/detalle", async (request, reply) => {
    const { empresaId } = request.user;
    const { ventaId } = request.params as { ventaId: string };

    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      include: { cliente: true, abonos: { orderBy: { fecha: "desc" } } },
    });

    if (!venta || venta.empresaId !== empresaId) {
      return reply.code(404).send({ error: "Crédito no encontrado" });
    }

    const creditos = await calcularCreditos(empresaId);
    const credito = creditos.find((c) => c.ventaId === ventaId);

    if (!credito) {
      return reply.code(404).send({ error: "Crédito no encontrado" });
    }

    return {
      ...credito,
      cliente: venta.cliente,
      abonos: venta.abonos,
      cuotas: venta.numeroCuotasCredito || 1,
      plazo: venta.fechaVencimientoCredito ? Math.ceil((venta.fechaVencimientoCredito.getTime() - venta.fecha.getTime()) / (30 * 24 * 60 * 60 * 1000)) : 0,
    };
  });

  app.post("/creditos/:ventaId/abonar", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    const { ventaId } = request.params as { ventaId: string };
    const { monto } = request.body as { monto: number };

    if (!monto || monto <= 0) {
      return reply.code(400).send({ error: "Monto debe ser mayor a 0" });
    }

    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
    });

    if (!venta || venta.empresaId !== empresaId || venta.metodoPago !== "CREDITO") {
      return reply.code(404).send({ error: "Crédito no encontrado" });
    }

    const abono = await prisma.abono.create({
      data: {
        clienteId: venta.clienteId!,
        usuarioId,
        monto,
        fecha: new Date(),
        referencia: `Abono a crédito #${venta.consecutivo}`,
      },
    });

    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "CREAR_ABONO",
      entidad: "Abono",
      entidadId: abono.id,
      detalle: `Abono de $${monto} al crédito ${venta.consecutivo}`,
    });

    return abono;
  });

  app.get("/creditos/:ventaId/proximos-pagos", async (request, reply) => {
    const { empresaId } = request.user;
    const { ventaId } = request.params as { ventaId: string };

    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      include: { cliente: true },
    });

    if (!venta || venta.empresaId !== empresaId) {
      return reply.code(404).send({ error: "Crédito no encontrado" });
    }

    return calcularCuotas(venta);
  });

  // Alertas de cobro para el centro de notificaciones:
  // cuotas vencidas, que vencen hoy y proximas (dentro de 2 dias).
  app.get("/creditos/alertas", async (request) => {
    const { empresaId } = request.user;
    const ahora = Date.now();
    const DOS_DIAS = 2 * MS_DIA;

    const ventas = await prisma.venta.findMany({
      where: { empresaId, metodoPago: "CREDITO" },
      include: { cliente: { select: { nombre: true } } },
      orderBy: { fecha: "asc" },
    });

    const abonosPorCliente = await prisma.abono.groupBy({
      by: ["clienteId"],
      where: { cliente: { empresaId } },
      _sum: { monto: true },
    });
    const poolAbonos = new Map(abonosPorCliente.map((a) => [a.clienteId, Number(a._sum.monto ?? 0)]));

    const alertas: {
      ventaId: string;
      consecutivo: number;
      clienteNombre: string;
      numeroCuota: number;
      valorPendiente: number;
      fechaVencimiento: Date;
      diasRetraso: number;
      tipo: "VENCIDA" | "HOY" | "PROXIMA";
    }[] = [];

    for (const venta of ventas) {
      if (!venta.clienteId) continue;
      const total = Number(venta.total);
      const disponible = poolAbonos.get(venta.clienteId) ?? 0;
      const aplicado = Math.min(disponible, total);
      poolAbonos.set(venta.clienteId, disponible - aplicado);
      const pendiente = Math.round((total - aplicado) * 100) / 100;
      if (pendiente <= 0) continue;

      const cuotas = calcularCuotas(venta);
      for (const cuota of cuotas) {
        const venc = new Date(cuota.fecha).getTime();
        const esHoy = new Date(venc).toDateString() === new Date(ahora).toDateString();
        const esPasado = venc < ahora && !esHoy;
        const esProxima = !esPasado && !esHoy && venc <= ahora + DOS_DIAS;
        if (!esHoy && !esPasado && !esProxima) continue;

        const diasRetraso = esPasado ? Math.floor((ahora - venc) / MS_DIA) : 0;
        alertas.push({
          ventaId: venta.id,
          consecutivo: venta.consecutivo,
          clienteNombre: venta.cliente?.nombre ?? "Cliente",
          numeroCuota: cuota.cuota,
          valorPendiente: cuota.monto,
          fechaVencimiento: new Date(cuota.fecha),
          diasRetraso,
          tipo: esPasado ? "VENCIDA" : esHoy ? "HOY" : "PROXIMA",
        });
      }
    }

    alertas.sort((a, b) => b.diasRetraso - a.diasRetraso || a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
    return alertas;
  });
}

// Calcula las fechas y montos de cada cuota de una venta a credito.
// Las cuotas se distribuyen equitativamente entre la fecha de venta
// y la fecha de vencimiento final.
function calcularCuotas(venta: { fecha: Date; fechaVencimientoCredito: Date | null; numeroCuotasCredito: number | null; total: any }) {
  const numCuotas = venta.numeroCuotasCredito || 1;
  const fechaFin = venta.fechaVencimientoCredito || venta.fecha;
  const fechaInicio = venta.fecha;
  const montoTotal = Number(venta.total);
  const montoPorCuota = Math.round((montoTotal / numCuotas) * 100) / 100;

  const totalMs = fechaFin.getTime() - fechaInicio.getTime();
  const intervalMs = numCuotas > 1 ? totalMs / numCuotas : totalMs;

  return Array.from({ length: numCuotas }, (_, i) => ({
    cuota: i + 1,
    fecha: new Date(fechaInicio.getTime() + (i + 1) * intervalMs),
    monto: i === numCuotas - 1 ? Math.round((montoTotal - montoPorCuota * i) * 100) / 100 : montoPorCuota,
  }));
}
