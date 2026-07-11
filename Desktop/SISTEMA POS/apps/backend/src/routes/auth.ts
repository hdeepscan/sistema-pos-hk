import type { FastifyInstance } from "fastify";
import { LoginSchema, RegistroEmpresaSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/registro-empresa", async (request, reply) => {
    const parsed = RegistroEmpresaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { empresaNombre, adminNombre, adminEmail, adminPassword } = parsed.data;

    const existente = await prisma.usuario.findUnique({ where: { email: adminEmail } });
    if (existente) {
      return reply.code(409).send({ error: "Ya existe un usuario con ese email" });
    }

    const passwordHash = await hashPassword(adminPassword);

    const { empresa, usuario } = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nombre: empresaNombre } });
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nombre: adminNombre,
          email: adminEmail,
          passwordHash,
          rol: "ADMIN",
        },
      });
      // Sucursal principal por defecto para poder empezar a operar de inmediato.
      await tx.sucursal.create({
        data: { empresaId: empresa.id, nombre: "Principal", tipo: "FISICA" },
      });
      return { empresa, usuario };
    });

    const token = app.jwt.sign({ usuarioId: usuario.id, empresaId: empresa.id, rol: usuario.rol });
    return reply.code(201).send({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      empresa: { id: empresa.id, nombre: empresa.nombre },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const usuario = await prisma.usuario.findUnique({ where: { email }, include: { empresa: true } });
    if (!usuario || !usuario.activo || !usuario.empresa.activo) {
      return reply.code(401).send({ error: "Credenciales invalidas" });
    }
    const ok = await verifyPassword(password, usuario.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "Credenciales invalidas" });
    }

    const token = app.jwt.sign({ usuarioId: usuario.id, empresaId: usuario.empresaId, rol: usuario.rol });
    const sucursales = await prisma.sucursal.findMany({
      where: { empresaId: usuario.empresaId, activo: true },
      orderBy: { nombre: "asc" },
    });

    return reply.send({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      empresa: { id: usuario.empresa.id, nombre: usuario.empresa.nombre },
      sucursales,
    });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    return { user: request.user };
  });

  // Usado por el desktop para restaurar la sesion al reabrir la app con un token guardado.
  app.get("/auth/sesion", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { usuarioId, empresaId } = request.user;
    const usuario = await prisma.usuario.findFirst({ where: { id: usuarioId, empresaId } });
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!usuario || !empresa) return reply.code(401).send({ error: "Sesion invalida" });

    const sucursales = await prisma.sucursal.findMany({
      where: { empresaId, activo: true },
      orderBy: { nombre: "asc" },
    });

    return {
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      empresa: { id: empresa.id, nombre: empresa.nombre },
      sucursales,
    };
  });
}
