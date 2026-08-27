import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useSesionStore, usePermiso } from "../lib/store";

export function MobileMenu() {
  const [abierto, setAbierto] = useState(false);
  const { sucursalActivaId, sucursales, empresa, usuario } = useSesionStore();
  const puedeVerCreditos = usePermiso("creditos.administrar");
  const puedeAdministrarUsuarios = usePermiso("usuarios.administrar");
  const puedeVerVentas = usePermiso("ventas.ver");
  const puedeAdministrarProductos = usePermiso("productos.administrar");
  const puedeAdministrarClientes = usePermiso("clientes.administrar");
  const puedeAdministrarGastos = usePermiso("gastos.administrar");
  const puedeVerReportes = usePermiso("reportes.ver");
  const puedeAdministrarConfiguracion = usePermiso("configuracion.administrar");
  const puedeVerContabilidad = usePermiso("contabilidad.ver");
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);

  const cerrarMenu = () => setAbierto(false);

  const modules = [
    { path: "/pos", label: "Punto de Venta", icon: "💰" },
    puedeVerVentas && { path: "/ventas", label: "Ventas", icon: "📊" },
    { path: "/caja", label: "Caja", icon: "🏦" },
    { path: "/notificaciones", label: "Notificaciones", icon: "🔔" },
    puedeAdministrarProductos && { path: "/productos", label: "Productos", icon: "📦" },
    puedeAdministrarProductos && { path: "/colecciones", label: "Colecciones", icon: "🎁" },
    puedeAdministrarClientes && { path: "/clientes", label: "Clientes", icon: "👥" },
    puedeVerCreditos && { path: "/creditos", label: "Créditos", icon: "💳" },
    puedeAdministrarGastos && { path: "/gastos", label: "Gastos", icon: "💸" },
    puedeVerReportes && { path: "/reportes", label: "Reportes", icon: "📈" },
    puedeAdministrarConfiguracion && { path: "/configuracion", label: "Configuración", icon: "⚙️" },
    puedeAdministrarUsuarios && { path: "/usuarios", label: "Usuarios", icon: "🔐" },
    puedeAdministrarProductos && { path: "/plantilla-recibo", label: "Recibos", icon: "🧾" },
    puedeVerContabilidad && { path: "/contabilidad", label: "Contabilidad", icon: "📑" },
  ].filter(Boolean);

  return (
    <>
      {/* Botón Hamburguesa */}
      <button
        onClick={() => setAbierto(!abierto)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          background: "var(--brand)",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          color: "#fff",
          zIndex: 1001,
        }}
        title="Menú"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Overlay */}
      {abierto && (
        <div
          onClick={cerrarMenu}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 1002,
            animation: "fadeIn 0.2s ease-out",
          }}
        />
      )}

      {/* Menú Lateral */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "280px",
          background: "var(--surface)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          zIndex: 1003,
          transform: abierto ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border-light)",
        }}
      >
        {/* Header del Menú */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid var(--border-light)",
            background: "var(--surface-secondary)",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" }}>
            {empresa?.nombre}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {sucursalActiva?.nombre} · {usuario?.nombre}
          </div>
        </div>

        {/* Módulos */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "12px",
          }}
        >
          {modules.map((mod) => (
            <NavLink
              key={mod.path}
              to={mod.path}
              onClick={cerrarMenu}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "600",
                color: isActive ? "#fff" : "var(--text)",
                background: isActive ? "var(--brand)" : "transparent",
                transition: "all 0.2s ease",
                border: "none",
                cursor: "pointer",
              })}
            >
              <span style={{ fontSize: "18px" }}>{mod.icon}</span>
              {mod.label}
            </NavLink>
          ))}
        </nav>

        {/* Botón Cerrar */}
        <button
          onClick={cerrarMenu}
          style={{
            padding: "12px 16px",
            background: "var(--surface-secondary)",
            border: "1px solid var(--border-light)",
            borderTop: "1px solid var(--border-light)",
            color: "var(--text)",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          Cerrar Menú
        </button>
      </div>
    </>
  );
}
