import axios from "axios";
import { pendientes, marcarSincronizado, incrementarIntento } from "./db.js";
import { readConfig } from "./store.js";

let timer: ReturnType<typeof setInterval> | undefined;

async function flush() {
  const config = readConfig();
  if (!config.token) return;

  for (const item of pendientes()) {
    try {
      await axios.post(`${config.apiBaseUrl}${item.endpoint}`, JSON.parse(item.payload), {
        headers: { Authorization: `Bearer ${config.token}` },
        timeout: 8000,
      });
      marcarSincronizado(item.id);
    } catch {
      incrementarIntento(item.id);
      // Se reintenta en el siguiente ciclo; si el servidor devolvio 409/400 el registro
      // quedara reintentando pero el endpoint de ventas es idempotente por clienteUuid.
    }
  }
}

export function startSyncLoop() {
  if (timer) return;
  timer = setInterval(() => {
    void flush();
  }, 15_000);
  void flush();
}

export function stopSyncLoop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

export { flush as flushNow };
