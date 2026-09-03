import { useSesionStore } from "../lib/store";
import { useNavigate } from "react-router-dom";

const overlayStyles = `
  .license-block-overlay {
    position: fixed;
    inset: 0;
    background: linear-gradient(135deg, #1a0000 0%, #0a2a0a 50%, #000a1a 100%);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 16px;
    overflow: hidden;
  }

  .license-block-overlay::before {
    content: '';
    position: absolute;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%);
    border-radius: 50%;
    top: -200px;
    right: -200px;
    pointer-events: none;
  }

  .license-block-overlay::after {
    content: '';
    position: absolute;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(34, 197, 94, 0.1) 0%, transparent 70%);
    border-radius: 50%;
    bottom: -150px;
    left: -150px;
    pointer-events: none;
  }

  .license-block-content {
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(25px);
    border-radius: 24px;
    padding: 56px 48px;
    max-width: 520px;
    width: 100%;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08);
    animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    z-index: 10;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(40px);
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
    box-shadow: 0 12px 24px rgba(239, 68, 68, 0.4);
    position: relative;
  }

  .license-block-icon-container::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 50%);
  }

  .license-block-icon {
    font-size: 40px;
    z-index: 1;
  }

  .license-block-title {
    font-size: 36px;
    font-weight: 800;
    background: linear-gradient(135deg, #ffffff 0%, #e0f2fe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 16px;
    letter-spacing: -0.8px;
  }

  .license-block-company {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 24px;
    line-height: 1.6;
  }

  .license-block-company strong {
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
  }

  .license-block-expired-date {
    font-size: 15px;
    color: #fca5a5;
    font-weight: 700;
    margin-bottom: 32px;
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%);
    border-radius: 12px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    backdrop-filter: blur(10px);
  }

  .license-block-warning {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 32px;
    line-height: 1.6;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%);
    padding: 16px;
    border-radius: 12px;
    border-left: 4px solid #ef4444;
    backdrop-filter: blur(10px);
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
    font-size: 14px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    position: relative;
    overflow: hidden;
  }

  .license-block-primary-btn {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
    box-shadow: 0 8px 20px rgba(34, 197, 94, 0.4);
  }

  .license-block-primary-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    animation: shine 3s infinite;
  }

  @keyframes shine {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .license-block-primary-btn:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 30px rgba(34, 197, 94, 0.5);
    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  }

  .license-block-primary-btn:active {
    transform: translateY(-1px);
  }

  .license-block-secondary-btn {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
    border: 2px solid rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
  }

  .license-block-secondary-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .license-block-footer {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .license-block-footer a {
    color: #86efac;
    text-decoration: none;
    font-weight: 600;
    transition: color 0.2s;
  }

  .license-block-footer a:hover {
    color: #22c55e;
    text-decoration: underline;
  }

  @media (max-width: 480px) {
    .license-block-content {
      padding: 40px 28px;
    }

    .license-block-title {
      font-size: 28px;
    }

    .license-block-primary-btn,
    .license-block-secondary-btn {
      padding: 14px 20px;
      font-size: 13px;
    }
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
