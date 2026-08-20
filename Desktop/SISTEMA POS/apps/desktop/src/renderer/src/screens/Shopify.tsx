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

type PasoAsistente = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export default function Shopify() {
  const { sucursales } = useSesionStore();
  const [config, setConfig] = useState<ShopifyConfigResp | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sucursalEcommerceId, setSucursalEcommerceId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estados del asistente
  const [mostrarAsistente, setMostrarAsistente] = useState(false);
  const [pasoActual, setPasoActual] = useState<PasoAsistente>(1);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [inventoryStats, setInventoryStats] = useState<ImportInventoryStats | null>(null);
  const [importandoEnProgreso, setImportandoEnProgreso] = useState(false);
  const [pasosPorCompletar, setPasosPorCompletar] = useState<Record<PasoAsistente, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false,
    8: false,
    9: false,
    10: false,
    11: false,
  });

  useEffect(() => {
    api.get<ShopifyConfigResp>("/shopify/config").then(({ data }) => {
      setConfig(data);
      if (data.shopDomain) setShopDomain(data.shopDomain);
      if (data.sucursalEcommerceId) setSucursalEcommerceId(data.sucursalEcommerceId);
    });
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api.post("/shopify/config", { shopDomain, clientId, clientSecret, sucursalEcommerceId });
      setMensaje("✅ Configuracion guardada. Ya puedes importar tus productos.");
      const { data } = await api.get<ShopifyConfigResp>("/shopify/config");
      setConfig(data);
      setClientSecret("");

      // Mostrar asistente después de guardar
      setTimeout(() => {
        setMostrarAsistente(true);
        setPasoActual(1);
      }, 500);
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar la configuracion"));
    } finally {
      setGuardando(false);
    }
  }

  async function iniciarImportacion() {
    setImportandoEnProgreso(true);
    setError(null);

    try {
      // Paso 1-2: Conectar y analizar
      setPasoActual(2);
      await new Promise((r) => setTimeout(r, 1000));

      // Paso 3: Mostrar cantidad
      setPasoActual(3);
      setPasosPorCompletar((p) => ({ ...p, 1: true, 2: true }));
      await new Promise((r) => setTimeout(r, 800));

      // Paso 4: Detectar duplicados
      setPasoActual(4);
      setPasosPorCompletar((p) => ({ ...p, 3: true }));
      await new Promise((r) => setTimeout(r, 800));

      // Paso 5: Importar productos
      setPasoActual(5);
      setPasosPorCompletar((p) => ({ ...p, 4: true }));

      const { data: stats } = await api.post<ImportStats>("/shopify/sync-inicial");
      setImportStats(stats);
      setPasosPorCompletar((p) => ({ ...p, 5: true }));
      await new Promise((r) => setTimeout(r, 800));

      // Paso 6: Importar variantes
      setPasoActual(6);
      await new Promise((r) => setTimeout(r, 800));
      setPasosPorCompletar((p) => ({ ...p, 6: true }));

      // Paso 7: Vincular productos
      setPasoActual(7);
      await new Promise((r) => setTimeout(r, 800));
      setPasosPorCompletar((p) => ({ ...p, 7: true }));

      // Paso 8: Mostrar resultado de productos
      setPasoActual(8);
      await new Promise((r) => setTimeout(r, 800));
      setPasosPorCompletar((p) => ({ ...p, 8: true }));

      // FASE 3: Sincronización de inventario
      // Paso 9: Importar ubicaciones
      setPasoActual(9);
      await new Promise((r) => setTimeout(r, 800));

      // Paso 10: Importar niveles de stock
      setPasoActual(10);
      const { data: invStats } = await api.post<ImportInventoryStats>("/shopify/sync-inventario");
      setInventoryStats(invStats);
      setPasosPorCompletar((p) => ({ ...p, 9: true }));
      await new Promise((r) => setTimeout(r, 800));

      // Paso 11: Sincronización completada
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
              Debe terminar en <strong>.myshopify.com</strong> — NO uses tu dominio publico (ej. mitienda.com).
              Lo encuentras en Shopify: Configuracion → Dominios.
            </span>
          </label>
          <label>
            Client ID
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} required />
          </label>
          <label>
            Client Secret {config?.conectado && <span style={{ fontWeight: 400 }}>(guardado: {config.clientSecret})</span>}
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={config?.conectado ? "Dejar vacio para no cambiarlo" : ""}
              required={!config?.conectado}
            />
          </label>
          <label>
            Sucursal que representa tu canal ecommerce
            <select value={sucursalEcommerceId} onChange={(e) => setSucursalEcommerceId(e.target.value)} required>
              <option value="">Selecciona una sucursal</option>
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
            {config?.conectado && !mostrarAsistente && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setMostrarAsistente(true);
                  setPasoActual(1);
                  setPasosPorCompletar({ 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false, 10: false, 11: false });
                }}
              >
                📥 Importar desde Shopify
              </button>
            )}
          </div>
          {config?.ultimaSincronizacion && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Ultima sincronizacion: {new Date(config.ultimaSincronizacion).toLocaleString("es-CO")}
            </p>
          )}
        </form>
      </div>

      {/* ASISTENTE DE IMPORTACIÓN */}
      {mostrarAsistente && (
        <div className="modal-backdrop" onClick={() => !importandoEnProgreso && setMostrarAsistente(false)}>
          <div className="card" style={{ width: 700, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>📦 Asistente de Importación desde Shopify</h3>

            {/* Pasos - 3 filas de 4 + 1 fila de 3 */}
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
                      cursor: "pointer",
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
                      cursor: "pointer",
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
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{paso.icono}</div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{paso.titulo}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contenido por paso */}
            <div style={{ minHeight: 250, marginBottom: 20 }}>
              {pasoActual === 1 && (
                <div>
                  <h4>🔐 Paso 1: Conectar Shopify</h4>
                  <p>Verificando credenciales...</p>
                </div>
              )}

              {pasoActual === 2 && (
                <div>
                  <h4>🔍 Paso 2: Analizar tienda</h4>
                  <p>Escaneando productos en tu tienda Shopify...</p>
                  <div style={{ animation: "pulse 1.5s infinite", opacity: 0.7 }}>
                    <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                      Conectando a {shopDomain}
                    </div>
                  </div>
                </div>
              )}

              {pasoActual === 3 && importStats && (
                <div>
                  <h4>📦 Paso 3: Productos encontrados</h4>
                  <div style={{ padding: 16, backgroundColor: "#f0f9ff", borderRadius: 8, marginTop: 12 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6", textAlign: "center" }}>
                      {importStats.productosEncontrados}
                    </div>
                    <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 8 }}>
                      productos encontrados en Shopify
                    </div>
                  </div>
                </div>
              )}

              {pasoActual === 4 && importStats && (
                <div>
                  <h4>⚠️ Paso 4: Detectar duplicados</h4>
                  <div style={{ padding: 16, backgroundColor: importStats.duplicadosDetectados > 0 ? "#fef3c7" : "#ecfdf5", borderRadius: 8, marginTop: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: importStats.duplicadosDetectados > 0 ? "#d97706" : "#10b981", textAlign: "center" }}>
                      {importStats.duplicadosDetectados} duplicados
                    </div>
                    <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 8 }}>
                      {importStats.duplicadosDetectados > 0
                        ? "Se encontraron productos similares. Se ofrecerá opción de vincular."
                        : "No se detectaron duplicados. ¡Listo para importar!"}
                    </div>
                  </div>
                </div>
              )}

              {pasoActual === 5 && (
                <div>
                  <h4>📥 Paso 5: Importando productos</h4>
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: "#e5e7eb",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          backgroundColor: "#3b82f6",
                          width: importStats ? `${(importStats.productosImportados / importStats.productosEncontrados) * 100}%` : "0%",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                      {importStats?.productosImportados || 0} / {importStats?.productosEncontrados || 0} productos
                    </div>
                  </div>
                </div>
              )}

              {pasoActual === 6 && (
                <div>
                  <h4>🎨 Paso 6: Importando variantes</h4>
                  <p>Importando tallas, colores y opciones...</p>
                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                    {importStats?.variantesImportadas || 0} variantes procesadas
                  </div>
                </div>
              )}

              {pasoActual === 7 && (
                <div>
                  <h4>🔗 Paso 7: Vinculando productos</h4>
                  <p>Guardando relación entre POS y Shopify...</p>
                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                    {importStats?.productosVinculados || 0} productos vinculados
                  </div>
                </div>
              )}

              {pasoActual === 8 && importStats && (
                <div>
                  <h4>✅ Paso 8: Resultado de productos</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div style={{ padding: 12, backgroundColor: "#ecfdf5", borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981" }}>{importStats.productosImportados}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Productos importados</div>
                    </div>
                    <div style={{ padding: 12, backgroundColor: "#eff6ff", borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#3b82f6" }}>{importStats.variantesImportadas}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Variantes</div>
                    </div>
                  </div>

                  {importStats.erroresDetalle.length > 0 && (
                    <div style={{ marginTop: 12, padding: 12, backgroundColor: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, color: "#dc2626", fontSize: 12 }}>⚠️ {importStats.errores} errores encontrados</div>
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
                        {importStats.erroresDetalle.slice(0, 2).map((err, idx) => (
                          <li key={idx} style={{ marginBottom: 2, color: "var(--text-muted)" }}>
                            {err.producto}: {err.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {pasoActual === 9 && (
                <div>
                  <h4>📍 Paso 9: Importando ubicaciones</h4>
                  <p>Sincronizando almacenes y depósitos de Shopify...</p>
                  <div style={{ animation: "pulse 1.5s infinite", opacity: 0.7, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                    Cargando ubicaciones...
                  </div>
                </div>
              )}

              {pasoActual === 10 && (
                <div>
                  <h4>📊 Paso 10: Sincronizando inventario</h4>
                  <p>Traendo niveles de stock por ubicación...</p>
                  <div style={{ animation: "pulse 1.5s infinite", opacity: 0.7, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                    Sincronizando niveles...
                  </div>
                </div>
              )}

              {pasoActual === 11 && importStats && inventoryStats && (
                <div>
                  <h4>🎉 Importación completada</h4>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>📦 Productos:</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div style={{ padding: 12, backgroundColor: "#ecfdf5", borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{importStats.productosImportados}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Importados</div>
                      </div>
                      <div style={{ padding: 12, backgroundColor: "#eff6ff", borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#3b82f6" }}>{importStats.variantesImportadas}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Variantes</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>📍 Inventario:</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={{ padding: 12, backgroundColor: "#f3e8ff", borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#8b5cf6" }}>{inventoryStats.ubicacionesImportadas}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Ubicaciones</div>
                      </div>
                      <div style={{ padding: 12, backgroundColor: "#dbeafe", borderRadius: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#0284c7" }}>{inventoryStats.nivelesDeInventarioImportados}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Niveles de stock</div>
                      </div>
                    </div>
                  </div>

                  {(importStats.errores > 0 || inventoryStats.errores > 0) && (
                    <div style={{ marginTop: 16, padding: 12, backgroundColor: "#fee2e2", borderRadius: 8, border: "1px solid #fecaca" }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, color: "#dc2626" }}>
                        ⚠️ {importStats.errores + inventoryStats.errores} errores totales
                      </div>
                    </div>
                  )}

                  {error && <div className="error-text" style={{ marginTop: 16 }}>{error}</div>}
                </div>
              )}
            </div>

            {/* Botones */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {pasoActual < 11 ? (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setMostrarAsistente(false)}
                    disabled={importandoEnProgreso}
                  >
                    Cancelar
                  </button>
                  {pasoActual === 1 && (
                    <button type="button" onClick={iniciarImportacion} disabled={importandoEnProgreso}>
                      {importandoEnProgreso ? "Importando..." : "Iniciar importación"}
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarAsistente(false)}
                  style={{ minWidth: 140 }}
                >
                  🎉 ¡Listo!
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
