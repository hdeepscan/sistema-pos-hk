import { BarChart3, Users, Building2, Globe, Languages, Smartphone, TrendingUp } from "lucide-react";
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LineChart, Line } from "recharts";

// 🎨 Colores para gráficos
const COLORES = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
];

// 📊 DATOS MOCKEADOS - Dashboard Analytics
const mockAnalytics = {
  totalUsuarios: 145,
  totalEmpresas: 48,
  crecimientoMensual: 23,
  dispositivosActivos: 312,

  // 📱 Dispositivos
  dispositivos: [
    { name: "Windows", value: 85 },
    { name: "Android", value: 42 },
    { name: "macOS", value: 18 },
    { name: "iOS", value: 12 },
  ],

  // 🌍 Zonas Horarias
  zonasHorarias: [
    { name: "UTC-5 (CO)", value: 98 },
    { name: "UTC-6 (MX)", value: 28 },
    { name: "UTC-4 (PA)", value: 12 },
    { name: "UTC-7 (PE)", value: 7 },
  ],

  // 🌐 Idiomas
  idiomas: [
    { name: "Español", value: 128 },
    { name: "Inglés", value: 12 },
    { name: "Portugués", value: 5 },
  ],

  // 📈 Registros por Día
  registrosDiarios: [
    { date: "Lun 11", usuarios: 8 },
    { date: "Mar 12", usuarios: 15 },
    { date: "Mié 13", usuarios: 12 },
    { date: "Jue 14", usuarios: 22 },
    { date: "Vie 15", usuarios: 18 },
    { date: "Sáb 16", usuarios: 5 },
    { date: "Dom 17", usuarios: 3 },
    { date: "Lun 18", usuarios: 14 },
  ],

  // 👥 Últimos usuarios
  ultimosUsuarios: [
    { id: "1", nombre: "Juan Pérez", email: "juan.perez@empresa.com", empresa: { nombre: "Zapatos HK" }, creadoEn: "2026-09-18", zonaHoraria: "UTC-5", dispositivo: "Windows" },
    { id: "2", nombre: "María López", email: "maria.lopez@tienda.com", empresa: { nombre: "Accesorios Plus" }, creadoEn: "2026-09-17", zonaHoraria: "UTC-5", dispositivo: "Android" },
    { id: "3", nombre: "Carlos Moreno", email: "carlos@negocios.com", empresa: { nombre: "Outlet 360" }, creadoEn: "2026-09-17", zonaHoraria: "UTC-6", dispositivo: "macOS" },
    { id: "4", nombre: "Ana Torres", email: "ana.torres@store.com", empresa: { nombre: "Fashion Market" }, creadoEn: "2026-09-16", zonaHoraria: "UTC-5", dispositivo: "iOS" },
    { id: "5", nombre: "David Morales", email: "david.morales@shop.com", empresa: { nombre: "Luxury Goods" }, creadoEn: "2026-09-16", zonaHoraria: "UTC-5", dispositivo: "Windows" },
  ],
};

export default function SuperAdminAnalytics() {
  const analytics = mockAnalytics;

  return (
    <div style={{ padding: "24px", background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <BarChart3 size={32} style={{ color: "#3B82F6" }} />
          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 700, color: "#0F172A" }}>
            📊 Analytics Dashboard
          </h1>
        </div>
        <p style={{ margin: "8px 0 0 0", color: "#64748B", fontSize: "14px" }}>
          Visión integral del sistema CENTRALA POS (Datos Simulados)
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "32px" }}>
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

        {/* Crecimiento */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                Crecimiento
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 700, color: "#F59E0B" }}>
                +{analytics.crecimientoMensual}%
              </p>
            </div>
            <TrendingUp size={32} style={{ color: "#F59E0B", opacity: 0.2 }} />
          </div>
        </div>

        {/* Dispositivos */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                Dispositivos Activos
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: "32px", fontWeight: 700, color: "#EC4899" }}>
                {analytics.dispositivosActivos}
              </p>
            </div>
            <Smartphone size={32} style={{ color: "#EC4899", opacity: 0.2 }} />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px", marginBottom: "32px" }}>
        {/* Dispositivos Pie Chart */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
            Distribución de Dispositivos
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analytics.dispositivos}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name} ${value}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {analytics.dispositivos.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORES[index % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Idiomas Pie Chart */}
        <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
            Preferencia de Idiomas
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analytics.idiomas}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name} ${value}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {analytics.idiomas.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORES[index % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Zonas Horarias Bar Chart */}
      <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: "32px" }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
          Distribución por Zona Horaria
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analytics.zonasHorarias}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#3B82F6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Registros Diarios Line Chart */}
      <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: "32px" }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600, color: "#0F172A" }}>
          Nuevos Registros (Últimas 2 Semanas)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={analytics.registrosDiarios}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="usuarios" stroke="#10B981" strokeWidth={2} dot={{ fill: "#10B981" }} />
          </LineChart>
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
