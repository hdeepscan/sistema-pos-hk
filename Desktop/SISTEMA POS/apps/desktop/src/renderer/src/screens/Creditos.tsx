import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore, usePermiso } from "../lib/store";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";
import CreditosManuales from "./CreditosManuales";
import { DetalleCreditoModal } from "../components/DetalleCreditoModal";

interface Credito {
  ventaId: string;
  consecutivo: number;
  clienteId: string;
  clienteNombre: string;
  sucursalId: string;
  total: number;
  abonado: number;
  pendiente: number;
  fecha: string;
  fechaVencimiento: string;
  diasRetraso: number;
  estado: "VIGENTE" | "PROXIMO_A_VENCER" | "VENCIDO" | "PAGADO" | "ABANDONADO";
  abandonadoEn: string | null;
  notaAbandono: string | null;
}

const TABS: { estado?: Credito["estado"]; label: string }[] = [
  { estado: undefined, label: "Todos (activos)" },
  { estado: "VIGENTE", label: "Vigentes" },
  { estado: "PROXIMO_A_VENCER", label: "Proximos a vencer" },
  { estado: "VENCIDO", label: "Vencidos" },
  { estado: "ABANDONADO", label: "Abandonados" },
];

const badgeEstado: Record<Credito["estado"], string> = {
  VIGENTE: "success",
  PROXIMO_A_VENCER: "warning",
  VENCIDO: "danger",
  PAGADO: "neutral",
  ABANDONADO: "neutral",
};

const etiquetaEstado: Record<Credito["estado"], string> = {
  VIGENTE: "Vigente",
  PROXIMO_A_VENCER: "Proximo a vencer",
  VENCIDO: "Vencido",
  PAGADO: "Pagado",
  ABANDONADO: "Abandonado",
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
  const [modo, setModo] = useState<"ventas" | "manuales">("ventas");
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={modo === "ventas" ? "" : "secondary"} onClick={() => setModo("ventas")}>
            Creditos de ventas
          </button>
          <button type="button" className={modo === "manuales" ? "" : "secondary"} onClick={() => setModo("manuales")}>
            Creditos manuales
          </button>
        </div>
      </div>
      {modo === "ventas" ? <CreditosVentas /> : <CreditosManuales />}
    </div>
  );
}

function CreditosVentas() {
  const { sucursales } = useSesionStore();
  const [tab, setTab] = useState<Credito["estado"] | undefined>(undefined);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diasVencimiento, setDiasVencimiento] = useState("20");
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState<string | null>(null);
  const [creditoDetalle, setCreditoDetalle] = useState<Credito | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const puedeAdministrar = usePermiso("creditos.administrar");

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

  // Busca por cliente o número de factura (sin tildes ni mayúsculas).
  const creditosFiltrados = useMemo(() => {
    const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = normalizar(busqueda.trim()).replace(/^#/, "");
    if (!q) return creditos;
    return creditos.filter((c) => normalizar(c.clienteNombre).includes(q) || String(c.consecutivo).includes(q));
  }, [creditos, busqueda]);

  async function noVolvioAAbonar(c: Credito) {
    const nota = window.prompt(
      `Marcar el crédito #${c.consecutivo} de ${c.clienteNombre} como abandonado (no volvió a abonar).\n` +
        `Saldo pendiente: $${c.pendiente.toLocaleString("es-CO")}. La deuda se conserva y puedes reactivarlo después.\n\n` +
        `Nota opcional (por ejemplo, el motivo):`,
      ""
    );
    if (nota === null) return;
    setProcesando(c.ventaId);
    setErrorAccion(null);
    try {
      await api.post(`/creditos/${c.ventaId}/abandonar`, { nota });
      await cargar();
    } catch (err) {
      setErrorAccion(mensajeError(err, "No se pudo marcar el crédito"));
    } finally {
      setProcesando(null);
    }
  }

  async function reactivar(c: Credito) {
    if (!window.confirm(`¿Reactivar el crédito #${c.consecutivo} de ${c.clienteNombre}? Volverá a la lista de activos.`)) return;
    setProcesando(c.ventaId);
    setErrorAccion(null);
    try {
      await api.post(`/creditos/${c.ventaId}/reactivar`);
      await cargar();
    } catch (err) {
      setErrorAccion(mensajeError(err, "No se pudo reactivar el crédito"));
    } finally {
      setProcesando(null);
    }
  }

  const totalPendiente = creditosFiltrados.reduce((acc, c) => acc + c.pendiente, 0);

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
        <input
          type="search"
          placeholder="Buscar por cliente o # de factura..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 220, maxWidth: 360 }}
        />
        <BotonesExportar nombreArchivo="creditos" titulo="Creditos" columnas={COLUMNAS_CREDITOS} filas={creditosFiltrados} />
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Creditos en el listado</div>
          <div className="value">{creditosFiltrados.length}</div>
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

      {errorAccion && <p className="error-text">{errorAccion}</p>}

      <div className="card">
        {cargando ? (
          <p className="empty-state">Cargando...</p>
        ) : creditosFiltrados.length === 0 ? (
          <p className="empty-state">{busqueda.trim() ? "Ningún crédito coincide con la búsqueda" : "No hay creditos en este filtro"}</p>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {creditosFiltrados.map((c) => (
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
                    {c.estado === "ABANDONADO" && c.abandonadoEn && (
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                        Desde {new Date(c.abandonadoEn).toLocaleDateString("es-CO")}
                        {c.notaAbandono ? ` · ${c.notaAbandono}` : ""}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setCreditoDetalle(c)}>
                        Ver info
                      </button>
                      {puedeAdministrar && c.estado === "ABANDONADO" && (
                        <button
                          type="button"
                          className="secondary"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          disabled={procesando === c.ventaId}
                          onClick={() => void reactivar(c)}
                        >
                          Reactivar
                        </button>
                      )}
                      {puedeAdministrar && c.estado !== "ABANDONADO" && c.estado !== "PAGADO" && c.abonado > 0 && (
                        <button
                          type="button"
                          className="secondary"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          disabled={procesando === c.ventaId}
                          onClick={() => void noVolvioAAbonar(c)}
                          title="El cliente abonó pero no volvió a pagar: sale de los activos y conserva la deuda"
                        >
                          No volvió a abonar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creditoDetalle && (
        <DetalleCreditoModal
          mostrar={!!creditoDetalle}
          creditoId={creditoDetalle.ventaId}
          clienteNombre={creditoDetalle.clienteNombre}
          total={creditoDetalle.total}
          pendiente={creditoDetalle.pendiente}
          estado={creditoDetalle.estado}
          onAbonar={cargar}
          onCerrar={() => setCreditoDetalle(null)}
        />
      )}
    </div>
  );
}
