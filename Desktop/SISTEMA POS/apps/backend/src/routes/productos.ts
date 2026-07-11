import type { FastifyInstance } from "fastify";
import { CrearProductoSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";

export async function productosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/productos", async (request) => {
    const { empresaId } = request.user;
    const { q } = request.query as { q?: string };
    return prisma.producto.findMany({
      where: {
        empresaId,
        activo: true,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { codigoBarras: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });
  });

  // Usado por el lector de código de barras en el POS: busca coincidencia exacta.
  app.get("/productos/buscar", async (request, reply) => {
    const { empresaId } = request.user;
    const { codigo } = request.query as { codigo?: string };
    if (!codigo) return reply.code(400).send({ error: "Falta el parametro codigo" });

    const producto = await prisma.producto.findFirst({
      where: {
        empresaId,
        activo: true,
        OR: [{ codigoBarras: codigo }, { sku: codigo }],
      },
    });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    return producto;
  });

  app.post("/productos", async (request, reply) => {
    const { empresaId } = request.user;
    const parsed = CrearProductoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const existente = await prisma.producto.findUnique({
      where: { empresaId_sku: { empresaId, sku: parsed.data.sku } },
    });
    if (existente) {
      return reply.code(409).send({ error: "Ya existe un producto con ese SKU" });
    }

    const producto = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({ data: { empresaId, ...parsed.data } });
      const sucursales = await tx.sucursal.findMany({ where: { empresaId, activo: true } });
      if (sucursales.length > 0) {
        await tx.inventarioSucursal.createMany({
          data: sucursales.map((s) => ({ productoId: producto.id, sucursalId: s.id, cantidad: 0 })),
        });
      }
      return producto;
    });

    return reply.code(201).send(producto);
  });

  app.patch("/productos/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = CrearProductoSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const actualizado = await prisma.producto.update({ where: { id }, data: parsed.data });
    return actualizado;
  });
}
