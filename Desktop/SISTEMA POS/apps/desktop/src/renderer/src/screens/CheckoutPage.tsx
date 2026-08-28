import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { notif } from "../lib/notificationService";
import { useSesionStore } from "../lib/store";
import { useNavigate } from "react-router-dom";

interface Plan {
  tipoPlan: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  precio: number;
  descuento: number;
  precioFinal: number;
  diasDuracion: number;
  precioXUsuarioAdicional: number;
}

interface CheckoutData {
  url: string;
  referenciaPago: string;
  monto: number;
  tipoPlan: string;
}

interface CheckoutPageProps {
  onBack?: () => void;
  isRegistration?: boolean;
}

export default function CheckoutPage({ onBack, isRegistration = false }: CheckoutPageProps) {
  const navigate = useNavigate();
  const { registroDatos, setSesion, limpiarRegistroDatos } = useSesionStore();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [planSeleccionado, setPlanSeleccionado] = useState<string>("MENSUAL");
  const [usuariosAdicionales, setUsuariosAdicionales] = useState(0);
  const [procesando, setProcesando] = useState(false);

  // Cargar planes
  useEffect(() => {
    api.get("/pagos/planes")
      .then(({ data }) => {
        setPlanes(data.planes);
        setCargando(false);
      })
      .catch((error) => {
        console.error("Error cargando planes:", error);
        notif.error("Error al cargar planes");
        setCargando(false);
      });
  }, []);

  // Verificar si volvemos de Wompi
  useEffect(() => {
    const checkoutPending = localStorage.getItem("checkout_pending");
    if (!checkoutPending) return;

    const verificarPago = async () => {
      try {
        const pending = JSON.parse(checkoutPending);
        const { referenciaPago, registroDatos: datosReg, tipoPlan, usuariosAdicionales: usuarios } = pending;

        const { data: estadoData } = await api.get(`/pagos/estado/${referenciaPago}`);

        if (estadoData.estado === "COMPLETADO" || estadoData.estado === "APROBADO") {
          notif.success("¡Pago realizado exitosamente!");

          const { data: registroData } = await api.post("/auth/registro-empresa", {
            empresaNombre: datosReg.empresaNombre,
            adminNombre: datosReg.adminNombre,
            adminEmail: datosReg.adminEmail,
            adminPassword: datosReg.adminPassword,
            referenciaPago,
            tipoPlan,
            usuariosAdicionales: usuarios,
          });

          setSesion({
            token: registroData.token,
            usuario: registroData.usuario,
            empresa: registroData.empresa,
            sucursales: registroData.sucursales || [],
          });

          localStorage.removeItem("checkout_pending");
          limpiarRegistroDatos();

          notif.success("¡Empresa creada exitosamente!");

          setTimeout(() => {
            navigate("/");
          }, 1500);
        } else if (estadoData.estado === "PENDIENTE") {
          notif.warning("Tu pago aún está procesándose. Por favor espera...");
        } else {
          localStorage.removeItem("checkout_pending");
          notif.error("El pago no fue aprobado. Intenta de nuevo.");
        }
      } catch (error: any) {
        console.error("Error verificando pago:", error);
        notif.error("Error al verificar el estado del pago");
      }
    };

    const timer = setTimeout(verificarPago, 2000);
    return () => clearTimeout(timer);
  }, [setSesion, limpiarRegistroDatos, navigate]);

  const planActual = planes.find((p) => p.tipoPlan === planSeleccionado);
  const montoBase = planActual?.precioFinal || 0;
  const montoAdicional = (planActual?.precioXUsuarioAdicional || 0) * usuariosAdicionales;
  const montoTotal = montoBase + montoAdicional;

  const crearCheckout = async () => {
    if (!planSeleccionado) {
      notif.error("Selecciona un plan");
      return;
    }

    if (isRegistration && !registroDatos) {
      notif.error("Datos de registro incompletos");
      return;
    }

    setProcesando(true);

    try {
      const { data } = await api.post<{ success: boolean; checkout: CheckoutData }>(
        "/checkout/crear",
        {
          tipoPlan: planSeleccionado,
          usuariosAdicionales,
          email: isRegistration ? registroDatos?.adminEmail : "",
          nombre: isRegistration ? registroDatos?.adminNombre : "",
          isRegistration,
        }
      );

      if (data.success && data.checkout) {
        notif.info("Redirigiendo a Wompi...");
        setReferenciaPago(data.checkout.referenciaPago);

        if (isRegistration && registroDatos) {
          localStorage.setItem(
            "checkout_pending",
            JSON.stringify({
              referenciaPago: data.checkout.referenciaPago,
              registroDatos,
              tipoPlan: planSeleccionado,
              usuariosAdicionales,
            })
          );
        }

        setTimeout(() => {
          window.location.href = data.checkout.url;
        }, 1000);
      }
    } catch (error: any) {
      const mensaje = error.response?.data?.error || "Error al procesar pago";
      notif.error(mensaje);
    } finally {
      setProcesando(false);
    }
  };

  const [referenciaPago, setReferenciaPago] = useState<string | null>(null);

  if (cargando) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}>⏳</div>
          <p>Cargando planes...</p>
        </div>
      </div>
    );
  }

  const displayName = isRegistration ? registroDatos?.empresaNombre : "Tu Empresa";
  const displayEmail = isRegistration ? registroDatos?.adminEmail : "";

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Elige tu Plan</h1>
            <p style={styles.subtitle}>Acceso completo a todas las funciones del POS</p>
          </div>
          {isRegistration && onBack && (
            <button onClick={onBack} style={styles.backBtn}>
              ← Volver
            </button>
          )}
        </div>

        {/* Info Usuario */}
        {isRegistration && registroDatos && (
          <div style={styles.infoBox}>
            <div style={styles.infoItem}>
              <span style={styles.label}>Empresa:</span>
              <span style={styles.value}>{displayName}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.label}>Email:</span>
              <span style={styles.value}>{displayEmail}</span>
            </div>
          </div>
        )}

        {/* Planes */}
        <div style={styles.planesGrid}>
          {planes.map((plan) => (
            <div
              key={plan.tipoPlan}
              onClick={() => setPlanSeleccionado(plan.tipoPlan)}
              style={{
                ...styles.planCard,
                ...(planSeleccionado === plan.tipoPlan ? styles.planCardActive : styles.planCardInactive),
              }}
            >
              {plan.tipoPlan === "ANUAL" && <div style={styles.badge}>RECOMENDADO</div>}

              <div style={styles.planHeader}>
                <h3 style={styles.planTitle}>
                  {plan.tipoPlan === "MENSUAL" && "📅 Mensual"}
                  {plan.tipoPlan === "TRIMESTRAL" && "🔄 Trimestral"}
                  {plan.tipoPlan === "ANUAL" && "🎯 Anual"}
                </h3>
                <span style={styles.duracion}>{plan.diasDuracion} días</span>
              </div>

              <div style={styles.planPrecio}>
                <div style={styles.precioActual}>
                  ${plan.precioFinal.toLocaleString("es-CO")}
                </div>
                {plan.descuento > 0 && (
                  <div style={styles.ahorro}>
                    Ahorro: ${plan.descuento.toLocaleString("es-CO")}
                  </div>
                )}
              </div>

              <div style={styles.precioUsuario}>
                ${plan.precioXUsuarioAdicional.toLocaleString("es-CO")}/usuario adicional
              </div>

              <div style={styles.checkmark}>
                {planSeleccionado === plan.tipoPlan && "✓"}
              </div>
            </div>
          ))}
        </div>

        {/* Usuarios Adicionales */}
        {planActual && (
          <div style={styles.usuariosSection}>
            <label style={styles.sectionTitle}>Usuarios Adicionales</label>
            <div style={styles.usuariosControl}>
              <button
                onClick={() => setUsuariosAdicionales(Math.max(0, usuariosAdicionales - 1))}
                style={styles.btnUsuario}
              >
                −
              </button>
              <input
                type="number"
                value={usuariosAdicionales}
                onChange={(e) => setUsuariosAdicionales(Math.max(0, parseInt(e.target.value) || 0))}
                style={styles.inputUsuario}
                min="0"
              />
              <button
                onClick={() => setUsuariosAdicionales(usuariosAdicionales + 1)}
                style={styles.btnUsuario}
              >
                +
              </button>
            </div>
            {usuariosAdicionales > 0 && (
              <p style={styles.precioAdicional}>
                +${montoAdicional.toLocaleString("es-CO")} por usuarios adicionales
              </p>
            )}
          </div>
        )}

        {/* Resumen */}
        <div style={styles.resumenBox}>
          <div style={styles.resumenRow}>
            <span>Plan {planSeleccionado}</span>
            <span>${montoBase.toLocaleString("es-CO")}</span>
          </div>
          {usuariosAdicionales > 0 && (
            <div style={styles.resumenRow}>
              <span>{usuariosAdicionales} usuarios adicionales</span>
              <span>${montoAdicional.toLocaleString("es-CO")}</span>
            </div>
          )}
          <div style={styles.resumenTotal}>
            <strong>Total a pagar</strong>
            <strong>${montoTotal.toLocaleString("es-CO")}</strong>
          </div>
        </div>

        {/* Botón Pagar */}
        <button
          onClick={crearCheckout}
          disabled={procesando || montoTotal === 0}
          style={{
            ...styles.btnPagar,
            ...(procesando || montoTotal === 0 ? styles.btnDisabled : {}),
          }}
        >
          {procesando ? "⏳ Procesando..." : "💳 Pagar con Wompi"}
        </button>

        {/* Features */}
        <div style={styles.features}>
          <h3 style={styles.featuresTitle}>Incluido en tu plan</h3>
          <ul style={styles.featuresList}>
            <li>✓ Módulo de Ventas completo</li>
            <li>✓ Inventario en tiempo real</li>
            <li>✓ Reportes y analytics</li>
            <li>✓ Gestión de clientes</li>
            <li>✓ 2 usuarios base + adicionales</li>
            <li>✓ Soporte por email</li>
          </ul>
        </div>

        {/* Seguridad */}
        <div style={styles.security}>
          <p>💳 <strong>Pago seguro:</strong> Procesado por Wompi con encriptación SSL</p>
          <p>🔒 <strong>Tus datos:</strong> Nunca guardamos información de tarjeta</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "40px 20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  } as React.CSSProperties,

  container: {
    maxWidth: "1000px",
    margin: "0 auto",
    background: "white",
    borderRadius: "20px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
    padding: "50px",
  } as React.CSSProperties,

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "40px",
  } as React.CSSProperties,

  title: {
    fontSize: "32px",
    fontWeight: "700",
    margin: "0 0 8px 0",
    color: "#1a202c",
  } as React.CSSProperties,

  subtitle: {
    fontSize: "16px",
    color: "#718096",
    margin: "0",
  } as React.CSSProperties,

  backBtn: {
    padding: "10px 16px",
    background: "#edf2f7",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    color: "#4a5568",
    fontWeight: "500",
  } as React.CSSProperties,

  infoBox: {
    background: "#f7fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "30px",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
  } as React.CSSProperties,

  infoItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  } as React.CSSProperties,

  label: {
    fontSize: "12px",
    color: "#718096",
    fontWeight: "600",
    textTransform: "uppercase",
  } as React.CSSProperties,

  value: {
    fontSize: "16px",
    color: "#2d3748",
    fontWeight: "600",
  } as React.CSSProperties,

  planesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "20px",
    marginBottom: "40px",
  } as React.CSSProperties,

  planCard: {
    position: "relative",
    padding: "30px 20px",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    border: "2px solid #e2e8f0",
  } as React.CSSProperties,

  planCardActive: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "2px solid #667eea",
    boxShadow: "0 10px 30px rgba(102, 126, 234, 0.3)",
  } as React.CSSProperties,

  planCardInactive: {
    background: "#f7fafc",
    color: "#2d3748",
    border: "2px solid #e2e8f0",
  } as React.CSSProperties,

  badge: {
    position: "absolute",
    top: "-12px",
    right: "20px",
    background: "#48bb78",
    color: "white",
    padding: "4px 12px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: "700",
  } as React.CSSProperties,

  planHeader: {
    marginBottom: "20px",
  } as React.CSSProperties,

  planTitle: {
    fontSize: "18px",
    fontWeight: "700",
    margin: "0 0 8px 0",
  } as React.CSSProperties,

  duracion: {
    fontSize: "13px",
    opacity: 0.8,
  } as React.CSSProperties,

  planPrecio: {
    marginBottom: "15px",
  } as React.CSSProperties,

  precioActual: {
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: "1",
  } as React.CSSProperties,

  ahorro: {
    fontSize: "13px",
    opacity: 0.9,
    marginTop: "4px",
  } as React.CSSProperties,

  precioUsuario: {
    fontSize: "12px",
    opacity: 0.8,
    marginBottom: "15px",
  } as React.CSSProperties,

  checkmark: {
    fontSize: "24px",
    fontWeight: "700",
    textAlign: "center",
  } as React.CSSProperties,

  usuariosSection: {
    background: "#f7fafc",
    padding: "20px",
    borderRadius: "12px",
    marginBottom: "30px",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#2d3748",
    display: "block",
    marginBottom: "15px",
  } as React.CSSProperties,

  usuariosControl: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
  } as React.CSSProperties,

  btnUsuario: {
    padding: "8px 12px",
    background: "white",
    border: "1px solid #cbd5e0",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    color: "#2d3748",
  } as React.CSSProperties,

  inputUsuario: {
    flex: 1,
    padding: "8px 12px",
    border: "1px solid #cbd5e0",
    borderRadius: "6px",
    fontSize: "14px",
    textAlign: "center",
  } as React.CSSProperties,

  precioAdicional: {
    fontSize: "13px",
    color: "#718096",
    marginTop: "10px",
    margin: "10px 0 0 0",
  } as React.CSSProperties,

  resumenBox: {
    background: "#f7fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
  } as React.CSSProperties,

  resumenRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "14px",
    color: "#4a5568",
    marginBottom: "10px",
  } as React.CSSProperties,

  resumenTotal: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "18px",
    fontWeight: "700",
    color: "#1a202c",
    borderTop: "1px solid #cbd5e0",
    paddingTop: "10px",
  } as React.CSSProperties,

  btnPagar: {
    width: "100%",
    padding: "16px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    marginBottom: "30px",
    transition: "transform 0.2s ease",
  } as React.CSSProperties,

  btnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  } as React.CSSProperties,

  features: {
    background: "#f7fafc",
    padding: "20px",
    borderRadius: "12px",
    marginBottom: "20px",
  } as React.CSSProperties,

  featuresTitle: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#2d3748",
    margin: "0 0 12px 0",
  } as React.CSSProperties,

  featuresList: {
    listStyle: "none",
    margin: "0",
    padding: "0",
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "8px",
  } as React.CSSProperties,

  security: {
    fontSize: "13px",
    color: "#718096",
    textAlign: "center",
  } as React.CSSProperties,

  loading: {
    textAlign: "center",
    padding: "60px 20px",
  } as React.CSSProperties,

  spinner: {
    fontSize: "48px",
    marginBottom: "16px",
  } as React.CSSProperties,
};
