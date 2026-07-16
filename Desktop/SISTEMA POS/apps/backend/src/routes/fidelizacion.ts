import type { FastifyInstance } from "fastify";
import { FidelizacionConfigSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";

export async function fidelizacionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/fidelizacion/config", async (request) => {
    const { empresaId } = request.user;
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { pesosPorPunto: true, valorPunto: true },
    });
    return {
      pesosPorPunto: empresa?.pesosPorPunto ? Number(empresa.pesosPorPunto) : null,
      valorPunto: empresa?.valorPunto ? Number(empresa.valorPunto) : null,
    };
  });

  app.patch("/fidelizacion/config", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const parsed = FidelizacionConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const empresa = await prisma.empresa.update({
      where: { id: empresaId },
      data: { pesosPorPunto: parsed.data.pesosPorPunto, valorPunto: parsed.data.valorPunto },
      select: { pesosPorPunto: true, valorPunto: true },
    });

    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "ACTUALIZAR_FIDELIZACION",
      entidad: "Empresa",
      entidadId: empresaId,
      detalle: `pesosPorPunto=${parsed.data.pesosPorPunto ?? "off"}, valorPunto=${parsed.data.valorPunto ?? "off"}`,
    });

    return {
      pesosPorPunto: empresa.pesosPorPunto ? Number(empresa.pesosPorPunto) : null,
      valorPunto: empresa.valorPunto ? Number(empresa.valorPunto) : null,
    };
  });
}
