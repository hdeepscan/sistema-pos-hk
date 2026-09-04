import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useSesionStore, usePermiso } from "../lib/store";
import { mensajeError } from "../lib/errores";

interface CuentaContable {
  id: string;
  codigo: string;
  nombre: string;
  tipo: "ACTIVO" | "PASIVO" | "PATRIMONIO" | "INGRESO" | "GASTO";
  descripcion?: string;
  activa: boolean;
  creadoEn: string;
}

interface LineaAsiento {
  cuentaId: string;
  descripcion?: string;
  debe: number;
  haber: number;
}

interface AsientoContable {
  id: string;
  fecha: string;
  descripcion: string;
  referencia?: string;
  estado: "BORRADOR" | "CONTABILIZADO" | "ANULADO";
  totalDebe: number;
  totalHaber: number;
  lineas: LineaAsiento[];
  creadoEn: string;
}

type Pestaña = "plan-cuentas" | "asientos" | "reportes";

export default function Contabilidad() {
  const puedeVerContabilidad = usePermiso("contabilidad.ver");
  const [pestaña, setPestaña] = useState<Pestaña>("plan-cuentas");
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Formulario: Nueva Cuenta
  const [nuevaCuenta, setNuevaCuenta] = useState({ codigo: "", nombre: "", tipo: "ACTIVO", descripcion: "" });

  // Formulario: Nuevo Asiento
  const [nuevoAsiento, setNuevoAsiento] = useState({
    fecha: new Date().toISOString().split("T")[0],
    descripcion: "",
    referencia: "",
    lineas: [{ cuentaId: "", descripcion: "", debe: 0, haber: 0 }],
  });

  // Requiere permiso de contabilidad
  if (!puedeVerContabilidad) {
    return <div style={{ padding: 20 }}>No tienes permiso para acceder a Contabilidad</div>;
  }

  useEffect(() => {
    cargarCuentas();
    cargarAsientos();
  }, []);

  async function cargarCuentas() {
    try {
      setCargando(true);
      const { data } = await api.get<CuentaContable[]>("/contabilidad/cuentas");
      setCuentas(data);
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }

  async function cargarAsientos() {
    try {
      const { data } = await api.get<AsientoContable[]>("/contabilidad/asientos");
      setAsientos(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function crearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);

    try {
      await api.post("/contabilidad/cuentas", nuevaCuenta);
      setMensaje("✅ Cuenta creada exitosamente");
      setNuevaCuenta({ codigo: "", nombre: "", tipo: "ACTIVO", descripcion: "" });
      cargarCuentas();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo crear la cuenta"));
    }
  }

  async function crearAsiento(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);

    // Validar que debe = haber
    const totalDebe = nuevoAsiento.lineas.reduce((sum, l) => sum + l.debe, 0);
    const totalHaber = nuevoAsiento.lineas.reduce((sum, l) => sum + l.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      setError("❌ El total de Debe y Haber no coinciden");
      return;
    }

    try {
      await api.post("/contabilidad/asientos", nuevoAsiento);
      setMensaje("✅ Asiento creado exitosamente");
      setNuevoAsiento({
        fecha: new Date().toISOString().split("T")[0],
        descripcion: "",
        referencia: "",
        lineas: [{ cuentaId: "", descripcion: "", debe: 0, haber: 0 }],
      });
      cargarAsientos();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo crear el asiento"));
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div className="page-header">
        <div>
          <h2>📊 Contabilidad</h2>
          <p>Gestiona tu plan de cuentas, asientos y reportes</p>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
        <button
          className={pestaña === "plan-cuentas" ? "" : "secondary"}
          onClick={() => setPestaña("plan-cuentas")}
          style={{ padding: "12px 16px", background: pestaña === "plan-cuentas" ? "var(--bg-hover)" : "transparent" }}
        >
          📋 Plan de Cuentas
        </button>
        <button
          className={pestaña === "asientos" ? "" : "secondary"}
          onClick={() => setPestaña("asientos")}
          style={{ padding: "12px 16px", background: pestaña === "asientos" ? "var(--bg-hover)" : "transparent" }}
        >
          ✏️ Asientos
        </button>
        <button
          className={pestaña === "reportes" ? "" : "secondary"}
          onClick={() => setPestaña("reportes")}
          style={{ padding: "12px 16px", background: pestaña === "reportes" ? "var(--bg-hover)" : "transparent" }}
        >
          📈 Reportes
        </button>
      </div>

      {mensaje && <div style={{ marginBottom: 12, padding: 12, background: "#ecfdf5", borderRadius: 8, color: "#10b981" }}>{mensaje}</div>}
      {error && <div style={{ marginBottom: 12, padding: 12, background: "#fef3c7", borderRadius: 8, color: "#d97706" }}>{error}</div>}

      {/* PLAN DE CUENTAS */}
      {pestaña === "plan-cuentas" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
          {/* Formulario */}
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Nueva Cuenta</h4>
            <form className="grid-form" onSubmit={crearCuenta}>
              <label>
                Código
                <input
                  value={nuevaCuenta.codigo}
                  onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, codigo: e.target.value })}
                  placeholder="1-1-1-001"
                  required
                />
              </label>
              <label>
                Nombre
                <input
                  value={nuevaCuenta.nombre}
                  onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, nombre: e.target.value })}
                  placeholder="Caja"
                  required
                />
              </label>
              <label>
                Tipo
                <select
                  value={nuevaCuenta.tipo}
                  onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, tipo: e.target.value as any })}
                  required
                >
                  <option>ACTIVO</option>
                  <option>PASIVO</option>
                  <option>PATRIMONIO</option>
                  <option>INGRESO</option>
                  <option>GASTO</option>
                </select>
              </label>
              <label>
                Descripción
                <textarea
                  value={nuevaCuenta.descripcion}
                  onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, descripcion: e.target.value })}
                  placeholder="Opcional"
                  rows={3}
                />
              </label>
              <button type="submit">Crear Cuenta</button>
            </form>
          </div>

          {/* Lista de Cuentas */}
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Plan de Cuentas ({cuentas.length})</h4>
            {cargando ? (
              <p>Cargando...</p>
            ) : cuentas.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>Sin cuentas creadas</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: 8 }}>Código</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Nombre</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Tipo</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((cuenta) => (
                      <tr key={cuenta.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 8, fontWeight: 600 }}>{cuenta.codigo}</td>
                        <td style={{ padding: 8 }}>{cuenta.nombre}</td>
                        <td style={{ padding: 8 }}>{cuenta.tipo}</td>
                        <td style={{ padding: 8 }}>
                          <span className={`badge ${cuenta.activa ? "success" : "danger"}`}>
                            {cuenta.activa ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ASIENTOS */}
      {pestaña === "asientos" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
          {/* Formulario */}
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Nuevo Asiento</h4>
            <form className="grid-form" onSubmit={crearAsiento} style={{ fontSize: 12 }}>
              <label>
                Fecha
                <input
                  type="date"
                  value={nuevoAsiento.fecha}
                  onChange={(e) => setNuevoAsiento({ ...nuevoAsiento, fecha: e.target.value })}
                  required
                />
              </label>
              <label>
                Descripción
                <input
                  value={nuevoAsiento.descripcion}
                  onChange={(e) => setNuevoAsiento({ ...nuevoAsiento, descripcion: e.target.value })}
                  placeholder="Descripción del asiento"
                  required
                />
              </label>
              <label>
                Referencia
                <input
                  value={nuevoAsiento.referencia}
                  onChange={(e) => setNuevoAsiento({ ...nuevoAsiento, referencia: e.target.value })}
                  placeholder="Opcional (factura, etc)"
                />
              </label>
              <button type="submit">Crear Asiento</button>
            </form>
          </div>

          {/* Lista de Asientos */}
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Asientos Recientes ({asientos.length})</h4>
            {cargando ? (
              <p>Cargando...</p>
            ) : asientos.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>Sin asientos creados</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: 8 }}>Fecha</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Descripción</th>
                      <th style={{ textAlign: "right", padding: 8 }}>Debe</th>
                      <th style={{ textAlign: "right", padding: 8 }}>Haber</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asientos.slice(0, 10).map((asiento) => (
                      <tr key={asiento.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 8 }}>{new Date(asiento.fecha).toLocaleDateString("es-CO")}</td>
                        <td style={{ padding: 8 }}>{asiento.descripcion}</td>
                        <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>${asiento.totalDebe.toLocaleString()}</td>
                        <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>${asiento.totalHaber.toLocaleString()}</td>
                        <td style={{ padding: 8 }}>
                          <span
                            className={`badge ${
                              asiento.estado === "CONTABILIZADO"
                                ? "success"
                                : asiento.estado === "BORRADOR"
                                  ? "warning"
                                  : "danger"
                            }`}
                          >
                            {asiento.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORTES */}
      {pestaña === "reportes" && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>📈 Reportes Contables</h4>
          <p style={{ color: "var(--text-muted)" }}>Próximamente: Balance General, Estado de Resultados</p>
        </div>
      )}
    </div>
  );
}
