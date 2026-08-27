/**
 * Módulo de scanning de códigos de barras desde cámara del dispositivo.
 * Fase 2: Será implementado con BarcodeDetector o quagga2.
 * Por ahora es un stub para Fase 1 (búsqueda manual).
 */

export interface ScannerState {
  disponible: boolean;
  error: string | null;
  ultimoEscaneo: string | null;
}

/**
 * Inicializar el scanner con la cámara del dispositivo.
 * Detectará automáticamente si el navegador soporta BarcodeDetector.
 *
 * Fase 2: Implementar con BarcodeDetector API o librería quagga2
 */
export async function inicializarScanner(): Promise<ScannerState> {
  // Stub para Fase 1
  return {
    disponible: false,
    error: "Scanner no disponible en Fase 1. Implementado en Fase 2.",
    ultimoEscaneo: null,
  };
}

/**
 * Detener el scanner y liberar la cámara.
 */
export function detenerScanner(): void {
  // Stub para Fase 1
}

/**
 * Escanear un código de barras desde la cámara.
 * Retorna el código detectado.
 *
 * Fase 2: Será reemplazado con implementación real de BarcodeDetector/quagga2
 */
export async function escanearCodigo(): Promise<string | null> {
  // Stub para Fase 1
  return null;
}

/**
 * Solicitar permiso de cámara al usuario.
 */
export async function solicitarPermisoCapara(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    // Cerrar el stream inmediatamente, solo estamos pidiendo permiso
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Verificar si el navegador soporta BarcodeDetector.
 */
export function soportaBarcodeDetector(): boolean {
  return "BarcodeDetector" in window;
}
