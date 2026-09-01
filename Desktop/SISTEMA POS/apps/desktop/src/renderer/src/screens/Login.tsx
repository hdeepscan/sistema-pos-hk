import { useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import logo from "../assets/logo.png";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";
import CheckoutPage from "./CheckoutPage";

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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Simple background accent */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-600 opacity-5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500 opacity-5 rounded-full blur-3xl"></div>
      </div>

      {/* Card Container */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src={logo} alt="Sistema POS HK" className="h-14 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {modo === "login" ? "Acceder" : "Crear Cuenta"}
          </h1>
          <p className="text-slate-400 text-sm">
            {modo === "login" ? "Bienvenido a tu punto de venta" : "Inicia tu negocio hoy"}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-950 border border-red-800 rounded-lg">
            <p className="text-red-200 text-sm font-medium">{error}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="text-red-300 text-xs mt-2 space-y-1">
                {Object.entries(fieldErrors).map(([key, msg]) => (
                  <li key={key}>• {msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Form Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6 space-y-4">
          <form onSubmit={modo === "login" ? handleLogin : handleRegistro} className="space-y-4">
            {/* Registro: Fields */}
            {modo === "registro" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
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
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors"
                  />
                  {fieldErrors.empresa && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.empresa}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
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
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors"
                  />
                  {fieldErrors.admin && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.admin}</p>
                  )}
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
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
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors"
              />
              {fieldErrors.email && (
                <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Contraseña {modo === "registro" && "(mín. 8)"}
              </label>
              <div className="relative">
                <input
                  type={mostrarPassword ? "text" : "password"}
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors({ ...fieldErrors, password: "" });
                  }}
                  minLength={modo === "registro" ? 8 : undefined}
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {mostrarPassword ? <IconoOjoTachado size={16} /> : <IconoOjo size={16} />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={cargando}
              className="w-full mt-6 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {cargando ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  {modo === "login" ? "Accediendo..." : "Procesando..."}
                </>
              ) : modo === "login" ? (
                "Acceder"
              ) : (
                "Continuar"
              )}
            </button>
          </form>

          {/* Login Toggle */}
          {modo === "login" && (
            <div className="text-center pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-xs">
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
                  className="text-amber-500 hover:text-amber-400 font-semibold transition-colors"
                >
                  Crear cuenta
                </button>
              </p>
            </div>
          )}

          {modo === "registro" && (
            <div className="text-center pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-xs">
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
                  className="text-amber-500 hover:text-amber-400 font-semibold transition-colors"
                >
                  Inicia sesión
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Footer Text */}
        <p className="text-center text-xs text-slate-500">
          © 2024 Sistema POS HK. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
