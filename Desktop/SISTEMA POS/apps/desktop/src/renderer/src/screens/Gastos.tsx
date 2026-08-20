import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";

interface Gasto {
  id: string;
  categoria: string;
  descripcion: string | null;
  monto: string | number;
  fecha: string;
  sucursalId: string | null;
}

const CATEGORIAS = ["Arriendo", "Servicios", "Nomina", "Transporte", "Insumos", "Marketing", "Otro"];

export default function Gastos() {
  const { sucursales } = useSesionStore();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await api.get<Gasto[]>("/gastos");
    setGastos(data);
  }, []);

  async function eliminarGasto(id: string) {
    if (!window.confirm("¿Estás seguro que quieres eliminar este gasto? Esta acción no se puede deshacer.")) {
      return;
    }

    setEliminando(id);
    setMensajeError(null);
    try {
      await api.delete(`/gastos/${id}`);
      setGastos((prev) => prev.filter((g) => g.id !== id));
    } catch (err: any) {
      setMensajeError(mensajeError(err, "No se pudo eliminar el gasto"));
    } finally {
      setEliminando(null);
    }
  }

  useEffect(() => {
    cargar();
  }, [cargar]);

  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);

  const columnasGastos: ColumnaExport<Gasto>[] = [
    { encabezado: "Fecha", clave: "fecha", formato: (v) => new Date(v).toLocaleDateString("es-CO") },
    { encabezado: "Categoria", clave: "categoria" },
    { encabezado: "Descripcion", clave: "descripcion", formato: (v) => v ?? "" },
    { encabezado: "Sucursal", clave: "sucursalId", formato: (v) => sucursales.find((s) => s.id === v)?.nombre ?? "General" },
    { encabezado: "Monto", clave: "monto", formato: (v) => String(v) },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Gastos</h2>
          <p>Control de gastos operativos por categoria</p>
        </div>
        <div className="toolbar">
          <BotonesExportar nombreArchivo="gastos" titulo="Gastos" columnas={columnasGastos} filas={gastos} />
          <button onClick={() => setMostrarForm(true)} type="button">
            Nuevo gasto
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Gastos registrados</div>
          <div className="value">{gastos.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total gastado</div>
          <div className="value negative">${total.toLocaleString("es-CO")}</div>
        </div>
      </div>

      {mensajeError && (
        <div className="card" style={{ borderLeft: "4px solid var(--error)" }}>
          <p style={{ color: "var(--error)", margin: 0 }}>{mensajeError}</p>
        </div>
      )}

      <div className="card">
        {gastos.length === 0 ? (
          <p className="empty-state">No hay gastos registrados</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Categoria</th>
                <th>Descripcion</th>
                <th>Sucursal</th>
                <th>Monto</th>
                <th style={{ textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.fecha).toLocaleDateString("es-CO")}</td>
                  <td>
                    <span className="badge neutral">{g.categoria}</span>
                  </td>
                  <td>{g.descripcion ?? "-"}</td>
                  <td>{sucursales.find((s) => s.id === g.sucursalId)?.nombre ?? "-"}</td>
                  <td>${Number(g.monto).toLocaleString("es-CO")}</td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="danger"
                      style={{ padding: "4px 8px", fontSize: "12px" }}
                      onClick={() => eliminarGasto(g.id)}
                      disabled={eliminando === g.id}
                    >
                      {eliminando === g.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarForm && <NuevoGasto onClose={() => setMostrarForm(false)} onCreado={cargar} />}
    </div>
  );
}

function NuevoGasto({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const { sucursales, sucursalActivaId } = useSesionStore();
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [sucursalId, setSucursalId] = useState(sucursalActivaId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.post("/gastos", {
        categoria,
        descripcion: descripcion || undefined,
        monto: Number(monto),
        sucursalId: sucursalId || undefined,
      });
      onCreado();
      onClose();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo registrar el gasto"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Nuevo gasto</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descripcion
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </label>
          <label>
            Monto
            <input type="number" min={1} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </label>
          <label>
            Sucursal
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">General (toda la empresa)</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button className="secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
