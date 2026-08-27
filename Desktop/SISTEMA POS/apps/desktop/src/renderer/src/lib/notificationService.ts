import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notificacion {
  id: string;
  mensaje: string;
  tipo: NotificationType;
  duracion?: number; // ms, 0 = manual
  timestamp: number;
}

interface NotificacionState {
  notificaciones: Notificacion[];
  agregar: (mensaje: string, tipo: NotificationType, duracion?: number) => string;
  remover: (id: string) => void;
  limpiar: () => void;
}

export const useNotificacionStore = create<NotificacionState>((set) => ({
  notificaciones: [],
  agregar: (mensaje: string, tipo: NotificationType, duracion = 5000) => {
    const id = uuidv4();
    const notif: Notificacion = {
      id,
      mensaje,
      tipo,
      duracion,
      timestamp: Date.now(),
    };

    set((state) => ({
      notificaciones: [...state.notificaciones, notif],
    }));

    // Auto-remove después de duracion
    if (duracion > 0) {
      setTimeout(() => {
        set((state) => ({
          notificaciones: state.notificaciones.filter((n) => n.id !== id),
        }));
      }, duracion);
    }

    return id;
  },
  remover: (id: string) => {
    set((state) => ({
      notificaciones: state.notificaciones.filter((n) => n.id !== id),
    }));
  },
  limpiar: () => {
    set({ notificaciones: [] });
  },
}));

// Funciones de conveniencia
export const notif = {
  exito: (mensaje: string, duracion?: number) =>
    useNotificacionStore.getState().agregar(mensaje, "success", duracion),
  error: (mensaje: string, duracion?: number) =>
    useNotificacionStore.getState().agregar(mensaje, "error", duracion),
  info: (mensaje: string, duracion?: number) =>
    useNotificacionStore.getState().agregar(mensaje, "info", duracion),
  warning: (mensaje: string, duracion?: number) =>
    useNotificacionStore.getState().agregar(mensaje, "warning", duracion),
};
