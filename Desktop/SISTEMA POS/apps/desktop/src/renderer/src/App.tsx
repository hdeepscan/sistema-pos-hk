import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSesionStore, useTemaStore } from "./lib/store";
import { connectSocket } from "./lib/socket";
import { api } from "./lib/api";
import { electronAPI } from "./lib/electron-api";
import { ErrorBoundary } from "./lib/ErrorBoundary";
import { isMobileDevice, getMobilePreference, setMobilePreference } from "./lib/mobile-detect";
import { notif } from "./lib/notificationService";
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
import CheckoutPage from "./screens/CheckoutPage";

export default function App() {
  const { token, sucursalActivaId, hidratado, setApiBaseUrl, setSesion, setSucursalActiva, setHidratado } =
    useSesionStore();
  const { tema, setTema } = useTemaStore();
  const location = useLocation();

  // Estado simple para mobile (sin inicializador que podría causar error)
  const [isMobile, setIsMobileState] = useState(false);
  const [mobileInitialized, setMobileInitialized] = useState(false);

  // Inicializar tema
  useEffect(() => {
    setTema(tema); // Aplica el tema guardado
  }, []);

  useEffect(() => {
    const initConfig = async () => {
      let apiBaseUrl = "/";
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
  }, [setApiBaseUrl, setSesion, setSucursalActiva, setHidratado]);

  // Inicializar detección de mobile después de que se cargue todo
  useEffect(() => {
    try {
      const userPreference = getMobilePreference();
      const detected = userPreference !== null ? userPreference : isMobileDevice();
      setIsMobileState(detected);
    } catch (err) {
      console.error("Error initializing mobile detection:", err);
      setIsMobileState(false);
    }
    setMobileInitialized(true);
  }, []);

  useEffect(() => {
    if (token) {
      const socket = connectSocket();

      // Escuchar eventos en tiempo real
      if (socket) {
        // Eventos de ventas
        socket.on("venta:creada", (data: any) => {
          notif.exito(
            `📊 Nueva venta: ${data.consecutivo || "Venta"} - $${(data.total || 0).toLocaleString("es-CO")}`
          );
        });

        // Eventos de productos
        socket.on("producto:creado", (data: any) => {
          notif.info(`✨ Nuevo producto: ${data.nombre || "Producto"}`);
        });

        socket.on("producto:editado", (data: any) => {
          notif.info(`📝 Producto actualizado: ${data.nombre || "Producto"}`);
        });

        // Eventos de stock bajo
        socket.on("stock:bajo", (data: any) => {
          notif.warning(
            `⚠️ Stock bajo: ${data.nombre || "Producto"} (${data.stock || 0} disponibles)`
          );
        });

        // Eventos de caja
        socket.on("caja:abierta", () => {
          notif.info("🏦 Caja abierta");
        });

        socket.on("caja:cerrada", (data: any) => {
          notif.exito(`🏦 Caja cerrada - Total: $${(data.total || 0).toLocaleString("es-CO")}`);
        });

        // Eventos de sincronización
        socket.on("inventario:actualizado", () => {
          notif.info("🔄 Inventario actualizado");
        });

        // Errores
        socket.on("error", (data: any) => {
          notif.error(`Error: ${data.mensaje || "Error desconocido"}`);
        });

        return () => {
          socket.off("venta:creada");
          socket.off("producto:creado");
          socket.off("producto:editado");
          socket.off("stock:bajo");
          socket.off("caja:abierta");
          socket.off("caja:cerrada");
          socket.off("inventario:actualizado");
          socket.off("error");
        };
      }
    }
  }, [token]);

  if (!hidratado || !mobileInitialized) return null;

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
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="*" element={<SeleccionSucursal />} />
      </Routes>
    );
  }

  const toggleMobilePreference = () => {
    const newValue = !isMobile;
    setIsMobileState(newValue);
    setMobilePreference(newValue);
  };

  return (
    <Layout isMobile={isMobile} setIsMobile={toggleMobilePreference}>
      <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/pos" element={isMobile ? <PosMobile onToggleMobile={toggleMobilePreference} /> : <Pos />} />
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
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
