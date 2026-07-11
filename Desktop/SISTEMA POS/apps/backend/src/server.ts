import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerJwt } from "./lib/jwt.js";
import { initWebSocket } from "./lib/ws.js";
import { authRoutes } from "./routes/auth.js";
import { sucursalesRoutes } from "./routes/sucursales.js";
import { productosRoutes } from "./routes/productos.js";
import { inventarioRoutes } from "./routes/inventario.js";
import { ventasRoutes } from "./routes/ventas.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.CORS_ORIGIN ?? "*" });
await registerJwt(app);

await app.register(authRoutes);
await app.register(sucursalesRoutes);
await app.register(productosRoutes);
await app.register(inventarioRoutes);
await app.register(ventasRoutes);

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });

initWebSocket(app.server);
