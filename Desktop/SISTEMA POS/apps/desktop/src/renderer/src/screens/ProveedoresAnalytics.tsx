import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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
}

interface AnalyticsData {
  insights: Insight[];
  kpis: KPIs;
  graficoDistribucion: DistribucionItem[];
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
    font-size: 32px;
    margin-bottom: 12px;
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

  .ranking-table tbody tr:hover {
    background: rgba(59, 130, 246, 0.04);
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

export function ProveedoresAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof RankingItem;
    direction: "asc" | "desc";
  } | null>(null);

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
        <h1 className="analytics-title">📊 Análisis de Proveedores</h1>
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
            <h3 className="section-title">📈 KPIs Principales</h3>
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
            <h3 className="section-title">💰 Distribución de Inventario</h3>
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

          {/* TABLE */}
          <div className="table-section">
            <h3 className="section-title">🏆 Ranking de Proveedores</h3>
            <div className="table-wrapper">
              <table className="ranking-table">
                <thead>
                  <tr>
                    <th onClick={() => ordenarTabla("nombre")}>Proveedor</th>
                    <th onClick={() => ordenarTabla("productos")}>
                      Productos
                    </th>
                    <th onClick={() => ordenarTabla("unidades")}>Unidades</th>
                    <th onClick={() => ordenarTabla("costo")}>Costo Total</th>
                    <th onClick={() => ordenarTabla("venta")}>Venta Total</th>
                    <th onClick={() => ordenarTabla("utilidad")}>Utilidad</th>
                    <th onClick={() => ordenarTabla("margenPorcentaje")}>
                      Margen %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rankingOrdenado.map((proveedor) => (
                    <tr key={proveedor.id}>
                      <td>
                        <strong>{proveedor.nombre}</strong>
                      </td>
                      <td>{proveedor.productos}</td>
                      <td>{proveedor.unidades.toLocaleString()}</td>
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
