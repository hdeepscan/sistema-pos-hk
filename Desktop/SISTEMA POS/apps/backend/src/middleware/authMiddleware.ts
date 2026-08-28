import type { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Obtener token del header
    const authHeader = request.headers.authorization;

    console.log(`🔐 Auth middleware - Ruta: ${request.method} ${request.url}`);
    console.log(`🔐 Auth header presente: ${authHeader ? "SÍ" : "NO"}`);
    if (authHeader) {
      console.log(`🔐 Auth header válido: ${authHeader.startsWith("Bearer ") ? "SÍ" : "NO"}`);
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn(`⚠️ Auth falló: Header inválido - ${authHeader ? "no empieza con 'Bearer '" : "vacío"}`);
      return reply.status(401).send({ error: "No autorizado" });
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || "secret";

    // Verificar token
    const decoded = jwt.verify(token, secret) as any;
    const usuarioId = decoded.sub;

    // Obtener usuario
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { empresa: true },
    });

    if (!usuario) {
      return reply.status(401).send({ error: "Usuario no encontrado" });
    }

    // Verificar que la suscripción no esté vencida
    if (usuario.empresa?.fechaVencimiento) {
      const ahora = new Date();
      if (ahora > usuario.empresa.fechaVencimiento) {
        console.warn(`⏰ Acceso denegado: suscripción vencida para empresa ${usuario.empresaId}`);
        return reply.status(403).send({
          error: "SUSCRIPCION_VENCIDA",
          mensaje: "Tu suscripción ha vencido. Debes renovarla para continuar usando el sistema.",
          fechaVencimiento: usuario.empresa.fechaVencimiento,
        });
      }
    }

    // Agregar usuario y empresaId al request
    (request as any).usuario = usuario;
    (request as any).empresaId = usuario.empresaId;
  } catch (error) {
    console.error("Error en middleware de autenticación:", error);
    return reply.status(401).send({ error: "No autorizado" });
  }
}
