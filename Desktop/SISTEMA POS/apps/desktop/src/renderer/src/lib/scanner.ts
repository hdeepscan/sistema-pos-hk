/**
 * Lector de códigos de barras con la cámara del celular.
 *
 * - Chrome / Android: usa el BarcodeDetector nativo del navegador (rápido, por hardware).
 * - iPhone (Safari), Firefox y PWA instalada en iOS: usa el mismo API pero implementado con
 *   ZXing en WebAssembly (paquete `barcode-detector`). El .wasm va empaquetado con la app
 *   (no depende de ningún CDN), así que también funciona con la PWA.
 */
import { BarcodeDetector as BarcodeDetectorZXing, prepareZXingModule } from "barcode-detector/ponyfill";
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

export interface ScannerConfig {
  videoElement: HTMLVideoElement;
  onScan: (codigo: string) => void;
  onError?: (error: string) => void;
}

interface Detector {
  detect(image: ImageBitmapSource): Promise<Array<{ format: string; rawValue: string }>>;
}

// Formatos de producto (retail) + QR por si algún producto lo usa.
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code"];

// Cada cuánto se analiza un cuadro del video. ~6-7 por segundo es suficiente y no calienta el celular.
const INTERVALO_MS = 150;
// Si la cámara sigue viendo el mismo código, no se vuelve a reportar hasta que pase este tiempo.
const ESPERA_MISMO_CODIGO_MS = 2000;

let config: ScannerConfig | null = null;
let stream: MediaStream | null = null;
let detector: Detector | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let activo = false;
let metodoActual: string | null = null;
let ultimoCodigo = "";
let ultimoCodigoEn = 0;

let zxingPreparado = false;
function prepararZXing() {
  if (zxingPreparado) return;
  zxingPreparado = true;
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? zxingWasmUrl : prefix + path),
    },
  });
}

async function crearDetector(): Promise<{ detector: Detector; metodo: string }> {
  const Nativo = (window as any).BarcodeDetector;
  if (Nativo) {
    try {
      const soportados: string[] = await Nativo.getSupportedFormats();
      const formatos = FORMATOS.filter((f) => soportados.includes(f));
      if (formatos.length > 0) {
        return { detector: new Nativo({ formats: formatos }), metodo: "Lector nativo" };
      }
    } catch {
      /* si falla el nativo, se usa ZXing */
    }
  }
  prepararZXing();
  return {
    detector: new BarcodeDetectorZXing({ formats: FORMATOS as any }) as unknown as Detector,
    metodo: "Lector ZXing",
  };
}

export function camaraDisponible(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function mensajeDeError(err: unknown): { tipo: "sin-permiso" | "error"; mensaje: string } {
  const nombre = (err as any)?.name as string | undefined;
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return { tipo: "sin-permiso", mensaje: "Permiso de cámara denegado" };
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return { tipo: "error", mensaje: "No se encontró una cámara en este dispositivo." };
  }
  if (nombre === "NotReadableError") {
    return { tipo: "error", mensaje: "La cámara está siendo usada por otra app. Ciérrala e intenta de nuevo." };
  }
  return { tipo: "error", mensaje: err instanceof Error ? err.message : "No se pudo iniciar la cámara." };
}

/**
 * Abre la cámara trasera, la muestra en el <video> y empieza a leer códigos.
 */
export async function inicializarScanner(
  cfg: ScannerConfig
): Promise<{ disponible: boolean; metodo: string; tipoError?: "sin-permiso" | "error"; error?: string }> {
  detenerScanner();
  config = cfg;

  if (!camaraDisponible()) {
    return {
      disponible: false,
      metodo: "ninguno",
      tipoError: "error",
      error: "Este navegador no permite usar la cámara. Abre CENTRALA con https en Safari o Chrome.",
    };
  }

  try {
    const creado = await crearDetector();
    detector = creado.detector;
    metodoActual = creado.metodo;

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    // Si mientras se pedía permiso se cerró el escáner, soltar la cámara.
    if (config !== cfg) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      return { disponible: false, metodo: "ninguno" };
    }

    const video = cfg.videoElement;
    video.setAttribute("playsinline", "true"); // iOS: sin esto abre el video en pantalla completa
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    activo = true;
    programarLectura(0);
    return { disponible: true, metodo: metodoActual };
  } catch (err) {
    const { tipo, mensaje } = mensajeDeError(err);
    detenerScanner();
    cfg.onError?.(mensaje);
    return { disponible: false, metodo: "ninguno", tipoError: tipo, error: mensaje };
  }
}

function programarLectura(ms = INTERVALO_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(leerCuadro, ms);
}

async function leerCuadro() {
  timer = null;
  const video = config?.videoElement;
  if (!activo || !detector || !video) return;

  if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused) {
    try {
      const codigos = await detector.detect(video);
      const codigo = codigos.find((c) => c.rawValue)?.rawValue?.trim();
      if (codigo && activo) {
        const ahora = Date.now();
        if (codigo !== ultimoCodigo || ahora - ultimoCodigoEn > ESPERA_MISMO_CODIGO_MS) {
          ultimoCodigo = codigo;
          ultimoCodigoEn = ahora;
          try {
            navigator.vibrate?.(60);
          } catch {
            /* iOS no vibra desde la web */
          }
          config?.onScan(codigo);
        } else {
          ultimoCodigoEn = ahora; // sigue apuntando al mismo: no repetir
        }
      }
    } catch (err) {
      console.warn("[scanner] Error leyendo cuadro:", err);
    }
  }

  if (activo) programarLectura();
}

/** Apaga la cámara y libera todo. */
export function detenerScanner(): void {
  activo = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (config?.videoElement) {
    config.videoElement.srcObject = null;
  }
  config = null;
  detector = null;
  ultimoCodigo = "";
  ultimoCodigoEn = 0;
}

/** Pausa la lectura (por ejemplo, cuando la app pasa a segundo plano). */
export function pausarScanner(): void {
  activo = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  config?.videoElement.pause();
}

/** Reanuda la lectura después de pausar. */
export function reanudarScanner(): void {
  if (!config || !stream || !detector) return;
  config.videoElement.play().catch(() => {});
  activo = true;
  programarLectura(0);
}

export function obtenerEstadoScanner(): { activo: boolean; metodo: string | null; tienePermiso: boolean } {
  return { activo, metodo: activo ? metodoActual : null, tienePermiso: stream !== null };
}
