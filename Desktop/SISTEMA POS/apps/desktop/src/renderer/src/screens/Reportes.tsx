import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import {
  LineChart as RechartsLine,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
} from "recharts";
import { TrendingUp, DollarSign, ShoppingCart, Package, Zap, Award, Calendar, Filter, Users } from "lucide-react";

interface Resumen {
  totalVentas: number;
  totalCostos: number;
  totalGastos: number;
  costoVentas: number;
  utilidadBruta: number;
  numeroVentas: number;
  unidadesVendidas: number;
  ticketPromedio: number;
  gastoPauta: number;
  roas: number | null;
  productosMasVendidos: { productoId: string; nombre: string; cantidad: number; total: number; imagen?: string }[];
  ventasPorDia: { fecha: string; total: number }[];
  ventasPorMetodoPago: { metodoPago: string; total: number }[];
  ventasPorSucursal: { sucursalId: string; sucursalNombre: string; total: number }[];
  ventasPorCanal?: { canal: string; total: number; cantidad: number; unidades: number; ticketPromedio: number; porcentajeVentas: number }[];
  gastosDesglosados?: { tipo: string; monto: number }[];
  costosDesglosados?: { tipo: string; monto: number }[];
  proveedores?: {
    id: string;
    nombre: string;
    productos: number;
    valorVendido: number;
    costo: number;
    utilidad: number;
    margenPorcentaje: number;
  }[];
  comparacion: { totalVentasAnterior: number; variacionVentas: number | null; variacionNumeroVentas: number | null };
}

const COLORES = ["#22C55E", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899"];

function haceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

const RANGOS = [
  { label: "7 días", dias: 7 },
  { label: "30 días", dias: 30 },
  { label: "90 días", dias: 90 },
];

function formatoMoneda(valor: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

function KPICard({
  titulo,
  valor,
  subtitulo,
  icono,
  color,
  datos,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  icono: React.ReactNode;
  color: string;
  datos?: { value: number }[];
}) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #FFFFFF 0%, #F8F9FA 100%)",
        border: `1px solid ${color}20`,
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ color, fontSize: 24 }}>{icono}</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>{titulo}</span>
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{valor}</div>
      {subtitulo && <div style={{ fontSize: 11, color: "#94a3b8" }}>{subtitulo}</div>}
      {datos && datos.length > 0 && (
        <ResponsiveContainer width="100%" height={40}>
          <RechartsLine data={datos} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </RechartsLine>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function ProductCard({
  nombre,
  cantidad,
  total,
  imagen,
  porcentaje,
  rank,
}: {
  nombre: string;
  cantidad: number;
  total: number;
  imagen?: string;
  porcentaje: number;
  rank: number;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 8,
        padding: 16,
        display: "flex",
        gap: 12,
        alignItems: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        transition: "all 0.2s",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.12)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: imagen ? "transparent" : "#F3F4F6",
          backgroundImage: imagen ? `url(${imagen})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          color: "#3B82F6",
        }}
      >
        {!imagen && rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nombre}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
          {cantidad} unidades • {formatoMoneda(total)}
        </div>
        <div style={{ background: "#F0F9FF", height: 4, borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #3B82F6, #06B6D4)",
              width: `${porcentaje}%`,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#3B82F6", minWidth: 40, textAlign: "right" }}>
        {porcentaje.toFixed(1)}%
      </div>
    </div>
  );
}

export default function Reportes() {
  const { sucursales } = useSesionStore();
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(haceDias(0));
  const [sucursalId, setSucursalId] = useState("");
  const [canal, setCanal] = useState("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);

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

  if (cargando || !resumen) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
        <div style={{ fontSize: 18, marginBottom: 16 }}>⏳ Cargando dashboard...</div>
      </div>
    );
  }

  const margenBruto = resumen ? (resumen.utilidadBruta / resumen.totalVentas) * 100 : 0;
  const margenNeto = resumen ? ((resumen.utilidadBruta - resumen.totalGastos) / resumen.totalVentas) * 100 : 0;
  const sparklineData = resumen.ventasPorDia.slice(-7).map((d) => ({ value: d.total }));

  // Preparar datos de métodos de pago (arreglando el problema de "total")
  const datosMetodosPago = (resumen.ventasPorMetodoPago || []).map((m) => ({
    name: m.metodoPago,
    value: m.total,
  }));

  // Preparar datos para gráfico de costos y gastos
  const costoGastoData = [
    { nombre: "Costo de Productos", valor: resumen.costoVentas, color: "#EF4444" },
    { nombre: "Costos Materiales", valor: resumen.totalCostos, color: "#DC2626" },
    { nombre: "Gastos Operacionales", valor: resumen.totalGastos, color: "#F87171" },
  ];

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", padding: 32 }}>
      {/* HEADER */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <TrendingUp size={32} color="#3B82F6" />
          <div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#0f172a" }}>Dashboard de Ventas</h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Business Intelligence en tiempo real</p>
          </div>
        </div>

        {/* FILTROS */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 12,
            padding: 20,
            border: "1px solid #E2E8F0",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>
              <Filter size={14} style={{ display: "inline", marginRight: 4 }} /> Período Rápido
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {RANGOS.map((r) => (
                <button
                  key={r.dias}
                  onClick={() => aplicarRango(r.dias)}
                  style={{
                    padding: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    background: desde === haceDias(r.dias) ? "#3B82F6" : "#F3F4F6",
                    color: desde === haceDias(r.dias) ? "#fff" : "#1e293b",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>Sucursal</label>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13 }}
            >
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs - GRID SUPERIOR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 32 }}>
        <KPICard
          titulo="Total de Ventas"
          valor={formatoMoneda(resumen.totalVentas)}
          icono={<DollarSign size={24} />}
          color="#22C55E"
          datos={sparklineData}
          subtitulo={`${resumen.numeroVentas} transacciones`}
        />
        <KPICard
          titulo="Utilidad Bruta"
          valor={formatoMoneda(resumen.utilidadBruta)}
          icono={<TrendingUp size={24} />}
          color="#3B82F6"
          datos={sparklineData}
          subtitulo={`${margenBruto.toFixed(1)}% margen`}
        />
        <KPICard
          titulo="Gastos Operacionales"
          valor={formatoMoneda(resumen.totalGastos)}
          icono={<Zap size={24} />}
          color="#EF4444"
          datos={sparklineData}
          subtitulo={`${((resumen.totalGastos / resumen.totalVentas) * 100).toFixed(1)}% de ventas`}
        />
        <KPICard
          titulo="Utilidad Neta"
          valor={formatoMoneda(resumen.utilidadBruta - resumen.totalGastos)}
          icono={<Award size={24} />}
          color="#F59E0B"
          datos={sparklineData}
          subtitulo={`${margenNeto.toFixed(1)}% neto`}
        />
      </div>

      {/* GRÁFICOS PRINCIPALES */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20, marginBottom: 32 }}>
        {/* TENDENCIA DE VENTAS */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 12,
            padding: 24,
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <h3 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            <TrendingUp size={20} color="#3B82F6" /> Tendencia de Ventas
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={(resumen.ventasPorDia || [])}>
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8 }}
                formatter={(value) => formatoMoneda(value as number)}
              />
              <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorVentas)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* MÉTODOS DE PAGO - DONUT MEJORADO */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 12,
            padding: 24,
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <h3 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            <ShoppingCart size={20} color="#F59E0B" /> Ventas por Método de Pago
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={datosMetodosPago}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {datosMetodosPago.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={COLORES[i % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatoMoneda(value as number)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ANÁLISIS DE COSTOS Y GASTOS */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: 24,
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          marginBottom: 32,
        }}
      >
        <h3 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
          <Zap size={20} color="#EF4444" /> Desglose de Costos y Gastos
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16, marginBottom: 24 }}>
          {costoGastoData.map((item) => (
            <div
              key={item.nombre}
              style={{
                background: `linear-gradient(135deg, ${item.color}15 0%, ${item.color}05 100%)`,
                border: `1px solid ${item.color}40`,
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: item.color, marginBottom: 8 }}>{item.nombre}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{formatoMoneda(item.valor)}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                {((item.valor / resumen.totalVentas) * 100).toFixed(1)}% del total
              </div>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={costoGastoData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="nombre" angle={-15} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatoMoneda(value as number)} />
            <Bar dataKey="valor" fill="#3B82F6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* TOP PRODUCTOS */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: 24,
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          marginBottom: 32,
        }}
      >
        <h3 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
          <Package size={20} color="#22C55E" /> Top 10 Productos Más Vendidos
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {(resumen.productosMasVendidos || []).slice(0, 10).map((producto, idx) => (
            <ProductCard
              key={producto.productoId}
              nombre={producto.nombre}
              cantidad={producto.cantidad}
              total={producto.total}
              imagen={producto.imagen}
              porcentaje={(producto.total / resumen.totalVentas) * 100}
              rank={idx + 1}
            />
          ))}
        </div>
      </div>

      {/* ANÁLISIS POR CANAL */}
      {(resumen.ventasPorCanal?.length ?? 0) > 0 && (
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 12,
            padding: 24,
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            marginBottom: 32,
          }}
        >
          <h3 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            <TrendingUp size={20} color="#8B5CF6" /> Análisis por Canal de Venta
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            {(resumen.ventasPorCanal || []).map((canal, idx) => (
              <div
                key={canal.canal}
                style={{
                  background: `linear-gradient(135deg, ${COLORES[idx % COLORES.length]}15 0%, ${COLORES[idx % COLORES.length]}05 100%)`,
                  border: `1px solid ${COLORES[idx % COLORES.length]}40`,
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 700, color: COLORES[idx % COLORES.length], marginBottom: 8 }}>{canal.canal}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>{formatoMoneda(canal.total)}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                  {canal.cantidad} ventas • {canal.unidades} unidades
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORES[idx % COLORES.length] }}>{canal.porcentajeVentas.toFixed(1)}% del total</div>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={(resumen.ventasPorCanal || [])}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="canal" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatoMoneda(value as number)} />
              <Bar dataKey="total" fill="#3B82F6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ANÁLISIS DE PROVEEDORES */}
      {(resumen.proveedores?.length ?? 0) > 0 && (
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 12,
            padding: 24,
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            marginBottom: 32,
          }}
        >
          <h3 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            <Users size={20} color="#EC4899" /> Rendimiento de Proveedores
          </h3>

          {/* Top 5 Proveedores */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Top 5 Proveedores Más Rentables</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
              {(resumen.proveedores || []).slice(0, 5).map((prov, idx) => (
                <div
                  key={prov.id}
                  style={{
                    background: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    padding: 16,
                    borderLeft: `4px solid ${COLORES[idx % COLORES.length]}`,
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {idx + 1}. {prov.nombre}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Ventas</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#22C55E" }}>{formatoMoneda(prov.valorVendido)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Utilidad</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#3B82F6" }}>{formatoMoneda(prov.utilidad)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Margen</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#F59E0B" }}>{prov.margenPorcentaje.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Productos</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#8B5CF6" }}>{prov.productos}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gráfico de Comparación Ventas vs Costos - Top 10 */}
          <h4 style={{ margin: "20px 0 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Top 10: Ventas vs Costos</h4>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={(resumen.proveedores || []).slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="nombre" angle={-45} textAnchor="end" height={100} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatoMoneda(value as number)} />
              <Legend />
              <Bar dataKey="valorVendido" name="Ventas" fill="#22C55E" radius={[8, 8, 0, 0]} />
              <Bar dataKey="costo" name="Costo" fill="#EF4444" radius={[8, 8, 0, 0]} />
              <Line type="monotone" dataKey="margenPorcentaje" name="% Margen" stroke="#F59E0B" strokeWidth={2} yAxisId="right" />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Todos los Proveedores - Bar Chart Horizontal */}
          {(resumen.proveedores?.length ?? 0) > 10 && (
            <>
              <h4 style={{ margin: "30px 0 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Todos los Proveedores - Ranking Completo</h4>
              <ResponsiveContainer width="100%" height={Math.max(400, (resumen.proveedores?.length ?? 0) * 25)}>
                <BarChart
                  data={(resumen.proveedores || []).map((p) => ({
                    ...p,
                    nombreCorto: p.nombre.length > 20 ? p.nombre.substring(0, 17) + "..." : p.nombre,
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 280, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="nombreCorto" type="category" tick={{ fontSize: 11 }} width={270} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === "margenPorcentaje") return [(value as number).toFixed(1) + "%", name];
                      return [formatoMoneda(value as number), name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="valorVendido" name="Ventas" fill="#22C55E" radius={[0, 8, 8, 0]} />
                  <Bar dataKey="costo" name="Costo" fill="#EF4444" radius={[0, 8, 8, 0]} />
                  <Bar dataKey="utilidad" name="Utilidad" fill="#3B82F6" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}

      {/* ANÁLISIS AVANZADO */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: 24,
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        }}
      >
        <h3 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
          <Award size={20} color="#EC4899" /> Análisis Avanzado
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {/* VENTAS POR SUCURSAL */}
          <div>
            <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Desempeño por Sucursal</h4>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={(resumen.ventasPorSucursal || [])}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="sucursalNombre" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatoMoneda(value as number)} />
                <Bar dataKey="total" fill="#06B6D4" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ESTADÍSTICAS CLAVE */}
          <div>
            <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Indicadores Clave</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "#F0F9FF", borderRadius: 8, padding: 12, borderLeft: "4px solid #3B82F6" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Ticket Promedio</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{formatoMoneda(resumen.ticketPromedio)}</div>
              </div>
              <div style={{ background: "#F0FDF4", borderRadius: 8, padding: 12, borderLeft: "4px solid #22C55E" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Unidades Vendidas</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{resumen.unidadesVendidas.toLocaleString("es-CO")}</div>
              </div>
              <div style={{ background: "#FEF3C7", borderRadius: 8, padding: 12, borderLeft: "4px solid #F59E0B" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Margen Bruto</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{margenBruto.toFixed(1)}%</div>
              </div>
              <div style={{ background: "#EFF6FF", borderRadius: 8, padding: 12, borderLeft: "4px solid #8B5CF6" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>ROAS (Meta Ads)</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{resumen.roas ? `${resumen.roas.toFixed(2)}x` : "N/A"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
