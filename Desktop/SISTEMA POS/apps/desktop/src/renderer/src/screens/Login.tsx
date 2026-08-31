import { useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import logo from "../assets/logo.png";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";
import CheckoutPage from "./CheckoutPage";

function CampoPassword({
  value,
  onChange,
  placeholder,
  minLength,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minLength?: number;
  error?: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input
        type={ver ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        aria-invalid={!!error}
        aria-describedby={error ? "password-error" : undefined}
        className={`w-full !bg-white/5 !border !text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:!bg-white/10 transition-all backdrop-blur-sm ${
          error
            ? "!border-red-400/50 focus:ring-red-400"
            : "!border-white/10 focus:ring-amber-400"
        }`}
      />
      <button
        type="button"
        onClick={() => setVer(!ver)}
        className="absolute right-4 top-3.5 text-white/60 hover:text-white/80 transition-colors cursor-pointer"
        title={ver ? "Ocultar contraseña" : "Ver contraseña"}
      >
        {ver ? <IconoOjoTachado size={18} /> : <IconoOjo size={18} />}
      </button>
      {error && (
        <div id="password-error" className="mt-1 text-xs text-red-300 flex items-center gap-1">
          <span>⚠️ {error}</span>
        </div>
      )}
    </div>
  );
}

export default function Login() {
  const [modo, setModo] = useState<"login" | "registro" | "checkout">("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
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

    // Validar campos
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

    // Validar campos
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
    <div className="min-h-screen w-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative">
      {/* Animated gradient background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-amber-600 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDuration: "8s" }}></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-tl from-slate-600 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDuration: "10s" }}></div>
      </div>

      {/* Liquid Glass Card */}
      <div className="relative z-10 w-full max-w-md mx-4 px-6 py-8 sm:px-8 sm:py-10 rounded-2xl !bg-white/10 !backdrop-blur-[30px] !border !border-white/20 shadow-2xl hover:shadow-amber-500/20 transition-all duration-500">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src={logo} alt="Sistema POS HK" className="h-16 w-auto drop-shadow-lg" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily: "Cormorant, serif" }}>
            {modo === "login" ? "Bienvenido" : "Crear Cuenta"}
          </h1>
          <p className="text-white/60 text-sm sm:text-base" style={{ fontFamily: "Montserrat, sans-serif" }}>
            {modo === "login"
              ? "Accede a tu punto de venta"
              : "Inicia tu negocio hoy"}
          </p>
        </div>

        {/* Error Summary */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm sm:text-base"
            style={{ fontFamily: "Montserrat, sans-serif" }}
          >
            <div className="font-semibold mb-1">⚠️ {error}</div>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="list-disc list-inside text-xs sm:text-sm mt-2 opacity-90">
                {Object.entries(fieldErrors).map(([key, msg]) => (
                  <li key={key}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Form */}
        <form
          className="flex flex-col gap-4 mb-6"
          onSubmit={modo === "login" ? handleLogin : handleRegistro}
        >
          {/* Registro: Campos adicionales */}
          {modo === "registro" && (
            <>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2" style={{ fontFamily: "Montserrat, sans-serif" }}>
                  Nombre de la empresa
                </label>
                <input
                  type="text"
                  placeholder="Tu tienda o negocio"
                  value={empresaNombre}
                  onChange={(e) => {
                    setEmpresaNombre(e.target.value);
                    setFieldErrors({ ...fieldErrors, empresa: "" });
                  }}
                  aria-invalid={!!fieldErrors.empresa}
                  aria-describedby={fieldErrors.empresa ? "empresa-error" : undefined}
                  className={`w-full !bg-white/5 !border !text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:!bg-white/10 transition-all backdrop-blur-sm ${
                    fieldErrors.empresa ? "!border-red-400/50 focus:ring-red-400" : "!border-white/10 focus:ring-amber-400"
                  }`}
                />
                {fieldErrors.empresa && (
                  <div id="empresa-error" className="mt-1 text-xs text-red-300">⚠️ {fieldErrors.empresa}</div>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2" style={{ fontFamily: "Montserrat, sans-serif" }}>
                  Tu nombre
                </label>
                <input
                  type="text"
                  placeholder="Nombre del administrador"
                  value={adminNombre}
                  onChange={(e) => {
                    setAdminNombre(e.target.value);
                    setFieldErrors({ ...fieldErrors, admin: "" });
                  }}
                  aria-invalid={!!fieldErrors.admin}
                  className={`w-full !bg-white/5 !border !text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:!bg-white/10 transition-all backdrop-blur-sm ${
                    fieldErrors.admin ? "!border-red-400/50 focus:ring-red-400" : "!border-white/10 focus:ring-amber-400"
                  }`}
                />
              </div>
            </>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2" style={{ fontFamily: "Montserrat, sans-serif" }}>
              {modo === "login" ? "Email o usuario" : "Email"}
            </label>
            <input
              type="email"
              placeholder={modo === "login" ? "tu@email.com" : "correo@empresa.com"}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors({ ...fieldErrors, email: "" });
              }}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className={`w-full !bg-white/5 !border !text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:!bg-white/10 transition-all backdrop-blur-sm ${
                fieldErrors.email ? "!border-red-400/50 focus:ring-red-400" : "!border-white/10 focus:ring-amber-400"
              }`}
            />
            {fieldErrors.email && (
              <div id="email-error" className="mt-1 text-xs text-red-300">⚠️ {fieldErrors.email}</div>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-white/70 mb-2" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Contraseña {modo === "registro" && "(mín. 8 caracteres)"}
            </label>
            <CampoPassword
              placeholder="Tu contraseña segura"
              value={password}
              onChange={(v) => {
                setPassword(v);
                setFieldErrors({ ...fieldErrors, password: "" });
              }}
              minLength={modo === "registro" ? 8 : undefined}
              error={fieldErrors.password}
            />
          </div>

          {/* Remember me & Forgot password (Login only) */}
          {modo === "login" && (
            <div className="flex items-center justify-between text-xs sm:text-sm text-white/70 mt-2">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded !bg-white/10 !border-white/20 !accent-amber-500"
                />
                <span>Recuérdame</span>
              </label>
              <a href="#" className="hover:text-amber-400 transition-colors">
                ¿Olvidaste contraseña?
              </a>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={cargando}
            className="w-full mt-6 py-3 px-4 !bg-gradient-to-r !from-amber-600 !to-amber-700 !text-white font-semibold rounded-xl shadow-lg hover:shadow-amber-500/50 hover:!from-amber-500 hover:!to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 active:scale-95"
            style={{ fontFamily: "Montserrat, sans-serif" }}
          >
            {cargando ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {modo === "login" ? "Accediendo..." : "Continuando..."}
              </span>
            ) : modo === "login" ? (
              "Acceder"
            ) : (
              "Continuar al pago"
            )}
          </button>
        </form>

        {/* Divider */}
        {modo === "login" && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white/5 text-white/50" style={{ fontFamily: "Montserrat, sans-serif" }}>
                  O continúa con
                </span>
              </div>
            </div>

            {/* Social Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 py-2.5 px-4 !bg-white/5 !border !border-white/10 !text-white rounded-xl hover:!bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="hidden sm:inline text-xs">Google</span>
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 px-4 !bg-white/5 !border !border-white/10 !text-white rounded-xl hover:!bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 13.5c-.91 0-1.74.46-2.21 1.16-.47.71-.47 1.63 0 2.34.47.7 1.3 1.16 2.21 1.16.91 0 1.74-.46 2.21-1.16.47-.71.47-1.63 0-2.34-.47-.7-1.3-1.16-2.21-1.16zm-11 0c-.91 0-1.74.46-2.21 1.16-.47.71-.47 1.63 0 2.34.47.7 1.3 1.16 2.21 1.16.91 0 1.74-.46 2.21-1.16.47-.71.47-1.63 0-2.34-.47-.7-1.3-1.16-2.21-1.16zM5.5 2C4.12 2 3 3.12 3 4.5v15C3 20.88 4.12 22 5.5 22h13c1.38 0 2.5-1.12 2.5-2.5v-15C21 3.12 19.88 2 18.5 2h-13zM6 17h12v2H6v-2zm0-5h12v2H6v-2z" />
                </svg>
                <span className="hidden sm:inline text-xs">Apple</span>
              </button>
            </div>
          </>
        )}

        {/* Toggle Link */}
        <p className="text-center text-xs sm:text-sm text-white/70 mt-8" style={{ fontFamily: "Montserrat, sans-serif" }}>
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
                className="text-amber-400 font-semibold hover:text-amber-300 transition-colors"
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
                className="text-amber-400 font-semibold hover:text-amber-300 transition-colors"
              >
                Inicia sesión
              </button>
            </>
          )}
        </p>
      </div>

      {/* Footer */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap');
      `}</style>
    </div>
  );
}
