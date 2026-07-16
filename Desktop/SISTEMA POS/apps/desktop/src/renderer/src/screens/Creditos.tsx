import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";

interface Credito {
  ventaId: string;
  consecutivo: number;
  clienteId: string;
  clienteNombre: string;
  sucursalId: string;
  total: number;
  pendiente: number;
  fecha: string;
  fechaVencimiento: string;
  diasRetraso: number;
  estado: "VIGENTE" | "PROXIMO_A_VENCER" | "VENCIDO" | "PAGADO";
}

const TABS: { estado?: Credito["estado"]; label: string }[] = [
  { estado: undefined, label: "Todos (activos)" },
  { estado: "VIGENTE", label: "Vigentes" },
  { estado: "PROXIMO_A_VENCER", label: "Proximos a vencer" },
  { estado: "VENCIDO", label: "Vencidos" },
];

const badgeEstado: Record<Credito["estado"], string> = {
  VIGENTE: "success",
  PROXIMO_A_VENCER: "warning",
  VENCIDO: "danger",
  PAGADO: "neutral",
};

const etiquetaEstado: Record<Credito["estado"], string> = {
  VIGENTE: "Vigente",
  PROXIMO_A_VENCER: "Proximo a vencer",
  VENCIDO: "Vencido",
  PAGADO: "Pagado",
};

const COLUMNAS_CREDITOS: ColumnaExport<Credito>[] = [
  { encabezado: "Cliente", clave: "clienteNombre" },
  { encabezado: "Factura", clave: "consecutivo", formato: (v) => `#${v}` },
  { encabezado: "Fecha venta", clave: "fecha", formato: (v) => new Date(v).toLocaleDateString("es-CO") },
  { encabezado: "Vence", clave: "fechaVencimiento", formato: (v) => new Date(v).toLocaleDateString("es-CO") },
  { encabezado: "Dias de retraso", clave: "diasRetraso", formato: (v) => String(v) },
  { encabezado: "Pendiente", clave: "pendiente", formato: (v) => String(v) },
  { encabezado: "Estado", clave: "estado", formato: (v) => etiquetaEstado[v as Credito["estado"]] },
];

export default function Creditos() {
  const { sucursales } = useSesionStore();
  const [tab, setTab] = useState<Credito["estado"] | undefined>(undefined);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diasVencimiento, setDiasVencimiento] = useState("20");
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await api.get<Credito[]>("/creditos", { params: { estado: tab } });
    setCreditos(data);
    setCargando(false);
  }, [tab]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api.get<{ diasVencimientoCredito: number }>("/creditos/config").then(({ data }) => {
      setDiasVencimiento(String(data.diasVencimientoCredito));
    });
  }, []);

  async function guardarConfig(e: React.FormEvent) {
    e.preventDefault();
    setGuardandoConfig(true);
    setMensajeConfig(null);
    try {
      await api.patch("/creditos/config", { diasVencimientoCredito: Number(diasVencimiento) });
      setMensajeConfig("Guardado. Aplica a los creditos que se generen de ahora en adelante.");
    } catch (err: any) {
      setMensajeConfig(mensajeError(err, "No se pudo guardar"));
    } finally {
      setGuardandoConfig(false);
    }
  }

  const totalPendiente = creditos.reduce((acc, c) => acc + c.pendiente, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Creditos</h2>
          <p>Ventas a credito, vencimientos y cartera pendiente</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 420 }}>
        <h4 style={{ marginTop: 0 }}>Dias para vencimiento</h4>
        <form className="grid-form" onSubmit={guardarConfig}>
          <label>
            Dias tras la venta a credito para considerarla vencida
            <input
              type="number"
              min={1}
              value={diasVencimiento}
              onChange={(e) => setDiasVencimiento(e.target.value)}
              style={{ width: 120 }}
            />
          </label>
          {mensajeConfig && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{mensajeConfig}</span>}
          <button type="submit" disabled={guardandoConfig} style={{ width: "fit-content" }}>
            {guardandoConfig ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <BotonesExportar nombreArchivo="creditos" titulo="Creditos" columnas={COLUMNAS_CREDITOS} filas={creditos} />
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Creditos en el listado</div>
          <div className="value">{creditos.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Valor pendiente</div>
          <div className={`value ${totalPendiente > 0 ? "negative" : ""}`}>
            ${totalPendiente.toLocaleString("es-CO")}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t.label}
              type="button"
              className={tab === t.estado ? "" : "secondary"}
              onClick={() => setTab(t.estado)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p className="empty-state">Cargando...</p>
        ) : creditos.length === 0 ? (
          <p className="empty-state">No hay creditos en este filtro</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Factura</th>
                <th>Sucursal</th>
                <th>Fecha venta</th>
                <th>Vence</th>
                <th>Dias de retraso</th>
                <th>Pendiente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {creditos.map((c) => (
                <tr key={c.ventaId}>
                  <td>{c.clienteNombre}</td>
                  <td>#{c.consecutivo}</td>
                  <td>{sucursales.find((s) => s.id === c.sucursalId)?.nombre ?? "-"}</td>
                  <td>{new Date(c.fecha).toLocaleDateString("es-CO")}</td>
                  <td>{new Date(c.fechaVencimiento).toLocaleDateString("es-CO")}</td>
                  <td>{c.diasRetraso > 0 ? `${c.diasRetraso} dias` : "-"}</td>
                  <td>${c.pendiente.toLocaleString("es-CO")}</td>
                  <td>
                    <span className={`badge ${badgeEstado[c.estado]}`}>{etiquetaEstado[c.estado]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
        Para registrar abonos de un cliente, ve a la seccion "Clientes".
      </p>
    </div>
  );
}
