import PDFDocument from "pdfkit";
import type { Cotizacion, LineaCotizacion, Producto } from "@prisma/client";

type CotizacionConLineas = Cotizacion & {
  lineas: (LineaCotizacion & { producto: Producto })[];
};

export async function generarPDFCotizacion(
  cotizacion: CotizacionConLineas,
  datosEmpresa: {
    nombre: string;
    nit?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    logo?: string;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
    });

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Encabezado
    doc.fontSize(24).font("Helvetica-Bold").text(datosEmpresa.nombre, { align: "center" });
    doc.fontSize(10)
      .font("Helvetica")
      .text(`NIT: ${datosEmpresa.nit || "N/A"}`, { align: "center" });
    doc.text(`${datosEmpresa.telefono || ""} | ${datosEmpresa.email || ""}`, { align: "center" });
    doc.text(datosEmpresa.direccion || "", { align: "center" });

    doc.moveTo(40, doc.y + 10).lineTo(555, doc.y + 10).stroke();
    doc.moveDown(2);

    // Título
    doc.fontSize(18).font("Helvetica-Bold").text("COTIZACIÓN", { align: "center" });
    doc.moveDown(1);

    // Datos de cotización
    const y1 = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").text("Número:", 50);
    doc.font("Helvetica").text(cotizacion.numero, 150);

    doc.fontSize(10).font("Helvetica-Bold").text("Fecha:", 50, y1);
    doc.font("Helvetica").text(cotizacion.fechaCreacion.toLocaleDateString("es-CO"), 150, y1);

    if (cotizacion.fechaVigencia) {
      doc.fontSize(10).font("Helvetica-Bold").text("Vigencia hasta:", 300, y1);
      doc.font("Helvetica").text(cotizacion.fechaVigencia.toLocaleDateString("es-CO"), 400, y1);
    }

    doc.moveDown(2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Datos del cliente
    doc.fontSize(10).font("Helvetica-Bold").text("INFORMACIÓN DEL CLIENTE");
    doc.fontSize(9).font("Helvetica");
    doc.text(`Nombre: ${cotizacion.clienteNombre}`);
    doc.text(`Empresa: ${cotizacion.clienteEmpresa || "N/A"}`);
    doc.text(`Teléfono: ${cotizacion.clienteTelefono || "N/A"}`);
    doc.text(`Email: ${cotizacion.clienteEmail || "N/A"}`);
    if (cotizacion.clienteDireccion) {
      doc.text(`Dirección: ${cotizacion.clienteDireccion}`);
    }

    doc.moveDown(1.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Tabla de productos
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 250;
    const col3 = 350;
    const col4 = 430;
    const col5 = 520;

    // Encabezados
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Cantidad", col1, tableTop);
    doc.text("Descripción", col2, tableTop);
    doc.text("Precio Unit.", col3, tableTop);
    doc.text("Descuento", col4, tableTop);
    doc.text("Total", col5, tableTop, { align: "right" });

    doc.moveTo(40, tableTop + 15).lineTo(555, tableTop + 15).stroke();

    // Líneas
    let y = tableTop + 25;
    doc.fontSize(8).font("Helvetica");

    cotizacion.lineas.forEach((linea) => {
      const cantidad = Number(linea.cantidad).toFixed(2);
      const precio = Number(linea.precioUnitario).toLocaleString("es-CO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const descuento =
        linea.descuentoPorcentaje > 0
          ? `${linea.descuentoPorcentaje.toFixed(1)}%`
          : `$${Number(linea.descuentoValor).toLocaleString("es-CO", {
              minimumFractionDigits: 2,
            })}`;
      const total = Number(linea.subtotal).toLocaleString("es-CO", {
        minimumFractionDigits: 2,
      });

      doc.text(cantidad, col1, y);
      doc.text(linea.producto.nombre, col2, y, { width: 80 });
      doc.text(precio, col3, y);
      doc.text(descuento, col4, y);
      doc.text(`$${total}`, col5, y, { align: "right" });

      y += 20;
    });

    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 10;

    // Totales
    doc.fontSize(9).font("Helvetica");
    doc.text("Subtotal:", 350, y);
    doc.text(
      `$${Number(cotizacion.subtotal).toLocaleString("es-CO", {
        minimumFractionDigits: 2,
      })}`,
      520,
      y,
      { align: "right" }
    );

    if (cotizacion.descuentoValor > 0) {
      y += 15;
      doc.text("Descuento:", 350, y);
      doc.text(
        `$${Number(cotizacion.descuentoValor).toLocaleString("es-CO", {
          minimumFractionDigits: 2,
        })}`,
        520,
        y,
        { align: "right" }
      );
    }

    if (cotizacion.impuestoValor > 0) {
      y += 15;
      doc.text(`IVA (${cotizacion.impuestoPorcentaje}%):`, 350, y);
      doc.text(
        `$${Number(cotizacion.impuestoValor).toLocaleString("es-CO", {
          minimumFractionDigits: 2,
        })}`,
        520,
        y,
        { align: "right" }
      );
    }

    y += 15;
    doc.fontSize(11).font("Helvetica-Bold");
    doc.text("TOTAL:", 350, y);
    doc.text(
      `$${Number(cotizacion.total).toLocaleString("es-CO", {
        minimumFractionDigits: 2,
      })}`,
      520,
      y,
      { align: "right" }
    );

    doc.moveDown(3);

    // Notas y condiciones
    if (cotizacion.comentarios || cotizacion.condicionesPago) {
      doc.fontSize(9).font("Helvetica-Bold").text("NOTAS Y CONDICIONES");
      doc.fontSize(8).font("Helvetica");
      if (cotizacion.comentarios) {
        doc.text(cotizacion.comentarios);
      }
      if (cotizacion.condicionesPago) {
        doc.text(cotizacion.condicionesPago);
      }
    }

    doc.moveDown(2);
    doc.fontSize(7).font("Helvetica").text("Generado automáticamente por Sistema POS", {
      align: "center",
    });
    doc.text(`Cotización ${cotizacion.numero} - ${new Date().toLocaleString("es-CO")}`, {
      align: "center",
    });

    doc.end();
  });
}
