import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { Pagination } from "../components/Pagination";

interface Cliente {
  id: string;
  nombre: string;
  estado: "activa" | "bloqueada" | "prueba" | "suspendida" | "vencida";
  tipo_licencia: "prueba" | "mensual" | "trimestral" | "anual";
  dias_restantes: number;
  email_admin: string;
  nombre_admin: string;
  fecha_creacion: string;
  fecha_vencimiento: string;
  bloqueada_por_admin: boolean;
  razon_bloqueo?: string;
}

const adminStyles = `
  .admin-container {
    min-height: 100vh;
    background: linear-gradient(-45deg,
      rgba(219, 234, 254, 0.8) 0%,
      rgba(220, 252, 231, 0.7) 25%,
      rgba(219, 234, 254, 0.75) 50%,
      rgba(220, 252, 231, 0.8) 75%,
      rgba(219, 234, 254, 0.8) 100%);
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
    text-align: center;
  }

  .admin-header h1 {
    font-size: 48px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 8px;
    letter-spacing: -0.8px;
  }

  .admin-header p {
    font-size: 15px;
    color: #64748b;
    margin: 0;
  }

  .admin-content {
    max-width: 1400px;
    margin: 0 auto;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .kpi-card {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(30px);
    border: 1px solid rgba(255, 255, 255, 0.95);
    border-radius: 24px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 10px 20px rgba(0, 0, 0, 0.12);
    text-align: center;
    transition: all 0.3s ease;
  }

  .kpi-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.10), 0 12px 24px rgba(0, 0, 0, 0.15);
  }

  .kpi-label {
    font-size: 12px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .kpi-value {
    font-size: 32px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
  }

  .kpi-icon {
    font-size: 24px;
    margin-bottom: 12px;
  }

  .admin-card {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(30px);
    border: 1px solid rgba(255, 255, 255, 0.95);
    border-radius: 24px;
    padding: 32px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 10px 20px rgba(0, 0, 0, 0.12);
  }

  .admin-card h2 {
    font-size: 24px;
    color: #0f172a;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .cliente-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 200px;
    gap: 16px;
    align-items: center;
    padding: 16px;
    background: var(--surface);
    border-radius: 12px;
    margin-bottom: 12px;
    border: 1px solid var(--border-light);
  }

  .cliente-info {
    display: flex;
    flex-direction: column;
  }

  .cliente-nombre {
    font-weight: 600;
    color: #0f172a;
    font-size: 14px;
  }

  .cliente-email {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 4px;
  }

  .cliente-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
  }

  .badge.activa {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .badge.prueba {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .badge.bloqueada {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .cliente-dias {
    text-align: center;
    font-weight: 600;
    color: #0f172a;
  }

  .cliente-dias.proximo {
    color: #f59e0b;
  }

  .cliente-acciones {
    display: flex;
    gap: 8px;
  }

  .btn-accion {
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    background: var(--brand);
    color: white;
  }

  .btn-accion:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  }

  .btn-accion.secondary {
    background: var(--border-light);
    color: var(--text);
  }

  .empty-state {
    text-align: center;
    padding: 48px 32px;
    color: var(--text-muted);
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 24px;
    padding: 40px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    font-size: 24px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 24px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .form-input,
  .form-select {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.2s;
  }

  .form-input:focus,
  .form-select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
  }

  .modal-footer {
    display: flex;
    gap: 12px;
    margin-top: 32px;
  }

  .btn-primary {
    flex: 1;
    padding: 12px 24px;
    background: var(--brand);
    color: white;
    border: none;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary:hover {
    background: var(--brand-dark);
    transform: translateY(-2px);
  }

  .btn-secondary {
    flex: 1;
    padding: 12px 24px;
    background: var(--surface-secondary);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .success-message {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 12px;
    padding: 16px;
    color: #22c55e;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .password-display {
    background: var(--surface-secondary);
    border: 2px solid var(--brand);
    border-radius: 12px;
    padding: 16px;
    margin: 16px 0;
    font-family: monospace;
    font-size: 14px;
    color: var(--brand);
    word-break: break-all;
    text-align: center;
    font-weight: 600;
  }
`;

export default function CentralaAdmin() {
  const { usuario } = useSesionStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalTipo, setModalTipo] = useState<"crear" | "extender" | "resetear" | null>(null);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState<string | null>(null);

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = async () => {
    try {
      setCargando(true);
      const { data } = await api.get("/admin/clientes");
      setClientes(data || []);
    } catch (error) {
      console.error("Error cargando clientes:", error);
    } finally {
      setCargando(false);
    }
  };

  const handleCrearCliente = async (datos: any) => {
    try {
      const response = await api.post("/admin/clientes", datos);
      setNuevaPassword(response.data.passwordTemporal);
      await cargarClientes();
      // Keep modal open to show password
    } catch (error) {
      console.error("Error creando cliente:", error);
    }
  };

  const handleExtenderLicencia = async (dias: number) => {
    if (!clienteSeleccionado) return;
    try {
      await api.patch(`/admin/clientes/${clienteSeleccionado.id}/licencia`, {
        dias,
      });
      await cargarClientes();
      setModalAbierto(false);
    } catch (error) {
      console.error("Error extendiendo licencia:", error);
    }
  };

  const handleResetearPassword = async () => {
    if (!clienteSeleccionado) return;
    try {
      const response = await api.post(
        `/admin/clientes/${clienteSeleccionado.id}/reset-password`
      );
      setNuevaPassword(response.data.passwordTemporal);
    } catch (error) {
      console.error("Error reseteando password:", error);
    }
  };

  const handleBloquearCliente = async (bloqueado: boolean) => {
    if (!clienteSeleccionado) return;
    try {
      await api.patch(`/admin/clientes/${clienteSeleccionado.id}/bloquear`, {
        bloqueado,
        razon: "Bloqueado por Super Admin",
      });
      await cargarClientes();
      setClienteSeleccionado(null);
    } catch (error) {
      console.error("Error bloqueando cliente:", error);
    }
  };

  const kpis = {
    activos: clientes.filter((c) => c.estado === "activa").length,
    prueba: clientes.filter((c) => c.estado === "prueba").length,
    bloqueados: clientes.filter((c) => c.bloqueada_por_admin).length,
    proximosVencer: clientes.filter((c) => c.dias_restantes < 30).length,
  };

  return (
    <>
      <style>{adminStyles}</style>
      <div className="admin-container">
        <div className="admin-header">
          <h1>🚀 CENTRALA ADMIN</h1>
          <p>Panel de Control Exclusivo - Gestión Total del Ecosistema</p>
        </div>

        <div className="admin-content">
          {/* KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon">🟢</div>
              <div className="kpi-label">Clientes Activos</div>
              <p className="kpi-value">{kpis.activos}</p>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">🟡</div>
              <div className="kpi-label">En Prueba</div>
              <p className="kpi-value">{kpis.prueba}</p>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">🔴</div>
              <div className="kpi-label">Bloqueados</div>
              <p className="kpi-value">{kpis.bloqueados}</p>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">⏰</div>
              <div className="kpi-label">Por Vencer</div>
              <p className="kpi-value">{kpis.proximosVencer}</p>
            </div>
          </div>

          {/* Clientes */}
          <div className="admin-card">
            <h2>👥 Gestión de Clientes</h2>
            <button
              className="btn-primary"
              style={{ marginBottom: "24px" }}
              onClick={() => {
                setModalTipo("crear");
                setModalAbierto(true);
              }}
            >
              + Crear Nuevo Cliente
            </button>

            {cargando ? (
              <div className="empty-state">Cargando clientes...</div>
            ) : clientes.length === 0 ? (
              <div className="empty-state">
                No hay clientes aún. ¡Crea uno para empezar!
              </div>
            ) : (
              <Pagination
                items={clientes}
                itemsPerPageOptions={[5, 10, 25]}
                renderTable={(pageItems) => (
                  <div>
                    {pageItems.map((cliente) => (
                      <div key={cliente.id} className="cliente-row">
                        <div className="cliente-info">
                          <div className="cliente-nombre">{cliente.nombre}</div>
                          <div className="cliente-email">
                            {cliente.email_admin}
                          </div>
                        </div>

                        <div className="cliente-status">
                          <span className={`badge ${cliente.estado}`}>
                            {cliente.estado.toUpperCase()}
                          </span>
                          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                            {cliente.tipo_licencia}
                          </span>
                        </div>

                        <div className="cliente-dias">
                          {cliente.dias_restantes}d
                          {cliente.dias_restantes < 30 && " ⚠️"}
                        </div>

                        <div className="cliente-acciones">
                          <button
                            className="btn-accion"
                            onClick={() => {
                              setClienteSeleccionado(cliente);
                              setModalTipo("extender");
                              setModalAbierto(true);
                            }}
                          >
                            Extender
                          </button>
                          <button
                            className="btn-accion secondary"
                            onClick={() => {
                              setClienteSeleccionado(cliente);
                              handleResetearPassword();
                            }}
                          >
                            Reset Pwd
                          </button>
                          <button
                            className="btn-accion secondary"
                            style={{
                              background: cliente.bloqueada_por_admin
                                ? "rgba(34, 197, 94, 0.15)"
                                : "rgba(239, 68, 68, 0.15)",
                              color: cliente.bloqueada_por_admin
                                ? "#22c55e"
                                : "#ef4444",
                            }}
                            onClick={() =>
                              handleBloquearCliente(!cliente.bloqueada_por_admin)
                            }
                          >
                            {cliente.bloqueada_por_admin ? "Desbloquear" : "Bloquear"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modalAbierto && modalTipo === "crear" && (
        <CrearClienteModal
          onClose={() => {
            setModalAbierto(false);
            setNuevaPassword(null);
          }}
          onCrear={handleCrearCliente}
          passwordGenerada={nuevaPassword}
        />
      )}

      {modalAbierto && modalTipo === "extender" && clienteSeleccionado && (
        <ExtenderLicenciaModal
          cliente={clienteSeleccionado}
          onClose={() => setModalAbierto(false)}
          onExtender={handleExtenderLicencia}
        />
      )}
    </>
  );
}

// Modal Components
function CrearClienteModal({
  onClose,
  onCrear,
  passwordGenerada,
}: {
  onClose: () => void;
  onCrear: (datos: any) => void;
  passwordGenerada: string | null;
}) {
  const [datos, setDatos] = useState({
    nombreEmpresa: "",
    emailAdmin: "",
    nombreAdmin: "",
    tipoLicencia: "mensual",
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">➕ Crear Cliente</div>

        {passwordGenerada && (
          <div className="success-message">
            ✅ Cliente creado exitosamente
          </div>
        )}

        {passwordGenerada && (
          <div>
            <div style={{ fontSize: "13px", color: "#0f172a", marginBottom: "8px", fontWeight: 600 }}>
              Contraseña Temporal:
            </div>
            <div className="password-display">{passwordGenerada}</div>
            <div style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
              ⚠️ Cópiala y entrégala al cliente. No podrá recuperarse.
            </div>
          </div>
        )}

        {!passwordGenerada && (
          <>
            <div className="form-group">
              <label className="form-label">Nombre Empresa</label>
              <input
                type="text"
                className="form-input"
                value={datos.nombreEmpresa}
                onChange={(e) =>
                  setDatos({ ...datos, nombreEmpresa: e.target.value })
                }
                placeholder="ABC Company"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Admin</label>
              <input
                type="email"
                className="form-input"
                value={datos.emailAdmin}
                onChange={(e) =>
                  setDatos({ ...datos, emailAdmin: e.target.value })
                }
                placeholder="admin@empresa.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nombre Admin</label>
              <input
                type="text"
                className="form-input"
                value={datos.nombreAdmin}
                onChange={(e) =>
                  setDatos({ ...datos, nombreAdmin: e.target.value })
                }
                placeholder="Juan Pérez"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Licencia</label>
              <select
                className="form-select"
                value={datos.tipoLicencia}
                onChange={(e) =>
                  setDatos({ ...datos, tipoLicencia: e.target.value })
                }
              >
                <option value="prueba">Prueba (14 días)</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => onCrear(datos)}>
                Crear Cliente
              </button>
              <button className="btn-secondary" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {passwordGenerada && (
          <div className="modal-footer">
            <button className="btn-primary" onClick={onClose}>
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExtenderLicenciaModal({
  cliente,
  onClose,
  onExtender,
}: {
  cliente: Cliente;
  onClose: () => void;
  onExtender: (dias: number) => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">⏱️ Extender Licencia</div>
        <p style={{ color: "#475569", marginBottom: "24px" }}>
          Cliente: <strong>{cliente.nombre}</strong>
          <br />
          Días restantes: <strong>{cliente.dias_restantes}</strong>
        </p>

        <div className="modal-footer">
          <button
            className="btn-primary"
            onClick={() => {
              onExtender(30);
              onClose();
            }}
          >
            +30 días
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              onExtender(90);
              onClose();
            }}
          >
            +90 días
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              onExtender(365);
              onClose();
            }}
          >
            +365 días
          </button>
        </div>

        <button
          className="btn-secondary"
          style={{ width: "100%", marginTop: "12px" }}
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
