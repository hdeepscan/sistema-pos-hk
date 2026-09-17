import { useNavigate } from "react-router-dom";
import { useSesionStore } from "../lib/store";
import { BarChart3 } from "lucide-react";

interface Plan {
  id: string;
  nombre: string;
  tipoPlan: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  precio: number;
  precioFinal: number;
  descuento: number;
  diasDuracion: number;
  icono: string;
  descripcion: string;
}

const PLANES: Plan[] = [
  {
    id: "mensual",
    nombre: "Plan Mensual",
    tipoPlan: "MENSUAL",
    precio: 50000,
    precioFinal: 50000,
    descuento: 0,
    diasDuracion: 30,
    icono: "📅",
    descripcion: "Acceso completo por 30 días",
  },
  {
    id: "trimestral",
    nombre: "Plan Trimestral",
    tipoPlan: "TRIMESTRAL",
    precio: 135000,
    precioFinal: 120000,
    descuento: 15000,
    diasDuracion: 90,
    icono: "📊",
    descripcion: "Acceso completo por 90 días. Ahorra $15.000",
  },
  {
    id: "anual",
    nombre: "Plan Anual",
    tipoPlan: "ANUAL",
    precio: 480000,
    precioFinal: 420000,
    descuento: 60000,
    diasDuracion: 365,
    icono: "⭐",
    descripcion: "Acceso completo por 365 días. Ahorra $60.000",
  },
];

export default function Suscripcion() {
  const navigate = useNavigate();
  const { empresa } = useSesionStore();

  const formatMoneda = (cantidad: number): string => {
    return Number(cantidad).toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const calcularDiasRestantes = (): number => {
    if (!empresa?.fechaVencimiento) return 0;
    const ahora = new Date();
    const vencimiento = new Date(empresa.fechaVencimiento);
    const diferencia = vencimiento.getTime() - ahora.getTime();
    return Math.max(0, Math.ceil(diferencia / (1000 * 60 * 60 * 24)));
  };

  const diasRestantes = calcularDiasRestantes();
  const estaEnTrial = empresa?.planSuscripcion === "TRIAL";

  const manejarPlan = (plan: Plan) => {
    // TODO: Reemplazar con URLs reales de Wompi para cada plan
    const urlPorPlan: Record<string, string> = {
      "mensual": "https://checkout.wompi.co/PLAN_MENSUAL_LINK",
      "trimestral": "https://checkout.wompi.co/PLAN_TRIMESTRAL_LINK",
      "anual": "https://checkout.wompi.co/PLAN_ANUAL_LINK",
    };

    const urlWompi = urlPorPlan[plan.id] || "https://checkout.wompi.co/";
    window.location.href = urlWompi;
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <BarChart3 size={32} style={{ color: "#3B82F6" }} />
          <h1 style={{ margin: 0, fontSize: "32px", fontWeight: 700, color: "#0F172A" }}>
            Gestión de Suscripción
          </h1>
        </div>
        <p style={{ margin: 0, color: "#64748B", fontSize: "16px" }}>
          Visualiza tu plan actual y elige el que mejor se adapte a tu negocio
        </p>
      </div>

      {/* Estado Actual */}
      <div
        style={{
          background: estaEnTrial ? "#FEF3C7" : "#D1FAE5",
          border: estaEnTrial ? "2px solid #F59E0B" : "2px solid #10B981",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "40px",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "24px" }}>
          <div>
            <p style={{ margin: 0, fontSize: "12px", color: estaEnTrial ? "#92400E" : "#065F46", fontWeight: 600, textTransform: "uppercase" }}>
              Plan Actual
            </p>
            <p style={{ margin: "8px 0 0 0", fontSize: "24px", fontWeight: 700, color: estaEnTrial ? "#D97706" : "#059669" }}>
              {estaEnTrial ? "Prueba Gratis" : empresa?.planSuscripcion || "Sin suscripción"}
            </p>
          </div>

          <div>
            <p style={{ margin: 0, fontSize: "12px", color: estaEnTrial ? "#92400E" : "#065F46", fontWeight: 600, textTransform: "uppercase" }}>
              Días Restantes
            </p>
            <p style={{ margin: "8px 0 0 0", fontSize: "24px", fontWeight: 700, color: estaEnTrial ? "#D97706" : "#059669" }}>
              {diasRestantes}
            </p>
          </div>

          <div>
            <p style={{ margin: 0, fontSize: "12px", color: estaEnTrial ? "#92400E" : "#065F46", fontWeight: 600, textTransform: "uppercase" }}>
              Vencimiento
            </p>
            <p style={{ margin: "8px 0 0 0", fontSize: "18px", fontWeight: 600, color: estaEnTrial ? "#B45309" : "#047857" }}>
              {empresa?.fechaVencimiento
                ? new Date(empresa.fechaVencimiento).toLocaleDateString("es-CO", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Sin información"}
            </p>
          </div>
        </div>
      </div>

      {/* Planes */}
      <div>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#0F172A", marginBottom: "24px" }}>
          Nuestros Planes
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "24px",
          }}
        >
          {PLANES.map((plan) => (
            <div
              key={plan.id}
              style={{
                border: "2px solid #E2E8F0",
                borderRadius: "12px",
                padding: "24px",
                textAlign: "center",
                transition: "all 0.3s ease",
                cursor: "pointer",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#3B82F6";
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(59, 130, 246, 0.15)";
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#E2E8F0";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {/* Ícono */}
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>{plan.icono}</div>

              {/* Nombre */}
              <h3 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: 700, color: "#0F172A" }}>
                {plan.nombre}
              </h3>

              {/* Descripción */}
              <p style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#64748B" }}>
                {plan.descripcion}
              </p>

              {/* Precio */}
              <div style={{ margin: "20px 0" }}>
                <div style={{ fontSize: "36px", fontWeight: 700, color: "#3B82F6" }}>
                  ${formatMoneda(plan.precioFinal)}
                </div>

                {plan.descuento > 0 && (
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#10B981",
                      fontWeight: 600,
                      marginTop: "8px",
                      background: "#D1FAE5",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      display: "inline-block",
                    }}
                  >
                    Ahorras ${formatMoneda(plan.descuento)}
                  </div>
                )}
              </div>

              {/* Duración */}
              <p style={{ margin: "16px 0", fontSize: "13px", color: "#94A3B8" }}>
                Duración: {plan.diasDuracion} días
              </p>

              {/* Botón */}
              <button
                onClick={() => manejarPlan(plan)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "#3B82F6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#2563EB";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#3B82F6";
                }}
              >
                Contratar Plan
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "40px",
          padding: "20px",
          background: "#F8FAFC",
          borderRadius: "12px",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: "13px", color: "#64748B" }}>
          Todos los planes incluyen acceso completo a Centrala POS. Puedes cambiar o cancelar tu suscripción en cualquier momento.
        </p>
      </div>

      {/* Botón Volver */}
      <div style={{ marginTop: "20px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "10px 16px",
            background: "#E2E8F0",
            color: "#0F172A",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Volver
        </button>
      </div>
    </div>
  );
}
