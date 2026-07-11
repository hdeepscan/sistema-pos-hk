import { BrowserWindow } from "electron";
import type { ReciboData } from "../shared/api-types.js";

export type { ReciboData };

function reciboHtml(data: ReciboData): string {
  const filas = data.items
    .map(
      (i) => `
      <tr>
        <td>${i.cantidad}x ${escapeHtml(i.nombre)}</td>
        <td style="text-align:right">${(i.cantidad * i.precioUnitario).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: monospace; width: 280px; font-size: 12px; }
          h2 { text-align: center; margin: 4px 0; }
          .center { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .total { font-weight: bold; font-size: 14px; margin-top: 8px; }
          hr { border: none; border-top: 1px dashed #000; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(data.empresaNombre)}</h2>
        <div class="center">${escapeHtml(data.sucursalNombre)}</div>
        <div class="center">Comprobante de venta No. ${data.consecutivo}</div>
        <div class="center">${escapeHtml(data.fecha)}</div>
        <div>Cajero: ${escapeHtml(data.cajero)}</div>
        <hr />
        <table>${filas}</table>
        <hr />
        <div class="total">TOTAL: $${data.total.toFixed(2)}</div>
        <div>Pago: ${escapeHtml(data.metodoPago)}</div>
        <hr />
        <div class="center">¡Gracias por su compra!</div>
      </body>
    </html>`;
}

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

export async function printRecibo(data: ReciboData, deviceName: string | null): Promise<void> {
  const win = new BrowserWindow({ show: false });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reciboHtml(data))}`);
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
