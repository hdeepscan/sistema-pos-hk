import PDFDocument from "pdfkit";

type CotizacionConLineas = any;

export interface DatosEmpresaCotizacion {
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

const pesos = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const cantidadTexto = (n: unknown) =>
  Number(n).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fecha = (d: unknown) => new Date(d as string).toLocaleDateString("es-CO", { timeZone: "America/Bogota" });

export function nombreLinea(linea: any): string {
  const nombre = linea.producto?.nombre ?? "Producto";
  return linea.producto?.varianteTitulo ? `${nombre} (${linea.producto.varianteTitulo})` : nombre;
}

/**
 * PDF de la cotización. Cada fila de la tabla se dibuja con su propia coordenada Y (antes las
 * columnas se desalineaban), con salto de página cuando no cabe, y el pie va dentro del margen
 * (antes quedaba fuera y PDFKit agregaba una hoja en blanco).
 */
export async function generarPDFCotizacion(
  cotizacion: CotizacionConLineas,
  datosEmpresa: DatosEmpresaCotizacion
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];
      const margin = 40;
      const doc = new PDFDocument({ margin, size: "letter", bufferPages: true });
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - margin * 2;
      const limiteInferior = doc.page.height - margin - 20; // deja espacio al pie
      const azul = "#1d4ed8";
      const gris = "#64748b";

      const linea = (y: number, color = "#cbd5e1") =>
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor(color).lineWidth(0.7).stroke();

      // ===== ENCABEZADO =====
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text(datosEmpresa.nombre, margin, margin, {
        width: contentWidth * 0.6,
      });
      const contacto = [datosEmpresa.direccion, datosEmpresa.telefono, datosEmpresa.email].filter(Boolean) as string[];
      doc.font("Helvetica").fontSize(9).fillColor(gris);
      for (const c of contacto) doc.text(c, { width: contentWidth * 0.6 });
      const finEmpresa = doc.y;

      doc.font("Helvetica-Bold").fontSize(16).fillColor(azul).text("COTIZACIÓN", margin, margin, {
        width: contentWidth,
        align: "right",
      });
      doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
      doc.text(`No. ${cotizacion.numero}`, { width: contentWidth, align: "right" });
      doc.text(`Fecha: ${fecha(cotizacion.fechaCreacion)}`, { width: contentWidth, align: "right" });
      if (cotizacion.fechaVigencia) {
        doc.text(`Válida hasta: ${fecha(cotizacion.fechaVigencia)}`, { width: contentWidth, align: "right" });
      }
      if (cotizacion.estado && cotizacion.estado !== "BORRADOR") {
        doc.fillColor(gris).text(`Estado: ${ETIQUETA_ESTADO[cotizacion.estado] ?? cotizacion.estado}`, {
          width: contentWidth,
          align: "right",
        });
      }

      let y = Math.max(finEmpresa, doc.y) + 12;
      linea(y, azul);
      y += 12;

      // ===== CLIENTE =====
      doc.font("Helvetica-Bold").fontSize(10).fillColor(azul).text("CLIENTE", margin, y);
      y = doc.y + 4;
      const datosCliente: [string, string | null][] = [
        ["Nombre", cotizacion.clienteNombre],
        ["Empresa", cotizacion.clienteEmpresa],
        [
          cotizacion.clienteTipoDocumento || "Documento",
          cotizacion.clienteNumeroDocumento,
        ],
        ["Teléfono", cotizacion.clienteTelefono],
        ["Email", cotizacion.clienteEmail],
        ["Dirección", cotizacion.clienteDireccion],
      ];
      doc.fontSize(9);
      for (const [etiqueta, valor] of datosCliente) {
        if (!valor) continue;
        doc.font("Helvetica-Bold").fillColor("#0f172a").text(`${etiqueta}:`, margin, y, { width: 80 });
        doc.font("Helvetica").text(valor, margin + 85, y, { width: contentWidth - 85 });
        y = doc.y + 3;
      }
      y += 10;

      // ===== TABLA DE PRODUCTOS =====
      const cols = [
        { titulo: "Descripción", x: margin, w: 225, align: "left" as const },
        { titulo: "Cant.", x: margin + 230, w: 45, align: "right" as const },
        { titulo: "P. unitario", x: margin + 280, w: 80, align: "right" as const },
        { titulo: "Desc.", x: margin + 365, w: 45, align: "right" as const },
        { titulo: "Total", x: margin + 415, w: contentWidth - 415, align: "right" as const },
      ];
      const encabezadoTabla = () => {
        doc.rect(margin, y, contentWidth, 18).fill("#eff6ff");
        doc.font("Helvetica-Bold").fontSize(9).fillColor(azul);
        for (const c of cols) doc.text(c.titulo, c.x + 3, y + 5, { width: c.w - 6, align: c.align });
        y += 22;
      };
      encabezadoTabla();

      doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
      for (const l of cotizacion.lineas) {
        const descripcion = nombreLinea(l);
        const alto = Math.max(doc.heightOfString(descripcion, { width: cols[0].w - 6 }), 11) + 6;
        if (y + alto > limiteInferior) {
          doc.addPage();
          y = margin;
          encabezadoTabla();
          doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
        }
        const valores = [
          descripcion,
          cantidadTexto(l.cantidad),
          pesos(l.precioUnitario),
          Number(l.descuentoPorcentaje) > 0 ? `${Number(l.descuentoPorcentaje)}%` : "-",
          pesos(l.subtotal),
        ];
        cols.forEach((c, i) => doc.text(valores[i], c.x + 3, y + 3, { width: c.w - 6, align: c.align }));
        y += alto;
        linea(y, "#e2e8f0");
      }

      // ===== TOTALES =====
      const filasTotales: [string, string, boolean][] = [["Subtotal", pesos(cotizacion.subtotal), false]];
      if (Number(cotizacion.descuentoValor) > 0) {
        filasTotales.push([`Descuento (${Number(cotizacion.descuentoPorcentaje)}%)`, `-${pesos(cotizacion.descuentoValor)}`, false]);
      }
      if (Number(cotizacion.impuestoPorcentaje) > 0) {
        filasTotales.push([`IVA (${Number(cotizacion.impuestoPorcentaje)}%)`, pesos(cotizacion.impuestoValor), false]);
      }
      filasTotales.push(["TOTAL", pesos(cotizacion.total), true]);

      if (y + filasTotales.length * 18 + 20 > limiteInferior) {
        doc.addPage();
        y = margin;
      }
      y += 10;
      const xEtiqueta = pageWidth - margin - 230;
      for (const [etiqueta, valor, destacado] of filasTotales) {
        if (destacado) {
          doc.rect(xEtiqueta - 6, y - 4, 236, 22).fill("#1d4ed8");
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11);
        } else {
          doc.fillColor("#0f172a").font("Helvetica").fontSize(9.5);
        }
        doc.text(etiqueta, xEtiqueta, y + (destacado ? 2 : 0), { width: 110 });
        doc.text(valor, xEtiqueta + 110, y + (destacado ? 2 : 0), { width: 115, align: "right" });
        y += destacado ? 26 : 16;
      }

      // ===== NOTAS Y CONDICIONES =====
      const notas = [
        cotizacion.condicionesPago ? `Condiciones de pago: ${cotizacion.condicionesPago}` : null,
        cotizacion.comentarios,
      ].filter(Boolean) as string[];
      if (notas.length > 0) {
        y += 10;
        const altoNotas = notas.reduce((acc, n) => acc + doc.heightOfString(n, { width: contentWidth }) + 4, 20);
        if (y + altoNotas > limiteInferior) {
          doc.addPage();
          y = margin;
        }
        doc.font("Helvetica-Bold").fontSize(10).fillColor(azul).text("NOTAS Y CONDICIONES", margin, y);
        y = doc.y + 4;
        doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
        for (const n of notas) {
          doc.text(n, margin, y, { width: contentWidth });
          y = doc.y + 4;
        }
      }

      // ===== FIRMA =====
      if (cotizacion.firmaBase64) {
        try {
          if (y + 90 > limiteInferior) {
            doc.addPage();
            y = margin;
          }
          y += 20;
          const xFirma = pageWidth - margin - 170;
          doc.image(cotizacion.firmaBase64, xFirma + 10, y, { fit: [150, 55] });
          y += 60;
          doc.moveTo(xFirma, y).lineTo(xFirma + 170, y).strokeColor("#0f172a").stroke();
          doc.font("Helvetica").fontSize(8).fillColor(gris).text("Firma autorizada", xFirma, y + 4, {
            width: 170,
            align: "center",
          });
        } catch {
          // Una imagen inválida no debe impedir generar el PDF.
        }
      }

      // ===== PIE DE PÁGINA (en todas las hojas, dentro del margen) =====
      const rango = doc.bufferedPageRange();
      for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(rango.start + i);
        const yPie = doc.page.height - margin - 10;
        doc.font("Helvetica").fontSize(7.5).fillColor("#94a3b8");
        doc.text(
          `Cotización ${cotizacion.numero} · Generada el ${new Date().toLocaleDateString("es-CO", {
            timeZone: "America/Bogota",
          })} · Página ${i + 1} de ${rango.count}`,
          margin,
          yPie,
          { width: contentWidth, align: "center", lineBreak: false }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
