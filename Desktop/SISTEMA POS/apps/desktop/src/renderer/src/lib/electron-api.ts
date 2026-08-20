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

  async generarReciboPDF(data: any, printerName?: string | null) {
    if (!this.isElectron()) {
      // Web: generate and download PDF
      try {
        const html = construirReciboHtml(data);
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        // Create temporary container for HTML rendering
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
          doc.addImage(imgData, "PNG", x, 10, width, height);

          // Trigger download
          const fecha = new Date().toISOString().slice(0, 10);
          const hora = new Date().toTimeString().slice(0, 5);
          doc.save(`recibo-${data.consecutivo}-${fecha}-${hora}.pdf`);
        } finally {
          document.body.removeChild(container);
        }
      } catch (error) {
        console.error("Error generating PDF:", error);
        throw error;
      }
    } else {
      // Electron: use native print
      return await (window as any).pos.printRecibo(data, printerName);
    }
  },

  async printReporteCaja(data: any) {
    if (!this.isElectron()) {
      console.warn("printReporteCaja not available in web");
      return;
    }
    return await (window as any).pos.printReporteCaja(data);
  },

  async printEtiquetas(items: any, printer: string, formato: string) {
    if (!this.isElectron()) {
      console.warn("printEtiquetas not available in web");
      return;
    }
    return await (window as any).pos.printEtiquetas(items, printer, formato);
  },

  async printODescargarEtiquetas(items: any, printer: string, formato: string) {
    if (!this.isElectron()) {
      // En web: generar PDF/HTML para descargar
      return this.descargarEtiquetasPDF(items, formato);
    }
    return await (window as any).pos.printODescargarEtiquetas(items, printer, formato);
  },

  // Generar y descargar PDF de etiquetas en web
  async descargarEtiquetasPDF(items: any, formato: string) {
    try {
      // Generar HTML con las etiquetas
      const html = this.generarHTMLEtiquetas(items);

      // Crear contenedor temporal
      const container = document.createElement("div");
      container.innerHTML = html;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.width = "210mm"; // Ancho A4
      container.style.padding = "10mm";
      document.body.appendChild(container);

      try {
        // Renderizar HTML a canvas
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });

        // Crear PDF con orientación vertical
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

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

        const imgData = canvas.toDataURL("image/png");
        const x = (pageWidth - width) / 2;

        // Primer página
        doc.addImage(imgData, "PNG", x, 10, width, height);

        // Si el contenido es muy largo, añadir más páginas
        let remainingHeight = canvasHeight - (pageHeight - 20) / ratio;
        let pageNumber = 1;
        while (remainingHeight > 0) {
          doc.addPage("a4");
          pageNumber++;
          doc.addImage(
            imgData,
            "PNG",
            x,
            10 - ((pageNumber - 1) * (pageHeight - 20)) / ratio,
            width,
            height
          );
          remainingHeight -= (pageHeight - 20) / ratio;
        }

        // Descargar PDF
        const fecha = new Date().toISOString().slice(0, 10);
        const hora = new Date().toTimeString().slice(0, 5);
        doc.save(`etiquetas-${fecha}-${hora}.pdf`);

        return {
          imprimio: false,
          mensaje: `PDF descargado: ${items.length} etiqueta${items.length === 1 ? "" : "s"}`,
        };
      } finally {
        document.body.removeChild(container);
      }
    } catch (err) {
      console.error("Error generando PDF de etiquetas:", err);
      return {
        imprimio: false,
        mensaje: "Error al generar PDF de etiquetas. Intenta desde Electron.",
      };
    }
  },

  // Generar HTML para etiquetas (versión simplificada para web)
  generarHTMLEtiquetas(items: any): string {
    const etiquetasHTML = items
      .flatMap((item: any, idx: number) =>
        Array.from({ length: item.copias || 1 }).map(() => `
          <div style="
            width: 60mm;
            height: 35mm;
            border: 2px dashed #333;
            padding: 3mm;
            page-break-inside: avoid;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 2mm;
          ">
            <div style="font-size: 9px; font-weight: bold; width: 100%; max-width: 100%; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">
              ${item.nombre || ""}
            </div>
            ${item.svgCodigoBarras ? `<div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;">${item.svgCodigoBarras}</div>` : ""}
            <div style="font-size: 11px; font-weight: bold; margin-top: 2mm;">
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
