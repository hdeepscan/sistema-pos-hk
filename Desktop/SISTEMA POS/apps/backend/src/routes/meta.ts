import type { FastifyInstance } from "fastify";
import type { Prisma } from '@prisma/client';
import { GuardarMetaConfigSchema } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { sincronizarGastoPauta } from "../lib/meta.js";
import { mensajeDeValidacion } from "../lib/errores.js";

function enmascarar(secreto: string) {
  return secreto.length <= 4 ? "****" : `${"*".repeat(secreto.length - 4)}${secreto.slice(-4)}`;
}

export async function metaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/meta/config", async (request) => {
    const { empresaId } = request.user;
    const config = await prisma.metaConfig.findUnique({ where: { empresaId } });
    if (!config) return { conectado: false };
    return {
      conectado: true,
      adAccountId: config.adAccountId,
      accessToken: enmascarar(config.accessToken),
      pixelId: config.pixelId,
      sucursalEcommerceId: config.sucursalEcommerceId,
      ultimaSincronizacion: config.ultimaSincronizacion,
    };
  });

  app.post("/meta/config", async (request, reply) => {
    const { empresaId } = request.user;
    const parsed = GuardarMetaConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const config = await prisma.metaConfig.upsert({
      where: { empresaId },
      update: parsed.data,
      create: { empresaId, ...parsed.data } as Prisma.MetaConfigUncheckedCreateInput,
    });
    return reply.code(201).send({ conectado: true, adAccountId: config.adAccountId });
  });

  app.post("/meta/sincronizar", async (request, reply) => {
    const { empresaId } = request.user;
    const { desde, hasta } = request.body as { desde?: string; hasta?: string };
    const config = await prisma.metaConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Configura Meta Ads primero" });

    const finRango = hasta || new Date().toISOString().slice(0, 10);
    const inicioRango = desde || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const resultado = await sincronizarGastoPauta(empresaId, inicioRango, finRango);
      return resultado;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Error sincronizando Meta Ads" });
    }
  });

  app.get("/meta/gasto-pauta", async (request) => {
    const { empresaId } = request.user;
    const { desde, hasta } = request.query as { desde?: string; hasta?: string };
    const finRango = hasta ? new Date(`${hasta}T23:59:59.999`) : new Date();
    const inicioRango = desde ? new Date(desde) : new Date(finRango.getTime() - 30 * 24 * 60 * 60 * 1000);

    const filas = await prisma.gastoPauta.findMany({
      where: { empresaId, fecha: { gte: inicioRango, lte: finRango } },
      orderBy: { fecha: "asc" },
    });

    const totalGasto = filas.reduce((acc, f) => acc + Number(f.gasto), 0);
    const totalImpresiones = filas.reduce((acc, f) => acc + f.impresiones, 0);
    const totalClics = filas.reduce((acc, f) => acc + f.clics, 0);

    const porCampania = new Map<string, number>();
    for (const f of filas) {
      porCampania.set(f.campania, (porCampania.get(f.campania) ?? 0) + Number(f.gasto));
    }

    const porDia = new Map<string, number>();
    for (const f of filas) {
      const dia = f.fecha.toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + Number(f.gasto));
    }

    return {
      totalGasto,
      totalImpresiones,
      totalClics,
      porCampania: [...porCampania.entries()].map(([campania, gasto]) => ({ campania, gasto })),
      porDia: [...porDia.entries()].map(([fecha, gasto]) => ({ fecha, gasto })),
    };
  });
}
