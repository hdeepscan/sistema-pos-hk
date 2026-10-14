import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore, type Sucursal } from "../lib/store";
import { electronAPI } from "../lib/electron-api";

export default function SeleccionSucursal() {
  const { sucursales, empresa, setSesion, setSucursalActiva, token, usuario, logout } = useSesionStore();
  const [lista, setLista] = useState<Sucursal[]>(sucursales);
  const [cargando, setCargando] = useState(sucursales.length === 0);

  useEffect(() => {
    if (sucursales.length > 0) return;
    api
      .get("/sucursales")
      .then(({ data }) => {
        setLista(data);
        setSesion({ token: token!, usuario, empresa, sucursales: data });
      })
      .finally(() => setCargando(false));
  }, []);

  async function seleccionar(id: string) {
    setSucursalActiva(id);
    // electronAPI funciona en Electron (window.pos) y en la web (localStorage).
    await electronAPI.setConfig({ sucursalId: id });
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ width: 420 }}>
        <h2>{empresa?.nombre}</h2>
        <p>Selecciona la sucursal desde la que vas a trabajar</p>
        {cargando && <p>Cargando sucursales...</p>}
        {!cargando && lista.length === 0 && (
          <p>No hay sucursales disponibles. Cierra sesión y vuelve a entrar; si sigue igual, contacta a soporte.</p>
        )}
        <div className="grid-form">
          {lista.map((s) => (
            <button key={s.id} onClick={() => seleccionar(s.id)} type="button">
              {s.nombre} {s.tipo === "ECOMMERCE" ? "(Ecommerce)" : ""}
            </button>
          ))}
        </div>
        <button className="secondary" style={{ marginTop: 16 }} onClick={logout} type="button">
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
