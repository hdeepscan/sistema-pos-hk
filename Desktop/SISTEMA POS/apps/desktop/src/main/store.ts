import { app } from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../shared/api-types.js";

export type { AppConfig };

const DEFAULTS: AppConfig = {
  apiBaseUrl: "http://localhost:4000",
  token: null,
  empresaId: null,
  sucursalId: null,
  printerName: null,
};

function configPath() {
  return join(app.getPath("userData"), "config.json");
}

export function readConfig(): AppConfig {
  const path = configPath();
  if (!existsSync(path)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeConfig(partial: Partial<AppConfig>): AppConfig {
  const current = readConfig();
  const next = { ...current, ...partial };
  writeFileSync(configPath(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}
