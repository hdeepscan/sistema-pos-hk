import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";

export default function Configuracion() {
  const { sucursales, setSesion, token, usuario, empresa, apiBaseUrl } = useSesionStore();
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const [impresoraSeleccionada, setImpresoraSeleccionada] = useState<string>("");
  const [nombreSucursal, setNombreSucursal] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    window.pos.listPrinters().then(setImpresoras);
    window.pos.getConfig().then((c) => setImpresoraSeleccionada(c.printerName ?? ""));
  }, []);

  async function guardarImpresora(nombre: string) {
    setImpresoraSeleccionada(nombre);
    await window.pos.setConfig({ printerName: nombre || null });
  }

  async function crearSucursal(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post("/sucursales", { nombre: nombreSucursal, tipo: "FISICA" });
      const { data } = await api.get("/sucursales");
      setSesion({ token: token!, usuario, empresa, sucursales: data });
      setNombreSucursal("");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      <div className="card">
        <h3>Impresora de recibos</h3>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          Servidor: {apiBaseUrl}
        </p>
        <select value={impresoraSeleccionada} onChange={(e) => guardarImpresora(e.target.value)} style={{ width: "100%" }}>
          <option value="">Impresora predeterminada del sistema</option>
          {impresoras.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h3>Sucursales</h3>
        <ul>
          {sucursales.map((s) => (
            <li key={s.id}>
              {s.nombre} {s.tipo === "ECOMMERCE" ? "(Ecommerce)" : ""}
            </li>
          ))}
        </ul>
        <form className="grid-form" onSubmit={crearSucursal}>
          <input
            placeholder="Nombre de la nueva sucursal"
            value={nombreSucursal}
            onChange={(e) => setNombreSucursal(e.target.value)}
            required
          />
          <button type="submit" disabled={guardando}>
            {guardando ? "Creando..." : "Agregar sucursal"}
          </button>
        </form>
      </div>
    </div>
  );
}
