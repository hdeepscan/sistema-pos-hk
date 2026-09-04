import { useState } from "react";
import { api } from "../lib/api";

interface Cliente {
  id: string;
  nombre: string;
  email?: string;
}

interface ModalCreditoProps {
  mostrar: boolean;
  clienteId?: string;
  clientes: Cliente[];
  total: number;
  onConfirmar: (data: { clienteId: string; cuotas: number; plazo: number; abonoInicial: number }) => void;
  onCerrar: () => void;
}

export function ModalCredito({ mostrar, clienteId: clienteIdProp, clientes, total, onConfirmar, onCerrar }: ModalCreditoProps) {
  const [clienteId, setClienteId] = useState(clienteIdProp || "");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [cuotas, setCuotas] = useState(1);
  const [plazo, setPlazo] = useState(1);
  const [abonoInicial, setAbonoInicial] = useState("");
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  if (!mostrar) return null;

  const montoCuota = Math.round((total / cuotas) * 100) / 100;
  const fechaVenc = new Date(Date.now() + plazo * 30 * 24 * 60 * 60 * 1000).toLocaleDateString("es-CO");

  async function confirmar() {
    setError("");
    if (!clienteId && !nuevoNombre.trim()) {
      setError("Selecciona un cliente o escribe el nombre de uno nuevo");
      return;
    }

    let idFinal = clienteId;

    if (!clienteId && nuevoNombre.trim()) {
      setCreando(true);
      try {
        const { data } = await api.post<{ id: string }>("/clientes", { nombre: nuevoNombre.trim() });
        idFinal = data.id;
      } catch {
        setError("No se pudo crear el cliente. Intenta de nuevo.");
        setCreando(false);
        return;
      }
      setCreando(false);
    }

    const abono = Number(abonoInicial) || 0;
    if (abono < 0 || abono > total) {
      setError(`El abono debe estar entre $0 y $${total.toLocaleString("es-CO")}`);
      return;
    }

    onConfirmar({ clienteId: idFinal, cuotas, plazo, abonoInicial: abono });
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-contenido" onClick={(e) => e.stopPropagation()}>
        <h2>Crear Crédito</h2>

        <div className="modal-seccion">
          <label>Cliente</label>
          <select
            value={clienteId}
            onChange={(e) => {
              setClienteId(e.target.value);
              setNuevoNombre("");
            }}
            className="modal-select"
          >
            <option value="">-- Seleccionar cliente existente --</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>

          {!clienteId && (
            <>
              <label style={{ marginTop: 10, display: "block" }}>O crear cliente nuevo</label>
              <input
                type="text"
                placeholder="Nombre del cliente"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="modal-input"
              />
            </>
          )}
        </div>

        <div className="modal-seccion">
          <label>Número de cuotas</label>
          <select value={cuotas} onChange={(e) => setCuotas(Number(e.target.value))} className="modal-select">
            {[1, 2, 3, 4, 6, 12].map((n) => (
              <option key={n} value={n}>{n} cuota{n > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>

        <div className="modal-seccion">
          <label>Plazo (meses)</label>
          <select value={plazo} onChange={(e) => setPlazo(Number(e.target.value))} className="modal-select">
            {[1, 2, 3, 6, 12].map((n) => (
              <option key={n} value={n}>{n} mes{n > 1 ? "es" : ""}</option>
            ))}
          </select>
        </div>

        <div className="modal-seccion">
          <label>Abono inicial (opcional)</label>
          <input
            type="number"
            min={0}
            max={total}
            placeholder="$0"
            value={abonoInicial}
            onChange={(e) => setAbonoInicial(e.target.value)}
            className="modal-input"
          />
        </div>

        <div className="modal-resumen">
          <p><strong>Total del crédito:</strong> ${total.toLocaleString("es-CO")}</p>
          <p><strong>Cuotas:</strong> {cuotas} × ${montoCuota.toLocaleString("es-CO")}</p>
          <p><strong>Plazo:</strong> {plazo} mes{plazo > 1 ? "es" : ""} · vence {fechaVenc}</p>
          {Number(abonoInicial) > 0 && (
            <p><strong>Pendiente tras abono:</strong> ${(total - Number(abonoInicial)).toLocaleString("es-CO")}</p>
          )}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-botones">
          <button onClick={onCerrar} className="btn-cancelar" type="button">Cancelar</button>
          <button onClick={confirmar} className="btn-confirmar" type="button" disabled={creando}>
            {creando ? "Creando cliente..." : "Confirmar Crédito"}
          </button>
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-contenido {
            background: white;
            border-radius: 8px;
            padding: 24px;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            max-height: 90vh;
            overflow-y: auto;
          }
          .modal-contenido h2 {
            margin: 0 0 20px 0;
            font-size: 20px;
            color: #333;
          }
          .modal-seccion {
            margin-bottom: 16px;
          }
          .modal-seccion label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
            color: #555;
            font-size: 14px;
          }
          .modal-input,
          .modal-select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            font-family: inherit;
            box-sizing: border-box;
          }
          .modal-input:focus,
          .modal-select:focus {
            outline: none;
            border-color: #5b5bff;
            box-shadow: 0 0 0 3px rgba(91, 91, 255, 0.1);
          }
          .modal-resumen {
            background: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            margin: 16px 0;
            font-size: 13px;
          }
          .modal-resumen p {
            margin: 6px 0;
            color: #555;
          }
          .modal-error {
            color: #d32f2f;
            font-size: 13px;
            margin-bottom: 12px;
            padding: 8px;
            background: #ffebee;
            border-radius: 4px;
          }
          .modal-botones {
            display: flex;
            gap: 10px;
            margin-top: 20px;
          }
          .btn-cancelar,
          .btn-confirmar {
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 4px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
          }
          .btn-cancelar {
            background: #f0f0f0;
            color: #333;
          }
          .btn-cancelar:hover {
            background: #e0e0e0;
          }
          .btn-confirmar {
            background: #5b5bff;
            color: white;
          }
          .btn-confirmar:hover:not(:disabled) {
            background: #4a4aee;
          }
          .btn-confirmar:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  );
}
