import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";

type Frecuencia = "DIARIA" | "SEMANAL" | "QUINCENAL" | "MENSUAL";
type EstadoCredito = "AL_DIA" | "PROXIMO" | "VENCIDO" | "PAGADO";
type EstadoCuota = "PENDIENTE" | "PAGADA" | "VENCIDA" | "PARCIAL";

interface Cliente {
  id: string;
  nombre: string;
}

interface CuotaResumen {
  numero: number;
  fechaVencimiento: string;
  valor: number;
  pagado: number;
  pendiente: number;
  diasRetraso: number;
  estado: EstadoCuota;
}

interface CreditoLista {
  id: string;
  numero: number;
  clienteNombre: string;
  valorTotal: number;
  pagado: number;
  pendiente: number;
  numeroCuotas: number;
  frecuencia: Frecuencia;
  fechaInicio: string;
  observaciones: string | null;
  estado: EstadoCredito;
  proximaCuota: CuotaResumen | null;
  cuotasVencidas: number;
}

interface Pago {
  id: string;
  monto: number;
  fecha: string;
}

interface CuotaDetalle extends CuotaResumen {
  id: string;
  pagos: Pago[];
}

interface CreditoDetalle {
  id: string;
  numero: number;
  cliente: { id: string; nombre: string };
  valorTotal: number;
  pagado: number;
  pendiente: number;
  numeroCuotas: number;
  frecuencia: Frecuencia;
  fechaInicio: string;
  observaciones: string | null;
  estado: EstadoCredito;
  cuotas: CuotaDetalle[];
}

const FRECUENCIAS: { valor: Frecuencia; label: string }[] = [
  { valor: "DIARIA", label: "Diaria" },
  { valor: "SEMANAL", label: "Semanal" },
  { valor: "QUINCENAL", label: "Quincenal" },
  { valor: "MENSUAL", label: "Mensual" },
];

const badgeCredito: Record<EstadoCredito, string> = {
  AL_DIA: "success",
  PROXIMO: "warning",
  VENCIDO: "danger",
  PAGADO: "neutral",
};
const etiquetaCredito: Record<EstadoCredito, string> = {
  AL_DIA: "Al dia",
  PROXIMO: "Proximo a vencer",
  VENCIDO: "Vencido",
  PAGADO: "Pagado",
};
const badgeCuota: Record<EstadoCuota, string> = {
  PENDIENTE: "neutral",
  PAGADA: "success",
  VENCIDA: "danger",
  PARCIAL: "warning",
};
const etiquetaCuota: Record<EstadoCuota, string> = {
  PENDIENTE: "Pendiente",
  PAGADA: "Pagada",
  VENCIDA: "Vencida",
  PARCIAL: "Parcialmente pagada",
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const hoyISO = () => new Date().toISOString().slice(0, 10);

const COLUMNAS_CREDITOS: ColumnaExport<CreditoLista>[] = [
  { encabezado: "Numero", clave: "numero", formato: (v) => `#${v}` },
  { encabezado: "Cliente", clave: "clienteNombre" },
  { encabezado: "Valor total", clave: "valorTotal", formato: (v) => String(v) },
  { encabezado: "Abonado", clave: "pagado", formato: (v) => String(v) },
  { encabezado: "Pendiente", clave: "pendiente", formato: (v) => String(v) },
  { encabezado: "Cuotas", clave: "numeroCuotas", formato: (v) => String(v) },
  { encabezado: "Frecuencia", clave: "frecuencia" },
  { encabezado: "Inicio", clave: "fechaInicio", formato: (v) => new Date(v as string).toLocaleDateString("es-CO") },
  { encabezado: "Cuotas vencidas", clave: "cuotasVencidas", formato: (v) => String(v) },
  { encabezado: "Estado", clave: "estado", formato: (v) => etiquetaCredito[v as EstadoCredito] },
];

export default function CreditosManuales() {
  const [creditos, setCreditos] = useState<CreditoLista[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<EstadoCredito | "">("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [diasAviso, setDiasAviso] = useState("3");
  const [mensajeConfig, setMensajeConfig] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get<CreditoLista[]>("/creditos-manuales", {
        params: { q: busqueda || undefined, estado: estado || undefined },
      });
      setCreditos(data);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version."
          : mensajeError(err, "No se pudieron cargar los creditos")
      );
    } finally {
      setCargando(false);
    }
  }, [busqueda, estado]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => {
    api
      .get<{ diasAvisoCuota: number }>("/creditos-manuales/config")
      .then(({ data }) => setDiasAviso(String(data.diasAvisoCuota)))
      .catch(() => undefined);
  }, []);

  async function guardarConfig(e: React.FormEvent) {
    e.preventDefault();
    setMensajeConfig(null);
    try {
      await api.patch("/creditos-manuales/config", { diasAvisoCuota: Number(diasAviso) });
      setMensajeConfig("Guardado");
    } catch (err: any) {
      setMensajeConfig(mensajeError(err, "No se pudo guardar"));
    }
  }

  const totalPendiente = creditos.reduce((acc, c) => acc + c.pendiente, 0);
  const vencidos = creditos.filter((c) => c.estado === "VENCIDO").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Creditos manuales</h2>
          <p>Creditos sin venta asociada: cronograma de cuotas, abonos y alertas de cobro</p>
        </div>
        <button type="button" onClick={() => setMostrarNuevo(true)}>
          + Nuevo credito
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 460 }}>
        <h4 style={{ marginTop: 0 }}>Aviso de cobro</h4>
        <form className="grid-form" onSubmit={guardarConfig}>
          <label>
            Dias de anticipacion para avisar antes del vencimiento de una cuota
            <input type="number" min={0} max={60} value={diasAviso} onChange={(e) => setDiasAviso(e.target.value)} style={{ width: 120 }} />
          </label>
          {mensajeConfig && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{mensajeConfig}</span>}
          <button type="submit" style={{ width: "fit-content" }}>
            Guardar
          </button>
        </form>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Creditos en el listado</div>
          <div className="value">{creditos.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Valor pendiente</div>
          <div className={`value ${totalPendiente > 0 ? "negative" : ""}`}>{pesos(totalPendiente)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Con cuotas vencidas</div>
          <div className={`value ${vencidos > 0 ? "negative" : ""}`}>{vencidos}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por cliente o numero de credito"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoCredito | "")}>
            <option value="">Todos los estados</option>
            <option value="AL_DIA">Al dia</option>
            <option value="PROXIMO">Proximos a vencer</option>
            <option value="VENCIDO">Vencidos</option>
            <option value="PAGADO">Pagados</option>
          </select>
          <div style={{ marginLeft: "auto" }}>
            <BotonesExportar
              nombreArchivo="creditos-manuales"
              titulo="Creditos manuales"
              columnas={COLUMNAS_CREDITOS}
              filas={creditos}
            />
          </div>
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p className="empty-state">Cargando...</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : creditos.length === 0 ? (
          <p className="empty-state">No hay creditos manuales. Crea el primero con "+ Nuevo credito".</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Valor total</th>
                <th>Pendiente</th>
                <th>Cuotas</th>
                <th>Proximo vencimiento</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {creditos.map((c) => (
                <tr key={c.id}>
                  <td>#{c.numero}</td>
                  <td>{c.clienteNombre}</td>
                  <td>{pesos(c.valorTotal)}</td>
                  <td className={c.pendiente > 0 ? "" : undefined}>{pesos(c.pendiente)}</td>
                  <td>{c.numeroCuotas}</td>
                  <td>
                    {c.proximaCuota
                      ? new Date(c.proximaCuota.fechaVencimiento).toLocaleDateString("es-CO")
                      : "Pagado"}
                    {c.cuotasVencidas > 0 && (
                      <span className="badge danger" style={{ marginLeft: 6 }}>
                        {c.cuotasVencidas} vencida{c.cuotasVencidas > 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${badgeCredito[c.estado]}`}>{etiquetaCredito[c.estado]}</span>
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => setDetalleId(c.id)}>
                      Ver / abonar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarNuevo && (
        <NuevoCredito
          onClose={() => setMostrarNuevo(false)}
          onCreado={() => {
            setMostrarNuevo(false);
            cargar();
          }}
        />
      )}

      {detalleId && (
        <DetalleCredito
          creditoId={detalleId}
          onClose={() => setDetalleId(null)}
          onCambio={cargar}
        />
      )}
    </div>
  );
}

function NuevoCredito({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaPrimerPago, setFechaPrimerPago] = useState(hoyISO());
  const [numeroCuotas, setNumeroCuotas] = useState("1");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("MENSUAL");
  const [valorCuota, setValorCuota] = useState("");
  const [cuotaManual, setCuotaManual] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get<Cliente[]>("/clientes").then(({ data }) => setClientes(data)).catch(() => setClientes([]));
  }, []);

  // Valor de cuota sugerido = total / numero de cuotas (editable).
  const total = Number(valorTotal || 0);
  const cuotas = Math.max(1, Number(numeroCuotas || 1));
  const sugerido = total > 0 ? Math.round((total / cuotas) * 100) / 100 : 0;
  const valorCuotaMostrado = cuotaManual ? valorCuota : sugerido ? String(sugerido) : "";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clienteId) return setError("Selecciona un cliente");
    if (total <= 0) return setError("El valor total debe ser mayor a 0");
    setGuardando(true);
    try {
      await api.post("/creditos-manuales", {
        clienteId,
        valorTotal: total,
        fechaInicio: new Date(fechaInicio).toISOString(),
        fechaPrimerPago: new Date(fechaPrimerPago).toISOString(),
        numeroCuotas: cuotas,
        frecuencia,
        valorCuota: cuotaManual && valorCuota ? Number(valorCuota) : undefined,
        observaciones: observaciones || undefined,
      });
      onCreado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo crear el credito"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 520, maxWidth: "94vw" }}>
        <h4 style={{ marginTop: 0 }}>Nuevo credito manual</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
              <option value="">Selecciona un cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              Valor total
              <input type="number" step="0.01" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} required />
            </label>
            <label>
              Numero de cuotas
              <input type="number" min={1} value={numeroCuotas} onChange={(e) => setNumeroCuotas(e.target.value)} required />
            </label>
            <label>
              Fecha de inicio
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
            </label>
            <label>
              Fecha del primer pago
              <input type="date" value={fechaPrimerPago} onChange={(e) => setFechaPrimerPago(e.target.value)} required />
            </label>
            <label>
              Frecuencia
              <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
                {FRECUENCIAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor de cada cuota
              <input
                type="number"
                step="0.01"
                value={valorCuotaMostrado}
                onChange={(e) => {
                  setCuotaManual(true);
                  setValorCuota(e.target.value);
                }}
              />
              <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-muted)" }}>
                {cuotaManual ? "Editado manualmente" : "Calculado automaticamente"}
              </span>
            </label>
          </div>
          <label>
            Observaciones
            <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </label>
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={guardando}>
              {guardando ? "Creando..." : "Crear credito"}
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetalleCredito({
  creditoId,
  onClose,
  onCambio,
}: {
  creditoId: string;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [credito, setCredito] = useState<CreditoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [monto, setMonto] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get<CreditoDetalle>(`/creditos-manuales/${creditoId}`);
      setCredito(data);
    } finally {
      setCargando(false);
    }
  }, [creditoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function abonar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!monto || Number(monto) <= 0) return setError("Ingresa un monto valido");
    setRegistrando(true);
    try {
      await api.post(`/creditos-manuales/${creditoId}/pagos`, { monto: Number(monto) });
      setMonto("");
      await cargar();
      onCambio();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo registrar el abono"));
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 640, maxWidth: "94vw" }}>
        {cargando || !credito ? (
          <p className="empty-state">Cargando...</p>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <h4 style={{ margin: 0 }}>
                  Credito #{credito.numero} — {credito.cliente.nombre}
                </h4>
                <p style={{ margin: "2px 0", fontSize: 12.5, color: "var(--text-muted)" }}>
                  {credito.numeroCuotas} cuotas · {FRECUENCIAS.find((f) => f.valor === credito.frecuencia)?.label}
                </p>
              </div>
              <span className={`badge ${badgeCredito[credito.estado]}`}>{etiquetaCredito[credito.estado]}</span>
            </div>

            <div className="stat-grid" style={{ marginTop: 12 }}>
              <div className="stat-card">
                <div className="label">Valor total</div>
                <div className="value">{pesos(credito.valorTotal)}</div>
              </div>
              <div className="stat-card">
                <div className="label">Abonado</div>
                <div className="value positive">{pesos(credito.pagado)}</div>
              </div>
              <div className="stat-card">
                <div className="label">Saldo pendiente</div>
                <div className={`value ${credito.pendiente > 0 ? "negative" : ""}`}>{pesos(credito.pendiente)}</div>
              </div>
            </div>

            {credito.observaciones && (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>
                <strong>Observaciones:</strong> {credito.observaciones}
              </p>
            )}

            <h5 style={{ marginBottom: 6, marginTop: 14 }}>Cronograma de cuotas</h5>
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              <table style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Cuota</th>
                    <th>Vence</th>
                    <th>Valor</th>
                    <th>Pagado</th>
                    <th>Pendiente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {credito.cuotas.map((cuota) => (
                    <tr key={cuota.id}>
                      <td>{cuota.numero}</td>
                      <td>
                        {new Date(cuota.fechaVencimiento).toLocaleDateString("es-CO")}
                        {cuota.diasRetraso > 0 && (
                          <span style={{ color: "var(--danger, #dc2626)", marginLeft: 4 }}>({cuota.diasRetraso}d)</span>
                        )}
                      </td>
                      <td>{pesos(cuota.valor)}</td>
                      <td>{pesos(cuota.pagado)}</td>
                      <td>{pesos(cuota.pendiente)}</td>
                      <td>
                        <span className={`badge ${badgeCuota[cuota.estado]}`}>{etiquetaCuota[cuota.estado]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {credito.pendiente > 0 && (
              <form onSubmit={abonar} style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 14, flexWrap: "wrap" }}>
                <label style={{ flex: 1, minWidth: 160 }}>
                  Registrar abono (se aplica a las cuotas mas antiguas)
                  <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto a abonar" />
                </label>
                <button type="submit" disabled={registrando}>
                  {registrando ? "Registrando..." : "Registrar abono"}
                </button>
              </form>
            )}
            {error && <span className="error-text">{error}</span>}

            <div style={{ marginTop: 14, textAlign: "right" }}>
              <button type="button" className="secondary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
