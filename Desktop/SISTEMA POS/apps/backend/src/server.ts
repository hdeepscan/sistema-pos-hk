import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
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
import { iniciarShopifyQueueWorker } from "./lib/shopify-queue-worker.js";
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Búsqueda inteligente de la carpeta pública (A prueba de fallos)
let publicDir = join(__dirname, "public"); // 1. Asume que corre desde dist/ (Producción Docker)

if (!existsSync(publicDir)) {
  // 2. Si no existe, asume que corre desde src/ (Desarrollo local)
  publicDir = join(__dirname, "..", "dist", "public");
}

if (!existsSync(publicDir)) {
  // 3. Fallback absoluto de rescate para Docker (Toma la raíz del contenedor)
  publicDir = join(process.cwd(), "apps", "backend", "dist", "public");
}

const indexHtmlPath = join(publicDir, "index.html");

// Log seguro para la consola de Railway (no en disco C:\)
app.log.info(`[INIT] Directorio estático configurado en: ${publicDir}`);
app.log.info(`[INIT] ¿Existe index.html allí?: ${existsSync(indexHtmlPath)}`);

app.get("/*", async (request, reply) => {
  // Captura la ruta completa incluyendo subcarpetas (ej: assets/index.js)
  const pathParam = (request.params as any)["*"];
  const path = pathParam && pathParam !== "" ? pathParam : "index.html";

  // Ignorar check de salud
  if (path === "health") {
    reply.code(404).send({ error: "Not Found" });
    return;
  }

  const filePath = join(publicDir, path);

  // Prevenir Directory Traversal (seguridad)
  if (filePath.includes("..")) {
    reply.code(403).send({ error: "Forbidden" });
    return;
  }

  // 1. Intentar servir archivo estático (.js, .css, .png, etc.)
  // Verificamos que exista Y que sea un archivo (no una carpeta)
  if (existsSync(filePath) && statSync(filePath).isFile()) {
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
        woff: "font/woff",
        woff2: "font/woff2",
        ttf: "font/ttf",
      };
      reply.header("Content-Type", mimeTypes[ext] || "application/octet-stream");
      reply.send(content);
      return;
    } catch (err) {
      app.log.error(`[STATIC] Error reading ${filePath}: ${err}`);
    }
  }

  // 2. Si el archivo no existe (y es una ruta de navegación de la SPA), devolver index.html
  if (existsSync(indexHtmlPath)) {
    try {
      const content = await readFile(indexHtmlPath);
      reply.header("Content-Type", "text/html");
      reply.send(content);
      return;
    } catch (err) {
      app.log.error(`[STATIC] Error sirviendo index.html: ${err}`);
    }
  }

  app.log.error(`[STATIC] 404: File not found en ${filePath} y index.html tampoco existe.`);
  reply.code(404).send({ error: "Not Found" });
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });

initWebSocket(app.server);
iniciarPollerShopify();
iniciarBackupAutomatico();
// TODO: Habilitar cuando las migraciones Shopify estén aplicadas en BD
// iniciarShopifyQueueWorker(); // FASE 4: Procesar cola de sincronización
