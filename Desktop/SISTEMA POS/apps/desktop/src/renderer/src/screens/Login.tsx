import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { AdminLoginModal } from "../components/AdminLoginModal";
import logo from "../assets/CENTRALA.pdf.png";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";
import CheckoutPage from "./CheckoutPage";

const loginStyles = `
  .login-container {
    min-height: 100vh;
    background: #FFFFFF;
    background-size: 200% 100%;
    animation: subtleShineLogin 8s ease-in-out infinite;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    position: relative;
    overflow: hidden;
  }

  @keyframes subtleShineLogin {
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

  .login-container::before {
    content: '';
    position: absolute;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.04) 0%, transparent 70%);
    border-radius: 50%;
    top: -300px;
    right: -300px;
    pointer-events: none;
    animation: float 20s ease-in-out infinite;
  }

  .login-container::after {
    content: '';
    position: absolute;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.02) 0%, transparent 70%);
    border-radius: 50%;
    bottom: -250px;
    left: -250px;
    pointer-events: none;
    animation: float 25s ease-in-out infinite reverse;
  }

  @keyframes float {
    0%, 100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(30px, -30px);
    }
  }

  .login-card {
    background: #FFFFFF;
    border-radius: 20px;
    padding: 48px 40px;
    max-width: 480px;
    width: 100%;
    border: 1px solid rgba(59, 130, 246, 0.08);
    position: relative;
    z-index: 10;
    animation: floatUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
    will-change: transform, box-shadow;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);

    /* Sombra moderna y limpia */
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.05),
      0 8px 24px rgba(0, 0, 0, 0.08),
      0 16px 40px rgba(59, 130, 246, 0.08);
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

  .login-card:hover {
    transform: translateY(-4px);
    box-shadow:
      0 6px 16px rgba(0, 0, 0, 0.06),
      0 12px 32px rgba(0, 0, 0, 0.1),
      0 24px 48px rgba(59, 130, 246, 0.12);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .login-logo {
    text-align: center;
    margin-bottom: 32px;
  }

  .login-logo img {
    height: 64px;
    width: auto;
    filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.25));
  }

  .login-title {
    font-family: "Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 36px;
    font-weight: 700;
    color: #0f172a;
    text-align: center;
    margin-bottom: 12px;
    letter-spacing: -0.5px;
    line-height: 1.35;
  }

  .login-subtitle {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
    color: #64748b;
    text-align: center;
    margin-bottom: 32px;
    font-weight: 400;
    line-height: 1.5;
  }

  .login-error {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.05) 100%);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 24px;
    color: #dc2626;
    font-size: 13px;
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
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.95);
    box-shadow:
      0 0 0 3px rgba(59, 130, 246, 0.15),
      inset 0 0 0 1px rgba(59, 130, 246, 0.3),
      0 4px 12px rgba(59, 130, 246, 0.2);
  }

  .form-input:focus::placeholder {
    color: rgba(15, 23, 42, 0.3);
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
    color: #3b82f6;
  }

  .form-error {
    font-size: 12px;
    color: #ef4444;
    margin-top: 4px;
    font-weight: 500;
  }

  .submit-button {
    background: #3B82F6;
    color: white;
    border: none;
    border-radius: 12px;
    padding: 16px 20px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
    position: relative;
    overflow: hidden;
  }

  .submit-button::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    animation: shine 3s infinite;
  }

  @keyframes shine {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .submit-button:hover:not(:disabled) {
    background: #2563EB;
    box-shadow: 0 12px 30px rgba(59, 130, 246, 0.4);
    transform: translateY(-4px);
  }

  .submit-button:active:not(:disabled) {
    transform: translateY(-1px);
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

  .login-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 28px 0;
  }

  .login-divider::before,
  .login-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, #e2e8f0, transparent);
  }

  .login-divider-text {
    font-size: 12px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }

  .login-toggle {
    text-align: center;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e2e8f0;
    font-size: 13px;
    color: #64748b;
  }

  .login-toggle button {
    background: none;
    border: none;
    color: #3B82F6;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    font-size: 13px;
    transition: color 0.2s;
    text-decoration: none;
  }

  .login-toggle button:hover {
    color: #2563EB;
    text-decoration: underline;
  }

  .login-footer {
    text-align: center;
    margin-top: 28px;
    font-size: 11px;
    color: #cbd5e1;
    letter-spacing: 0.2px;
  }

  .google-button {
    width: 100%;
    background: #F9FAFB;
    border: 2px solid #E2E8F0;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .google-button:hover {
    border-color: #3b82f6;
    background: #FFFFFF;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
    transform: translateY(-2px);
  }

  .google-icon {
    width: 18px;
    height: 18px;
    filter: brightness(0) invert(1);
  }

  .admin-button {
    width: 100%;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
    margin-top: 12px;
  }

  .admin-button:hover {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    box-shadow: 0 10px 24px rgba(99, 102, 241, 0.45);
    transform: translateY(-2px);
  }

  .admin-button:active {
    transform: translateY(0);
  }

  .admin-icon {
    width: 16px;
    height: 16px;
  }

  @media (max-width: 480px) {
    .login-card {
      padding: 32px 24px;
    }

    .login-title {
      font-size: 28px;
    }

    .submit-button {
      padding: 14px 16px;
      font-size: 13px;
    }

    .google-button {
      padding: 12px 14px;
      font-size: 12px;
    }
  }
`;

export default function Login() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"login" | "registro" | "checkout">("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [adminNombre, setAdminNombre] = useState("");

  const setSesion = useSesionStore((s) => s.setSesion);
  const setRegistroDatos = useSesionStore((s) => s.setRegistroDatos);
  const usuario = useSesionStore((s) => s.usuario);

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

  async function handleGoogleSignIn() {
    // Reemplaza con tu Client ID de Google
    const GOOGLE_CLIENT_ID = "TU_GOOGLE_CLIENT_ID_AQUI";

    try {
      // Abre la ventana de autenticación de Google
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        window.location.origin
      )}&response_type=code&scope=openid%20email%20profile`;

      window.open(googleAuthUrl, "_blank", "width=500,height=600");

      // Después de que el usuario autorize, recibirás un código
      // Envía ese código a tu backend para obtener el token y crear/vincular la cuenta
    } catch (err) {
      console.error("Error al iniciar Google Sign-In:", err);
      setError("No se pudo conectar con Google. Intenta más tarde.");
    }
  }

  function handleAdminAccess() {
    // Abrir modal de login para administradores
    setAdminModalOpen(true);
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
            <img src={logo} alt="CENTRALA" />
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

          {modo === "login" && (
            <>
              {/* Divider */}
              <div className="login-divider">
                <span className="login-divider-text">O</span>
              </div>

              {/* Google Sign-In */}
              <button
                type="button"
                className="google-button"
                onClick={() => handleGoogleSignIn()}
                title="Inicia sesión con tu cuenta de Google"
              >
                <svg className="google-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#1f2937"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34a853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fbbc04"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#ea4335"/>
                </svg>
                <span>Google</span>
              </button>

              {/* Admin Access Button */}
              <button
                type="button"
                className="admin-button"
                onClick={handleAdminAccess}
                title="Acceso para administradores"
              >
                <svg className="admin-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1m0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3m0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                <span>Administradores</span>
              </button>
            </>
          )}

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
            © 2024 CENTRALA • Tu negocio, centralizado
          </div>
        </div>
      </div>

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
      />
    </>
  );
}
