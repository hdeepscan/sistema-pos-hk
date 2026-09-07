import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  AlertCircle,
  X,
} from "lucide-react";

interface Insight {
  id: string;
  icon: string;
  titulo: string;
  descripcion: string;
  tipo: "info" | "warning" | "success";
}

interface KPIs {
  totalProveedores: number;
  valorInventario: number;
  valorVenta: number;
  utilidadPotencial: number;
}

interface DistribucionItem {
  nombre: string;
  valor: number;
  porcentaje: number;
}

interface RankingItem {
  id: string;
  nombre: string;
  productos: number;
  unidades: number;
  costo: number;
  venta: number;
  utilidad: number;
  margenPorcentaje: number;
  unidadesVendidas?: number;
  valorVendido?: number;
  rotacion?: number;
}

interface GraficoComparativoItem {
  nombre: string;
  "Inversión Actual": number;
  "Ventas Históricas": number;
}

interface GraficoTendenciaItem {
  mes: string;
  ventas: number;
}

interface AnalyticsData {
  insights: Insight[];
  kpis: KPIs;
  graficoDistribucion: DistribucionItem[];
  graficoComparativo?: GraficoComparativoItem[];
  graficoTendencia?: GraficoTendenciaItem[];
  ranking: RankingItem[];
}

const COLORES = [
  "#3B82F6", // CENTRALA BLUE
  "#06B6D4", // CYAN
  "#10B981", // GREEN
  "#F59E0B", // AMBER
  "#EF4444", // RED
];

const styles = `
  .analytics-container {
    min-height: 100vh;
    background: #FFFFFF;
    padding: 32px;
  }

  .analytics-header {
    margin-bottom: 32px;
  }

  .analytics-title {
    font-size: 32px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px 0;
    font-family: "Montserrat", sans-serif;
  }

  .analytics-subtitle {
    font-size: 14px;
    color: #64748b;
    margin: 0;
  }

  /* ===== INSIGHTS ===== */
  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .insight-card {
    background: #FFFFFF;
    border: 1px solid rgba(59, 130, 246, 0.08);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: all 0.3s ease;
  }

  .insight-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.15);
  }

  .insight-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: rgba(59, 130, 246, 0.1);
    border-radius: 12px;
    margin-bottom: 12px;
    color: #3B82F6;
  }

  .insight-titulo {
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 6px;
  }

  .insight-descripcion {
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
  }

  /* ===== KPIs ===== */
  .kpi-section {
    margin-bottom: 32px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 16px;
    font-family: "Montserrat", sans-serif;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .kpi-card {
    background: #FFFFFF;
    border: 1px solid rgba(59, 130, 246, 0.08);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: all 0.3s ease;
  }

  .kpi-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.15);
  }

  .kpi-label {
    font-size: 12px;
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.3px;
    margin-bottom: 8px;
  }

  .kpi-value {
    font-size: 28px;
    font-weight: 800;
    color: #3B82F6;
  }

  .kpi-subtitle {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }

  /* ===== CHART SECTION ===== */
  .chart-section {
    background: #FFFFFF;
    border: 1px solid rgba(59, 130, 246, 0.08);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 32px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  /* ===== TABLE SECTION ===== */
  .table-section {
    background: #FFFFFF;
    border: 1px solid rgba(59, 130, 246, 0.08);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .ranking-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .ranking-table thead {
    background: #3B82F6;
    color: white;
  }

  .ranking-table th {
    padding: 14px 16px;
    text-align: left;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.4px;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
  }

  .ranking-table th:hover {
    background: #2563EB;
  }

  .ranking-table th::after {
    content: " ↕";
    opacity: 0.5;
  }

  .ranking-table th.sorted-asc::after {
    content: " ↑";
    opacity: 1;
  }

  .ranking-table th.sorted-desc::after {
    content: " ↓";
    opacity: 1;
  }

  .ranking-table td {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    color: #0f172a;
  }

  .ranking-table tbody tr {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ranking-table tbody tr:hover {
    background: rgba(59, 130, 246, 0.08);
    transform: translateX(4px);
  }

  .ranking-table tbody tr:last-child td {
    border-bottom: none;
  }

  .currency {
    font-weight: 600;
    color: #3B82F6;
  }

  .percentage {
    font-weight: 600;
    color: #10B981;
  }

  /* ===== DRAWER ===== */
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    z-index: 999;
  }

  .drawer {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 600px;
    background: #FFFFFF;
    box-shadow: -10px 0 40px rgba(0, 0, 0, 0.15);
    animation: slideInRight 0.3s ease;
    overflow-y: auto;
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .drawer-header {
    padding: 24px;
    border-bottom: 1px solid #E2E8F0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    font-family: "Montserrat", sans-serif;
    margin: 0;
  }

  .drawer-close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #64748b;
    transition: all 0.2s;
  }

  .drawer-close-btn:hover {
    color: #0f172a;
    background: rgba(0, 0, 0, 0.05);
  }

  /* ===== POWER BI CHARTS ===== */
  .powerbi-section {
    background: #FFFFFF;
    border: 1px solid rgba(59, 130, 246, 0.08);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 32px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .powerbi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
    gap: 24px;
    margin-bottom: 32px;
  }

  .drawer-content {
    padding: 24px;
    flex: 1;
    overflow-y: auto;
  }

  .drawer-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .drawer-table thead {
    background: #3B82F6;
    color: white;
  }

  .drawer-table th {
    padding: 12px;
    text-align: left;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.4px;
  }

  .drawer-table td {
    padding: 12px;
    border-bottom: 1px solid #E2E8F0;
    color: #0f172a;
  }

  .drawer-table tbody tr:hover {
    background: rgba(59, 130, 246, 0.04);
  }

  .drawer-table tbody tr:last-child td {
    border-bottom: none;
  }

  .stock-alert {
    background: rgba(239, 68, 68, 0.1);
    border-left: 3px solid #dc2626;
  }

  .stock-alert td {
    color: #dc2626;
    font-weight: 600;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #64748b;
    font-size: 14px;
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  @media (max-width: 768px) {
    .analytics-container {
      padding: 16px;
    }

    .insights-grid {
      grid-template-columns: 1fr;
    }

    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .analytics-title {
      font-size: 24px;
    }

    .ranking-table {
      font-size: 12px;
    }

    .ranking-table th,
    .ranking-table td {
      padding: 10px 8px;
    }
  }
`;

interface ProductoDetalle {
  id: string;
  nombre: string;
  sku: string;
  stockTotal: number;
  costoUnitario: number;
  precioVenta: number;
  valorInventarioCosto: number;
  utilidadPotencial: number;
}

export function ProveedoresAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof RankingItem;
    direction: "asc" | "desc";
  } | null>(null);
  const [selectedProveedor, setSelectedProveedor] = useState<{
    id: string;
    nombre: string;
  } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [productosDetalle, setProductosDetalle] = useState<ProductoDetalle[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    setError(null);
    try {
      // Usar endpoint del cliente (no del admin)
      const { data: analyticsData } = await api.get("/reportes/analisis-proveedores");
      console.log("✅ Analytics Data Loaded:", analyticsData);
      setData(analyticsData);
    } catch (err: any) {
      console.error("❌ Error loading analytics:", err);
      setError(
        err.response?.data?.error || `Error cargando reportes: ${err.message}`
      );
    } finally {
      setLoading(false);
    }
  }

  function formatearMoneda(valor: number): string {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(valor);
  }

  async function abrirDrawerProveedor(proveedor: RankingItem) {
    setSelectedProveedor({ id: proveedor.id, nombre: proveedor.nombre });
    setIsDrawerOpen(true);
    setCargandoDetalle(true);

    try {
      const { data } = await api.get<ProductoDetalle[]>(
        `/reportes/analisis-proveedores/${proveedor.id}/productos`
      );
      console.log(`✅ Productos detalle cargados para ${proveedor.nombre}:`, data);
      setProductosDetalle(data);
    } catch (err: any) {
      console.error(`❌ Error cargando detalle de ${proveedor.nombre}:`, err);
      setProductosDetalle([]);
    } finally {
      setCargandoDetalle(false);
    }
  }

  function cerrarDrawer() {
    setIsDrawerOpen(false);
    setSelectedProveedor(null);
    setProductosDetalle([]);
  }

  function ordenarTabla(key: keyof RankingItem) {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig?.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  }

  const rankingOrdenado = data?.ranking
    ? [...data.ranking].sort((a, b) => {
        if (!sortConfig) return 0;

        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc"
            ? aValue - bValue
            : bValue - aValue;
        }

        return 0;
      })
    : [];

  if (loading) {
    return (
      <div className="analytics-container">
        <style>{styles}</style>
        <div className="loading">Cargando reportes de proveedores...</div>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      <style>{styles}</style>

      {/* Header */}
      <div className="analytics-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <Package size={32} color="#3B82F6" />
          <h1 className="analytics-title">Análisis de Proveedores</h1>
        </div>
        <p className="analytics-subtitle">
          Inteligencia de negocios: distribución de inventario, rentabilidad y
          trends
        </p>
      </div>

      {error && <div className="error">{error}</div>}

      {data && (
        <>
          {/* INSIGHTS */}
          <div className="insights-grid">
            {data.insights.map((insight) => (
              <div key={insight.id} className="insight-card">
                <div className="insight-icon">{insight.icon}</div>
                <div className="insight-titulo">{insight.titulo}</div>
                <div className="insight-descripcion">{insight.descripcion}</div>
              </div>
            ))}
          </div>

          {/* KPIs */}
          <div className="kpi-section">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <TrendingUp size={20} color="#3B82F6" />
              <h3 className="section-title">KPIs Principales</h3>
            </div>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Total Proveedores</div>
                <div className="kpi-value">{data.kpis.totalProveedores}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Valor Inventario</div>
                <div className="kpi-value" style={{ fontSize: "20px" }}>
                  {formatearMoneda(data.kpis.valorInventario)}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Ventas Totales</div>
                <div className="kpi-value" style={{ fontSize: "20px" }}>
                  {formatearMoneda(data.kpis.valorVenta)}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Utilidad Potencial</div>
                <div className="kpi-value" style={{ fontSize: "20px" }}>
                  {formatearMoneda(data.kpis.utilidadPotencial)}
                </div>
              </div>
            </div>
          </div>

          {/* CHART */}
          <div className="chart-section">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <DollarSign size={20} color="#3B82F6" />
              <h3 className="section-title">Distribución de Inventario</h3>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={data.graficoDistribucion}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={140}
                  paddingAngle={2}
                  dataKey="valor"
                  label={({ nombre, porcentaje }) => `${nombre} ${porcentaje}%`}
                >
                  {data.graficoDistribucion.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORES[index % COLORES.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatearMoneda(value)}
                  contentStyle={{
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* POWER BI CHARTS */}
          {data.graficoComparativo && data.graficoComparativo.length > 0 && (
            <div className="powerbi-section">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <TrendingUp size={20} color="#3B82F6" />
                <h3 className="section-title">Análisis Comparativo: Inversión vs Ventas</h3>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart
                  data={data.graficoComparativo}
                  margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="nombre"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => formatearMoneda(value)}
                    contentStyle={{
                      background: "#FFFFFF",
                      border: "1px solid #E2E8F0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Inversión Actual" fill="#3B82F6" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="Ventas Históricas" fill="#10B981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {data.graficoTendencia && data.graficoTendencia.length > 0 && (
            <div className="powerbi-section">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <TrendingUp size={20} color="#3B82F6" />
                <h3 className="section-title">Tendencia de Ventas (Últimos 6 Meses)</h3>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart
                  data={data.graficoTendencia}
                  margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => formatearMoneda(value)}
                    contentStyle={{
                      background: "#FFFFFF",
                      border: "1px solid #E2E8F0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ventas"
                    stroke="#06B6D4"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorVentas)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* TABLE */}
          <div className="table-section">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <TrendingUp size={20} color="#3B82F6" />
              <h3 className="section-title">Ranking de Proveedores</h3>
            </div>
            <div className="table-wrapper">
              <table className="ranking-table">
                <thead>
                  <tr>
                    <th onClick={() => ordenarTabla("nombre")}>Proveedor</th>
                    <th onClick={() => ordenarTabla("productos")}>
                      Productos
                    </th>
                    <th onClick={() => ordenarTabla("unidades")}>Stock Act.</th>
                    <th>Unid. Vendidas</th>
                    <th onClick={() => ordenarTabla("costo")}>Costo Total</th>
                    <th onClick={() => ordenarTabla("venta")}>Venta Total</th>
                    <th onClick={() => ordenarTabla("utilidad")}>Utilidad</th>
                    <th onClick={() => ordenarTabla("margenPorcentaje")}>
                      Margen %
                    </th>
                    <th>Rotación</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingOrdenado.map((proveedor) => (
                    <tr
                      key={proveedor.id}
                      onClick={() => abrirDrawerProveedor(proveedor)}
                      title={`Click para ver detalles de ${proveedor.nombre}`}
                    >
                      <td>
                        <strong>{proveedor.nombre}</strong>
                      </td>
                      <td>{proveedor.productos}</td>
                      <td>{proveedor.unidades.toLocaleString()}</td>
                      <td style={{ fontWeight: 600, color: "#06B6D4" }}>
                        {(proveedor.unidadesVendidas || 0).toLocaleString()}
                      </td>
                      <td className="currency">
                        {formatearMoneda(proveedor.costo)}
                      </td>
                      <td className="currency">
                        {formatearMoneda(proveedor.venta)}
                      </td>
                      <td className="currency">
                        {formatearMoneda(proveedor.utilidad)}
                      </td>
                      <td className="percentage">
                        {proveedor.margenPorcentaje.toFixed(1)}%
                      </td>
                      <td style={{ fontWeight: 600, color: "#F59E0B" }}>
                        {(proveedor.rotacion || 0).toFixed(2)}x
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* DRAWER: Detalle de Productos */}
      {isDrawerOpen && selectedProveedor && (
        <>
          <div
            className="drawer-overlay"
            onClick={cerrarDrawer}
          />
          <div className="drawer">
            <div className="drawer-header">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Package size={24} color="#3B82F6" />
                <h3 className="drawer-title">{selectedProveedor.nombre}</h3>
              </div>
              <button
                className="drawer-close-btn"
                onClick={cerrarDrawer}
                title="Cerrar"
              >
                <X size={24} />
              </button>
            </div>

            <div className="drawer-content">
              {cargandoDetalle ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  Cargando productos...
                </div>
              ) : productosDetalle.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                  No hay productos para este proveedor
                </div>
              ) : (
                <table className="drawer-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>SKU</th>
                      <th>Stock</th>
                      <th>Costo Unit.</th>
                      <th>Precio Venta</th>
                      <th>Val. Invertido</th>
                      <th>Utilidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosDetalle.map((prod) => (
                      <tr
                        key={prod.id}
                        className={prod.stockTotal <= 0 ? "stock-alert" : ""}
                      >
                        <td>
                          <strong>{prod.nombre}</strong>
                          {prod.stockTotal <= 0 && (
                            <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <AlertCircle size={12} />
                              Agotado
                            </div>
                          )}
                        </td>
                        <td>{prod.sku}</td>
                        <td>
                          {prod.stockTotal === 0 ? (
                            <span style={{ color: "#dc2626", fontWeight: 600 }}>0</span>
                          ) : (
                            prod.stockTotal.toLocaleString()
                          )}
                        </td>
                        <td>{formatearMoneda(prod.costoUnitario)}</td>
                        <td>{formatearMoneda(prod.precioVenta)}</td>
                        <td style={{ fontWeight: 600 }}>
                          {formatearMoneda(prod.valorInventarioCosto)}
                        </td>
                        <td style={{ fontWeight: 600, color: "#10B981" }}>
                          {formatearMoneda(prod.utilidadPotencial)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
