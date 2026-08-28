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
  const { empresa, usuario, registroDatos, setSesion, limpiarRegistroDatos } = useSesionStore();
  const apiBaseUrl = useSesionStore((s) => s.apiBaseUrl);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [planSeleccionado, setPlanSeleccionado] = useState<string>("MENSUAL");
  const [usuariosAdicionales, setUsuariosAdicionales] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [referenciaPago, setReferenciaPago] = useState<string | null>(null);

  // Cargar planes
  useEffect(() => {
    api
      .get("/pagos/planes")
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

  // Verificar si volvemos de un pago pendiente (después de volver de Wompi)
  useEffect(() => {
    const checkoutPending = localStorage.getItem("checkout_pending");
    if (!checkoutPending) return;

    const verificarPago = async () => {
      try {
        const pending = JSON.parse(checkoutPending);
        const { referenciaPago, registroDatos: datosReg, tipoPlan, usuariosAdicionales: usuarios } = pending;

        // Verificar estado del pago
        const { data: estadoData } = await api.get(`/pagos/estado/${referenciaPago}`);

        if (estadoData.estado === "COMPLETADO" || estadoData.estado === "APROBADO") {
          notif.success("¡Pago realizado exitosamente!");

          // Crear la empresa ahora
          const { data: registroData } = await api.post("/auth/registro-empresa", {
            empresaNombre: datosReg.empresaNombre,
            adminNombre: datosReg.adminNombre,
            adminEmail: datosReg.adminEmail,
            adminPassword: datosReg.adminPassword,
            referenciaPago,
            tipoPlan,
            usuariosAdicionales: usuarios,
          });

          // Establecer sesión
          setSesion({
            token: registroData.token,
            usuario: registroData.usuario,
            empresa: registroData.empresa,
            sucursales: registroData.sucursales || [],
          });

          // Limpiar estado
          localStorage.removeItem("checkout_pending");
          limpiarRegistroDatos();

          notif.success("¡Empresa creada exitosamente!");

          // Redirigir al POS (el App component va a gestionar esto)
          // Esperar un momento para que se vea la notificación
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

    // Esperar un poco para que el webhook se procese
    const timer = setTimeout(verificarPago, 2000);
    return () => clearTimeout(timer);
  }, [setSesion, limpiarRegistroDatos, navigate]);

  // Obtener plan seleccionado
  const planActual = planes.find((p) => p.tipoPlan === planSeleccionado);

  // Calcular monto
  const montoBase = planActual?.precioFinal || 0;
  const montoAdicional = (planActual?.precioXUsuarioAdicional || 0) * usuariosAdicionales;
  const montoTotal = montoBase + montoAdicional;

  // Crear checkout
  const crearCheckout = async () => {
    if (!planSeleccionado) {
      notif.error("Selecciona un plan");
      return;
    }

    // En modo registro, validar que tengamos datos
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
          // En modo registro, enviar datos del store
          email: isRegistration ? registroDatos?.adminEmail : usuario?.email,
          nombre: isRegistration ? registroDatos?.adminNombre : usuario?.nombre,
          // Opcional: identificar que es un registro
          isRegistration,
        }
      );

      if (data.success && data.checkout) {
        notif.info("Redirigiendo a Wompi...");
        setReferenciaPago(data.checkout.referenciaPago);

        // Guardar info de pago en localStorage para verificar después
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

        // Redirigir a Wompi después de 1 segundo
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

  if (cargando) {
    return (
      <div className="checkout-page">
        <div className="checkout-loading">
          <div className="spinner">⏳</div>
          <p>Cargando planes...</p>
        </div>
      </div>
    );
  }

  const displayName = isRegistration ? registroDatos?.empresaNombre : empresa?.nombre;
  const displayEmail = isRegistration ? registroDatos?.adminEmail : usuario?.email;

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        {/* Header con botón volver */}
        {isRegistration && onBack && (
          <button
            onClick={onBack}
            className="secondary"
            style={{ marginBottom: 16, alignSelf: "flex-start" }}
          >
            ← Volver
          </button>
        )}

        {/* Header */}
        <div className="checkout-header">
          <h1>Selecciona tu Plan</h1>
          <p>Acceso a todos los módulos del POS</p>
          <div className="checkout-empresa-info">
            <strong>{displayName}</strong>
            <span>{displayEmail}</span>
          </div>
        </div>

        {/* Planes */}
        <div className="checkout-planes">
          {planes.map((plan) => (
            <div
              key={plan.tipoPlan}
              className={`checkout-plan ${planSeleccionado === plan.tipoPlan ? "activo" : ""}`}
              onClick={() => setPlanSeleccionado(plan.tipoPlan)}
              style={{ cursor: "pointer" }}
            >
              <div className="plan-nombre">
                {plan.tipoPlan === "MENSUAL" && "📅 Mensual"}
                {plan.tipoPlan === "TRIMESTRAL" && "🔄 Trimestral"}
                {plan.tipoPlan === "ANUAL" && "🎯 Anual (Recomendado)"}
              </div>

              <div className="plan-duracion">{plan.diasDuracion} días</div>

              <div className="plan-precio">
                <div className="precio-actual">
                  ${plan.precioFinal.toLocaleString("es-CO")}
                </div>
                {plan.descuento > 0 && (
                  <div className="plan-descuento">
                    Ahorro: ${plan.descuento.toLocaleString("es-CO")}
                  </div>
                )}
              </div>

              <div className="plan-usuario-adicional">
                ${plan.precioXUsuarioAdicional.toLocaleString("es-CO")} por usuario adicional
              </div>

              <div className="plan-check">
                {planSeleccionado === plan.tipoPlan && "✓"}
              </div>
            </div>
          ))}
        </div>

        {/* Usuarios adicionales */}
        {planActual && (
          <div className="checkout-usuarios">
            <label>Usuarios adicionales</label>
            <div className="usuarios-control">
              <button
                onClick={() => setUsuariosAdicionales(Math.max(0, usuariosAdicionales - 1))}
                className="usuario-btn"
              >
                −
              </button>
              <input
                type="number"
                value={usuariosAdicionales}
                onChange={(e) =>
                  setUsuariosAdicionales(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="usuario-input"
                min="0"
              />
              <button
                onClick={() => setUsuariosAdicionales(usuariosAdicionales + 1)}
                className="usuario-btn"
              >
                +
              </button>
            </div>
            <p className="usuarios-precio">
              {usuariosAdicionales > 0 && (
                <>
                  +${montoAdicional.toLocaleString("es-CO")} por usuarios adicionales
                </>
              )}
            </p>
          </div>
        )}

        {/* Resumen */}
        <div className="checkout-resumen">
          <div className="resumen-row">
            <span>Plan {planSeleccionado}</span>
            <span>${montoBase.toLocaleString("es-CO")}</span>
          </div>
          {usuariosAdicionales > 0 && (
            <div className="resumen-row">
              <span>{usuariosAdicionales} usuarios adicionales</span>
              <span>${montoAdicional.toLocaleString("es-CO")}</span>
            </div>
          )}
          <div className="resumen-row total">
            <strong>Total</strong>
            <strong>${montoTotal.toLocaleString("es-CO")}</strong>
          </div>
        </div>

        {/* Botones */}
        <div className="checkout-acciones">
          <button
            className="btn-pagar"
            onClick={crearCheckout}
            disabled={procesando || montoTotal === 0}
          >
            {procesando ? (
              <>
                <span className="spinner-mini">⏳</span> Procesando...
              </>
            ) : (
              <>💳 Pagar con Wompi</>
            )}
          </button>
        </div>

        {/* Características incluidas */}
        <div className="checkout-features">
          <h3>Lo que incluye tu plan</h3>
          <ul className="features-list">
            <li>✓ Módulo de Ventas completo</li>
            <li>✓ Inventario en tiempo real</li>
            <li>✓ Reportes y analytics</li>
            <li>✓ Clientes y puntos de fidelización</li>
            <li>✓ Usuarios (2 base + adicionales)</li>
            <li>✓ Soporte por email</li>
          </ul>
        </div>

        {/* Protección de datos */}
        <div className="checkout-security">
          <p>
            💳 <strong>Pago seguro:</strong> Procesado por Wompi con encriptación SSL
          </p>
          <p>
            🔒 <strong>Tus datos:</strong> Nunca guardamos información de tarjeta
          </p>
        </div>
      </div>
    </div>
  );
}
