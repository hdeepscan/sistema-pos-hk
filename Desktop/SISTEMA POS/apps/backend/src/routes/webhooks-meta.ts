import type { FastifyInstance } from "fastify";
import { firmaMetaValida } from "../lib/meta-mensajeria.js";
import { procesarAvisoMeta } from "../lib/mensajeria.js";

// Dirección que Meta llama cuando alguien escribe a una página o a un Instagram conectado.
// URL para configurar en la app de Meta: https://centrala.up.railway.app/webhooks/meta
export async function webhooksMetaRoutes(app: FastifyInstance) {
  // La firma de Meta se calcula sobre el cuerpo exacto: aquí se recibe sin convertir.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, cuerpo, done) => done(null, cuerpo));

  // Verificación: al configurar el webhook, Meta pide repetir el "challenge" si el token coincide.
  app.get("/webhooks/meta", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const esperado = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
    if (q["hub.mode"] === "subscribe" && esperado && q["hub.verify_token"] === esperado) {
      return reply.type("text/plain").send(q["hub.challenge"] ?? "");
    }
    return reply.code(403).send({ error: "Token de verificación inválido" });
  });

  app.post("/webhooks/meta", async (request, reply) => {
    const cuerpo = request.body as Buffer;
    if (!Buffer.isBuffer(cuerpo) || !firmaMetaValida(cuerpo, request.headers["x-hub-signature-256"] as string | undefined)) {
      return reply.code(401).send({ error: "Firma inválida" });
    }
    // Meta espera respuesta rápida: se responde de una vez y se procesa después.
    reply.code(200).send("EVENT_RECEIVED");
    let datos: unknown;
    try {
      datos = JSON.parse(cuerpo.toString("utf8"));
    } catch {
      return;
    }
    void procesarAvisoMeta(datos).catch((err) =>
      console.error("[webhooks-meta] Error procesando aviso:", err instanceof Error ? err.message : err)
    );
  });
}
