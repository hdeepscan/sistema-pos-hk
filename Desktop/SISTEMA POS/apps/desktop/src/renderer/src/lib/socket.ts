import { io, type Socket } from "socket.io-client";
import { useEffect } from "react";
import { useSesionStore } from "./store";
import type { InventarioActualizadoEvent, VentaCreadaEvent, PedidoShopifyEvent } from "@sistema-pos/shared";

let socket: Socket | undefined;

export function connectSocket(): Socket | undefined {
  const { apiBaseUrl, token } = useSesionStore.getState();
  if (!token) return undefined;
  if (socket) socket.disconnect();
  socket = io(apiBaseUrl, { auth: { token } });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = undefined;
}

export function useInventarioActualizado(handler: (event: InventarioActualizadoEvent) => void) {
  useEffect(() => {
    const s = socket;
    if (!s) return;
    s.on("inventario:actualizado", handler);
    return () => {
      s.off("inventario:actualizado", handler);
    };
  }, [handler]);
}

export function useVentaCreada(handler: (event: VentaCreadaEvent) => void) {
  useEffect(() => {
    const s = socket;
    if (!s) return;
    s.on("venta:creada", handler);
    return () => {
      s.off("venta:creada", handler);
    };
  }, [handler]);
}

export function usePedidoShopify(handler: (event: PedidoShopifyEvent) => void) {
  useEffect(() => {
    const s = socket;
    if (!s) return;
    s.on("shopify:pedido-nuevo", handler);
    return () => {
      s.off("shopify:pedido-nuevo", handler);
    };
  }, [handler]);
}
