import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, writeConfig } from "./store.js";
import { encolar, pendientes } from "./db.js";
import { startSyncLoop, flushNow } from "./sync.js";
import { listPrinters, printRecibo, type ReciboData } from "./printer.js";

const dirname = fileURLToPath(new URL(".", import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

app.whenReady().then(() => {
  createWindow();
  startSyncLoop();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
