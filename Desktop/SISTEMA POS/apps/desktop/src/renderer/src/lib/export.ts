import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { bufferABase64, textoABase64 } from "./base64";

export interface ColumnaExport<T = any> {
  encabezado: string;
  clave: keyof T & string;
  formato?: (valor: any, fila: T) => string;
}

function valorFila<T>(col: ColumnaExport<T>, fila: T): string {
  const crudo = (fila as any)[col.clave];
  if (col.formato) return col.formato(crudo, fila);
  return crudo === null || crudo === undefined ? "" : String(crudo);
}

function escaparCsv(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

export async function exportarExcel<T>(nombreArchivo: string, columnas: ColumnaExport<T>[], filas: T[]) {
  const datos = filas.map((fila) => {
    const obj: Record<string, string> = {};
    for (const c of columnas) obj[c.encabezado] = valorFila(c, fila);
    return obj;
  });
  const hoja = XLSX.utils.json_to_sheet(datos, { header: columnas.map((c) => c.encabezado) });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Datos");
  const arrayBuffer = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  await window.pos.guardarArchivo({
    nombreSugerido: `${nombreArchivo}.xlsx`,
    contenidoBase64: bufferABase64(arrayBuffer),
  });
}

export async function exportarCSV<T>(nombreArchivo: string, columnas: ColumnaExport<T>[], filas: T[]) {
  const encabezado = columnas.map((c) => escaparCsv(c.encabezado)).join(",");
  const cuerpo = filas.map((fila) => columnas.map((c) => escaparCsv(valorFila(c, fila))).join(","));
  const contenido = [encabezado, ...cuerpo].join("\n");
  await window.pos.guardarArchivo({
    nombreSugerido: `${nombreArchivo}.csv`,
    contenidoBase64: textoABase64(contenido),
  });
}

export async function exportarPDF<T>(
  nombreArchivo: string,
  titulo: string,
  columnas: ColumnaExport<T>[],
  filas: T[]
) {
  const doc = new jsPDF({ orientation: columnas.length > 5 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(titulo, 14, 16);
  autoTable(doc, {
    startY: 22,
    head: [columnas.map((c) => c.encabezado)],
    body: filas.map((fila) => columnas.map((c) => valorFila(c, fila))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 70, 229] },
  });
  const arrayBuffer = doc.output("arraybuffer");
  await window.pos.guardarArchivo({
    nombreSugerido: `${nombreArchivo}.pdf`,
    contenidoBase64: bufferABase64(arrayBuffer),
  });
}
