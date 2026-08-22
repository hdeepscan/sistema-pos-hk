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

  // Generar y descargar PDF de etiquetas en web
  // Usa dimensiones físicas REALES en mm, no A4
  async descargarEtiquetasPDF(items: any, formato: string) {
    try {
      console.log(`[WEB-ETIQUETAS] Generando PDF con formato: ${formato}`);

      // Dimensiones físicas reales según formato
      const labelConfigs: Record<string, { widthMm: number; heightMm: number; cols?: number }> = {
        rollo2: { widthMm: 100, heightMm: 25, cols: 2 },
        rollo1: { widthMm: 50, heightMm: 25, cols: 1 },
        carta: { widthMm: 210, heightMm: 297, cols: 4 },
        zebra3: { widthMm: 100, heightMm: 25, cols: 3 },
      };

      const config = labelConfigs[formato] || labelConfigs.rollo2;

      // Crear PDF con dimensiones FÍSICAS REALES
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [config.widthMm, config.heightMm],
      });

      // Generar HTML con CSS para el PDF
      const html = this.generarHTMLEtiquetasPDF(items, config);

      // Crear contenedor temporal con MISMO TAMAÑO que el PDF
      const container = document.createElement("div");
      container.innerHTML = html;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.width = `${config.widthMm}mm`; // ANCHO REAL
      container.style.height = `${config.heightMm}mm`; // ALTO REAL
      container.style.padding = "0";
      container.style.margin = "0";
      document.body.appendChild(container);

      try {
        // Renderizar HTML a canvas con escala 1:1
        const canvas = await html2canvas(container, {
          scale: 1, // Sin escala - dimensiones reales
          useCORS: true,
          backgroundColor: "#ffffff",
          windowHeight: container.scrollHeight,
          windowWidth: container.scrollWidth,
        });

        // Convertir canvas a imagen
        const imgData = canvas.toDataURL("image/png");

        // Agregar imagen al PDF sin escalar
        doc.addImage(
          imgData,
          "PNG",
          0, // x
          0, // y
          config.widthMm, // ancho
          config.heightMm // alto
        );

        // Descargar PDF
        const fecha = new Date().toISOString().slice(0, 10);
        const hora = new Date().toTimeString().slice(0, 5);
        const nombreArchivo = `etiquetas-${formato}-${fecha}-${hora}`;

        console.log(`[WEB-ETIQUETAS] Descargando PDF: ${nombreArchivo}`);
        doc.save(`${nombreArchivo}.pdf`);

        return {
          imprimio: false,
          mensaje: `PDF descargado: ${items.length} etiqueta${items.length === 1 ? "" : "s"} (${config.widthMm}x${config.heightMm}mm)`,
        };
      } finally {
        document.body.removeChild(container);
      }
    } catch (err) {
      console.error("[WEB-ETIQUETAS] Error generando PDF:", err);
      return {
        imprimio: false,
        mensaje: "Error al generar PDF de etiquetas",
      };
    }
  },

  // Generar HTML optimizado para PDF con dimensiones físicas reales
  generarHTMLEtiquetasPDF(items: any, config: any): string {
    const etiquetasHTML = items
      .flatMap((item: any) =>
        Array.from({ length: item.copias || 1 }).map(() => `
          <div class="etiqueta">
            <div class="nombre">${item.nombre || ""}</div>
            ${item.variante ? `<div class="variante">${item.variante}</div>` : ""}
            ${item.svgCodigoBarras ? `<div class="barcode">${item.svgCodigoBarras}</div>` : ""}
            <div class="precio">$${(item.precio || 0).toLocaleString("es-CO")}</div>
          </div>
        `)
      )
      .join("");

    const columnWidth = config.widthMm / (config.cols || 1);
    const gap = config.cols === 3 ? 2.5 : 0; // Gap para zebra3

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }

            body {
              width: ${config.widthMm}mm;
              height: ${config.heightMm}mm;
              font-family: Arial, sans-serif;
              background: white;
            }

            .contenedor {
              display: grid;
              grid-template-columns: ${Array(config.cols || 1)
                .fill(`1fr`)
                .join(" ")};
              ${gap ? `gap: ${gap}mm;` : ""}
              ${gap ? `padding: 0 ${gap}mm;` : ""}
              width: 100%;
              height: 100%;
            }

            .etiqueta {
              width: ${columnWidth - (gap || 0)}mm;
              height: ${config.heightMm}mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 2mm;
              border: 1px solid #eee;
              overflow: hidden;
            }

            .nombre {
              font-size: 7px;
              font-weight: bold;
              text-align: center;
              width: 100%;
              line-height: 1;
              margin-bottom: 1mm;
              max-height: 4mm;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }

            .variante {
              font-size: 5px;
              color: #666;
              text-align: center;
              width: 100%;
              margin-bottom: 1mm;
              max-height: 2mm;
              overflow: hidden;
            }

            .barcode {
              flex-grow: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              margin: 1mm 0;
            }

            .barcode svg {
              max-width: 100%;
              max-height: 8mm;
              width: auto;
              height: auto;
            }

            .precio {
              font-size: 11px;
              font-weight: bold;
              text-align: center;
              width: 100%;
            }

            @media print {
              body { margin: 0; padding: 0; }
              .etiqueta { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="contenedor">
            ${etiquetasHTML}
          </div>
        </body>
      </html>
    `;
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
