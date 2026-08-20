/**
 * Verificación de webhooks de Shopify usando HMAC
 * Garantiza que el webhook viene de Shopify y no ha sido modificado
 */

import crypto from "crypto";

/**
 * Verificar que el webhook es auténtico de Shopify
 *
 * Shopify envía un header X-Shopify-Hmac-SHA256 con una firma HMAC-SHA256
 * Nosotros verificamos que el body + secret producen la misma firma
 */
export function verificarWebhookShopify(
  body: Buffer | string,
  hmacHeader: string | undefined,
  clientSecret: string
): boolean {
  if (!hmacHeader) {
    console.warn("[Webhook Verify] Falta header X-Shopify-Hmac-SHA256");
    return false;
  }

  // El body debe ser el raw body (sin procesar)
  // Fastify nos lo proporciona como string en request.rawBody
  const bodyString = typeof body === "string" ? body : body.toString("utf-8");

  // Generar HMAC con el mismo método que Shopify
  const hmac = crypto
    .createHmac("sha256", clientSecret)
    .update(bodyString, "utf-8")
    .digest("base64");

  // Comparar de forma segura (timing-safe)
  const match = crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hmacHeader));

  if (!match) {
    console.error(`[Webhook Verify] ❌ HMAC no coincide. Esperado: ${hmacHeader}, Obtenido: ${hmac}`);
    return false;
  }

  console.log(`[Webhook Verify] ✅ HMAC verificado exitosamente`);
  return true;
}

/**
 * Middleware Fastify para verificar webhooks
 * Uso: app.addHook("preHandler", verificarWebhookMiddleware(clientSecret))
 */
export function crearVerificadorWebhook(clientSecret: string) {
  return async (request: any, reply: any) => {
    // Solo verificar si es un webhook
    if (!request.url.includes("/shopify/webhooks")) {
      return;
    }

    const hmacHeader = request.headers["x-shopify-hmac-sha256"];
    const bodyBuffer = request.rawBody || Buffer.from(JSON.stringify(request.body));

    if (!verificarWebhookShopify(bodyBuffer, hmacHeader, clientSecret)) {
      return reply.code(401).send({ error: "Webhook no verificado" });
    }
  };
}
