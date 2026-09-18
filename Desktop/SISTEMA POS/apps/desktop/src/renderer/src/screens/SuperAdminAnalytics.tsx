import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BarChart3, Users, Building2, Globe, Languages, Smartphone } from "lucide-react";
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

interface Analytics {
  totalUsuarios: number;
  totalEmpresas: number;
  zonasHorarias: Array<{ name: string; value: number }>;
  idiomas: Array<{ name: string; value: number }>;
  dispositivos: Array<{ name: string; value: number }>;
  ultimosUsuarios: Array<{
    id: string;
    nombre: string;
    email: string;
    creadoEn: string;
    zonaHoraria: string | null;
    idioma: string | null;
    dispositivo: string | null;
    empresa: { nombre: string };
  }>;
}

const COLORES = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
];

export default function SuperAdminAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarAnalytics();
  }, []);

  async function cargarAnalytics() {
    try {
      setCargando(true);
      const { data } = await api.get<Analytics>("/admin/analytics");
      setAnalytics(data);
    } catch (err: any) {
      setError("Error al cargar analytics");
      console.error(err);
    } finally {
      setCargando(false);
    }
  }

  if (cargando) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: "18px", color: "#64748B" }}>Cargando analytics...</div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#EF4444" }}>
        {error || "Error al cargar datos"}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <BarChart3 size={32} style={{ color: "#3B82F6" }} />
          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 700, color: "#0F172A" }}>
            Dashboard de Analytics
          </h1>
        </div>
        <p style={{ margin: "8px 0 0 0", color: "#64748B", fontSize: "14px" }}>
          Visualización en tiempo real de usuarios, regiones e idiomas
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        {/* Total Usuarios */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                Usuarios Activos
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 700, color: "#3B82F6" }}>
                {analytics.totalUsuarios}
              </p>
            </div>
            <Users size={32} style={{ color: "#3B82F6", opacity: 0.2 }} />
          </div>
        </div>

        {/* Total Empresas */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                Empresas
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 700, color: "#10B981" }}>
                {analytics.totalEmpresas}
              </p>
            </div>
            <Building2 size={32} style={{ color: "#10B981", opacity: 0.2 }} />
          </div>
        </div>

        {/* Zonas Horarias Únicas */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                Zonas Horarias
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 700, color: "#F59E0B" }}>
                {analytics.zonasHorarias.length}
              </p>
            </div>
            <Globe size={32} style={{ color: "#F59E0B", opacity: 0.2 }} />
          </div>
        </div>

        {/* Idiomas */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                Idiomas
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 700, color: "#8B5CF6" }}>
                {analytics.idiomas.length}
              </p>
            </div>
            <Languages size={32} style={{ color: "#8B5CF6", opacity: 0.2 }} />
          </div>
        </div>

        {/* Dispositivos */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                Dispositivos
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 700, color: "#EC4899" }}>
                {analytics.dispositivos.length}
              </p>
            </div>
            <Smartphone size={32} style={{ color: "#EC4899", opacity: 0.2 }} />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px", marginBottom: "32px" }}>
        {/* Idiomas Pie Chart */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
            Distribución de Idiomas
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analytics.idiomas}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {analytics.idiomas.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORES[index % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Dispositivos Bar Chart */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
            Distribución de Dispositivos
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.dispositivos}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Zonas Horarias Chart */}
      <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: "32px" }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
          Distribución de Zonas Horarias
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analytics.zonasHorarias}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#10B981" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Últimos Usuarios Table */}
      <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
          Últimos Usuarios Registrados
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ textAlign: "left", padding: "12px", fontSize: "12px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                  Nombre
                </th>
                <th style={{ textAlign: "left", padding: "12px", fontSize: "12px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                  Email
                </th>
                <th style={{ textAlign: "left", padding: "12px", fontSize: "12px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                  Empresa
                </th>
                <th style={{ textAlign: "left", padding: "12px", fontSize: "12px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                  Zona Horaria
                </th>
                <th style={{ textAlign: "left", padding: "12px", fontSize: "12px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                  Dispositivo
                </th>
                <th style={{ textAlign: "left", padding: "12px", fontSize: "12px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                  Registrado
                </th>
              </tr>
            </thead>
            <tbody>
              {analytics.ultimosUsuarios.map((usuario) => (
                <tr key={usuario.id} style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: "12px", fontSize: "13px", color: "#0F172A", fontWeight: 500 }}>
                    {usuario.nombre}
                  </td>
                  <td style={{ padding: "12px", fontSize: "13px", color: "#64748B" }}>
                    {usuario.email}
                  </td>
                  <td style={{ padding: "12px", fontSize: "13px", color: "#64748B" }}>
                    {usuario.empresa.nombre}
                  </td>
                  <td style={{ padding: "12px", fontSize: "13px", color: "#64748B" }}>
                    {usuario.zonaHoraria || "-"}
                  </td>
                  <td style={{ padding: "12px", fontSize: "13px", color: "#64748B" }}>
                    {usuario.dispositivo || "-"}
                  </td>
                  <td style={{ padding: "12px", fontSize: "13px", color: "#64748B" }}>
                    {new Date(usuario.creadoEn).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
