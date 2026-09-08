import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Lock, Unlock, CreditCard, Smartphone, Send, TrendingUp, XCircle, AlertCircle, CheckCircle } from "lucide-react";

const styles = `
  .caja-container { min-height: 100vh; background: #FFFFFF; padding: 32px; }
  .caja-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
  .caja-title { font-size: 28px; font-weight: 700; color: #0f172a; }
  .caja-closed { background: #f5f5f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; gap: 32px; }
  .caja-lock-icon { color: #94a3b8; }

  .caja-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .caja-card { background: #FFFFFF; border: 1px solid rgba(59, 130, 246, 0.08); border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
  .caja-card-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
  .caja-card-value { font-size: 22px; font-weight: 800; color: #3B82F6; }
  .caja-card-icon { margin-bottom: 8px; color: #64748b; }

  .form-input { width: 100%; height: 42px; padding: 0.5rem 1rem; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; }
  .form-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

  .caja-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .caja-btn { padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; }
  .caja-btn-primary { background: #3B82F6; color: white; }
  .caja-btn-primary:hover { background: #2563EB; transform: translateY(-2px); }
  .caja-btn-danger { background: #dc2626; color: white; }

  .caja-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .caja-modal-content { background: white; border-radius: 16px; padding: 32px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
  .caja-modal-close { position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; }

  .caja-cierre-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .caja-cierre-row { background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #E2E8F0; }
  .caja-cierre-row.error { border-color: #dc2626; background: #fee2e2; }
  .caja-cierre-row.success { border-color: #16a34a; background: #f0fdf4; }
  .caja-cierre-label { font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 8px; }
  .caja-cierre-value { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }

  .caja-estado-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .caja-estado-cuadrado { background: #d1fae5; color: #065f46; }
  .caja-estado-sobrante { background: #fef08a; color: #78350f; }
  .caja-estado-faltante { background: #fee2e2; color: #7f1d1d; }
`;

interface EstadoCanal {
  esperado: number;
  vendido: number;
}

interface Cierre {
  efectivo?: { esperado: number; reportado: number; diferencia: number; estado: string };
  tarjeta?: { esperado: number; reportado: number; diferencia: number; estado: string };
  transferencia?: { esperado: number; reportado: number; diferencia: number; estado: string };
  credito?: { esperado: number; reportado: number; diferencia: number; estado: string };
  otro?: { esperado: number; reportado: number; diferencia: number; estado: string };
}

export default function Caja() {
  const [estado, setEstado] = useState("CERRADA");
  const [turno, setTurno] = useState<any>(null);
  const [canales, setCanales] = useState<any>(null);
  const [totales, setTotales] = useState<any>(null);
  const [saldoInicial, setSaldoInicial] = useState("");
  const [loading, setLoading] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [cierre, setCierre] = useState({
    reportadoEfectivo: "",
    reportadoTarjeta: "",
    reportadoTransferencia: "",
    reportadoCredito: "",
    reportadoOtro: "",
    observaciones: "",
  });

  useEffect(() => {
    cargarEstado();
    const interval = setInterval(cargarEstado, 30000);
    return () => clearInterval(interval);
  }, []);

  async function cargarEstado() {
    try {
      const { data } = await api.get("/caja/estado");
      setEstado(data.estado);
      if (data.estado === "ABIERTA") {
        setTurno(data.turno);
        setCanales(data.canales);
        setTotales(data.totales);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async function abrirCaja() {
    if (!saldoInicial) return alert("Ingresa saldo inicial");
    try {
      setLoading(true);
      await api.post("/caja/abrir", { saldoInicial: parseFloat(saldoInicial) });
      setSaldoInicial("");
      await cargarEstado();
    } catch (error) {
      alert("Error al abrir caja");
    } finally {
      setLoading(false);
    }
  }

  async function cerrarCaja() {
    try {
      setLoading(true);
      const payload = {
        reportadoEfectivo: parseFloat(cierre.reportadoEfectivo),
        reportadoTarjeta: cierre.reportadoTarjeta ? parseFloat(cierre.reportadoTarjeta) : 0,
        reportadoTransferencia: cierre.reportadoTransferencia ? parseFloat(cierre.reportadoTransferencia) : 0,
        reportadoCredito: cierre.reportadoCredito ? parseFloat(cierre.reportadoCredito) : 0,
        reportadoOtro: cierre.reportadoOtro ? parseFloat(cierre.reportadoOtro) : 0,
        observaciones: cierre.observaciones || undefined,
      };
      const { data } = await api.post("/caja/cerrar", payload);
      alert("Caja cerrada exitosamente");
      setMostrarModal(false);
      setCierre({
        reportadoEfectivo: "",
        reportadoTarjeta: "",
        reportadoTransferencia: "",
        reportadoCredito: "",
        reportadoOtro: "",
        observaciones: "",
      });
      await cargarEstado();
    } catch (error) {
      alert("Error al cerrar caja");
    } finally {
      setLoading(false);
    }
  }

  const renderEstadoBadge = (estado: string) => {
    const clase =
      estado === "CUADRADO"
        ? "caja-estado-cuadrado"
        : estado === "SOBRANTE"
          ? "caja-estado-sobrante"
          : "caja-estado-faltante";
    return <span className={`caja-estado-badge ${clase}`}>{estado}</span>;
  };

  const renderCanalCard = (titulo: string, icono: any, valor: number) => (
    <div className="caja-card">
      {icono}
      <div className="caja-card-label">{titulo}</div>
      <div className="caja-card-value">${valor.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div>
    </div>
  );

  return (
    <div className="caja-container">
      <style>{styles}</style>

      {estado === "CERRADA" ? (
        <div className="caja-closed">
          <Lock size={48} className="caja-lock-icon" />
          <div>
            <h2>Caja Cerrada</h2>
            <p>Abre la caja para comenzar el turno</p>
          </div>
          <div style={{ width: "100%", maxWidth: "300px" }}>
            <input
              type="number"
              className="form-input"
              placeholder="Saldo inicial"
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
              step="0.01"
            />
            <button onClick={abrirCaja} disabled={loading} className="caja-btn caja-btn-primary" style={{ width: "100%", marginTop: "12px" }}>
              <Unlock size={16} /> Abrir Caja
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="caja-header">
            <h1 className="caja-title">Caja Abierta</h1>
            {turno && <span style={{ color: "#64748b", fontSize: "14px" }}>Operador: {turno.usuario}</span>}
          </div>

          {/* Grid de Resumen de Canales */}
          <div className="caja-grid">
            {renderCanalCard(
              "EFECTIVO",
              <div className="caja-card-icon">💵</div>,
              canales?.efectivo?.esperado || 0
            )}
            {renderCanalCard(
              "TARJETA",
              <CreditCard size={20} className="caja-card-icon" />,
              canales?.tarjeta?.esperado || 0
            )}
            {renderCanalCard(
              "TRANSFERENCIA",
              <Send size={20} className="caja-card-icon" />,
              canales?.transferencia?.esperado || 0
            )}
            {renderCanalCard(
              "CRÉDITO",
              <TrendingUp size={20} className="caja-card-icon" />,
              canales?.credito?.esperado || 0
            )}
            {renderCanalCard(
              "OTRO",
              <Smartphone size={20} className="caja-card-icon" />,
              canales?.otro?.esperado || 0
            )}
            {renderCanalCard(
              "TOTAL",
              <CheckCircle size={20} className="caja-card-icon" />,
              totales?.ventasTotales || 0
            )}
          </div>

          {/* Botones de acción */}
          <div className="caja-buttons">
            <button className="caja-btn caja-btn-primary" onClick={() => setMostrarModal(true)}>
              <Lock size={16} /> Cerrar Caja
            </button>
          </div>

          {/* Modal de Cierre Multicanal */}
          {mostrarModal && (
            <div className="caja-modal" onClick={() => !loading && setMostrarModal(false)}>
              <div className="caja-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="caja-modal-close" onClick={() => !loading && setMostrarModal(false)}>
                  <XCircle size={24} />
                </button>

                <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: 700 }}>Arqueo Multicanal</h2>

                {/* EFECTIVO - Cierre Ciego */}
                <div className="caja-cierre-row">
                  <div className="caja-cierre-label">💵 EFECTIVO (Cierre Ciego)</div>
                  <div style={{ marginBottom: "12px", fontSize: "12px", color: "#64748b" }}>
                    ¿Cuánto efectivo hay en el cajón?
                  </div>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Monto en cajón"
                    value={cierre.reportadoEfectivo}
                    onChange={(e) => setCierre({ ...cierre, reportadoEfectivo: e.target.value })}
                    step="0.01"
                    disabled={loading}
                  />
                </div>

                {/* TARJETA */}
                <div className="caja-cierre-row">
                  <div className="caja-cierre-label">
                    <CreditCard size={14} style={{ display: "inline", marginRight: "4px" }} />
                    TARJETA
                  </div>
                  <div className="caja-cierre-value">
                    Esperado: ${(canales?.tarjeta?.esperado || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                  </div>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Monto en datáfono"
                    value={cierre.reportadoTarjeta}
                    onChange={(e) => setCierre({ ...cierre, reportadoTarjeta: e.target.value })}
                    step="0.01"
                    disabled={loading}
                  />
                </div>

                {/* TRANSFERENCIA */}
                <div className="caja-cierre-row">
                  <div className="caja-cierre-label">
                    <Send size={14} style={{ display: "inline", marginRight: "4px" }} />
                    TRANSFERENCIA
                  </div>
                  <div className="caja-cierre-value">
                    Esperado: $
                    {(canales?.transferencia?.esperado || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                  </div>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Monto en banco"
                    value={cierre.reportadoTransferencia}
                    onChange={(e) => setCierre({ ...cierre, reportadoTransferencia: e.target.value })}
                    step="0.01"
                    disabled={loading}
                  />
                </div>

                {/* CRÉDITO */}
                <div className="caja-cierre-row">
                  <div className="caja-cierre-label">
                    <TrendingUp size={14} style={{ display: "inline", marginRight: "4px" }} />
                    CRÉDITO (Fiado)
                  </div>
                  <div className="caja-cierre-value">
                    Esperado: ${(canales?.credito?.esperado || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                  </div>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Monto reportado"
                    value={cierre.reportadoCredito}
                    onChange={(e) => setCierre({ ...cierre, reportadoCredito: e.target.value })}
                    step="0.01"
                    disabled={loading}
                  />
                </div>

                {/* OTRO */}
                <div className="caja-cierre-row">
                  <div className="caja-cierre-label">
                    <Smartphone size={14} style={{ display: "inline", marginRight: "4px" }} />
                    OTRO
                  </div>
                  <div className="caja-cierre-value">
                    Esperado: ${(canales?.otro?.esperado || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                  </div>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Monto reportado"
                    value={cierre.reportadoOtro}
                    onChange={(e) => setCierre({ ...cierre, reportadoOtro: e.target.value })}
                    step="0.01"
                    disabled={loading}
                  />
                </div>

                {/* OBSERVACIONES */}
                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                    Observaciones (opcional)
                  </label>
                  <textarea
                    className="form-input"
                    placeholder="Notas sobre el cierre"
                    value={cierre.observaciones}
                    onChange={(e) => setCierre({ ...cierre, observaciones: e.target.value })}
                    disabled={loading}
                    style={{ height: "80px", resize: "none", paddingTop: "12px" }}
                  />
                </div>

                {/* Botones */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <button
                    className="caja-btn caja-btn-primary"
                    onClick={cerrarCaja}
                    disabled={loading || !cierre.reportadoEfectivo}
                    style={{ width: "100%" }}
                  >
                    {loading ? "Cerrando..." : "Cerrar Caja"}
                  </button>
                  <button
                    className="caja-btn"
                    onClick={() => setMostrarModal(false)}
                    disabled={loading}
                    style={{ width: "100%", background: "#e2e8f0", color: "#1e293b" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
