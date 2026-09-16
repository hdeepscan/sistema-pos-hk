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
      padding: "14px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "3px solid #d97706",
      fontSize: "14px",
      fontWeight: "500",
      boxShadow: "0 4px 12px rgba(251, 191, 36, 0.15)"
    }}>
      <span>
        <span style={{ marginRight: "8px", fontSize: "16px" }}>⏳</span>
        Estás disfrutando de tu prueba gratis. Te quedan <strong style={{ fontSize: "16px" }}>{horas} horas</strong>.
      </span>
      <button
        onClick={() => navigate("/suscripcion")}
        style={{
          background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
          color: "white",
          border: "none",
          padding: "8px 24px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: "700",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxShadow: "0 4px 12px rgba(22, 163, 74, 0.3)",
          transition: "all 0.2s ease",
          whiteSpace: "nowrap"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, #15803d 0%, #166534 100%)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(22, 163, 74, 0.4)";
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, #16a34a 0%, #15803d 100%)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(22, 163, 74, 0.3)";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <span>💳</span>
        Elegir Plan
      </button>
    </div>
  );
}
