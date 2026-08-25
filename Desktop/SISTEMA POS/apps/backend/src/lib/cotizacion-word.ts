import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, AlignmentType } from "docx";

type CotizacionConLineas = any;

export async function generarWordCotizacion(
  cotizacion: CotizacionConLineas,
  datosEmpresa: any
): Promise<Buffer> {
  const filas = cotizacion.lineas.map((linea: any) =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph(String(Number(linea.cantidad).toFixed(2)))],
        }),
        new TableCell({
          children: [new Paragraph(linea.producto.nombre)],
        }),
        new TableCell({
          children: [
            new Paragraph(
              `$${Number(linea.precioUnitario).toLocaleString("es-CO", {
                minimumFractionDigits: 2,
              })}`
            ),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph(
              Number(linea.descuentoPorcentaje) > 0
                ? `${Number(linea.descuentoPorcentaje).toFixed(1)}%`
                : `$${Number(linea.descuentoValor).toLocaleString("es-CO", {
                    minimumFractionDigits: 2,
                  })}`
            ),
          ],
        }),
        new TableCell({
          children: [
            new Paragraph(
              `$${Number(linea.subtotal).toLocaleString("es-CO", {
                minimumFractionDigits: 2,
              })}`
            ),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: datosEmpresa.nombre,
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 100 },
          } as any),
          new Paragraph({
            text: `NIT: ${datosEmpresa.nit || "N/A"} | ${datosEmpresa.telefono || ""} | ${datosEmpresa.email || ""}`,
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 50 },
          } as any),
          new Paragraph({
            text: datosEmpresa.direccion || "",
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 200 },
          } as any),
          new Paragraph({
            text: "COTIZACIÓN",
            alignment: AlignmentType.CENTER,
            spacing: { line: 240, after: 200 },
          } as any),
          new Table({
            width: { size: 100, type: "pct" },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Número: " + cotizacion.numero)],
                  }),
                  new TableCell({
                    children: [new Paragraph("Fecha: " + cotizacion.fechaCreacion.toLocaleDateString("es-CO"))],
                  }),
                ],
              }),
            ],
          } as any),
          new Paragraph({ text: "", spacing: { after: 200 } }),
          new Paragraph({
            text: "INFORMACIÓN DEL CLIENTE",
            spacing: { after: 100 },
          } as any),
          new Paragraph(`Nombre: ${cotizacion.clienteNombre}`),
          new Paragraph(`Empresa: ${cotizacion.clienteEmpresa || "N/A"}`),
          new Paragraph(`Teléfono: ${cotizacion.clienteTelefono || "N/A"}`),
          new Paragraph(`Email: ${cotizacion.clienteEmail || "N/A"}`),
          ...(cotizacion.clienteDireccion ? [new Paragraph(`Dirección: ${cotizacion.clienteDireccion}`)] : []),
          new Paragraph({ text: "", spacing: { after: 200 } }),
          new Table({
            width: { size: 100, type: "pct" },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Cantidad")] }),
                  new TableCell({ children: [new Paragraph("Descripción")] }),
                  new TableCell({ children: [new Paragraph("Precio Unit.")] }),
                  new TableCell({ children: [new Paragraph("Descuento")] }),
                  new TableCell({ children: [new Paragraph("Total")] }),
                ],
              }),
              ...filas,
            ],
          } as any),
          new Paragraph({ text: "", spacing: { after: 200 } }),
          new Table({
            width: { size: 50, type: "pct" },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Subtotal:")] }),
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
              ...(Number(cotizacion.descuentoValor) > 0
                ? [
                    new TableRow({
                      children: [
                        new TableCell({ children: [new Paragraph("Descuento:")] }),
                        new TableCell({
                          children: [
                            new Paragraph(
                              `$${Number(cotizacion.descuentoValor).toLocaleString("es-CO", {
                                minimumFractionDigits: 2,
                              })}`
                            ),
                          ],
                        }),
                      ],
                    }),
                  ]
                : []),
              ...(Number(cotizacion.impuestoValor) > 0
                ? [
                    new TableRow({
                      children: [
                        new TableCell({
                          children: [new Paragraph(`IVA (${cotizacion.impuestoPorcentaje}%):`)],
                        }),
                        new TableCell({
                          children: [
                            new Paragraph(
                              `$${Number(cotizacion.impuestoValor).toLocaleString("es-CO", {
                                minimumFractionDigits: 2,
                              })}`
                            ),
                          ],
                        }),
                      ],
                    }),
                  ]
                : []),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("TOTAL:")] }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        `$${Number(cotizacion.total).toLocaleString("es-CO", {
                          minimumFractionDigits: 2,
                        })}`
                      ),
                    ],
                  }),
                ],
              }),
            ],
          } as any),
          new Paragraph({ text: "", spacing: { after: 300 } }),
          ...(cotizacion.comentarios || cotizacion.condicionesPago
            ? [
                new Paragraph({
                  text: "NOTAS Y CONDICIONES",
                  spacing: { after: 100 },
                } as any),
                ...(cotizacion.comentarios ? [new Paragraph(cotizacion.comentarios)] : []),
                ...(cotizacion.condicionesPago ? [new Paragraph(cotizacion.condicionesPago)] : []),
              ]
            : []),
          new Paragraph({ text: "", spacing: { after: 200 } }),
          new Paragraph({
            text: `Generado automáticamente - Cotización ${cotizacion.numero}`,
            alignment: AlignmentType.CENTER,
          } as any),
        ],
      },
    ],
  } as any);

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
