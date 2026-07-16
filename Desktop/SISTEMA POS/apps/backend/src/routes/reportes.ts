import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

function rangoFechas(desde?: string, hasta?: string) {
  const fin = hasta ? new Date(`${hasta}T23:59:59.999`) : new Date();
  const inicio = desde ? new Date(desde) : new Date(fin.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { inicio, fin };
}

async function totalesEnRango(empresaId: string, sucursalId: string | undefined, inicio: Date, fin: Date) {
  const [ventas, gastos] = await Promise.all([
    prisma.venta.aggregate({
      where: { empresaId, ...(sucursalId ? { sucursalId } : {}), fecha: { gte: inicio, lte: fin } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.gasto.aggregate({
      where: { empresaId, ...(sucursalId ? { sucursalId } : {}), fecha: { gte: inicio, lte: fin } },
      _sum: { monto: true },
    }),
  ]);
  return {
    totalVentas: Number(ventas._sum.total ?? 0),
    numeroVentas: ventas._count,
    totalGastos: Number(gastos._sum.monto ?? 0),
  };
}

function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / anterior) * 100;
}

export async function reportesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/reportes/resumen", async (request, reply) => {
    if (!request.user.permisos.includes("reportes.ver")) {
      return reply.code(403).send({ error: "No tienes permiso para ver reportes" });
    }
    const { empresaId } = request.user;
    const { desde, hasta, sucursalId } = request.query as {
      desde?: string;
      hasta?: string;
      sucursalId?: string;
    };
    const { inicio, fin } = rangoFechas(desde, hasta);
    const duracionMs = fin.getTime() - inicio.getTime();
    const inicioAnterior = new Date(inicio.getTime() - duracionMs);
    const finAnterior = new Date(inicio.getTime() - 1);

    const [ventas, gastos, sucursales, periodoAnterior, gastoPautaAgg] = await Promise.all([
      prisma.venta.findMany({
        where: {
          empresaId,
          ...(sucursalId ? { sucursalId } : {}),
          fecha: { gte: inicio, lte: fin },
        },
        include: { items: { include: { producto: true } } },
      }),
      prisma.gasto.findMany({
        where: {
          empresaId,
          ...(sucursalId ? { sucursalId } : {}),
          fecha: { gte: inicio, lte: fin },
        },
      }),
      prisma.sucursal.findMany({ where: { empresaId, activo: true } }),
      totalesEnRango(empresaId, sucursalId, inicioAnterior, finAnterior),
      prisma.gastoPauta.aggregate({
        where: { empresaId, fecha: { gte: inicio, lte: fin } },
        _sum: { gasto: true },
      }),
    ]);

    const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
    const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
    const costoVentas = ventas.reduce(
      (acc, v) => acc + v.items.reduce((a, i) => a + i.cantidad * Number(i.producto.costo), 0),
      0
    );
    const utilidadBruta = totalVentas - costoVentas - totalGastos;
    const unidadesVendidas = ventas.reduce(
      (acc, v) => acc + v.items.reduce((a, i) => a + i.cantidad, 0),
      0
    );
    const ticketPromedio = ventas.length > 0 ? totalVentas / ventas.length : 0;

    const porProducto = new Map<string, { nombre: string; cantidad: number; total: number }>();
    for (const venta of ventas) {
      for (const item of venta.items) {
        const actual = porProducto.get(item.productoId) ?? {
          nombre: item.producto.nombre,
          cantidad: 0,
          total: 0,
        };
        actual.cantidad += item.cantidad;
        actual.total += item.cantidad * Number(item.precioUnitario);
        porProducto.set(item.productoId, actual);
      }
    }
    const productosMasVendidos = [...porProducto.entries()]
      .map(([productoId, v]) => ({ productoId, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    const porDia = new Map<string, number>();
    for (const venta of ventas) {
      const dia = venta.fecha.toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + Number(venta.total));
    }
    const ventasPorDia = [...porDia.entries()]
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const porMetodoPago = new Map<string, number>();
    for (const venta of ventas) {
      porMetodoPago.set(venta.metodoPago, (porMetodoPago.get(venta.metodoPago) ?? 0) + Number(venta.total));
    }
    const ventasPorMetodoPago = [...porMetodoPago.entries()].map(([metodoPago, total]) => ({ metodoPago, total }));

    const porSucursal = new Map<string, number>();
    for (const venta of ventas) {
      porSucursal.set(venta.sucursalId, (porSucursal.get(venta.sucursalId) ?? 0) + Number(venta.total));
    }
    const ventasPorSucursal = sucursales
      .map((s) => ({ sucursalId: s.id, sucursalNombre: s.nombre, total: porSucursal.get(s.id) ?? 0 }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);

    const gastoPauta = Number(gastoPautaAgg._sum.gasto ?? 0);
    const roas = gastoPauta > 0 ? totalVentas / gastoPauta : null;

    return {
      rango: { inicio: inicio.toISOString(), fin: fin.toISOString() },
      totalVentas,
      totalGastos,
      costoVentas,
      utilidadBruta,
      numeroVentas: ventas.length,
      unidadesVendidas,
      ticketPromedio,
      gastoPauta,
      roas,
      productosMasVendidos,
      ventasPorDia,
      ventasPorMetodoPago,
      ventasPorSucursal,
      comparacion: {
        totalVentasAnterior: periodoAnterior.totalVentas,
        variacionVentas: variacionPorcentual(totalVentas, periodoAnterior.totalVentas),
        variacionNumeroVentas: variacionPorcentual(ventas.length, periodoAnterior.numeroVentas),
      },
    };
  });
}
