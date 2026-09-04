// electron.vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_import_meta_url = "file:///C:/Users/PC/Desktop/SISTEMA%20POS/apps/desktop/electron.vite.config.ts";
var rendererOutDir = fileURLToPath(new URL("./out/renderer", __electron_vite_injected_import_meta_url));
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: rendererOutDir
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
