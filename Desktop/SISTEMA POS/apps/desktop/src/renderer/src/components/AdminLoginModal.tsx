import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const modalStyles = `
  .admin-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .admin-modal-content {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 24px;
    padding: 40px 36px;
    max-width: 420px;
    width: 90%;
    border: 1px solid rgba(255, 255, 255, 0.95);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.08),
      0 10px 20px rgba(0, 0, 0, 0.12),
      0 20px 40px rgba(99, 102, 241, 0.15),
      0 40px 80px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(30px) saturate(200%);
    animation: slideDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .admin-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .admin-modal-title {
    font-size: 24px;
    font-weight: 800;
    color: #0f172a;
  }

  .admin-modal-close {
    background: none;
    border: none;
    font-size: 28px;
    color: #94a3b8;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .admin-modal-close:hover {
    color: #1e293b;
    transform: scale(1.1);
  }

  .admin-modal-subtitle {
    font-size: 14px;
    color: #64748b;
    margin-bottom: 28px;
    line-height: 1.5;
  }

  .admin-form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 18px;
  }

  .admin-form-label {
    font-size: 12px;
    font-weight: 700;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .admin-form-input {
    background: rgba(255, 255, 255, 0.5);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    color: #0f172a;
    backdrop-filter: blur(20px) saturate(180%);
  }

  .admin-form-input::placeholder {
    color: rgba(15, 23, 42, 0.4);
  }

  .admin-form-input:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(255, 255, 255, 0.95);
    box-shadow:
      0 0 0 3px rgba(99, 102, 241, 0.15),
      inset 0 0 0 1px rgba(99, 102, 241, 0.3),
      0 4px 12px rgba(99, 102, 241, 0.2);
  }

  .admin-input-with-icon {
    position: relative;
  }

  .admin-input-with-icon input {
    width: 100%;
    padding-right: 40px;
  }

  .admin-form-toggle {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .admin-form-toggle:hover {
    color: #6366f1;
  }

  .admin-form-error {
    font-size: 12px;
    color: #ef4444;
    margin-top: 4px;
  }

  .admin-error-box {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.05) 100%);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 20px;
    color: #dc2626;
    font-size: 13px;
    font-weight: 500;
  }

  .admin-submit-button {
    width: 100%;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
    margin-top: 8px;
  }

  .admin-submit-button:hover:not(:disabled) {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    box-shadow: 0 12px 30px rgba(99, 102, 241, 0.5);
    transform: translateY(-2px);
  }

  .admin-submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .admin-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

export function AdminLoginModal({ isOpen, onClose }: AdminLoginModalProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSesion = useSesionStore((s) => s.setSesion);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Email y contraseña son requeridos");
      return;
    }

    setCargando(true);
    try {
      // Usar el endpoint de login normal pero validar que sea admin
      const { data } = await api.post("/auth/login", { email, password });

      // Verificar que sea Super Admin
      if (!data.usuario.es_super_admin) {
        setError("Solo Super Admin puede acceder aquí");
        setCargando(false);
        return;
      }

      // Aplicar sesión
      setSesion({
        token: data.token,
        usuario: data.usuario,
        empresa: data.empresa,
        sucursales: data.sucursales ?? [],
      });

      await electronAPI.setConfig({
        token: data.token,
        empresaId: data.empresa.id,
      });

      // Cerrar modal y navegar
      onClose();
      navigate("/centrala-admin");
    } catch (err: any) {
      const errorMsg = mensajeError(err, "No se pudo iniciar sesión como administrador");
      setError(errorMsg);
    } finally {
      setCargando(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <style>{modalStyles}</style>
      <div className="admin-modal-overlay" onClick={onClose}>
        <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="admin-modal-header">
            <h2 className="admin-modal-title">👤 Administrador</h2>
            <button
              className="admin-modal-close"
              onClick={onClose}
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          <p className="admin-modal-subtitle">
            Ingresa tus credenciales de Super Admin para acceder al panel de control
          </p>

          {error && <div className="admin-error-box">{error}</div>}

          <form onSubmit={handleAdminLogin}>
            {/* Email */}
            <div className="admin-form-group">
              <label className="admin-form-label">Email</label>
              <input
                type="email"
                className="admin-form-input"
                placeholder="admin@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                disabled={cargando}
              />
            </div>

            {/* Password */}
            <div className="admin-form-group">
              <label className="admin-form-label">Contraseña</label>
              <div className="admin-input-with-icon">
                <input
                  type={mostrarPassword ? "text" : "password"}
                  className="admin-form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  disabled={cargando}
                />
                <button
                  type="button"
                  className="admin-form-toggle"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  disabled={cargando}
                  title={mostrarPassword ? "Ocultar" : "Mostrar"}
                >
                  {mostrarPassword ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="admin-submit-button"
              disabled={cargando}
            >
              {cargando && <div className="admin-spinner"></div>}
              <span>{cargando ? "Verificando..." : "Entrar"}</span>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
