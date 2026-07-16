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
    const { estado, sucursalId } = request.query as { estado?: EstadoCredito; sucursalId?: string };

    let creditos = await calcularCreditos(empresaId);
    if (sucursalId) creditos = creditos.filter((c) => c.sucursalId === sucursalId);
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
}
