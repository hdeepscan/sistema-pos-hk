import { useState, useEffect } from "react";
import { useSesionStore } from "../lib/store";
import { api } from "../lib/api";

interface Plan {
  tipoPlan: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  precio: number;
  descuento: number;
  precioFinal: number;
  diasDuracion: number;
}

const PLAN_ICONS: Record<string, string> = {
  MENSUAL: "📅",
  TRIMESTRAL: "📊",
  ANUAL: "⭐"
};

const PLAN_LABELS: Record<string, string> = {
  MENSUAL: "Plan Mensual",
  TRIMESTRAL: "Plan Trimestral",
  ANUAL: "Plan Anual"
};

export function ModalSuscripcion() {
  const { empresa } = useSesionStore();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    api.get("/pagos/planes")
      .then(({ data }) => {
        const planesFiltrados = data.planes.filter(
          (p: Plan) => p.tipoPlan !== "TRIAL_5D"
        );
        setPlanes(planesFiltrados);
      })
      .catch((err) => console.error("Error cargando planes:", err))
      .finally(() => setCargando(false));
  }, []);

  const handleSelectPlan = async (tipoPlan: string) => {
    setProcesando(true);
    try {
      const { data } = await api.post("/pagos/crear-pago", {
        tipoPlan,
        usuariosAdicionales: 0,
        isSubscriptionRenewal: true
      });

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error procesando pago:", error);
      setProcesando(false);
    }
  };

  // El modal se abre desde Layout.tsx cuando el usuario hace click en "Elegir Plan" o "Renovar Plan"
  // No hay validaciones aquí - el modal simplemente muestra los planes disponibles
  if (!empresa) {
    return null;
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(4px)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px"
    }}>
      <div style={{
        backgroundColor: "white",
        borderRadius: "12px",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        maxWidth: "1000px",
        width: "100%",
        padding: "40px",
        maxHeight: "90vh",
        overflowY: "auto"
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h2 style={{ fontSize: "28px", fontWeight: "700", margin: "0 0 8px 0" }}>
            Tu período de prueba ha finalizado
          </h2>
          <p style={{ color: "#666", margin: "0", fontSize: "16px" }}>
            Elige un plan para seguir usando Centrala POS sin interrupciones
          </p>
        </div>

        {cargando ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            Cargando planes...
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "24px",
            marginBottom: "32px"
          }}>
            {planes.map((plan) => (
              <div
                key={plan.tipoPlan}
                style={{
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "24px",
                  textAlign: "center",
                  transition: "all 0.3s",
                  cursor: "pointer"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#3b82f6";
                  e.currentTarget.style.boxShadow = "0 10px 20px rgba(59, 130, 246, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>
                  {PLAN_ICONS[plan.tipoPlan]}
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: "600", margin: "0 0 8px 0" }}>
                  {PLAN_LABELS[plan.tipoPlan]}
                </h3>
                <p style={{ color: "#999", fontSize: "13px", margin: "0 0 16px 0" }}>
                  {plan.diasDuracion} días
                </p>

                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "32px", fontWeight: "700", color: "#0f172a" }}>
                    ${plan.precioFinal.toLocaleString()}
                  </div>
                  {plan.descuento > 0 && (
                    <div style={{ color: "#10b981", fontSize: "12px", marginTop: "4px" }}>
                      Ahorras ${plan.descuento.toLocaleString()}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSelectPlan(plan.tipoPlan)}
                  disabled={procesando}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: procesando ? "not-allowed" : "pointer",
                    opacity: procesando ? 0.5 : 1
                  }}
                >
                  {procesando ? "Procesando..." : "Contratar"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{
          background: "#f3f4f6",
          padding: "16px",
          borderRadius: "6px",
          fontSize: "13px",
          color: "#666",
          textAlign: "center"
        }}>
          Todos los planes incluyen acceso completo a Centrala POS. Puedes cambiar o cancelar en cualquier momento.
        </div>
      </div>
    </div>
  );
}
