import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const styles = `
  .legal-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  .legal-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
  }

  .legal-back-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .legal-back-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .legal-title {
    font-size: 32px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 24px;
  }

  .legal-content {
    background: white;
    border-radius: 12px;
    padding: 32px;
    border: 1px solid #e2e8f0;
    line-height: 1.8;
    color: #1e293b;
  }

  .legal-section {
    margin-bottom: 32px;
  }

  .legal-section h2 {
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 12px;
  }

  .legal-section p {
    margin-bottom: 12px;
    color: #475569;
  }

  .legal-section ul {
    margin-left: 20px;
    margin-bottom: 12px;
  }

  .legal-section li {
    margin-bottom: 8px;
    color: #475569;
  }

  .legal-footer {
    text-align: center;
    margin-top: 40px;
    padding-top: 24px;
    border-top: 1px solid #e2e8f0;
    color: #94a3b8;
    font-size: 13px;
  }
`;

export default function TerminosCondiciones() {
  const navigate = useNavigate();

  return (
    <>
      <style>{styles}</style>
      <div className="legal-container">
        <div className="legal-header">
          <button
            className="legal-back-btn"
            onClick={() => navigate(-1)}
            title="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="legal-title">Términos y Condiciones</h1>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <h2>1. Aceptación de Términos</h2>
            <p>
              Al acceder y utilizar CENTRALA, aceptas estar vinculado por estos Términos y Condiciones. Si no estás de acuerdo con alguna parte de estos términos, no debes utilizar el servicio.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. Descripción del Servicio</h2>
            <p>
              CENTRALA es una plataforma de gestión de punto de venta (POS) que permite a los usuarios administrar ventas, inventario, clientes y reportes. El servicio se proporciona "tal cual" sin garantías explícitas.
            </p>
          </div>

          <div className="legal-section">
            <h2>3. Registro de Cuenta</h2>
            <p>Para utilizar nuestros servicios, debes:</p>
            <ul>
              <li>Ser mayor de 18 años o tener consentimiento parental.</li>
              <li>Proporcionar información precisa y completa.</li>
              <li>Mantener la confidencialidad de tu contraseña.</li>
              <li>Aceptar responsabilidad por todas las actividades bajo tu cuenta.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>4. Uso Permitido</h2>
            <p>Aceptas utilizar CENTRALA solo para propósitos legales y de acuerdo con estos términos. No debes:</p>
            <ul>
              <li>Acceder sin autorización a sistemas o datos.</li>
              <li>Interferir con la operación del servicio.</li>
              <li>Violar leyes, derechos de terceros o políticas de CENTRALA.</li>
              <li>Intentar hackear, malware o cualquier actividad maliciosa.</li>
              <li>Usar el servicio para actividades ilegales o fraudulentas.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>5. Propiedad Intelectual</h2>
            <p>
              Todos los contenidos de CENTRALA (código, diseño, logos, textos) son propiedad intelectual nuestra. No puedes copiar, modificar o distribuir sin autorización escrita.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Limitación de Responsabilidad</h2>
            <p>
              CENTRALA no es responsable por daños indirectos, incidentales, especiales o consecuentes derivados del uso o incapacidad de usar nuestros servicios, incluso si hemos sido informados de la posibilidad de tales daños.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Disponibilidad del Servicio</h2>
            <p>
              CENTRALA se proporciona "tal cual" sin garantía de disponibilidad continua. No somos responsables por interrupciones, caídas o mantenimiento del servicio.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Planes y Precios</h2>
            <p>
              Los precios y planes pueden cambiar en cualquier momento. Te notificaremos de cambios significativos con anticipación. El acceso continuo al servicio tras cambios implica aceptación.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Suspensión y Terminación</h2>
            <p>
              Nos reservamos el derecho de suspender o cancelar tu cuenta si violaas estos términos, no pagas tu suscripción o si hay actividad maliciosa.
            </p>
          </div>

          <div className="legal-section">
            <h2>10. Ley Aplicable</h2>
            <p>
              Estos términos se rigen por la ley aplicable. Cualquier disputa se resolverá en los tribunales competentes.
            </p>
          </div>

          <div className="legal-section">
            <h2>11. Cambios en Estos Términos</h2>
            <p>
              Podemos actualizar estos términos en cualquier momento. Los cambios entran en vigor cuando se publican. Tu uso continuado del servicio implica aceptación de los cambios.
            </p>
          </div>

          <div className="legal-footer">
            Última actualización: 24 de septiembre de 2026
          </div>
        </div>
      </div>
    </>
  );
}
