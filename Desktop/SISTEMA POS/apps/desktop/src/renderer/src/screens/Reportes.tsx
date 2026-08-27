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
  comparacion: { totalVentasAnterior: number; variacionVentas: number | null; variacionNumeroVentas: number | null };
}

// Iconos SVG
const Iconos = {
  trending: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>,
  users: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  package: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
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
      <div className="page-header">
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 12, margin: 0 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
              <line x1="12" y1="2" x2="12" y2="22"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h.5M7 12a3 3 0 0 1 3-3h8"></path>
            </svg>
            Análisis Detallado
          </h2>
          <p>Ventas, canales, productos y rendimiento empresarial</p>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--border-light)", paddingBottom: 12 }}>
        {[
          { id: "overview", label: "Resumen Ejecutivo", icon: "📊" },
          { id: "canales", label: "Análisis por Canal", icon: "🔀" },
          { id: "productos", label: "Top Productos", icon: "📦" },
          { id: "analisis", label: "Análisis Avanzado", icon: "📈" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`secondary`}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "8px 16px",
              background: activeTab === tab.id ? "var(--brand)" : "transparent",
              color: activeTab === tab.id ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 500,
              transition: "all 200ms ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16, padding: "16px 20px" }}>
        <h4 style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>
          Filtros
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ gap: 6 }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Período Rápido</span>
              <div style={{ display: "flex", gap: 8 }}>
                {RANGOS.map((r) => (
                  <button key={r.dias} className="secondary" type="button" onClick={() => aplicarRango(r.dias)} style={{ padding: "6px 12px", fontSize: "12px" }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <label>
            <span style={{ fontSize: "12px" }}>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            <span style={{ fontSize: "12px" }}>Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label>
            <span style={{ fontSize: "12px" }}>Sucursal</span>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={{ fontSize: "12px" }}>Canal de Venta</span>
            <select value={canal} onChange={(e) => setCanal(e.target.value)}>
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
        <p className="empty-state">Cargando datos...</p>
      ) : (
        <>
          {/* KPIs PRINCIPALES */}
          <div className="stat-grid">
            <div className="stat-card" style={{ borderLeft: "3px solid var(--brand)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>{Iconos.trending}</span>
                <div className="label">Total de Ventas</div>
              </div>
              <div className="value positive">{formatoMoneda(resumen.totalVentas)}</div>
              <VariacionBadge valor={resumen.comparacion.variacionVentas} />
            </div>

            <div className="stat-card" style={{ borderLeft: "3px solid var(--success)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>💰</span>
                <div className="label">Utilidad Bruta</div>
              </div>
              <div className={`value ${resumen.utilidadBruta >= 0 ? "positive" : "negative"}`}>
                {formatoMoneda(resumen.utilidadBruta)}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 4 }}>
                Margen: {margenBruto.toFixed(1)}%
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: "3px solid var(--warning)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>📊</span>
                <div className="label">Margen Neto</div>
              </div>
              <div className={`value ${margenNeto >= 0 ? "positive" : "negative"}`}>
                {margenNeto.toFixed(1)}%
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 4 }}>
                {formatoMoneda(resumen.utilidadBruta - resumen.totalGastos)}
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: "3px solid var(--accent)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>{Iconos.users}</span>
                <div className="label">Número de Ventas</div>
              </div>
              <div className="value">{resumen.numeroVentas}</div>
              <VariacionBadge valor={resumen.comparacion.variacionNumeroVentas} />
            </div>

            <div className="stat-card" style={{ borderLeft: "3px solid #F59E0B" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>💳</span>
                <div className="label">Ticket Promedio</div>
              </div>
              <div className="value">{formatoMoneda(resumen.ticketPromedio)}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 4 }}>
                ({resumen.unidadesVendidas} unidades)
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: "3px solid #EF4444" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>📦</span>
                <div className="label">Costo de Ventas</div>
              </div>
              <div className="value negative">{formatoMoneda(resumen.costoVentas)}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 4 }}>
                {costoVentasPct.toFixed(1)}% del total
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: "3px solid #8B5CF6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>💰</span>
                <div className="label">Gastos Operacionales</div>
              </div>
              <div className="value negative">{formatoMoneda(resumen.totalGastos)}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 4 }}>
                + Meta Ads: {formatoMoneda(resumen.gastoPauta)}
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: "3px solid #06B6D4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ opacity: 0.7 }}>📈</span>
                <div className="label">ROAS (Meta Ads)</div>
              </div>
              <div className="value">{resumen.roas != null ? `${resumen.roas.toFixed(2)}x` : "N/A"}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 4 }}>
                Retorno de inversión
              </div>
            </div>
          </div>

          {/* GRÁFICOS DE TENDENCIA */}
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h4 style={{ margin: "0 0 4px" }}>📈 Ventas por Día</h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Tendencia de ventas diarias en el período</p>
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

          {/* ANÁLISIS POR MÉTODO Y SUCURSAL */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div className="card">
              <div>
                <h4 style={{ margin: "0 0 4px" }}>💳 Ventas por Método de Pago</h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Distribución de pagos</p>
              </div>
              <div style={{ marginTop: 12 }}>
                <DonutChart datos={resumen.ventasPorMetodoPago.map((m) => ({ etiqueta: m.metodoPago, valor: m.total }))} />
              </div>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: "0 0 4px" }}>🏪 Ventas por Sucursal</h4>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Rendimiento de cada sucursal</p>
                </div>
                <BotonesExportar
                  nombreArchivo="ventas-por-sucursal"
                  titulo="Ventas por sucursal"
                  columnas={COLUMNAS_VENTAS_SUCURSAL}
                  filas={resumen.ventasPorSucursal}
                />
              </div>
              <BarraHorizontal datos={resumen.ventasPorSucursal.map((s) => ({ etiqueta: s.sucursalNombre, valor: s.total }))} />
            </div>
          </div>

          {/* PRODUCTOS MÁS VENDIDOS */}
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h4 style={{ margin: "0 0 4px" }}>🏆 Top 10 Productos Más Vendidos</h4>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>Ranking por unidades vendidas</p>
              </div>
              <BotonesExportar
                nombreArchivo="productos-mas-vendidos"
                titulo="Productos más vendidos"
                columnas={COLUMNAS_PRODUCTOS_VENDIDOS}
                filas={resumen.productosMasVendidos}
              />
            </div>

            {/* Tabla detallada de productos */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>Producto</th>
                    <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>Unidades</th>
                    <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>Ingresos</th>
                    <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>% Total</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.productosMasVendidos.slice(0, 10).map((p, i) => (
                    <tr key={p.productoId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--brand-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600, color: "var(--brand)" }}>
                            {i + 1}
                          </div>
                          <span>{p.nombre}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", padding: "12px", fontWeight: 600 }}>{p.cantidad} u.</td>
                      <td style={{ textAlign: "right", padding: "12px", fontWeight: 600, color: "var(--success)" }}>{formatoMoneda(p.total)}</td>
                      <td style={{ textAlign: "right", padding: "12px", color: "var(--text-muted)" }}>
                        {((p.total / resumen.totalVentas) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
