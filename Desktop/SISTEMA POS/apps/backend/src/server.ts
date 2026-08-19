import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerJwt } from "./lib/jwt.js";
import { initWebSocket } from "./lib/ws.js";
import { authRoutes } from "./routes/auth.js";
import { sucursalesRoutes } from "./routes/sucursales.js";
import { productosRoutes } from "./routes/productos.js";
import { inventarioRoutes } from "./routes/inventario.js";
import { ventasRoutes } from "./routes/ventas.js";
import { clientesRoutes } from "./routes/clientes.js";
import { proveedoresRoutes } from "./routes/proveedores.js";
import { gastosRoutes } from "./routes/gastos.js";
import { reportesRoutes } from "./routes/reportes.js";
import { shopifyRoutes } from "./routes/shopify.js";
import { coleccionesRoutes } from "./routes/colecciones.js";
import { metaRoutes } from "./routes/meta.js";
import { creditosRoutes } from "./routes/creditos.js";
import { creditosManualesRoutes } from "./routes/creditos-manuales.js";
import { cuentasBancariasRoutes } from "./routes/cuentas-bancarias.js";
import { calendarioRoutes } from "./routes/calendario.js";
import { usuariosRoutes } from "./routes/usuarios.js";
import { plantillaReciboRoutes } from "./routes/plantilla-recibo.js";
import { pedidosShopifyRoutes } from "./routes/pedidos-shopify.js";
import { backupRoutes } from "./routes/backup.js";
import { cajaRoutes } from "./routes/caja.js";
import { fidelizacionRoutes } from "./routes/fidelizacion.js";
import { iniciarPollerShopify } from "./lib/poller.js";
import { iniciarBackupAutomatico } from "./lib/auto-backup.js";
import { initializeDatabase } from "./lib/initialize-db.js";

// bodyLimit ampliado para permitir subir imagenes de producto en base64 y
// restaurar backups (.sql) de varios negocios/años de historial.
const app = Fastify({ logger: true, bodyLimit: 200 * 1024 * 1024 });

// Inicializar la base de datos antes de hacer cualquier cosa
await initializeDatabase();

await app.register(cors, { origin: process.env.CORS_ORIGIN ?? "*" });
await registerJwt(app);

await app.register(authRoutes);
await app.register(sucursalesRoutes);
await app.register(productosRoutes);
await app.register(inventarioRoutes);
await app.register(ventasRoutes);
await app.register(clientesRoutes);
await app.register(proveedoresRoutes);
await app.register(gastosRoutes);
await app.register(reportesRoutes);
await app.register(shopifyRoutes);
await app.register(coleccionesRoutes);
await app.register(metaRoutes);
await app.register(creditosRoutes);
await app.register(creditosManualesRoutes);
await app.register(cuentasBancariasRoutes);
await app.register(calendarioRoutes);
await app.register(usuariosRoutes);
await app.register(plantillaReciboRoutes);
await app.register(pedidosShopifyRoutes);
await app.register(backupRoutes);
await app.register(cajaRoutes);
await app.register(fidelizacionRoutes);

app.get("/health", async () => ({ ok: true }));

// Servir frontend web estático y SPA routing (DEBE SER LA ÚLTIMA RUTA)
// Nota: En producción, los archivos están en dist/public/ (mismo directorio que server.js)
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const indexHtmlPath = join(publicDir, "index.html");

// Log para debugging
console.log("[Static Files] publicDir:", publicDir);
console.log("[Static Files] indexHtmlPath:", indexHtmlPath);
console.log("[Static Files] public dir exists:", existsSync(publicDir));
console.log("[Static Files] index.html exists:", existsSync(indexHtmlPath));

app.get("/:path*", async (request, reply) => {
  const path = (request.params as any).path || "index.html";

  // No interceptar rutas de salud
  if (path === "health") {
    reply.code(404).send({ error: "Not Found" });
    return;
  }

  // Intentar servir el archivo solicitado
  const filePath = join(publicDir, path);
  if (existsSync(filePath) && !filePath.includes("..")) {
    try {
      const content = await readFile(filePath);
      const ext = path.split(".").pop() || "html";
      const mimeTypes: Record<string, string> = {
        html: "text/html",
        js: "application/javascript",
        css: "text/css",
        png: "image/png",
        jpg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
        json: "application/json",
      };
      reply.header("Content-Type", mimeTypes[ext] || "application/octet-stream");
      reply.send(content);
      return;
    } catch (err) {
      // Si falla, servir index.html (SPA routing)
    }
  }

  // Para rutas no encontradas, servir index.html (SPA routing)
  if (existsSync(indexHtmlPath)) {
    try {
      const content = await readFile(indexHtmlPath);
      reply.header("Content-Type", "text/html");
      reply.send(content);
      return;
    } catch (err) {
      console.error("Error sirviendo index.html:", err);
    }
  }

  reply.code(404).send({ error: "Not Found" });
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });

initWebSocket(app.server);
iniciarPollerShopify();
iniciarBackupAutomatico();
