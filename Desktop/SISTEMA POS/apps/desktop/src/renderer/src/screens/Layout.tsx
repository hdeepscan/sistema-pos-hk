import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSesionStore, usePermiso } from "../lib/store";
import { api } from "../lib/api";
import { reproducir } from "../lib/sonidos";
import logo from "../assets/logo.png";
import { electronAPI } from "../lib/electron-api";

const INTERVALO_CREDITOS_MS = 5 * 60 * 1000;

export default function Layout({ children }: PropsWithChildren) {
  const { empresa, sucursales, sucursalActivaId, usuario, logout } = useSesionStore();
  const puedeVerCreditos = usePermiso("creditos.administrar");
  const puedeAdministrarUsuarios = usePermiso("usuarios.administrar");
  const puedeVerVentas = usePermiso("ventas.ver");
  const puedeAdministrarProductos = usePermiso("productos.administrar");
  const puedeAdministrarClientes = usePermiso("clientes.administrar");
  const puedeAdministrarGastos = usePermiso("gastos.administrar");
  const puedeVerReportes = usePermiso("reportes.ver");
  const puedeAdministrarConfiguracion = usePermiso("configuracion.administrar");
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);
  const [creditosVencidos, setCreditosVencidos] = useState(0);
  const [alertaCreditosOculta, setAlertaCreditosOculta] = useState(false);
  const [alertasCobro, setAlertasCobro] = useState(0);
  const [eventosHoy, setEventosHoy] = useState(0);
  const [update, setUpdate] = useState<{ estado: string; version?: string; porcentaje?: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!puedeVerCreditos) return;
    let activo = true;
    const cargar = () => {
      api
        .get<{ vencidos: number }>("/creditos/resumen")
        .then(({ data }) => {
          if (!activo) return;
          setCreditosVencidos((anterior) => {
            if (data.vencidos > anterior) void reproducir("credito_vencido");
            return data.vencidos;
          });
        })
        .catch(() => {});
      api
        .get<{ alertas: number }>("/creditos-manuales/resumen")
        .then(({ data }) => {
          if (activo) setAlertasCobro(data.alertas);
        })
        .catch(() => {});
      api
        .get<{ pendientesHoy: number }>("/calendario/resumen")
        .then(({ data }) => {
          if (activo) setEventosHoy(data.pendientesHoy);
        })
        .catch(() => {});
    };
    cargar();
    const timer = setInterval(cargar, INTERVALO_CREDITOS_MS);
    return () => {
      activo = false;
      clearInterval(timer);
    };
  }, [puedeVerCreditos]);

  // Aviso global de actualizacion (se muestra en cualquier pantalla).
  useEffect(() => electronAPI.onEstadoActualizacion((e) => setUpdate(e)), []);

  function cerrarAlerta(toastId: string) {
    setAlertas((prev) => prev.filter((a) => a.toastId !== toastId));
  }

  async function cerrarSesion() {
    await electronAPI.setConfig({ token: null, empresaId: null, sucursalId: null });
    logout();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="Sistema POS HK" style={{ height: 40, background: "#fff", borderRadius: 8, padding: 4 }} />
        </div>
        <div className="sidebar-context">
          <strong>{empresa?.nombre}</strong>
          {sucursalActiva?.nombre} · {usuario?.nombre}
        </div>

        <div className="sidebar-section-label">Operacion</div>
        <NavLink to="/pos">Punto de venta</NavLink>
        {puedeVerVentas && <NavLink to="/ventas">Ventas</NavLink>}
        <NavLink to="/caja">Caja</NavLink>
        <NavLink to="/notificaciones">
          Notificaciones
          {alertasCobro > 0 && (
            <span className="badge warning" style={{ marginLeft: 6 }}>
              {alertasCobro}
            </span>
          )}
        </NavLink>

        <div className="sidebar-section-label">Catalogo</div>
        {puedeAdministrarProductos && (
          <>
            <NavLink to="/productos">Productos</NavLink>
            <NavLink to="/colecciones">Colecciones</NavLink>
          </>
        )}

        <div className="sidebar-section-label">Negocio</div>
        {puedeAdministrarClientes && <NavLink to="/clientes">Clientes</NavLink>}
        {puedeVerCreditos && (
          <NavLink to="/creditos">
            Creditos{creditosVencidos > 0 && <span className="badge danger" style={{ marginLeft: 6 }}>{creditosVencidos}</span>}
          </NavLink>
        )}
        <NavLink to="/proveedores">Proveedores</NavLink>
        {puedeAdministrarGastos && <NavLink to="/gastos">Gastos</NavLink>}
        <NavLink to="/cuentas-bancarias">Cuentas bancarias</NavLink>
        <NavLink to="/calendario">
          Calendario
          {eventosHoy > 0 && <span className="badge warning" style={{ marginLeft: 6 }}>{eventosHoy}</span>}
        </NavLink>
        {puedeVerReportes && <NavLink to="/reportes">Reportes</NavLink>}

        <div className="sidebar-section-label">Sistema</div>
        {puedeAdministrarUsuarios && <NavLink to="/usuarios">Usuarios</NavLink>}
        {(puedeAdministrarUsuarios || puedeAdministrarConfiguracion) && <NavLink to="/auditoria">Auditoria</NavLink>}
        <NavLink to="/configuracion">Configuracion</NavLink>
        {puedeAdministrarConfiguracion && <NavLink to="/plantilla-recibo">Plantilla del recibo</NavLink>}
        {puedeAdministrarConfiguracion && <NavLink to="/backups">Copias de seguridad</NavLink>}
        <NavLink to="/meta-ads">Meta Ads</NavLink>

        <div style={{ flex: 1 }} />
        <button className="secondary" onClick={cerrarSesion} type="button" style={{ marginTop: 12 }}>
          Cerrar sesion
        </button>
      </aside>
      <main className="main-content">
        {update && (update.estado === "disponible" || update.estado === "descargando" || update.estado === "listo-para-instalar") && (
          <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--brand, #4f46e5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  {update.estado === "listo-para-instalar"
                    ? `Actualizacion lista (v${update.version ?? ""})`
                    : update.estado === "descargando"
                      ? `Descargando actualizacion... ${update.porcentaje ?? 0}%`
                      : `Hay una version nueva disponible${update.version ? ` (v${update.version})` : ""}`}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {update.estado === "listo-para-instalar"
                    ? "Instalala cuando quieras; se reinicia el programa."
                    : "Puedes actualizar sin perder informacion."}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {update.estado === "disponible" && (
                  <button type="button" onClick={() => electronAPI.descargarActualizacion()}>
                    Descargar
                  </button>
                )}
                {update.estado === "listo-para-instalar" && (
                  <button type="button" onClick={() => electronAPI.instalarActualizacion()}>
                    Instalar y reiniciar
                  </button>
                )}
                <button type="button" className="secondary" onClick={() => setUpdate(null)}>
                  Ahora no
                </button>
              </div>
            </div>
          </div>
        )}
        {creditosVencidos > 0 && !alertaCreditosOculta && (
          <div className="card pedido-alerta" style={{ marginBottom: 16, borderLeftColor: "var(--danger)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  ⚠ Tienes {creditosVencidos} credito{creditosVencidos > 1 ? "s" : ""} vencido{creditosVencidos > 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Revisalos para gestionar el cobro cuanto antes.</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={() => navigate("/creditos")}>
                  Ver creditos
                </button>
                <button className="secondary" type="button" onClick={() => setAlertaCreditosOculta(true)}>
                  Ocultar
                </button>
              </div>
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
