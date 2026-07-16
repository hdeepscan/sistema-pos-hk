import type { FastifyInstance } from "fastify";
import { CrearProveedorSchema, CrearCompraSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { emitInventarioActualizado } from "../lib/ws.js";
import { ajustarInventarioEnShopifySiCorresponde } from "../lib/shopify.js";

export async function proveedoresRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/proveedores", async (request) => {
    const { empresaId } = request.user;
    const { q } = request.query as { q?: string };
    return prisma.proveedor.findMany({
      where: {
        empresaId,
        activo: true,
        ...(q ? { nombre: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nombre: "asc" },
    });
  });

  app.post("/proveedores", async (request, reply) => {
    const { empresaId } = request.user;
    const parsed = CrearProveedorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { email, ...resto } = parsed.data;
    const proveedor = await prisma.proveedor.create({
      data: { empresaId, ...resto, email: email || undefined },
    });
    return reply.code(201).send(proveedor);
  });

  app.get("/compras", async (request) => {
    const { empresaId } = request.user;
    const { proveedorId, sucursalId } = request.query as { proveedorId?: string; sucursalId?: string };
    return prisma.compra.findMany({
      where: {
        empresaId,
        ...(proveedorId ? { proveedorId } : {}),
        ...(sucursalId ? { sucursalId } : {}),
      },
      include: { items: true, proveedor: true },
      orderBy: { fecha: "desc" },
      take: 200,
    });
  });

  // Registrar una compra suma automaticamente el inventario de la sucursal
  // destino (equivalente a un conjunto de movimientos ENTRADA).
  app.post("/compras", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    const parsed = CrearCompraSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { proveedorId, sucursalId, items } = parsed.data;

    const [proveedor, sucursal] = await Promise.all([
      prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId } }),
      prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId } }),
    ]);
    if (!proveedor) return reply.code(404).send({ error: "Proveedor no encontrado" });
    if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

    const total = items.reduce((acc, i) => acc + i.cantidad * i.costoUnitario, 0);

    const compra = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.create({
        data: {
          empresaId,
          proveedorId,
          sucursalId,
          usuarioId,
          total,
          items: {
            create: items.map((i) => ({
              productoId: i.productoId,
              cantidad: i.cantidad,
              costoUnitario: i.costoUnitario,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        await tx.inventarioSucursal.upsert({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId } },
          update: { cantidad: { increment: item.cantidad } },
          create: { productoId: item.productoId, sucursalId, cantidad: item.cantidad },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: item.productoId,
            sucursalId,
            tipo: "ENTRADA",
            cantidad: item.cantidad,
            motivo: `Compra a ${proveedor.nombre}`,
            usuarioId,
          },
        });
      }

      return compra;
    });

    for (const item of items) {
      const [inv, producto] = await Promise.all([
        prisma.inventarioSucursal.findUnique({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId } },
        }),
        prisma.producto.findUnique({ where: { id: item.productoId } }),
      ]);
      if (inv) {
        emitInventarioActualizado(empresaId, { productoId: item.productoId, sucursalId, cantidad: inv.cantidad });
      }
      if (producto) {
        void ajustarInventarioEnShopifySiCorresponde(empresaId, sucursalId, producto, item.cantidad);
      }
    }

    return reply.code(201).send(compra);
  });
}
