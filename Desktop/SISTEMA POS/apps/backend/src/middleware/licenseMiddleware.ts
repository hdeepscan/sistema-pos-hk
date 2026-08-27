import { Request, Response, NextFunction } from "fastify";
import { validarLicencia } from "../services/licenseService";

/**
 * Middleware para validar que la empresa tenga licencia activa
 * Se debe usar después del middleware de autenticación
 */
export async function validarLicensiaMiddleware(
  request: Request,
  reply: Response,
  done: NextFunction
) {
  try {
    // El usuario debe estar autenticado
    const usuario = (request as any).usuario;
    const empresaId = (request as any).empresaId;

    if (!usuario || !empresaId) {
      return reply.status(401).send({
        error: "No autenticado",
      });
    }

    // Validar licencia
    const validacion = await validarLicencia(empresaId);

    if (!validacion.valida) {
      // Crear respuesta apropiada según el motivo
      let statusCode = 403;
      let mensaje = validacion.razon || "Acceso denegado";

      if (validacion.razon === "Licencia vencida") {
        statusCode = 402; // Payment Required
        mensaje = "Su licencia ha vencido. Por favor, renueve su suscripción.";
      } else if (validacion.razon === "Licencia suspendida") {
        statusCode = 402;
        mensaje = "Su licencia ha sido suspendida. Contacte al soporte.";
      } else if (validacion.razon === "Licencia cancelada") {
        statusCode = 403;
        mensaje = "Su licencia ha sido cancelada.";
      }

      return reply.status(statusCode).send({
        error: mensaje,
        razon: validacion.razon,
      });
    }

    // Licencia válida, pasar al siguiente middleware
    (request as any).licencia = validacion.licencia;
    (request as any).suscripcion = validacion.suscripcion;

    done();
  } catch (error) {
    console.error("Error en middleware de licencia:", error);
    return reply.status(500).send({
      error: "Error validando licencia",
    });
  }
}

/**
 * Middleware opcional: solo alerta si licencia está próxima a vencer
 */
export async function verificarVencimientoProximo(
  request: Request,
  reply: Response,
  next: NextFunction
) {
  try {
    const empresaId = (request as any).empresaId;
    const validacion = await validarLicencia(empresaId);

    if (validacion.licencia) {
      const ahora = new Date();
      const diasRestantes = Math.ceil(
        (validacion.licencia.fechaVencimiento.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diasRestantes > 0 && diasRestantes <= 7) {
        // Agregar header de advertencia
        reply.header("X-License-Warning", `Tu licencia vence en ${diasRestantes} días`);
      }
    }

    next();
  } catch (error) {
    console.error("Error verificando vencimiento:", error);
    next();
  }
}
