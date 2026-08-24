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
      // En web: generar PDF y ZPL (si es zebra3)
      const pdfResult = await this.descargarEtiquetasPDF(items, formato);

      // Si es zebra3, generar también ZPL
      if (formato === "zebra3") {
        await new Promise(resolve => setTimeout(resolve, 500)); // Pequeño delay para no sobrecargar
        const zplResult = await this.descargarZPLEtiquetas(items, formato);
        return {
          imprimio: false,
          mensaje: `✅ PDF + ZPL descargados:\n- PDF: Para web/navegador\n- ZPL: Para Zebra ZT230 + ZebraDesigner`,
        };
      }

      return pdfResult;
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

      // Procesar etiquetas
      const etiquetas = items.flatMap((item: any) =>
        Array.from({ length: item.copias || 1 }, () => item)
      );

      // ESPECIAL PARA ZEBRA3: 1 PÁGINA POR CADA ETIQUETA
      if (formato === "zebra3") {
        // Config para 1 etiqueta por página (30x25mm)
        const configZebra3 = { ...config, pageW: 30, pageH: 25 };

        // Crear primera página
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: [configZebra3.pageW, configZebra3.pageH],
        });

        // Dibujar todas las etiquetas, una por página
        for (let idx = 0; idx < etiquetas.length; idx++) {
          const item = etiquetas[idx];

          // Agregar nueva página para cada etiqueta (excepto la primera)
          if (idx > 0) {
            doc.addPage([configZebra3.pageW, configZebra3.pageH]);
          }

          // Dibujar etiqueta en posición (0, 0) de su página
          await this.renderizarEtiquetaEnPDF(doc, item, 0, 0, configZebra3);
        }

        // Descargar
        const fecha = new Date().toISOString().slice(0, 10);
        const hora = new Date().toTimeString().slice(0, 5);
        doc.save(`etiquetas-${formato}-${fecha}-${hora}.pdf`);

        return {
          imprimio: false,
          mensaje: `✅ PDF descargado: ${items.length} etiqueta${items.length === 1 ? "" : "s"} (${etiquetas.length} página${etiquetas.length === 1 ? "" : "s"})`,
        };
      }

      // Crear PDF con tamaño EXACTO para otros formatos
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [config.pageW, config.pageH],
      });

      // Para carta, calcular número de filas
      let pageNum = 0;
      let etiquetaEnPagina = 0;

      if (formato === "carta") {
        const etiquetasPerFila = config.cols;
        const filasPerPagina = 5; // 297mm / 59.4mm ≈ 5 filas
        const totalEtiquetasPerPagina = etiquetasPerFila * filasPerPagina;

        for (let idx = 0; idx < etiquetas.length; idx++) {
          const item = etiquetas[idx];
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

          await this.renderizarEtiquetaEnPDF(doc, item, x, y, config);
          etiquetaEnPagina++;
        }
      } else {
        // Para rollo (todos en una página)
        for (let idx = 0; idx < etiquetas.length; idx++) {
          const item = etiquetas[idx];
          let x, y;

          if (config.gap !== undefined) {
            // rollo2 con gaps
            const col = idx % config.cols;
            const fila = Math.floor(idx / config.cols);
            x = config.margin + col * (config.labelW + config.gap);
            y = fila * config.labelH;
          } else {
            // rollo1/rollo2
            const col = idx % config.cols;
            const fila = Math.floor(idx / config.cols);
            x = col * config.labelW;
            y = fila * config.labelH;
          }

          await this.renderizarEtiquetaEnPDF(doc, item, x, y, config);
        }
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

  // Generar y descargar ZPL de etiquetas (SOLO para zebra3 - Zebra ZT230)
  async descargarZPLEtiquetas(items: any, formato: string) {
    try {
      if (formato !== "zebra3") {
        return {
          imprimio: false,
          mensaje: `❌ ZPL solo disponible para formato zebra3`,
        };
      }

      console.log(`[ZPL] Generando ZPL: ${formato} con ${items.length} etiqueta(s)`);

      // Configuración para zebra3: 32x25mm, 3 columnas
      const labelW = 32; // mm
      const labelH = 25; // mm
      const cols = 3;
      const gap = 2.5; // mm entre etiquetas
      const margin = 2.5; // mm margen lateral

      // Resolver SVG a texto si es necesario (fallback a SKU)
      const etiquetasConSKU = items.flatMap((item: any) =>
        Array.from({ length: item.copias || 1 }, () => ({
          ...item,
          sku: item.sku || item.id || "NOSKU",
          nombre: (item.nombre || "").substring(0, 20),
          variante: (item.variante || "").substring(0, 20),
          precio: item.precio || 0,
        }))
      );

      // Generar ZPL
      let zpl = this.generarZPLScript(etiquetasConSKU, labelW, labelH, cols, gap, margin);

      // Descargar como archivo .zpl
      const fecha = new Date().toISOString().slice(0, 10);
      const hora = new Date().toTimeString().slice(0, 5);
      const nombreArchivo = `etiquetas-${formato}-${fecha}-${hora}.zpl`;

      const blob = new Blob([zpl], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`[ZPL] Descargado: ${nombreArchivo}`);
      return {
        imprimio: false,
        mensaje: `✅ ZPL descargado: ${items.length} etiqueta${items.length === 1 ? "" : "s"} - Abre en ZebraDesigner`,
      };
    } catch (err) {
      console.error("[ZPL] Error:", err);
      return {
        imprimio: false,
        mensaje: `❌ Error generando ZPL: ${err}`,
      };
    }
  },

  // Generar script ZPL completo - CORREGIDO SIN SUPERPOSICIONES
  generarZPLScript(items: any, labelW: number, labelH: number, cols: number, gap: number, margin: number) {
    const PUNTOS_POR_MM = 8; // 203 dpi = 8 puntos por mm

    // Convertir mm a puntos
    const labelWPuntos = Math.round(labelW * PUNTOS_POR_MM);
    const labelHPuntos = Math.round(labelH * PUNTOS_POR_MM);
    const marginPuntos = Math.round(margin * PUNTOS_POR_MM);

    let zpl = `^XA
^MNW
^LL${labelHPuntos}
^LS0
`;

    items.forEach((item: any, idx: number) => {
      const col = idx % cols;
      const fila = Math.floor(idx / cols);

      // Posición de la esquina superior izquierda de la etiqueta
      const labelX = Math.round((margin + col * (labelW + gap)) * PUNTOS_POR_MM);
      const labelY = Math.round(fila * labelH * PUNTOS_POR_MM);

      // Espacios internos de la etiqueta (en puntos)
      const innerMargin = 8; // ~1mm

      // POSICIONES VERTICALES - ZONAS PROPORCIONALES EN PUNTOS (203 DPI)
      // Proporciones: Título 25%, Variantes 13%, Código 40%, Precio 15%, Margen 5%
      // Etiqueta = 200 puntos (25mm), distribuir proporcionalmente
      const zonasZebra3 = {
        nombre: { altoPt: 50 }, // 25% de 200
        sep1: { altoPt: 6 },
        variante: { altoPt: 26 }, // 13% de 200
        sep2: { altoPt: 6 },
        codigo: { altoPt: 80 }, // 40% de 200 (FIJO EN TAMAÑO 5mm)
        sep3: { altoPt: 8 },
        precio: { altoPt: 30 }, // 15% de 200
        margenInf: { altoPt: 10 }, // 5% de 200
      };

      const offsetSubirPt = 40; // Subir 5mm = 40 puntos (203 DPI) (2mm + 3mm)

      let currentYPt = labelY;
      const nameY = currentYPt + (zonasZebra3.nombre.altoPt / 2);
      currentYPt += zonasZebra3.nombre.altoPt + zonasZebra3.sep1.altoPt;
      const variantY = currentYPt + (zonasZebra3.variante.altoPt / 2);
      currentYPt += zonasZebra3.variante.altoPt + zonasZebra3.sep2.altoPt;
      const codeTextY = currentYPt + 4;
      const barcodeY = (currentYPt + (zonasZebra3.codigo.altoPt / 2)) - offsetSubirPt; // SUBIR 2MM
      currentYPt += zonasZebra3.codigo.altoPt + zonasZebra3.sep3.altoPt;
      const priceY = (currentYPt + (zonasZebra3.precio.altoPt / 2)) - offsetSubirPt; // SUBIR 2MM

      // NOMBRE - Tamaño medio, bold
      zpl += `^CF0,18,12
^FO${labelX + innerMargin},${nameY}
^FD${item.nombre}^FS
`;

      // VARIANTE - Tamaño pequeño, si existe
      if (item.variante) {
        zpl += `^CF0,12,8
^FO${labelX + innerMargin},${variantY}
^FD${item.variante}^FS
`;
      }

      // SKU - Código muy pequeño
      zpl += `^CF0,10,8
^FO${labelX + innerMargin},${codeTextY}
^FD${item.sku}^FS
`;

      // CÓDIGO DE BARRAS - CODE128 con altura fija
      zpl += `^BY2,3,40
^BCN,40,Y,N,N
^FO${labelX + innerMargin},${barcodeY}
^FD${item.sku}^FS
`;

      // PRECIO - Tamaño grande, bold
      zpl += `^CF0,22,14
^FO${labelX + innerMargin},${priceY}
^FD$${(item.precio || 0).toLocaleString("es-CO")}^FS
`;
    });

    zpl += `^XZ`;

    return zpl;
  },

  // Renderizar UNA etiqueta en el PDF con ZONAS FÍSICAS (cm)
  async renderizarEtiquetaEnPDF(doc: any, item: any, x: number, y: number, config: any) {
    // ===== DEFINIR ZONAS FÍSICAS EN CM (convertir a mm para jsPDF) =====
    // Etiqueta de 25mm (2.5cm) de alto: rollo1, rollo2, zebra3
    // Etiqueta de 59.4mm (~5.94cm) de alto: carta

    let zones: any = {};

    if (config.labelH === 25) {
      // ZONAS PARA ETIQUETAS PEQUEÑAS (25mm = 2.5cm)
      // Proporciones: Título 25%, Variantes 13%, Código 40%, Precio 15%, Margen 5%
      zones = {
        nombre: { altoCm: 0.625, margenTopCm: 0.05 }, // 25% de 2.5
        separador1: { altoCm: 0.08 },
        variante: { altoCm: 0.325, margenTopCm: 0.03 }, // 13% de 2.5
        separador2: { altoCm: 0.08 },
        codigo: { altoCm: 1.0, margenTopCm: 0.05 }, // 40% de 2.5 (FIJO EN TAMAÑO 5mm)
        separador3: { altoCm: 0.1 },
        precio: { altoCm: 0.375, margenTopCm: 0.03 }, // 15% de 2.5
        margenInferior: { altoCm: 0.125 }, // 5% de 2.5
      };
    } else {
      // ZONAS PARA ETIQUETAS GRANDES (carta ~5.94cm)
      // Mismas proporciones: Título 25%, Variantes 13%, Código 40%, Precio 15%, Margen 5%
      zones = {
        nombre: { altoCm: 1.485, margenTopCm: 0.1 }, // 25% de 5.94
        separador1: { altoCm: 0.12 },
        variante: { altoCm: 0.772, margenTopCm: 0.05 }, // 13% de 5.94
        separador2: { altoCm: 0.12 },
        codigo: { altoCm: 2.376, margenTopCm: 0.08 }, // 40% de 5.94 (FIJO EN TAMAÑO 10mm)
        separador3: { altoCm: 0.15 },
        precio: { altoCm: 0.891, margenTopCm: 0.05 }, // 15% de 5.94
        margenInferior: { altoCm: 0.297 }, // 5% de 5.94
      };
    }

    // Convertir zonas a mm (jsPDF usa mm)
    Object.keys(zones).forEach(key => {
      zones[key].altoMm = zones[key].altoCm * 10;
      if (zones[key].margenTopCm) zones[key].margenTopMm = zones[key].margenTopCm * 10;
    });

    // Calcular posiciones Y absolutas
    let currentY = y;
    const contentW = config.labelW - 1; // Margen horizontal
    const offsetSubirMm = 0.5; // Subir código y precio 5mm (2mm + 3mm)

    // ZONA 1: NOMBRE
    currentY += zones.nombre.margenTopMm || 0;
    const nombreY = currentY + zones.nombre.altoMm / 2;
    doc.setFontSize(config.labelH === 25 ? 7 : 8);
    doc.setFont(undefined, "bold");
    doc.text(
      (item.nombre || "").substring(0, 22),
      x + config.labelW / 2,
      nombreY,
      { align: "center", maxWidth: contentW }
    );
    currentY += zones.nombre.altoMm + zones.separador1.altoMm;

    // ZONA 2: VARIANTE
    const hasVariante = item.variante && item.variante.trim().length > 0;
    if (hasVariante) {
      currentY += zones.variante.margenTopMm || 0;
      const varianteY = currentY + zones.variante.altoMm / 2;
      doc.setFontSize(config.labelH === 25 ? 5 : 6);
      doc.setFont(undefined, "normal");
      doc.text(
        (item.variante || "").substring(0, 28),
        x + config.labelW / 2,
        varianteY,
        { align: "center", maxWidth: contentW }
      );
      currentY += zones.variante.altoMm + zones.separador2.altoMm;
    } else {
      currentY += zones.separador2.altoMm;
    }

    // ZONA 3: CÓDIGO DE BARRAS (TAMAÑO FIJO, NO MODIFICAR)
    currentY += zones.codigo.margenTopMm || 0;
    const barcodeHeight = config.labelH === 25 ? 5 : 10; // MANTENER
    const quietZone = 0.2;
    const barcodeY = (currentY + (zones.codigo.altoMm / 2)) - offsetSubirMm; // SUBIR 2MM

    if (item.svgCodigoBarras) {
      await this.renderizarSVGEnPDF(
        doc,
        item.svgCodigoBarras,
        x + 0.5,
        barcodeY - barcodeHeight / 2,
        contentW,
        barcodeHeight
      );
    } else {
      doc.setFontSize(5);
      doc.setFont(undefined, "normal");
      doc.text(
        item.sku || item.id || "---",
        x + config.labelW / 2,
        barcodeY,
        { align: "center", maxWidth: contentW }
      );
    }
    currentY += zones.codigo.altoMm + zones.separador3.altoMm;

    // ZONA 4: PRECIO (SIEMPRE AL FINAL, NUNCA SOBRE CÓDIGO)
    currentY += zones.precio.margenTopMm || 0;
    const precioY = (currentY + zones.precio.altoMm / 2) - offsetSubirMm; // SUBIR 2MM
    doc.setFontSize(config.labelH === 25 ? 7.5 : 9);
    doc.setFont(undefined, "bold");
    doc.text(
      `$${(item.precio || 0).toLocaleString("es-CO")}`,
      x + config.labelW / 2,
      precioY,
      { align: "center", maxWidth: contentW }
    );
  },

  // Renderizar SVG del código de barras en el PDF
  async renderizarSVGEnPDF(doc: any, svgString: string, x: number, y: number, width: number, height: number) {
    try {
      // Crear contenedor temporal para SVG
      const svgContainer = document.createElement("div");
      svgContainer.innerHTML = svgString;
      svgContainer.style.position = "absolute";
      svgContainer.style.left = "-9999px";
      svgContainer.style.width = `${width}mm`;
      svgContainer.style.height = `${height}mm`;
      svgContainer.style.display = "flex";
      svgContainer.style.alignItems = "center";
      svgContainer.style.justifyContent = "center";
      svgContainer.style.background = "white";

      document.body.appendChild(svgContainer);

      try {
        // Renderizar SVG a canvas con resolución alta
        const canvas = await html2canvas(svgContainer, {
          scale: 3, // Alta resolución para código de barras
          backgroundColor: "#ffffff",
          useCORS: true,
          windowWidth: width * 3.78, // mm a píxeles (96 dpi)
          windowHeight: height * 3.78,
        });

        // Convertir canvas a imagen PNG
        const imgData = canvas.toDataURL("image/png");

        // Agregar imagen al PDF con tamaño exacto
        doc.addImage(imgData, "PNG", x, y, width, height);
      } finally {
        document.body.removeChild(svgContainer);
      }
    } catch (err) {
      console.error("[PDF-BARCODE] Error renderizando SVG:", err);
      // Silently fail - fallback al texto ocurre en renderizarEtiquetaEnPDF
    }
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
