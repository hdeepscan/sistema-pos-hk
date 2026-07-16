import { BrowserWindow } from "electron";
import type { ReciboData, EtiquetaData, ReporteCajaData } from "../shared/api-types.js";
import { construirReciboHtml } from "../shared/recibo-html.js";

export type { ReciboData, EtiquetaData, ReporteCajaData };

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

async function imprimirHtml(html: string, deviceName: string | null): Promise<void> {
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

function etiquetasHtml(etiquetas: EtiquetaData[]): string {
  const tarjetas = etiquetas
    .flatMap((e) => Array.from({ length: e.copias }, () => e))
    .map(
      (e) => `
      <div class="etiqueta">
        <div class="nombre">${escapeHtml(e.nombre)}</div>
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
          .hoja { display: flex; flex-wrap: wrap; gap: 4mm; padding: 4mm; }
          .etiqueta {
            width: 38mm; height: 22mm; border: 1px dashed #ccc; padding: 2mm;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            box-sizing: border-box; overflow: hidden; page-break-inside: avoid;
          }
          .nombre { font-size: 7px; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .barcode svg { width: 34mm; height: 10mm; }
          .precio { font-size: 9px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="hoja">${tarjetas}</div>
      </body>
    </html>`;
}

export async function printEtiquetas(etiquetas: EtiquetaData[], deviceName: string | null): Promise<void> {
  await imprimirHtml(etiquetasHtml(etiquetas), deviceName);
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
