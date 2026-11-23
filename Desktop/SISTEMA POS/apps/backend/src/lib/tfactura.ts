import { prisma } from "./prisma.js";
import { cifrar, descifrar } from "./meta-mensajeria.js";

// Cliente de la API de TFactura (Tango factura Colombia, aliado de CADENA S.A.).
// Docs: https://tfacturacol.azurewebsites.net/Help
//
// Cada empresa crea una "Aplicación" en su cuenta de TFactura y nos da 4 datos:
//   Usuario / Username, Contraseña / Password, Identificador de usuario / User identifier y
//   Clave pública / Public key.
// Con los 3 primeros se pide un token (Provisioning/GetAuthToken) y en cada llamada se envían
// Token + UserIdentifier + ApplicationPublicKey.

const BASE = process.env.TFACTURA_URL?.trim() || "https://tfacturacol.azurewebsites.net";
const TIMEOUT_MS = 45_000;

export interface CredencialesTFactura {
  usuario: string;
  password: string;
  identificador: string;
  clavePublica: string;
}

export class ErrorTFactura extends Error {
  constructor(
    message: string,
    /** true si vale la pena reintentar (caída de red, servidor ocupado). */
    public reintentable: boolean,
    public codigo?: number
  ) {
    super(message);
  }
}

export function cifrarCredenciales(c: CredencialesTFactura) {
  return {
    usuarioCifrado: cifrar(c.usuario),
    passwordCifrado: cifrar(c.password),
    identificadorCifrado: cifrar(c.identificador),
    clavePublicaCifrada: cifrar(c.clavePublica),
  };
}

export async function credencialesDe(empresaId: string): Promise<CredencialesTFactura | null> {
  const config = await prisma.facturacionConfig.findUnique({ where: { empresaId } });
  if (!config || !config.activo) return null;
  return {
    usuario: descifrar(config.usuarioCifrado),
    password: descifrar(config.passwordCifrado),
    identificador: descifrar(config.identificadorCifrado),
    clavePublica: descifrar(config.clavePublicaCifrada),
  };
}

async function postJson(ruta: string, cuerpo: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
  } catch (err) {
    throw new ErrorTFactura(
      `No se pudo conectar con TFactura (${err instanceof Error ? err.message : String(err)})`,
      true
    );
  }
  const texto = await res.text();
  if (res.status >= 500 || res.status === 429) {
    throw new ErrorTFactura(`TFactura no respondió bien (HTTP ${res.status})`, true);
  }
  if (res.status >= 300) {
    throw new ErrorTFactura(`TFactura respondió HTTP ${res.status} en ${ruta}`, false);
  }
  try {
    return JSON.parse(texto);
  } catch {
    // GetAuthToken puede devolver el token como texto entre comillas.
    return texto;
  }
}

function mensajesDeError(r: any): string {
  const errores: any[] = Array.isArray(r?.Error) ? r.Error : [];
  const textos = errores.map((e) => String(e?.Mensaje ?? "")).filter(Boolean);
  // Cuando hay una excepción, TFactura pone el detalle en Data (sin la traza).
  if (typeof r?.Data === "string" && r.Data) {
    textos.push(r.Data.replace(/#EXCEPTION#/g, "").split("Stacktrace:")[0].trim());
  }
  return textos.join(" | ") || `Error ${r?.CodigoError ?? "desconocido"} de TFactura`;
}

// El token dura un rato: se guarda en memoria 20 minutos por empresa.
const tokens = new Map<string, { token: string; hasta: number }>();
const DURACION_TOKEN_MS = 20 * 60_000;

async function pedirToken(c: CredencialesTFactura): Promise<string> {
  const r = await postJson("Provisioning/GetAuthToken", {
    UserName: c.usuario,
    Password: c.password,
    UserSecret: c.identificador,
  });
  if (typeof r === "string") {
    const token = r.replace(/"/g, "").trim();
    if (token) return token;
  }
  if (r && typeof r === "object" && Number(r.CodigoError ?? 0) === 0) {
    const data = r.Data;
    const token = typeof data === "string" ? data : data?.Token ?? data?.token;
    if (token) return String(token);
  }
  throw new ErrorTFactura(`TFactura no aceptó el usuario, la contraseña o el identificador: ${mensajesDeError(r)}`, false);
}

async function token(clave: string, c: CredencialesTFactura, renovar = false): Promise<string> {
  const guardado = tokens.get(clave);
  if (!renovar && guardado && guardado.hasta > Date.now()) return guardado.token;
  const nuevo = await pedirToken(c);
  tokens.set(clave, { token: nuevo, hasta: Date.now() + DURACION_TOKEN_MS });
  return nuevo;
}

/** Llama a un método de Services/Facturacion. Si el token venció, lo renueva una vez. */
export async function llamarTFactura<T = any>(
  empresaId: string,
  c: CredencialesTFactura,
  metodo: string,
  datos: Record<string, unknown> = {}
): Promise<T> {
  for (let intento = 0; intento < 2; intento++) {
    const t = await token(empresaId, c, intento > 0);
    const r = await postJson(`Services/Facturacion/${metodo}`, {
      ...datos,
      UserIdentifier: c.identificador,
      ApplicationPublicKey: c.clavePublica,
      Token: t,
    });
    const codigo = Number(r?.CodigoError ?? 0);
    if (codigo === 0) return r?.Data as T;
    const mensaje = mensajesDeError(r);
    // 1010 = validación del usuario / token: se pide un token nuevo y se reintenta una vez.
    if (intento === 0 && (codigo === 1010 || /token|ValidateUser|autentic/i.test(mensaje))) continue;
    throw new ErrorTFactura(mensaje, false, codigo);
  }
  throw new ErrorTFactura("TFactura rechazó las credenciales", false);
}

export function olvidarToken(empresaId: string) {
  tokens.delete(empresaId);
}

/** Prueba la conexión: pide un token y la lista de impuestos (alícuotas). */
export async function probarConexion(empresaId: string, c: CredencialesTFactura) {
  olvidarToken(empresaId);
  const alicuotas = await llamarTFactura<any>(empresaId, c, "ListarAlicuotas");
  return { alicuotas: Array.isArray(alicuotas) ? alicuotas : [] };
}

// ---------- Alícuotas de IVA ----------

export interface Alicuota {
  AlicuotaCodigo: number;
  AlicuotaPorcentaje: number;
  ImpuestoID?: number;
  Nombre?: string;
}

const alicuotasCache = new Map<string, { lista: Alicuota[]; hasta: number }>();

export async function alicuotasDe(empresaId: string, c: CredencialesTFactura): Promise<Alicuota[]> {
  const guardado = alicuotasCache.get(empresaId);
  if (guardado && guardado.hasta > Date.now()) return guardado.lista;
  const data = await llamarTFactura<any>(empresaId, c, "ListarAlicuotas");
  const lista: Alicuota[] = (Array.isArray(data) ? data : [])
    .map((a: any) => ({
      AlicuotaCodigo: Number(a.AlicuotaCodigo ?? a.Codigo ?? a.AlicuotaID),
      AlicuotaPorcentaje: Number(a.AlicuotaPorcentaje ?? a.Porcentaje),
      ImpuestoID: a.ImpuestoID != null ? Number(a.ImpuestoID) : undefined,
      Nombre: a.AlicuotaNombre ?? a.Nombre,
    }))
    .filter((a) => Number.isFinite(a.AlicuotaCodigo) && Number.isFinite(a.AlicuotaPorcentaje));
  alicuotasCache.set(empresaId, { lista, hasta: Date.now() + 6 * 60 * 60_000 });
  return lista;
}

/** La alícuota de IVA de TFactura con ese porcentaje (19, 5 o 0). Prefiere la del impuesto IVA. */
export function alicuotaPara(lista: Alicuota[], porcentaje: number): Alicuota | undefined {
  const mismas = lista.filter((a) => Math.abs(a.AlicuotaPorcentaje - porcentaje) < 0.001);
  return mismas.find((a) => /iva/i.test(a.Nombre ?? "")) ?? mismas[0];
}

// ---------- Resultado de una factura ----------

export interface ResultadoMovimiento {
  movimientoId: number | null;
  numero: string | null;
  cufe: string | null;
  urlPdf: string | null;
  total: number | null;
}

export function leerResultado(data: any): ResultadoMovimiento {
  const numero =
    data?.Numero != null
      ? [data?.Letra, data?.Numero].filter((x) => x != null && x !== "").join("")
      : data?.NroFactura != null
        ? String(data.NroFactura)
        : null;
  return {
    movimientoId: data?.MovimientoId != null && Number(data.MovimientoId) > 0 ? Number(data.MovimientoId) : null,
    numero: numero || null,
    cufe: data?.CAE || data?.CUFE || data?.Cufe || null,
    urlPdf: data?.UrlPDF || data?.UrlPdf || null,
    total: data?.Total != null ? Number(data.Total) : null,
  };
}
