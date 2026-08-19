import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { bufferABase64, base64ABuffer } from "../lib/base64";
import { mensajeError } from "../lib/errores";
import { electronAPI } from "../lib/electron-api";

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Backups() {
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const [tamanoUltimo, setTamanoUltimo] = useState<number | null>(null);
  const [generando, setGenerando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [backupAutomatico, setBackupAutomatico] = useState(false);
  const [backupCarpeta, setBackupCarpeta] = useState<string | null>(null);
  const [backupFrecuenciaHoras, setBackupFrecuenciaHoras] = useState(24);

  useEffect(() => {
    api
      .get("/backup/info")
      .then(({ data }) => setUltimoBackup(data.ultimoBackup))
      .catch(() => {});
    electronAPI.getConfig().then((c) => {
      setBackupAutomatico(c.backupAutomatico);
      setBackupCarpeta(c.backupCarpeta);
      setBackupFrecuenciaHoras(c.backupFrecuenciaHoras);
    });
  }, []);

  async function crearBackup() {
    setGenerando(true);
    setMensaje(null);
    setError(null);
    try {
      const { data } = await api.get("/backup/generar", { responseType: "arraybuffer" });
      const contenidoBase64 = bufferABase64(data as ArrayBuffer);
      const fecha = new Date().toISOString().slice(0, 10);
      const resultado = await electronAPI.guardarArchivo({
        nombreSugerido: `backup-sistema-pos-${fecha}.sql`,
        contenidoBase64,
      });
      if (resultado.guardado) {
        setMensaje(`Copia guardada en ${resultado.ruta}`);
        setTamanoUltimo((data as ArrayBuffer).byteLength);
        const { data: info } = await api.get("/backup/info");
        setUltimoBackup(info.ultimoBackup);
      }
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo generar la copia de seguridad"));
    } finally {
      setGenerando(false);
    }
  }

  async function restaurarBackup() {
    const archivo = await electronAPI.elegirArchivo([{ name: "Respaldo SQL", extensions: ["sql"] }]);
    if (!archivo) return;
    const confirmacion = prompt(
      'Esto REEMPLAZA todos los datos actuales por los del respaldo. Esta accion no se puede deshacer.\n\nEscribe RESTAURAR para confirmar:'
    );
    if (confirmacion !== "RESTAURAR") return;

    setRestaurando(true);
    setMensaje(null);
    setError(null);
    try {
      const bytes = base64ABuffer(archivo.contenidoBase64);
      // En web, axios maneja mejor Blob que Uint8Array
      const blob = new Blob([bytes], { type: "application/sql" });
      await api.post("/backup/restaurar", blob, { headers: { "Content-Type": "application/sql" } });
      setMensaje("Respaldo restaurado. Cierra sesion y vuelve a entrar para ver los datos restaurados.");
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo restaurar el respaldo"));
    } finally {
      setRestaurando(false);
    }
  }

  async function elegirCarpetaBackup() {
    const carpeta = await electronAPI.elegirCarpeta();
    if (!carpeta) return;
    setBackupCarpeta(carpeta);
    await electronAPI.setConfig({ backupCarpeta: carpeta });
  }

  async function cambiarAutomatico(activo: boolean) {
    if (activo && !backupCarpeta) {
      setError("Elige primero una carpeta destino");
      return;
    }
    setBackupAutomatico(activo);
    await electronAPI.setConfig({ backupAutomatico: activo });
  }

  async function cambiarFrecuencia(horas: number) {
    setBackupFrecuenciaHoras(horas);
    await electronAPI.setConfig({ backupFrecuenciaHoras: horas });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Copias de seguridad</h2>
          <p>Respalda y restaura toda la informacion del negocio</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520, marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Respaldo manual</h4>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Ultimo respaldo: {ultimoBackup ? new Date(ultimoBackup).toLocaleString("es-CO") : "Nunca"}
          {tamanoUltimo !== null && ` · ${formatoTamano(tamanoUltimo)}`}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={crearBackup} disabled={generando}>
            {generando ? "Generando..." : "Crear copia de seguridad ahora"}
          </button>
          <button type="button" className="secondary" onClick={restaurarBackup} disabled={restaurando}>
            {restaurando ? "Restaurando..." : "Restaurar copia"}
          </button>
        </div>
        {mensaje && <p className="badge success" style={{ marginTop: 10, width: "fit-content" }}>{mensaje}</p>}
        {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <h4 style={{ marginTop: 0 }}>Copias automaticas</h4>
        <div className="grid-form">
          <label>
            Carpeta destino {backupCarpeta && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({backupCarpeta})</span>}
            <button type="button" className="secondary" onClick={elegirCarpetaBackup} style={{ width: "fit-content" }}>
              {backupCarpeta ? "Cambiar carpeta" : "Elegir carpeta"}
            </button>
          </label>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>
            Truco: si eliges la carpeta de tu OneDrive o Google Drive ya sincronizada en esta PC, el respaldo queda
            tambien en la nube automaticamente, sin configurar nada mas.
          </p>
          <label>
            Frecuencia
            <select value={backupFrecuenciaHoras} onChange={(e) => cambiarFrecuencia(Number(e.target.value))}>
              <option value={6}>Cada 6 horas</option>
              <option value={12}>Cada 12 horas</option>
              <option value={24}>Diario</option>
              <option value={168}>Semanal</option>
            </select>
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={backupAutomatico}
              onChange={(e) => cambiarAutomatico(e.target.checked)}
              style={{ width: "auto" }}
            />
            Activar copias automaticas
          </label>
        </div>
      </div>
    </div>
  );
}
