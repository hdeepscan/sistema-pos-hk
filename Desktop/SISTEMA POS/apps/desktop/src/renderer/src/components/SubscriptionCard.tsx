import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";

interface SubscriptionCardProps {
  fechaVencimiento?: string | Date;
  planSuscripcion?: string;
}

export function SubscriptionCard({ fechaVencimiento, planSuscripcion }: SubscriptionCardProps) {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
  } | null>(null);

  // Actualizar contador cada segundo
  useEffect(() => {
    const calculateTimeLeft = () => {
      if (!fechaVencimiento) return null;

      const vencimiento = new Date(fechaVencimiento).getTime();
      const ahora = new Date().getTime();
      const diferencia = vencimiento - ahora;

      if (diferencia <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
      }

      const days = Math.floor(diferencia / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diferencia % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds, total: days };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [fechaVencimiento]);

  if (!fechaVencimiento || !timeLeft) return null;

  const isExpired = timeLeft.total <= 0;
  const isAlmostExpired = timeLeft.total <= 3;
  const isCritical = timeLeft.total <= 1;

  // Definir colores según estado
  const bgColor = isExpired ? "rgb(254, 226, 226)" : isCritical ? "rgb(254, 243, 199)" : isAlmostExpired ? "rgb(240, 253, 244)" : "rgb(240, 249, 255)";
  const borderColor = isExpired ? "rgb(248, 113, 113)" : isCritical ? "rgb(202, 138, 4)" : isAlmostExpired ? "rgb(74, 222, 128)" : "rgb(96, 165, 250)";
  const textColor = isExpired ? "rgb(127, 29, 29)" : isCritical ? "rgb(78, 22, 6)" : isAlmostExpired ? "rgb(22, 101, 52)" : "rgb(30, 58, 138)";
  const pulseColor = isExpired ? "rgb(239, 68, 68)" : isCritical ? "rgb(217, 119, 6)" : isAlmostExpired ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)";

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: "12px",
        padding: "14px 12px",
        marginBottom: "16px",
        fontSize: "13px",
        color: textColor,
      }}
    >
      {/* Header con indicador de estado */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: pulseColor,
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
        <span style={{ fontWeight: "600", fontSize: "12px" }}>
          {isExpired
            ? "Suscripción vencida"
            : isCritical
              ? "¡Urgente! Renueva ya"
              : isAlmostExpired
                ? "Próximo a vencer"
                : "Prueba activa"}
        </span>
      </div>

      {/* Contador regresivo */}
      {!isExpired && (
        <div
          style={{
            display: "flex",
            gap: "4px",
            justifyContent: "center",
            marginBottom: "12px",
            fontFamily: "monospace",
            fontSize: "13px",
            fontWeight: "600",
            letterSpacing: "1px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div>{String(timeLeft.days).padStart(2, "0")}</div>
            <div style={{ fontSize: "10px", opacity: 0.7 }}>d</div>
          </div>
          <div>:</div>
          <div style={{ textAlign: "center" }}>
            <div>{String(timeLeft.hours).padStart(2, "0")}</div>
            <div style={{ fontSize: "10px", opacity: 0.7 }}>h</div>
          </div>
          <div>:</div>
          <div style={{ textAlign: "center" }}>
            <div>{String(timeLeft.minutes).padStart(2, "0")}</div>
            <div style={{ fontSize: "10px", opacity: 0.7 }}>m</div>
          </div>
          <div>:</div>
          <div style={{ textAlign: "center" }}>
            <div>{String(timeLeft.seconds).padStart(2, "0")}</div>
            <div style={{ fontSize: "10px", opacity: 0.7 }}>s</div>
          </div>
        </div>
      )}

      {/* Información y Plan */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "12px" }}>
        <Clock size={14} style={{ marginTop: "2px", flexShrink: 0, opacity: 0.8 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", opacity: 0.85 }}>
            {isExpired
              ? "Tu acceso ha expirado"
              : planSuscripcion === "TRIAL_5D"
                ? `Período de prueba gratuito`
                : `Plan: ${planSuscripcion || "Activo"}`}
          </div>
        </div>
      </div>

      {/* Botón Renovar */}
      <button
        onClick={() => navigate("/checkout")}
        style={{
          width: "100%",
          padding: "8px 12px",
          background: isExpired ? "rgb(239, 68, 68)" : isCritical ? "rgb(234, 179, 8)" : "#0066FF",
          color: isExpired || isCritical ? "white" : "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: "600",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.85";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        {isExpired ? "Pagar ahora" : "Renovar Plan"}
      </button>
    </div>
  );
}

// Agregar estilos globales para la animación pulse
if (typeof document !== "undefined" && !document.getElementById("pulse-animation")) {
  const style = document.createElement("style");
  style.id = "pulse-animation";
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}
