import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { LineChart, BarraHorizontal, formatoMoneda } from "../lib/charts";

interface MetaConfigResp {
  conectado: boolean;
  adAccountId?: string;
  accessToken?: string;
  pixelId?: string | null;
  sucursalEcommerceId?: string | null;
  ultimaSincronizacion?: string | null;
}

interface GastoPautaResp {
  totalGasto: number;
  totalImpresiones: number;
  totalClics: number;
  porCampania: { campania: string; gasto: number }[];
  porDia: { fecha: string; gasto: number }[];
}

function haceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export default function MetaAds() {
  const { sucursales } = useSesionStore();
  const [config, setConfig] = useState<MetaConfigResp | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [sucursalEcommerceId, setSucursalEcommerceId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(haceDias(0));
  const [gastoPauta, setGastoPauta] = useState<GastoPautaResp | null>(null);

  useEffect(() => {
    api.get<MetaConfigResp>("/meta/config").then(({ data }) => {
      setConfig(data);
      if (data.adAccountId) setAdAccountId(data.adAccountId);
      if (data.pixelId) setPixelId(data.pixelId);
      if (data.sucursalEcommerceId) setSucursalEcommerceId(data.sucursalEcommerceId);
    });
  }, []);

  const cargarGasto = useCallback(async () => {
    if (!config?.conectado) return;
    const { data } = await api.get<GastoPautaResp>("/meta/gasto-pauta", { params: { desde, hasta } });
    setGastoPauta(data);
  }, [config?.conectado, desde, hasta]);

  useEffect(() => {
    cargarGasto();
  }, [cargarGasto]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api.post("/meta/config", {
        accessToken,
        adAccountId,
        pixelId: pixelId || undefined,
        sucursalEcommerceId: sucursalEcommerceId || undefined,
      });
      setMensaje("Configuracion guardada. Ya puedes sincronizar el gasto en pauta.");
      const { data } = await api.get<MetaConfigResp>("/meta/config");
      setConfig(data);
      setAccessToken("");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo guardar la configuracion");
    } finally {
      setGuardando(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setMensaje(null);
    try {
      await api.post("/meta/sincronizar", { desde, hasta });
      setMensaje("Gasto en pauta sincronizado desde Meta Ads.");
      const { data: cfg } = await api.get<MetaConfigResp>("/meta/config");
      setConfig(cfg);
      await cargarGasto();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo sincronizar con Meta Ads");
    } finally {
      setSincronizando(false);
    }
  }

  const ctr = gastoPauta && gastoPauta.totalImpresiones > 0
    ? (gastoPauta.totalClics / gastoPauta.totalImpresiones) * 100
    : null;
  const cpc = gastoPauta && gastoPauta.totalClics > 0 ? gastoPauta.totalGasto / gastoPauta.totalClics : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Meta Ads</h2>
          <p>Gasto en pauta de Facebook/Instagram y envio de eventos de compra al Pixel</p>
        </div>
        {config?.conectado && <span className="badge success">Conectado</span>}
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h4 style={{ marginTop: 0 }}>Credenciales de Meta Business</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Access token (permanente, del sistema o usuario de negocio)
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={config?.conectado ? "Dejar vacio para no cambiarlo" : ""}
              required={!config?.conectado}
            />
          </label>
          <label>
            Ad Account ID
            <input
              placeholder="act_1234567890"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              required
            />
          </label>
          <label>
            Pixel ID (opcional, para enviar eventos de compra)
            <input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="Opcional" />
          </label>
          <label>
            Sucursal ligada a la pauta (tu canal ecommerce)
            <select value={sucursalEcommerceId} onChange={(e) => setSucursalEcommerceId(e.target.value)}>
              <option value="">Sin ligar / todas las ventas</option>
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
                {sincronizando ? "Sincronizando..." : "Sincronizar gasto"}
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

      {config?.conectado && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <label>
                Desde
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
            </div>
          </div>

          {gastoPauta && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="label">Gasto total</div>
                  <div className="value negative">{formatoMoneda(gastoPauta.totalGasto)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Impresiones</div>
                  <div className="value">{gastoPauta.totalImpresiones.toLocaleString("es-CO")}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Clics</div>
                  <div className="value">{gastoPauta.totalClics.toLocaleString("es-CO")}</div>
                </div>
                <div className="stat-card">
                  <div className="label">CTR</div>
                  <div className="value">{ctr != null ? `${ctr.toFixed(2)}%` : "-"}</div>
                </div>
                <div className="stat-card">
                  <div className="label">CPC</div>
                  <div className="value">{cpc != null ? formatoMoneda(cpc) : "-"}</div>
                </div>
              </div>

              <div className="card">
                <h4 style={{ marginTop: 0, marginBottom: 12 }}>Gasto por dia</h4>
                <LineChart datos={gastoPauta.porDia.map((d) => ({ etiqueta: d.fecha, valor: d.gasto }))} />
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <h4 style={{ marginTop: 0, marginBottom: 12 }}>Gasto por campana</h4>
                <BarraHorizontal datos={gastoPauta.porCampania.map((c) => ({ etiqueta: c.campania, valor: c.gasto }))} />
              </div>
            </>
          )}
        </>
      )}

      <div className="card" style={{ maxWidth: 480, marginTop: 16 }}>
        <h4 style={{ marginTop: 0 }}>Como funciona</h4>
        <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
          <li>El gasto en pauta se trae de la Marketing API de Meta (solo lectura).</li>
          <li>Si configuras un Pixel ID, cada venta hecha en la sucursal ecommerce envia un evento de Compra a Meta via Conversions API, para ayudar a optimizar tus anuncios.</li>
          <li>El ROAS (retorno sobre inversion publicitaria) se calcula en Reportes usando este gasto.</li>
        </ul>
      </div>
    </div>
  );
}
