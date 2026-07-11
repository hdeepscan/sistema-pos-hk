import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import type { InventarioActualizadoEvent, VentaCreadaEvent } from "@sistema-pos/shared";
import type { JwtPayload } from "./jwt.js";

let io: SocketIOServer | undefined;

function empresaRoom(empresaId: string) {
  return `empresa:${empresaId}`;
}

export function initWebSocket(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: { origin: process.env.CORS_ORIGIN ?? "*" },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Falta token"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret-change-me") as JwtPayload;
      socket.data.empresaId = payload.empresaId;
      next();
    } catch {
      next(new Error("Token invalido"));
    }
  });

  io.on("connection", (socket) => {
    const empresaId = socket.data.empresaId as string;
    socket.join(empresaRoom(empresaId));
  });

  return io;
}

export function emitInventarioActualizado(empresaId: string, payload: InventarioActualizadoEvent) {
  io?.to(empresaRoom(empresaId)).emit("inventario:actualizado", payload);
}

export function emitVentaCreada(empresaId: string, payload: VentaCreadaEvent) {
  io?.to(empresaRoom(empresaId)).emit("venta:creada", payload);
}
