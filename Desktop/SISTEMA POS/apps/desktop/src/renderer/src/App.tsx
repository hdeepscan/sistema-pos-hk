import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSesionStore } from "./lib/store";
import { connectSocket } from "./lib/socket";
import { api } from "./lib/api";
import { ErrorBoundary } from "./lib/ErrorBoundary";
import Login from "./screens/Login";
import SeleccionSucursal from "./screens/SeleccionSucursal";
import Layout from "./screens/Layout";
import Pos from "./screens/Pos";
import Ventas from "./screens/Ventas";
import Productos from "./screens/Productos";
import Inventario from "./screens/Inventario";
import Colecciones from "./screens/Colecciones";
import Clientes from "./screens/Clientes";
import Creditos from "./screens/Creditos";
import Proveedores from "./screens/Proveedores";
import Gastos from "./screens/Gastos";
import Reportes from "./screens/Reportes";
import Configuracion from "./screens/Configuracion";
import Usuarios from "./screens/Usuarios";
import PlantillaRecibo from "./screens/PlantillaRecibo";
import Notificaciones from "./screens/Notificaciones";
import Backups from "./screens/Backups";
import Caja from "./screens/Caja";
import Auditoria from "./screens/Auditoria";
import Shopify from "./screens/Shopify";
import MetaAds from "./screens/MetaAds";

export default function App() {
  const { token, sucursalActivaId, hidratado, setApiBaseUrl, setSesion, setSucursalActiva, setHidratado } =
    useSesionStore();
  // La key por ruta hace que el ErrorBoundary se "resetee" al navegar a otra
  // pantalla, en vez de quedarse trabado mostrando el error anterior.
  const location = useLocation();

  useEffect(() => {
    window.pos.getConfig().then(async (config) => {
      setApiBaseUrl(config.apiBaseUrl);
      if (config.token) {
        try {
          const { data } = await api.get("/auth/sesion", {
            baseURL: config.apiBaseUrl,
            headers: { Authorization: `Bearer ${config.token}` },
          });
          setSesion({ token: config.token, ...data });
          if (config.sucursalId) setSucursalActiva(config.sucursalId);
        } catch {
          await window.pos.setConfig({ token: null, empresaId: null, sucursalId: null });
        }
      }
      setHidratado();
    });
  }, []);

  useEffect(() => {
    if (token) connectSocket();
  }, [token]);

  if (!hidratado) return null;

  if (!token) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (!sucursalActivaId) {
    return (
      <Routes>
        <Route path="*" element={<SeleccionSucursal />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/colecciones" element={<Colecciones />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/creditos" element={<Creditos />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/plantilla-recibo" element={<PlantillaRecibo />} />
        <Route path="/notificaciones" element={<Notificaciones />} />
        <Route path="/backups" element={<Backups />} />
        <Route path="/caja" element={<Caja />} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/shopify" element={<Shopify />} />
        <Route path="/meta-ads" element={<MetaAds />} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
