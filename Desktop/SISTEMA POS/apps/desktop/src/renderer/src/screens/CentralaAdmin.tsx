import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { electronAPI } from "../lib/electron-api";
import { Pagination } from "../components/Pagination";

interface Cliente {
  id: string;
  nombre: string;
  estado: string;
  tipo_licencia: string;
  dias_restantes: number;
  email_admin: string;
  nombre_admin: string;
  fecha_creacion: string;
  fecha_vencimiento: string;
  bloqueada_por_admin: boolean;
  razon_bloqueo?: string;
}

const styles = `
  .admin-container {
    min-height: 100vh;
    background: linear-gradient(-45deg, rgba(219, 234, 254, 0.8) 0%, rgba(220, 252, 231, 0.7) 25%, rgba(219, 234, 254, 0.75) 50%, rgba(220, 252, 231, 0.8) 75%, rgba(219, 234, 254, 0.8) 100%);
    background-size: 400% 400%;
    animation: gradientShift 15s ease infinite;
    padding: 32px;
  }

  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  .admin-header {
    max-width: 1400px;
    margin: 0 auto 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .admin-header h1 {
    font-size: 48px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
  }

  .logout-btn {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 12px 24px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  .logout-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
    max-width: 1400px;
    margin-left: auto;
    margin-right: auto;
  }

  .kpi-card {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(30px);
    border: 1px solid rgba(255, 255, 255, 0.95);
    border-radius: 24px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    text-align: center;
    transition: all 0.3s ease;
  }

  .kpi-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  }

  .kpi-label {
    font-size: 12px;
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .kpi-value {
    font-size: 32px;
    font-weight: 800;
    color: #0f172a;
  }

  .admin-section {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(30px);
    border: 1px solid rgba(255, 255, 255, 0.95);
    border-radius: 24px;
    padding: 32px;
    max-width: 1400px;
    margin: 0 auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .section-title {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 24px;
  }

  .search-bar {
    margin-bottom: 24px;
    display: flex;
    gap: 12px;
  }

  .search-input {
    flex: 1;
    padding: 12px 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    transition: all 0.3s;
  }

  .search-input:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(255, 255, 255, 0.95);
  }

  .clients-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }

  .clients-table th {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    padding: 14px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    border-radius: 12px 12px 0 0;
  }

  .clients-table td {
    padding: 14px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    font-size: 14px;
  }

  .clients-table tr:last-child td {
    border-bottom: none;
  }

  .clients-table tr:hover {
    background: rgba(99, 102, 241, 0.05);
  }

  .status-badge {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-activa {
    background: rgba(34, 197, 94, 0.2);
    color: #16a34a;
  }

  .status-bloqueada {
    background: rgba(239, 68, 68, 0.2);
    color: #dc2626;
  }

  .status-prueba {
    background: rgba(59, 130, 246, 0.2);
    color: #2563eb;
  }

  .status-vencida {
    background: rgba(168, 85, 247, 0.2);
    color: #9333ea;
  }

  .actions-btn {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .actions-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #64748b;
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 16px;
  }

  .pagination-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
  }

  .items-per-page {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .items-per-page select {
    padding: 8px 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.5);
    cursor: pointer;
  }

  .pagination-info {
    font-size: 13px;
    color: #64748b;
    font-weight: 500;
  }

  .days-remaining {
    font-weight: 600;
  }

  .days-low {
    color: #dc2626;
  }

  .days-medium {
    color: #f97316;
  }

  .days-high {
    color: #22c55e;
  }
`;

export default function CentralaAdmin() {
  const navigate = useNavigate();
  const { usuario, token } = useSesionStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filteredClientes, setFilteredClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Cargar clientes al montar
  useEffect(() => {
    cargarClientes();
  }, []);

  // Filtrar clientes cuando cambia el término de búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredClientes(clientes);
      setCurrentPage(1);
    } else {
      const termino = searchTerm.toLowerCase();
      const filtered = clientes.filter(
        (c) =>
          c.nombre.toLowerCase().includes(termino) ||
          c.email_admin.toLowerCase().includes(termino) ||
          c.nombre_admin.toLowerCase().includes(termino)
      );
      setFilteredClientes(filtered);
      setCurrentPage(1);
    }
  }, [searchTerm, clientes]);

  async function cargarClientes() {
    try {
      setCargando(true);
      setError(null);
      const { data } = await api.get("/admin/clientes");
      setClientes(data || []);
      setFilteredClientes(data || []);
    } catch (err: any) {
      setError("Error cargando clientes: " + (err.message || "Error desconocido"));
      console.error("Error:", err);
    } finally {
      setCargando(false);
    }
  }

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
      await electronAPI.setConfig({ token: null, empresaId: null, sucursalId: null });
      navigate("/");
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
      navigate("/");
    }
  }

  const totalClientes = filteredClientes.length;
  const activos = clientes.filter((c) => c.estado === "activa").length;
  const enPrueba = clientes.filter((c) => c.estado === "prueba").length;
  const bloqueados = clientes.filter((c) => c.bloqueada_por_admin).length;
  const porVencer = clientes.filter((c) => c.dias_restantes <= 7).length;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClientes = filteredClientes.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredClientes.length / itemsPerPage);

  const getStatusColor = (estado: string) => {
    if (estado === "activa") return "status-activa";
    if (estado === "bloqueada" || estado === "vencida") return "status-bloqueada";
    if (estado === "prueba") return "status-prueba";
    return "status-vencida";
  };

  const getDaysColor = (dias: number) => {
    if (dias <= 7) return "days-low";
    if (dias <= 30) return "days-medium";
    return "days-high";
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-CO");
  };

  return (
    <>
      <style>{styles}</style>
      <div className="admin-container">
        <div className="admin-header">
          <h1>👤 Centrala Admin</h1>
          <button className="logout-btn" onClick={handleLogout}>
            🚪 Cerrar Sesión
          </button>
        </div>

        {/* KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Total Clientes</div>
            <div className="kpi-value">{totalClientes}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Activos</div>
            <div className="kpi-value" style={{ color: "#22c55e" }}>{activos}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">En Prueba</div>
            <div className="kpi-value" style={{ color: "#3b82f6" }}>{enPrueba}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Bloqueados</div>
            <div className="kpi-value" style={{ color: "#ef4444" }}>{bloqueados}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Por Vencer (7 días)</div>
            <div className="kpi-value" style={{ color: "#f97316" }}>{porVencer}</div>
          </div>
        </div>

        {/* Clientes Section */}
        <div className="admin-section">
          <h2 className="section-title">📋 Gestión de Clientes</h2>

          {error && <div className="error">{error}</div>}

          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="Buscar por nombre de empresa, email o admin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="actions-btn" onClick={cargarClientes} style={{ width: "120px" }}>
              🔄 Actualizar
            </button>
          </div>

          {cargando ? (
            <div className="loading">Cargando clientes...</div>
          ) : filteredClientes.length === 0 ? (
            <div className="loading">No hay clientes para mostrar</div>
          ) : (
            <>
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Email Admin</th>
                    <th>Admin</th>
                    <th>Estado</th>
                    <th>Licencia</th>
                    <th>Días Restantes</th>
                    <th>Vencimiento</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedClientes.map((cliente) => (
                    <tr key={cliente.id}>
                      <td>
                        <strong>{cliente.nombre}</strong>
                      </td>
                      <td>{cliente.email_admin}</td>
                      <td>{cliente.nombre_admin}</td>
                      <td>
                        <span className={`status-badge ${getStatusColor(cliente.estado)}`}>
                          {cliente.estado}
                        </span>
                      </td>
                      <td>{cliente.tipo_licencia}</td>
                      <td>
                        <span className={`days-remaining ${getDaysColor(cliente.dias_restantes)}`}>
                          {cliente.dias_restantes} días
                        </span>
                      </td>
                      <td>{formatDate(cliente.fecha_vencimiento)}</td>
                      <td>
                        <button className="actions-btn">⚙️ Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination-controls">
                <div className="items-per-page">
                  <label htmlFor="items-select">Mostrar:</label>
                  <select
                    id="items-select"
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="pagination-info">
                  Mostrando {startIndex + 1} a {Math.min(endIndex, totalClientes)} de {totalClientes}
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    className="actions-btn"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ padding: "8px 12px", fontWeight: 600, color: "#0f172a" }}>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    className="actions-btn"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
