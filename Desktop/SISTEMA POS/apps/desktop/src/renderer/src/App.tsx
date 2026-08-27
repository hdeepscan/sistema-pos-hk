import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSesionStore } from "./lib/store";
import { connectSocket } from "./lib/socket";
import { api } from "./lib/api";
import { electronAPI } from "./lib/electron-api";
import { ErrorBoundary } from "./lib/ErrorBoundary";
import { isMobileDevice, getMobilePreference, setMobilePreference } from "./lib/mobile-detect";
import Login from "./screens/Login";
import SeleccionSucursal from "./screens/SeleccionSucursal";
import Layout from "./screens/Layout";
import Pos from "./screens/Pos";
import PosMobile from "./screens/PosMobile";
import Ventas from "./screens/Ventas";
import Productos from "./screens/Productos";
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
import CuentasBancarias from "./screens/CuentasBancarias";
import Calendario from "./screens/Calendario";
import Contabilidad from "./screens/Contabilidad";
import Cotizaciones from "./screens/Cotizaciones";

export default function App() {
  const { token, sucursalActivaId, hidratado, setApiBaseUrl, setSesion, setSucursalActiva, setHidratado } =
    useSesionStore();
  // La key por ruta hace que el ErrorBoundary se "resetee" al navegar a otra
  // pantalla, en vez de quedarse trabado mostrando el error anterior.
  const location = useLocation();

  // Detección automática de mobile (o override manual del usuario)
  const [isMobile, setIsMobile] = useState(() => {
    const userPreference = getMobilePreference();
    return userPreference !== null ? userPreference : isMobileDevice();
  });

  useEffect(() => {
    const initConfig = async () => {
      let apiBaseUrl = "/"; // Default to current origin for web
      let token = null;
      let sucursalId = null;

      try {
        const config = await electronAPI.getConfig();
        apiBaseUrl = config.apiBaseUrl || "/";
        token = config.token;
        sucursalId = config.sucursalId;
      } catch (err) {
        console.error("Error getting config:", err);
      }

      setApiBaseUrl(apiBaseUrl);

      if (token) {
        try {
          const { data } = await api.get("/auth/sesion", {
            baseURL: apiBaseUrl,
            headers: { Authorization: `Bearer ${token}` },
          });
          setSesion({ token, ...data });
          if (sucursalId) setSucursalActiva(sucursalId);
        } catch {
          await electronAPI.setConfig({ token: null, empresaId: null, sucursalId: null });
        }
      }
      setHidratado();
    };

    initConfig();
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

  // Cambiar a mobile si se redimensiona la ventana
  useEffect(() => {
    const handleResize = () => {
      const userPreference = getMobilePreference();
      if (userPreference === null) {
        setIsMobile(isMobileDevice());
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <Layout isMobile={isMobile} setIsMobile={setIsMobile}>
      <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/pos" replace />} />
        {/* /pos detecta automáticamente si es mobile y renderiza el componente correcto */}
        <Route path="/pos" element={isMobile ? <PosMobile /> : <Pos />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/productos" element={<Productos />} />
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
        <Route path="/cuentas-bancarias" element={<CuentasBancarias />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/contabilidad" element={<Contabilidad />} />
        <Route path="/cotizaciones" element={<Cotizaciones />} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
