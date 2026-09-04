import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface ProximoPago {
  cuota: number;
  fecha: string;
  monto: number;
}

interface Abono {
  id: string;
  monto: number;
  fecha: string;
  referencia?: string;
}

interface DetalleCreditoModalProps {
  mostrar: boolean;
  creditoId?: string;
  clienteNombre: string;
  total: number;
  pendiente: number;
  estado: string;
  onAbonar: () => void;
  onCerrar: () => void;
}

export function DetalleCreditoModal({
  mostrar,
  creditoId,
  clienteNombre,
  total,
  pendiente,
  estado,
  onAbonar,
  onCerrar,
}: DetalleCreditoModalProps) {
  const [proximosPagos, setProximosPagos] = useState<ProximoPago[]>([]);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [pendienteActual, setPendienteActual] = useState(pendiente);
  const [montoAbono, setMontoAbono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mostrar && creditoId) {
      cargarDetalles();
    }
  }, [mostrar, creditoId]);

  async function cargarDetalles() {
    setCargando(true);
    setError("");
    try {
      const [{ data: detalle }, { data: pagos }] = await Promise.all([
        api.get<{ abonos: Abono[] }>(`/creditos/${creditoId}/detalle`),
        api.get<ProximoPago[]>(`/creditos/${creditoId}/proximos-pagos`),
      ]);
      setAbonos(detalle.abonos || []);
      setProximosPagos(pagos);
    } catch {
      setError("Error al cargar los detalles del crédito");
    } finally {
      setCargando(false);
    }
  }

  async function hacerAbono() {
    setError("");
    const monto = Number(montoAbono);
    if (!monto || monto <= 0) {
      setError("El monto debe ser mayor a $0");
      return;
    }
    if (monto > pendienteActual) {
      setError(`El monto no puede superar el pendiente ($${pendienteActual.toLocaleString("es-CO")})`);
      return;
    }
    setGuardando(true);
    try {
      await api.post(`/creditos/${creditoId}/abonar`, { monto });
      setPendienteActual((prev) => Math.max(0, prev - monto));
      setMontoAbono("");
      await cargarDetalles();
      onAbonar();
    } catch {
      setError("Error al registrar el abono");
    } finally {
      setGuardando(false);
    }
  }

  if (!mostrar) return null;

  const pagado = total - pendienteActual;
  const porcentajePagado = total > 0 ? Math.round((pagado / total) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-contenido-grande" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Detalle del Crédito</h2>
          <button onClick={onCerrar} className="btn-cerrar" type="button">✕</button>
        </div>

        <div className="detalle-cliente">
          <p><strong>{clienteNombre}</strong></p>
          <span className={`estado-badge estado-${estado.toLowerCase()}`}>
            {estado === "VIGENTE" && "Vigente"}
            {estado === "PROXIMO_A_VENCER" && "Próximo a vencer"}
            {estado === "VENCIDO" && "Vencido"}
            {estado === "PAGADO" && "Pagado"}
          </span>
        </div>

        <div className="detalle-grid">
          <div className="detalle-card">
            <label>Total</label>
            <p className="detalle-valor">${total.toLocaleString("es-CO")}</p>
          </div>
          <div className="detalle-card">
            <label>Pagado</label>
            <p className="detalle-valor" style={{ color: "#4caf50" }}>${pagado.toLocaleString("es-CO")}</p>
          </div>
          <div className="detalle-card">
            <label>Pendiente</label>
            <p className="detalle-valor" style={{ color: "#ff9800" }}>${pendienteActual.toLocaleString("es-CO")}</p>
          </div>
        </div>

        <div className="progress-bar-wrap">
          <div className="progress-fill" style={{ width: `${porcentajePagado}%` }} />
          <span className="progress-label">{porcentajePagado}% pagado</span>
        </div>

        {pendienteActual > 0 && (
          <div className="seccion-abono">
            <h3>Registrar abono</h3>
            <div className="input-group">
              <input
                type="number"
                placeholder="Monto del abono"
                value={montoAbono}
                onChange={(e) => setMontoAbono(e.target.value)}
                className="detalle-input"
                min={1}
                max={pendienteActual}
              />
              <button onClick={hacerAbono} className="btn-abono" type="button" disabled={guardando}>
                {guardando ? "Guardando..." : "Registrar"}
              </button>
            </div>
            {error && <div className="modal-error">{error}</div>}
          </div>
        )}

        <div className="seccion-pagos">
          <h3>Próximas fechas de pago</h3>
          {cargando ? (
            <p style={{ fontSize: 13, color: "#999" }}>Cargando...</p>
          ) : proximosPagos.length > 0 ? (
            <table className="tabla-pagos">
              <thead>
                <tr>
                  <th>Cuota</th>
                  <th>Fecha</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {proximosPagos.map((pago) => (
                  <tr key={pago.cuota}>
                    <td>{pago.cuota}</td>
                    <td>{new Date(pago.fecha).toLocaleDateString("es-CO")}</td>
                    <td>${pago.monto.toLocaleString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 13, color: "#999" }}>No hay cuotas registradas</p>
          )}
        </div>

        <div className="seccion-abonos">
          <h3>Historial de abonos</h3>
          {cargando ? (
            <p style={{ fontSize: 13, color: "#999" }}>Cargando...</p>
          ) : abonos.length > 0 ? (
            <table className="tabla-abonos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {abonos.map((abono) => (
                  <tr key={abono.id}>
                    <td>{new Date(abono.fecha).toLocaleDateString("es-CO")}</td>
                    <td>${Number(abono.monto).toLocaleString("es-CO")}</td>
                    <td>{abono.referencia || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 13, color: "#999" }}>No hay abonos registrados</p>
          )}
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 16px;
          }
          .modal-contenido-grande {
            background: white;
            border-radius: 8px;
            padding: 24px;
            max-width: 600px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 24px rgba(0,0,0,0.18);
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }
          .modal-header h2 { margin: 0; font-size: 20px; }
          .btn-cerrar {
            background: none;
            border: none;
            font-size: 22px;
            cursor: pointer;
            color: #999;
            line-height: 1;
          }
          .detalle-cliente {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: #f5f5f5;
            border-radius: 4px;
            margin-bottom: 16px;
          }
          .detalle-cliente p { margin: 0; font-size: 15px; }
          .estado-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }
          .estado-pagado { background: #e8f5e9; color: #2e7d32; }
          .estado-vigente { background: #e3f2fd; color: #1565c0; }
          .estado-proximo_a_vencer { background: #fff3e0; color: #e65100; }
          .estado-vencido { background: #ffebee; color: #c62828; }
          .detalle-grid {
            display: grid;
            grid-template-columns: repeat(3,1fr);
            gap: 12px;
            margin-bottom: 16px;
          }
          .detalle-card {
            background: #f9f9f9;
            padding: 12px;
            border-radius: 4px;
            border: 1px solid #ebebeb;
          }
          .detalle-card label {
            display: block;
            font-size: 11px;
            color: #999;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: .5px;
          }
          .detalle-valor { margin: 0; font-size: 18px; font-weight: 700; color: #333; }
          .progress-bar-wrap {
            height: 10px;
            background: #e0e0e0;
            border-radius: 5px;
            margin-bottom: 20px;
            position: relative;
            overflow: hidden;
          }
          .progress-fill { height: 100%; background: #4caf50; border-radius: 5px; transition: width .3s; }
          .progress-label {
            position: absolute;
            right: 0;
            top: -18px;
            font-size: 11px;
            font-weight: 600;
            color: #666;
          }
          .seccion-abono {
            margin-bottom: 24px;
            padding: 16px;
            background: #f0f7ff;
            border-radius: 6px;
          }
          .seccion-abono h3, .seccion-pagos h3, .seccion-abonos h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 700;
            color: #333;
          }
          .input-group { display: flex; gap: 8px; }
          .detalle-input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          }
          .btn-abono {
            padding: 10px 20px;
            background: #5b5bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            white-space: nowrap;
          }
          .btn-abono:hover:not(:disabled) { background: #4a4aee; }
          .btn-abono:disabled { opacity: .6; cursor: not-allowed; }
          .seccion-pagos, .seccion-abonos { margin-bottom: 20px; }
          .tabla-pagos, .tabla-abonos {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          .tabla-pagos th, .tabla-abonos th {
            background: #f5f5f5;
            padding: 8px;
            text-align: left;
            font-weight: 600;
            color: #555;
          }
          .tabla-pagos td, .tabla-abonos td {
            padding: 8px;
            border-bottom: 1px solid #eee;
          }
          .modal-error {
            color: #d32f2f;
            font-size: 13px;
            margin-top: 8px;
            padding: 8px;
            background: #ffebee;
            border-radius: 4px;
          }
        `}</style>
      </div>
    </div>
  );
}
