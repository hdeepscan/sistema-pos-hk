import type { FastifyInstance } from "fastify";
import { RegistrarMovimientoSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { emitInventarioActualizado } from "../lib/ws.js";

async function ajustarStock(productoId: string, sucursalId: string, delta: number) {
  const inv = await prisma.inventarioSucursal.upsert({
    where: { productoId_sucursalId: { productoId, sucursalId } },
    update: { cantidad: { increment: delta } },
    create: { productoId, sucursalId, cantidad: Math.max(delta, 0) },
  });
  return inv;
}

export async function inventarioRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Vista consolidada: cantidad por sucursal de cada producto de la empresa.
  app.get("/inventario/consolidado", async (request) => {
    const { empresaId } = request.user;
    const productos = await prisma.producto.findMany({
      where: { empresaId, activo: true },
      include: { inventario: { include: { sucursal: true } } },
      orderBy: { nombre: "asc" },
    });
    return productos.map((p) => ({
      productoId: p.id,
      sku: p.sku,
      nombre: p.nombre,
      totalGeneral: p.inventario.reduce((acc, i) => acc + i.cantidad, 0),
      porSucursal: p.inventario.map((i) => ({
        sucursalId: i.sucursalId,
        sucursalNombre: i.sucursal.nombre,
        cantidad: i.cantidad,
      })),
    }));
  });

  app.get("/inventario/sucursal/:sucursalId", async (request, reply) => {
    const { empresaId } = request.user;
    const { sucursalId } = request.params as { sucursalId: string };
    const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

    return prisma.inventarioSucursal.findMany({
      where: { sucursalId },
      include: { producto: true },
      orderBy: { producto: { nombre: "asc" } },
    });
  });

  app.post("/inventario/movimientos", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    const parsed = RegistrarMovimientoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { productoId, sucursalId, tipo, cantidad, motivo, sucursalDestinoId } = parsed.data;

    const producto = await prisma.producto.findFirst({ where: { id: productoId, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    if (tipo === "TRASLADO" && !sucursalDestinoId) {
      return reply.code(400).send({ error: "sucursalDestinoId es requerido para traslados" });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      if (tipo === "ENTRADA" || tipo === "AJUSTE") {
        await ajustarStock(productoId, sucursalId, cantidad);
      } else if (tipo === "SALIDA") {
        await ajustarStock(productoId, sucursalId, -cantidad);
      } else if (tipo === "TRASLADO") {
        await ajustarStock(productoId, sucursalId, -cantidad);
        await ajustarStock(productoId, sucursalDestinoId!, cantidad);
      }

      return tx.movimientoInventario.create({
        data: {
          productoId,
          sucursalId,
          sucursalDestinoId,
          tipo,
          cantidad,
          motivo,
          usuarioId,
        },
      });
    });

    const invOrigen = await prisma.inventarioSucursal.findUnique({
      where: { productoId_sucursalId: { productoId, sucursalId } },
    });
    if (invOrigen) {
      emitInventarioActualizado(empresaId, { productoId, sucursalId, cantidad: invOrigen.cantidad });
    }
    if (tipo === "TRASLADO" && sucursalDestinoId) {
      const invDestino = await prisma.inventarioSucursal.findUnique({
        where: { productoId_sucursalId: { productoId, sucursalId: sucursalDestinoId } },
      });
      if (invDestino) {
        emitInventarioActualizado(empresaId, {
          productoId,
          sucursalId: sucursalDestinoId,
          cantidad: invDestino.cantidad,
        });
      }
    }

    return reply.code(201).send(resultado);
  });
}
