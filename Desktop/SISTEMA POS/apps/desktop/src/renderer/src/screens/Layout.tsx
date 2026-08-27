import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSesionStore, usePermiso } from "../lib/store";
import { usePedidoShopify } from "../lib/socket";
import { api } from "../lib/api";
import { reproducir } from "../lib/sonidos";
import type { PedidoShopifyEvent } from "@sistema-pos/shared";
import logo from "../assets/logo.png";
import { electronAPI } from "../lib/electron-api";

const INTERVALO_CREDITOS_MS = 5 * 60 * 1000;

interface LayoutProps extends PropsWithChildren {
  isMobile?: boolean;
  setIsMobile?: (value: boolean | null) => void;
}

export default function Layout({ children, isMobile = false, setIsMobile }: LayoutProps) {
  const { empresa, sucursales, sucursalActivaId, usuario, logout } = useSesionStore();
  const [mostrarMenuVistaToggle, setMostrarMenuVistaToggle] = useState(false);
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
  const [alertas, setAlertas] = useState<(PedidoShopifyEvent & { toastId: string })[]>([]);
  const [creditosVencidos, setCreditosVencidos] = useState(0);
  const [alertaCreditosOculta, setAlertaCreditosOculta] = useState(false);
  const [alertasCobro, setAlertasCobro] = useState(0);
  const [eventosHoy, setEventosHoy] = useState(0);
  const [pedidosPendientes, setPedidosPendientes] = useState(0);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [update, setUpdate] = useState<{ estado: string; version?: string; porcentaje?: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/shopify/config")
      .then(({ data }) => setShopDomain(data.conectado ? data.shopDomain : null))
      .catch(() => setShopDomain(null));
  }, []);

  const cargarPendientesShopify = useCallback(() => {
    api
      .get<{ pendientes: number }>("/pedidos-shopify/resumen")
      .then(({ data }) => setPedidosPendientes(data.pendientes))
      .catch(() => {});
  }, []);

  useEffect(() => {
    cargarPendientesShopify();
    const timer = setInterval(cargarPendientesShopify, INTERVALO_CREDITOS_MS);
    return () => clearInterval(timer);
  }, [cargarPendientesShopify]);

  usePedidoShopify(
    useCallback(
      (evt: PedidoShopifyEvent) => {
        void reproducir("pedido_shopify");
        setAlertas((prev) => [...prev, { ...evt, toastId: `${evt.ordenId}-${Date.now()}` }]);
        cargarPendientesShopify();
      },
      [cargarPendientesShopify]
    )
  );

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

  function verPedido(ordenId: string) {
    if (shopDomain) electronAPI.abrirEnlaceExterno(`https://${shopDomain}/admin/orders/${ordenId}`);
  }

  async function prepararPedido(alerta: PedidoShopifyEvent & { toastId: string }) {
    try {
      await api.patch(`/pedidos-shopify/${alerta.id}/atender`);
    } catch {
      // si ya se marco atendido desde otro lado, igual cerramos la alerta
    }
    cerrarAlerta(alerta.toastId);
    cargarPendientesShopify();
  }

  async function cerrarSesion() {
    await electronAPI.setConfig({ token: null, empresaId: null, sucursalId: null });
    logout();
  }

  return (
    <div className="app-shell">
      {!isMobile && <aside className="sidebar">
        <div className="sidebar-brand" style={{ padding: "28px 16px", borderBottom: "1px solid rgba(34, 197, 94, 0.08)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%" }}>
            <div style={{ borderRadius: 20, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(34, 197, 94, 0.1)" }}>
              <img src={logo} alt="Sistema POS HK" style={{ height: 88, width: 88, objectFit: "contain" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
                SISTEMA POS
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>Gestión de Ventas</div>
            </div>
          </div>
        </div>
        <div className="sidebar-context">
          <strong>{empresa?.nombre}</strong>
          {sucursalActiva?.nombre} · {usuario?.nombre}
        </div>

        <div className="sidebar-section-label">Operacion</div>
        <NavLink to="/pos" data-module="pos">Punto de venta</NavLink>
        {puedeVerVentas && <NavLink to="/ventas" data-module="ventas">Ventas</NavLink>}
        <NavLink to="/caja" data-module="caja">Caja</NavLink>
        <NavLink to="/notificaciones" data-module="notificaciones">
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
            <NavLink to="/productos" data-module="productos">Productos</NavLink>
            <NavLink to="/colecciones" data-module="colecciones">Colecciones</NavLink>
          </>
        )}

        <div className="sidebar-section-label">Negocio</div>
        {puedeAdministrarClientes && <NavLink to="/clientes" data-module="clientes">Clientes</NavLink>}
        {puedeVerCreditos && (
          <NavLink to="/creditos" data-module="creditos">
            Creditos{creditosVencidos > 0 && <span className="badge danger" style={{ marginLeft: 6 }}>{creditosVencidos}</span>}
          </NavLink>
        )}
        <NavLink to="/cotizaciones" data-module="cotizaciones">Cotizaciones</NavLink>
        <NavLink to="/proveedores" data-module="proveedores">Proveedores</NavLink>
        {puedeAdministrarGastos && <NavLink to="/gastos" data-module="gastos">Gastos</NavLink>}
        <NavLink to="/cuentas-bancarias" data-module="cuentas">Cuentas bancarias</NavLink>
        <NavLink to="/calendario" data-module="calendario">
          Calendario
          {eventosHoy > 0 && <span className="badge warning" style={{ marginLeft: 6 }}>{eventosHoy}</span>}
        </NavLink>
        {puedeVerReportes && <NavLink to="/reportes" data-module="reportes">Reportes</NavLink>}

        <div className="sidebar-section-label">Sistema</div>
        {puedeAdministrarUsuarios && <NavLink to="/usuarios" data-module="usuarios">Usuarios</NavLink>}
        {(puedeAdministrarUsuarios || puedeAdministrarConfiguracion) && <NavLink to="/auditoria" data-module="auditoria">Auditoria</NavLink>}
        <NavLink to="/configuracion" data-module="configuracion">Configuracion</NavLink>
        {puedeAdministrarConfiguracion && <NavLink to="/plantilla-recibo" data-module="plantilla">Plantilla del recibo</NavLink>}
        {puedeAdministrarConfiguracion && <NavLink to="/backups" data-module="backups">Copias de seguridad</NavLink>}
        <NavLink to="/shopify" data-module="shopify">Shopify</NavLink>
        <NavLink to="/meta-ads" data-module="metaads">Meta Ads</NavLink>

        {puedeVerContabilidad && (
          <>
            <div className="sidebar-section-label">Contabilidad</div>
            <NavLink to="/contabilidad">Contabilidad</NavLink>
          </>
        )}

        <div style={{ flex: 1 }} />
        <button className="secondary" onClick={cerrarSesion} type="button" style={{ marginTop: 12 }}>
          Cerrar sesion
        </button>
      </aside>}
      {/* Si está en mobile, no mostrar sidebar */}
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

      {alertas.length > 0 && (
        <div style={{ position: "fixed", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 100, width: 340 }}>
          {alertas.map((a) => (
            <div key={a.toastId} className="card pedido-alerta">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>🎉 ¡Nuevo pedido en Shopify!</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Pedido {a.nombre} · ${a.total.toLocaleString("es-CO")}
                  </div>
                  {a.clienteNombre && <div style={{ fontSize: 12.5 }}>Cliente: {a.clienteNombre}</div>}
                  {a.productos.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      {a.productos.map((p) => `${p.cantidad}x ${p.nombre}`).join(", ")}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {new Date(a.fecha).toLocaleTimeString("es-CO")}
                  </div>
                </div>
                <button className="secondary" style={{ padding: "2px 8px" }} onClick={() => cerrarAlerta(a.toastId)} type="button">
                  ✕
                </button>
              </div>
              <div className="toolbar" style={{ marginTop: 8 }}>
                {shopDomain && (
                  <button className="secondary" type="button" onClick={() => verPedido(a.ordenId)}>
                    Ver pedido
                  </button>
                )}
                <button type="button" onClick={() => prepararPedido(a)}>
                  Preparar pedido
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botón flotante para cambiar vista Desktop/Móvil */}
      {setIsMobile && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 999,
          }}
        >
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
            {mostrarMenuVistaToggle && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                  fontSize: "12px",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>
                  Vista: <strong>{isMobile ? "Móvil" : "Desktop"}</strong>
                </span>
                <button
                  onClick={() => {
                    setIsMobile();
                    setMostrarMenuVistaToggle(false);
                  }}
                  style={{
                    background: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: "600",
                  }}
                  title="Cambiar vista"
                >
                  {isMobile ? "Ver Desktop" : "Ver Móvil"}
                </button>
              </div>
            )}
            <button
              onClick={() => setMostrarMenuVistaToggle(!mostrarMenuVistaToggle)}
              style={{
                background: "var(--brand)",
                color: "#fff",
                border: "none",
                width: 48,
                height: 48,
                borderRadius: "50%",
                cursor: "pointer",
                fontSize: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(34, 197, 94, 0.25)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 8px 20px rgba(34, 197, 94, 0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(34, 197, 94, 0.25)";
              }}
              title="Cambiar entre vista Desktop y Móvil"
            >
              {isMobile ? "💻" : "📱"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
