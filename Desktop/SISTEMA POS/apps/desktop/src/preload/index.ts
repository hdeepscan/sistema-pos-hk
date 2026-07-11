import { contextBridge, ipcRenderer } from "electron";
import type { PosApi } from "../shared/api-types.js";

const api: PosApi = {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (partial) => ipcRenderer.invoke("config:set", partial),

  queueAdd: (args) => ipcRenderer.invoke("queue:add", args),
  queuePendientes: () => ipcRenderer.invoke("queue:pendientes"),

  listPrinters: () => ipcRenderer.invoke("printer:list"),
  printRecibo: (data, deviceName) => ipcRenderer.invoke("printer:print", { data, deviceName }),
};

contextBridge.exposeInMainWorld("pos", api);
