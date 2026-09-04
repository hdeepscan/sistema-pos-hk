import { useState } from "react";
import { exportarExcel, exportarPDF, exportarCSV, type ColumnaExport } from "./export";

export function BotonesExportar<T>({
  nombreArchivo,
  titulo,
  columnas,
  filas,
}: {
  nombreArchivo: string;
  titulo: string;
  columnas: ColumnaExport<T>[];
  filas: T[];
}) {
  const [exportando, setExportando] = useState<"xlsx" | "pdf" | "csv" | null>(null);

  async function ejecutar(tipo: "xlsx" | "pdf" | "csv") {
    setExportando(tipo);
    try {
      if (tipo === "xlsx") await exportarExcel(nombreArchivo, columnas, filas);
      else if (tipo === "pdf") await exportarPDF(nombreArchivo, titulo, columnas, filas);
      else await exportarCSV(nombreArchivo, columnas, filas);
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="toolbar">
      <button className="secondary" type="button" disabled={filas.length === 0 || exportando !== null} onClick={() => ejecutar("xlsx")}>
        {exportando === "xlsx" ? "Exportando..." : "Excel"}
      </button>
      <button className="secondary" type="button" disabled={filas.length === 0 || exportando !== null} onClick={() => ejecutar("pdf")}>
        {exportando === "pdf" ? "Exportando..." : "PDF"}
      </button>
      <button className="secondary" type="button" disabled={filas.length === 0 || exportando !== null} onClick={() => ejecutar("csv")}>
        {exportando === "csv" ? "Exportando..." : "CSV"}
      </button>
    </div>
  );
}
