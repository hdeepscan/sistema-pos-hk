import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { generarPDFCotizacion } from "../lib/cotizacion-pdf.js";
import { generarWordCotizacion } from "../lib/cotizacion-word.js";

const ESTADOS = ["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA", "VENCIDA"] as const;
type Estado = (typeof ESTADOS)[number];
const TIPOS_DOCUMENTO = ["NIT", "CC", "CE", "PASAPORTE"];
// La firma se guarda como data URL; se limita para no inflar la base de datos.
const MAX_FIRMA = 700_000;

const INCLUDE_LINEAS = {
  lineas: {
    include: { producto: { select: { id: true, nombre: true, sku: true, varianteTitulo: true } } },
    orderBy: { orden: "asc" as const },
  },
};

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// Una cotización enviada o en borrador cuya vigencia ya pasó se muestra como VENCIDA.
function conEstadoVigente<T extends { estado: string; fechaVigencia: Date | null }>(c: T): T {
  if ((c.estado === "BORRADOR" || c.estado === "ENVIADA") && c.fechaVigencia) {
    const finDelDia = new Date(c.fechaVigencia);
    finDelDia.setUTCHours(23, 59, 59, 999);
    if (finDelDia.getTime() < Date.now()) return { ...c, estado: "VENCIDA" };
  }
  return c;
}

interface LineaEntrada {
  productoId: string;
  cantidad: unknown;
  precioUnitario?: unknown;
  descuentoPorcentaje?: unknown;
}

interface DatosCotizacion {
  clienteNombre: string;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  clienteEmpresa: string | null;
  clienteDireccion: string | null;
  clienteTipoDocumento: string | null;
  clienteNumeroDocumento: string | null;
  fechaVigencia: Date | null;
  comentarios: string | null;
  condicionesPago: string | null;
  firmaBase64: string | null;
  descuentoPorcentaje: number;
  impuestoPorcentaje: number;
  subtotal: number;
  descuentoValor: number;
  impuestoValor: number;
  total: number;
  lineas: {
    productoId: string;
    cantidad: number;
    precioUnitario: number;
    descuentoPorcentaje: number;
    descuentoValor: number;
    subtotal: number;
    orden: number;
  }[];
}

const texto = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const porcentaje = (v: unknown): number | null => {
  const n = v === undefined || v === null || v === "" ? 0 : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/**
 * Valida el cuerpo y calcula los montos. Orden de cálculo (igual al de la pantalla):
 * línea = cantidad × precio − descuento de línea; subtotal = suma de líneas;
 * descuento global sobre el subtotal; IVA sobre (subtotal − descuento global).
 */
async function prepararCotizacion(empresaId: string, body: any): Promise<DatosCotizacion | { error: string }> {
  const clienteNombre = texto(body?.clienteNombre, 200);
  if (!clienteNombre) return { error: "El nombre del cliente es obligatorio" };

  const lineas: LineaEntrada[] = Array.isArray(body?.lineas) ? body.lineas : [];
  if (lineas.length === 0) return { error: "Agrega al menos un producto" };
  if (lineas.length > 300) return { error: "Máximo 300 productos por cotización" };

  const descuentoPorcentaje = porcentaje(body.descuentoPorcentaje);
  const impuestoPorcentaje = porcentaje(body.impuestoPorcentaje);
  if (descuentoPorcentaje === null) return { error: "El descuento global debe estar entre 0 y 100%" };
  if (impuestoPorcentaje === null) return { error: "El IVA debe estar entre 0 y 100%" };

  const ids = [...new Set(lineas.map((l) => String(l?.productoId ?? "")))];
  const productos = await prisma.producto.findMany({
    where: { id: { in: ids }, empresaId },
    select: { id: true, precio: true },
  });
  const precioPorId = new Map(productos.map((p) => [p.id, Number(p.precio)]));
  if (productos.length !== ids.length) return { error: "Algún producto no existe o no pertenece a tu empresa" };

  const lineasCalculadas: DatosCotizacion["lineas"] = [];
  for (const [idx, l] of lineas.entries()) {
    const cantidad = Number(l.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: `Línea ${idx + 1}: la cantidad debe ser mayor a 0` };
    // Un precio 0 es válido (obsequio); solo se usa el del producto si no se envía.
    const precioUnitario =
      l.precioUnitario === undefined || l.precioUnitario === null || l.precioUnitario === ""
        ? precioPorId.get(String(l.productoId))!
        : Number(l.precioUnitario);
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) return { error: `Línea ${idx + 1}: precio inválido` };
    const descLinea = porcentaje(l.descuentoPorcentaje);
    if (descLinea === null) return { error: `Línea ${idx + 1}: el descuento debe estar entre 0 y 100%` };

    const bruto = cantidad * precioUnitario;
    const descuentoValor = redondear((bruto * descLinea) / 100);
    lineasCalculadas.push({
      productoId: String(l.productoId),
      cantidad,
      precioUnitario: redondear(precioUnitario),
      descuentoPorcentaje: descLinea,
      descuentoValor,
      subtotal: redondear(bruto - descuentoValor),
      orden: idx,
    });
  }

  const subtotal = redondear(lineasCalculadas.reduce((acc, l) => acc + l.subtotal, 0));
  const descuentoValor = redondear((subtotal * descuentoPorcentaje) / 100);
  const impuestoValor = redondear(((subtotal - descuentoValor) * impuestoPorcentaje) / 100);
  const total = redondear(subtotal - descuentoValor + impuestoValor);

  let fechaVigencia: Date | null = null;
  if (body.fechaVigencia) {
    fechaVigencia = new Date(`${String(body.fechaVigencia).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(fechaVigencia.getTime())) return { error: "Fecha de vigencia inválida" };
  }

  const tipoDoc = texto(body.clienteTipoDocumento ?? body.tipoDocumento, 20);
  const firma = texto(body.firmaBase64, MAX_FIRMA + 1);
  if (firma && (!firma.startsWith("data:image/") || firma.length > MAX_FIRMA)) {
    return { error: "La firma debe ser una imagen PNG o JPG de menos de 500 KB" };
  }

  return {
    clienteNombre,
    clienteEmail: texto(body.clienteEmail, 200),
    clienteTelefono: texto(body.clienteTelefono, 50),
    clienteEmpresa: texto(body.clienteEmpresa, 200),
    clienteDireccion: texto(body.clienteDireccion, 300),
    clienteTipoDocumento: tipoDoc && TIPOS_DOCUMENTO.includes(tipoDoc) ? tipoDoc : null,
    clienteNumeroDocumento: texto(body.clienteNumeroDocumento ?? body.numeroDocumento, 50),
    fechaVigencia,
    comentarios: texto(body.comentarios, 3000),
    condicionesPago: texto(body.condicionesPago, 1000),
    firmaBase64: firma,
    descuentoPorcentaje,
    impuestoPorcentaje,
    subtotal,
    descuentoValor,
    impuestoValor,
    total,
    lineas: lineasCalculadas,
  };
}

export async function cotizacionesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /cotizaciones - Listar las cotizaciones de la empresa (las más recientes primero)
  app.get("/cotizaciones", async (request, reply) => {
    const { empresaId } = request.user;
    const { estado, take } = request.query as { estado?: string; take?: string };
    if (estado && !(ESTADOS as readonly string[]).includes(estado)) {
      return reply.code(400).send({ error: "Estado inválido" });
    }

    const cotizaciones = await prisma.cotizacion.findMany({
      where: { empresaId },
      include: INCLUDE_LINEAS,
      orderBy: { fechaCreacion: "desc" },
      take: Math.min(Number(take) || 500, 1000),
    });

    // La firma no se envía en el listado (puede ser pesada).
    const resultado = cotizaciones.map((c) => conEstadoVigente({ ...c, firmaBase64: null, tieneFirma: !!c.firmaBase64 }));
    return estado ? resultado.filter((c) => c.estado === estado) : resultado;
  });

  // GET /cotizaciones/:id - Detalle de una cotización
  app.get("/cotizaciones/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const cotizacion = await prisma.cotizacion.findFirst({ where: { id, empresaId }, include: INCLUDE_LINEAS });
    if (!cotizacion) return reply.code(404).send({ error: "Cotización no encontrada" });
    return conEstadoVigente(cotizacion);
  });

  // POST /cotizaciones - Crear cotización
  app.post("/cotizaciones", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("cotizaciones.crear")) {
      return reply.code(403).send({ error: "No tienes permiso para crear cotizaciones" });
    }
    const datos = await prepararCotizacion(empresaId, request.body);
    if ("error" in datos) return reply.code(400).send({ error: datos.error });

    try {
      const { lineas, ...resto } = datos;
      const cotizacion = await prisma.$transaction(async (tx) => {
        const ultima = await tx.cotizacion.findFirst({
          where: { empresaId },
          orderBy: { secuencial: "desc" },
          select: { secuencial: true },
        });
        const secuencial = (ultima?.secuencial ?? 0) + 1;
        return tx.cotizacion.create({
          data: {
            ...resto,
            empresaId,
            numero: `COT-${String(secuencial).padStart(6, "0")}`,
            secuencial,
            estado: "BORRADOR",
            creadoPor: usuarioId,
            lineas: { create: lineas },
          },
          include: INCLUDE_LINEAS,
        });
      });

      registrarAuditoria({
        empresaId,
        usuarioId,
        accion: "CREAR_COTIZACION",
        entidad: "Cotizacion",
        entidadId: cotizacion.id,
        detalle: `${cotizacion.numero} - ${cotizacion.clienteNombre}`,
      });
      return reply.code(201).send(cotizacion);
    } catch (err) {
      console.error("Error creando cotización:", err);
      return reply.code(500).send({ error: "Error al crear la cotización" });
    }
  });

  // PUT /cotizaciones/:id - Editar cliente, productos, descuentos e IVA (recalcula los totales)
  app.put("/cotizaciones/:id", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    const { id } = request.params as { id: string };
    if (!request.user.permisos.includes("cotizaciones.editar")) {
      return reply.code(403).send({ error: "No tienes permiso para editar cotizaciones" });
    }
    const existente = await prisma.cotizacion.findFirst({ where: { id, empresaId } });
    if (!existente) return reply.code(404).send({ error: "Cotización no encontrada" });

    const body = request.body as any;
    const datos = await prepararCotizacion(empresaId, body);
    if ("error" in datos) return reply.code(400).send({ error: datos.error });
    const { lineas, ...resto } = datos;
    // Si no se envía una firma nueva, se conserva la anterior (salvo que se pida quitarla).
    const firmaBase64 = datos.firmaBase64 ?? (body?.quitarFirma ? null : existente.firmaBase64);

    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.lineaCotizacion.deleteMany({ where: { cotizacionId: id } });
      return tx.cotizacion.update({
        where: { id },
        data: { ...resto, firmaBase64, lineas: { create: lineas } },
        include: INCLUDE_LINEAS,
      });
    });

    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "EDITAR_COTIZACION",
      entidad: "Cotizacion",
      entidadId: id,
      detalle: `${actualizada.numero} - ${actualizada.clienteNombre}`,
    });
    return conEstadoVigente(actualizada);
  });

  // PATCH /cotizaciones/:id/estado - Cambiar estado (enviada, aceptada, rechazada...)
  app.patch("/cotizaciones/:id/estado", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    const { id } = request.params as { id: string };
    if (!request.user.permisos.includes("cotizaciones.editar")) {
      return reply.code(403).send({ error: "No tienes permiso para editar cotizaciones" });
    }
    const { estado } = (request.body ?? {}) as { estado?: string };
    if (!estado || !(ESTADOS as readonly string[]).includes(estado)) {
      return reply.code(400).send({ error: "Estado inválido" });
    }
    const existente = await prisma.cotizacion.findFirst({ where: { id, empresaId } });
    if (!existente) return reply.code(404).send({ error: "Cotización no encontrada" });

    const actualizada = await prisma.cotizacion.update({
      where: { id },
      data: { estado: estado as Estado },
      include: INCLUDE_LINEAS,
    });
    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "CAMBIAR_ESTADO_COTIZACION",
      entidad: "Cotizacion",
      entidadId: id,
      detalle: `${actualizada.numero}: ${existente.estado} → ${estado}`,
    });
    return conEstadoVigente(actualizada);
  });

  // DELETE /cotizaciones/:id - Eliminar cotización (solo de la propia empresa)
  app.delete("/cotizaciones/:id", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    const { id } = request.params as { id: string };
    if (!request.user.permisos.includes("cotizaciones.eliminar")) {
      return reply.code(403).send({ error: "No tienes permiso para eliminar cotizaciones" });
    }
    const existente = await prisma.cotizacion.findFirst({ where: { id, empresaId } });
    if (!existente) return reply.code(404).send({ error: "Cotización no encontrada" });

    await prisma.cotizacion.delete({ where: { id } });
    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "ELIMINAR_COTIZACION",
      entidad: "Cotizacion",
      entidadId: id,
      detalle: `${existente.numero} - ${existente.clienteNombre}`,
    });
    return { mensaje: "Cotización eliminada" };
  });

  // GET /cotizaciones/:id/descargar/:formato - Descargar PDF o Word
  app.get("/cotizaciones/:id/descargar/:formato", async (request, reply) => {
    const { empresaId } = request.user;
    const { id, formato } = request.params as { id: string; formato: string };
    if (formato !== "pdf" && formato !== "word") {
      return reply.code(400).send({ error: "Formato debe ser 'pdf' o 'word'" });
    }

    try {
      const cotizacion = await prisma.cotizacion.findFirst({ where: { id, empresaId }, include: INCLUDE_LINEAS });
      if (!cotizacion) return reply.code(404).send({ error: "Cotización no encontrada" });

      // Datos del negocio: los de la plantilla de recibo (predeterminada) que configura la empresa.
      const [empresa, plantilla] = await Promise.all([
        prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } }),
        prisma.plantillaRecibo.findFirst({
          where: { empresaId },
          orderBy: [{ esPredeterminada: "desc" }, { actualizadoEn: "desc" }],
        }),
      ]);
      const datosEmpresa = {
        nombre: plantilla?.nombreNegocio || empresa?.nombre || "Mi Empresa",
        telefono: plantilla?.telefono || null,
        email: plantilla?.email || null,
        direccion: plantilla?.direccion || null,
      };

      const doc = conEstadoVigente(cotizacion);
      const nombreArchivo = `${cotizacion.numero}.${formato === "pdf" ? "pdf" : "docx"}`;
      const buffer =
        formato === "pdf" ? await generarPDFCotizacion(doc, datosEmpresa) : await generarWordCotizacion(doc, datosEmpresa);

      reply
        .type(
          formato === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        .header("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
      return reply.send(buffer);
    } catch (err) {
      console.error("Error descargando cotización:", err);
      return reply.code(500).send({ error: "Error al generar el documento" });
    }
  });
}
