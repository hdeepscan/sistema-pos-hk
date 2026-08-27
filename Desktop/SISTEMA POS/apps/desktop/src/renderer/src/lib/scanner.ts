/**
 * Módulo de scanning de códigos de barras desde cámara del dispositivo.
 *
 * Utiliza BarcodeDetector API nativa (Chrome/Android).
 * Para Safari/Firefox, fallback a búsqueda manual.
 *
 * BarcodeDetector es superior a quagga:
 * - Nativa del navegador (sin dependencias)
 * - Ultra-rápida (usa aceleración de hardware)
 * - Mejor detección
 * - Menor consumo de batería
 */

export interface ScannerConfig {
  videoElement?: HTMLVideoElement;
  canvasElement?: HTMLCanvasElement;
  onScan: (codigo: string) => void;
  onError?: (error: string) => void;
}

interface BarcodeDetector {
  detect(image: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface DetectedBarcode {
  format: string;
  rawValue: string;
  boundingBox?: DOMRectReadOnly;
  cornerPoints?: Array<{ x: number; y: number }>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (formats?: string[]): BarcodeDetector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

let scanner: ScannerConfig | null = null;
let streamActivo: MediaStream | null = null;
let usandoBarcodeDetector = false;
let frameId: number | null = null;

// Formatos soportados por BarcodeDetector
const FORMATOS_BARCODE_DETECTOR = [
  "ean_13",
  "ean_8",
  "upca",
  "upce",
  "code_128",
  "code_39",
];

/**
 * Verificar si el navegador soporta BarcodeDetector.
 */
export function soportaBarcodeDetector(): boolean {
  return "BarcodeDetector" in window;
}

/**
 * Solicitar permiso de cámara al usuario.
 */
export async function solicitarPermisoCamara(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    // No cerrar el stream aún, lo usaremos en inicializarScanner
    return true;
  } catch (err) {
    console.error("Error solicitando acceso a cámara:", err);
    return false;
  }
}

/**
 * Inicializar el scanner con la cámara del dispositivo.
 * Usa BarcodeDetector nativo (Chrome/Android).
 */
export async function inicializarScanner(
  config: ScannerConfig
): Promise<{ disponible: boolean; metodo: string; error?: string }> {
  scanner = config;

  try {
    // Verificar si el navegador soporta BarcodeDetector
    if (!soportaBarcodeDetector() || !config.videoElement) {
      return {
        disponible: false,
        metodo: "ninguno",
        error: "BarcodeDetector no disponible en este navegador. Usa búsqueda manual.",
      };
    }

    // Obtener stream de cámara
    streamActivo = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    config.videoElement.srcObject = streamActivo;
    config.videoElement.play().catch(() => {
      throw new Error("No se pudo reproducir video");
    });

    usandoBarcodeDetector = true;
    iniciarEscaneoConBarcodeDetector();

    return {
      disponible: true,
      metodo: "BarcodeDetector (nativa)",
    };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    config.onError?.(mensaje);
    return {
      disponible: false,
      metodo: "ninguno",
      error: mensaje,
    };
  }
}

/**
 * Escanear continuamente con BarcodeDetector.
 */
function iniciarEscaneoConBarcodeDetector(): void {
  const video = scanner?.videoElement;
  if (!video || !soportaBarcodeDetector()) return;

  const detector = new window.BarcodeDetector!(FORMATOS_BARCODE_DETECTOR);

  const escanear = async () => {
    try {
      if (!video || video.paused || !usandoBarcodeDetector) return;

      const codigos = await detector.detect(video);

      if (codigos.length > 0) {
        const primerCodigo = codigos[0];
        console.log(
          "Código detectado:",
          primerCodigo.format,
          primerCodigo.rawValue
        );
        scanner?.onScan(primerCodigo.rawValue);
        // Continuar escaneando (no parar después del primer código)
      }

      // Seguir escaneando
      frameId = requestAnimationFrame(escanear);
    } catch (err) {
      console.error("Error en escaneo BarcodeDetector:", err);
      frameId = requestAnimationFrame(escanear);
    }
  };

  escanear();
}

/**
 * Detener el scanner y liberar recursos.
 */
export function detenerScanner(): void {
  if (usandoBarcodeDetector) {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (streamActivo) {
      streamActivo.getTracks().forEach((track) => track.stop());
      streamActivo = null;
    }
    if (scanner?.videoElement) {
      scanner.videoElement.srcObject = null;
    }
    usandoBarcodeDetector = false;
  }

  scanner = null;
}

/**
 * Reanudar escaneo después de pausa.
 */
export function reanudarScanner(): void {
  if (usandoBarcodeDetector && scanner?.videoElement) {
    scanner.videoElement.play().catch(() => {
      console.error("No se pudo reanudar video");
    });
    // Reiniciar el escaneo
    iniciarEscaneoConBarcodeDetector();
  }
}

/**
 * Pausar escaneo sin liberar recursos.
 */
export function pausarScanner(): void {
  if (usandoBarcodeDetector) {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (scanner?.videoElement) {
      scanner.videoElement.pause();
    }
  }
}

/**
 * Obtener estado actual del scanner.
 */
export function obtenerEstadoScanner(): {
  activo: boolean;
  metodo: string | null;
  tienePermiso: boolean;
} {
  return {
    activo: usandoBarcodeDetector,
    metodo: usandoBarcodeDetector ? "BarcodeDetector" : null,
    tienePermiso: streamActivo !== null,
  };
}
