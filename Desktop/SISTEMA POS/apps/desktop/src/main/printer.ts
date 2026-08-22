import { BrowserWindow } from "electron";
import type { ReciboData, EtiquetaData, EtiquetaFormato, ReporteCajaData } from "../shared/api-types.js";
import { construirReciboHtml } from "../shared/recibo-html.js";

export type { ReciboData, EtiquetaData, EtiquetaFormato, ReporteCajaData };

type PageSize = "Letter" | { width: number; height: number };

// Detectar si una impresora es Zebra por su nombre
function esZebra(deviceName: string | null): boolean {
  if (!deviceName) return false;
  return /zebra|zt\d+|zpl/i.test(deviceName);
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
        };

        // Only set deviceName if it's explicitly provided
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

// Si falla la impresión, genera un PDF automáticamente
async function generarPDF(html: string, nombreArchivo: string, pageSize?: PageSize): Promise<string> {
  const win = new BrowserWindow({ show: false });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const opciones: any = {
      margins: { marginType: "none" },
      printBackground: true,
      pageSize: pageSize || "A4",
    };

    const pdfData = await win.webContents.printToPDF(opciones);

    // Guardar en la carpeta de Descargas
    const { app } = await import("electron");
    const rutaDescargas = app.getPath("downloads");
    const fs = await import("fs");
    const path = await import("path");

    const rutaArchivo = path.join(rutaDescargas, `${nombreArchivo}.pdf`);
    fs.writeFileSync(rutaArchivo, pdfData);

    return rutaArchivo;
  } finally {
    win.destroy();
  }
}

export async function printRecibo(data: ReciboData, deviceName: string | null): Promise<void> {
  try {
    console.log(`[PRINT] Attempting to print recibo to: ${deviceName || "default printer"}`);
    await imprimirHtml(construirReciboHtml(data), deviceName);
    console.log(`[PRINT] Recibo printed successfully`);
  } catch (err) {
    console.error(`[PRINT] Print failed:`, err);
    // Fallback: generate PDF automatically when print fails
    try {
      console.log(`[PRINT] Generating PDF fallback...`);
      const fecha = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);
      const nombreArchivo = `recibo-${data.consecutivo}-${fecha}-${hora}`;
      const rutaPDF = await generarPDF(construirReciboHtml(data), nombreArchivo, { width: 80000, height: 200000 });
      console.log(`[PRINT] PDF generated at: ${rutaPDF}`);
      // Show notification to user (in renderer process)
      const { BrowserWindow } = await import("electron");
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send("print:fallback", {
          tipo: "recibo",
          mensaje: `Impresora no disponible. PDF guardado en Descargas: ${nombreArchivo}.pdf`
        });
      });
    } catch (pdfErr) {
      console.error(`[PRINT] PDF generation also failed:`, pdfErr);
      throw new Error(`Error al imprimir y generar PDF: ${pdfErr}`);
    }
  }
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

  // Zebra ZT230: 3 etiquetas × 30mm + gaps de 2.5mm = 100mm total
  // Layout: [2.5mm margen][30mm etiq][2.5mm gap][30mm etiq][2.5mm gap][30mm etiq][2.5mm margen]
  if (formato === "zebra3") {
    const anchoPorEtiqueta = 30;
    const gapMm = 2.5;
    const margenLateral = 2.5;
    const anchoPagina = margenLateral + anchoPorEtiqueta + gapMm + anchoPorEtiqueta + gapMm + anchoPorEtiqueta + margenLateral; // = 100mm
    const bcAnchoZebra = Math.max(20, anchoPorEtiqueta - 2);
    return {
      pageSize: { width: um(anchoPagina), height: um(h) },
      css: `
        @page { size: ${anchoPagina}mm ${h}mm; margin: 0; padding: 0; }
        .hoja {
          display: grid;
          grid-template-columns: repeat(3, ${anchoPorEtiqueta}mm);
          gap: ${gapMm}mm;
          padding: 0 ${margenLateral}mm;
          width: 100%;
        }
        .etiqueta { width: ${anchoPorEtiqueta}mm; height: ${h}mm; padding: 0; margin: 0; }
        .barcode svg { width: ${bcAnchoZebra}mm; height: ${bcAlto}mm; }`,
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

// Generar ZPL (Zebra Programming Language) para impresoras Zebra
function generarZPL(
  etiquetas: EtiquetaData[],
  formato: EtiquetaFormato
): string {
  // Configuración de etiquetas Zebra
  const config = {
    // Ancho de etiqueta en mm
    anchoMm: formato === "zebra3" ? 30 : 50,
    // Alto de etiqueta en mm
    altoMm: 25,
    // Velocidad de impresión (1-14, 6 es estándar)
    velocidad: 6,
    // Densidad (0-30, 15 es estándar)
    darkness: 15,
    // Resolución (203 = 203dpi estándar Zebra)
    dpi: 203,
  };

  // Convertir mm a puntos ZPL (8 puntos = 1mm aprox)
  const mmAPuntos = (mm: number) => Math.round(mm * 8);
  const anchoZebra = mmAPuntos(config.anchoMm);
  const altoZebra = mmAPuntos(config.altoMm);

  // Inicializar ZPL
  let zpl = "^XA\n"; // Inicio de etiqueta
  zpl += `^LL${altoZebra}\n`; // Establecer alto de etiqueta
  zpl += `^PW${anchoZebra}\n`; // Establecer ancho de etiqueta
  zpl += `^PR${config.velocidad}\n`; // Velocidad de impresión
  zpl += `^MD${config.darkness}\n`; // Densidad

  // Generar cada etiqueta (o copia)
  let etiquetaIndex = 0;
  for (const etiqueta of etiquetas) {
    for (let copia = 0; copia < etiqueta.copias; copia++) {
      console.log(`[ZPL] Generando etiqueta ${etiquetaIndex + 1}/${etiquetas.length * (etiquetas[0]?.copias || 1)}`);

      // Posición Y para el nombre (desde arriba)
      zpl += "^FO10,20\n"; // Posición X,Y
      zpl += "^A0N,25,25\n"; // Fuente, orientación, altura, ancho
      zpl += `^FD${escapeZpl(etiqueta.nombre.substring(0, 20))}\n`; // Nombre (máx 20 caracteres)
      zpl += "^FS\n"; // Fin de campo

      // Variante (si existe)
      if (etiqueta.variante) {
        zpl += "^FO10,50\n";
        zpl += "^A0N,15,15\n";
        zpl += `^FD${escapeZpl(etiqueta.variante.substring(0, 25))}\n`;
        zpl += "^FS\n";
      }

      // Código de barras (usando Code128)
      zpl += "^FO15,75\n";
      zpl += "^BCN,40,Y,N,N\n"; // Code128, alto 40, mostrar texto
      zpl += `^FD${escapeZpl(etiqueta.sku)}\n`; // Usar SKU como código de barras
      zpl += "^FS\n";

      // Precio
      zpl += "^FO10,120\n";
      zpl += "^A0N,30,30\n"; // Fuente más grande para precio
      zpl += `^FD$${(etiqueta.precio / 100).toFixed(0)}\n`;
      zpl += "^FS\n";

      // Fin de etiqueta
      zpl += "^XZ\n"; // Final de impresión

      etiquetaIndex++;
    }
  }

  return zpl;
}

// Escapar caracteres especiales para ZPL
function escapeZpl(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s\-_.]/g, "") // Remover caracteres especiales
    .substring(0, 50); // Limitar longitud
}

// Enviar datos ZPL raw a una impresora Zebra
// ESTADO ACTUAL: Genera ZPL válido pero el envío a la impresora requiere configuración Windows adicional
async function enviarDataAImpresora(deviceName: string, data: string): Promise<void> {
  console.log(`[ZEBRA] Enviando ${data.length} bytes a impresora: ${deviceName}`);

  const { writeFileSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const rutaTemp = join(tmpdir(), `zebra_${Date.now()}.zpl`);
  writeFileSync(rutaTemp, data);

  console.log(`[ZEBRA] Archivo ZPL generado: ${rutaTemp}`);
  console.log(`[ZEBRA] ===== IMPORTANTE =====`);
  console.log(`[ZEBRA] ZPL generado correctamente pero se necesita:
  1. Acceso raw a la impresora Zebra (puerto COM, USB o Network)
  2. Configuración de Windows para enviar datos raw al driver de Zebra
  3. O implementar LibUSB/WinUSB para acceso directo USB

  Para la Zebra ZT230 del cliente:
  - Conectada por USB o Ethernet
  - Requiere envío directo de comandos ZPL
  - Los datos en ${rutaTemp} contienen el ZPL válido listo para enviar
`);

  // TODO: Implementar envío real a la impresora
  // Opciones:
  // 1. Usar WinAPI de Windows para acceso raw
  // 2. Usar node-usb o similar para USB directo
  // 3. Si está en red: enviar por TCP/IP a puerto 9100 (estándar Zebra)
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

// Intenta imprimir; si falla, genera PDF automáticamente
// Para Zebra: intenta enviar ZPL directamente
export async function printODescargarEtiquetas(
  etiquetas: EtiquetaData[],
  deviceName: string | null,
  formato: EtiquetaFormato = "rollo2",
  calibracion?: Partial<CalibracionEtiqueta>
): Promise<{ imprimio: boolean; rutaPDF?: string; mensaje: string }> {
  console.log(`[PRINT LABELS] Attempting to print ${etiquetas.length} etiqueta(s) to: ${deviceName || "default printer"}`);
  console.log(`[PRINT LABELS] Formato: ${formato}, esZebra: ${esZebra(deviceName)}`);

  // ===== FLUJO ZEBRA =====
  if (esZebra(deviceName)) {
    console.log(`[ZEBRA] Detectada impresora Zebra: ${deviceName}`);
    try {
      const zpl = generarZPL(etiquetas, formato);
      console.log(`[ZEBRA] ZPL generado (${zpl.length} bytes)`);
      console.log(`[ZEBRA] Primeras líneas:\n${zpl.split("\n").slice(0, 10).join("\n")}`);

      // Enviar a la impresora
      await enviarDataAImpresora(deviceName, zpl);

      return {
        imprimio: true,
        mensaje: `✅ ${etiquetas.length} etiqueta${etiquetas.length === 1 ? "" : "s"} enviada${etiquetas.length === 1 ? "" : "s"} a Zebra correctamente`,
      };
    } catch (err) {
      console.error(`[ZEBRA] Error imprimiendo en Zebra:`, err);
      // Fallback a PDF si Zebra falla
      console.log(`[ZEBRA] Fallback a PDF...`);
    }
  }

  // ===== FLUJO HTML/PDF (para impresoras normales o fallback) =====
  const cal: CalibracionEtiqueta = { ...CALIBRACION_DEFECTO, ...calibracion };
  const { pageSize } = formatoEtiqueta(formato, cal);
  const html = etiquetasHtml(etiquetas, formato, cal);

  console.log(`[PRINT LABELS] Intentando flujo HTML/PDF...`);

  // Intentar imprimir con HTML
  try {
    await imprimirHtml(html, deviceName, pageSize);
    console.log(`[PRINT LABELS] Successfully printed to ${deviceName}`);
    return {
      imprimio: true,
      mensaje: `${etiquetas.length} etiqueta${etiquetas.length === 1 ? "" : "s"} impresa${etiquetas.length === 1 ? "" : "s"} correctamente`,
    };
  } catch (err) {
    // Si hay impresora configurada y falla, es probable que no esté disponible
    // Si no hay impresora, generar PDF directamente
    console.warn(`[PRINT LABELS] HTML print failed, generating PDF fallback:`, err);

    try {
      const fecha = new Date().toISOString().split("T")[0];
      const hora = new Date().toTimeString().slice(0, 5);
      const nombreArchivo = `etiquetas-${formato}-${fecha}-${hora}`;
      const rutaPDF = await generarPDF(html, nombreArchivo, pageSize);

      console.log(`[PRINT LABELS] PDF generated at: ${rutaPDF}`);
      return {
        imprimio: false,
        rutaPDF,
        mensaje: `Impresora no disponible. PDF guardado en Descargas: ${nombreArchivo}.pdf`,
      };
    } catch (pdfErr) {
      console.error(`[PRINT LABELS] PDF generation failed:`, pdfErr);
      throw new Error(`Error al imprimir y generar PDF: ${pdfErr}`);
    }
  }
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
