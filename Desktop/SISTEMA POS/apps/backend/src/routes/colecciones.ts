import type { FastifyInstance } from "fastify";
import { CrearColeccionSchema, AgregarProductoColeccionSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import {
  sincronizarColecciones,
  crearColeccionEnShopify,
  agregarProductoAColeccionShopify,
  quitarProductoDeColeccionShopify,
} from "../lib/shopify.js";

export async function coleccionesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/colecciones", async (request) => {
    const { empresaId } = request.user;
    const colecciones = await prisma.coleccion.findMany({
      where: { empresaId },
      include: { _count: { select: { productos: true } } },
      orderBy: { titulo: "asc" },
    });
    return colecciones.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      descripcion: c.descripcion,
      imagenUrl: c.imagenUrl,
      shopifyCollectionId: c.shopifyCollectionId,
      totalProductos: c._count.productos,
    }));
  });

  app.post("/colecciones", async (request, reply) => {
    const { empresaId } = request.user;
    const parsed = CrearColeccionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    let shopifyCollectionId: string | undefined;
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (config) {
      try {
        shopifyCollectionId = await crearColeccionEnShopify(empresaId, parsed.data.titulo, parsed.data.descripcion);
      } catch (err) {
        request.log.error(err);
      }
    }

    const coleccion = await prisma.coleccion.create({
      data: { empresaId, ...parsed.data, shopifyCollectionId },
    });
    return reply.code(201).send(coleccion);
  });

  app.post("/colecciones/sincronizar", async (request, reply) => {
    const { empresaId } = request.user;
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Conecta Shopify primero" });

    try {
      const resultado = await sincronizarColecciones(empresaId);
      return resultado;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Error sincronizando colecciones" });
    }
  });

  app.get("/colecciones/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const coleccion = await prisma.coleccion.findFirst({ where: { id, empresaId } });
    if (!coleccion) return reply.code(404).send({ error: "Coleccion no encontrada" });

    const productos = await prisma.productoColeccion.findMany({
      where: { coleccionId: id },
      include: { producto: true },
    });
    return { ...coleccion, productos: productos.map((p) => p.producto) };
  });

  app.post("/colecciones/:id/productos", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = AgregarProductoColeccionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [coleccion, producto] = await Promise.all([
      prisma.coleccion.findFirst({ where: { id, empresaId } }),
      prisma.producto.findFirst({ where: { id: parsed.data.productoId, empresaId } }),
    ]);
    if (!coleccion) return reply.code(404).send({ error: "Coleccion no encontrada" });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    if (coleccion.shopifyCollectionId && producto.shopifyProductId) {
      try {
        await agregarProductoAColeccionShopify(empresaId, coleccion.shopifyCollectionId, producto.shopifyProductId);
      } catch (err) {
        request.log.error(err);
      }
    }

    await prisma.productoColeccion.upsert({
      where: { productoId_coleccionId: { productoId: producto.id, coleccionId: coleccion.id } },
      update: {},
      create: { productoId: producto.id, coleccionId: coleccion.id },
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete("/colecciones/:id/productos/:productoId", async (request, reply) => {
    const { empresaId } = request.user;
    const { id, productoId } = request.params as { id: string; productoId: string };

    const [coleccion, producto] = await Promise.all([
      prisma.coleccion.findFirst({ where: { id, empresaId } }),
      prisma.producto.findFirst({ where: { id: productoId, empresaId } }),
    ]);
    if (!coleccion) return reply.code(404).send({ error: "Coleccion no encontrada" });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    if (coleccion.shopifyCollectionId && producto.shopifyProductId) {
      try {
        await quitarProductoDeColeccionShopify(empresaId, coleccion.shopifyCollectionId, producto.shopifyProductId);
      } catch (err) {
        request.log.error(err);
      }
    }

    await prisma.productoColeccion.deleteMany({ where: { productoId, coleccionId: id } });
    return reply.code(204).send();
  });
}
