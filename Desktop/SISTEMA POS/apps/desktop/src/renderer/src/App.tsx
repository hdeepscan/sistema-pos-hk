import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useSesionStore } from "./lib/store";
import { connectSocket } from "./lib/socket";
import { api } from "./lib/api";
import Login from "./screens/Login";
import SeleccionSucursal from "./screens/SeleccionSucursal";
import Layout from "./screens/Layout";
import Pos from "./screens/Pos";
import Inventario from "./screens/Inventario";
import Configuracion from "./screens/Configuracion";

export default function App() {
  const { token, sucursalActivaId, hidratado, setApiBaseUrl, setSesion, setSucursalActiva, setHidratado } =
    useSesionStore();

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
      <Routes>
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>
    </Layout>
  );
}
