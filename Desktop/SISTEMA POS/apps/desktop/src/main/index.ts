import { app, BrowserWindow, ipcMain, shell, screen } from "electron";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readConfig, writeConfig } from "./store.js";
import { encolar, pendientes } from "./db.js";
import { startSyncLoop, flushNow } from "./sync.js";
import {
  listPrinters,
  printRecibo,
  printEtiquetas,
  printODescargarEtiquetas,
  printReporteCaja,
  type ReciboData,
  type EtiquetaData,
  type EtiquetaFormato,
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

// Pantalla de bienvenida animada con el logo mientras carga la ventana
// principal. El logo se incrusta como data URI (base64) para que siempre se
// muestre; leer un file:// desde una pagina data: lo bloquea Electron.
function createSplash(): BrowserWindow {
  // Ocupa toda la pantalla para una bienvenida a pantalla completa.
  const { bounds } = screen.getPrimaryDisplay();
  const splash = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    resizable: false,
    fullscreen: true,
    backgroundColor: "#070c16",
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: iconPath,
  });

  let logoUrl = "";
  try {
    logoUrl = `data:image/png;base64,${readFileSync(iconPath).toString("base64")}`;
  } catch {
    logoUrl = "";
  }

  const html = `
    <html>
      <head><meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; height: 100vh; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
        .fondo {
          height: 100vh; width: 100vw; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 30px;
          background: radial-gradient(130% 110% at 50% 0%, #16233f 0%, #0b1220 55%, #070c16 100%);
          animation: entrar .7s ease-out both;
        }
        @keyframes entrar { from { opacity: 0; } to { opacity: 1; } }

        /* Marco fijo; SOLO el aro (.aro) gira. El logo queda quieto. */
        .marco {
          position: relative; width: 300px; height: 300px;
          animation: aparecer .7s ease-out both;
        }
        @keyframes aparecer { from { transform: scale(.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        /* Disco de degradado que gira (la unica pieza animada en rotacion) */
        .aro {
          position: absolute; inset: 0; border-radius: 50%;
          background: conic-gradient(from 0deg, #1e73e8, #2ecc71, #1e73e8);
          animation: girar 1.15s linear infinite;
          box-shadow: 0 0 60px rgba(46,204,113,0.32), 0 0 40px rgba(30,115,232,0.32);
        }
        @keyframes girar { to { transform: rotate(360deg); } }
        /* Tapa fija que cubre el centro y deja solo el borde girando como aro */
        .tapa {
          position: absolute; inset: 12px; border-radius: 50%; background: #0b1220;
        }
        /* Logo perfectamente quieto, con un zoom minimo y lento (elegante) */
        .logo {
          position: absolute; top: 50%; left: 50%; width: 224px; height: 224px;
          transform: translate(-50%, -50%); border-radius: 50%; background: #fff; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          animation: zoomsuave 4s ease-in-out infinite;
        }
        @keyframes zoomsuave {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.02); }
        }
        .logo img { width: 192px; height: 192px; object-fit: contain; }

        .titulo { color: #fff; font-weight: 800; font-size: 40px; letter-spacing: .5px;
          animation: subir .7s .15s ease-out both; }
        .tagline { color: #9fb3d1; font-size: 17px; margin-top: -14px; animation: subir .7s .3s ease-out both; }
        @keyframes subir { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .cargando { color: #7c8db0; font-size: 15px; letter-spacing: 3px; margin-top: 6px; }
        .cargando span { animation: parpadeo 1.2s infinite; }
        .cargando span:nth-child(2) { animation-delay: .2s; }
        .cargando span:nth-child(3) { animation-delay: .4s; }
        @keyframes parpadeo { 0%, 60%, 100% { opacity: .25; } 30% { opacity: 1; } }
      </style></head>
      <body>
        <div class="fondo">
          <div class="marco">
            <div class="aro"></div>
            <div class="tapa"></div>
            <div class="logo">${logoUrl ? `<img src="${logoUrl}" alt="" />` : ""}</div>
          </div>
          <div class="titulo">Sistema POS HK</div>
          <div class="tagline">Tu negocio, bajo control</div>
          <div class="cargando">CARGANDO<span>.</span><span>.</span><span>.</span></div>
        </div>
      </body>
    </html>`;
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
    // Deja la animacion de bienvenida a pantalla completa un momento largo para
    // que se aprecie, y abre la ventana principal maximizada.
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.destroy();
      win.maximize();
      win.show();
    }, 3000);
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
ipcMain.handle(
  "printer:etiquetas",
  (_e, args: { etiquetas: EtiquetaData[]; deviceName: string | null; formato?: EtiquetaFormato }) => {
    // La calibracion (tamaño real y desplazamiento) sale de la configuracion.
    const cfg = readConfig();
    return printEtiquetas(args.etiquetas, args.deviceName, args.formato, {
      anchoMm: cfg.etiquetaAnchoMm,
      altoMm: cfg.etiquetaAltoMm,
      offsetXMm: cfg.etiquetaOffsetXMm,
      offsetYMm: cfg.etiquetaOffsetYMm,
    });
  }
);

// Imprime si hay impresora disponible; si no, genera PDF automáticamente
ipcMain.handle(
  "printer:etiquetas-o-descargar",
  (_e, args: { etiquetas: EtiquetaData[]; deviceName: string | null; formato?: EtiquetaFormato }) => {
    const cfg = readConfig();
    return printODescargarEtiquetas(args.etiquetas, args.deviceName, args.formato, {
      anchoMm: cfg.etiquetaAnchoMm,
      altoMm: cfg.etiquetaAltoMm,
      offsetXMm: cfg.etiquetaOffsetXMm,
      offsetYMm: cfg.etiquetaOffsetYMm,
    });
  }
);
ipcMain.handle("printer:reporteCaja", (_e, args: { data: ReporteCajaData; deviceName: string | null }) =>
  printReporteCaja(args.data, args.deviceName)
);

ipcMain.handle("archivo:guardarRecibo", async (_e, args: { html: string; nombreArchivo: string }) => {
  return guardarArchivo({
    contenido: args.html,
    nombreArchivo: args.nombreArchivo,
    tipo: "text/html",
  });
});

ipcMain.handle("dialogo:mostrar", async (_e, opciones: { tipo: string; titulo: string; mensaje: string; botones: string[] }) => {
  const { dialog } = await import("electron");
  const resultado = await dialog.showMessageBox(ventanaPrincipal!, {
    type: opciones.tipo as any,
    title: opciones.titulo,
    message: opciones.mensaje,
    buttons: opciones.botones,
  });
  return resultado.response;
});

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

  // Busca actualizaciones automaticamente unos segundos despues de abrir (solo
  // en la app instalada; en desarrollo no aplica). Si hay una nueva version, la
  // pantalla de Configuracion y el aviso lo muestran.
  if (app.isPackaged) {
    setTimeout(() => {
      buscarActualizaciones().catch(() => {});
    }, 8000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
