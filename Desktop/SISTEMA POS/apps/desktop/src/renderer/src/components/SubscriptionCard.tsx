import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface SubscriptionCardProps {
  fechaVencimiento?: string | Date;
  planSuscripcion?: string;
}

export function SubscriptionCard({ fechaVencimiento, planSuscripcion }: SubscriptionCardProps) {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      if (!fechaVencimiento) return null;

      const vencimiento = new Date(fechaVencimiento).getTime();
      const ahora = new Date().getTime();
      const diferencia = vencimiento - ahora;

      if (diferencia <= 0) {
        return { days: 0, hours: 0, total: 0 };
      }

      const days = Math.floor(diferencia / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      return { days, hours, total: days };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 60000); // Actualizar cada minuto

    return () => clearInterval(timer);
  }, [fechaVencimiento]);

  if (!fechaVencimiento || !timeLeft) return null;

  const isExpired = timeLeft.total <= 0;
  const isAlmostExpired = timeLeft.total <= 2;

  // Colores profesionales
  const getColors = () => {
    if (isExpired) return { bg: "rgba(239, 68, 68, 0.05)", border: "rgb(239, 68, 68)", text: "rgb(127, 29, 29)", btn: "rgb(239, 68, 68)" };
    if (isAlmostExpired) return { bg: "rgba(234, 179, 8, 0.05)", border: "rgb(234, 179, 8)", text: "rgb(78, 22, 6)", btn: "rgb(234, 179, 8)" };
    return { bg: "rgba(0, 102, 255, 0.05)", border: "rgb(191, 219, 254)", text: "rgb(30, 58, 138)", btn: "#0066FF" };
  };

  const colors = getColors();

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "10px",
        padding: "16px",
        marginBottom: "16px",
        fontSize: "13px",
        color: colors.text,
      }}
    >
      {/* Status + Days */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontWeight: "500", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8 }}>
          {isExpired ? "Vencida" : isAlmostExpired ? "Vencimiento próximo" : "Plan activo"}
        </span>
        <span
          style={{
            fontSize: "16px",
            fontWeight: "700",
            color: colors.btn,
          }}
        >
          {timeLeft.days}d
        </span>
      </div>

      {/* Plan Info */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "13px", fontWeight: "500" }}>
          {planSuscripcion === "TRIAL_5D" ? "Prueba gratuita" : `Plan ${planSuscripcion || "Activo"}`}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}>
          {isExpired
            ? "Tu acceso ha expirado"
            : `Vence en ${timeLeft.days}d y ${timeLeft.hours}h`}
        </div>
      </div>

      {/* Button */}
      <button
        onClick={() => navigate("/checkout")}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: colors.btn,
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: "600",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.9";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
      >
        {isExpired ? "Renovar ahora" : "Renovar plan"}
      </button>
    </div>
  );
}
