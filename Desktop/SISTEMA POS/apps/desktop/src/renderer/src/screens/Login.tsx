import { useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import logo from "../assets/logo.png";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";
import CheckoutPage from "./CheckoutPage";

const loginStyles = `
  .login-container {
    min-height: 100vh;
    background: linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .login-card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.1);
  }

  .login-logo {
    text-align: center;
    margin-bottom: 32px;
  }

  .login-logo img {
    height: 64px;
    width: auto;
    filter: drop-shadow(0 2px 8px rgba(59, 130, 246, 0.15));
  }

  .login-title {
    font-size: 28px;
    font-weight: 700;
    color: #0c3a7d;
    text-align: center;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }

  .login-subtitle {
    font-size: 14px;
    color: #64748b;
    text-align: center;
    margin-bottom: 32px;
  }

  .login-error {
    background: linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%);
    border: 1px solid #fecaca;
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 24px;
    color: #991b1b;
    font-size: 14px;
    font-weight: 500;
  }

  .login-error-list {
    margin-top: 8px;
    list-style: none;
    padding-left: 0;
  }

  .login-error-list li {
    font-size: 12px;
    margin-top: 6px;
    opacity: 0.9;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .form-input {
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.3s ease;
    background-color: #f8fafc;
  }

  .form-input::placeholder {
    color: #94a3b8;
  }

  .form-input:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: white;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
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
    transition: color 0.2s;
  }

  .form-input-toggle:hover {
    color: #3b82f6;
  }

  .form-error {
    font-size: 12px;
    color: #dc2626;
    margin-top: 4px;
    font-weight: 500;
  }

  .submit-button {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
  }

  .submit-button:hover:not(:disabled) {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
    transform: translateY(-2px);
  }

  .submit-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .submit-button:disabled {
    opacity: 0.7;
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

  .login-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 24px 0;
    color: #cbd5e1;
  }

  .login-divider::before,
  .login-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, #cbd5e1 0%, transparent 100%);
  }

  .login-divider::after {
    background: linear-gradient(90deg, transparent 0%, #cbd5e1 100%);
  }

  .login-divider-text {
    font-size: 12px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .login-toggle {
    text-align: center;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    font-size: 13px;
    color: #64748b;
  }

  .login-toggle button {
    background: none;
    border: none;
    color: #22c55e;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    font-size: 13px;
    transition: color 0.2s;
    text-decoration: underline;
  }

  .login-toggle button:hover {
    color: #16a34a;
  }

  .login-footer {
    text-align: center;
    margin-top: 24px;
    font-size: 11px;
    color: #94a3b8;
  }

  @media (max-width: 480px) {
    .login-card {
      padding: 28px 20px;
    }

    .login-title {
      font-size: 24px;
    }

    .submit-button {
      padding: 12px 14px;
      font-size: 13px;
    }
  }
`;

export default function Login() {
  const [modo, setModo] = useState<"login" | "registro" | "checkout">("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [adminNombre, setAdminNombre] = useState("");

  const setSesion = useSesionStore((s) => s.setSesion);
  const setRegistroDatos = useSesionStore((s) => s.setRegistroDatos);

  async function aplicarSesion(data: {
    token: string;
    usuario: any;
    empresa: any;
    sucursales?: any[];
  }) {
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
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const newErrors: { [key: string]: string } = {};
    if (!email) newErrors.email = "Email es requerido";
    if (!password) newErrors.password = "Contraseña es requerida";

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      setError("Por favor, completa todos los campos");
      return;
    }

    setCargando(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      await aplicarSesion(data);
    } catch (err: any) {
      const errorMsg = mensajeError(err, "No se pudo iniciar sesión");
      setError(errorMsg);
      setFieldErrors({ email: errorMsg });
    } finally {
      setCargando(false);
    }
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const newErrors: { [key: string]: string } = {};
    if (!empresaNombre) newErrors.empresa = "Nombre de empresa requerido";
    if (!adminNombre) newErrors.admin = "Nombre requerido";
    if (!email) newErrors.email = "Email requerido";
    if (!password) newErrors.password = "Contraseña requerida";
    if (password && password.length < 8) newErrors.password = "Mínimo 8 caracteres";

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      setError("Por favor, completa todos los campos correctamente");
      return;
    }

    setRegistroDatos({
      empresaNombre,
      adminNombre,
      adminEmail: email,
      adminPassword: password,
    });

    setModo("checkout");
  }

  if (modo === "checkout") {
    return <CheckoutPage onBack={() => setModo("registro")} isRegistration={true} />;
  }

  return (
    <>
      <style>{loginStyles}</style>
      <div className="login-container">
        <div className="login-card">
          {/* Logo */}
          <div className="login-logo">
            <img src={logo} alt="Sistema POS HK" />
          </div>

          {/* Title */}
          <h1 className="login-title">
            {modo === "login" ? "Acceder" : "Crear Cuenta"}
          </h1>
          <p className="login-subtitle">
            {modo === "login" ? "Bienvenido a tu punto de venta" : "Inicia tu negocio hoy"}
          </p>

          {/* Error */}
          {error && (
            <div className="login-error">
              {error}
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="login-error-list">
                  {Object.entries(fieldErrors).map(([key, msg]) => (
                    <li key={key}>• {msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Form */}
          <form className="login-form" onSubmit={modo === "login" ? handleLogin : handleRegistro}>
            {/* Registro fields */}
            {modo === "registro" && (
              <>
                <div className="form-group">
                  <label className="form-label">Empresa</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Nombre de tu tienda"
                    value={empresaNombre}
                    onChange={(e) => {
                      setEmpresaNombre(e.target.value);
                      setFieldErrors({ ...fieldErrors, empresa: "" });
                    }}
                  />
                  {fieldErrors.empresa && <div className="form-error">{fieldErrors.empresa}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label">Tu Nombre</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tu nombre completo"
                    value={adminNombre}
                    onChange={(e) => {
                      setAdminNombre(e.target.value);
                      setFieldErrors({ ...fieldErrors, admin: "" });
                    }}
                  />
                  {fieldErrors.admin && <div className="form-error">{fieldErrors.admin}</div>}
                </div>
              </>
            )}

            {/* Email */}
            <div className="form-group">
              <label className="form-label">
                {modo === "login" ? "Email" : "Correo Electrónico"}
              </label>
              <input
                type="email"
                className="form-input"
                placeholder={modo === "login" ? "tu@email.com" : "correo@empresa.com"}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors({ ...fieldErrors, email: "" });
                }}
              />
              {fieldErrors.email && <div className="form-error">{fieldErrors.email}</div>}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">
                Contraseña {modo === "registro" && "(8+ caracteres)"}
              </label>
              <div className="form-input-with-icon">
                <input
                  type={mostrarPassword ? "text" : "password"}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors({ ...fieldErrors, password: "" });
                  }}
                  minLength={modo === "registro" ? 8 : undefined}
                />
                <button
                  type="button"
                  className="form-input-toggle"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  title={mostrarPassword ? "Ocultar" : "Mostrar"}
                >
                  {mostrarPassword ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                </button>
              </div>
              {fieldErrors.password && <div className="form-error">{fieldErrors.password}</div>}
            </div>

            {/* Submit */}
            <button type="submit" className="submit-button" disabled={cargando}>
              {cargando && <div className="spinner"></div>}
              <span>
                {cargando
                  ? modo === "login"
                    ? "Accediendo..."
                    : "Procesando..."
                  : modo === "login"
                    ? "Acceder"
                    : "Crear Cuenta"}
              </span>
            </button>
          </form>

          {/* Divider */}
          <div className="login-divider">
            <span className="login-divider-text">O</span>
          </div>

          {/* Toggle */}
          <div className="login-toggle">
            {modo === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setModo("registro");
                    setError(null);
                    setFieldErrors({});
                    setEmail("");
                    setPassword("");
                  }}
                >
                  Regístrate aquí
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setModo("login");
                    setError(null);
                    setFieldErrors({});
                    setEmail("");
                    setPassword("");
                  }}
                >
                  Inicia sesión
                </button>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="login-footer">
            © 2024 Sistema POS HK • Tu negocio, bajo control
          </div>
        </div>
      </div>
    </>
  );
}
