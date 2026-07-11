import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";
import { useSesionStore } from "../lib/store";

export default function Layout({ children }: PropsWithChildren) {
  const { empresa, sucursales, sucursalActivaId, usuario, logout } = useSesionStore();
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);

  async function cerrarSesion() {
    await window.pos.setConfig({ token: null, empresaId: null, sucursalId: null });
    logout();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{empresa?.nombre}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>
          {sucursalActiva?.nombre} · {usuario?.nombre}
        </div>
        <NavLink to="/pos">Punto de venta</NavLink>
        <NavLink to="/inventario">Inventario</NavLink>
        <NavLink to="/configuracion">Configuracion</NavLink>
        <div style={{ flex: 1 }} />
        <button className="secondary" onClick={cerrarSesion} type="button">
          Cerrar sesion
        </button>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
