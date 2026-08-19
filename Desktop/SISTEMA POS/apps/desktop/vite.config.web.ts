import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const rendererOutDir = fileURLToPath(new URL("./dist/web", import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  build: {
    outDir: rendererOutDir,
    emptyOutDir: true,
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
