import { create } from "zustand";

export interface Sucursal {
  id: string;
  nombre: string;
  tipo: "FISICA" | "ECOMMERCE";
}

interface SesionState {
  apiBaseUrl: string;
  token: string | null;
  usuario: { id: string; nombre: string; email: string; rol: string; permisos: string[] } | null;
  empresa: { id: string; nombre: string } | null;
  sucursales: Sucursal[];
  sucursalActivaId: string | null;
  hidratado: boolean;
  setApiBaseUrl: (url: string) => void;
  setSesion: (args: {
    token: string;
    usuario: SesionState["usuario"];
    empresa: SesionState["empresa"];
    sucursales: Sucursal[];
  }) => void;
  setSucursalActiva: (id: string) => void;
  setHidratado: () => void;
  logout: () => void;
}

export const useSesionStore = create<SesionState>((set) => ({
  apiBaseUrl: "http://localhost:4000",
  token: null,
  usuario: null,
  empresa: null,
  sucursales: [],
  sucursalActivaId: null,
  hidratado: false,
  setApiBaseUrl: (apiBaseUrl) => set({ apiBaseUrl }),
  setSesion: ({ token, usuario, empresa, sucursales }) =>
    set({
      token,
      usuario,
      empresa,
      sucursales,
      // Auto-seta la primera sucursal como activa si hay sucursales
      sucursalActivaId: sucursales.length > 0 ? sucursales[0].id : null
    }),
  setSucursalActiva: (sucursalActivaId) => set({ sucursalActivaId }),
  setHidratado: () => set({ hidratado: true }),
  logout: () =>
    set({ token: null, usuario: null, empresa: null, sucursales: [], sucursalActivaId: null }),
}));

export function usePermiso(permiso: string): boolean {
  return useSesionStore((s) => s.usuario?.permisos.includes(permiso) ?? false);
}
