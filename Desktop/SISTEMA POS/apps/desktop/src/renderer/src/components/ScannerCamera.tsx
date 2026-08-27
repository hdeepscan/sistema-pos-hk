/**
 * Componente de Scanner de Cámara para Mobile POS
 * Utiliza BarcodeDetector (nativa) con fallback a quagga2
 */

import { useEffect, useRef, useState } from "react";
import {
  inicializarScanner,
  detenerScanner,
  solicitarPermisoCamara,
  obtenerEstadoScanner,
  pausarScanner,
  reanudarScanner,
} from "../lib/scanner";

interface ScannerCameraProps {
  onScan: (codigo: string) => void;
  onError?: (error: string) => void;
}

export function ScannerCamera({ onScan, onError }: ScannerCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<
    "cargando" | "listo" | "error" | "sin-permiso"
  >("cargando");
  const [error, setError] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [codigoDetectado, setCodigoDetectado] = useState<string | null>(null);

  // Inicializar scanner al montar
  useEffect(() => {
    const inicializar = async () => {
      try {
        // Solicitar permiso
        const tienePermiso = await solicitarPermisoCamara();
        if (!tienePermiso) {
          setEstado("sin-permiso");
          setError("Permiso de cámara denegado");
          onError?.("Permiso de cámara denegado");
          return;
        }

        // Inicializar scanner
        const resultado = await inicializarScanner({
          videoElement: videoRef.current || undefined,
          canvasElement: canvasRef.current || undefined,
          onScan: (codigo) => {
            setCodigoDetectado(codigo);
            onScan(codigo);
          },
          onError: (err) => {
            setError(err);
            onError?.(err);
          },
        });

        if (resultado.disponible) {
          setEstado("listo");
          setMetodo(resultado.metodo);
          setError(null);
        } else {
          setEstado("error");
          setError(resultado.error || "Error al inicializar scanner");
          onError?.(resultado.error || "Error al inicializar scanner");
        }
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : "Error desconocido";
        setEstado("error");
        setError(mensaje);
        onError?.(mensaje);
      }
    };

    inicializar();

    // Cleanup
    return () => {
      detenerScanner();
    };
  }, [onScan, onError]);

  // Manejar pausa/reanudación de la app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pausarScanner();
      } else {
        reanudarScanner();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div className="scanner-camera">
      {/* Video o canvas para la cámara */}
      <div className="scanner-camera-container">
        {estado === "listo" ? (
          <>
            <video
              ref={videoRef}
              className="scanner-camera-video"
              playsInline
              autoPlay
              muted
            />
            <canvas ref={canvasRef} className="scanner-camera-canvas" />

            {/* Overlay con línea de escaneo */}
            <div className="scanner-camera-overlay">
              <div className="scanner-camera-reticle"></div>
              <p className="scanner-camera-hint">Apunta al código de barras</p>
            </div>

            {/* Código detectado */}
            {codigoDetectado && (
              <div className="scanner-camera-detected">
                ✅ Código detectado: <strong>{codigoDetectado}</strong>
              </div>
            )}
          </>
        ) : estado === "cargando" ? (
          <div className="scanner-camera-message">
            <div className="spinner"></div>
            <p>Inicializando cámara...</p>
            <small>Por favor espera</small>
          </div>
        ) : estado === "sin-permiso" ? (
          <div className="scanner-camera-message error">
            <p>📷 Permiso de Cámara Denegado</p>
            <p className="scanner-camera-submessage">
              Habilita el acceso a la cámara en los permisos del navegador para
              usar el escáner.
            </p>
            <button
              className="pos-mobile-btn-primary"
              onClick={async () => {
                const tienePermiso = await solicitarPermisoCamara();
                if (tienePermiso) {
                  window.location.reload();
                }
              }}
              style={{ marginTop: "12px" }}
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="scanner-camera-message error">
            <p>❌ Error en el Scanner</p>
            <p className="scanner-camera-submessage">
              {error || "No se pudo inicializar la cámara"}
            </p>
            <button
              className="pos-mobile-btn-primary"
              onClick={() => window.location.reload()}
              style={{ marginTop: "12px" }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Información del método */}
      {estado === "listo" && metodo && (
        <div className="scanner-camera-info">
          <small>
            Usando: <strong>{metodo}</strong>
          </small>
        </div>
      )}
    </div>
  );
}
