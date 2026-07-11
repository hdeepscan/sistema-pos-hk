import { app } from "electron";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Cola de sincronizacion offline. Se usa un archivo JSON en vez de una base de
// datos nativa (SQLite) para no depender de un compilador C++ (Visual Studio
// Build Tools) en la maquina donde se instala el .exe. El volumen de escritura
// (ventas/movimientos de una sola caja) es bajo, por lo que leer/escribir el
// archivo completo en cada operacion es suficiente.

export interface ColaItem {
  id: string;
  tipo: string;
  endpoint: string;
  payload: string;
  creado_en: string;
  intentos: number;
  sincronizado: boolean;
}

function dbPath() {
  return join(app.getPath("userData"), "cola-sync.json");
}

function leerTodo(): ColaItem[] {
  const path = dbPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function guardarTodo(items: ColaItem[]) {
  writeFileSync(dbPath(), JSON.stringify(items, null, 2), "utf-8");
}

export function encolar(id: string, tipo: string, endpoint: string, payload: unknown) {
  const items = leerTodo();
  if (items.some((i) => i.id === id)) return;
  items.push({
    id,
    tipo,
    endpoint,
    payload: JSON.stringify(payload),
    creado_en: new Date().toISOString(),
    intentos: 0,
    sincronizado: false,
  });
  guardarTodo(items);
}

export function pendientes(): ColaItem[] {
  return leerTodo()
    .filter((i) => !i.sincronizado)
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
}

export function marcarSincronizado(id: string) {
  const items = leerTodo();
  const item = items.find((i) => i.id === id);
  if (item) item.sincronizado = true;
  guardarTodo(items);
}

export function incrementarIntento(id: string) {
  const items = leerTodo();
  const item = items.find((i) => i.id === id);
  if (item) item.intentos += 1;
  guardarTodo(items);
}
