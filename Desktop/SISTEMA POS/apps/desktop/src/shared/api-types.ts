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
  // Calibracion de etiquetas: cada rollo/impresora corre distinto, asi que el
  // tamaño real y el desplazamiento se ajustan desde Configuracion.
  etiquetaAnchoMm: number;
  etiquetaAltoMm: number;
  etiquetaOffsetYMm: number;
  etiquetaOffsetXMm: number;
  // Espacio en blanco entre una etiqueta y la siguiente (el troquel). El alto
  // de pagina real = alto + separacion; si no coincide, las etiquetas se van
  // corriendo una tras otra.
  etiquetaSeparacionMm: number;
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
  // IVA contenido en el total (los precios incluyen IVA).
  impuesto?: number;
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
  variante?: string; // ej. "Color: Rojo · Talla: M"
  sku: string;
  precio: number;
  copias: number;
}

// Tamaño/disposicion del papel al imprimir etiquetas:
// - rollo2: rollo termico de etiquetas 50x25mm, 2 columnas (2 al ancho)
// - rollo1: rollo termico de etiquetas 50x25mm, 1 columna (media hoja)
// - carta: hoja tamaño carta (impresora normal), varias etiquetas por hoja
// - zebra3: Zebra ZT230, etiquetas ~33.3x25mm, 3 columnas (3 al ancho, 100mm total)
export type EtiquetaFormato = "rollo2" | "rollo1" | "carta" | "zebra3";

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
  printEtiquetas: (etiquetas: EtiquetaData[], deviceName: string | null, formato?: EtiquetaFormato) => Promise<void>;
  printODescargarEtiquetas: (
    etiquetas: EtiquetaData[],
    deviceName: string | null,
    formato?: EtiquetaFormato
  ) => Promise<{ imprimio: boolean; rutaPDF?: string; mensaje: string }>;
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
