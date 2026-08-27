import PDFDocument from "pdfkit";

type CotizacionConLineas = any;

export async function generarPDFCotizacion(
  cotizacion: CotizacionConLineas,
  datosEmpresa: any
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];
      const doc = new PDFDocument({ margin: 40, size: "letter" });

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      // ===== ENCABEZADO EMPRESA =====
      doc.fontSize(20).font("Helvetica-Bold").text(datosEmpresa.nombre, { align: "center" });
      doc.fontSize(10).font("Helvetica");
      doc.text(`NIT: ${datosEmpresa.nit}`, { align: "center" });
      doc.text(`Tel: ${datosEmpresa.telefono} | Email: ${datosEmpresa.email}`, {
        align: "center",
      });
      doc.text(`${datosEmpresa.direccion}`, { align: "center" });

      doc.moveTo(margin, doc.y + 10).lineTo(pageWidth - margin, doc.y + 10).stroke();
      doc.moveDown(0.5);

      // ===== TÍTULO Y NÚMERO =====
      doc.fontSize(16).font("Helvetica-Bold").text("COTIZACIÓN", { align: "center" });
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`No. ${cotizacion.numero}`, { align: "center" });
      doc.moveTo(margin, doc.y + 5).lineTo(pageWidth - margin, doc.y + 5).stroke();
      doc.moveDown(0.5);

      // ===== FILA: FECHA Y VIGENCIA =====
      const leftColX = margin;
      const rightColX = pageWidth / 2;

      doc.fontSize(10).font("Helvetica-Bold").text("Fecha:", leftColX, doc.y);
      doc
        .font("Helvetica")
        .text(new Date(cotizacion.fechaCreacion).toLocaleDateString("es-CO"), leftColX + 50);

      if (cotizacion.fechaVigencia) {
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .text("Válida hasta:", rightColX, doc.y - 14);
        doc
          .font("Helvetica")
          .text(
            new Date(cotizacion.fechaVigencia).toLocaleDateString("es-CO"),
            rightColX + 65
          );
      }

      doc.moveDown(1);

      // ===== INFORMACIÓN DEL CLIENTE =====
      doc.fontSize(11).font("Helvetica-Bold").text("INFORMACIÓN DEL CLIENTE");
      doc.moveTo(margin, doc.y + 2).lineTo(pageWidth - margin, doc.y + 2).stroke();
      doc.moveDown(0.3);

      doc.fontSize(9).font("Helvetica");
      const labelWidth = 100;
      const valueX = margin + labelWidth;

      doc.font("Helvetica-Bold").text("Nombre:", margin, doc.y);
      doc.font("Helvetica").text(cotizacion.clienteNombre, valueX, doc.y - 14);

      doc.moveDown(0.25);
      doc.font("Helvetica-Bold").text("Empresa:", margin, doc.y);
      doc.font("Helvetica").text(cotizacion.clienteEmpresa || "N/A", valueX, doc.y - 14);

      doc.moveDown(0.25);
      const docType = cotizacion.tipoDocumento || "NIT";
      const docNum = cotizacion.numeroDocumento || "N/A";
      doc.font("Helvetica-Bold").text(`${docType}:`, margin, doc.y);
      doc.font("Helvetica").text(docNum, valueX, doc.y - 14);

      doc.moveDown(0.25);
      doc.font("Helvetica-Bold").text("Teléfono:", margin, doc.y);
      doc.font("Helvetica").text(cotizacion.clienteTelefono || "N/A", valueX, doc.y - 14);

      doc.moveDown(0.25);
      doc.font("Helvetica-Bold").text("Email:", margin, doc.y);
      doc.font("Helvetica").text(cotizacion.clienteEmail || "N/A", valueX, doc.y - 14);

      doc.moveDown(0.25);
      doc.font("Helvetica-Bold").text("Dirección:", margin, doc.y);
      doc.font("Helvetica").text(cotizacion.clienteDireccion || "N/A", valueX, doc.y - 14);

      doc.moveDown(0.8);

      // ===== TABLA DE PRODUCTOS =====
      doc.fontSize(11).font("Helvetica-Bold").text("DETALLE DE PRODUCTOS");
      doc.moveTo(margin, doc.y + 2).lineTo(pageWidth - margin, doc.y + 2).stroke();
      doc.moveDown(0.3);

      // Encabezado tabla
      const tableHeaderY = doc.y;
      const col1 = margin;
      const col2 = margin + 60;
      const col3 = margin + 220;
      const col4 = margin + 300;
      const col5 = pageWidth - margin - 50;

      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Cant.", col1, tableHeaderY);
      doc.text("Descripción", col2, tableHeaderY);
      doc.text("P. Unitario", col3, tableHeaderY);
      doc.text("Descuento", col4, tableHeaderY);
      doc.text("Total", col5, tableHeaderY);

      doc.moveTo(margin, doc.y + 2).lineTo(pageWidth - margin, doc.y + 2).stroke();
      doc.moveDown(0.4);

      // Filas de productos
      doc.font("Helvetica").fontSize(9);
      cotizacion.lineas.forEach((linea: any) => {
        const cant = Number(linea.cantidad).toFixed(2);
        const precio = `$${Number(linea.precioUnitario).toLocaleString("es-CO")}`;
        const descuento = linea.descuentoPorcentaje
          ? `${linea.descuentoPorcentaje}%`
          : `$${Number(linea.descuentoValor).toLocaleString("es-CO")}`;
        const total = `$${Number(linea.subtotal).toLocaleString("es-CO")}`;

        doc.text(cant, col1, doc.y);
        doc.text(linea.producto.nombre, col2, doc.y - 14, { width: 150 });
        doc.text(precio, col3, doc.y + 14);
        doc.text(descuento, col4, doc.y);
        doc.text(total, col5, doc.y);

        doc.moveDown(0.6);
      });

      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
      doc.moveDown(0.4);

      // ===== TOTALES =====
      const totalsX = pageWidth - margin - 150;
      doc.fontSize(9).font("Helvetica");

      doc.text("Subtotal:", totalsX, doc.y);
      doc.text(
        `$${Number(cotizacion.subtotal).toLocaleString("es-CO")}`,
        totalsX + 80,
        doc.y - 14
      );

      doc.moveDown(0.25);
      if (Number(cotizacion.descuentoValor) > 0) {
        doc.text("Descuento:", totalsX, doc.y);
        doc.text(
          `-$${Number(cotizacion.descuentoValor).toLocaleString("es-CO")}`,
          totalsX + 80,
          doc.y - 14
        );
        doc.moveDown(0.25);
      }

      if (Number(cotizacion.impuestoValor) > 0) {
        doc.text(`IVA (${cotizacion.impuestoPorcentaje}%):`, totalsX, doc.y);
        doc.text(
          `$${Number(cotizacion.impuestoValor).toLocaleString("es-CO")}`,
          totalsX + 80,
          doc.y - 14
        );
        doc.moveDown(0.25);
      }

      doc.fontSize(12).font("Helvetica-Bold");
      doc.text("TOTAL:", totalsX, doc.y);
      doc.text(
        `$${Number(cotizacion.total).toLocaleString("es-CO")}`,
        totalsX + 80,
        doc.y - 16
      );

      doc.moveDown(1.5);

      // ===== NOTAS Y CONDICIONES =====
      if (cotizacion.comentarios || cotizacion.condicionesPago) {
        doc.fontSize(10).font("Helvetica-Bold").text("NOTAS Y CONDICIONES");
        doc.moveTo(margin, doc.y + 2).lineTo(pageWidth - margin, doc.y + 2).stroke();
        doc.moveDown(0.3);

        doc.fontSize(9).font("Helvetica");
        if (cotizacion.comentarios) {
          doc.text(cotizacion.comentarios);
          doc.moveDown(0.2);
        }
        if (cotizacion.condicionesPago) {
          doc.text(cotizacion.condicionesPago);
          doc.moveDown(0.2);
        }
      }

      // ===== FIRMA =====
      if (cotizacion.firmaBase64) {
        doc.moveDown(0.5);
        const imgX = pageWidth / 2 - 50;
        const imgY = doc.y;
        try {
          doc.image(cotizacion.firmaBase64, imgX, imgY, { width: 100, height: 50 });
          doc.moveDown(2.5);
          doc
            .fontSize(8)
            .font("Helvetica")
            .text("_________________________", imgX - 20, doc.y + 20, {
              width: 140,
              align: "center",
            });
          doc.text("Firma Autorizado", imgX - 20, doc.y, { width: 140, align: "center" });
        } catch (e) {
          // Ignore image errors
        }
      }

      // ===== PIE DE PÁGINA =====
      doc.fontSize(8).font("Helvetica").fillColor("#999");
      doc.text(
        `Generado el ${new Date().toLocaleString("es-CO")} | Cotización ${cotizacion.numero}`,
        margin,
        pageHeight - 30,
        { align: "center" }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
