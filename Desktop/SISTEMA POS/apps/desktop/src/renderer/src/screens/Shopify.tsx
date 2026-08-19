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

export default function Shopify() {
  const { sucursales } = useSesionStore();
  const [config, setConfig] = useState<ShopifyConfigResp | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sucursalEcommerceId, setSucursalEcommerceId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setMensaje("Configuracion guardada. Ya puedes sincronizar tus productos.");
      const { data } = await api.get<ShopifyConfigResp>("/shopify/config");
      setConfig(data);
      setClientSecret("");
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar la configuracion"));
    } finally {
      setGuardando(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setMensaje(null);
    try {
      console.log("[shopify] Iniciando sincronización...");
      const { data } = await api.post("/shopify/sync");
      console.log("[shopify] Resultado:", data);
      if (data.error) {
        setError(`Error de Shopify: ${data.error}`);
      } else {
        setMensaje(
          `Sincronizado: ${data.productosCreados} productos nuevos, ${data.productosActualizados} actualizados` +
            (data.variantesOmitidas ? `, ${data.variantesOmitidas} variantes sin SKU omitidas` : "")
        );
        const { data: cfg } = await api.get<ShopifyConfigResp>("/shopify/config");
        setConfig(cfg);
      }
    } catch (err: any) {
      console.error("[shopify] Error de sincronización:", err);
      const mensajeError_respuesta = err.response?.data?.error || err.message;
      setError(`Error: ${mensajeError_respuesta || "No se pudo sincronizar con Shopify"}`);
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Integracion con Shopify</h2>
          <p>Trae tus productos y sincroniza el inventario de tu canal ecommerce</p>
        </div>
        {config?.conectado && <span className="badge success">Conectado</span>}
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
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
            {config?.conectado && (
              <button type="button" className="secondary" onClick={sincronizar} disabled={sincronizando}>
                {sincronizando ? "Sincronizando..." : "Sincronizar productos ahora"}
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

      <div className="card" style={{ maxWidth: 480, marginTop: 16 }}>
        <h4 style={{ marginTop: 0 }}>Como obtener las credenciales</h4>
        <ol style={{ paddingLeft: 18, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
          <li>Entra al Shopify Dev Dashboard y crea una app.</li>
          <li>Instalala en tu tienda.</li>
          <li>Copia el Client ID y Client Secret y pegalos aqui.</li>
        </ol>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          El token de acceso se renueva automaticamente cada 24 horas; no necesitas hacer nada mas.
        </p>
      </div>
    </div>
  );
}
