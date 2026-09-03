import { useSesionStore } from "../lib/store";
import { useNavigate } from "react-router-dom";

const overlayStyles = `
  .license-block-overlay {
    position: fixed;
    inset: 0;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.95) 100%);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 16px;
  }

  .license-block-content {
    background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
    border-radius: 24px;
    padding: 56px 48px;
    max-width: 520px;
    width: 100%;
    text-align: center;
    box-shadow:
      0 20px 25px rgba(0, 0, 0, 0.15),
      0 0 1px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.5);
    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .license-block-icon-container {
    width: 80px;
    height: 80px;
    margin: 0 auto 32px;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 16px rgba(239, 68, 68, 0.3);
    position: relative;
  }

  .license-block-icon-container::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.2), transparent);
  }

  .license-block-icon {
    font-size: 40px;
    z-index: 1;
  }

  .license-block-title {
    font-size: 32px;
    font-weight: 800;
    color: #1f2937;
    margin-bottom: 16px;
    letter-spacing: -0.5px;
  }

  .license-block-company {
    font-size: 16px;
    color: #6b7280;
    margin-bottom: 24px;
    line-height: 1.6;
  }

  .license-block-company strong {
    color: #1f2937;
    font-weight: 600;
  }

  .license-block-expired-date {
    font-size: 15px;
    color: #dc2626;
    font-weight: 700;
    margin-bottom: 32px;
    padding: 16px 20px;
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    border-radius: 12px;
    border: 1px solid #fca5a5;
  }

  .license-block-warning {
    font-size: 15px;
    color: #7f1d1d;
    margin-bottom: 32px;
    line-height: 1.6;
    background: rgba(127, 29, 29, 0.05);
    padding: 16px;
    border-radius: 12px;
    border-left: 4px solid #dc2626;
  }

  .license-block-buttons {
    display: flex;
    gap: 12px;
    flex-direction: column;
    margin-bottom: 8px;
  }

  .license-block-primary-btn,
  .license-block-secondary-btn {
    padding: 16px 24px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .license-block-primary-btn {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
    box-shadow: 0 8px 16px rgba(34, 197, 94, 0.3);
  }

  .license-block-primary-btn:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(34, 197, 94, 0.4);
  }

  .license-block-primary-btn:active {
    transform: translateY(-1px);
  }

  .license-block-secondary-btn {
    background: #f3f4f6;
    color: #374151;
    border: 2px solid #e5e7eb;
  }

  .license-block-secondary-btn:hover {
    background: #e5e7eb;
    border-color: #d1d5db;
  }

  .license-block-footer {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
    color: #9ca3af;
  }

  .license-block-footer a {
    color: #3b82f6;
    text-decoration: none;
    font-weight: 600;
    transition: color 0.2s;
  }

  .license-block-footer a:hover {
    color: #2563eb;
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
          {/* Icon - Sin Emoji */}
          <div className="license-block-icon-container">
            <svg className="license-block-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" fill="white" />
            </svg>
          </div>

          {/* Title */}
          <h1 className="license-block-title">
            Suscripción Vencida
          </h1>

          {/* Company Message */}
          <p className="license-block-company">
            Tu suscripción a <strong>{empresa.nombre}</strong> ha expirado
          </p>

          {/* Expired Date */}
          <div className="license-block-expired-date">
            Vencida desde: <strong>{fechaFormato}</strong>
          </div>

          {/* Warning */}
          <div className="license-block-warning">
            ⚠️ No puedes registrar ventas, modificar inventario ni realizar cambios hasta renovar tu suscripción.
          </div>

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
            ¿Preguntas? Contacta a{" "}
            <a href="mailto:soporte@pos-hk.com">soporte@pos-hk.com</a>
          </div>
        </div>
      </div>
    </>
  );
}
