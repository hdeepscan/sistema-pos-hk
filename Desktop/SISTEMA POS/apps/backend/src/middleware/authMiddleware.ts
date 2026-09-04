import type { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

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

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Obtener token del header
    const authHeader = request.headers.authorization;

    console.log(`🔐 Auth middleware - Ruta: ${request.method} ${request.url}`);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn(`⚠️ Auth falló: Header inválido`);
      return reply.status(401).send({ error: "No autorizado" });
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || "secret";

    // Verificar token
    const decoded = jwt.verify(token, secret) as any;
    const usuarioId = decoded.sub;

    // Obtener usuario con empresa
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { empresa: true },
    });

    if (!usuario) {
      return reply.status(401).send({ error: "Usuario no encontrado" });
    }

    // Agregar usuario y empresaId al request
    (request as any).usuario = usuario;
    (request as any).empresaId = usuario.empresaId;

    // ============ BLOQUEO DE LICENCIA VENCIDA ============
    if (usuario.empresa?.fechaVencimiento) {
      const ahora = new Date();
      const licenciaVencida = ahora > usuario.empresa.fechaVencimiento;

      if (licenciaVencida) {
        console.warn(`⏰ LICENCIA VENCIDA - Empresa: ${usuario.empresaId}`);

        // ✅ Permitir lectura (GET)
        if (METODOS_LECTURA.includes(request.method)) {
          console.log(`✅ Permitido: ${request.method} ${request.url} (lectura)`);
          return; // Continúa
        }

        // ✅ Permitir rutas específicas (auth, pagos, checkout)
        const rutaPermitida = RUTAS_PERMITIDAS_VENCIDAS.some((ruta) =>
          request.url.startsWith(ruta)
        );

        if (rutaPermitida) {
          console.log(`✅ Permitido: ${request.method} ${request.url} (ruta segura)`);
          return; // Continúa
        }

        // ❌ BLOQUEAR: Operaciones de escritura (POST, PUT, PATCH, DELETE)
        console.warn(`❌ BLOQUEADO: ${request.method} ${request.url} - Licencia vencida`);
        return reply.status(402).send({
          error: "SUSCRIPCION_VENCIDA",
          mensaje: "Tu suscripción ha vencido. No puedes realizar operaciones. Debes renovar tu licencia.",
          fechaVencimiento: usuario.empresa.fechaVencimiento,
          urlRenovar: "/checkout",
        });
      }
    }

    console.log(`✅ Acceso autorizado: ${request.method} ${request.url}`);
  } catch (error) {
    console.error("❌ Error en middleware de autenticación:", error);
    return reply.status(401).send({ error: "No autorizado" });
  }
}
