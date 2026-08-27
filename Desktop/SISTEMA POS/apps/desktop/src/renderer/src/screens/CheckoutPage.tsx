import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { notif } from "../lib/notificationService";
import { useSesionStore } from "../lib/store";

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

export default function CheckoutPage() {
  const { empresa, usuario } = useSesionStore();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [planSeleccionado, setPlanSeleccionado] = useState<string>("MENSUAL");
  const [usuariosAdicionales, setUsuariosAdicionales] = useState(0);
  const [procesando, setProcesando] = useState(false);

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

    setProcesando(true);

    try {
      const { data } = await api.post<{ success: boolean; checkout: CheckoutData }>(
        "/checkout/crear",
        {
          tipoPlan: planSeleccionado,
          usuariosAdicionales,
          empresaId,
          email: usuario?.email,
          nombre: usuario?.nombre,
        }
      );

      if (data.success && data.checkout) {
        notif.info("Redirigiendo a Wompi...");

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

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        {/* Header */}
        <div className="checkout-header">
          <h1>Selecciona tu Plan</h1>
          <p>Acceso a todos los módulos del POS</p>
          <div className="checkout-empresa-info">
            <strong>{empresa?.nombre}</strong>
            <span>{usuario?.email}</span>
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
