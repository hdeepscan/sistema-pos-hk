import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { esSuperAdmin } from "../lib/super-admin.js";
import { wompiService } from "../services/wompiService.js";
import {
  cifrarCredenciales,
  credencialesDe,
  ErrorTFactura,
  probarConexion,
  type CredencialesTFactura,
} from "../lib/tfactura.js";
import {
  consumirFactura,
  ErrorFacturacion,
  PAQUETES,
  procesarComprobante,
  saldoFacturacion,
  solicitarFacturaVenta,
  type TipoPaquete,
} from "../lib/facturacion.js";

const ConfigSchema = z.object({
  usuario: z.string().trim().min(1, "Falta el usuario").max(200),
  password: z.string().min(1, "Falta la contraseña").max(200),
  identificador: z.string().trim().min(1, "Falta el identificador de usuario").max(500),
  clavePublica: z.string().trim().min(1, "Falta la clave pública").max(500),
  preciosIncluyenIva: z.boolean().optional(),
});

function comprobanteDto(c: any) {
  return {
    id: c.id,
    ventaId: c.ventaId,
    devolucionId: c.devolucionId,
    tipo: c.tipo,
    estado: c.estado,
    intentos: c.intentos,
    ultimoError: c.ultimoError,
    numero: c.numero,
    cufe: c.cufe,
    urlPdf: c.urlPdf,
    total: c.total != null ? Number(c.total) : null,
    emitidaEn: c.emitidaEn,
    creadoEn: c.creadoEn,
  };
}

export async function facturacionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  const puedeConfigurar = (permisos: string[]) => permisos.includes("configuracion.administrar");

  // Contador, paquetes y estado de la conexión. Lo usa también el POS para mostrar la opción.
  app.get("/facturacion/estado", async (request) => {
    const { empresaId } = request.user;
    const [saldo, config] = await Promise.all([
      saldoFacturacion(empresaId),
      prisma.facturacionConfig.findUnique({ where: { empresaId } }),
    ]);
    const conectada = !!config?.activo;
    return {
      ...saldo,
      conectada,
      config: config
        ? {
            activo: config.activo,
            preciosIncluyenIva: config.preciosIncluyenIva,
            ultimaPrueba: config.ultimaPrueba,
            ultimaPruebaOk: config.ultimaPruebaOk,
            ultimaPruebaMensaje: config.ultimaPruebaMensaje,
          }
        : null,
      puedeEmitir: conectada && saldo.disponibles > 0,
      precios: Object.entries(PAQUETES).map(([tipo, p]) => ({ tipo, ...p })),
    };
  });

  // Guardar las 4 claves de la aplicación de TFactura (se guardan cifradas) y probar la conexión.
  app.put("/facturacion/config", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!puedeConfigurar(request.user.permisos)) {
      return reply.code(403).send({ error: "No tienes permiso para configurar la facturación" });
    }
    const parsed = ConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    const { preciosIncluyenIva, ...resto } = parsed.data;
    const credenciales = resto as CredencialesTFactura;

    let ok = false;
    let mensaje: string;
    try {
      await probarConexion(empresaId, credenciales);
      ok = true;
      mensaje = "Conexión con TFactura correcta";
    } catch (err) {
      mensaje = err instanceof Error ? err.message : String(err);
      if (!(err instanceof ErrorTFactura)) console.error("[facturacion] Error probando la conexión:", err);
    }
    if (!ok) return reply.code(400).send({ error: `No se pudo conectar con TFactura: ${mensaje}` });

    const datos = {
      ...cifrarCredenciales(credenciales),
      activo: true,
      ...(preciosIncluyenIva !== undefined ? { preciosIncluyenIva } : {}),
      ultimaPrueba: new Date(),
      ultimaPruebaOk: true,
      ultimaPruebaMensaje: mensaje,
    };
    await prisma.facturacionConfig.upsert({
      where: { empresaId },
      create: { empresaId, ...datos },
      update: datos,
    });
    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "FACTURACION_CONECTADA",
      entidad: "FacturacionConfig",
      entidadId: empresaId,
      detalle: "Cuenta de TFactura conectada",
    });
    return { ok: true, mensaje };
  });

  app.patch("/facturacion/config", async (request, reply) => {
    const { empresaId } = request.user;
    if (!puedeConfigurar(request.user.permisos)) {
      return reply.code(403).send({ error: "No tienes permiso para configurar la facturación" });
    }
    const body = z
      .object({ activo: z.boolean().optional(), preciosIncluyenIva: z.boolean().optional() })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Datos inválidos" });
    const r = await prisma.facturacionConfig.updateMany({ where: { empresaId }, data: body.data });
    if (r.count === 0) return reply.code(404).send({ error: "Primero conecta tu cuenta de TFactura" });
    return { ok: true };
  });

  app.post("/facturacion/probar", async (request, reply) => {
    const { empresaId } = request.user;
    const credenciales = await credencialesDe(empresaId);
    if (!credenciales) return reply.code(404).send({ error: "Primero conecta tu cuenta de TFactura" });
    let ok = false;
    let mensaje: string;
    try {
      await probarConexion(empresaId, credenciales);
      ok = true;
      mensaje = "Conexión con TFactura correcta";
    } catch (err) {
      mensaje = err instanceof Error ? err.message : String(err);
    }
    await prisma.facturacionConfig.update({
      where: { empresaId },
      data: { ultimaPrueba: new Date(), ultimaPruebaOk: ok, ultimaPruebaMensaje: mensaje },
    });
    return { ok, mensaje };
  });

  // Comprar un paquete: crea el pago en Wompi. Al aprobarse, el webhook carga las facturas.
  app.post("/facturacion/comprar", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!puedeConfigurar(request.user.permisos)) {
      return reply.code(403).send({ error: "Solo el administrador puede comprar paquetes" });
    }
    const { paquete } = (request.body ?? {}) as { paquete?: string };
    if (!paquete || !(paquete in PAQUETES)) return reply.code(400).send({ error: "Paquete inválido" });
    const def = PAQUETES[paquete as TipoPaquete];

    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { email: true, nombre: true } });
    const referenciaPago = `FE-${paquete}-${empresaId.slice(0, 8)}-${Date.now()}`.toUpperCase();
    const checkout = await wompiService.crearOrdenPago({
      empresaId,
      referenciaPago,
      tipoPlan: "FACTURACION_ELECTRONICA",
      monto: def.precio,
      email: usuario?.email ?? "",
      nombre: usuario?.nombre ?? "",
      redirectPath: `/facturacion?pago=${encodeURIComponent(referenciaPago)}`,
    });
    await prisma.pago.create({
      data: {
        empresaId,
        referenciaPago,
        estado: "PENDIENTE",
        monto: def.precio,
        tipoPlan: "FACTURACION_ELECTRONICA",
        datosRegistro: JSON.stringify({ tipoCompra: "FACTURACION_ELECTRONICA", paquete }),
      },
    });
    return { url: checkout.url, referenciaPago };
  });

  // Estado de un pago de paquete (al volver de Wompi).
  app.get("/facturacion/pagos/:referencia", async (request, reply) => {
    const { empresaId } = request.user;
    const { referencia } = request.params as { referencia: string };
    const pago = await prisma.pago.findFirst({ where: { referenciaPago: referencia, empresaId } });
    if (!pago) return reply.code(404).send({ error: "Pago no encontrado" });
    const paquete = await prisma.paqueteFacturacion.findUnique({ where: { referenciaPago: referencia } });
    return { estado: pago.estado, acreditado: !!paquete };
  });

  // Emitir la factura electrónica de una venta (desde el POS al cobrar, o después desde Ventas).
  app.post("/facturacion/ventas/:ventaId/emitir", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("ventas.crear") && !request.user.permisos.includes("ventas.editar")) {
      return reply.code(403).send({ error: "No tienes permiso para facturar" });
    }
    const { ventaId } = request.params as { ventaId: string };
    try {
      const comprobante = await solicitarFacturaVenta(empresaId, ventaId);
      registrarAuditoria({
        empresaId,
        usuarioId,
        accion: "FACTURA_ELECTRONICA_SOLICITADA",
        entidad: "Venta",
        entidadId: ventaId,
        detalle: "Factura electrónica en cola",
      });
      const saldo = await saldoFacturacion(empresaId);
      return { comprobante: comprobanteDto(comprobante), disponibles: saldo.disponibles };
    } catch (err) {
      if (err instanceof ErrorFacturacion) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  // Comprobantes de una venta (para el recibo y el detalle de la venta).
  app.get("/facturacion/ventas/:ventaId", async (request) => {
    const { empresaId } = request.user;
    const { ventaId } = request.params as { ventaId: string };
    const lista = await prisma.comprobanteElectronico.findMany({
      where: { empresaId, ventaId },
      orderBy: { creadoEn: "asc" },
    });
    return lista.map(comprobanteDto);
  });

  app.get("/facturacion/comprobantes", async (request) => {
    const { empresaId } = request.user;
    const q = request.query as { estado?: string; desde?: string; hasta?: string; limite?: string };
    const where: any = { empresaId };
    if (q.estado) where.estado = q.estado;
    if (q.desde || q.hasta) {
      where.creadoEn = {
        ...(q.desde ? { gte: new Date(q.desde) } : {}),
        ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
      };
    }
    const lista = await prisma.comprobanteElectronico.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      take: Math.min(Number(q.limite) || 100, 500),
    });
    const ventas = await prisma.venta.findMany({
      where: { id: { in: [...new Set(lista.map((c) => c.ventaId))] } },
      select: { id: true, consecutivo: true, total: true, fecha: true, cliente: { select: { nombre: true } } },
    });
    const porId = new Map(ventas.map((v) => [v.id, v]));

    // Uso del mes actual.
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const usadasMes = await prisma.comprobanteElectronico.count({
      where: { empresaId, creadoEn: { gte: inicioMes }, paqueteId: { not: null } },
    });

    return {
      usadasMes,
      comprobantes: lista.map((c) => {
        const v = porId.get(c.ventaId);
        return {
          ...comprobanteDto(c),
          venta: v
            ? { consecutivo: v.consecutivo, total: Number(v.total), fecha: v.fecha, cliente: v.cliente?.nombre ?? null }
            : null,
        };
      }),
    };
  });

  // Reintentar un comprobante con error (vuelve a tomar 1 factura del paquete).
  app.post("/facturacion/comprobantes/:id/reintentar", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const c = await prisma.comprobanteElectronico.findFirst({ where: { id, empresaId } });
    if (!c) return reply.code(404).send({ error: "Comprobante no encontrado" });
    if (c.estado === "EMITIDA") return reply.code(400).send({ error: "Este comprobante ya fue emitido" });
    if (c.estado === "ENVIANDO") return reply.code(400).send({ error: "Se está enviando en este momento" });

    let paqueteId = c.paqueteId;
    if (!paqueteId) {
      paqueteId = await consumirFactura(empresaId);
      if (!paqueteId) {
        return reply.code(402).send({ error: "Se acabaron las facturas electrónicas. Compra una recarga para seguir." });
      }
    }
    await prisma.comprobanteElectronico.update({
      where: { id },
      data: { estado: "PENDIENTE", paqueteId, intentos: 0, proximoIntento: new Date(), ultimoError: null },
    });
    await procesarComprobante(id);
    const actualizado = await prisma.comprobanteElectronico.findUniqueOrThrow({ where: { id } });
    return comprobanteDto(actualizado);
  });

  // ---------- Dueño de la plataforma ----------

  const verificarDueno = async (usuarioId: string) => {
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { email: true } });
    return !!u && esSuperAdmin(u);
  };

  // Resumen de todas las empresas: saldo, paquetes y uso.
  app.get("/facturacion/admin/resumen", async (request, reply) => {
    if (!(await verificarDueno(request.user.usuarioId))) return reply.code(403).send({ error: "Solo el dueño de la plataforma" });
    const ahora = new Date();
    const [paquetes, configs] = await Promise.all([
      prisma.paqueteFacturacion.findMany({ orderBy: { creadoEn: "desc" } }),
      prisma.facturacionConfig.findMany({ select: { empresaId: true, activo: true } }),
    ]);
    const ids = [...new Set([...paquetes.map((p) => p.empresaId), ...configs.map((c) => c.empresaId)])];
    const empresas = await prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } });
    const emitidas = await prisma.comprobanteElectronico.groupBy({
      by: ["empresaId"],
      where: { estado: "EMITIDA" },
      _count: { _all: true },
    });
    return empresas.map((e) => {
      const propios = paquetes.filter((p) => p.empresaId === e.id);
      const vigentes = propios.filter((p) => p.venceEn > ahora);
      return {
        empresaId: e.id,
        empresa: e.nombre,
        conectada: !!configs.find((c) => c.empresaId === e.id)?.activo,
        disponibles: vigentes.reduce((acc, p) => acc + Math.max(0, p.cantidad - p.usadas), 0),
        emitidas: emitidas.find((x) => x.empresaId === e.id)?._count._all ?? 0,
        pagado: propios.reduce((acc, p) => acc + Number(p.precio), 0),
        ultimoPaquete: propios[0] ? { tipo: propios[0].tipo, creadoEn: propios[0].creadoEn, periodoHasta: propios[0].periodoHasta } : null,
      };
    });
  });

  // Regalar facturas de cortesía a una empresa (para pruebas o compensaciones).
  app.post("/facturacion/admin/cortesia", async (request, reply) => {
    if (!(await verificarDueno(request.user.usuarioId))) return reply.code(403).send({ error: "Solo el dueño de la plataforma" });
    const body = z
      .object({ empresaId: z.string().min(1), cantidad: z.number().int().min(1).max(1000) })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Datos inválidos" });
    const empresa = await prisma.empresa.findUnique({ where: { id: body.data.empresaId }, select: { id: true } });
    if (!empresa) return reply.code(404).send({ error: "Empresa no encontrada" });
    const dia = 24 * 60 * 60_000;
    const p = await prisma.paqueteFacturacion.create({
      data: {
        empresaId: body.data.empresaId,
        tipo: "CORTESIA",
        cantidad: body.data.cantidad,
        precio: 0,
        periodoHasta: new Date(Date.now() + 30 * dia),
        venceEn: new Date(Date.now() + 60 * dia),
      },
    });
    return p;
  });
}
