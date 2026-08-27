/**
 * Módulo de scanning de códigos de barras desde cámara del dispositivo.
 * Estrategia en 2 capas:
 * 1. BarcodeDetector API (nativa en Chrome/Android)
 * 2. quagga2 (fallback para Safari/Firefox)
 */

import Quagga from "quagga";

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
let usandoQuagga = false;
let usandoBarcodeDetector = false;

// Formatos soportados
const FORMATOS_BARCODE_DETECTOR = [
  "ean_13",
  "ean_8",
  "upca",
  "upce",
  "code_128",
  "code_39",
];

const FORMATOS_QUAGGA = [
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
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
 * Usa BarcodeDetector si está disponible, fallback a quagga2.
 */
export async function inicializarScanner(
  config: ScannerConfig
): Promise<{ disponible: boolean; metodo: string; error?: string }> {
  scanner = config;

  try {
    // Intenta usar BarcodeDetector primero (Chrome/Android)
    if (soportaBarcodeDetector() && config.videoElement) {
      try {
        const formatosSoportados =
          await window.BarcodeDetector!.getSupportedFormats();
        console.log("BarcodeDetector soporta:", formatosSoportados);

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
        console.warn("BarcodeDetector no disponible, usando fallback quagga2");
        usandoBarcodeDetector = false;
      }
    }

    // Fallback a quagga2
    if (config.videoElement && config.canvasElement) {
      return await inicializarQuagga();
    }

    throw new Error("No hay elementos video/canvas para inicializar scanner");
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : "Error desconocido";
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
      if (!video || video.paused) return;

      const codigos = await detector.detect(video);

      if (codigos.length > 0) {
        const primerCodigo = codigos[0];
        console.log(
          "Código detectado:",
          primerCodigo.format,
          primerCodigo.rawValue
        );
        scanner?.onScan(primerCodigo.rawValue);
        // Parar después de detectar (opcional: cambiar para multi-escaneo)
        return;
      }

      // Seguir escaneando
      requestAnimationFrame(escanear);
    } catch (err) {
      console.error("Error en escaneo BarcodeDetector:", err);
      requestAnimationFrame(escanear);
    }
  };

  escanear();
}

/**
 * Inicializar quagga2 como fallback.
 */
async function inicializarQuagga(): Promise<{
  disponible: boolean;
  metodo: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    if (!scanner?.videoElement) {
      resolve({
        disponible: false,
        metodo: "quagga",
        error: "No hay elemento video",
      });
      return;
    }

    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scanner.videoElement,
          constraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        decoder: {
          readers: FORMATOS_QUAGGA,
          debug: {
            showPattern: false,
            showCanvas: false,
            showCandidates: false,
          },
        },
        locate: true,
        frequency: 10,
        multiple: false,
      },
      (err) => {
        if (err) {
          console.error("Error inicializando quagga:", err);
          scanner?.onError?.(
            "Error inicializando cámara: " + (err as Error).message
          );
          resolve({
            disponible: false,
            metodo: "quagga",
            error: (err as Error).message,
          });
          return;
        }

        Quagga.start();

        Quagga.onDetected((result) => {
          if (result.codeResult && result.codeResult.code) {
            console.log("Código detectado (quagga):", result.codeResult.code);
            scanner?.onScan(result.codeResult.code);
            // Parar después de detectar (opcional)
            // Quagga.stop();
          }
        });

        usandoQuagga = true;
        resolve({
          disponible: true,
          metodo: "quagga2",
        });
      }
    );
  });
}

/**
 * Detener el scanner y liberar recursos.
 */
export function detenerScanner(): void {
  if (usandoBarcodeDetector) {
    if (streamActivo) {
      streamActivo.getTracks().forEach((track) => track.stop());
      streamActivo = null;
    }
    if (scanner?.videoElement) {
      scanner.videoElement.srcObject = null;
    }
    usandoBarcodeDetector = false;
  }

  if (usandoQuagga) {
    Quagga.stop();
    usandoQuagga = false;
  }

  scanner = null;
}

/**
 * Reanudar escaneo después de pausa.
 */
export function reanudarScanner(): void {
  if (usandoQuagga) {
    Quagga.start();
  } else if (usandoBarcodeDetector && scanner?.videoElement) {
    scanner.videoElement.play().catch(() => {
      console.error("No se pudo reanudar video");
    });
  }
}

/**
 * Pausar escaneo sin liberar recursos.
 */
export function pausarScanner(): void {
  if (usandoQuagga) {
    Quagga.stop();
  } else if (usandoBarcodeDetector && scanner?.videoElement) {
    scanner.videoElement.pause();
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
    activo: usandoQuagga || usandoBarcodeDetector,
    metodo: usandoBarcodeDetector
      ? "BarcodeDetector"
      : usandoQuagga
        ? "quagga2"
        : null,
    tienePermiso: streamActivo !== null,
  };
}
