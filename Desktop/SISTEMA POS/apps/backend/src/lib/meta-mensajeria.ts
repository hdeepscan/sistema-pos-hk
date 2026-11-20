import crypto from "node:crypto";

// Conexión con la plataforma de Meta (Facebook Messenger, Instagram y, más adelante, WhatsApp).
// La app de Meta es de CENTRALA (Centrala Colombia SAS): su id y su clave secreta van en las
// variables META_APP_ID y META_APP_SECRET de Railway, nunca en el código.

export const GRAPH_VERSION = "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const URL_PLATAFORMA = (process.env.APP_URL || "https://centrala.up.railway.app").replace(/\/+$/, "");
export const REDIRECT_META = `${URL_PLATAFORMA}/mensajeria/meta/callback`;
export const WEBHOOK_META = `${URL_PLATAFORMA}/webhooks/meta`;

// Permisos que se le piden a la tienda al conectar su página y su Instagram.
export const PERMISOS_META = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
];

export function configMeta(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("Falta configurar META_APP_ID y META_APP_SECRET en Railway");
  }
  return { appId, appSecret };
}

// ---------- Cifrado de los tokens de Meta (AES-256-GCM) ----------

function llave(): Buffer {
  const base = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-change-me";
  return crypto.createHash("sha256").update(`centrala-mensajeria:${base}`).digest();
}

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", llave(), iv);
  const datos = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), datos].map((b) => b.toString("base64")).join(".");
}

export function descifrar(valor: string): string {
  const [iv, tag, datos] = valor.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", llave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(datos), decipher.final()]).toString("utf8");
}

// ---------- Avisos (webhooks) de Meta ----------

/** Meta firma cada aviso con la clave secreta de la app: así se sabe que de verdad viene de Meta. */
export function firmaMetaValida(cuerpo: Buffer, firma: string | undefined): boolean {
  if (!firma?.startsWith("sha256=")) return false;
  let appSecret: string;
  try {
    appSecret = configMeta().appSecret;
  } catch {
    return false;
  }
  const esperada = crypto.createHmac("sha256", appSecret).update(cuerpo).digest("hex");
  const recibida = firma.slice("sha256=".length);
  return (
    esperada.length === recibida.length && crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(recibida))
  );
}

// ---------- Llamadas a la API de Meta ----------

export class ErrorMeta extends Error {
  constructor(
    message: string,
    public codigo?: number,
    public subcodigo?: number
  ) {
    super(message);
  }
}

export async function graph<T = any>(
  ruta: string,
  opciones: { metodo?: "GET" | "POST" | "DELETE"; token?: string; params?: Record<string, string>; cuerpo?: unknown } = {}
): Promise<T> {
  const url = new URL(`${GRAPH}/${ruta.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(opciones.params ?? {})) url.searchParams.set(k, v);
  if (opciones.token) url.searchParams.set("access_token", opciones.token);
  const res = await fetch(url, {
    method: opciones.metodo ?? "GET",
    headers: opciones.cuerpo ? { "Content-Type": "application/json" } : undefined,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const e = data?.error ?? {};
    throw new ErrorMeta(e.error_user_msg || e.message || `Meta respondió ${res.status}`, e.code, e.error_subcode);
  }
  return data as T;
}
