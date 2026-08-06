import type { FastifyInstance } from "fastify";
import { CrearEventoSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

const MS_DIA = 24 * 60 * 60 * 1000;

interface EventoSalida {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora: string | null;
  prioridad: string;
  estado: string;
  tipo: string;
  responsableId: string | null;
  responsableNombre: string | null;
  origen: "manual" | "credito" | "inventario";
  editable: boolean;
}

export async function calendarioRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Lista de eventos entre dos fechas: los manuales (guardados) + los
  // automaticos derivados de creditos (vencimientos de cuotas) y de inventario
  // (productos en/bajo stock minimo).
  app.get("/calendario", async (request) => {
    const { empresaId } = request.user;
    const { desde, hasta } = request.query as { desde?: string; hasta?: string };
    const inicio = desde ? new Date(desde) : new Date(Date.now() - 7 * MS_DIA);
    const fin = hasta ? new Date(hasta) : new Date(Date.now() + 60 * MS_DIA);

    const eventos: EventoSalida[] = [];
    const ahora = Date.now();

    // 1) Manuales.
    const manuales = await prisma.eventoCalendario.findMany({
      where: { empresaId, fecha: { gte: inicio, lte: fin } },
      include: { responsable: { select: { nombre: true } } },
      orderBy: { fecha: "asc" },
    });
    for (const e of manuales) {
      eventos.push({
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        fecha: e.fecha.toISOString(),
        hora: e.hora,
        prioridad: e.prioridad,
        estado: e.estado,
        tipo: e.tipo,
        responsableId: e.responsableId,
        responsableNombre: e.responsable?.nombre ?? null,
        origen: "manual",
        editable: true,
      });
    }

    // 2) Creditos de ventas POS: una entrada por cada cuota pendiente en el rango.
    const ventasCredito = await prisma.venta.findMany({
      where: { empresaId, metodoPago: "CREDITO" },
      include: { cliente: { select: { nombre: true } } },
      orderBy: { fecha: "asc" },
    });
    const abonosPorCliente = await prisma.abono.groupBy({
      by: ["clienteId"],
      where: { cliente: { empresaId } },
      _sum: { monto: true },
    });
    const poolAbonos = new Map(abonosPorCliente.map((a) => [a.clienteId, Number(a._sum.monto ?? 0)]));

    for (const venta of ventasCredito) {
      if (!venta.clienteId) continue;
      const total = Number(venta.total);
      const disponible = poolAbonos.get(venta.clienteId) ?? 0;
      const aplicado = Math.min(disponible, total);
      poolAbonos.set(venta.clienteId, disponible - aplicado);
      const pendiente = Math.round((total - aplicado) * 100) / 100;
      if (pendiente <= 0) continue;

      const numCuotas = venta.numeroCuotasCredito || 1;
      const fechaFin = venta.fechaVencimientoCredito || venta.fecha;
      const totalMs = fechaFin.getTime() - venta.fecha.getTime();
      const intervalMs = numCuotas > 1 ? totalMs / numCuotas : totalMs;

      for (let i = 0; i < numCuotas; i++) {
        const fechaCuota = new Date(venta.fecha.getTime() + (i + 1) * intervalMs);
        if (fechaCuota < inicio || fechaCuota > fin) continue;
        const vencida = fechaCuota.getTime() < ahora;
        const montoCuota = Math.round((total / numCuotas) * 100) / 100;
        eventos.push({
          id: `credito-venta-${venta.id}-${i + 1}`,
          titulo: `Cobro crédito #${venta.consecutivo} - ${venta.cliente?.nombre ?? "Cliente"}`,
          descripcion: numCuotas > 1 ? `Cuota ${i + 1} de ${numCuotas}: $${montoCuota.toLocaleString("es-CO")}` : `Pendiente: $${pendiente.toLocaleString("es-CO")}`,
          fecha: fechaCuota.toISOString(),
          hora: null,
          prioridad: vencida ? "ALTA" : "MEDIA",
          estado: "PENDIENTE",
          tipo: "RECORDATORIO",
          responsableId: null,
          responsableNombre: null,
          origen: "credito",
          editable: false,
        });
      }
    }

    // 4) Creditos manuales: una alerta por cada cuota pendiente con vencimiento
    //    en el rango.
    const creditos = await prisma.creditoManual.findMany({
      where: { empresaId, activo: true },
      include: { cuotas: true, cliente: { select: { nombre: true } } },
    });
    for (const c of creditos) {
      for (const cuota of c.cuotas) {
        const pendiente = Number(cuota.valor) - Number(cuota.pagado);
        if (pendiente <= 0) continue;
        if (cuota.fechaVencimiento < inicio || cuota.fechaVencimiento > fin) continue;
        const vencida = cuota.fechaVencimiento.getTime() < ahora;
        eventos.push({
          id: `credito-${cuota.id}`,
          titulo: `Cobro credito #${c.numero} - ${c.cliente.nombre}`,
          descripcion: `Cuota ${cuota.numero}: pendiente $${Math.round(pendiente).toLocaleString("es-CO")}`,
          fecha: cuota.fechaVencimiento.toISOString(),
          hora: null,
          prioridad: vencida ? "ALTA" : "MEDIA",
          estado: vencida ? "PENDIENTE" : "PENDIENTE",
          tipo: "RECORDATORIO",
          responsableId: null,
          responsableNombre: null,
          origen: "credito",
          editable: false,
        });
      }
    }

    // 5) Inventario: productos activos con stock minimo configurado cuyo stock
    //    total esta en o por debajo del minimo (recordatorio de reposicion hoy).
    const productos = await prisma.producto.findMany({
      where: { empresaId, activo: true, stockMinimo: { gt: 0 } },
      include: { inventario: { select: { cantidad: true } } },
    });
    const hoy = new Date();
    for (const p of productos) {
      const total = p.inventario.reduce((acc, i) => acc + i.cantidad, 0);
      if (total > p.stockMinimo) continue;
      if (hoy < inicio || hoy > fin) continue;
      eventos.push({
        id: `stock-${p.id}`,
        titulo: `Reponer stock: ${p.nombre}${p.varianteTitulo ? ` (${p.varianteTitulo})` : ""}`,
        descripcion: `Quedan ${total}, minimo ${p.stockMinimo}`,
        fecha: hoy.toISOString(),
        hora: null,
        prioridad: total <= 0 ? "ALTA" : "MEDIA",
        estado: "PENDIENTE",
        tipo: "RECORDATORIO",
        responsableId: null,
        responsableNombre: null,
        origen: "inventario",
        editable: false,
      });
    }

    eventos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    return eventos;
  });

  // Resumen para el badge del menu: pendientes de hoy + vencidos.
  app.get("/calendario/resumen", async (request) => {
    const { empresaId } = request.user;
    const hoyIni = new Date();
    hoyIni.setHours(0, 0, 0, 0);
    const hoyFin = new Date();
    hoyFin.setHours(23, 59, 59, 999);
    const pendientesHoy = await prisma.eventoCalendario.count({
      where: { empresaId, estado: { not: "COMPLETADO" }, fecha: { gte: hoyIni, lte: hoyFin } },
    });
    return { pendientesHoy };
  });

  app.post("/calendario", async (request, reply) => {
    const { empresaId } = request.user;
    const parsed = CrearEventoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    const { fecha, responsableId, ...resto } = parsed.data;

    const evento = await prisma.eventoCalendario.create({
      data: { empresaId, fecha: new Date(fecha), responsableId: responsableId || null, ...resto },
    });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_EVENTO",
      entidad: "EventoCalendario",
      entidadId: evento.id,
      detalle: evento.titulo,
    });
    return reply.code(201).send(evento);
  });

  app.put("/calendario/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = CrearEventoSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    const existe = await prisma.eventoCalendario.findFirst({ where: { id, empresaId } });
    if (!existe) return reply.code(404).send({ error: "Evento no encontrado" });

    const { fecha, responsableId, ...resto } = parsed.data;
    const evento = await prisma.eventoCalendario.update({
      where: { id },
      data: {
        ...resto,
        ...(fecha ? { fecha: new Date(fecha) } : {}),
        ...(responsableId !== undefined ? { responsableId: responsableId || null } : {}),
      },
    });
    return evento;
  });

  app.delete("/calendario/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const existe = await prisma.eventoCalendario.findFirst({ where: { id, empresaId } });
    if (!existe) return reply.code(404).send({ error: "Evento no encontrado" });
    await prisma.eventoCalendario.delete({ where: { id } });
    return reply.code(204).send();
  });
}
