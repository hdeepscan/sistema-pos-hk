import type { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { PERMISOS_POR_ROL } from "@sistema-pos/shared";

const prisma = new PrismaClient();

// Rutas que NO se bloquean aunque la licencia esté vencida
const RUTAS_PERMITIDAS_VENCIDAS = [
  "/auth/", // Login, logout, etc
  "/pagos/", // Procesamiento de pagos
  "/checkout/", // Checkout
  "/health", // Health check
];

// Métodos de lectura (permitidos incluso con licencia vencida)
const METODOS_LECTURA = ["GET", "HEAD", "OPTIONS"];

export function permisosEfectivos(usuario: { rol: string; permisos: string[] }): string[] {
  const rol = usuario.rol as keyof typeof PERMISOS_POR_ROL;
  if (["ADMIN", "GERENTE", "SUPERVISOR"].includes(usuario.rol)) return PERMISOS_POR_ROL[rol];
  return usuario.permisos.length > 0 ? usuario.permisos : PERMISOS_POR_ROL[rol];
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "No autorizado" });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: request.user.usuarioId },
    include: { empresa: true },
  });

  if (!usuario || !usuario.activo) {
    return reply.status(401).send({ error: "Usuario no encontrado" });
  }

  (request as any).usuario = usuario;
  (request as any).empresaId = usuario.empresaId;

  if (usuario.empresa?.fechaVencimiento) {
    const licenciaVencida = new Date() > usuario.empresa.fechaVencimiento;

    if (licenciaVencida) {
      if (METODOS_LECTURA.includes(request.method)) return;

      const rutaPermitida = RUTAS_PERMITIDAS_VENCIDAS.some((ruta) => request.url.startsWith(ruta));
      if (rutaPermitida) return;

      return reply.status(402).send({
        error: "SUSCRIPCION_VENCIDA",
        mensaje: "Tu suscripción ha vencido. No puedes realizar operaciones. Debes renovar tu licencia.",
        fechaVencimiento: usuario.empresa.fechaVencimiento,
        urlRenovar: "/checkout",
      });
    }
  }
}
