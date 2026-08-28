import { useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import logo from "../assets/logo.png";
import { mensajeError } from "../lib/errores";
import { IconoOjo, IconoOjoTachado } from "../lib/iconos";
import { electronAPI } from "../lib/electron-api";
import CheckoutPage from "./CheckoutPage";

// Campo de contraseña con boton de ojo para ver/ocultar.
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
    <div style={{ position: "relative" }}>
      <input
        placeholder={placeholder}
        type={ver ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        style={{ width: "100%", paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        title={ver ? "Ocultar contrasena" : "Ver contrasena"}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          boxShadow: "none",
          padding: 6,
          color: "var(--text-muted)",
          cursor: "pointer",
          display: "inline-flex",
        }}
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
            <CampoPassword placeholder="Contrasena" value={password} onChange={setPassword} />
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
            <CampoPassword
              placeholder="Contrasena (min. 8 caracteres)"
              value={password}
              onChange={setPassword}
              minLength={8}
            />
            {error && <span className="error-text">{error}</span>}
            <button type="submit" disabled={cargando}>
              {cargando ? "Continuando..." : "Continuar al pago"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
