import type { FastifyInstance } from "fastify";
import { CrearVentaSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { emitInventarioActualizado, emitVentaCreada } from "../lib/ws.js";

export async function ventasRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/ventas", async (request) => {
    const { empresaId } = request.user;
    const { sucursalId, desde, hasta } = request.query as {
      sucursalId?: string;
      desde?: string;
      hasta?: string;
    };
    return prisma.venta.findMany({
      where: {
        empresaId,
        ...(sucursalId ? { sucursalId } : {}),
        ...(desde || hasta
          ? {
              fecha: {
                ...(desde ? { gte: new Date(desde) } : {}),
                ...(hasta ? { lte: new Date(hasta) } : {}),
              },
            }
          : {}),
      },
      include: { items: true },
      orderBy: { fecha: "desc" },
      take: 200,
    });
  });

  // Idempotente por clienteUuid: si el POS reintenta una venta ya sincronizada
  // (por ejemplo tras recuperar conexion), devuelve la venta existente.
  app.post("/ventas", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    const parsed = CrearVentaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { clienteUuid, sucursalId, metodoPago, items } = parsed.data;

    const existente = await prisma.venta.findUnique({
      where: { clienteUuid },
      include: { items: true },
    });
    if (existente) {
      return reply.code(200).send(existente);
    }

    const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

    const productoIds = items.map((i) => i.productoId);
    const inventarios = await prisma.inventarioSucursal.findMany({
      where: { sucursalId, productoId: { in: productoIds } },
    });
    const stockPorProducto = new Map(inventarios.map((i) => [i.productoId, i.cantidad]));
    for (const item of items) {
      const disponible = stockPorProducto.get(item.productoId) ?? 0;
      if (disponible < item.cantidad) {
        return reply.code(409).send({ error: `Stock insuficiente para el producto ${item.productoId}` });
      }
    }

    const total = items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);

    const venta = await prisma.$transaction(async (tx) => {
      const ultima = await tx.venta.findFirst({
        where: { empresaId },
        orderBy: { consecutivo: "desc" },
        select: { consecutivo: true },
      });
      const consecutivo = (ultima?.consecutivo ?? 0) + 1;

      const venta = await tx.venta.create({
        data: {
          clienteUuid,
          empresaId,
          sucursalId,
          usuarioId,
          consecutivo,
          total,
          metodoPago,
          items: {
            create: items.map((i) => ({
              productoId: i.productoId,
              cantidad: i.cantidad,
              precioUnitario: i.precioUnitario,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        await tx.inventarioSucursal.update({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId } },
          data: { cantidad: { decrement: item.cantidad } },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: item.productoId,
            sucursalId,
            tipo: "VENTA",
            cantidad: item.cantidad,
            motivo: `Venta ${venta.consecutivo}`,
            usuarioId,
          },
        });
      }

      return venta;
    });

    emitVentaCreada(empresaId, {
      ventaId: venta.id,
      sucursalId,
      total: Number(venta.total),
      fecha: venta.fecha.toISOString(),
    });
    for (const item of items) {
      const inv = await prisma.inventarioSucursal.findUnique({
        where: { productoId_sucursalId: { productoId: item.productoId, sucursalId } },
      });
      if (inv) {
        emitInventarioActualizado(empresaId, {
          productoId: item.productoId,
          sucursalId,
          cantidad: inv.cantidad,
        });
      }
    }

    return reply.code(201).send(venta);
  });
}
