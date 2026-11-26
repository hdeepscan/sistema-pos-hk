/**
 * Escáner de códigos de barras con la cámara (POS móvil y crear producto).
 * Funciona en Android (lector nativo) y en iPhone/Safari (ZXing en WebAssembly).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { detenerScanner, inicializarScanner } from "../lib/scanner";

interface ScannerCameraProps {
  onScan: (codigo: string) => void;
  onError?: (error: string) => void;
}

type Estado = "cargando" | "listo" | "error" | "sin-permiso";

export function ScannerCamera({ onScan, onError }: ScannerCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [codigoDetectado, setCodigoDetectado] = useState<string | null>(null);

  // Los callbacks del padre cambian en cada render; se guardan en refs para no reiniciar la cámara.
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;

  const iniciar = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setEstado("cargando");
    setError(null);

    const resultado = await inicializarScanner({
      videoElement: video,
      onScan: (codigo) => {
        setCodigoDetectado(codigo);
        onScanRef.current(codigo);
      },
      onError: (err) => onErrorRef.current?.(err),
    });

    if (resultado.disponible) {
      setEstado("listo");
      setMetodo(resultado.metodo);
    } else if (resultado.error) {
      setEstado(resultado.tipoError === "sin-permiso" ? "sin-permiso" : "error");
      setError(resultado.error);
    }
  }, []);

  useEffect(() => {
    void iniciar();
    return () => detenerScanner();
  }, [iniciar]);

  // Al salir de la app se apaga la cámara (iOS la corta de todas formas) y al volver se reabre.
  useEffect(() => {
    const alCambiarVisibilidad = () => {
      if (document.hidden) detenerScanner();
      else void iniciar();
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => document.removeEventListener("visibilitychange", alCambiarVisibilidad);
  }, [iniciar]);

  // El aviso de "código detectado" se oculta solo.
  useEffect(() => {
    if (!codigoDetectado) return;
    const t = setTimeout(() => setCodigoDetectado(null), 2500);
    return () => clearTimeout(t);
  }, [codigoDetectado]);

  return (
    <div className="scanner-camera">
      <div className="scanner-camera-container">
        {/* El <video> siempre existe: la cámara necesita el elemento antes de arrancar. */}
        <video
          ref={videoRef}
          className="scanner-camera-video"
          playsInline
          autoPlay
          muted
          style={{ visibility: estado === "listo" ? "visible" : "hidden" }}
        />

        {estado === "listo" && (
          <>
            <div className="scanner-camera-overlay">
              <div className="scanner-camera-reticle"></div>
              <p className="scanner-camera-hint">Apunta al código de barras</p>
            </div>
            {codigoDetectado && (
              <div className="scanner-camera-detected">
                ✅ Código detectado: <strong>{codigoDetectado}</strong>
              </div>
            )}
          </>
        )}

        {estado === "cargando" && (
          <div className="scanner-camera-message">
            <div className="spinner"></div>
            <p>Abriendo cámara...</p>
            <small>Si te pregunta, toca “Permitir”</small>
          </div>
        )}

        {estado === "sin-permiso" && (
          <div className="scanner-camera-message error">
            <p>📷 Sin permiso para usar la cámara</p>
            <p className="scanner-camera-submessage">
              En iPhone: Ajustes → Safari → Cámara → Permitir (o toca “aA” en la barra de Safari → Ajustes del sitio web).
              En Android: toca el candado junto a la dirección → Permisos → Cámara.
            </p>
            <button className="pos-mobile-btn-primary" onClick={() => void iniciar()} style={{ marginTop: "12px" }}>
              Reintentar
            </button>
          </div>
        )}

        {estado === "error" && (
          <div className="scanner-camera-message error">
            <p>❌ No se pudo abrir el escáner</p>
            <p className="scanner-camera-submessage">{error || "No se pudo iniciar la cámara"}</p>
            <button className="pos-mobile-btn-primary" onClick={() => void iniciar()} style={{ marginTop: "12px" }}>
              Reintentar
            </button>
          </div>
        )}
      </div>

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
