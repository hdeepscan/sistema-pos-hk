import { useState, useRef } from "react";
import { importarCSV, type ColumnaImport } from "./import";
import { api } from "./api";
import { mensajeError } from "./errores";

interface ProductoImportacion {
  sku: string;
  nombre: string;
  categoria?: string;
  precio?: number;
  costo?: number;
  codigoBarras?: string;
}

const COLUMNAS: ColumnaImport<ProductoImportacion>[] = [
  { encabezado: "SKU", clave: "sku", requerido: true },
  { encabezado: "Producto", clave: "nombre", requerido: true },
  { encabezado: "Categoria", clave: "categoria", tipo: "string", requerido: false },
  { encabezado: "Precio", clave: "precio", tipo: "number", requerido: false },
  { encabezado: "Costo", clave: "costo", tipo: "number", requerido: false },
  { encabezado: "Codigo de barras", clave: "codigoBarras", tipo: "string", requerido: false },
];

export function ModalImportarProductos({
  abierto,
  onCerrar,
  onSuccess,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onSuccess: () => void;
}) {
  const [importando, setImportando] = useState(false);
  const [paso, setPaso] = useState<"seleccionar" | "revisar" | "resultado">("seleccionar");
  const [productosParaImportar, setProductosParaImportar] = useState<ProductoImportacion[]>([]);
  const [resultado, setResultado] = useState<{ creados: number; actualizados: number; errores: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function manejarArchivo(archivo: File) {
    setImportando(true);
    try {
      const datos = await importarCSV(archivo, COLUMNAS);
      setProductosParaImportar(datos);
      setPaso("revisar");
    } catch (err) {
      mensajeError("Error leyendo el CSV: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportando(false);
    }
  }

  async function confirmarImportacion() {
    setImportando(true);
    try {
      const res = await api.post("/productos/importar", {
        productos: productosParaImportar,
      });
      setResultado(res.data);
      setPaso("resultado");
      setTimeout(() => {
        onSuccess();
        onCerrar();
      }, 2000);
    } catch (err) {
      mensajeError("Error importando productos: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportando(false);
    }
  }

  if (!abierto) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && paso !== "resultado") onCerrar();
      }}
    >
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2>Importar productos</h2>
          <button className="close" onClick={onCerrar} disabled={importando}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {paso === "seleccionar" && (
            <div style={{ textAlign: "center", padding: "24px" }}>
              <p style={{ marginBottom: 16, color: "#666" }}>
                Este archivo CSV actualiza los productos existentes por SKU. Los SKUs nuevos se crean como nuevos productos.
              </p>
              <div
                style={{
                  border: "2px dashed #d1d5db",
                  borderRadius: 8,
                  padding: 32,
                  marginBottom: 16,
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv"
                  disabled={importando}
                  onChange={(e) => {
                    const archivo = e.target.files?.[0];
                    if (archivo) manejarArchivo(archivo);
                  }}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => inputRef.current?.click()}
                  disabled={importando}
                  style={{ marginBottom: 8 }}
                >
                  {importando ? "Leyendo..." : "Seleccionar archivo CSV"}
                </button>
                <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#999" }}>o arrastra un archivo aquí</p>
              </div>
              <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
                El CSV debe tener columnas: SKU, Producto, Categoria, Precio, Costo, Codigo de barras
              </p>
            </div>
          )}

          {paso === "revisar" && (
            <div>
              <p style={{ marginBottom: 12, color: "#666" }}>
                Se importarán {productosParaImportar.length} producto(s). Revisa los datos antes de confirmar:
              </p>
              <div
                style={{
                  maxHeight: 300,
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <table style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: 4, fontWeight: 600 }}>SKU</th>
                      <th style={{ textAlign: "left", padding: 4, fontWeight: 600 }}>Producto</th>
                      <th style={{ textAlign: "left", padding: 4, fontWeight: 600 }}>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosParaImportar.slice(0, 20).map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: 4, fontFamily: "monospace", fontSize: 11 }}>{p.sku}</td>
                        <td style={{ padding: 4 }}>{p.nombre}</td>
                        <td style={{ padding: 4 }}>${p.precio?.toFixed(2) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {productosParaImportar.length > 20 && (
                  <p style={{ padding: 8, textAlign: "center", color: "#999", fontSize: 11 }}>
                    ... y {productosParaImportar.length - 20} más
                  </p>
                )}
              </div>
            </div>
          )}

          {paso === "resultado" && resultado && (
            <div style={{ textAlign: "center", padding: "16px" }}>
              <p style={{ fontSize: 14, marginBottom: 12 }}>
                <span style={{ fontSize: 20, marginRight: 8 }}>✓</span>
                Importación completada
              </p>
              <div style={{ background: "#f0fdf4", padding: 12, borderRadius: 6, marginBottom: 12 }}>
                <p style={{ margin: "4px 0", color: "#16a34a" }}>
                  <strong>{resultado.creados}</strong> producto(s) creado(s)
                </p>
                <p style={{ margin: "4px 0", color: "#16a34a" }}>
                  <strong>{resultado.actualizados}</strong> producto(s) actualizado(s)
                </p>
              </div>
              {resultado.errores.length > 0 && (
                <div style={{ background: "#fef2f2", padding: 12, borderRadius: 6 }}>
                  <p style={{ margin: "4px 0", color: "#991b1b", fontSize: 12 }}>
                    <strong>{resultado.errores.length}</strong> error(es):
                  </p>
                  <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 11, color: "#991b1b" }}>
                    {resultado.errores.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {paso === "seleccionar" && (
            <button className="secondary" onClick={onCerrar} disabled={importando}>
              Cancelar
            </button>
          )}

          {paso === "revisar" && (
            <>
              <button className="secondary" onClick={() => setPaso("seleccionar")} disabled={importando}>
                Volver
              </button>
              <button className="primary" onClick={confirmarImportacion} disabled={importando}>
                {importando ? "Importando..." : "Confirmar importación"}
              </button>
            </>
          )}

          {paso === "resultado" && (
            <button className="primary" onClick={onCerrar} disabled={importando}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
