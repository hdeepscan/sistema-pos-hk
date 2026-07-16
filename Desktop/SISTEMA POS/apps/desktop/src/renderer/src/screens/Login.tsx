import { useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import logo from "../assets/logo.png";
import { mensajeError } from "../lib/errores";

export default function Login() {
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [empresaNombre, setEmpresaNombre] = useState("");
  const [adminNombre, setAdminNombre] = useState("");

  const setSesion = useSesionStore((s) => s.setSesion);
  const apiBaseUrl = useSesionStore((s) => s.apiBaseUrl);
  const setApiBaseUrl = useSesionStore((s) => s.setApiBaseUrl);

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
    await window.pos.setConfig({ token: data.token, empresaId: data.empresa.id });
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
    setCargando(true);
    try {
      const { data } = await api.post("/auth/registro-empresa", {
        empresaNombre,
        adminNombre,
        adminEmail: email,
        adminPassword: password,
      });
      await aplicarSesion(data);
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo registrar la empresa"));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={logo} alt="Sistema POS HK" style={{ height: 72 }} />
        </div>
        <p className="auth-tagline">Ventas, inventario y sucursales en un solo lugar</p>

        <div className="grid-form" style={{ marginBottom: 16 }}>
          <label>
            URL del servidor
            <input
              style={{ width: "100%" }}
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className={modo === "login" ? "" : "secondary"}
            onClick={() => setModo("login")}
            type="button"
          >
            Iniciar sesion
          </button>
          <button
            className={modo === "registro" ? "" : "secondary"}
            onClick={() => setModo("registro")}
            type="button"
          >
            Registrar empresa
          </button>
        </div>

        {modo === "login" ? (
          <form className="grid-form" onSubmit={handleLogin}>
            <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input
              placeholder="Contrasena"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <span className="error-text">{error}</span>}
            <button type="submit" disabled={cargando}>
              {cargando ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        ) : (
          <form className="grid-form" onSubmit={handleRegistro}>
            <input
              placeholder="Nombre de la empresa"
              value={empresaNombre}
              onChange={(e) => setEmpresaNombre(e.target.value)}
              required
            />
            <input
              placeholder="Tu nombre (administrador)"
              value={adminNombre}
              onChange={(e) => setAdminNombre(e.target.value)}
              required
            />
            <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input
              placeholder="Contrasena (min. 8 caracteres)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {error && <span className="error-text">{error}</span>}
            <button type="submit" disabled={cargando}>
              {cargando ? "Creando..." : "Crear empresa"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
