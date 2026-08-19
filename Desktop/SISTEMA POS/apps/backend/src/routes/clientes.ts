import type { FastifyInstance } from "fastify";
import { CrearClienteSchema, RegistrarAbonoSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { mensajeDeValidacion } from "../lib/errores.js";
import type { Prisma } from "@prisma/client";

async function calcularSaldo(clienteId: string) {
  const [deuda, abonado] = await Promise.all([
    prisma.venta.aggregate({
      where: { clienteId, metodoPago: "CREDITO" },
      _sum: { total: true },
    }),
    prisma.abono.aggregate({
      where: { clienteId },
      _sum: { monto: true },
    }),
  ]);
  const totalDeuda = Number(deuda._sum.total ?? 0);
  const totalAbonado = Number(abonado._sum.monto ?? 0);
  return totalDeuda - totalAbonado;
}

export async function clientesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/clientes", async (request) => {
    const { empresaId } = request.user;
    const { q } = request.query as { q?: string };
    const clientes = await prisma.cliente.findMany({
      where: {
        empresaId,
        activo: true,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { telefono: { contains: q, mode: "insensitive" } },
                { cedula: { contains: q, mode: "insensitive" } },
                { ciudad: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });

    const saldos = await Promise.all(clientes.map((c) => calcularSaldo(c.id)));
    return clientes.map((c, i) => ({ ...c, saldoPendiente: saldos[i] }));
  });

  app.post("/clientes", async (request, reply) => {
    if (!request.user.permisos.includes("clientes.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar clientes" });
    }
    const { empresaId } = request.user;
    const parsed = CrearClienteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const { email, ...resto } = parsed.data;
    const cliente = await prisma.cliente.create({
      data: { empresaId, ...resto, email: email || undefined } as Prisma.ClienteUncheckedCreateInput,
    });
    return reply.code(201).send({ ...cliente, saldoPendiente: 0 });
  });

  app.get("/clientes/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const cliente = await prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) return reply.code(404).send({ error: "Cliente no encontrado" });

    const [ventasCredito, abonos, saldoPendiente, movimientosPuntos] = await Promise.all([
      prisma.venta.findMany({
        where: { clienteId: id, metodoPago: "CREDITO" },
        orderBy: { fecha: "desc" },
        take: 100,
      }),
      prisma.abono.findMany({ where: { clienteId: id }, orderBy: { fecha: "desc" }, take: 100 }),
      calcularSaldo(id),
      prisma.movimientoPuntos.findMany({ where: { clienteId: id }, orderBy: { fecha: "desc" }, take: 50 }),
    ]);

    return { ...cliente, saldoPendiente, ventasCredito, abonos, movimientosPuntos };
  });

  app.patch("/clientes/:id", async (request, reply) => {
    if (!request.user.permisos.includes("clientes.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar clientes" });
    }
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = CrearClienteSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const cliente = await prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) return reply.code(404).send({ error: "Cliente no encontrado" });

    const { email, ...resto } = parsed.data;
    const actualizado = await prisma.cliente.update({
      where: { id },
      data: { ...resto, ...(email !== undefined ? { email: email || null } : {}) },
    });
    const saldoPendiente = await calcularSaldo(id);
    return { ...actualizado, saldoPendiente };
  });

  app.post("/clientes/:id/abonos", async (request, reply) => {
    if (!request.user.permisos.includes("creditos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar creditos" });
    }
    const { empresaId, usuarioId } = request.user;
    const { id } = request.params as { id: string };
    const cliente = await prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!cliente) return reply.code(404).send({ error: "Cliente no encontrado" });

    const parsed = RegistrarAbonoSchema.safeParse({ ...(request.body as object), clienteId: id });
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const abono = await prisma.abono.create({
      data: {
        clienteId: id,
        monto: parsed.data.monto,
        metodoPago: parsed.data.metodoPago,
        usuarioId,
      },
    });
    const saldoPendiente = await calcularSaldo(id);
    return reply.code(201).send({ ...abono, saldoPendiente });
  });
}
