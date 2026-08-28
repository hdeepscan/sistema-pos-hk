import { useEffect } from "react";
import { useSesionStore, useSuscripcionActiva } from "../lib/store";
import { useNavigate } from "react-router-dom";

/**
 * Componente que bloquea el acceso si la suscripción está vencida
 * Se coloca alrededor del contenido principal de la app
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const suscripcionActiva = useSuscripcionActiva();
  const navigate = useNavigate();
  const empresa = useSesionStore((s) => s.empresa);

  // Si la suscripción venció, mostrar pantalla de bloqueo
  if (!suscripcionActiva && empresa) {
    const ahora = new Date();
    const vencimiento = new Date(empresa.fechaVencimiento || "");
    const diasVencidos = Math.floor((ahora.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24));

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          padding: "20px",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            padding: "40px",
            maxWidth: "500px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "20px" }}>🔒</div>

          <h1 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "12px", color: "#1a202c" }}>
            Suscripción Vencida
          </h1>

          <p
            style={{
              fontSize: "16px",
              color: "#718096",
              marginBottom: "24px",
              lineHeight: "1.6",
            }}
          >
            Tu suscripción venció hace{" "}
            <strong style={{ color: "#dc2626" }}>
              {diasVencidos} día{diasVencidos !== 1 ? "s" : ""}
            </strong>
            .
          </p>

          <p
            style={{
              fontSize: "14px",
              color: "#718096",
              marginBottom: "30px",
              lineHeight: "1.6",
            }}
          >
            Para continuar usando el sistema POS, por favor renew your subscription.
          </p>

          <button
            onClick={() => navigate("/checkout")}
            style={{
              width: "100%",
              padding: "16px",
              background: "#0066FF",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.9";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            💳 Renovar Suscripción Ahora
          </button>

          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              background: "#f0f9ff",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#0369a1",
            }}
          >
            📧 Si tienes problemas, contacta a soporte en el email de tu cuenta.
          </div>
        </div>
      </div>
    );
  }

  // Suscripción activa: mostrar contenido normalmente
  return <>{children}</>;
}
