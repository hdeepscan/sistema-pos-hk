import { useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import logo from "../assets/logo.png";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";
import CheckoutPage from "./CheckoutPage";

// Campo de contraseña con boton de ojo para ver/ocultar
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
    <div className="relative">
      <input
        type={ver ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        className="w-full bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/10 transition-all"
      />
      <button
        type="button"
        onClick={() => setVer(!ver)}
        title={ver ? "Ocultar contraseña" : "Ver contraseña"}
        className="absolute right-4 top-3.5 text-white/50 cursor-pointer hover:text-white transition-colors"
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
  const [rememberMe, setRememberMe] = useState(false);

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
    setCargando(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      await aplicarSesion(data);
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo iniciar sesión"));
    } finally {
      setCargando(false);
    }
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!empresaNombre || !adminNombre || !email || !password) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
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
    <div className="min-h-screen w-full flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center">
      {/* TARJETA DE CRISTAL (GLASS CARD) */}
      <div className="w-full max-w-md p-8 sm:p-10 rounded-[26px] bg-white/10 backdrop-blur-[24px] backdrop-saturate-[1.35] border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] mx-4">

        {/* Textos Principales */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Sistema POS HK" className="h-14" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">
            {modo === "login" ? "Welcome back" : "Bienvenido"}
          </h1>
          <p className="text-white/70 text-sm">
            {modo === "login"
              ? "Ingresa tus credenciales para continuar"
              : "Crea tu cuenta en Sistema POS"}
          </p>
        </div>

        {/* Formulario */}
        <form className="flex flex-col gap-4" onSubmit={modo === "login" ? handleLogin : handleRegistro}>

          {/* Registro: Campos adicionales */}
          {modo === "registro" && (
            <>
              <input
                type="text"
                placeholder="Nombre de la empresa"
                value={empresaNombre}
                onChange={(e) => setEmpresaNombre(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/10 transition-all"
              />
              <input
                type="text"
                placeholder="Tu nombre (administrador)"
                value={adminNombre}
                onChange={(e) => setAdminNombre(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/10 transition-all"
              />
            </>
          )}

          {/* Input Email */}
          <input
            type="email"
            placeholder={modo === "login" ? "Email o usuario" : "Tu email"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-white/5 border border-white/10 text-white placeholder-white/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/10 transition-all"
          />

          {/* Input Password */}
          <CampoPassword
            placeholder="Contraseña"
            value={password}
            onChange={setPassword}
            minLength={modo === "registro" ? 8 : undefined}
          />

          {/* Login: Opciones extra */}
          {modo === "login" && (
            <div className="flex items-center justify-between text-sm text-white/70 mt-1 mb-2">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded bg-white/10 border-white/20 text-purple-500 focus:ring-purple-400"
                />
                Recuérdame
              </label>
              <a href="#" className="hover:text-white transition-colors">
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm text-center">
              {error}
            </div>
          )}

          {/* Botón Principal */}
          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-gradient-to-r from-[#8b5cf6] to-[#a855f7] text-white font-semibold rounded-xl py-3.5 shadow-lg hover:shadow-purple-500/30 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cargando
              ? modo === "login"
                ? "Ingresando..."
                : "Continuando..."
              : modo === "login"
              ? "Ingresar"
              : "Continuar al pago"}
          </button>
        </form>

        {/* Separador (solo en Login) */}
        {modo === "login" && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-white/10"></div>
              <span className="text-white/50 text-xs font-medium">o continúa con</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>

            {/* Botones Sociales (Cristal) */}
            <div className="flex gap-4">
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white font-medium rounded-xl py-2.5 hover:bg-white/10 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white font-medium rounded-xl py-2.5 hover:bg-white/10 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 13.5c-.91 0-1.74.46-2.21 1.16-.47.71-.47 1.63 0 2.34.47.7 1.3 1.16 2.21 1.16.91 0 1.74-.46 2.21-1.16.47-.71.47-1.63 0-2.34-.47-.7-1.3-1.16-2.21-1.16zm-11 0c-.91 0-1.74.46-2.21 1.16-.47.71-.47 1.63 0 2.34.47.7 1.3 1.16 2.21 1.16.91 0 1.74-.46 2.21-1.16.47-.71.47-1.63 0-2.34-.47-.7-1.3-1.16-2.21-1.16zM5.5 2C4.12 2 3 3.12 3 4.5v15C3 20.88 4.12 22 5.5 22h13c1.38 0 2.5-1.12 2.5-2.5v-15C21 3.12 19.88 2 18.5 2h-13zM6 17h12v2H6v-2zm0-5h12v2H6v-2z" />
                </svg>
                Apple
              </button>
            </div>
          </>
        )}

        {/* Link de Registro/Login */}
        <p className="text-center text-sm text-white/70 mt-8">
          {modo === "login" ? (
            <>
              ¿Nuevo usuario?{" "}
              <button
                type="button"
                onClick={() => {
                  setModo("registro");
                  setError(null);
                }}
                className="text-white font-medium hover:underline"
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
                }}
                className="text-white font-medium hover:underline"
              >
                Inicia sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
