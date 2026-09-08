import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TrendingDown, Briefcase, Wallet, Plus, XCircle, Trash2, DollarSign } from "lucide-react";

const styles = `
  .gastos-container { min-height: 100vh; background: #FFFFFF; padding: 32px; }
  .gastos-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
  .gastos-title { font-size: 28px; font-weight: 700; color: #0f172a; margin: 0; }

  .gastos-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .gastos-kpi-card { background: #FFFFFF; border: 1px solid rgba(59, 130, 246, 0.08); border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
  .gastos-kpi-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  .gastos-kpi-value { font-size: 26px; font-weight: 800; color: #1e293b; }
  .gastos-kpi-icon { color: #64748b; }

  .gastos-tabs { display: flex; gap: 16px; margin-bottom: 32px; border-bottom: 2px solid #e2e8f0; }
  .gastos-tab { padding: 12px 24px; font-size: 14px; font-weight: 600; background: none; border: none; cursor: pointer; color: #64748b; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
  .gastos-tab:hover { color: #3B82F6; }
  .gastos-tab.active { color: #3B82F6; border-bottom-color: #3B82F6; }

  .gastos-toolbar { display: flex; gap: 12px; margin-bottom: 24px; }
  .gastos-btn { padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; transition: all 0.2s; }
  .gastos-btn-primary { background: #3B82F6; color: white; }
  .gastos-btn-primary:hover { background: #2563EB; transform: translateY(-2px); }
  .gastos-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .gastos-table { width: 100%; border-collapse: collapse; }
  .gastos-table th { padding: 14px 16px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; font-weight: 700; color: #1e293b; font-size: 13px; }
  .gastos-table td { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; }

  .gastos-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .gastos-badge-costo { background: #cffafe; color: #0c4a6e; }
  .gastos-badge-gasto { background: #fed7aa; color: #7c2d12; }

  .form-input { width: 100%; height: 42px; padding: 0.5rem 1rem; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
  .form-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
  .form-select { width: 100%; height: 42px; padding: 0.5rem 1rem; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
  .form-select:focus { border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

  .gastos-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .gastos-modal-content { background: white; border-radius: 16px; padding: 32px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
  .gastos-modal-close { position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; padding: 0; }

  .gastos-toggle { display: flex; gap: 12px; margin-bottom: 24px; }
  .gastos-toggle-btn { flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; background: white; cursor: pointer; font-weight: 600; text-align: center; transition: all 0.2s; }
  .gastos-toggle-btn:hover { border-color: #3B82F6; }
  .gastos-toggle-btn.active { border-color: #3B82F6; background: #eff6ff; color: #3B82F6; }

  .gastos-form-group { margin-bottom: 16px; }
  .gastos-form-label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 600; color: #64748b; }

  .gastos-action-btn { color: #dc2626; cursor: pointer; border: none; background: none; padding: 4px 8px; }
  .gastos-action-btn:hover { background: #fee2e2; border-radius: 4px; }
`;

const CATEGORIAS_COSTO = ["Insumos", "Materia Prima", "Fletes de Mercancía", "Empaques"];
const CATEGORIAS_GASTO = ["Nómina", "Arriendo", "Servicios Públicos", "Marketing", "Transporte/Viáticos", "Administrativo"];

interface GastoItem {
  id: string;
  categoria: string;
  descripcion?: string;
  monto: number;
  clasificacion: string;
  metodoPago: string;
  fecha: string;
}

export default function Gastos() {
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [tab, setTab] = useState("todos");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [totalCostos, setTotalCostos] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [form, setForm] = useState({
    clasificacion: "GASTO",
    categoria: "",
    descripcion: "",
    monto: "",
    metodoPago: "EFECTIVO",
  });

  useEffect(() => {
    cargarGastos();
  }, []);

  async function cargarGastos() {
    try {
      const { data } = await api.get("/gastos");
      setGastos(data.gastos || []);
      setTotalCostos(data.totalCostos || 0);
      setTotalGastos(data.totalGastos || 0);
    } catch (error) {
      console.error("Error al cargar gastos:", error);
    }
  }

  async function guardarGasto() {
    if (!form.categoria || !form.monto) {
      alert("Completa todos los campos requeridos");
      return;
    }
    try {
      setLoading(true);
      await api.post("/gastos", {
        categoria: form.categoria,
        descripcion: form.descripcion || null,
        monto: parseFloat(form.monto),
        clasificacion: form.clasificacion,
        metodoPago: form.metodoPago,
      });
      setForm({ clasificacion: "GASTO", categoria: "", descripcion: "", monto: "", metodoPago: "EFECTIVO" });
      setMostrarModal(false);
      await cargarGastos();
    } catch (error) {
      alert("Error al guardar gasto");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function eliminarGasto(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    try {
      await api.delete(`/gastos/${id}`);
      await cargarGastos();
    } catch (error) {
      alert("Error al eliminar");
    }
  }

  const gastosFilterados = gastos.filter((g) => {
    if (tab === "costos") return g.clasificacion === "COSTO";
    if (tab === "gastos") return g.clasificacion === "GASTO";
    return true;
  });

  const categorias = form.clasificacion === "COSTO" ? CATEGORIAS_COSTO : CATEGORIAS_GASTO;

  return (
    <div className="gastos-container">
      <style>{styles}</style>

      <div className="gastos-header">
        <Briefcase size={32} style={{ color: "#3B82F6" }} />
        <h1 className="gastos-title">Centro de Costos y Gastos</h1>
      </div>

      {/* KPIs */}
      <div className="gastos-kpi-grid">
        <div className="gastos-kpi-card">
          <div className="gastos-kpi-label">
            <DollarSign size={16} className="gastos-kpi-icon" />
            Total Salidas
          </div>
          <div className="gastos-kpi-value">${(totalCostos + totalGastos).toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="gastos-kpi-card">
          <div className="gastos-kpi-label">
            <Briefcase size={16} className="gastos-kpi-icon" />
            Total Costos
          </div>
          <div className="gastos-kpi-value">${totalCostos.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="gastos-kpi-card">
          <div className="gastos-kpi-label">
            <TrendingDown size={16} className="gastos-kpi-icon" />
            Total Gastos
          </div>
          <div className="gastos-kpi-value">${totalGastos.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="gastos-tabs">
        <button className={`gastos-tab ${tab === "todos" ? "active" : ""}`} onClick={() => setTab("todos")}>
          Todos
        </button>
        <button className={`gastos-tab ${tab === "costos" ? "active" : ""}`} onClick={() => setTab("costos")}>
          Solo Costos
        </button>
        <button className={`gastos-tab ${tab === "gastos" ? "active" : ""}`} onClick={() => setTab("gastos")}>
          Solo Gastos
        </button>
      </div>

      {/* Toolbar */}
      <div className="gastos-toolbar">
        <button className="gastos-btn gastos-btn-primary" onClick={() => setMostrarModal(true)}>
          <Plus size={16} /> Nuevo Registro
        </button>
      </div>

      {/* Tabla */}
      <table className="gastos-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Categoría</th>
            <th>Descripción</th>
            <th>Monto</th>
            <th>Método Pago</th>
            <th>Fecha</th>
            <th style={{ width: "60px" }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {gastosFilterados.map((g) => (
            <tr key={g.id}>
              <td>
                <span className={`gastos-badge ${g.clasificacion === "COSTO" ? "gastos-badge-costo" : "gastos-badge-gasto"}`}>
                  {g.clasificacion}
                </span>
              </td>
              <td>{g.categoria}</td>
              <td>{g.descripcion || "-"}</td>
              <td>${g.monto.toLocaleString("es-CO")}</td>
              <td>{g.metodoPago}</td>
              <td>{new Date(g.fecha).toLocaleDateString("es-CO")}</td>
              <td>
                <button className="gastos-action-btn" onClick={() => eliminarGasto(g.id)} title="Eliminar">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {gastosFilterados.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
          <Briefcase size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
          <p>No hay registros en esta categoría</p>
        </div>
      )}

      {/* Modal */}
      {mostrarModal && (
        <div className="gastos-modal" onClick={() => !loading && setMostrarModal(false)}>
          <div className="gastos-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="gastos-modal-close" onClick={() => !loading && setMostrarModal(false)} title="Cerrar">
              <XCircle size={24} />
            </button>

            <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Nuevo Registro</h2>

            {/* Toggle Clasificación */}
            <div className="gastos-toggle">
              <button
                className={`gastos-toggle-btn ${form.clasificacion === "COSTO" ? "active" : ""}`}
                onClick={() => setForm({ ...form, clasificacion: "COSTO", categoria: "" })}
              >
                Costo
              </button>
              <button
                className={`gastos-toggle-btn ${form.clasificacion === "GASTO" ? "active" : ""}`}
                onClick={() => setForm({ ...form, clasificacion: "GASTO", categoria: "" })}
              >
                Gasto
              </button>
            </div>

            {/* Categoría */}
            <div className="gastos-form-group">
              <label className="gastos-form-label">Categoría *</label>
              <select
                className="form-select"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                disabled={loading}
              >
                <option value="">Selecciona una categoría</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Descripción */}
            <div className="gastos-form-group">
              <label className="gastos-form-label">Descripción</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej. Compra de insumos"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                disabled={loading}
              />
            </div>

            {/* Monto */}
            <div className="gastos-form-group">
              <label className="gastos-form-label">Monto *</label>
              <input
                type="number"
                className="form-input"
                placeholder="0.00"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                step="0.01"
                disabled={loading}
              />
            </div>

            {/* Método Pago */}
            <div className="gastos-form-group">
              <label className="gastos-form-label">Método de Pago</label>
              <select
                className="form-select"
                value={form.metodoPago}
                onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}
                disabled={loading}
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="BANCO">Banco</option>
              </select>
            </div>

            {/* Botones */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "24px" }}>
              <button className="gastos-btn gastos-btn-primary" onClick={guardarGasto} disabled={loading}>
                {loading ? "Guardando..." : "Guardar"}
              </button>
              <button
                className="gastos-btn"
                onClick={() => setMostrarModal(false)}
                disabled={loading}
                style={{ background: "#e2e8f0", color: "#1e293b" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
