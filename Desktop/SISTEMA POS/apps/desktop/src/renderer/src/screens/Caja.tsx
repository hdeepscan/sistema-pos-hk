import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Lock, Unlock, Wallet, Plus, Minus, History, AlertCircle } from "lucide-react";

const styles = `
  .caja-container { min-height: 100vh; background: #FFFFFF; padding: 32px; }
  .caja-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
  .caja-title { font-size: 28px; font-weight: 700; color: #0f172a; }
  .caja-closed { background: #f5f5f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; gap: 32px; }
  .caja-lock-icon { color: #94a3b8; }
  .caja-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; margin-bottom: 32px; }
  .caja-card { background: #FFFFFF; border: 1px solid rgba(59, 130, 246, 0.08); border-radius: 16px; padding: 24px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
  .caja-card-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
  .caja-card-value { font-size: 28px; font-weight: 800; color: #3B82F6; }
  .form-input { width: 100%; height: 42px; padding: 0.5rem 1rem; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; }
  .form-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
  .caja-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .caja-btn { padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; }
  .caja-btn-primary { background: #3B82F6; color: white; }
  .caja-btn-primary:hover { background: #2563EB; transform: translateY(-2px); }
  .caja-btn-danger { background: #dc2626; color: white; }
  .caja-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .caja-modal-content { background: white; border-radius: 16px; padding: 32px; width: 90%; max-width: 400px; }
  .caja-table { width: 100%; border-collapse: collapse; }
  .caja-table th { padding: 14px 16px; background: #3B82F6; color: white; font-weight: 700; }
  .caja-table td { padding: 14px 16px; border-bottom: 1px solid #E2E8F0; }
`;

export default function Caja() {
  const [estado, setEstado] = useState("CERRADA");
  const [turno, setTurno] = useState(null);
  const [saldoInicial, setSaldoInicial] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarEstado();
  }, []);

  async function cargarEstado() {
    try {
      const { data } = await api.get("/caja/estado");
      setEstado(data.estado);
      if (data.estado === "ABIERTA") setTurno(data.turno);
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

  return (
    <div className="caja-container">
      <style>{styles}</style>
      {estado === "CERRADA" ? (
        <div className="caja-closed">
          <Lock size={48} className="caja-lock-icon" />
          <div><h2>Caja Cerrada</h2></div>
          <div style={{ width: "100%", maxWidth: "300px" }}>
            <input type="number" className="form-input" placeholder="Saldo inicial" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
            <button onClick={abrirCaja} disabled={loading} className="caja-btn caja-btn-primary" style={{ width: "100%", marginTop: "12px" }}>
              <Unlock size={16} /> Abrir Caja
            </button>
          </div>
        </div>
      ) : (
        <div><h1 className="caja-title">Caja Abierta</h1><p>Turno activo desde {new Date(turno?.abiertaDesde).toLocaleTimeString()}</p></div>
      )}
    </div>
  );
}
