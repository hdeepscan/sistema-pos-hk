import { useSesionStore } from "../lib/store";
import { useNavigate } from "react-router-dom";

const overlayStyles = `
  .license-block-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .license-block-content {
    background: white;
    border-radius: 16px;
    padding: 48px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .license-block-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 24px;
    background: #fef2f2;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
  }

  .license-block-title {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 12px;
  }

  .license-block-message {
    font-size: 16px;
    color: #6b7280;
    margin-bottom: 12px;
    line-height: 1.6;
  }

  .license-block-expired-date {
    font-size: 14px;
    color: #dc2626;
    font-weight: 600;
    margin-bottom: 32px;
    padding: 12px;
    background: #fee2e2;
    border-radius: 8px;
  }

  .license-block-buttons {
    display: flex;
    gap: 12px;
    flex-direction: column;
  }

  .license-block-primary-btn,
  .license-block-secondary-btn {
    padding: 14px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .license-block-primary-btn {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
  }

  .license-block-primary-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
  }

  .license-block-secondary-btn {
    background: #f3f4f6;
    color: #374151;
  }

  .license-block-secondary-btn:hover {
    background: #e5e7eb;
  }

  .license-block-footer {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
    font-size: 12px;
    color: #9ca3af;
  }

  .license-block-footer a {
    color: #3b82f6;
    text-decoration: none;
    font-weight: 600;
  }

  .license-block-footer a:hover {
    text-decoration: underline;
  }
`;

export function LicenseBlockOverlay() {
  const navigate = useNavigate();
  const empresa = useSesionStore((s) => s.empresa);

  // Verificar si la licencia está vencida
  if (!empresa?.fechaVencimiento) {
    return null; // Sin fecha de vencimiento, no mostrar bloqueo
  }

  const ahora = new Date();
  const fechaVencimiento = new Date(empresa.fechaVencimiento);
  const licenciaVencida = ahora > fechaVencimiento;

  if (!licenciaVencida) {
    return null; // Licencia vigente, no mostrar nada
  }

  // Formatear fecha
  const fechaFormato = fechaVencimiento.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleRenovar = () => {
    navigate("/checkout");
  };

  const handleLogout = () => {
    useSesionStore.setState({
      token: null,
      usuario: null,
      empresa: null,
      sucursales: [],
      sucursalActivaId: null,
    });
  };

  return (
    <>
      <style>{overlayStyles}</style>
      <div className="license-block-overlay">
        <div className="license-block-content">
          {/* Icon */}
          <div className="license-block-icon">⏰</div>

          {/* Title */}
          <h1 className="license-block-title">
            Licencia Expirada
          </h1>

          {/* Message */}
          <p className="license-block-message">
            Tu suscripción a <strong>{empresa.nombre}</strong> ha expirado.
          </p>

          {/* Expired Date */}
          <div className="license-block-expired-date">
            Vencida desde: <strong>{fechaFormato}</strong>
          </div>

          {/* Warning */}
          <p className="license-block-message" style={{ color: "#dc2626", marginBottom: "24px" }}>
            No puedes registrar ventas, modificar inventario ni realizar cambios hasta renovar tu suscripción.
          </p>

          {/* Actions */}
          <div className="license-block-buttons">
            <button
              type="button"
              className="license-block-primary-btn"
              onClick={handleRenovar}
            >
              Renovar Suscripción
            </button>
            <button
              type="button"
              className="license-block-secondary-btn"
              onClick={handleLogout}
            >
              Cerrar Sesión
            </button>
          </div>

          {/* Footer */}
          <div className="license-block-footer">
            Si tienes preguntas, contacta a{" "}
            <a href="mailto:soporte@pos-hk.com">soporte@pos-hk.com</a>
          </div>
        </div>
      </div>
    </>
  );
}
