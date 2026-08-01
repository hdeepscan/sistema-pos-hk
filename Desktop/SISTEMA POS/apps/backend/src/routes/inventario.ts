import type { FastifyInstance } from "fastify";
import { RegistrarMovimientoSchema, AjustarStockDirectoSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { emitInventarioActualizado } from "../lib/ws.js";
import { ajustarInventarioEnShopifySiCorresponde } from "../lib/shopify.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

// El stock nunca queda en negativo: si el delta lo llevaria por debajo de 0,
// se deja en 0.
async function ajustarStock(productoId: string, sucursalId: string, delta: number) {
  const actual = await prisma.inventarioSucursal.findUnique({
    where: { productoId_sucursalId: { productoId, sucursalId } },
  });
  const nueva = Math.max(0, (actual?.cantidad ?? 0) + delta);
  const inv = await prisma.inventarioSucursal.upsert({
    where: { productoId_sucursalId: { productoId, sucursalId } },
    update: { cantidad: nueva },
    create: { productoId, sucursalId, cantidad: nueva },
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
      include: { inventario: { include: { sucursal: true } }, sucursalesDisponibles: true },
      orderBy: { nombre: "asc" },
    });
    return productos.map((p) => {
      // [] = disponible en todas las sucursales (sin restriccion configurada).
      const disponibleEn = p.sucursalesDisponibles.map((d) => d.sucursalId);
      return {
        productoId: p.id,
        sku: p.sku,
        nombre: p.nombre,
        precio: p.precio,
        costo: p.costo,
        categoria: p.categoria,
        codigoBarras: p.codigoBarras,
        imagenUrl: p.imagenUrl,
        proveedorId: p.proveedorId,
        disponibleEn,
        totalGeneral: p.inventario
          .filter((i) => disponibleEn.length === 0 || disponibleEn.includes(i.sucursalId))
          .reduce((acc, i) => acc + i.cantidad, 0),
        porSucursal: p.inventario.map((i) => ({
          sucursalId: i.sucursalId,
          sucursalNombre: i.sucursal.nombre,
          cantidad: i.cantidad,
        })),
      };
    });
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
    if (!request.user.permisos.includes("inventario.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar el inventario" });
    }
    const parsed = RegistrarMovimientoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
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

    if (tipo === "ENTRADA" || tipo === "AJUSTE") {
      void ajustarInventarioEnShopifySiCorresponde(empresaId, sucursalId, producto, cantidad);
    } else if (tipo === "SALIDA") {
      void ajustarInventarioEnShopifySiCorresponde(empresaId, sucursalId, producto, -cantidad);
    } else if (tipo === "TRASLADO" && sucursalDestinoId) {
      void ajustarInventarioEnShopifySiCorresponde(empresaId, sucursalId, producto, -cantidad);
      void ajustarInventarioEnShopifySiCorresponde(empresaId, sucursalDestinoId, producto, cantidad);
    }

    return reply.code(201).send(resultado);
  });

  // Ajuste directo desde la edicion rapida de Inventario: fija la cantidad
  // absoluta (en vez de pedir un delta), calculando el ajuste internamente
  // y dejando el mismo rastro (MovimientoInventario tipo AJUSTE) que el
  // flujo normal de movimientos.
  app.patch("/inventario/ajustar-directo", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("inventario.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar el inventario" });
    }
    const parsed = AjustarStockDirectoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    const { productoId, sucursalId, cantidad, motivo } = parsed.data;

    const producto = await prisma.producto.findFirst({ where: { id: productoId, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const actual = await prisma.inventarioSucursal.findUnique({
      where: { productoId_sucursalId: { productoId, sucursalId } },
    });
    const delta = cantidad - (actual?.cantidad ?? 0);
    if (delta === 0) return reply.send(actual ?? { productoId, sucursalId, cantidad: 0 });

    const inv = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventarioSucursal.upsert({
        where: { productoId_sucursalId: { productoId, sucursalId } },
        update: { cantidad },
        create: { productoId, sucursalId, cantidad },
      });
      await tx.movimientoInventario.create({
        data: {
          productoId,
          sucursalId,
          tipo: "AJUSTE",
          cantidad: Math.abs(delta),
          motivo: motivo || `Ajuste directo desde Inventario (${delta > 0 ? "+" : ""}${delta})`,
          usuarioId,
        },
      });
      return inv;
    });

    emitInventarioActualizado(empresaId, { productoId, sucursalId, cantidad: inv.cantidad });
    void ajustarInventarioEnShopifySiCorresponde(empresaId, sucursalId, producto, delta);
    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "AJUSTE_DIRECTO_STOCK",
      entidad: "InventarioSucursal",
      entidadId: productoId,
      detalle: `${producto.nombre}: ${actual?.cantidad ?? 0} -> ${cantidad}`,
    });

    return inv;
  });
}
