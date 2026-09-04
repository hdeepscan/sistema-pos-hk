import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { generarPDFCotizacion } from "../lib/cotizacion-pdf.js";
import { generarWordCotizacion } from "../lib/cotizacion-word.js";

export async function cotizacionesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /cotizaciones - Listar todas las cotizaciones de la empresa
  app.get("/cotizaciones", async (request) => {
    const { empresaId } = request.user;
    const { estado, skip = 0, take = 20 } = request.query as {
      estado?: string;
      skip?: number;
      take?: number;
    };

    const cotizaciones = await (prisma as any).cotizacion.findMany({
      where: {
        empresaId,
        ...(estado && { estado }),
      },
      include: {
        lineas: {
          include: { producto: true },
        },
      },
      orderBy: { fechaCreacion: "desc" },
      skip: Number(skip),
      take: Math.min(Number(take), 100),
    });

    return cotizaciones;
  });

  // GET /cotizaciones/:id - Ver detalles de una cotización
  app.get("/cotizaciones/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };

    const cotizacion = await (prisma as any).cotizacion.findFirst({
      where: { id, empresaId },
      include: {
        lineas: {
          include: { producto: true },
          orderBy: { orden: "asc" },
        },
      },
    });

    if (!cotizacion) {
      return reply.code(404).send({ error: "Cotización no encontrada" });
    }

    return cotizacion;
  });

  // POST /cotizaciones - Crear nueva cotización
  app.post("/cotizaciones", async (request, reply) => {
    const { empresaId } = request.user;

    if (!request.user.permisos.includes("cotizaciones.crear" as any)) {
      return reply.code(403).send({ error: "No tienes permiso para crear cotizaciones" });
    }

    const { clienteNombre, clienteEmail, clienteTelefono, lineas, ...datosBasicos } = request.body as any;

    if (!clienteNombre || !Array.isArray(lineas) || lineas.length === 0) {
      return reply.code(400).send({
        error: "Faltan datos requeridos: clienteNombre, lineas (mínimo 1)",
      });
    }

    try {
      // Generar número de cotización único
      const ultimaCotizacion = await (prisma as any).cotizacion.findFirst({
        where: { empresaId },
        orderBy: { secuencial: "desc" },
        select: { secuencial: true },
      });

      const nuevoSecuencial = (ultimaCotizacion?.secuencial || 0) + 1;
      const numero = `COT-${nuevoSecuencial.toString().padStart(6, "0")}`;

      // Validar que los productos existan
      const productosIds = lineas.map((l: any) => l.productoId);
      const productos = await prisma.producto.findMany({
        where: { id: { in: productosIds }, empresaId },
      });

      if (productos.length !== productosIds.length) {
        return reply.code(400).send({ error: "Algunos productos no existen" });
      }

      // Calcular totales
      let subtotal = 0;
      const lineasConCalculos = lineas.map((linea: any, idx: number) => {
        const producto = productos.find((p) => p.id === linea.productoId);
        if (!producto) throw new Error("Producto no encontrado");

        const precioUnitario = linea.precioUnitario || producto.precio;
        const subTotal = linea.cantidad * Number(precioUnitario);
        const descuento = linea.descuentoPorcentaje
          ? (subTotal * linea.descuentoPorcentaje) / 100
          : linea.descuentoValor || 0;

        const total = subTotal - descuento;
        subtotal += total;

        return {
          productoId: linea.productoId,
          cantidad: linea.cantidad,
          precioUnitario: Number(precioUnitario),
          descuentoPorcentaje: linea.descuentoPorcentaje || 0,
          descuentoValor: descuento,
          subtotal: total,
          orden: idx,
        };
      });

      const impuestoValor = datosBasicos.impuestoPorcentaje
        ? (subtotal * datosBasicos.impuestoPorcentaje) / 100
        : 0;

      const descuentoValor = datosBasicos.descuentoPorcentaje
        ? (subtotal * datosBasicos.descuentoPorcentaje) / 100
        : datosBasicos.descuentoValor || 0;

      const total = subtotal - descuentoValor + impuestoValor;

      // Crear cotización con líneas
      const cotizacion = await (prisma as any).cotizacion.create({
        data: {
          empresaId,
          numero,
          secuencial: nuevoSecuencial,
          clienteNombre,
          clienteEmail,
          clienteTelefono,
          clienteEmpresa: datosBasicos.clienteEmpresa,
          clienteDireccion: datosBasicos.clienteDireccion,
          fechaVigencia: datosBasicos.fechaVigencia
            ? new Date(datosBasicos.fechaVigencia)
            : undefined,
          estado: "BORRADOR",
          subtotal,
          descuentoPorcentaje: datosBasicos.descuentoPorcentaje || 0,
          descuentoValor: descuentoValor,
          impuestoPorcentaje: datosBasicos.impuestoPorcentaje || 0,
          impuestoValor: impuestoValor,
          total,
          comentarios: datosBasicos.comentarios,
          condicionesPago: datosBasicos.condicionesPago,
          creadoPor: request.user.usuarioId,
          lineas: {
            create: lineasConCalculos,
          },
        },
        include: {
          lineas: {
            include: { producto: true },
          },
        },
      });

      registrarAuditoria({
        empresaId,
        usuarioId: request.user.usuarioId,
        accion: "CREAR_COTIZACION",
        entidad: "Cotizacion",
        entidadId: cotizacion.id,
        detalle: `${cotizacion.numero} - ${clienteNombre}`,
      });

      return reply.code(201).send(cotizacion);
    } catch (err) {
      console.error("Error creando cotización:", err);
      return reply.code(500).send({ error: "Error al crear cotización" });
    }
  });

  // PATCH /cotizaciones/:id - Actualizar cotización
  app.patch("/cotizaciones/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };

    if (!request.user.permisos.includes("cotizaciones.editar" as any)) {
      return reply.code(403).send({ error: "No tienes permiso para editar cotizaciones" });
    }

    const cotizacion = await (prisma as any).cotizacion.findFirst({
      where: { id, empresaId },
    });

    if (!cotizacion) {
      return reply.code(404).send({ error: "Cotización no encontrada" });
    }

    const { estado, ...datos } = request.body as any;

    const actualizada = await (prisma as any).cotizacion.update({
      where: { id },
      data: {
        ...datos,
        estado: estado || cotizacion.estado,
        actualizadoEn: new Date(),
      },
      include: {
        lineas: {
          include: { producto: true },
        },
      },
    });

    return actualizada;
  });

  // DELETE /cotizaciones/:id - Eliminar cotización
  app.delete("/cotizaciones/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };

    if (!request.user.permisos.includes("cotizaciones.eliminar" as any)) {
      return reply.code(403).send({ error: "No tienes permiso para eliminar cotizaciones" });
    }

    await (prisma as any).cotizacion.deleteMany({
      where: { id },
    });

    return { mensaje: "Cotización eliminada" };
  });

  // GET /cotizaciones/:id/descargar/:formato - Descargar PDF o Word
  app.get("/cotizaciones/:id/descargar/:formato", async (request, reply) => {
    const { empresaId } = request.user;
    const { id, formato } = request.params as { id: string; formato: "pdf" | "word" };

    if (!["pdf", "word"].includes(formato)) {
      return reply.code(400).send({ error: "Formato debe ser 'pdf' o 'word'" });
    }

    try {
      const cotizacion = await (prisma as any).cotizacion.findFirst({
        where: { id, empresaId },
        include: {
          lineas: {
            include: { producto: true },
            orderBy: { orden: "asc" },
          },
        },
      });

      if (!cotizacion) {
        return reply.code(404).send({ error: "Cotización no encontrada" });
      }

      // Obtener datos de la empresa
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
      });

      const datosEmpresa = {
        nombre: empresa?.nombre || "Mi Empresa",
        nit: "NIT_AQUI", // TODO: Agregar campo en tabla Empresa
        telefono: "TEL_AQUI",
        email: "EMAIL_AQUI",
        direccion: "DIRECCIÓN_AQUI",
      };

      let buffer: Buffer;
      let contentType: string;
      let filename: string;

      if (formato === "pdf") {
        buffer = await generarPDFCotizacion(cotizacion, datosEmpresa);
        contentType = "application/pdf";
        filename = `${cotizacion.numero}.pdf`;
      } else {
        buffer = await generarWordCotizacion(cotizacion, datosEmpresa);
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        filename = `${cotizacion.numero}.docx`;
      }

      reply.type(contentType).header("Content-Disposition", `attachment; filename="${filename}"`);
      return reply.send(buffer);
    } catch (err) {
      console.error("Error descargando cotización:", err);
      return reply.code(500).send({ error: "Error al generar documento" });
    }
  });
}
