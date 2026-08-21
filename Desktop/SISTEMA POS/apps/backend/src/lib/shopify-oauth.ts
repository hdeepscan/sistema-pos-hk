/**
 * OAuth 2.0 Authorization Code Flow para Shopify
 * Ref: https://shopify.dev/docs/apps/auth-admin/oauth
 */

import crypto from "crypto";
import { prisma } from "./prisma.js";

const SHOPIFY_SCOPES = [
  "write_products",
  "read_products",
  "write_inventory",
  "read_inventory",
  "write_orders",
  "read_orders",
  "write_fulfillments",
  "read_fulfillments",
];

export interface ShopifyOAuthParams {
  shop: string; // ej: "20hssn-ef.myshopify.com"
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  empresaId: string;
}

/**
 * Generar URL de autorización de Shopify
 * El usuario será redirigido a esta URL para autorizar la app
 */
export function generarUrlAutorizacion(params: ShopifyOAuthParams): {
  authorizationUrl: string;
  state: string;
} {
  const state = crypto.randomBytes(16).toString("hex");
  const scope = SHOPIFY_SCOPES.join(",");

  const authorizationUrl = new URL(
    `https://${params.shop}/admin/oauth/authorize`
  );
  authorizationUrl.searchParams.append("client_id", params.clientId);
  authorizationUrl.searchParams.append("scope", scope);
  authorizationUrl.searchParams.append("redirect_uri", params.redirectUri);
  authorizationUrl.searchParams.append("state", state);

  return {
    authorizationUrl: authorizationUrl.toString(),
    state,
  };
}

/**
 * Validar el callback de Shopify
 * Verifica HMAC y estado CSRF
 */
export function validarCallbackShopify(
  query: Record<string, string | string[] | undefined>,
  clientSecret: string,
  expectedState?: string
): {
  valido: boolean;
  error?: string;
  codigo?: string;
  tienda?: string;
} {
  // Extraer parámetros
  const code = Array.isArray(query.code) ? query.code[0] : query.code;
  const hmac = Array.isArray(query.hmac) ? query.hmac[0] : query.hmac;
  const shop = Array.isArray(query.shop) ? query.shop[0] : query.shop;
  const state = Array.isArray(query.state) ? query.state[0] : query.state;

  if (!code || !hmac || !shop) {
    return {
      valido: false,
      error: "Faltan parámetros requeridos (code, hmac, shop)",
    };
  }

  // Validar estado CSRF
  if (expectedState && state !== expectedState) {
    return {
      valido: false,
      error: "Estado CSRF inválido (posible ataque CSRF)",
    };
  }

  // Validar HMAC
  const mensaje = Object.entries(query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const val = Array.isArray(value) ? value[0] : value;
      return `${key}=${val}`;
    })
    .join("&");

  const hmacCalculado = crypto
    .createHmac("sha256", clientSecret)
    .update(mensaje)
    .digest("hex");

  if (hmac !== hmacCalculado) {
    return {
      valido: false,
      error: "HMAC inválido (posible solicitud falsificada)",
    };
  }

  return {
    valido: true,
    codigo: code,
    tienda: shop,
  };
}

/**
 * Intercambiar código de autorización por access token
 */
export async function intercambiarCodigoAcessToken(params: {
  shop: string;
  code: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  accessToken: string;
  scopes: string;
}> {
  const tokenUrl = `https://${params.shop}/admin/oauth/access_token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Error intercambiando código: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    scopes: data.scope,
  };
}

// Almacenamiento temporal en memoria (en producción, usar Redis)
const oauthStates = new Map<
  string,
  { empresaId: string; shop: string; expiradoEn: number }
>();

/**
 * Guardar estado temporal de OAuth (para validar después)
 * La razón: necesitamos verificar el estado en el callback
 * El estado incluye empresaId codificado para poder recuperarlo después
 */
export function guardarEstadoOAuth(
  empresaId: string,
  state: string,
  shop: string
): void {
  // Guardar en memoria con expiración de 10 minutos
  oauthStates.set(state, {
    empresaId,
    shop,
    expiradoEn: Date.now() + 10 * 60 * 1000,
  });

  // Limpiar estados expirados ocasionalmente
  if (oauthStates.size > 1000) {
    const ahora = Date.now();
    for (const [key, value] of oauthStates.entries()) {
      if (value.expiradoEn < ahora) {
        oauthStates.delete(key);
      }
    }
  }
}

/**
 * Validar y obtener estado OAuth guardado
 */
export function validarEstadoOAuth(
  state: string
): { valido: boolean; empresaId?: string; shop?: string; error?: string } {
  const record = oauthStates.get(state);

  if (!record) {
    return { valido: false, error: "Estado OAuth no encontrado" };
  }

  if (record.expiradoEn < Date.now()) {
    oauthStates.delete(state);
    return { valido: false, error: "Estado OAuth expirado (10 minutos)" };
  }

  // Eliminar el registro para que no se reutilice
  oauthStates.delete(state);

  return {
    valido: true,
    empresaId: record.empresaId,
    shop: record.shop,
  };
}
