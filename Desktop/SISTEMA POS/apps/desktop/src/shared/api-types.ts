// Tipos compartidos entre el proceso principal (main), el preload y el
// renderer. Vive fuera de src/main para poder incluirse tanto en el
// tsconfig del proceso Node (main+preload) como en el del renderer sin
// arrastrar el resto de src/main a la compilacion del renderer.

export interface AppConfig {
  apiBaseUrl: string;
  token: string | null;
  empresaId: string | null;
  sucursalId: string | null;
  printerName: string | null;
}

export interface ReciboData {
  empresaNombre: string;
  sucursalNombre: string;
  consecutivo: number;
  fecha: string;
  cajero: string;
  items: { nombre: string; cantidad: number; precioUnitario: number }[];
  total: number;
  metodoPago: string;
}

export interface ColaAddArgs {
  id: string;
  tipo: string;
  endpoint: string;
  payload: unknown;
}

export interface PosApi {
  getConfig: () => Promise<AppConfig>;
  setConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>;
  queueAdd: (args: ColaAddArgs) => Promise<{ queued: boolean }>;
  queuePendientes: () => Promise<unknown[]>;
  listPrinters: () => Promise<string[]>;
  printRecibo: (data: ReciboData, deviceName: string | null) => Promise<void>;
}
