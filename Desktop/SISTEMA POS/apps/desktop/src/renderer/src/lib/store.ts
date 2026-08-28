import { create } from "zustand";

export interface Sucursal {
  id: string;
  nombre: string;
  tipo: "FISICA" | "ECOMMERCE";
}

interface RegistroDatos {
  empresaNombre: string;
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
}

interface SesionState {
  apiBaseUrl: string;
  token: string | null;
  usuario: { id: string; nombre: string; email: string; rol: string; permisos: string[] } | null;
  empresa: { id: string; nombre: string } | null;
  sucursales: Sucursal[];
  sucursalActivaId: string | null;
  hidratado: boolean;
  registroDatos: RegistroDatos | null;
  setApiBaseUrl: (url: string) => void;
  setSesion: (args: {
    token: string;
    usuario: SesionState["usuario"];
    empresa: SesionState["empresa"];
    sucursales: Sucursal[];
  }) => void;
  setSucursalActiva: (id: string) => void;
  setHidratado: () => void;
  setRegistroDatos: (datos: RegistroDatos) => void;
  limpiarRegistroDatos: () => void;
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
  registroDatos: null,
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
  setRegistroDatos: (registroDatos) => set({ registroDatos }),
  limpiarRegistroDatos: () => set({ registroDatos: null }),
  logout: () =>
    set({ token: null, usuario: null, empresa: null, sucursales: [], sucursalActivaId: null, registroDatos: null }),
}));

/**
 * Verificar permiso: ADMIN tiene acceso total a todo
 * Otros roles verifican el arreglo de permisos específicos
 */
export function usePermiso(permiso: string): boolean {
  return useSesionStore((s) => {
    // Si es ADMIN, tiene acceso total a TODO
    if (s.usuario?.rol === "ADMIN") return true;
    // Otros roles: verificar permiso específico
    return s.usuario?.permisos.includes(permiso) ?? false;
  });
}

/**
 * Verificar si la suscripción está activa
 */
export function useSuscripcionActiva(): boolean {
  return useSesionStore((s) => {
    if (!s.empresa?.fechaVencimiento) return true; // Sin fecha = activa
    const ahora = new Date();
    const vencimiento = new Date(s.empresa.fechaVencimiento);
    return vencimiento > ahora;
  });
}

// ========== THEME STORE ==========

interface TemaState {
  tema: "light" | "dark" | "auto";
  setTema: (tema: "light" | "dark" | "auto") => void;
}

export const useTemaStore = create<TemaState>((set) => {
  // Cargar preferencia de localStorage
  const temaGuardado = (typeof window !== "undefined" ? localStorage.getItem("pos-tema") : null) as "light" | "dark" | "auto" | null;

  return {
    tema: temaGuardado || "auto",
    setTema: (tema: "light" | "dark" | "auto") => {
      if (typeof window !== "undefined") {
        localStorage.setItem("pos-tema", tema);
        // Aplicar tema al elemento raíz
        const html = document.documentElement;
        if (tema === "dark") {
          html.setAttribute("data-theme", "dark");
        } else if (tema === "light") {
          html.setAttribute("data-theme", "light");
        } else {
          html.removeAttribute("data-theme");
        }
      }
      set({ tema });
    },
  };
});
