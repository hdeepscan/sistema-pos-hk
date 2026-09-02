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
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .login-card {
    background: white;
    border-radius: 12px;
    padding: 32px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  .login-logo {
    text-align: center;
    margin-bottom: 24px;
  }

  .login-logo img {
    height: 56px;
    width: auto;
  }

  .login-title {
    font-size: 24px;
    font-weight: bold;
    color: #1f2937;
    text-align: center;
    margin-bottom: 8px;
  }

  .login-subtitle {
    font-size: 14px;
    color: #6b7280;
    text-align: center;
    margin-bottom: 24px;
  }

  .login-error {
    background-color: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    color: #991b1b;
    font-size: 14px;
  }

  .login-error-list {
    margin-top: 8px;
    list-style: none;
    padding-left: 0;
  }

  .login-error-list li {
    font-size: 12px;
    margin-top: 4px;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  .form-input {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.2s;
  }

  .form-input:focus {
    outline: none;
    border-color: #d97706;
    box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.1);
  }

  .form-input-with-icon {
    position: relative;
  }

  .form-input-with-icon input {
    width: 100%;
  }

  .form-input-toggle {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .form-input-toggle:hover {
    color: #374151;
  }

  .form-error {
    font-size: 12px;
    color: #dc2626;
    margin-top: 4px;
  }

  .submit-button {
    background-color: #d97706;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .submit-button:hover:not(:disabled) {
    background-color: #b45309;
  }

  .submit-button:disabled {
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

  .login-toggle {
    text-align: center;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
    color: #6b7280;
  }

  .login-toggle button {
    background: none;
    border: none;
    color: #d97706;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    font-size: 13px;
  }

  .login-toggle button:hover {
    color: #b45309;
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
                  <label className="form-label">Nombre de la empresa</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tu tienda o negocio"
                    value={empresaNombre}
                    onChange={(e) => {
                      setEmpresaNombre(e.target.value);
                      setFieldErrors({ ...fieldErrors, empresa: "" });
                    }}
                  />
                  {fieldErrors.empresa && <div className="form-error">{fieldErrors.empresa}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label">Tu nombre</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Nombre del administrador"
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
                {modo === "login" ? "Email o usuario" : "Email"}
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
                Contraseña {modo === "registro" && "(mín. 8)"}
              </label>
              <div className="form-input-with-icon">
                <input
                  type={mostrarPassword ? "text" : "password"}
                  className="form-input"
                  placeholder="Tu contraseña"
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
                    : "Continuar"}
              </span>
            </button>
          </form>

          {/* Toggle */}
          <div className="login-toggle">
            {modo === "login" ? (
              <>
                ¿Nuevo usuario?{" "}
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
                  Crear cuenta
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
        </div>
      </div>
    </>
  );
}
