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

interface AuditLog {
  id: string;
  accion: string;
  usuario: string;
  detalles: string;
  fecha: string;
  ip?: string;
}

const styles = `
  .admin-container {
    min-height: 100vh;
    background: #FFFFFF;
    background-size: 200% 100%;
    animation: subtleShineAdmin 8s ease-in-out infinite;
    padding: 32px;
  }

  @keyframes subtleShineAdmin {
    0% {
      background: linear-gradient(90deg, #FFFFFF 0%, #F9FAFB 50%, #FFFFFF 100%);
      background-position: -200% center;
    }
    50% {
      background: linear-gradient(90deg, #FFFFFF 0%, #F8F9FA 50%, #FFFFFF 100%);
      background-position: 200% center;
    }
    100% {
      background: linear-gradient(90deg, #FFFFFF 0%, #F9FAFB 50%, #FFFFFF 100%);
      background-position: -200% center;
    }
  }

  .admin-header {
    max-width: 1400px;
    margin: 0 auto 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .admin-header h1 {
    font-size: 32px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    font-family: "Montserrat", sans-serif;
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .btn-primary {
    background: #3B82F6;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 18px;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .btn-primary:hover {
    background: #2563EB;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }

  .btn-secondary {
    background: #F9FAFB;
    color: #0f172a;
    border: 2px solid #E2E8F0;
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .btn-secondary:hover {
    border-color: #3B82F6;
    background: #FFFFFF;
  }

  .logout-btn {
    background: #3B82F6;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 20px;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .logout-btn:hover {
    background: #2563EB;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }

  /* ===== DASHBOARD KPI GRID ===== */
  .kpi-section {
    max-width: 1400px;
    margin: 0 auto 32px;
  }

  .kpi-section-title {
    font-size: 14px;
    font-weight: 700;
    color: #3B82F6;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 16px;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .kpi-card {
    background: #FFFFFF;
    border: 1px solid rgba(59, 130, 246, 0.08);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: all 0.3s ease;
  }

  .kpi-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.15);
  }

  .kpi-label {
    font-size: 12px;
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 8px;
    letter-spacing: 0.3px;
  }

  .kpi-value {
    font-size: 32px;
    font-weight: 800;
    color: #3B82F6;
    margin-bottom: 4px;
  }

  .kpi-subtitle {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }

  .kpi-trend {
    font-size: 11px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #E2E8F0;
  }

  .trend-positive {
    color: #16a34a;
  }

  .trend-negative {
    color: #dc2626;
  }

  .admin-section {
    background: #FFFFFF;
    border: 1px solid rgba(59, 130, 246, 0.08);
    border-radius: 16px;
    padding: 32px;
    max-width: 1400px;
    margin: 0 auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .section-title {
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 24px;
    font-family: "Montserrat", sans-serif;
  }

  .search-bar {
    margin-bottom: 24px;
    display: flex;
    gap: 12px;
  }

  .search-input {
    flex: 1;
    padding: 10px 14px;
    border: 2px solid #E2E8F0;
    border-radius: 10px;
    background: #F9FAFB;
    font-size: 14px;
    transition: all 0.3s;
    color: #0f172a;
  }

  .search-input::placeholder {
    color: #94a3b8;
  }

  .search-input:focus {
    outline: none;
    border-color: #3B82F6;
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .clients-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }

  .clients-table th {
    background: #3B82F6;
    color: white;
    padding: 14px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    border-radius: 10px 10px 0 0;
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
    background: rgba(59, 130, 246, 0.04);
  }

  .status-badge {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 11px;
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

  .action-menu-container {
    position: relative;
    display: inline-block;
  }

  .action-menu-btn {
    background: #F9FAFB;
    border: 2px solid #E2E8F0;
    color: #0f172a;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    min-height: 40px;
  }

  .action-menu-btn:hover {
    background: #FFFFFF;
    border-color: #3B82F6;
    color: #3B82F6;
  }

  .action-menu-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    min-width: 220px;
    z-index: 500;
    margin-top: 4px;
    overflow: hidden;
  }

  .action-menu-item {
    padding: 12px 16px;
    border-bottom: 1px solid #F1F5F9;
    cursor: pointer;
    font-size: 13px;
    color: #0f172a;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 500;
  }

  .action-menu-item:last-child {
    border-bottom: none;
  }

  .action-menu-item:hover {
    background: #F9FAFB;
    color: #3B82F6;
    padding-left: 20px;
  }

  .action-menu-item.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
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
    color: #16a34a;
  }

  /* ===== MODALS ===== */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .modal-content {
    background: #FFFFFF;
    border-radius: 16px;
    padding: 32px;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 16px;
    font-family: "Montserrat", sans-serif;
  }

  .modal-subtitle {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 24px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-label {
    font-size: 12px;
    font-weight: 700;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 6px;
    display: block;
  }

  .form-input,
  .form-select {
    width: 100%;
    padding: 10px 14px;
    border: 2px solid #E2E8F0;
    border-radius: 10px;
    background: #F9FAFB;
    font-size: 14px;
    color: #0f172a;
    transition: all 0.3s;
    font-family: inherit;
  }

  .form-input::placeholder {
    color: #94a3b8;
  }

  .form-input:focus,
  .form-select:focus {
    outline: none;
    border-color: #3B82F6;
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  .modal-actions button {
    flex: 1;
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
    font-size: 13px;
  }

  .success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #16a34a;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 16px;
    font-size: 13px;
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
    font-size: 13px;
  }

  .items-per-page select {
    padding: 8px 12px;
    border: 2px solid #E2E8F0;
    border-radius: 8px;
    background: #F9FAFB;
    cursor: pointer;
    color: #0f172a;
  }

  .pagination-info {
    font-size: 13px;
    color: #64748b;
    font-weight: 500;
  }

  .password-display {
    background: #EFF6FF;
    border: 2px solid #3B82F6;
    border-radius: 10px;
    padding: 16px;
    margin: 16px 0;
    font-family: "Courier New", monospace;
    font-size: 14px;
    font-weight: 600;
    color: #3B82F6;
    word-break: break-all;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .copy-btn {
    background: #3B82F6;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .copy-btn:hover {
    background: #2563EB;
  }

  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    z-index: 999;
  }

  .drawer {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 500px;
    background: #FFFFFF;
    box-shadow: -10px 0 40px rgba(0, 0, 0, 0.15);
    animation: slideInRight 0.3s ease;
    overflow-y: auto;
    z-index: 1000;
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .drawer-header {
    padding: 24px;
    border-bottom: 1px solid #E2E8F0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .drawer-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    font-family: "Montserrat", sans-serif;
  }

  .drawer-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #64748b;
  }

  .drawer-content {
    padding: 24px;
  }

  .audit-log-item {
    padding: 16px;
    border-bottom: 1px solid #E2E8F0;
    font-size: 13px;
  }

  .audit-log-item:last-child {
    border-bottom: none;
  }

  .audit-action {
    font-weight: 600;
    color: #3B82F6;
    margin-bottom: 4px;
  }

  .audit-meta {
    color: #94a3b8;
    font-size: 12px;
    margin-top: 8px;
  }

  @media (max-width: 768px) {
    .admin-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .drawer {
      width: 100%;
      max-width: 100%;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }

    .modal-content {
      padding: 24px;
    }
  }
`;

export default function CentralaAdmin() {
  const navigate = useNavigate();
  const logout = useSesionStore((s) => s.logout);

  // State
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  // Modal state
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    nombreAdmin: "",
    plan: "prueba",
    diasExtensión: 30,
    razonBloqueo: "",
  });
  const [openActionsMenu, setOpenActionsMenu] = useState<string | null>(null);

  // Load clientes
  useEffect(() => {
    cargarClientes();
  }, []);

  async function cargarClientes() {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get("/admin/clientes");
      console.log("✅ Clientes cargados:", data);
      // El backend devuelve un array directamente, no un objeto con propiedad 'clientes'
      setClientes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("❌ Error cargando clientes:", {
        status: err.response?.status,
        message: err.response?.data?.error || err.message,
        config: err.config,
      });
      setError(
        err.response?.status === 401
          ? "No autorizado - Token inválido"
          : err.response?.status === 403
          ? "Acceso denegado - Solo Super Admin"
          : `Error cargando clientes: ${err.response?.data?.error || err.message}`
      );
    } finally {
      setCargando(false);
    }
  }

  async function cargarAuditoria() {
    try {
      const { data } = await api.get("/admin/auditoria");
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.error("Error cargando auditoría");
    }
  }

  // Acciones cliente
  async function handleCreateCliente() {
    try {
      console.log("📤 POST CREATE CLIENT:", {
        url: "/admin/clientes",
        payload: {
          nombreEmpresa: formData.nombre,
          emailAdmin: formData.email,
          nombreAdmin: formData.nombreAdmin,
          tipoLicencia: formData.plan,
        },
      });

      const { data } = await api.post("/admin/clientes", {
        nombreEmpresa: formData.nombre,
        emailAdmin: formData.email,
        nombreAdmin: formData.nombreAdmin,
        tipoLicencia: formData.plan,
      });

      console.log("✅ CREATE CLIENT SUCCESS:", data);
      setShowCreateModal(false);
      setFormData({
        nombre: "",
        email: "",
        nombreAdmin: "",
        plan: "prueba",
        diasExtensión: 30,
        razonBloqueo: "",
      });
      cargarClientes();
    } catch (err: any) {
      console.error("❌ CREATE CLIENT FAILED:", {
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorMessage: err.response?.data?.error,
        fullResponse: err.response?.data,
        payload: {
          nombreEmpresa: formData.nombre,
          emailAdmin: formData.email,
          nombreAdmin: formData.nombreAdmin,
          tipoLicencia: formData.plan,
        },
        axiosError: err.message,
      });
      setError(
        err.response?.data?.error || `Error creando cliente: ${err.message}`
      );
    }
  }

  async function handleExtendLicense(clienteId: string) {
    try {
      console.log("📤 POST EXTEND LICENSE:", {
        url: `/admin/clientes/${clienteId}/licencia`,
        payload: { dias: formData.diasExtensión },
      });

      const { data } = await api.patch(`/admin/clientes/${clienteId}/licencia`, {
        dias: formData.diasExtensión,
      });

      console.log("✅ EXTEND LICENSE SUCCESS:", data);
      setShowExtendModal(false);
      setFormData({ ...formData, diasExtensión: 30 });
      cargarClientes();
    } catch (err: any) {
      console.error("❌ EXTEND LICENSE FAILED:", {
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorMessage: err.response?.data?.error,
        fullResponse: err.response?.data,
        payload: { dias: formData.diasExtensión },
        clienteId,
        axiosError: err.message,
      });
      setError(
        err.response?.data?.error || `Error extendiendo licencia: ${err.message}`
      );
    }
  }

  async function handleResetPassword(clienteId: string) {
    try {
      console.log("📤 POST RESET PASSWORD:", {
        url: `/admin/clientes/${clienteId}/reset-password`,
      });

      const { data } = await api.post(`/admin/clientes/${clienteId}/reset-password`);

      console.log("✅ RESET PASSWORD SUCCESS:", data);
      setGeneratedPassword(data.passwordTemporal);
      setShowPasswordModal(true);
    } catch (err: any) {
      console.error("❌ RESET PASSWORD FAILED:", {
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorMessage: err.response?.data?.error,
        fullResponse: err.response?.data,
        clienteId,
        axiosError: err.message,
      });
      setError(
        err.response?.data?.error || `Error generando contraseña: ${err.message}`
      );
    }
  }

  async function handleToggleBlock(clienteId: string, shouldBlock: boolean) {
    try {
      console.log("📤 PATCH TOGGLE BLOCK:", {
        url: `/admin/clientes/${clienteId}/bloquear`,
        payload: {
          bloqueado: shouldBlock,
          razon: formData.razonBloqueo,
        },
      });

      const { data } = await api.patch(`/admin/clientes/${clienteId}/bloquear`, {
        bloqueado: shouldBlock,
        razon: formData.razonBloqueo,
      });

      console.log("✅ TOGGLE BLOCK SUCCESS:", data);
      setShowBlockModal(false);
      setFormData({ ...formData, razonBloqueo: "" });
      cargarClientes();
    } catch (err: any) {
      console.error("❌ TOGGLE BLOCK FAILED:", {
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorMessage: err.response?.data?.error,
        fullResponse: err.response?.data,
        payload: {
          bloqueado: shouldBlock,
          razon: formData.razonBloqueo,
        },
        clienteId,
        axiosError: err.message,
      });
      setError(
        err.response?.data?.error || `Error cambiando estado de bloqueo: ${err.message}`
      );
    }
  }

  async function handleLogout() {
    await electronAPI.setConfig({ token: null, empresaId: null });
    logout();
    navigate("/login");
  }

  // Filtros y paginación
  const clientesFiltrados = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.email_admin.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalPages = Math.ceil(clientesFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClientes = clientesFiltrados.slice(startIndex, endIndex);

  // KPIs mockeadas
  const totalActivos = clientes.filter((c) => c.estado === "activa").length;
  const totalBloqueados = clientes.filter((c) => c.bloqueada_por_admin).length;
  const porVencer = clientes.filter((c) => c.dias_restantes <= 7).length;
  const mrrSimulado = totalActivos * 50; // $50 por licencia activa

  return (
    <>
      <style>{styles}</style>
      <div className="admin-container">
        {/* Header */}
        <div className="admin-header">
          <div>
            <h1>👤 Centrala Admin</h1>
          </div>
          <div className="header-actions">
            <button
              className="btn-primary"
              onClick={() => {
                setShowCreateModal(true);
                cargarAuditoria();
              }}
            >
              ➕ Crear Cliente
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setShowAuditDrawer(true);
                cargarAuditoria();
              }}
            >
              📋 Auditoría
            </button>
            <button className="logout-btn" onClick={handleLogout}>
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Dashboard KPIs */}
        <div className="kpi-section">
          <div className="kpi-section-title">Financieros & Salud</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Total Clientes Activos</div>
              <div className="kpi-value">{totalActivos}</div>
              <div className="kpi-trend trend-positive">
                ↑ 12% vs mes anterior
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">MRR Simulado</div>
              <div className="kpi-value">${mrrSimulado}</div>
              <div className="kpi-subtitle">Estimado mensual</div>
              <div className="kpi-trend trend-positive">
                ↑ $600 este mes
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Por Vencer (7 días)</div>
              <div className="kpi-value">{porVencer}</div>
              <div className="kpi-subtitle">Requieren atención</div>
              <div className="kpi-trend trend-negative">
                ⚠️ Prioridad alta
              </div>
            </div>
          </div>
        </div>

        <div className="kpi-section">
          <div className="kpi-section-title">Adopción & Uso</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">DAU (Usuarios Activos Diarios)</div>
              <div className="kpi-value">324</div>
              <div className="kpi-subtitle">Estimado basado en datos</div>
              <div className="kpi-trend trend-positive">
                ↑ 8% vs ayer
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Ventas Sincronizadas (24h)</div>
              <div className="kpi-value">$12,450</div>
              <div className="kpi-subtitle">Movimiento en plataforma</div>
              <div className="kpi-trend trend-positive">
                ↑ $2,100 vs promedio
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Transacciones Procesadas</div>
              <div className="kpi-value">856</div>
              <div className="kpi-subtitle">Últimas 24 horas</div>
              <div className="kpi-trend trend-positive">
                ↑ +145 vs ayer
              </div>
            </div>
          </div>
        </div>

        <div className="kpi-section">
          <div className="kpi-section-title">Salud Técnica</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Tasa de Éxito API</div>
              <div className="kpi-value">99.8%</div>
              <div className="kpi-subtitle">Confiabilidad sistema</div>
              <div className="kpi-trend trend-positive">
                ✅ Óptimo
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Cola de Errores</div>
              <div className="kpi-value">3</div>
              <div className="kpi-subtitle">Pendientes de revisar</div>
              <div className="kpi-trend trend-positive">
                ↓ -5 vs ayer
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Tiempo Promedio Respuesta</div>
              <div className="kpi-value">124ms</div>
              <div className="kpi-subtitle">Por solicitud</div>
              <div className="kpi-trend trend-positive">
                ↓ -8ms mejorado
              </div>
            </div>
          </div>
        </div>

        {/* Clientes Section */}
        <div className="admin-section">
          <h2 className="section-title">📊 Gestión de Clientes</h2>

          {error && <div className="error">{error}</div>}

          <div className="search-bar">
            <input
              type="text"
              className="search-input"
              placeholder="Buscar por nombre, email o admin..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setCurrentPage(1);
              }}
            />
            <button className="btn-primary" onClick={cargarClientes}>
              🔄 Actualizar
            </button>
          </div>

          {cargando ? (
            <div className="loading">Cargando clientes...</div>
          ) : paginatedClientes.length === 0 ? (
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
                    <th>Días</th>
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
                        <span
                          className={`status-badge ${
                            cliente.estado === "activa"
                              ? "status-activa"
                              : cliente.bloqueada_por_admin
                              ? "status-bloqueada"
                              : cliente.dias_restantes <= 0
                              ? "status-vencida"
                              : "status-prueba"
                          }`}
                        >
                          {cliente.estado}
                        </span>
                      </td>
                      <td>{cliente.tipo_licencia}</td>
                      <td>
                        <span
                          className={`days-remaining ${
                            cliente.dias_restantes <= 7
                              ? "days-low"
                              : cliente.dias_restantes <= 30
                              ? "days-medium"
                              : "days-high"
                          }`}
                        >
                          {cliente.dias_restantes} días
                        </span>
                      </td>
                      <td>{new Date(cliente.fecha_vencimiento).toLocaleDateString()}</td>
                      <td>
                        <div className="action-menu-container">
                          <button
                            className="action-menu-btn"
                            onClick={() =>
                              setOpenActionsMenu(
                                openActionsMenu === cliente.id ? null : cliente.id
                              )
                            }
                          >
                            ⋮
                          </button>

                          {openActionsMenu === cliente.id && (
                            <div className="action-menu-dropdown">
                              <div
                                className="action-menu-item"
                                onClick={() => {
                                  handleResetPassword(cliente.id);
                                  setOpenActionsMenu(null);
                                }}
                              >
                                <span>🔑</span> Resetear Contraseña
                              </div>

                              <div
                                className="action-menu-item"
                                onClick={() => {
                                  setSelectedClient(cliente);
                                  setShowExtendModal(true);
                                  setOpenActionsMenu(null);
                                }}
                              >
                                <span>⏱️</span> Modificar Licencia
                              </div>

                              <div
                                className="action-menu-item danger"
                                onClick={() => {
                                  setSelectedClient(cliente);
                                  setShowBlockModal(true);
                                  setOpenActionsMenu(null);
                                }}
                              >
                                <span>{cliente.bloqueada_por_admin ? "🔓" : "🔒"}</span>
                                {cliente.bloqueada_por_admin
                                  ? "Desbloquear Cliente"
                                  : "Bloquear Cliente"}
                              </div>

                              <div
                                className="action-menu-item"
                                onClick={() => {
                                  console.log("📝 Editar cliente:", cliente);
                                  setSelectedClient(cliente);
                                  setOpenActionsMenu(null);
                                }}
                              >
                                <span>✏️</span> Editar Cliente
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination-controls">
                <div className="items-per-page">
                  <label>Mostrar:</label>
                  <select
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
                  Mostrando {startIndex + 1} a {Math.min(endIndex, clientesFiltrados.length)} de{" "}
                  {clientesFiltrados.length}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn-secondary"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Anterior
                  </button>
                  <span style={{ padding: "8px 12px", fontWeight: 600, color: "#0f172a" }}>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* MODAL: Crear Cliente */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-header">➕ Crear Nuevo Cliente</h3>
              <p className="modal-subtitle">Añade una nueva empresa al sistema</p>

              <div className="form-group">
                <label className="form-label">Nombre de Empresa</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Mi Empresa S.A."
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Admin</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="admin@empresa.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre Admin</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Juan Pérez"
                  value={formData.nombreAdmin}
                  onChange={(e) => setFormData({ ...formData, nombreAdmin: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Plan de Suscripción</label>
                <select
                  className="form-select"
                  value={formData.plan}
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                >
                  <option value="prueba">Prueba - 14 días</option>
                  <option value="mensual">Mensual - $50</option>
                  <option value="trimestral">Trimestral - $120</option>
                  <option value="anual">Anual - $400</option>
                </select>
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={handleCreateCliente}
                >
                  Crear Cliente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Extender Licencia */}
        {showExtendModal && selectedClient && (
          <div className="modal-overlay" onClick={() => setShowExtendModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-header">⏱️ Extender Licencia</h3>
              <p className="modal-subtitle">{selectedClient.nombre}</p>

              <div className="form-group">
                <label className="form-label">Días a Agregar</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="30"
                  value={formData.diasExtensión}
                  onChange={(e) =>
                    setFormData({ ...formData, diasExtensión: Number(e.target.value) })
                  }
                />
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowExtendModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={() => handleExtendLicense(selectedClient.id)}
                >
                  Extender
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Reset Password */}
        {showPasswordModal && (
          <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-header">🔑 Contraseña Temporal</h3>
              <p className="modal-subtitle">
                Copia esta contraseña y compártela con el cliente
              </p>

              <div className="password-display">
                <span>{generatedPassword}</span>
                <button
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedPassword);
                  }}
                >
                  Copiar
                </button>
              </div>

              <div className="modal-actions">
                <button className="btn-primary" onClick={() => setShowPasswordModal(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Bloquear Cliente */}
        {showBlockModal && selectedClient && (
          <div className="modal-overlay" onClick={() => setShowBlockModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-header">
                {selectedClient.bloqueada_por_admin ? "🔓 Desbloquear" : "🔒 Bloquear"}
              </h3>
              <p className="modal-subtitle">{selectedClient.nombre}</p>

              {!selectedClient.bloqueada_por_admin && (
                <div className="form-group">
                  <label className="form-label">Razón del Bloqueo</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: No pago o violación de términos"
                    value={formData.razonBloqueo}
                    onChange={(e) => setFormData({ ...formData, razonBloqueo: e.target.value })}
                  />
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowBlockModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={() =>
                    handleToggleBlock(
                      selectedClient.id,
                      !selectedClient.bloqueada_por_admin
                    )
                  }
                >
                  {selectedClient.bloqueada_por_admin ? "Desbloquear" : "Bloquear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DRAWER: Auditoría */}
        {showAuditDrawer && (
          <>
            <div className="drawer-overlay" onClick={() => setShowAuditDrawer(false)} />
            <div className="drawer">
              <div className="drawer-header">
                <h3 className="drawer-title">📋 Registro de Auditoría</h3>
                <button
                  className="drawer-close"
                  onClick={() => setShowAuditDrawer(false)}
                >
                  ✕
                </button>
              </div>
              <div className="drawer-content">
                {auditLogs.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px 0" }}>
                    No hay registros de auditoría
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="audit-log-item">
                      <div className="audit-action">{log.accion}</div>
                      <div style={{ color: "#64748b" }}>Por: {log.usuario}</div>
                      <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "4px" }}>
                        {log.detalles}
                      </div>
                      <div className="audit-meta">{new Date(log.fecha).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
