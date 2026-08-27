/**
 * Componente de Scanner de Cámara
 * Fase 2: Será implementado con BarcodeDetector o quagga2
 * Por ahora es un componente stub que muestra un placeholder
 */

import { useEffect, useRef, useState } from "react";

interface ScannerCameraProps {
  onScan: (codigo: string) => void;
  onError?: (error: string) => void;
}

export function ScannerCamera({ onScan, onError }: ScannerCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fase 2: Implementar scanner con BarcodeDetector o quagga2
  useEffect(() => {
    setCargando(false);
    setError("Scanner de cámara disponible en Fase 2");
    onError?.("Scanner de cámara disponible en Fase 2");
  }, [onError]);

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "1",
        background: "#f0f0f0",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "8px",
          display: cargando || error ? "none" : "block",
        }}
      />

      {cargando && (
        <div style={{ textAlign: "center", color: "#666" }}>
          <p>Inicializando cámara...</p>
        </div>
      )}

      {error && (
        <div style={{ textAlign: "center", color: "#999" }}>
          <p>📷 Cámara no disponible en Fase 1</p>
          <p style={{ fontSize: "12px", margin: "0" }}>
            Búsqueda manual disponible
          </p>
        </div>
      )}
    </div>
  );
}
