import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { mensajeError } from "../lib/errores";
import { electronAPI } from "../lib/electron-api";

interface TurnoAbierto {
  id: string;
  sucursalId: string;
  montoInicial: string | number;
  fechaApertura: string;
  usuarioApertura: { nombre: string };
}

interface TurnoCerrado {
  id: string;
  sucursalId: string;
  montoInicial: string | number;
  ventasEfectivo: string | number;
  totalEsperado: string | number;
  montoContado: string | number;
  diferencia: string | number;
  fechaApertura: string;
  fechaCierre: string;
  usuarioApertura: { nombre: string };
  usuarioCierre: { nombre: string } | null;
  sucursal: { nombre: string };
}

interface CuentaBancaria {
  id: string;
  nombre: string;
  saldoInicial: string | number;
}

const ETIQUETA_METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjetas",
  TRANSFERENCIA: "Transferencias / QR",
  CREDITO: "Creditos",
  OTRO: "Otros",
};

export default function Caja() {
  const { sucursales, sucursalActivaId, empresa } = useSesionStore();
  const [sucursalId, setSucursalId] = useState(sucursalActivaId ?? sucursales[0]?.id ?? "");
  const [turno, setTurno] = useState<TurnoAbierto | null>(null);
  const [historial, setHistorial] = useState<TurnoCerrado[]>([]);
  const [montoInicial, setMontoInicial] = useState("");
  const [montoContado, setMontoContado] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [saldosApertura, setSaldosApertura] = useState<Record<string, string>>({});
  const [saldosCierre, setSaldosCierre] = useState<Record<string, string>>({});
  const [ultimoCierre, setUltimoCierre] = useState<any | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  async function eliminarCierre(id: string) {
    if (!window.confirm("¿Estás seguro que quieres eliminar este cierre de caja? Esta acción no se puede deshacer.")) {
      return;
    }

    setEliminando(id);
    try {
      await api.delete(`/caja/${id}`);
      setHistorial((prev) => prev.filter((h) => h.id !== id));
      setError(null);
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo eliminar el cierre"));
    } finally {
      setEliminando(null);
    }
  }

  const cargar = useCallback(async () => {
    const [{ data: actual }, { data: hist }] = await Promise.all([
      api.get<TurnoAbierto | null>("/caja/actual", { params: { sucursalId } }),
      api.get<TurnoCerrado[]>("/caja/historial", { params: { sucursalId } }),
    ]);
    setTurno(actual);
    setHistorial(hist);
  }, [sucursalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api
      .get<CuentaBancaria[]>("/cuentas-bancarias", { params: { soloActivas: true } })
      .then(({ data }) => {
        setCuentas(data);
        const ini: Record<string, string> = {};
        for (const c of data) ini[c.id] = String(c.saldoInicial);
        setSaldosApertura(ini);
      })
      .catch(() => setCuentas([]));
  }, []);

  async function abrir() {
    setProcesando(true);
    setError(null);
    try {
      await api.post("/caja/abrir", {
        sucursalId,
        montoInicial: Number(montoInicial) || 0,
        saldosIniciales: cuentas.map((c) => ({ cuentaId: c.id, saldo: Number(saldosApertura[c.id] || 0) })),
      });
      setMontoInicial("");
      await cargar();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo abrir la caja"));
    } finally {
      setProcesando(false);
    }
  }

  async function cerrar() {
    setProcesando(true);
    setError(null);
    try {
      const { data } = await api.post("/caja/cerrar", {
        sucursalId,
        montoContado: Number(montoContado) || 0,
        saldosFinales: cuentas.map((c) => ({ cuentaId: c.id, saldo: Number(saldosCierre[c.id] || 0) })),
      });
      setMontoContado("");
      setSaldosCierre({});
      setUltimoCierre(data);
      await cargar();
      await imprimirCierre(data);
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo cerrar la caja"));
    } finally {
      setProcesando(false);
    }
  }

  async function imprimirCierre(t: TurnoCerrado) {
    const config = await electronAPI.getConfig();
    try {
      await electronAPI.printReporteCaja(
        {
          empresaNombre: empresa?.nombre ?? "",
          sucursalNombre: t.sucursal?.nombre ?? sucursales.find((s) => s.id === sucursalId)?.nombre ?? "",
          fechaApertura: new Date(t.fechaApertura).toLocaleString("es-CO"),
          fechaCierre: new Date(t.fechaCierre).toLocaleString("es-CO"),
          usuarioApertura: t.usuarioApertura?.nombre ?? "",
          usuarioCierre: t.usuarioCierre?.nombre ?? "",
          montoInicial: Number(t.montoInicial),
          ventasEfectivo: Number(t.ventasEfectivo),
          totalEsperado: Number(t.totalEsperado),
          montoContado: Number(t.montoContado),
          diferencia: Number(t.diferencia),
        },
        config.printerName
      );
    } catch {
      // sin impresora igual quedo registrado
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Caja</h2>
          <p>Apertura y cierre de turno con arqueo de efectivo</p>
        </div>
        <label>
          Sucursal
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {turno ? (
        <div className="card" style={{ maxWidth: 460, marginBottom: 16 }}>
          <span className="badge success" style={{ marginBottom: 8 }}>Caja abierta</span>
          <p style={{ margin: "6px 0" }}>
            Abierta por <strong>{turno.usuarioApertura.nombre}</strong> el{" "}
            {new Date(turno.fechaApertura).toLocaleString("es-CO")}
          </p>
          <p style={{ margin: "6px 0" }}>
            Monto inicial: <strong>${Number(turno.montoInicial).toLocaleString("es-CO")}</strong>
          </p>
          <div className="grid-form" style={{ marginTop: 12 }}>
            <label>
              Efectivo contado fisicamente al cerrar
              <input type="number" min={0} value={montoContado} onChange={(e) => setMontoContado(e.target.value)} />
            </label>
            {cuentas.length > 0 && (
              <div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>Saldo final de cada cuenta</span>
                {cuentas.map((c) => (
                  <label key={c.id} style={{ marginTop: 6 }}>
                    {c.nombre}
                    <input
                      type="number"
                      value={saldosCierre[c.id] ?? ""}
                      placeholder="Saldo al cerrar"
                      onChange={(e) => setSaldosCierre((p) => ({ ...p, [c.id]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}
            <button className="danger" type="button" onClick={cerrar} disabled={procesando}>
              {procesando ? "Cerrando..." : "Cerrar caja e imprimir arqueo"}
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 460, marginBottom: 16 }}>
          <span className="badge neutral" style={{ marginBottom: 8 }}>Caja cerrada</span>
          <div className="grid-form" style={{ marginTop: 8 }}>
            <label>
              Monto inicial en efectivo
              <input type="number" min={0} value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} />
            </label>
            {cuentas.length > 0 && (
              <div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>Saldo inicial de cada cuenta</span>
                {cuentas.map((c) => (
                  <label key={c.id} style={{ marginTop: 6 }}>
                    {c.nombre}
                    <input
                      type="number"
                      value={saldosApertura[c.id] ?? ""}
                      onChange={(e) => setSaldosApertura((p) => ({ ...p, [c.id]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}
            <button type="button" onClick={abrir} disabled={procesando}>
              {procesando ? "Abriendo..." : "Abrir caja"}
            </button>
          </div>
        </div>
      )}

      {ultimoCierre?.desgloseCierre && (
        <div className="card" style={{ maxWidth: 520, marginBottom: 16 }}>
          <h4 style={{ marginTop: 0 }}>Resumen del ultimo cierre</h4>
          <table>
            <tbody>
              {Object.entries(ultimoCierre.desgloseCierre.porMetodo ?? {}).map(([metodo, v]: any) => (
                <tr key={metodo}>
                  <td>{ETIQUETA_METODO[metodo] ?? metodo}</td>
                  <td style={{ textAlign: "right" }}>${Number(v.total).toLocaleString("es-CO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(ultimoCierre.desgloseCierre.recibidoPorCuenta ?? []).length > 0 && (
            <>
              <h5 style={{ marginBottom: 6 }}>Recibido por cuenta (segun ventas)</h5>
              <table>
                <tbody>
                  {ultimoCierre.desgloseCierre.recibidoPorCuenta.map((c: any) => (
                    <tr key={c.cuentaId}>
                      <td>{c.nombre} <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({c.cantidad})</span></td>
                      <td style={{ textAlign: "right" }}>${Number(c.total).toLocaleString("es-CO")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {(ultimoCierre.desgloseCierre.cuentas ?? []).length > 0 && (
            <>
              <h5 style={{ marginBottom: 6 }}>Conciliacion de saldos</h5>
              <table>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th style={{ textAlign: "right" }}>Inicial</th>
                    <th style={{ textAlign: "right" }}>Final</th>
                    <th style={{ textAlign: "right" }}>Movimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimoCierre.desgloseCierre.cuentas.map((c: any) => (
                    <tr key={c.cuentaId}>
                      <td>{c.nombre}</td>
                      <td style={{ textAlign: "right" }}>${Number(c.saldoInicial).toLocaleString("es-CO")}</td>
                      <td style={{ textAlign: "right" }}>${Number(c.saldoFinal).toLocaleString("es-CO")}</td>
                      <td style={{ textAlign: "right", color: c.movimiento >= 0 ? "var(--success,#16a34a)" : "var(--danger,#dc2626)" }}>
                        ${Number(c.movimiento).toLocaleString("es-CO")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Diferencia en efectivo: <strong>${Number(ultimoCierre.diferencia).toLocaleString("es-CO")}</strong>
          </p>
        </div>
      )}

      <div className="card">
        <h4 style={{ marginTop: 0, marginBottom: 12 }}>Historial de cierres</h4>
        {historial.length === 0 ? (
          <p className="empty-state">Aun no hay cierres de caja</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Cajero</th>
                <th>Inicial</th>
                <th>Ventas efvo.</th>
                <th>Esperado</th>
                <th>Contado</th>
                <th>Diferencia</th>
                <th style={{ textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((t) => {
                const dif = Number(t.diferencia);
                return (
                  <tr key={t.id}>
                    <td>{new Date(t.fechaApertura).toLocaleString("es-CO")}</td>
                    <td>{new Date(t.fechaCierre).toLocaleString("es-CO")}</td>
                    <td>{t.usuarioCierre?.nombre ?? t.usuarioApertura.nombre}</td>
                    <td>${Number(t.montoInicial).toLocaleString("es-CO")}</td>
                    <td>${Number(t.ventasEfectivo).toLocaleString("es-CO")}</td>
                    <td>${Number(t.totalEsperado).toLocaleString("es-CO")}</td>
                    <td>${Number(t.montoContado).toLocaleString("es-CO")}</td>
                    <td>
                      <span className={`badge ${dif === 0 ? "success" : dif > 0 ? "neutral" : "danger"}`}>
                        {dif === 0 ? "Exacto" : dif > 0 ? `+$${dif.toLocaleString("es-CO")}` : `-$${Math.abs(dif).toLocaleString("es-CO")}`}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="danger"
                        style={{ padding: "4px 8px", fontSize: "12px" }}
                        onClick={() => eliminarCierre(t.id)}
                        disabled={eliminando === t.id}
                      >
                        {eliminando === t.id ? "Eliminando..." : "Eliminar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
