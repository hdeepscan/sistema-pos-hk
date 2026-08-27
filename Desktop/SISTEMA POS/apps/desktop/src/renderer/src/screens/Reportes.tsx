import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { LineChart, BarraHorizontal, DonutChart, VariacionBadge, formatoMoneda } from "../lib/charts";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";

interface Resumen {
  totalVentas: number;
  totalGastos: number;
  costoVentas: number;
  utilidadBruta: number;
  numeroVentas: number;
  unidadesVendidas: number;
  ticketPromedio: number;
  gastoPauta: number;
  roas: number | null;
  productosMasVendidos: { productoId: string; nombre: string; cantidad: number; total: number }[];
  ventasPorDia: { fecha: string; total: number }[];
  ventasPorMetodoPago: { metodoPago: string; total: number }[];
  ventasPorSucursal: { sucursalId: string; sucursalNombre: string; total: number }[];
  ventasPorCanal?: { canal: string; total: number; cantidad: number; unidades: number; ticketPromedio: number; porcentajeVentas: number }[];
  comparacion: { totalVentasAnterior: number; variacionVentas: number | null; variacionNumeroVentas: number | null };
}

// SVG Icons sin emojis
const Iconos = {
  analizar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="2" x2="12" y2="22"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h.5M7 12a3 3 0 0 1 3-3h8"></path>
    </svg>
  ),
  trending: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
      <polyline points="17 6 23 6 23 12"></polyline>
    </svg>
  ),
  dinero: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
      <line x1="1" y1="10" x2="23" y2="10"></line>
    </svg>
  ),
  usuarios: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  paquete: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  ),
  canales: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6-6 6 6"></path>
      <path d="M6 15l6 6 6-6"></path>
    </svg>
  ),
  moneda: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8"></circle>
      <path d="M8 12h8"></path>
      <path d="M12 8v8"></path>
    </svg>
  ),
  grafico: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="2" x2="12" y2="22"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h.5M7 12a3 3 0 0 1 3-3h8"></path>
    </svg>
  ),
};

function haceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

const RANGOS = [
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
];

export default function Reportes() {
  const { sucursales } = useSesionStore();
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(haceDias(0));
  const [sucursalId, setSucursalId] = useState("");
  const [canal, setCanal] = useState("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "canales" | "productos" | "analisis">("overview");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get<Resumen>("/reportes/resumen", {
        params: { desde, hasta, sucursalId: sucursalId || undefined, canal: canal || undefined },
      });
      setResumen(data);
    } catch (err) {
      console.error("Error cargando reportes:", err);
    }
    setCargando(false);
  }, [desde, hasta, sucursalId, canal]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function aplicarRango(dias: number) {
    setDesde(haceDias(dias));
    setHasta(haceDias(0));
  }

  const margenBruto = resumen ? (resumen.utilidadBruta / resumen.totalVentas) * 100 : 0;
  const margenNeto = resumen ? ((resumen.utilidadBruta - resumen.totalGastos) / resumen.totalVentas) * 100 : 0;
  const costoVentasPct = resumen ? (resumen.costoVentas / resumen.totalVentas) * 100 : 0;

  return (
    <div>
      {/* HEADER */}
      <div className="page-header" style={{ marginBottom: 24, background: "linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(20, 184, 166, 0.08) 100%)", borderRadius: 12, padding: 24 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 12, margin: 0, background: "linear-gradient(90deg, var(--brand) 0%, var(--accent) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            {Iconos.analizar}
            Análisis Detallado
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>Ventas, canales, productos y rendimiento empresarial</p>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "2px solid var(--border)", paddingBottom: 16 }}>
        {[
          { id: "overview", label: "Resumen Ejecutivo", icon: Iconos.dinero },
          { id: "canales", label: "Análisis por Canal", icon: Iconos.canales },
          { id: "productos", label: "Top Productos", icon: Iconos.paquete },
          { id: "analisis", label: "Análisis Avanzado", icon: Iconos.grafico },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              background: activeTab === tab.id
                ? "linear-gradient(90deg, var(--brand) 0%, var(--accent) 100%)"
                : "transparent",
              color: activeTab === tab.id ? "#fff" : "var(--text-muted)",
              border: activeTab === tab.id ? "none" : "1px solid var(--border-light)",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 500,
              fontSize: 14,
              transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
              filter: activeTab === tab.id ? "drop-shadow(0 8px 16px rgba(34, 197, 94, 0.25))" : "none",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <span style={{ position: "relative", zIndex: 1, opacity: 0.9 }}>{tab.icon}</span>
            <span style={{ position: "relative", zIndex: 1 }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* FILTROS */}
      <div className="card" style={{ marginBottom: 24, padding: "16px 20px" }}>
        <h4 style={{ margin: "0 0 12px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: 0.5 }}>
          Filtros y Período
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ gap: 6 }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Período Rápido</span>
              <div style={{ display: "flex", gap: 6 }}>
                {RANGOS.map((r) => (
                  <button
                    key={r.dias}
                    type="button"
                    onClick={() => aplicarRango(r.dias)}
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      background: "var(--surface-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ padding: "8px 12px" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ padding: "8px 12px" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Sucursal</span>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ padding: "8px 12px" }}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Canal de Venta</span>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} style={{ padding: "8px 12px" }}>
              <option value="">Todos los canales</option>
              <option value="POS">Punto de Venta (POS)</option>
              <option value="SHOPIFY">Shopify</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
        </div>
      </div>

      {cargando || !resumen ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <p>Cargando datos...</p>
        </div>
      ) : (
        <>
          {/* TAB: OVERVIEW */}
          {activeTab === "overview" && (
            <>
              {/* KPIs PRINCIPALES */}
              <div className="stat-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card" style={{ borderLeft: "4px solid var(--brand)", animation: "fadeIn 0.6s ease", background: "linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--brand)" }}>
                    {Iconos.trending}
                    <div className="label">Total de Ventas</div>
                  </div>
                  <div className="value positive">{formatoMoneda(resumen.totalVentas)}</div>
                  {resumen.comparacion.variacionVentas !== null && <VariacionBadge valor={resumen.comparacion.variacionVentas} />}
                </div>

                <div className="stat-card" style={{ borderLeft: "4px solid #10B981", animation: "fadeIn 0.6s ease 0.1s both", background: "linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(16, 185, 129, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#10B981" }}>
                    {Iconos.dinero}
                    <div className="label">Utilidad Bruta</div>
                  </div>
                  <div className={`value ${resumen.utilidadBruta >= 0 ? "positive" : "negative"}`}>
                    {formatoMoneda(resumen.utilidadBruta)}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
                    Margen: <span style={{ fontWeight: 600, color: resumen.utilidadBruta >= 0 ? "var(--brand)" : "var(--danger)" }}>{margenBruto.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="stat-card" style={{ borderLeft: "4px solid #F59E0B", animation: "fadeIn 0.6s ease 0.2s both", background: "linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(245, 158, 11, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#F59E0B" }}>
                    {Iconos.moneda}
                    <div className="label">Margen Neto</div>
                  </div>
                  <div className={`value ${margenNeto >= 0 ? "positive" : "negative"}`}>{margenNeto.toFixed(1)}%</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
                    Utilidad neta: <span style={{ fontWeight: 600 }}>{formatoMoneda(resumen.utilidadBruta - resumen.totalGastos)}</span>
                  </div>
                </div>

                <div className="stat-card" style={{ borderLeft: "4px solid var(--accent)", animation: "fadeIn 0.6s ease 0.3s both", background: "linear-gradient(135deg, rgba(20, 184, 166, 0.05) 0%, rgba(20, 184, 166, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--accent)" }}>
                    {Iconos.usuarios}
                    <div className="label">Número de Ventas</div>
                  </div>
                  <div className="value">{resumen.numeroVentas}</div>
                  {resumen.comparacion.variacionNumeroVentas !== null && <VariacionBadge valor={resumen.comparacion.variacionNumeroVentas} />}
                </div>

                <div className="stat-card" style={{ borderLeft: "4px solid #8B5CF6", animation: "fadeIn 0.6s ease 0.4s both", background: "linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(139, 92, 246, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#8B5CF6" }}>
                    {Iconos.paquete}
                    <div className="label">Ticket Promedio</div>
                  </div>
                  <div className="value">{formatoMoneda(resumen.ticketPromedio)}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
                    {resumen.unidadesVendidas} unidades vendidas
                  </div>
                </div>

                <div className="stat-card" style={{ borderLeft: "4px solid #EF4444", animation: "fadeIn 0.6s ease 0.5s both", background: "linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(239, 68, 68, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#EF4444" }}>
                    {Iconos.dinero}
                    <div className="label">Costo de Ventas</div>
                  </div>
                  <div className="value negative">{formatoMoneda(resumen.costoVentas)}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
                    {costoVentasPct.toFixed(1)}% del total
                  </div>
                </div>

                <div className="stat-card" style={{ borderLeft: "4px solid #06B6D4", animation: "fadeIn 0.6s ease 0.6s both", background: "linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(6, 182, 212, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#06B6D4" }}>
                    {Iconos.grafico}
                    <div className="label">Gastos Operacionales</div>
                  </div>
                  <div className="value negative">{formatoMoneda(resumen.totalGastos)}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
                    + Meta Ads: {formatoMoneda(resumen.gastoPauta)}
                  </div>
                </div>

                <div className="stat-card" style={{ borderLeft: "4px solid #14B8A6", animation: "fadeIn 0.6s ease 0.7s both", background: "linear-gradient(135deg, rgba(20, 184, 166, 0.05) 0%, rgba(20, 184, 166, 0.02) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#14B8A6" }}>
                    {Iconos.trending}
                    <div className="label">ROAS (Meta Ads)</div>
                  </div>
                  <div className="value">{resumen.roas != null ? `${resumen.roas.toFixed(2)}x` : "N/A"}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 8 }}>
                    Retorno de inversión
                  </div>
                </div>
              </div>

              {/* GRÁFICOS */}
              <div className="card" style={{ marginBottom: 24, animation: "fadeIn 0.8s ease", background: "linear-gradient(180deg, rgba(34, 197, 94, 0.03) 0%, rgba(20, 184, 166, 0.02) 100%)", borderTop: "2px solid rgba(34, 197, 94, 0.1)" }}>
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                    {Iconos.grafico}
                    Ventas por Día
                  </h4>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Tendencia de ventas diarias en el período</p>
                </div>
                <LineChart datos={resumen.ventasPorDia.map((d) => ({ etiqueta: d.fecha, valor: d.total }))} />
              </div>

              {/* ANÁLISIS POR MÉTODO Y SUCURSAL */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ animation: "fadeIn 0.8s ease 0.1s both", background: "linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, rgba(34, 197, 94, 0.02) 100%)", borderTop: "2px solid rgba(139, 92, 246, 0.1)" }}>
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                      {Iconos.dinero}
                      Ventas por Método de Pago
                    </h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Distribución de pagos</p>
                  </div>
                  <DonutChart datos={resumen.ventasPorMetodoPago.map((m) => ({ etiqueta: m.metodoPago, valor: m.total }))} />
                </div>

                <div className="card" style={{ animation: "fadeIn 0.8s ease 0.2s both", background: "linear-gradient(135deg, rgba(249, 115, 22, 0.03) 0%, rgba(20, 184, 166, 0.02) 100%)", borderTop: "2px solid rgba(249, 115, 22, 0.1)" }}>
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                      {Iconos.paquete}
                      Ventas por Sucursal
                    </h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Rendimiento de cada sucursal</p>
                  </div>
                  <BarraHorizontal datos={resumen.ventasPorSucursal.map((s) => ({ etiqueta: s.sucursalNombre, valor: s.total }))} />
                </div>
              </div>
            </>
          )}

          {/* TAB: CANALES */}
          {activeTab === "canales" && resumen.ventasPorCanal && (
            <>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(90deg, var(--brand) 0%, var(--accent) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  {Iconos.canales}
                  Análisis Detallado por Canal de Venta
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
                  {resumen.ventasPorCanal.map((c, idx) => (
                    <div key={c.canal} className="stat-card" style={{ animation: `fadeIn 0.6s ease ${idx * 0.1}s both`, background: "linear-gradient(135deg, rgba(34, 197, 94, 0.04) 0%, rgba(20, 184, 166, 0.02) 100%)", borderTop: "2px solid rgba(34, 197, 94, 0.15)" }}>
                      <div style={{ marginBottom: 12 }}>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, background: "linear-gradient(90deg, var(--brand) 0%, var(--accent) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{c.canal}</h4>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: 4 }}>Total Ventas</div>
                          <div style={{ fontSize: 16, fontWeight: 700, background: "linear-gradient(90deg, var(--brand) 0%, #10B981 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{formatoMoneda(c.total)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: 4 }}>% Total</div>
                          <div style={{ fontSize: 16, fontWeight: 700, background: "linear-gradient(90deg, var(--accent) 0%, #06B6D4 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{c.porcentajeVentas.toFixed(1)}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: 4 }}>Número de Ventas</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{c.cantidad}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: 4 }}>Unidades</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{c.unidades}</div>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: 4 }}>Ticket Promedio</div>
                          <div style={{ fontSize: 16, fontWeight: 700, background: "linear-gradient(90deg, #10B981 0%, var(--accent) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{formatoMoneda(c.ticketPromedio)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {resumen.ventasPorCanal && resumen.ventasPorCanal.length > 0 && (
                <div className="card" style={{ animation: "fadeIn 0.8s ease", background: "linear-gradient(180deg, rgba(34, 197, 94, 0.03) 0%, rgba(20, 184, 166, 0.02) 100%)", borderTop: "2px solid rgba(34, 197, 94, 0.1)" }}>
                  <h4 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    {Iconos.grafico}
                    Comparativa de Canales
                  </h4>
                  <DonutChart datos={resumen.ventasPorCanal.map((c) => ({ etiqueta: c.canal, valor: c.total }))} />
                </div>
              )}
            </>
          )}

          {/* TAB: PRODUCTOS */}
          {activeTab === "productos" && (
            <div className="card" style={{ animation: "fadeIn 0.6s ease", background: "linear-gradient(135deg, rgba(34, 197, 94, 0.03) 0%, rgba(139, 92, 246, 0.02) 100%)", borderTop: "2px solid rgba(34, 197, 94, 0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                    {Iconos.paquete}
                    Top 10 Productos Más Vendidos
                  </h4>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Ranking por unidades vendidas y revenue</p>
                </div>
                <BotonesExportar
                  nombreArchivo="productos-mas-vendidos"
                  titulo="Productos más vendidos"
                  columnas={COLUMNAS_PRODUCTOS_VENDIDOS}
                  filas={resumen.productosMasVendidos}
                />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", background: "linear-gradient(90deg, rgba(34, 197, 94, 0.05) 0%, rgba(20, 184, 166, 0.03) 100%)" }}>
                      <th style={{ textAlign: "left", padding: "12px", fontWeight: 700, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Rank
                      </th>
                      <th style={{ textAlign: "left", padding: "12px", fontWeight: 700, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Producto
                      </th>
                      <th style={{ textAlign: "right", padding: "12px", fontWeight: 700, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Unidades
                      </th>
                      <th style={{ textAlign: "right", padding: "12px", fontWeight: 700, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Ingresos
                      </th>
                      <th style={{ textAlign: "right", padding: "12px", fontWeight: 700, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        % Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.productosMasVendidos.slice(0, 10).map((p, i) => (
                      <tr key={p.productoId} style={{ borderBottom: "1px solid var(--border)", transition: "all 150ms ease", background: i % 2 === 0 ? "rgba(34, 197, 94, 0.02)" : "transparent" }}>
                        <td style={{ padding: "12px" }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, var(--brand) 0%, #10B981 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                            {i + 1}
                          </div>
                        </td>
                        <td style={{ padding: "12px", fontWeight: 500 }}>{p.nombre}</td>
                        <td style={{ textAlign: "right", padding: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {p.cantidad} u.
                        </td>
                        <td style={{ textAlign: "right", padding: "12px", fontWeight: 600, background: "linear-gradient(90deg, var(--success) 0%, #10B981 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                          {formatoMoneda(p.total)}
                        </td>
                        <td style={{ textAlign: "right", padding: "12px", color: "var(--text-muted)" }}>
                          {((p.total / resumen.totalVentas) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: ANÁLISIS */}
          {activeTab === "analisis" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ animation: "fadeIn 0.6s ease", background: "linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, rgba(34, 197, 94, 0.02) 100%)", borderTop: "2px solid rgba(139, 92, 246, 0.1)" }}>
                  <h4 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    {Iconos.dinero}
                    Métodos de Pago
                  </h4>
                  <DonutChart datos={resumen.ventasPorMetodoPago.map((m) => ({ etiqueta: m.metodoPago, valor: m.total }))} />
                </div>

                <div className="card" style={{ animation: "fadeIn 0.6s ease 0.1s both", background: "linear-gradient(135deg, rgba(249, 115, 22, 0.03) 0%, rgba(20, 184, 166, 0.02) 100%)", borderTop: "2px solid rgba(249, 115, 22, 0.1)" }}>
                  <h4 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    {Iconos.paquete}
                    Sucursales
                  </h4>
                  <BarraHorizontal datos={resumen.ventasPorSucursal.map((s) => ({ etiqueta: s.sucursalNombre, valor: s.total }))} />
                </div>
              </div>

              <div className="card" style={{ animation: "fadeIn 0.8s ease 0.2s both", background: "linear-gradient(180deg, rgba(34, 197, 94, 0.03) 0%, rgba(20, 184, 166, 0.02) 100%)", borderTop: "2px solid rgba(34, 197, 94, 0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                      {Iconos.grafico}
                      Línea de Tendencia
                    </h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Evolución de ventas diarias</p>
                  </div>
                  <BotonesExportar
                    nombreArchivo="ventas-por-dia"
                    titulo="Ventas por día"
                    columnas={COLUMNAS_VENTAS_DIA}
                    filas={resumen.ventasPorDia}
                  />
                </div>
                <LineChart datos={resumen.ventasPorDia.map((d) => ({ etiqueta: d.fecha, valor: d.total }))} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const COLUMNAS_VENTAS_DIA: ColumnaExport<Resumen["ventasPorDia"][number]>[] = [
  { encabezado: "Fecha", clave: "fecha" },
  { encabezado: "Total", clave: "total", formato: (v) => formatoMoneda(v) },
];

const COLUMNAS_VENTAS_SUCURSAL: ColumnaExport<Resumen["ventasPorSucursal"][number]>[] = [
  { encabezado: "Sucursal", clave: "sucursalNombre" },
  { encabezado: "Total", clave: "total", formato: (v) => formatoMoneda(v) },
];

const COLUMNAS_PRODUCTOS_VENDIDOS: ColumnaExport<Resumen["productosMasVendidos"][number]>[] = [
  { encabezado: "Producto", clave: "nombre" },
  { encabezado: "Unidades", clave: "cantidad" },
  { encabezado: "Total", clave: "total", formato: (v) => formatoMoneda(v) },
];
