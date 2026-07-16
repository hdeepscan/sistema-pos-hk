import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readConfig, writeConfig } from "./store.js";
import { encolar, pendientes } from "./db.js";
import { startSyncLoop, flushNow } from "./sync.js";
import {
  listPrinters,
  printRecibo,
  printEtiquetas,
  printReporteCaja,
  type ReciboData,
  type EtiquetaData,
  type ReporteCajaData,
} from "./printer.js";
import { configurarActualizaciones, buscarActualizaciones, descargarActualizacion, instalarActualizacion } from "./updater.js";
import { guardarArchivo, elegirCarpeta, elegirArchivo } from "./files.js";
import { iniciarBackupsAutomaticos } from "./backups.js";

const dirname = fileURLToPath(new URL(".", import.meta.url));

const iconPath = app.isPackaged
  ? join(process.resourcesPath, "icon.png")
  : join(dirname, "../../build/icon.png");

let ventanaPrincipal: BrowserWindow | null = null;

// Pantalla de bienvenida con el logo mientras carga la ventana principal.
function createSplash(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 320,
    height: 340,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: iconPath,
  });
  const logoUrl = pathToFileURL(iconPath).href;
  const html = `
    <html><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#111827;font-family:'Segoe UI',sans-serif">
      <img src="${logoUrl}" style="width:150px;border-radius:16px" />
      <div style="color:#fff;font-weight:700;font-size:18px;margin-top:18px">Sistema POS HK</div>
      <div style="color:#9ca3af;font-size:12px;margin-top:6px">Cargando...</div>
    </body></html>`;
  splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  return splash;
}

function createWindow() {
  const splash = createSplash();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: join(dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ventanaPrincipal = win;
  win.on("closed", () => {
    if (ventanaPrincipal === win) ventanaPrincipal = null;
  });
  win.once("ready-to-show", () => {
    // Deja el logo visible un instante para que el arranque se sienta pulido.
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.destroy();
      win.show();
    }, 700);
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(dirname, "../renderer/index.html"));
  }
}

ipcMain.handle("config:get", () => readConfig());
ipcMain.handle("config:set", (_e, partial) => writeConfig(partial));

ipcMain.handle("queue:add", (_e, args: { id: string; tipo: string; endpoint: string; payload: unknown }) => {
  encolar(args.id, args.tipo, args.endpoint, args.payload);
  void flushNow();
  return { queued: true };
});
ipcMain.handle("queue:pendientes", () => pendientes());

ipcMain.handle("printer:list", () => listPrinters());
ipcMain.handle("printer:print", (_e, args: { data: ReciboData; deviceName: string | null }) =>
  printRecibo(args.data, args.deviceName)
);
ipcMain.handle("printer:etiquetas", (_e, args: { etiquetas: EtiquetaData[]; deviceName: string | null }) =>
  printEtiquetas(args.etiquetas, args.deviceName)
);
ipcMain.handle("printer:reporteCaja", (_e, args: { data: ReporteCajaData; deviceName: string | null }) =>
  printReporteCaja(args.data, args.deviceName)
);

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("updates:buscar", () => buscarActualizaciones());
ipcMain.handle("updates:descargar", () => descargarActualizacion());
ipcMain.handle("updates:instalar", () => instalarActualizacion());

ipcMain.handle(
  "archivo:guardar",
  (_e, args: { nombreSugerido: string; contenidoBase64: string; carpeta?: string }) => guardarArchivo(args)
);
ipcMain.handle("archivo:elegirCarpeta", () => elegirCarpeta());
ipcMain.handle("archivo:elegir", (_e, filtros?: { name: string; extensions: string[] }[]) => elegirArchivo(filtros));

ipcMain.handle("shell:abrir", (_e, url: string) => shell.openExternal(url));

app.whenReady().then(() => {
  createWindow();
  startSyncLoop();
  configurarActualizaciones(() => ventanaPrincipal);
  iniciarBackupsAutomaticos();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
