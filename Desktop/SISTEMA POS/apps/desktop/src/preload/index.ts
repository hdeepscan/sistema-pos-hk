import { contextBridge, ipcRenderer } from "electron";
import type { PosApi, EstadoActualizacion } from "../shared/api-types.js";

const api: PosApi = {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (partial) => ipcRenderer.invoke("config:set", partial),

  queueAdd: (args) => ipcRenderer.invoke("queue:add", args),
  queuePendientes: () => ipcRenderer.invoke("queue:pendientes"),

  listPrinters: () => ipcRenderer.invoke("printer:list"),
  printRecibo: (data, deviceName) => ipcRenderer.invoke("printer:print", { data, deviceName }),
  printEtiquetas: (etiquetas, deviceName, formato) =>
    ipcRenderer.invoke("printer:etiquetas", { etiquetas, deviceName, formato }),
  printReporteCaja: (data, deviceName) => ipcRenderer.invoke("printer:reporteCaja", { data, deviceName }),

  getVersion: () => ipcRenderer.invoke("app:version"),
  buscarActualizaciones: () => ipcRenderer.invoke("updates:buscar"),
  descargarActualizacion: () => ipcRenderer.invoke("updates:descargar"),
  instalarActualizacion: () => ipcRenderer.invoke("updates:instalar"),
  onEstadoActualizacion: (cb: (estado: EstadoActualizacion) => void) => {
    const handler = (_e: unknown, estado: EstadoActualizacion) => cb(estado);
    ipcRenderer.on("updates:estado", handler);
    return () => ipcRenderer.removeListener("updates:estado", handler);
  },

  guardarArchivo: (args) => ipcRenderer.invoke("archivo:guardar", args),
  elegirCarpeta: () => ipcRenderer.invoke("archivo:elegirCarpeta"),
  elegirArchivo: (filtros) => ipcRenderer.invoke("archivo:elegir", filtros),

  abrirEnlaceExterno: (url) => ipcRenderer.invoke("shell:abrir", url),

  guardarReciboEnEscritorio: (html, nombreArchivo) =>
    ipcRenderer.invoke("archivo:guardarRecibo", { html, nombreArchivo }),
  mostrarDialogo: (opciones) => ipcRenderer.invoke("dialogo:mostrar", opciones),
};

contextBridge.exposeInMainWorld("pos", api);
