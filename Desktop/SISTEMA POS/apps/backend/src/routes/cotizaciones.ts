// TODO: Completar cuando se haga migración de Prisma
import type { FastifyInstance } from "fastify";

export async function cotizacionesRoutes(app: FastifyInstance) {
  // Ruta temporal - pendiente implementación después de migración de Prisma
  app.get("/cotizaciones", async () => {
    return { error: "Cotizaciones no disponibles aún" };
  });
}
