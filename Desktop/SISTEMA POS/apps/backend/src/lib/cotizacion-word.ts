import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  AlignmentType,
  BorderStyle,
  UnderlineType,
} from "docx";
import type { Cotizacion, LineaCotizacion, Producto } from "@prisma/client";

type CotizacionConLineas = Cotizacion & {
  lineas: (LineaCotizacion & { producto: Producto })[];
};

export async function generarWordCotizacion(
  cotizacion: CotizacionConLineas,
  datosEmpresa: {
    nombre: string;
    nit?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
  }
): Promise<Buffer> {
  const filas = cotizacion.lineas.map(
    (linea) =>
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                text: Number(linea.cantidad).toFixed(2),
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
          new TableCell({
            children: [new Paragraph(linea.producto.nombre)],
          }),
          new TableCell({
            children: [
              new Paragraph({
                text: `$${Number(linea.precioUnitario).toLocaleString("es-CO", {
                  minimumFractionDigits: 2,
                })}`,
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                text:
                  linea.descuentoPorcentaje > 0
                    ? `${linea.descuentoPorcentaje.toFixed(1)}%`
                    : `$${Number(linea.descuentoValor).toLocaleString("es-CO", {
                        minimumFractionDigits: 2,
                      })}`,
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                text: `$${Number(linea.subtotal).toLocaleString("es-CO", {
                  minimumFractionDigits: 2,
                })}`,
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          // Encabezado
          new Paragraph({
            text: datosEmpresa.nombre,
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 100 },
            style: "Heading1",
          }),
          new Paragraph({
            text: `NIT: ${datosEmpresa.nit || "N/A"} | ${datosEmpresa.telefono || ""} | ${datosEmpresa.email || ""}`,
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 50 },
            size: 18,
          }),
          new Paragraph({
            text: datosEmpresa.direccion || "",
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 200 },
            size: 18,
          }),

          // Título
          new Paragraph({
            text: "COTIZACIÓN",
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 200 },
            style: "Heading2",
          }),

          // Datos de cotización
          new Table({
            width: { size: 100, type: "pct" },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph(new TextRun({ text: "Número:", bold: true }))],
                  }),
                  new TableCell({
                    children: [new Paragraph(cotizacion.numero)],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(new TextRun({ text: "Fecha:", bold: true })),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        cotizacion.fechaCreacion.toLocaleDateString("es-CO")
                      ),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Información del cliente
          new Paragraph({
            text: "INFORMACIÓN DEL CLIENTE",
            spacing: { after: 100 },
            style: "Heading3",
          }),
          new Paragraph(`Nombre: ${cotizacion.clienteNombre}`),
          new Paragraph(`Empresa: ${cotizacion.clienteEmpresa || "N/A"}`),
          new Paragraph(`Teléfono: ${cotizacion.clienteTelefono || "N/A"}`),
          new Paragraph(`Email: ${cotizacion.clienteEmail || "N/A"}`),
          ...(cotizacion.clienteDireccion
            ? [new Paragraph(`Dirección: ${cotizacion.clienteDireccion}`)]
            : []),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Tabla de productos
          new Table({
            width: { size: 100, type: "pct" },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph(
                        new TextRun({
                          text: "Cantidad",
                          bold: true,
                        })
                      ),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        new TextRun({
                          text: "Descripción",
                          bold: true,
                        })
                      ),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        new TextRun({
                          text: "Precio Unit.",
                          bold: true,
                        })
                      ),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        new TextRun({
                          text: "Descuento",
                          bold: true,
                        })
                      ),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        new TextRun({
                          text: "Total",
                          bold: true,
                        })
                      ),
                    ],
                  }),
                ],
              }),
              ...filas,
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // Totales
          new Table({
            width: { size: 50, type: "pct" },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph(new TextRun({ text: "Subtotal:", bold: true }))],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        `$${Number(cotizacion.subtotal).toLocaleString("es-CO", {
                          minimumFractionDigits: 2,
                        })}`
                      ),
                    ],
                  }),
                ],
              }),
              ...(cotizacion.descuentoValor > 0
                ? [
                    new TableRow({
                      children: [
                        new TableCell({
                          children: [
                            new Paragraph(
                              new TextRun({ text: "Descuento:", bold: true })
                            ),
                          ],
                        }),
                        new TableCell({
                          children: [
                            new Paragraph(
                              `$${Number(cotizacion.descuentoValor).toLocaleString(
                                "es-CO",
                                {
                                  minimumFractionDigits: 2,
                                }
                              )}`
                            ),
                          ],
                        }),
                      ],
                    }),
                  ]
                : []),
              ...(cotizacion.impuestoValor > 0
                ? [
                    new TableRow({
                      children: [
                        new TableCell({
                          children: [
                            new Paragraph(
                              new TextRun({
                                text: `IVA (${cotizacion.impuestoPorcentaje}%):`,
                                bold: true,
                              })
                            ),
                          ],
                        }),
                        new TableCell({
                          children: [
                            new Paragraph(
                              `$${Number(cotizacion.impuestoValor).toLocaleString(
                                "es-CO",
                                {
                                  minimumFractionDigits: 2,
                                }
                              )}`
                            ),
                          ],
                        }),
                      ],
                    }),
                  ]
                : []),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph(
                        new TextRun({
                          text: "TOTAL:",
                          bold: true,
                          size: 24,
                        })
                      ),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        new TextRun({
                          text: `$${Number(cotizacion.total).toLocaleString("es-CO", {
                            minimumFractionDigits: 2,
                          })}`,
                          bold: true,
                          size: 24,
                        })
                      ),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { after: 300 } }),

          // Notas y condiciones
          ...(cotizacion.comentarios || cotizacion.condicionesPago
            ? [
                new Paragraph({
                  text: "NOTAS Y CONDICIONES",
                  style: "Heading3",
                  spacing: { after: 100 },
                }),
                ...(cotizacion.comentarios ? [new Paragraph(cotizacion.comentarios)] : []),
                ...(cotizacion.condicionesPago ? [new Paragraph(cotizacion.condicionesPago)] : []),
              ]
            : []),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          new Paragraph({
            text: `Generado automáticamente - Cotización ${cotizacion.numero} - ${new Date().toLocaleString("es-CO")}`,
            alignment: AlignmentType.CENTER,
            size: 14,
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
