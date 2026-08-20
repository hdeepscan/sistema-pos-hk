import { useState } from "react";
import { importarCSV, type ColumnaImport } from "./import";
import { IconoMas } from "./iconos";

export function BotonesImportar<T>({
  titulo,
  columnas,
  onImportar,
}: {
  titulo: string;
  columnas: ColumnaImport<T>[];
  onImportar: (filas: T[]) => Promise<void>;
}) {
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ exito: number; errores: number } | null>(null);

  async function manejarArchivo(archivo: File) {
    setImportando(true);
    setResultado(null);
    try {
      const filas = await importarCSV(archivo, columnas);
      await onImportar(filas);
      setResultado({ exito: filas.length, errores: 0 });
    } catch (err) {
      setResultado({ exito: 0, errores: 1 });
      console.error("Error importando:", err);
    } finally {
      setImportando(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    if (archivo) {
      manejarArchivo(archivo);
    }
  }

  return (
    <div className="toolbar">
      <label>
        <input
          type="file"
          accept=".csv"
          disabled={importando}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="primary"
          disabled={importando}
          onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement)?.click()}
        >
          <IconoMas /> {importando ? "Importando..." : "Importar CSV"}
        </button>
      </label>
      {resultado && (
        <div style={{ marginLeft: 12, fontSize: 12, color: resultado.errores > 0 ? "#dc2626" : "#059669" }}>
          {resultado.exito > 0 && `✓ ${resultado.exito} producto(s) importado(s)`}
          {resultado.errores > 0 && ` • ✕ ${resultado.errores} error(es)`}
        </div>
      )}
    </div>
  );
}
