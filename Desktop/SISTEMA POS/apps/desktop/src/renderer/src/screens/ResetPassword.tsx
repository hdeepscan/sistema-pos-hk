import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import logo from "../assets/CENTRALA.pdf.png";

const resetPasswordStyles = `
  .reset-password-container {
    min-height: 100vh;
    background: linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    position: relative;
  }

  .reset-password-container::before {
    content: '';
    position: absolute;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.04) 0%, transparent 70%);
    border-radius: 50%;
    top: -300px;
    right: -300px;
    pointer-events: none;
  }

  .reset-password-card {
    background: #FFFFFF;
    border-radius: 20px;
    padding: 48px 40px;
    max-width: 480px;
    width: 100%;
    border: 1px solid rgba(99, 102, 241, 0.08);
    position: relative;
    z-index: 10;
    animation: floatUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.05),
      0 8px 24px rgba(0, 0, 0, 0.08),
      0 16px 40px rgba(99, 102, 241, 0.08);
  }

  @keyframes floatUp {
    from {
      opacity: 0;
      transform: translateY(60px) scale(0.95);
      filter: blur(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0);
    }
  }

  .reset-password-logo {
    text-align: center;
    margin-bottom: 32px;
  }

  .reset-password-logo img {
    height: 64px;
    width: auto;
  }

  .reset-password-title {
    font-size: 32px;
    font-weight: 700;
    color: #0f172a;
    text-align: center;
    margin-bottom: 12px;
  }

  .reset-password-subtitle {
    font-size: 14px;
    color: #64748b;
    text-align: center;
    margin-bottom: 32px;
  }

  .reset-password-error {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.05) 100%);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 24px;
    color: #dc2626;
    font-size: 13px;
    font-weight: 500;
  }

  .reset-password-success {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(22, 163, 74, 0.05) 100%);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 24px;
    color: #16a34a;
    font-size: 13px;
    font-weight: 500;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 18px;
  }

  .form-label {
    font-size: 12px;
    font-weight: 700;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .form-input {
    background: #F9FAFB;
    border: 2px solid #E2E8F0;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    color: #0f172a;
  }

  .form-input::placeholder {
    color: rgba(15, 23, 42, 0.4);
  }

  .form-input:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(255, 255, 255, 0.95);
    box-shadow:
      0 0 0 3px rgba(99, 102, 241, 0.15),
      inset 0 0 0 1px rgba(99, 102, 241, 0.3),
      0 4px 12px rgba(99, 102, 241, 0.2);
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

  .form-error {
    font-size: 12px;
    color: #ef4444;
    margin-top: 4px;
    font-weight: 500;
  }

  .reset-button {
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

  .reset-button:hover:not(:disabled) {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    box-shadow: 0 12px 30px rgba(99, 102, 241, 0.5);
    transform: translateY(-2px);
  }

  .reset-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
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

  .reset-footer {
    text-align: center;
    margin-top: 24px;
  }

  .reset-footer a {
    color: #6366f1;
    text-decoration: none;
    font-weight: 600;
    transition: color 0.2s;
  }

  .reset-footer a:hover {
    color: #4f46e5;
  }
`;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarConfirm, setMostrarConfirm] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Token inválido o expirado");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("Por favor completa ambos campos");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setCargando(true);
    try {
      await api.post("/auth/reset-password", {
        token,
        newPassword,
      });
      setSuccess(true);
      setTimeout(() => navigate("/"), 3000);
    } catch (err: any) {
      const errorMsg = mensajeError(err, "No se pudo restablecer la contraseña");
      setError(errorMsg);
    } finally {
      setCargando(false);
    }
  }

  if (!token) {
    return (
      <>
        <style>{resetPasswordStyles}</style>
        <div className="reset-password-container">
          <div className="reset-password-card">
            <div className="reset-password-logo">
              <img src={logo} alt="CENTRALA" />
            </div>
            <h1 className="reset-password-title">Enlace Inválido</h1>
            <p className="reset-password-subtitle">El enlace de recuperación ha expirado o es inválido</p>
            <div className="reset-password-error">
              Por favor solicita un nuevo enlace de recuperación desde la pantalla de login
            </div>
            <div className="reset-footer">
              <a href="/">Volver al Login</a>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{resetPasswordStyles}</style>
      <div className="reset-password-container">
        <div className="reset-password-card">
          <div className="reset-password-logo">
            <img src={logo} alt="CENTRALA" />
          </div>

          <h1 className="reset-password-title">🔐 Nueva Contraseña</h1>
          <p className="reset-password-subtitle">
            Establece una nueva contraseña para tu cuenta
          </p>

          {error && <div className="reset-password-error">{error}</div>}
          {success && (
            <div className="reset-password-success">
              ✅ Contraseña restablecida correctamente. Redirigiendo...
            </div>
          )}

          {!success && (
            <form onSubmit={handleResetPassword}>
              {/* Nueva Contraseña */}
              <div className="form-group">
                <label className="form-label">Nueva Contraseña</label>
                <div className="form-input-with-icon">
                  <input
                    type={mostrarPassword ? "text" : "password"}
                    className="form-input"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError(null);
                    }}
                    disabled={cargando}
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="form-input-toggle"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    disabled={cargando}
                  >
                    {mostrarPassword ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirmar Contraseña */}
              <div className="form-group">
                <label className="form-label">Confirmar Contraseña</label>
                <div className="form-input-with-icon">
                  <input
                    type={mostrarConfirm ? "text" : "password"}
                    className="form-input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError(null);
                    }}
                    disabled={cargando}
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="form-input-toggle"
                    onClick={() => setMostrarConfirm(!mostrarConfirm)}
                    disabled={cargando}
                  >
                    {mostrarConfirm ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="reset-button"
                disabled={cargando}
              >
                {cargando && <div className="spinner"></div>}
                <span>{cargando ? "Procesando..." : "Restablecer Contraseña"}</span>
              </button>
            </form>
          )}

          <div className="reset-footer">
            <a href="/">Volver al Login</a>
          </div>
        </div>
      </div>
    </>
  );
}
