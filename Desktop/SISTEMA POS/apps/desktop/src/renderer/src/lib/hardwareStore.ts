import { create } from "zustand";

interface HardwareState {
  ultimoEscaneo: Date | null;
  registrarEscaneo: () => void;
}

// El lector de codigo de barras es un dispositivo HID que actua como teclado:
// no hay una API estandar para saber si "esta conectado", asi que en vez de
// eso mostramos si se detecto actividad de escaneo reciente en esta sesion.
export const useHardwareStore = create<HardwareState>((set) => ({
  ultimoEscaneo: null,
  registrarEscaneo: () => set({ ultimoEscaneo: new Date() }),
}));
