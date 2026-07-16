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
  sonidoActivado: boolean;
  sonidoVolumen: number;
  backupCarpeta: string | null;
  backupAutomatico: boolean;
  backupFrecuenciaHoras: number;
  ultimoBackupAutomatico: string | null;
}

export interface EstadoActualizacion {
  estado: "buscando" | "disponible" | "al-dia" | "descargando" | "listo-para-instalar" | "error";
  version?: string;
  porcentaje?: number;
  mensaje?: string;
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
  dineroRecibido?: number;
  cambio?: number;
  // Descuentos y fidelizacion (V3).
  subtotal?: number;
  descuento?: number;
  puntosRedimidos?: number;
  valorPuntosRedimidos?: number;
  puntosGanados?: number;
  puntosSaldo?: number;
  // Plantilla configurable (Configuracion > Plantilla del recibo). Todo
  // opcional: si no hay plantilla, el recibo se ve con los datos base.
  plantilla?: {
    logoUrl?: string | null;
    direccion?: string | null;
    telefono?: string | null;
    email?: string | null;
    redesSociales?: string | null;
    mensajeAgradecimiento?: string | null;
    politicasCambios?: string | null;
    piePagina?: string | null;
    qrDataUrl?: string | null;
    imagenPromocionalUrl?: string | null;
    cuponDescuento?: string | null;
    promociones?: string | null;
  };
}

export interface ColaAddArgs {
  id: string;
  tipo: string;
  endpoint: string;
  payload: unknown;
}

export interface EtiquetaData {
  svgCodigoBarras: string;
  nombre: string;
  sku: string;
  precio: number;
  copias: number;
}

export interface ReporteCajaData {
  empresaNombre: string;
  sucursalNombre: string;
  fechaApertura: string;
  fechaCierre: string;
  usuarioApertura: string;
  usuarioCierre: string;
  montoInicial: number;
  ventasEfectivo: number;
  totalEsperado: number;
  montoContado: number;
  diferencia: number;
}

export interface GuardarArchivoArgs {
  nombreSugerido: string;
  contenidoBase64: string;
  carpeta?: string;
}

export interface FiltroArchivo {
  name: string;
  extensions: string[];
}

export interface PosApi {
  getConfig: () => Promise<AppConfig>;
  setConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>;
  queueAdd: (args: ColaAddArgs) => Promise<{ queued: boolean }>;
  queuePendientes: () => Promise<unknown[]>;
  listPrinters: () => Promise<string[]>;
  printRecibo: (data: ReciboData, deviceName: string | null) => Promise<void>;
  printEtiquetas: (etiquetas: EtiquetaData[], deviceName: string | null) => Promise<void>;
  printReporteCaja: (data: ReporteCajaData, deviceName: string | null) => Promise<void>;

  getVersion: () => Promise<string>;
  buscarActualizaciones: () => Promise<void>;
  descargarActualizacion: () => Promise<void>;
  instalarActualizacion: () => Promise<void>;
  onEstadoActualizacion: (cb: (estado: EstadoActualizacion) => void) => () => void;

  guardarArchivo: (args: GuardarArchivoArgs) => Promise<{ guardado: boolean; ruta?: string }>;
  elegirCarpeta: () => Promise<string | null>;
  elegirArchivo: (filtros?: FiltroArchivo[]) => Promise<{ ruta: string; contenidoBase64: string } | null>;

  abrirEnlaceExterno: (url: string) => Promise<void>;
}
