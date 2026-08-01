import { BrowserWindow } from "electron";
import type { ReciboData, EtiquetaData, EtiquetaFormato, ReporteCajaData } from "../shared/api-types.js";
import { construirReciboHtml } from "../shared/recibo-html.js";

export type { ReciboData, EtiquetaData, EtiquetaFormato, ReporteCajaData };

type PageSize = "Letter" | { width: number; height: number };

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

async function imprimirHtml(html: string, deviceName: string | null, pageSize?: PageSize): Promise<void> {
  const win = new BrowserWindow({ show: false });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: deviceName ?? undefined,
          margins: { marginType: "none" },
          ...(pageSize ? { pageSize } : {}),
        },
        (ok, errorType) => {
          if (ok) resolve();
          else reject(new Error(errorType));
        }
      );
    });
  } finally {
    win.destroy();
  }
}

export async function printRecibo(data: ReciboData, deviceName: string | null): Promise<void> {
  await imprimirHtml(construirReciboHtml(data), deviceName);
}

// Calibracion de la etiqueta: medidas reales del rollo y desplazamiento fino
// (cada impresora/rollo corre distinto y hay que centrarlo).
export interface CalibracionEtiqueta {
  anchoMm: number;
  altoMm: number;
  offsetXMm: number;
  offsetYMm: number;
}

const CALIBRACION_DEFECTO: CalibracionEtiqueta = { anchoMm: 50, altoMm: 25, offsetXMm: 0, offsetYMm: 0 };

// Cada formato define el tamaño de pagina (para el driver) y el CSS de la
// hoja, usando las medidas calibradas.
function formatoEtiqueta(formato: EtiquetaFormato, cal: CalibracionEtiqueta): { pageSize: PageSize; css: string } {
  const { anchoMm: a, altoMm: h } = cal;
  // micrones = mm * 1000 (lo que espera Electron en pageSize).
  const um = (mm: number) => Math.round(mm * 1000);
  // El codigo de barras ocupa casi todo el ancho y ~55% del alto.
  const bcAncho = Math.max(20, a - 3);
  const bcAlto = Math.max(8, h * 0.52);

  if (formato === "carta") {
    return {
      pageSize: "Letter",
      css: `
        @page { size: Letter; margin: 8mm; }
        .hoja { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; }
        .etiqueta { height: ${h}mm; border: 1px dashed #ccc; }
        .barcode svg { width: ${bcAncho - 4}mm; height: ${bcAlto}mm; }`,
    };
  }

  const columnas = formato === "rollo2" ? 2 : 1;
  const anchoPagina = a * columnas;
  return {
    pageSize: { width: um(anchoPagina), height: um(h) },
    css: `
      @page { size: ${anchoPagina}mm ${h}mm; margin: 0; }
      .hoja { display: grid; grid-template-columns: ${Array(columnas).fill(`${a}mm`).join(" ")}; }
      .etiqueta { width: ${a}mm; height: ${h}mm; }
      .barcode svg { width: ${bcAncho}mm; height: ${bcAlto}mm; }`,
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

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: sans-serif; margin: 0; }
          .etiqueta {
            padding: 0; box-sizing: border-box; overflow: hidden; page-break-inside: avoid;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            /* Desplazamiento fino para centrar en la etiqueta fisica. */
            transform: translate(${cal.offsetXMm}mm, ${cal.offsetYMm}mm);
          }
          /* El nombre puede ocupar hasta 2 lineas para aprovechar el ancho. */
          .nombre {
            font-size: 9px; font-weight: 600; line-height: 1.05; text-align: center; max-width: 100%;
            overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          }
          .variante { font-size: 7.5px; line-height: 1.1; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .barcode { line-height: 0; margin: 0.3mm 0; }
          .precio { font-size: 13px; font-weight: 800; line-height: 1.1; }
          ${formatoEtiqueta(formato, cal).css}
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
          ${fila("Abrio", d.usuarioApertura)}
          ${fila("Cerro", d.usuarioCierre)}
        </table>
        <hr />
        <table>
          ${fila("Monto inicial", `$${d.montoInicial.toFixed(2)}`)}
          ${fila("Ventas en efectivo", `$${d.ventasEfectivo.toFixed(2)}`)}
          ${fila("Total esperado", `$${d.totalEsperado.toFixed(2)}`, true)}
          ${fila("Contado fisicamente", `$${d.montoContado.toFixed(2)}`)}
          ${fila(d.diferencia >= 0 ? "Sobrante" : "Faltante", `$${Math.abs(d.diferencia).toFixed(2)}`, true)}
        </table>
        <hr />
        <div class="center" style="font-size:10px">Sistema desarrollado por POS HK.</div>
      </body>
    </html>`;
}

export async function printReporteCaja(data: ReporteCajaData, deviceName: string | null): Promise<void> {
  await imprimirHtml(reporteCajaHtml(data), deviceName);
}
