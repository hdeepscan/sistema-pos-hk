import { BrowserWindow } from "electron";
import type { ReciboData, EtiquetaData, EtiquetaFormato, ReporteCajaData } from "../shared/api-types.js";
import { construirReciboHtml } from "../shared/recibo-html.js";

export type { ReciboData, EtiquetaData, EtiquetaFormato, ReporteCajaData };

type PageSize = "Letter" | { width: number; height: number };

/**
 * CONFIGURACIÓN DE IMPRESORAS TÉRMICAS
 * Define dimensiones físicas reales en milímetros (mm)
 */
const THERMAL_PRINTER_CONFIGS = {
  "58mm": {
    widthMm: 58,
    marginMm: 2,
    usableWidthMm: 54,
  },
  "80mm": {
    widthMm: 80,
    marginMm: 2,
    usableWidthMm: 76,
  },
} as const;

const LABEL_CONFIGS = {
  "rollo2": { widthMm: 50, heightMm: 25 },
  "rollo1": { widthMm: 50, heightMm: 25 },
  "carta": { widthMm: 210, heightMm: 297 },
  "zebra3": { widthMm: 30, heightMm: 25 },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function listPrinters(): Promise<string[]> {
  const win = new BrowserWindow({ show: false });
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => p.name);
  } finally {
    win.destroy();
  }
}

/**
 * Imprime HTML a través del driver de impresora del sistema
 * Usa tamaño de página exacto (sin escalado)
 */
async function imprimirHtml(html: string, deviceName: string | null, pageSize?: PageSize): Promise<void> {
  const win = new BrowserWindow({ show: false });
  const PRINT_TIMEOUT = 30000;

  try {
    console.log(`[PRINT-HTML] Loading HTML content...`);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    console.log(`[PRINT-HTML] Sending to printer: ${deviceName || "default"}`);
    console.log(`[PRINT-HTML] Page size: ${pageSize ? JSON.stringify(pageSize) : "default"}`);

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        const printOptions: any = {
          silent: true,
          printBackground: true,
          margins: { marginType: "none" },
          scaleFactor: 100, // 100% - sin escalado automático
        };

        if (deviceName && deviceName.trim()) {
          printOptions.deviceName = deviceName;
          console.log(`[PRINT-HTML] Using explicit printer: ${deviceName}`);
        } else {
          console.log(`[PRINT-HTML] Using system default printer`);
        }

        if (pageSize) {
          printOptions.pageSize = pageSize;
        }

        win.webContents.print(printOptions, (ok, errorType) => {
          if (ok) {
            console.log(`[PRINT-HTML] Print job sent successfully`);
            resolve();
          } else {
            const errorMsg = errorType || "Unknown printer error";
            console.error(`[PRINT-HTML] Print failed: ${errorMsg}`);
            reject(new Error(errorMsg));
          }
        });
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => {
          console.error(`[PRINT-HTML] Print timeout after ${PRINT_TIMEOUT}ms`);
          reject(new Error("Tiempo agotado al imprimir"));
        }, PRINT_TIMEOUT)
      ),
    ]);
  } catch (err) {
    console.error(`[PRINT-HTML] Exception during print:`, err);
    throw err;
  } finally {
    win.destroy();
  }
}

/**
 * Genera PDF con dimensiones físicas reales
 * El PDF es la fuente única del diseño de impresión
 */
async function generarPDF(html: string, nombreArchivo: string, pageSize?: PageSize): Promise<string> {
  const win = new BrowserWindow({ show: false });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const opciones: any = {
      margins: { marginType: "none" },
      printBackground: true,
      pageSize: pageSize || "A4",
      scaleFactor: 100, // Sin escalado
    };

    const pdfData = await win.webContents.printToPDF(opciones);

    const { app } = await import("electron");
    const rutaDescargas = app.getPath("downloads");
    const fs = await import("fs");
    const path = await import("path");

    const rutaArchivo = path.join(rutaDescargas, `${nombreArchivo}.pdf`);
    fs.writeFileSync(rutaArchivo, pdfData);

    console.log(`[PRINT-PDF] PDF guardado en: ${rutaArchivo}`);
    return rutaArchivo;
  } finally {
    win.destroy();
  }
}

/**
 * RECIBOS - Flujo: Intentar imprimir → Fallback a PDF
 */
export async function printRecibo(data: ReciboData, deviceName: string | null): Promise<void> {
  try {
    console.log(`[RECIBO] Attempting to print to: ${deviceName || "default printer"}`);

    // Detectar ancho de recibo (58 o 80 mm)
    const ancho = deviceName?.includes("58") ? "58mm" : "80mm";
    const config = THERMAL_PRINTER_CONFIGS[ancho as keyof typeof THERMAL_PRINTER_CONFIGS];

    // Generar HTML con dimensiones correctas
    const html = construirReciboHtml(data);

    // PageSize en milímetros para Electron
    const pageSize = {
      width: config.widthMm * 1000 / 25.4, // mm a puntos (72 dpi)
      height: 200000, // Alto variable - se adapta al contenido
    };

    await imprimirHtml(html, deviceName, pageSize);
    console.log(`[RECIBO] ✅ Recibo impreso correctamente`);
  } catch (err) {
    console.error(`[RECIBO] Print failed:`, err);
    // Fallback: generar PDF
    try {
      console.log(`[RECIBO] Generando PDF como fallback...`);
      const fecha = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);
      const nombreArchivo = `recibo-${data.consecutivo}-${fecha}-${hora}`;

      const ancho = "80mm"; // Asumir 80mm para PDF
      const config = THERMAL_PRINTER_CONFIGS[ancho as keyof typeof THERMAL_PRINTER_CONFIGS];
      const pageSize = {
        width: config.widthMm * 1000 / 25.4,
        height: 200000,
      };

      const rutaPDF = await generarPDF(construirReciboHtml(data), nombreArchivo, pageSize);

      // Notificar al usuario
      const { BrowserWindow } = await import("electron");
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send("print:fallback", {
          tipo: "recibo",
          mensaje: `Impresora no disponible. PDF guardado: ${nombreArchivo}.pdf`
        });
      });
    } catch (pdfErr) {
      console.error(`[RECIBO] PDF generation failed:`, pdfErr);
      throw new Error(`Error al imprimir recibo: ${pdfErr}`);
    }
  }
}

/**
 * ETIQUETAS - Configuración de formato y tamaño
 */
interface CalibracionEtiqueta {
  anchoMm: number;
  altoMm: number;
  offsetXMm: number;
  offsetYMm: number;
}

const CALIBRACION_DEFECTO: CalibracionEtiqueta = {
  anchoMm: 50,
  altoMm: 25,
  offsetXMm: 0,
  offsetYMm: 0,
};

function formatoEtiqueta(
  formato: EtiquetaFormato,
  cal: CalibracionEtiqueta
): { pageSize: PageSize; css: string } {
  const { anchoMm: a, altoMm: h } = cal;
  const umToPts = (mm: number) => Math.round(mm * 1000 / 25.4);

  if (formato === "carta") {
    return {
      pageSize: "Letter",
      css: `
        @page { size: Letter; margin: 8mm; }
        .hoja { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; }
        .etiqueta { height: ${h}mm; border: 1px dashed #ccc; }
        .barcode svg { width: ${a - 4}mm; height: ${h * 0.52}mm; }
      `,
    };
  }

  if (formato === "zebra3") {
    const anchoEtiq = 30;
    const gap = 2.5;
    const margen = 2.5;
    const total = margen + anchoEtiq + gap + anchoEtiq + gap + anchoEtiq + margen; // 100mm

    return {
      pageSize: {
        width: umToPts(total),
        height: umToPts(h),
      },
      css: `
        @page { size: ${total}mm ${h}mm; margin: 0; padding: 0; }
        .hoja {
          display: grid;
          grid-template-columns: repeat(3, ${anchoEtiq}mm);
          gap: ${gap}mm;
          padding: 0 ${margen}mm;
          width: 100%;
        }
        .etiqueta { width: ${anchoEtiq}mm; height: ${h}mm; }
        .barcode svg { width: ${anchoEtiq - 2}mm; height: ${h * 0.52}mm; }
      `,
    };
  }

  const cols = formato === "rollo1" ? 1 : 2;
  const ancho = a * cols;

  return {
    pageSize: {
      width: umToPts(ancho),
      height: umToPts(h),
    },
    css: `
      @page { size: ${ancho}mm ${h}mm; margin: 0; }
      .hoja { display: grid; grid-template-columns: repeat(${cols}, ${a}mm); }
      .etiqueta { width: ${a}mm; height: ${h}mm; }
      .barcode svg { width: ${a - 3}mm; height: ${h * 0.52}mm; }
    `,
  };
}

function etiquetasHtml(
  etiquetas: EtiquetaData[],
  formato: EtiquetaFormato,
  cal: CalibracionEtiqueta = CALIBRACION_DEFECTO
): string {
  const tarjetas = etiquetas
    .flatMap((e) => Array.from({ length: e.copias }, () => e))
    .map(
      (e) => `
      <div class="etiqueta">
        <div class="nombre">${escapeHtml(e.nombre)}</div>
        ${e.variante ? `<div class="variante">${escapeHtml(e.variante)}</div>` : ""}
        <div class="barcode">${e.svgCodigoBarras}</div>
        <div class="precio">$${e.precio.toLocaleString("es-CO")}</div>
      </div>`
    )
    .join("");

  const { css } = formatoEtiqueta(formato, cal);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: sans-serif; margin: 0; padding: 0; }
          .etiqueta {
            padding: 0; box-sizing: border-box; overflow: hidden; page-break-inside: avoid;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            transform: translate(${cal.offsetXMm}mm, ${cal.offsetYMm}mm);
          }
          .nombre {
            font-size: 9px; font-weight: 600; line-height: 1.05; text-align: center; max-width: 100%;
            overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          }
          .variante { font-size: 7.5px; line-height: 1.1; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .barcode { line-height: 0; margin: 0.3mm 0; }
          .precio { font-size: 13px; font-weight: 800; line-height: 1.1; }
          ${css}
        </style>
      </head>
      <body>
        <div class="hoja">${tarjetas}</div>
      </body>
    </html>`;
}

export async function printEtiquetas(
  etiquetas: EtiquetaData[],
  deviceName: string | null,
  formato: EtiquetaFormato = "rollo2",
  calibracion?: Partial<CalibracionEtiqueta>
): Promise<void> {
  const cal: CalibracionEtiqueta = { ...CALIBRACION_DEFECTO, ...calibracion };
  const { pageSize } = formatoEtiqueta(formato, cal);
  await imprimirHtml(etiquetasHtml(etiquetas, formato, cal), deviceName, pageSize);
}

/**
 * ETIQUETAS - Intenta imprimir, si falla descarga PDF
 */
export async function printODescargarEtiquetas(
  etiquetas: EtiquetaData[],
  deviceName: string | null,
  formato: EtiquetaFormato = "rollo2",
  calibracion?: Partial<CalibracionEtiqueta>
): Promise<{ imprimio: boolean; rutaPDF?: string; mensaje: string }> {
  const cal: CalibracionEtiqueta = { ...CALIBRACION_DEFECTO, ...calibracion };
  const { pageSize } = formatoEtiqueta(formato, cal);
  const html = etiquetasHtml(etiquetas, formato, cal);

  console.log(`[ETIQUETAS] Intentando imprimir ${etiquetas.length} etiqueta(s)...`);

  // Intentar imprimir
  try {
    await imprimirHtml(html, deviceName, pageSize);
    console.log(`[ETIQUETAS] ✅ Etiquetas impresas correctamente`);
    return {
      imprimio: true,
      mensaje: `${etiquetas.length} etiqueta${etiquetas.length === 1 ? "" : "s"} impresa${etiquetas.length === 1 ? "" : "s"} correctamente`,
    };
  } catch (err) {
    console.warn(`[ETIQUETAS] Impresión fallida, generando PDF como fallback:`, err);

    try {
      const fecha = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);
      const nombreArchivo = `etiquetas-${formato}-${fecha}-${hora}`;
      const rutaPDF = await generarPDF(html, nombreArchivo, pageSize);

      console.log(`[ETIQUETAS] PDF generado en: ${rutaPDF}`);
      return {
        imprimio: false,
        rutaPDF,
        mensaje: `Impresora no disponible. PDF guardado: ${nombreArchivo}.pdf`,
      };
    } catch (pdfErr) {
      console.error(`[ETIQUETAS] PDF generation failed:`, pdfErr);
      throw new Error(`Error al procesar etiquetas: ${pdfErr}`);
    }
  }
}

/**
 * REPORTE DE CAJA
 */
function reporteCajaHtml(d: ReporteCajaData): string {
  const fila = (label: string, valor: string, bold = false) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td style="text-align:right;${bold ? "font-weight:bold" : ""}">${escapeHtml(valor)}</td>
    </tr>`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: monospace; width: 280px; font-size: 12px; }
          h2 { text-align: center; margin: 4px 0; }
          .center { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          td { padding: 2px 0; }
          hr { border: none; border-top: 1px dashed #000; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(d.empresaNombre)}</h2>
        <div class="center">${escapeHtml(d.sucursalNombre)}</div>
        <div class="center">CIERRE DE CAJA</div>
        <hr />
        <table>
          ${fila("Apertura", d.fechaApertura)}
          ${fila("Cierre", d.fechaCierre)}
          ${fila("Abrió", d.usuarioApertura)}
          ${fila("Cerró", d.usuarioCierre)}
        </table>
        <hr />
        <table>
          ${fila("Monto inicial", `$${d.montoInicial.toFixed(2)}`)}
          ${fila("Ventas en efectivo", `$${d.ventasEfectivo.toFixed(2)}`)}
          ${fila("Total esperado", `$${d.totalEsperado.toFixed(2)}`, true)}
          ${fila("Contado físicamente", `$${d.montoContado.toFixed(2)}`)}
          ${fila(d.diferencia >= 0 ? "Sobrante" : "Faltante", `$${Math.abs(d.diferencia).toFixed(2)}`, true)}
        </table>
        <hr />
        <div class="center" style="font-size:10px">Sistema POS HK</div>
      </body>
    </html>`;
}

export async function printReporteCaja(data: ReporteCajaData, deviceName: string | null): Promise<void> {
  try {
    console.log(`[CAJA] Imprimiendo reporte de caja...`);
    await imprimirHtml(reporteCajaHtml(data), deviceName);
    console.log(`[CAJA] ✅ Reporte impreso correctamente`);
  } catch (err) {
    console.error(`[CAJA] Print failed:`, err);
    throw new Error(`Error al imprimir reporte de caja: ${err}`);
  }
}
