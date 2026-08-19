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
      console.warn("guardarArchivo not available in web");
      return null;
    }
    return await (window as any).pos.guardarArchivo(options);
  },

  async elegirArchivo(filters: any) {
    if (!this.isElectron()) {
      console.warn("elegirArchivo not available in web");
      return null;
    }
    return await (window as any).pos.elegirArchivo(filters);
  },

  async elegirCarpeta() {
    if (!this.isElectron()) {
      console.warn("elegirCarpeta not available in web");
      return null;
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

  async generarReciboPDF(data: any) {
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
      return await (window as any).pos.printRecibo(data);
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
