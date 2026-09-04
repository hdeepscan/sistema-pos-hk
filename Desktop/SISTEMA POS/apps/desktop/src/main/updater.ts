import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";

export interface EstadoActualizacion {
  estado: "buscando" | "disponible" | "al-dia" | "descargando" | "listo-para-instalar" | "error";
  version?: string;
  porcentaje?: number;
  mensaje?: string;
}

// autoDownload=false: el usuario decide cuando descargar (no queremos que se
// baje sola una actualizacion de varios MB en horario de venta).
autoUpdater.autoDownload = false;

export function configurarActualizaciones(getWindow: () => BrowserWindow | null) {
  const enviar = (payload: EstadoActualizacion) => getWindow()?.webContents.send("updates:estado", payload);

  autoUpdater.on("checking-for-update", () => enviar({ estado: "buscando" }));
  autoUpdater.on("update-available", (info) => enviar({ estado: "disponible", version: info.version }));
  autoUpdater.on("update-not-available", () => enviar({ estado: "al-dia" }));
  autoUpdater.on("download-progress", (progress) =>
    enviar({ estado: "descargando", porcentaje: Math.round(progress.percent) })
  );
  autoUpdater.on("update-downloaded", (info) => enviar({ estado: "listo-para-instalar", version: info.version }));
  autoUpdater.on("error", (err) => enviar({ estado: "error", mensaje: err.message }));
}

export async function buscarActualizaciones() {
  await autoUpdater.checkForUpdates();
}

export async function descargarActualizacion() {
  await autoUpdater.downloadUpdate();
}

export function instalarActualizacion() {
  autoUpdater.quitAndInstall();
}
