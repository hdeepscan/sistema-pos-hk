import { useSesionStore } from "../lib/store";
import { useNavigate } from "react-router-dom";

export function TrialBanner() {
  const { empresa } = useSesionStore();
  const navigate = useNavigate();

  if (!empresa?.fechaVencimiento || empresa.planSuscripcion !== "TRIAL") {
    return null;
  }

  const ahora = new Date();
  const vencimiento = new Date(empresa.fechaVencimiento);

  if (vencimiento <= ahora) {
    return null; // Usar pantalla de bloqueo en su lugar
  }

  const diferencia = vencimiento.getTime() - ahora.getTime();
  const horas = Math.ceil(diferencia / (1000 * 60 * 60));

  if (horas <= 0) {
    return null;
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
      color: "#78350f",
      padding: "12px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "1px solid #d97706",
      fontSize: "14px",
      fontWeight: "500"
    }}>
      <span>
        <span style={{ marginRight: "8px" }}>⏳</span>
        Estás disfrutando de tu prueba gratis. Te quedan <strong>{horas} horas</strong>.
      </span>
      <button
        onClick={() => navigate("/suscripcion")}
        style={{
          background: "#78350f",
          color: "#fbbf24",
          border: "none",
          padding: "6px 16px",
          borderRadius: "4px",
          cursor: "pointer",
          fontWeight: "600",
          fontSize: "12px"
        }}
      >
        Elegir Plan
      </button>
    </div>
  );
}
