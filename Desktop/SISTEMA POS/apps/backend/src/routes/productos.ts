import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { CrearProductoSchema, CrearVarianteSchema, EdicionMasivaProductosSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { empujarProductoAShopify, subirImagenAShopify, crearVarianteEnShopify } from "../lib/shopify.js";
import { registrarAuditoria } from "../lib/auditoria.js";

// Sin filas en ProductoSucursal = disponible en todas las sucursales.
// sucursalIds=[] limpia la restriccion (vuelve a "disponible en todas").
async function sincronizarDisponibilidad(
  tx: Prisma.TransactionClient,
  empresaId: string,
  productoIds: string[],
  sucursalIds: string[]
) {
  await tx.productoSucursal.deleteMany({ where: { productoId: { in: productoIds } } });
  if (sucursalIds.length === 0) return;
  const validas = await tx.sucursal.findMany({ where: { empresaId, id: { in: sucursalIds } }, select: { id: true } });
  const data = productoIds.flatMap((productoId) => validas.map((s) => ({ productoId, sucursalId: s.id })));
  if (data.length > 0) await tx.productoSucursal.createMany({ data });
}

export async function productosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/productos", async (request) => {
    const { empresaId } = request.user;
    const { q, sucursalId } = request.query as { q?: string; sucursalId?: string };
    const productos = await prisma.producto.findMany({
      where: {
        empresaId,
        activo: true,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { codigoBarras: { contains: q, mode: "insensitive" } },
                { categoria: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(sucursalId
          ? { AND: [{ OR: [{ sucursalesDisponibles: { none: {} } }, { sucursalesDisponibles: { some: { sucursalId } } }] }] }
          : {}),
      },
      include: sucursalId ? { inventario: { where: { sucursalId } } } : undefined,
      orderBy: { nombre: "asc" },
    });
    // stockSucursal solo viene cuando se pide con sucursalId (lo usa el POS
    // para avisar de falta de existencias antes de cobrar).
    return productos.map((p) => {
      const { inventario, ...resto } = p as typeof p & { inventario?: { cantidad: number }[] };
      return { ...resto, stockSucursal: sucursalId ? inventario?.[0]?.cantidad ?? 0 : undefined };
    });
  });

  // Usado por el lector de código de barras en el POS: busca coincidencia exacta.
  // Si se pasa sucursalId, solo encuentra el producto si esta disponible ahi.
  app.get("/productos/buscar", async (request, reply) => {
    const { empresaId } = request.user;
    const { codigo, sucursalId } = request.query as { codigo?: string; sucursalId?: string };
    if (!codigo) return reply.code(400).send({ error: "Falta el parametro codigo" });

    const producto = await prisma.producto.findFirst({
      where: {
        empresaId,
        activo: true,
        OR: [{ codigoBarras: codigo }, { sku: codigo }],
      },
      include: {
        sucursalesDisponibles: true,
        ...(sucursalId ? { inventario: { where: { sucursalId } } } : {}),
      },
    });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    if (sucursalId && producto.sucursalesDisponibles.length > 0) {
      const disponibleAqui = producto.sucursalesDisponibles.some((d) => d.sucursalId === sucursalId);
      if (!disponibleAqui) {
        return reply.code(404).send({ error: "Este producto no esta disponible en esta sucursal" });
      }
    }
    const { sucursalesDisponibles, inventario, ...resto } = producto as typeof producto & {
      inventario?: { cantidad: number }[];
    };
    return { ...resto, stockSucursal: sucursalId ? inventario?.[0]?.cantidad ?? 0 : undefined };
  });

  app.get("/productos/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const producto = await prisma.producto.findFirst({
      where: { id, empresaId },
      include: { colecciones: { include: { coleccion: true } }, sucursalesDisponibles: true },
    });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const variantes = producto.shopifyProductId
      ? await prisma.producto.findMany({
          where: { empresaId, shopifyProductId: producto.shopifyProductId, id: { not: producto.id } },
          orderBy: { varianteTitulo: "asc" },
        })
      : [];

    const { sucursalesDisponibles, ...resto } = producto;
    return {
      ...resto,
      colecciones: producto.colecciones.map((pc) => pc.coleccion),
      sucursalIds: sucursalesDisponibles.map((d) => d.sucursalId),
      variantes,
    };
  });

  app.post("/productos", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const parsed = CrearProductoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { sucursalIds, ...datosProducto } = parsed.data;

    const existente = await prisma.producto.findUnique({
      where: { empresaId_sku: { empresaId, sku: parsed.data.sku } },
    });
    if (existente) {
      return reply.code(409).send({ error: "Ya existe un producto con ese SKU" });
    }

    const producto = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({ data: { empresaId, ...datosProducto } });
      const sucursales = await tx.sucursal.findMany({ where: { empresaId, activo: true } });
      if (sucursales.length > 0) {
        await tx.inventarioSucursal.createMany({
          data: sucursales.map((s) => ({ productoId: producto.id, sucursalId: s.id, cantidad: 0 })),
        });
      }
      if (sucursalIds && sucursalIds.length > 0) {
        await sincronizarDisponibilidad(tx, empresaId, [producto.id], sucursalIds);
      }
      return producto;
    });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_PRODUCTO",
      entidad: "Producto",
      entidadId: producto.id,
      detalle: producto.nombre,
    });

    const conShopify = await empujarProductoAShopify(producto);
    let productoFinal = producto;
    if (conShopify.shopifyProductId !== producto.shopifyProductId) {
      productoFinal = await prisma.producto.update({
        where: { id: producto.id },
        data: {
          shopifyProductId: conShopify.shopifyProductId,
          shopifyVariantId: conShopify.shopifyVariantId,
          shopifyInventoryItemId: conShopify.shopifyInventoryItemId,
        },
      });
    }

    return reply.code(201).send(productoFinal);
  });

  // Edicion masiva: aplica los mismos cambios (categoria/proveedor/activo) a
  // varios productos a la vez, desde la seleccion multiple en Inventario.
  app.patch("/productos/bulk", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const parsed = EdicionMasivaProductosSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { productoIds, ...cambios } = parsed.data;
    if (Object.keys(cambios).length === 0) {
      return reply.code(400).send({ error: "No hay cambios para aplicar" });
    }

    const resultado = await prisma.producto.updateMany({
      where: { id: { in: productoIds }, empresaId },
      data: cambios,
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "EDICION_MASIVA_PRODUCTOS",
      entidad: "Producto",
      detalle: `${resultado.count} producto(s): ${Object.keys(cambios).join(", ")}`,
    });

    return { actualizados: resultado.count };
  });

  app.patch("/productos/:id", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id } = request.params as { id: string };
    const parsed = CrearProductoSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const { sucursalIds, ...datosProducto } = parsed.data;
    let actualizado = await prisma.producto.update({ where: { id }, data: datosProducto });

    if (sucursalIds !== undefined) {
      // La disponibilidad se comparte entre todas las variantes del mismo
      // producto de Shopify (misma prenda, distintos talle/color).
      const idsHermanos = producto.shopifyProductId
        ? (
            await prisma.producto.findMany({
              where: { empresaId, shopifyProductId: producto.shopifyProductId },
              select: { id: true },
            })
          ).map((p) => p.id)
        : [id];
      await prisma.$transaction((tx) => sincronizarDisponibilidad(tx, empresaId, idsHermanos, sucursalIds));
      registrarAuditoria({
        empresaId,
        usuarioId: request.user.usuarioId,
        accion: "ACTUALIZAR_DISPONIBILIDAD_PRODUCTO",
        entidad: "Producto",
        entidadId: id,
        detalle: sucursalIds.length > 0 ? `restringido a ${sucursalIds.length} sucursal(es)` : "disponible en todas",
      });
    }

    const conShopify = await empujarProductoAShopify(actualizado);
    if (conShopify.shopifyProductId !== actualizado.shopifyProductId) {
      actualizado = await prisma.producto.update({
        where: { id },
        data: {
          shopifyProductId: conShopify.shopifyProductId,
          shopifyVariantId: conShopify.shopifyVariantId,
          shopifyInventoryItemId: conShopify.shopifyInventoryItemId,
        },
      });
    }

    return actualizado;
  });

  // Sube una imagen (JSON: { dataUrl: "data:image/png;base64,...." }) y la
  // asocia al producto en Shopify (si esta configurado); Shopify hostea la
  // imagen y devuelve la URL publica que guardamos localmente.
  app.post("/productos/:id/imagen", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const { dataUrl } = request.body as { dataUrl?: string };
    if (!dataUrl) return reply.code(400).send({ error: "Falta la imagen" });

    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) {
      return reply.code(400).send({ error: "Conecta Shopify primero para poder subir imagenes" });
    }

    let shopifyProductId = producto.shopifyProductId;
    if (!shopifyProductId) {
      const conShopify = await empujarProductoAShopify(producto);
      shopifyProductId = conShopify.shopifyProductId;
      if (shopifyProductId) {
        await prisma.producto.update({
          where: { id },
          data: {
            shopifyProductId: conShopify.shopifyProductId,
            shopifyVariantId: conShopify.shopifyVariantId,
            shopifyInventoryItemId: conShopify.shopifyInventoryItemId,
          },
        });
      }
    }
    if (!shopifyProductId) {
      return reply.code(502).send({ error: "No se pudo vincular el producto con Shopify" });
    }

    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    try {
      const imagenUrl = await subirImagenAShopify(empresaId, shopifyProductId, base64);
      const actualizado = await prisma.producto.update({ where: { id }, data: { imagenUrl } });
      return actualizado;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "No se pudo subir la imagen" });
    }
  });

  // Agrega una nueva variante (ej. otro color) al mismo producto de Shopify.
  // Requiere que el producto ya este vinculado a Shopify (tenga shopifyProductId).
  app.post("/productos/:id/variantes", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = CrearVarianteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    if (!producto.shopifyProductId) {
      return reply.code(400).send({ error: "Este producto no esta vinculado a Shopify todavia" });
    }

    const existente = await prisma.producto.findUnique({
      where: { empresaId_sku: { empresaId, sku: parsed.data.sku } },
    });
    if (existente) return reply.code(409).send({ error: "Ya existe un producto con ese SKU" });

    let ids: { shopifyVariantId: string; shopifyInventoryItemId: string };
    try {
      ids = await crearVarianteEnShopify(empresaId, producto.shopifyProductId, parsed.data);
    } catch (err) {
      request.log.error(err);
      const mensaje = err instanceof Error ? err.message : "";
      if (mensaje.includes("linked to a metafield")) {
        return reply.code(502).send({
          error:
            "Este producto usa opciones vinculadas a un metafield en Shopify (por ejemplo, un color estandarizado con muestra de color). " +
            "Shopify no permite crear valores nuevos para ese tipo de opcion desde la API; el valor debe existir ya en la lista de opciones " +
            "definida en Shopify, o tienes que agregarlo primero desde el admin de Shopify.",
        });
      }
      return reply.code(502).send({ error: mensaje || "No se pudo crear la variante en Shopify" });
    }

    const nuevaVariante = await prisma.$transaction(async (tx) => {
      const nueva = await tx.producto.create({
        data: {
          empresaId,
          sku: parsed.data.sku,
          nombre: producto.nombre,
          categoria: producto.categoria,
          precio: parsed.data.precio,
          costo: producto.costo,
          codigoBarras: parsed.data.codigoBarras,
          varianteTitulo: parsed.data.opcionValor,
          shopifyProductId: producto.shopifyProductId,
          shopifyVariantId: ids.shopifyVariantId,
          shopifyInventoryItemId: ids.shopifyInventoryItemId,
          imagenUrl: producto.imagenUrl,
        },
      });
      const sucursales = await tx.sucursal.findMany({ where: { empresaId, activo: true } });
      if (sucursales.length > 0) {
        await tx.inventarioSucursal.createMany({
          data: sucursales.map((s) => ({ productoId: nueva.id, sucursalId: s.id, cantidad: 0 })),
        });
      }
      // La nueva variante hereda la disponibilidad por sucursal del producto padre.
      const disponibilidadPadre = await tx.productoSucursal.findMany({ where: { productoId: producto.id } });
      if (disponibilidadPadre.length > 0) {
        await tx.productoSucursal.createMany({
          data: disponibilidadPadre.map((d) => ({ productoId: nueva.id, sucursalId: d.sucursalId })),
        });
      }
      return nueva;
    });

    return reply.code(201).send(nuevaVariante);
  });
}
