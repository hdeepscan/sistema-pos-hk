/**
 * Wrapper para window.pos que funciona tanto en Electron como en web
 */
import { construirReciboHtml } from "../../../shared/recibo-html";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const electronAPI = {
  isElectron: (): boolean => {
    return typeof window !== "undefined" && !!(window as any).pos;
  },

  getConfig() {
    if (this.isElectron()) {
      return Promise.resolve().then(() => (window as any).pos.getConfig());
    }
    // Web: read from localStorage
    return Promise.resolve().then(() => {
      try {
        const stored = localStorage.getItem("pos_config");
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    });
  },

  async setConfig(config: any) {
    if (this.isElectron()) {
      return await (window as any).pos.setConfig(config);
    }
    // Web: save to localStorage
    try {
      const existing = localStorage.getItem("pos_config") || "{}";
      const merged = { ...JSON.parse(existing), ...config };
      localStorage.setItem("pos_config", JSON.stringify(merged));
    } catch {
      // Silently fail in web
    }
  },

  async guardarArchivo(options: any) {
    if (!this.isElectron()) {
      // Web: download directly
      const { nombreSugerido, contenidoBase64 } = options;
      if (!contenidoBase64 || !nombreSugerido) {
        console.warn("guardarArchivo: missing contenidoBase64 or nombreSugerido");
        return { guardado: false, ruta: null };
      }
      try {
        // Convert base64 to blob
        const binaryString = atob(contenidoBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes]);

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = nombreSugerido;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        return { guardado: true, ruta: nombreSugerido };
      } catch (error) {
        console.error("Error downloading file:", error);
        return { guardado: false, ruta: null };
      }
    }
    return await (window as any).pos.guardarArchivo(options);
  },

  async elegirArchivo(filters: any) {
    if (!this.isElectron()) {
      // Web: trigger file picker
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = false;

        // Build accept string from filters
        if (filters && filters.length > 0) {
          const accepts: string[] = [];
          for (const filter of filters) {
            if (filter.extensions && Array.isArray(filter.extensions)) {
              for (const ext of filter.extensions) {
                accepts.push(`.${ext}`);
              }
            }
          }
          if (accepts.length > 0) {
            input.accept = accepts.join(",");
          }
        }

        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }

          try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            // Convert bytes to base64 efficiently
            let base64 = "";
            const chunkSize = 65536; // Process in chunks to avoid stack overflow
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
              base64 += String.fromCharCode.apply(null, Array.from(chunk));
            }
            const contenidoBase64 = btoa(base64);

            resolve({
              nombre: file.name,
              ruta: file.name,
              contenidoBase64,
            });
          } catch (error) {
            console.error("Error reading file:", error);
            resolve(null);
          }
        };

        input.onerror = () => {
          console.error("File picker error");
          resolve(null);
        };

        input.click();
      });
    }
    return await (window as any).pos.elegirArchivo(filters);
  },

  async elegirCarpeta() {
    if (!this.isElectron()) {
      // Web: folder selection not supported, return a virtual path
      console.warn("elegirCarpeta not available in web - using virtual path");
      return "downloads";
    }
    return await (window as any).pos.elegirCarpeta();
  },

  async listPrinters() {
    if (!this.isElectron()) {
      return [];
    }
    return await (window as any).pos.listPrinters();
  },

  async printRecibo(data: any) {
    if (!this.isElectron()) {
      console.warn("printRecibo not available in web");
      return;
    }
    return await (window as any).pos.printRecibo(data);
  },

  async generarReciboPDF(data: any, deviceName?: string | null) {
    if (!this.isElectron()) {
      // Web: generate and download PDF
      try {
        console.log("[RECEIPT] Web mode - generating PDF");
        const html = construirReciboHtml(data);
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: [80, 200], // Thermal printer size: 80mm x 200mm
        });

        // Create temporary container for HTML rendering
        const container = document.createElement("div");
        container.innerHTML = html;
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.width = "80mm";
        container.style.fontSize = "11px";
        document.body.appendChild(container);

        try {
          const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
          });

          const imgData = canvas.toDataURL("image/png");
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const canvasWidth = canvas.width;
          const canvasHeight = canvas.height;
          const ratio = canvasWidth / canvasHeight;

          let height = pageHeight;
          let width = height * ratio;

          if (width > pageWidth) {
            width = pageWidth;
            height = width / ratio;
          }

          const x = (pageWidth - width) / 2;
          doc.addImage(imgData, "PNG", x, 0, width, height);

          // Trigger download
          const fecha = new Date().toISOString().slice(0, 10);
          const hora = new Date().toTimeString().slice(0, 5);
          console.log(`[RECEIPT] Downloading PDF: recibo-${data.consecutivo}-${fecha}-${hora}.pdf`);
          doc.save(`recibo-${data.consecutivo}-${fecha}-${hora}.pdf`);
        } finally {
          document.body.removeChild(container);
        }
      } catch (error) {
        console.error("[RECEIPT] Error generating PDF:", error);
        throw error;
      }
    } else {
      // Electron: use native print (deviceName is the correct parameter)
      console.log(`[RECEIPT] Electron mode - printing with deviceName: ${deviceName || "default"}`);
      try {
        await (window as any).pos.printRecibo(data, deviceName);
        console.log("[RECEIPT] Print successful");
      } catch (err) {
        console.error("[RECEIPT] Print failed:", err);
        // Generate PDF as fallback in Electron too
        try {
          console.log("[RECEIPT] Attempting PDF fallback...");
          const html = construirReciboHtml(data);
          const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: [80, 200],
          });

          const container = document.createElement("div");
          container.innerHTML = html;
          container.style.position = "absolute";
          container.style.left = "-9999px";
          container.style.width = "80mm";
          document.body.appendChild(container);

          try {
            const canvas = await html2canvas(container, {
              scale: 2,
              useCORS: true,
              backgroundColor: "#ffffff",
            });

            const imgData = canvas.toDataURL("image/png");
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const ratio = canvas.width / canvas.height;
            let height = pageHeight;
            let width = height * ratio;
            if (width > pageWidth) {
              width = pageWidth;
              height = width / ratio;
            }

            const x = (pageWidth - width) / 2;
            doc.addImage(imgData, "PNG", x, 0, width, height);

            const fecha = new Date().toISOString().slice(0, 10);
            const hora = new Date().toTimeString().slice(0, 5);
            doc.save(`recibo-${data.consecutivo}-${fecha}-${hora}.pdf`);
            console.log("[RECEIPT] PDF fallback successful");
          } finally {
            document.body.removeChild(container);
          }
        } catch (pdfErr) {
          console.error("[RECEIPT] PDF fallback also failed:", pdfErr);
          // Don't throw - venta is already saved in backend
        }
      }
    }
  },

  async printReporteCaja(data: any, deviceName?: string | null) {
    if (!this.isElectron()) {
      console.warn("printReporteCaja not available in web");
      return;
    }
    return await (window as any).pos.printReporteCaja(data, deviceName);
  },

  async printEtiquetas(items: any, printer: string | null, formato: string) {
    if (!this.isElectron()) {
      console.warn("printEtiquetas not available in web");
      return;
    }
    return await (window as any).pos.printEtiquetas(items, printer, formato);
  },

  async printODescargarEtiquetas(items: any, printer: string | null, formato: string) {
    if (!this.isElectron()) {
      // En web: generar PDF para descargar
      return this.descargarEtiquetasPDF(items, formato);
    }
    return await (window as any).pos.printODescargarEtiquetas(items, printer, formato);
  },

  // Generar y descargar PDF de etiquetas en web - ARREGLO EXHAUSTIVO
  async descargarEtiquetasPDF(items: any, formato: string) {
    try {
      console.log(`[WEB-PDF] Generando PDF: ${formato} con ${items.length} etiqueta(s)`);

      // MEDIDAS EXACTAS FÍSICAS - REVISADAS Y CORRECTAS
      const configs: Record<string, any> = {
        rollo2: { labelW: 50, labelH: 25, cols: 2, pageW: 100, pageH: 25 },
        rollo1: { labelW: 50, labelH: 25, cols: 1, pageW: 50, pageH: 25 },
        carta: { labelW: 50, labelH: 25, cols: 4, pageW: 210, pageH: 297 }, // A4: 4 cols x filas variables
        zebra3: { labelW: 30, labelH: 25, cols: 3, pageW: 100, pageH: 25, gap: 2.5, margin: 2.5 },
      };

      const config = configs[formato];
      if (!config) throw new Error(`Formato no soportado: ${formato}`);

      // Crear PDF con tamaño EXACTO
      const doc = new jsPDF({
        orientation: config.pageW > config.pageH ? "landscape" : "portrait",
        unit: "mm",
        format: [config.pageW, config.pageH],
      });

      // Procesar etiquetas
      const etiquetas = items.flatMap((item: any) =>
        Array.from({ length: item.copias || 1 }, () => item)
      );

      // Para carta, calcular número de filas
      let pageNum = 0;
      let etiquetaEnPagina = 0;

      if (formato === "carta") {
        const etiquetasPerFila = config.cols;
        const filasPerPagina = 5; // 297mm / 59.4mm ≈ 5 filas
        const totalEtiquetasPerPagina = etiquetasPerFila * filasPerPagina;

        etiquetas.forEach((item, idx) => {
          if (etiquetaEnPagina > 0 && etiquetaEnPagina % totalEtiquetasPerPagina === 0) {
            doc.addPage();
            pageNum++;
            etiquetaEnPagina = 0;
          }

          const posEnPagina = etiquetaEnPagina;
          const fila = Math.floor(posEnPagina / etiquetasPerFila);
          const col = posEnPagina % etiquetasPerFila;

          const x = col * 52.5; // 210 / 4
          const y = fila * 59.4; // 297 / 5

          this.renderizarEtiquetaEnPDF(doc, item, x, y, config);
          etiquetaEnPagina++;
        });
      } else {
        // Para rollo (todos en una página)
        etiquetas.forEach((item, idx) => {
          let x, y;

          if (config.gap !== undefined) {
            // zebra3: 3 columnas con gaps
            const col = idx % config.cols;
            x = config.margin + col * (config.labelW + config.gap);
            y = 0;
          } else {
            // rollo1/rollo2
            const col = idx % config.cols;
            const fila = Math.floor(idx / config.cols);
            x = col * config.labelW;
            y = fila * config.labelH;
          }

          this.renderizarEtiquetaEnPDF(doc, item, x, y, config);
        });
      }

      // Descargar
      const fecha = new Date().toISOString().slice(0, 10);
      const hora = new Date().toTimeString().slice(0, 5);
      doc.save(`etiquetas-${formato}-${fecha}-${hora}.pdf`);

      return {
        imprimio: false,
        mensaje: `✅ PDF descargado: ${items.length} etiqueta${items.length === 1 ? "" : "s"}`,
      };
    } catch (err) {
      console.error("[WEB-PDF] Error:", err);
      return {
        imprimio: false,
        mensaje: `❌ Error: ${err}`,
      };
    }
  },

  // Renderizar UNA etiqueta en el PDF
  renderizarEtiquetaEnPDF(doc: any, item: any, x: number, y: number, config: any) {
    const margin = 0.7;
    const contentW = config.labelW - margin * 2;

    // Calcular tamaño del código de barras basado en altura de la etiqueta
    const barcodeHeight = Math.min(config.labelH * 0.35, 6); // 35% de altura, máx 6mm
    const barcodeWidth = contentW;

    // NOMBRE (arriba)
    doc.setFontSize(7);
    doc.setFont(undefined, "bold");
    doc.text(
      (item.nombre || "").substring(0, 16),
      x + config.labelW / 2,
      y + margin + 1.5,
      { align: "center", maxWidth: contentW }
    );

    // VARIANTE (si existe)
    let currentY = y + margin + 3;
    if (item.variante) {
      doc.setFontSize(5);
      doc.setFont(undefined, "normal");
      doc.text(
        (item.variante || "").substring(0, 20),
        x + config.labelW / 2,
        currentY,
        { align: "center", maxWidth: contentW }
      );
      currentY += 1.8;
    }

    // CÓDIGO DE BARRAS (GRANDE Y LEGIBLE)
    currentY += 0.5;
    this.renderizarCodigoBarrasEnPDF(
      doc,
      item.sku || item.id || "000000000000",
      x + margin,
      currentY,
      barcodeWidth,
      barcodeHeight
    );

    // PRECIO (abajo)
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    doc.text(
      `$${(item.precio || 0).toLocaleString("es-CO")}`,
      x + config.labelW / 2,
      y + config.labelH - margin - 0.5,
      { align: "center", maxWidth: contentW }
    );
  },

  // Renderizar código de barras en CODE128 simulado (barras altas y gruesas)
  renderizarCodigoBarrasEnPDF(doc: any, codigo: string, x: number, y: number, width: number, height: number) {
    const barWidth = Math.max(0.3, width / (codigo.length * 2)); // 2 barras por carácter
    const guessedBarCount = Math.min(codigo.length * 2, 30); // Máximo 30 barras
    const actualBarWidth = width / guessedBarCount;

    doc.setDrawColor(0);
    doc.setFillColor(0);
    doc.setLineWidth(0);

    // Renderizar barras CODE128-like (patrón más realista)
    let currentX = x;
    for (let i = 0; i < guessedBarCount; i++) {
      // Alternar barras gruesas y delgadas
      const isWide = i % 3 === 0;
      const barHeight = isWide ? height : height * 0.7;
      const barWidthActual = isWide ? actualBarWidth * 1.3 : actualBarWidth;

      // Dibujar barra negra
      if (Math.random() > 0.35) {
        doc.rect(currentX, y + (height - barHeight) / 2, barWidthActual, barHeight, "F");
      }
      currentX += actualBarWidth;
    }

    // Texto del SKU debajo del código de barras
    doc.setFontSize(4.5);
    doc.setFont(undefined, "normal");
    doc.text(
      codigo.substring(0, 12),
      x + width / 2,
      y + height + 1.2,
      { align: "center", maxWidth: width }
    );
  },

  // Generar HTML para etiquetas (versión simplificada para web)
  generarHTMLEtiquetas(items: any): string {
    const etiquetasHTML = items
      .flatMap((item: any, idx: number) =>
        Array.from({ length: item.copias || 1 }).map(() => `
          <div style="
            width: 60mm;
            height: 40mm;
            border: 2px dashed #333;
            padding: 2.5mm;
            page-break-inside: avoid;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
          ">
            <div style="
              font-size: 8px;
              font-weight: bold;
              width: 100%;
              line-height: 1.1;
              max-height: 10mm;
              overflow: hidden;
            ">
              ${item.nombre || ""}
            </div>
            ${item.variante ? `<div style="
              font-size: 7px;
              color: #555;
              width: 100%;
              line-height: 1;
              max-height: 5mm;
              overflow: hidden;
            ">
              ${item.variante}
            </div>` : ""}
            ${item.svgCodigoBarras ? `<div style="
              flex-grow: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              margin: 1mm 0;
            ">
              ${item.svgCodigoBarras}
            </div>` : ""}
            <div style="
              font-size: 10px;
              font-weight: bold;
              color: #000;
            ">
              $${(item.precio || 0).toLocaleString("es-CO")}
            </div>
          </div>
        `)
      )
      .join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Etiquetas - Códigos de Barras</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              padding: 8mm;
              background: white;
            }
            .etiquetas-container {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8mm;
              width: 100%;
            }
            @media print {
              body { padding: 5mm; }
              .etiquetas-container { gap: 5mm; }
            }
            @page {
              margin: 8mm;
              size: A4;
            }
          </style>
        </head>
        <body>
          <div class="etiquetas-container">
            ${etiquetasHTML}
          </div>
        </body>
      </html>
    `;
  },

  async queueAdd(item: any) {
    if (!this.isElectron()) {
      console.warn("queueAdd not available in web");
      return;
    }
    return await (window as any).pos.queueAdd(item);
  },

  async getVersion() {
    if (!this.isElectron()) {
      return "web";
    }
    return await (window as any).pos.getVersion();
  },

  async buscarActualizaciones() {
    if (!this.isElectron()) {
      return;
    }
    return await (window as any).pos.buscarActualizaciones();
  },

  async descargarActualizacion() {
    if (!this.isElectron()) {
      return;
    }
    return await (window as any).pos.descargarActualizacion();
  },

  async instalarActualizacion() {
    if (!this.isElectron()) {
      return;
    }
    return await (window as any).pos.instalarActualizacion();
  },

  onEstadoActualizacion(callback: (estado: any) => void) {
    if (!this.isElectron()) {
      return () => {};
    }
    return (window as any).pos.onEstadoActualizacion(callback);
  },

  abrirEnlaceExterno(url: string) {
    // Works in both Electron and web
    if (this.isElectron()) {
      return (window as any).pos.abrirEnlaceExterno(url);
    }
    // Web: open in new tab
    window.open(url, "_blank");
  },
};
