import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { mensajeError } from "../lib/errores";

interface ShopifyConfigResp {
  conectado: boolean;
  shopDomain?: string;
  clientId?: string;
  clientSecret?: string;
  sucursalEcommerceId?: string;
  ultimaSincronizacion?: string | null;
}

interface ImportStats {
  productosEncontrados: number;
  productosImportados: number;
  productosVinculados: number;
  duplicadosDetectados: number;
  variantesImportadas: number;
  errores: number;
  erroresDetalle: Array<{ producto: string; error: string }>;
}

interface ImportInventoryStats {
  ubicacionesEncontradas: number;
  ubicacionesImportadas: number;
  itemsDeInventarioImportados: number;
  nivelesDeInventarioImportados: number;
  errores: number;
  erroresDetalle: Array<{ ubicacion?: string; error: string }>;
}

interface ColaEstado {
  pendientes: number;
  procesando: number;
  completados: number;
  errores: number;
}

interface SyncHistorial {
  id: string;
  tipo: string;
  estado: string;
  intentos: number;
  errorMensaje?: string;
  creadoEn: string;
  procesadoEn?: string;
  producto?: { nombre: string; sku: string };
}

type PasoAsistente = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
type Pestaña = "configuracion" | "monitoreo" | "asistente";

export default function Shopify() {
  const { sucursales } = useSesionStore();
  const [config, setConfig] = useState<ShopifyConfigResp | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sucursalEcommerceId, setSucursalEcommerceId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [conectandoOAuth, setConectandoOAuth] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estados del asistente
  const [mostrarAsistente, setMostrarAsistente] = useState(false);
  const [pasoActual, setPasoActual] = useState<PasoAsistente>(1);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [inventoryStats, setInventoryStats] = useState<ImportInventoryStats | null>(null);
  const [importandoEnProgreso, setImportandoEnProgreso] = useState(false);
  const [pasosPorCompletar, setPasosPorCompletar] = useState<Record<PasoAsistente, boolean>>({
    1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false,
    9: false, 10: false, 11: false,
  });

  // Estado del dashboard
  const [pestaña, setPestaña] = useState<Pestaña>("configuracion");
  const [colaEstado, setColaEstado] = useState<ColaEstado | null>(null);
  const [historial, setHistorial] = useState<SyncHistorial[]>([]);
  const [cargandoMonitoreo, setCargandoMonitoreo] = useState(false);
  const [procesandoCola, setProcesandoCola] = useState(false);

  useEffect(() => {
    api.get<ShopifyConfigResp>("/shopify/config").then(({ data }) => {
      setConfig(data);
      if (data.shopDomain) setShopDomain(data.shopDomain);
      if (data.sucursalEcommerceId) setSucursalEcommerceId(data.sucursalEcommerceId);
    });
  }, []);

  // Cargar estado de la cola periódicamente
  useEffect(() => {
    if (pestaña !== "monitoreo") return;

    const cargarMonitoreo = async () => {
      try {
        setCargandoMonitoreo(true);
        const [estadoResp, historialResp] = await Promise.all([
          api.get<ColaEstado>("/shopify/cola-estado"),
          api.get<SyncHistorial[]>("/shopify/historial-sincronizacion?limit=20"),
        ]);
        setColaEstado(estadoResp.data);
        setHistorial(historialResp.data);
      } catch (err) {
        console.error("Error cargando monitoreo:", err);
      } finally {
        setCargandoMonitoreo(false);
      }
    };

    cargarMonitoreo();
    const interval = setInterval(cargarMonitoreo, 5000); // Actualizar cada 5s
    return () => clearInterval(interval);
  }, [pestaña]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api.post("/shopify/config", { shopDomain, clientId, clientSecret, sucursalEcommerceId });
      setMensaje("✅ Credenciales guardadas. Ahora conecta Shopify con OAuth.");
      const { data } = await api.get<ShopifyConfigResp>("/shopify/config");
      setConfig(data);
      setClientSecret("");
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar la configuracion"));
    } finally {
      setGuardando(false);
    }
  }

  async function conectarShopifyOAuth() {
    setConectandoOAuth(true);
    setError(null);
    setMensaje(null);
    try {
      // Esta llamada redirigirá al usuario al flujo OAuth de Shopify
      const response = await api.get("/shopify/connect");
      // El servidor redirige automáticamente, pero por si acaso:
      if (response.status === 200 && (response.data as any).redirect) {
        window.location.href = (response.data as any).redirect;
      }
    } catch (err: any) {
      // Puede que el servidor haya redirigido directamente
      console.log("Redirigiendo a Shopify OAuth...");
    } finally {
      setConectandoOAuth(false);
    }
  }

  async function iniciarImportacion() {
    setImportandoEnProgreso(true);
    setError(null);

    try {
      setPasoActual(2);
      await new Promise((r) => setTimeout(r, 1000));

      setPasoActual(3);
      setPasosPorCompletar((p) => ({ ...p, 1: true, 2: true }));
      await new Promise((r) => setTimeout(r, 800));

      setPasoActual(4);
      setPasosPorCompletar((p) => ({ ...p, 3: true }));
      await new Promise((r) => setTimeout(r, 800));

      setPasoActual(5);
      setPasosPorCompletar((p) => ({ ...p, 4: true }));

      const { data: stats } = await api.post<ImportStats>("/shopify/sync-inicial");
      setImportStats(stats);
      setPasosPorCompletar((p) => ({ ...p, 5: true }));
      await new Promise((r) => setTimeout(r, 800));

      setPasoActual(6);
      await new Promise((r) => setTimeout(r, 800));
      setPasosPorCompletar((p) => ({ ...p, 6: true }));

      setPasoActual(7);
      await new Promise((r) => setTimeout(r, 800));
      setPasosPorCompletar((p) => ({ ...p, 7: true }));

      setPasoActual(8);
      await new Promise((r) => setTimeout(r, 800));
      setPasosPorCompletar((p) => ({ ...p, 8: true }));

      setPasoActual(9);
      await new Promise((r) => setTimeout(r, 800));

      setPasoActual(10);
      const { data: invStats } = await api.post<ImportInventoryStats>("/shopify/sync-inventario");
      setInventoryStats(invStats);
      setPasosPorCompletar((p) => ({ ...p, 9: true }));
      await new Promise((r) => setTimeout(r, 800));

      setPasoActual(11);
      setPasosPorCompletar((p) => ({ ...p, 10: true, 11: true }));

      const { data: cfg } = await api.get<ShopifyConfigResp>("/shopify/config");
      setConfig(cfg);
    } catch (err: any) {
      setError(mensajeError(err, "Error durante la importación"));
      setPasoActual(11);
    } finally {
      setImportandoEnProgreso(false);
    }
  }

  async function procesarColaAhora() {
    try {
      setProcesandoCola(true);
      await api.post("/shopify/procesar-cola");
      setMensaje("✅ Cola procesada. Verifica el historial.");
      // Recargar monitoreo
      const [estadoResp, historialResp] = await Promise.all([
        api.get<ColaEstado>("/shopify/cola-estado"),
        api.get<SyncHistorial[]>("/shopify/historial-sincronizacion?limit=20"),
      ]);
      setColaEstado(estadoResp.data);
      setHistorial(historialResp.data);
    } catch (err: any) {
      setError(mensajeError(err, "Error procesando cola"));
    } finally {
      setProcesandoCola(false);
    }
  }

  async function reintentarTodos() {
    try {
      const res = await api.post<{ count: number }>("/shopify/reintentar-todos");
      setMensaje(`✅ ${res.data.count} cambios marcados para reintentar`);
      setTimeout(() => {
        const cargarMonitoreo = async () => {
          const [estadoResp, historialResp] = await Promise.all([
            api.get<ColaEstado>("/shopify/cola-estado"),
            api.get<SyncHistorial[]>("/shopify/historial-sincronizacion?limit=20"),
          ]);
          setColaEstado(estadoResp.data);
          setHistorial(historialResp.data);
        };
        cargarMonitoreo();
      }, 1000);
    } catch (err: any) {
      setError(mensajeError(err, "Error reintentando"));
    }
  }

  const pasos = [
    { numero: 1, titulo: "Conectar Shopify", icono: "🔐" },
    { numero: 2, titulo: "Analizar tienda", icono: "🔍" },
    { numero: 3, titulo: "Cantidad encontrada", icono: "📦" },
    { numero: 4, titulo: "Detectar duplicados", icono: "⚠️" },
    { numero: 5, titulo: "Importar productos", icono: "📥" },
    { numero: 6, titulo: "Importar variantes", icono: "🎨" },
    { numero: 7, titulo: "Vincular productos", icono: "🔗" },
    { numero: 8, titulo: "Resultado productos", icono: "✅" },
    { numero: 9, titulo: "Ubicaciones", icono: "📍" },
    { numero: 10, titulo: "Niveles de stock", icono: "📊" },
    { numero: 11, titulo: "Resultado final", icono: "🎉" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Integracion con Shopify</h2>
          <p>Trae tus productos y sincroniza el inventario de tu canal ecommerce</p>
        </div>
        {config?.conectado && <span className="badge success">Conectado</span>}
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        <button
          className={pestaña === "configuracion" ? "" : "secondary"}
          onClick={() => setPestaña("configuracion")}
          style={{ padding: "12px 16px", background: pestaña === "configuracion" ? "var(--bg-hover)" : "transparent" }}
        >
          ⚙️ Configuración
        </button>
        <button
          className={pestaña === "monitoreo" ? "" : "secondary"}
          onClick={() => setPestaña("monitoreo")}
          style={{ padding: "12px 16px", background: pestaña === "monitoreo" ? "var(--bg-hover)" : "transparent" }}
        >
          📊 Monitoreo {colaEstado && colaEstado.errores > 0 && <span className="badge danger" style={{ marginLeft: 6 }}>{colaEstado.errores}</span>}
        </button>
      </div>

      {/* PESTAÑA: CONFIGURACIÓN */}
      {pestaña === "configuracion" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h4 style={{ marginTop: 0 }}>Credenciales de la app (Shopify Dev Dashboard)</h4>
          <form className="grid-form" onSubmit={guardar}>
            <label>
              Dominio de la tienda
              <input
                placeholder="tu-tienda.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                required
              />
              <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--text-muted)" }}>
                Debe terminar en <strong>.myshopify.com</strong>
              </span>
            </label>
            <label>
              Client ID
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} required />
            </label>
            <label>
              Client Secret {config?.conectado && <span style={{ fontWeight: 400 }}>(guardado)</span>}
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={config?.conectado ? "Dejar vacio para no cambiarlo" : ""}
                required={!config?.conectado}
              />
            </label>
            <label>
              Sucursal para ecommerce
              <select value={sucursalEcommerceId} onChange={(e) => setSucursalEcommerceId(e.target.value)} required>
                <option value="">Selecciona</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            {error && <span className="error-text">{error}</span>}
            {mensaje && <span className="badge success" style={{ width: "fit-content" }}>{mensaje}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar credenciales"}
              </button>
              {config?.conectado && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setMostrarAsistente(true);
                    setPasoActual(1);
                  }}
                >
                  📥 Importar desde Shopify
                </button>
              )}
            </div>
          </form>

          {/* BOTÓN: CONECTAR SHOPIFY (OAuth) */}
          {config?.conectado && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
              <h4 style={{ marginTop: 0 }}>🔗 Autorizar con Shopify</h4>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Se abrirá la página de autorización de Shopify donde podrás autorizar la app.
              </p>
              {error && <span className="error-text">{error}</span>}
              {mensaje && <span className="badge success" style={{ width: "fit-content" }}>{mensaje}</span>}
              <button
                type="button"
                onClick={conectarShopifyOAuth}
                disabled={conectandoOAuth}
                className="secondary"
              >
                {conectandoOAuth ? "Redirigiendo..." : "🔑 Conectar Shopify"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA: MONITOREO */}
      {pestaña === "monitoreo" && (
        <div>
          {/* ESTADO DE LA COLA */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Pendientes</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
                {cargandoMonitoreo ? "..." : colaEstado?.pendientes || 0}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Procesando</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
                {cargandoMonitoreo ? "..." : colaEstado?.procesando || 0}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Completados</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>
                {cargandoMonitoreo ? "..." : colaEstado?.completados || 0}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Errores</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: colaEstado?.errores && colaEstado.errores > 0 ? "#ef4444" : "#10b981" }}>
                {cargandoMonitoreo ? "..." : colaEstado?.errores || 0}
              </div>
            </div>
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button onClick={procesarColaAhora} disabled={procesandoCola} className="secondary">
              {procesandoCola ? "Procesando..." : "🔄 Procesar cola ahora"}
            </button>
            {colaEstado?.errores && colaEstado.errores > 0 && (
              <button onClick={reintentarTodos} className="secondary" style={{ color: "#ef4444" }}>
                🔁 Reintentar {colaEstado.errores} errores
              </button>
            )}
          </div>

          {/* HISTORIAL */}
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Historial de Sincronización (últimos 20)</h4>
            {cargandoMonitoreo ? (
              <p>Cargando...</p>
            ) : historial.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>Sin cambios aún</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: 8 }}>Tipo</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Producto</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Estado</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Intentos</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 8 }}>
                          {item.tipo === "INVENTORY_UPDATE" && "📦"}
                          {item.tipo === "PRICE_UPDATE" && "💰"}
                          {item.tipo === "PRODUCT_UPDATE" && "✏️"}
                        </td>
                        <td style={{ padding: 8 }}>{item.producto?.nombre || "-"}</td>
                        <td style={{ padding: 8 }}>
                          <span
                            className={`badge ${
                              item.estado === "COMPLETADO" ? "success" : item.estado === "ERROR" ? "danger" : "warning"
                            }`}
                          >
                            {item.estado}
                          </span>
                        </td>
                        <td style={{ padding: 8 }}>{item.intentos}</td>
                        <td style={{ padding: 8, fontSize: 11, color: "var(--text-muted)" }}>
                          {new Date(item.creadoEn).toLocaleString("es-CO")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ASISTENTE MODAL */}
      {mostrarAsistente && (
        <div className="modal-backdrop" onClick={() => !importandoEnProgreso && setMostrarAsistente(false)}>
          <div className="card" style={{ width: 700, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>📦 Asistente de Importación desde Shopify</h3>

            {/* PASOS */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                {pasos.slice(0, 4).map((paso) => (
                  <div
                    key={paso.numero}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: `2px solid ${
                        pasosPorCompletar[paso.numero as PasoAsistente] ? "#10b981" : pasoActual >= paso.numero ? "#3b82f6" : "#e5e7eb"
                      }`,
                      backgroundColor:
                        pasosPorCompletar[paso.numero as PasoAsistente]
                          ? "#ecfdf5"
                          : pasoActual >= paso.numero
                            ? "#eff6ff"
                            : "#f9fafb",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{paso.icono}</div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{paso.titulo}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                {pasos.slice(4, 8).map((paso) => (
                  <div
                    key={paso.numero}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: `2px solid ${
                        pasosPorCompletar[paso.numero as PasoAsistente] ? "#10b981" : pasoActual >= paso.numero ? "#3b82f6" : "#e5e7eb"
                      }`,
                      backgroundColor:
                        pasosPorCompletar[paso.numero as PasoAsistente]
                          ? "#ecfdf5"
                          : pasoActual >= paso.numero
                            ? "#eff6ff"
                            : "#f9fafb",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{paso.icono}</div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{paso.titulo}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {pasos.slice(8).map((paso) => (
                  <div
                    key={paso.numero}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: `2px solid ${
                        pasosPorCompletar[paso.numero as PasoAsistente] ? "#10b981" : pasoActual >= paso.numero ? "#3b82f6" : "#e5e7eb"
                      }`,
                      backgroundColor:
                        pasosPorCompletar[paso.numero as PasoAsistente]
                          ? "#ecfdf5"
                          : pasoActual >= paso.numero
                            ? "#eff6ff"
                            : "#f9fafb",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{paso.icono}</div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{paso.titulo}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CONTENIDO POR PASO */}
            <div style={{ minHeight: 250, marginBottom: 20 }}>
              {pasoActual === 1 && <div><h4>🔐 Paso 1: Conectar Shopify</h4><p>Verificando credenciales...</p></div>}
              {pasoActual === 2 && <div><h4>🔍 Paso 2: Analizar tienda</h4><p>Escaneando productos...</p></div>}
              {pasoActual === 3 && importStats && (
                <div>
                  <h4>📦 Paso 3: Productos encontrados</h4>
                  <div style={{ padding: 16, backgroundColor: "#f0f9ff", borderRadius: 8, marginTop: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>{importStats.productosEncontrados}</div>
                    <div style={{ color: "var(--text-muted)" }}>productos encontrados</div>
                  </div>
                </div>
              )}
              {pasoActual === 4 && importStats && (
                <div>
                  <h4>⚠️ Paso 4: Detectar duplicados</h4>
                  <div style={{ padding: 16, backgroundColor: importStats.duplicadosDetectados > 0 ? "#fef3c7" : "#ecfdf5", borderRadius: 8, marginTop: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: importStats.duplicadosDetectados > 0 ? "#d97706" : "#10b981" }}>
                      {importStats.duplicadosDetectados} duplicados
                    </div>
                  </div>
                </div>
              )}
              {pasoActual === 5 && (
                <div>
                  <h4>📥 Paso 5: Importando productos</h4>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ height: 8, borderRadius: 4, backgroundColor: "#e5e7eb", overflow: "hidden" }}>
                      <div style={{ height: "100%", backgroundColor: "#3b82f6", width: importStats ? `${(importStats.productosImportados / importStats.productosEncontrados) * 100}%` : "0%", transition: "width 0.3s" }} />
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                      {importStats?.productosImportados || 0} / {importStats?.productosEncontrados || 0}
                    </div>
                  </div>
                </div>
              )}
              {pasoActual === 11 && importStats && inventoryStats && (
                <div>
                  <h4>🎉 Importación completada</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div style={{ padding: 12, backgroundColor: "#ecfdf5", borderRadius: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{importStats.productosImportados}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Productos</div>
                    </div>
                    <div style={{ padding: 12, backgroundColor: "#dbeafe", borderRadius: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#0284c7" }}>{inventoryStats.nivelesDeInventarioImportados}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Niveles</div>
                    </div>
                  </div>
                </div>
              )}
              {pasoActual > 11 || (pasoActual < 11 && pasoActual > 5 && pasoActual !== 3 && pasoActual !== 4) && (
                <div><h4>✅ Paso {pasoActual}: Procesando...</h4><p>Por favor espera.</p></div>
              )}
            </div>

            {/* BOTONES */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {pasoActual < 11 ? (
                <>
                  <button type="button" className="secondary" onClick={() => setMostrarAsistente(false)} disabled={importandoEnProgreso}>
                    Cancelar
                  </button>
                  {pasoActual === 1 && (
                    <button type="button" onClick={iniciarImportacion} disabled={importandoEnProgreso}>
                      {importandoEnProgreso ? "Importando..." : "Iniciar"}
                    </button>
                  )}
                </>
              ) : (
                <button type="button" onClick={() => setMostrarAsistente(false)}>
                  🎉 Listo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
