import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Compilar directamente a ../backend/dist/public para evitar copia manual
const rendererOutDir = resolve(__dirname, "../backend/dist/public");

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  build: {
    outDir: rendererOutDir,
    emptyOutDir: true,
    rollupOptions: {
      // Marcar quagga como external para que no intente resolverlo en build
      external: ["quagga"],
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
