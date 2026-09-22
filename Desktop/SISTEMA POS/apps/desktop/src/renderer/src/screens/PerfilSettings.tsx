import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { notif } from "../lib/notificationService";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const perfilStyles = `
  .perfil-container {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 24px;
    max-width: 900px;
  }

  .perfil-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .perfil-back-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .perfil-back-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .perfil-title {
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
  }

  .perfil-card {
    background: white;
    border-radius: 16px;
    padding: 32px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .perfil-section-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #e2e8f0;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-bottom: 24px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-label {
    font-size: 12px;
    font-weight: 700;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .form-input {
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.3s;
    color: #0f172a;
  }

  .form-input:focus {
    outline: none;
    border-color: #6366f1;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  .form-input:disabled {
    background: #f1f5f9;
    color: #94a3b8;
    cursor: not-allowed;
  }

  .form-input-with-icon {
    position: relative;
  }

  .form-input-with-icon input {
    width: 100%;
    padding-right: 40px;
  }

  .form-input-toggle {
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

  .form-input-toggle:hover {
    color: #6366f1;
  }

  .form-hint {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }

  .form-error {
    font-size: 12px;
    color: #ef4444;
    margin-top: 4px;
    font-weight: 500;
  }

  .divider {
    height: 1px;
    background: #e2e8f0;
    margin: 32px 0;
  }

  .button-group {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .save-button {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.3);
  }

  .save-button:hover:not(:disabled) {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    box-shadow: 0 10px 24px rgba(99, 102, 241, 0.4);
    transform: translateY(-2px);
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cancel-button {
    background: #f1f5f9;
    color: #1e293b;
    border: none;
    border-radius: 10px;
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cancel-button:hover {
    background: #e2e8f0;
  }

  .info-box {
    background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%);
    border: 1px solid #0ea5e9;
    border-radius: 10px;
    padding: 16px;
    color: #0369a1;
    font-size: 13px;
    margin-bottom: 24px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .current-user-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #f0f9ff;
    border: 1px solid #0ea5e9;
    color: #0369a1;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    margin-top: 8px;
  }

  @media (max-width: 768px) {
    .perfil-container {
      padding: 16px;
    }

    .perfil-card {
      padding: 20px;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .button-group {
      flex-direction: column;
    }
  }
`;

export default function PerfilSettings() {
  const navigate = useNavigate();
  const { usuario, setSesion } = useSesionStore();

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const [nombre, setNombre] = useState(usuario?.nombre || "");
  const [email, setEmail] = useState(usuario?.email || "");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  const [mostrarCurrent, setMostrarCurrent] = useState(false);
  const [mostrarNew, setMostrarNew] = useState(false);
  const [mostrarConfirm, setMostrarConfirm] = useState(false);

  useEffect(() => {
    if (!usuario) {
      navigate("/");
    }
  }, [usuario, navigate]);

  async function handleSaveChanges(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors: { [key: string]: string } = {};

    // Validaciones
    if (newEmail && newEmail !== email) {
      if (!newEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        errors.newEmail = "Email inválido";
      }
      if (!currentPassword) {
        errors.currentPassword = "Se requiere contraseña actual para cambiar email";
      }
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        errors.newPassword = "Mínimo 8 caracteres";
      }
      if (newPassword !== confirmPassword) {
        errors.confirmPassword = "Las contraseñas no coinciden";
      }
      if (!currentPassword) {
        errors.currentPassword = "Se requiere contraseña actual para cambiar contraseña";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Por favor corrige los errores");
      return;
    }

    // Si no hay cambios, no hacer nada
    if (!nombre || (newEmail === email && !newPassword)) {
      setError("No hay cambios para guardar");
      return;
    }

    setGuardando(true);
    try {
      const payload: any = {};
      if (nombre !== usuario?.nombre) payload.nombre = nombre;
      if (newEmail && newEmail !== email) payload.email = newEmail;
      if (newPassword) payload.password = newPassword;
      if (currentPassword) payload.currentPassword = currentPassword;

      const { data } = await api.put("/usuarios/perfil", payload);

      // Actualizar sesión
      setSesion({
        usuario: data.usuario,
      });

      setNombre(data.usuario.nombre);
      setEmail(data.usuario.email);
      setNewEmail("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");

      notif.exito("Perfil actualizado correctamente");
    } catch (err: any) {
      const errorMsg = mensajeError(err, "No se pudo actualizar el perfil");
      setError(errorMsg);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <style>{perfilStyles}</style>
      <div className="perfil-container">
        {/* Header */}
        <div className="perfil-header">
          <button
            className="perfil-back-btn"
            onClick={() => navigate(-1)}
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="perfil-title">⚙️ Mi Perfil</h1>
          </div>
        </div>

        {/* Main Card */}
        <div className="perfil-card">
          {error && (
            <div className="info-box" style={{ background: "linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.05) 100%)", border: "1px solid rgba(239, 68, 68, 0.25)", color: "#dc2626" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSaveChanges}>
            {/* Información Actual */}
            <div>
              <h3 className="perfil-section-title">Información Personal</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tu nombre"
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value);
                      setError(null);
                    }}
                    disabled={guardando}
                  />
                </div>
              </div>
            </div>

            <div className="divider"></div>

            {/* Cambiar Email */}
            <div>
              <h3 className="perfil-section-title">Email</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Email Actual</label>
                  <input
                    type="email"
                    className="form-input"
                    value={email}
                    disabled
                  />
                  <div className="current-user-badge">✓ Tu email actual</div>
                </div>

                <div className="form-group">
                  <label className="form-label">Nuevo Email (Opcional)</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="nuevo@email.com"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setFieldErrors({ ...fieldErrors, newEmail: "" });
                      setError(null);
                    }}
                    disabled={guardando}
                  />
                  {fieldErrors.newEmail && (
                    <div className="form-error">{fieldErrors.newEmail}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="divider"></div>

            {/* Cambiar Contraseña */}
            <div>
              <h3 className="perfil-section-title">Seguridad</h3>
              <div className="info-box">
                {newEmail && newEmail !== email
                  ? "Se requiere tu contraseña actual para cambiar el email"
                  : "Deja los campos vacíos si no deseas cambiar tu contraseña"}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Contraseña Actual (si cambias algo)</label>
                  <div className="form-input-with-icon">
                    <input
                      type={mostrarCurrent ? "text" : "password"}
                      className="form-input"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value);
                        setFieldErrors({ ...fieldErrors, currentPassword: "" });
                        setError(null);
                      }}
                      disabled={guardando}
                    />
                    <button
                      type="button"
                      className="form-input-toggle"
                      onClick={() => setMostrarCurrent(!mostrarCurrent)}
                      disabled={guardando}
                    >
                      {mostrarCurrent ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                    </button>
                  </div>
                  {fieldErrors.currentPassword && (
                    <div className="form-error">{fieldErrors.currentPassword}</div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Nueva Contraseña (Opcional)</label>
                  <div className="form-input-with-icon">
                    <input
                      type={mostrarNew ? "text" : "password"}
                      className="form-input"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setFieldErrors({ ...fieldErrors, newPassword: "" });
                        setError(null);
                      }}
                      disabled={guardando}
                    />
                    <button
                      type="button"
                      className="form-input-toggle"
                      onClick={() => setMostrarNew(!mostrarNew)}
                      disabled={guardando}
                    >
                      {mostrarNew ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                    </button>
                  </div>
                  {fieldErrors.newPassword && (
                    <div className="form-error">{fieldErrors.newPassword}</div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Confirmar Nueva Contraseña</label>
                  <div className="form-input-with-icon">
                    <input
                      type={mostrarConfirm ? "text" : "password"}
                      className="form-input"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFieldErrors({ ...fieldErrors, confirmPassword: "" });
                        setError(null);
                      }}
                      disabled={guardando}
                    />
                    <button
                      type="button"
                      className="form-input-toggle"
                      onClick={() => setMostrarConfirm(!mostrarConfirm)}
                      disabled={guardando}
                    >
                      {mostrarConfirm ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <div className="form-error">{fieldErrors.confirmPassword}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: "32px" }} className="button-group">
              <button
                type="button"
                className="cancel-button"
                onClick={() => navigate(-1)}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="save-button"
                disabled={guardando}
              >
                {guardando && <div className="spinner"></div>}
                <span>{guardando ? "Guardando..." : "Guardar Cambios"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
