import { useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import logo from "../assets/logo.png";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";
import CheckoutPage from "./CheckoutPage";

// Campo de contraseña con boton de ojo para ver/ocultar (Glassmorphism)
function CampoPassword({
  value,
  onChange,
  placeholder,
  minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minLength?: number;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative w-full">
      <input
        placeholder={placeholder}
        type={ver ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        title={ver ? "Ocultar contraseña" : "Ver contraseña"}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-none border-none text-white/60 hover:text-white/80 cursor-pointer transition-colors flex items-center justify-center"
      >
        {ver ? <IconoOjoTachado size={18} /> : <IconoOjo size={18} />}
      </button>
    </div>
  );
}

export default function Login() {
  const [modo, setModo] = useState<"login" | "registro" | "checkout">("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [empresaNombre, setEmpresaNombre] = useState("");
  const [adminNombre, setAdminNombre] = useState("");

  const setSesion = useSesionStore((s) => s.setSesion);
  const apiBaseUrl = useSesionStore((s) => s.apiBaseUrl);
  const setApiBaseUrl = useSesionStore((s) => s.setApiBaseUrl);
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

    // Save config (Electron or web)
    await electronAPI.setConfig({
      token: data.token,
      empresaId: data.empresa.id
    });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      await aplicarSesion(data);
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo iniciar sesion"));
    } finally {
      setCargando(false);
    }
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validar campos
    if (!empresaNombre || !adminNombre || !email || !password) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    // Guardar datos en el store y cambiar a modo checkout
    setRegistroDatos({
      empresaNombre,
      adminNombre,
      adminEmail: email,
      adminPassword: password,
    });

    setModo("checkout");
  }

  // Mostrar CheckoutPage si está en modo checkout
  if (modo === "checkout") {
    return (
      <div>
        <CheckoutPage onBack={() => setModo("registro")} isRegistration={true} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage: "linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%)",
        backgroundSize: "400% 400%",
        animation: "gradient 15s ease infinite",
      }}
    >
      <style>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {/* Glassmorphism Card */}
      <div className="w-full max-w-md mx-4">
        <div className="bg-white/10 backdrop-blur-[24px] backdrop-saturate-[1.35] border border-white/20 rounded-[26px] shadow-2xl p-10">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src={logo} alt="Sistema POS HK" className="h-16" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {modo === "login" ? "Welcome back" : "Bienvenido"}
            </h1>
            <p className="text-white/70 text-sm">
              {modo === "login"
                ? "Ingresa tus credenciales para continuar"
                : "Crea tu cuenta para comenzar"}
            </p>
          </div>

          {/* Tab Buttons */}
          <div className="flex gap-3 mb-8">
            <button
              onClick={() => setModo("login")}
              type="button"
              className={`flex-1 py-2 px-4 rounded-xl font-medium text-sm transition-all ${
                modo === "login"
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                  : "bg-white/5 border border-white/10 text-white/70 hover:text-white/90 hover:bg-white/10"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => setModo("registro")}
              type="button"
              className={`flex-1 py-2 px-4 rounded-xl font-medium text-sm transition-all ${
                modo === "registro"
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                  : "bg-white/5 border border-white/10 text-white/70 hover:text-white/90 hover:bg-white/10"
              }`}
            >
              Registrar
            </button>
          </div>

          {/* Login Form */}
          {modo === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email Input */}
              <input
                placeholder="tu@email.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
              />

              {/* Password Input */}
              <CampoPassword
                placeholder="Contraseña"
                value={password}
                onChange={setPassword}
              />

              {/* Remember & Forgot Password */}
              <div className="flex items-center justify-between text-xs text-white/70">
                <label className="flex items-center gap-2 cursor-pointer hover:text-white/90">
                  <input type="checkbox" className="w-4 h-4 rounded accent-purple-500" />
                  <span>Recuérdame</span>
                </label>
                <a href="#" className="hover:text-white/90 transition-colors">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm">
                  {error}
                </div>
              )}

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={cargando}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white/10 text-white/60">o continúa con</span>
                </div>
              </div>

              {/* Social Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="py-3 px-4 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
                <button
                  type="button"
                  className="py-3 px-4 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 13.5c-.91 0-1.74.46-2.21 1.16-.47.71-.47 1.63 0 2.34.47.7 1.3 1.16 2.21 1.16.91 0 1.74-.46 2.21-1.16.47-.71.47-1.63 0-2.34-.47-.7-1.3-1.16-2.21-1.16zm-11 0c-.91 0-1.74.46-2.21 1.16-.47.71-.47 1.63 0 2.34.47.7 1.3 1.16 2.21 1.16.91 0 1.74-.46 2.21-1.16.47-.71.47-1.63 0-2.34-.47-.7-1.3-1.16-2.21-1.16zM5.5 2C4.12 2 3 3.12 3 4.5v15C3 20.88 4.12 22 5.5 22h13c1.38 0 2.5-1.12 2.5-2.5v-15C21 3.12 19.88 2 18.5 2h-13zM6 17h12v2H6v-2zm0-5h12v2H6v-2z"/>
                  </svg>
                  Apple
                </button>
              </div>
            </form>
          ) : (
            /* Register Form */
            <form onSubmit={handleRegistro} className="space-y-4">
              <input
                placeholder="Nombre de la empresa"
                value={empresaNombre}
                onChange={(e) => setEmpresaNombre(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
              />

              <input
                placeholder="Tu nombre (administrador)"
                value={adminNombre}
                onChange={(e) => setAdminNombre(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
              />

              <input
                placeholder="tu@email.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
              />

              <CampoPassword
                placeholder="Contraseña (min. 8 caracteres)"
                value={password}
                onChange={setPassword}
                minLength={8}
              />

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {cargando ? "Continuando..." : "Continuar al pago"}
              </button>

              <p className="text-center text-xs text-white/60">
                Al registrarte, aceptas nuestros términos de servicio
              </p>
            </form>
          )}
        </div>

        {/* Footer Text */}
        <p className="text-center text-white/60 text-xs mt-6">
          Sistema POS HK © 2024 • Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
