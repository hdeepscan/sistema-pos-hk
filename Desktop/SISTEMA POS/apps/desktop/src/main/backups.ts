import axios from "axios";
import { readConfig, writeConfig } from "./store.js";
import { guardarArchivo } from "./files.js";

const CHEQUEO_MS = 30 * 60 * 1000; // revisa cada 30 min si toca hacer backup
let timer: ReturnType<typeof setInterval> | undefined;

async function ejecutarSiCorresponde() {
  const config = readConfig();
  if (!config.backupAutomatico || !config.backupCarpeta || !config.token) return;

  const ultima = config.ultimoBackupAutomatico ? new Date(config.ultimoBackupAutomatico).getTime() : 0;
  const vencePor = config.backupFrecuenciaHoras * 60 * 60 * 1000;
  if (Date.now() - ultima < vencePor) return;

  try {
    const { data } = await axios.get(`${config.apiBaseUrl}/backup/generar`, {
      headers: { Authorization: `Bearer ${config.token}` },
      responseType: "arraybuffer",
      timeout: 60_000,
    });
    const fecha = new Date().toISOString().slice(0, 10);
    await guardarArchivo({
      nombreSugerido: `backup-sistema-pos-${fecha}.sql`,
      contenidoBase64: Buffer.from(data).toString("base64"),
      carpeta: config.backupCarpeta,
    });
    writeConfig({ ultimoBackupAutomatico: new Date().toISOString() });
  } catch (err) {
    console.error("[backups] No se pudo generar el respaldo automatico:", err);
  }
}

export function iniciarBackupsAutomaticos() {
  if (timer) return;
  timer = setInterval(() => {
    void ejecutarSiCorresponde();
  }, CHEQUEO_MS);
  void ejecutarSiCorresponde();
}
