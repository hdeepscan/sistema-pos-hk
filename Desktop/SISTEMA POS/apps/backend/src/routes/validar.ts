import type { FastifyInstance } from "fastify";
import { validarEmailNoExiste } from "../services/emailService.js";

export async function rutasValidar(fastify: FastifyInstance) {
  /**
   * GET /api/validar/email?email=user@example.com
   * Validar si un correo ya existe en la base de datos
   */
  fastify.get("/validar/email", async (request, reply) => {
    try {
      const { email } = request.query as { email?: string };

      if (!email) {
        return reply.status(400).send({
          error: "Email requerido",
          disponible: false,
        });
      }

      const disponible = await validarEmailNoExiste(email);

      return reply.send({
        email,
        disponible, // true = puede registrarse, false = ya existe
        mensaje: disponible
          ? "Este correo está disponible"
          : "Este correo ya está registrado",
      });
    } catch (error) {
      console.error("Error validando email:", error);
      return reply.status(500).send({
        error: "Error validando email",
      });
    }
  });
}
