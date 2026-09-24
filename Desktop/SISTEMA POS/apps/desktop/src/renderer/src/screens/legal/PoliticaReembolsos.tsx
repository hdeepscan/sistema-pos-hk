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

  .info-box {
    background: #f0f9ff;
    border-left: 4px solid #0ea5e9;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 12px;
    color: #0369a1;
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

export default function PoliticaReembolsos() {
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
          <h1 className="legal-title">Política de Reembolsos</h1>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <h2>1. Derecho a Reembolso</h2>
            <p>
              CENTRALA ofrece una garantía de satisfacción. Si no estás completamente satisfecho con nuestro servicio, tienes derecho a solicitar un reembolso dentro de los términos establecidos en esta política.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. Período de Reembolso</h2>
            <div className="info-box">
              <strong>Período: 30 días desde la fecha de compra o primer pago</strong>
            </div>
            <p>
              Puedes solicitar un reembolso completo dentro de los primeros 30 días naturales desde que adquieres tu suscripción o plan. Después de este período, no se permiten reembolsos.
            </p>
          </div>

          <div className="legal-section">
            <h2>3. Condiciones para Reembolso</h2>
            <p>Para ser elegible para un reembolso, debes:</p>
            <ul>
              <li>Solicitar el reembolso dentro del período de 30 días.</li>
              <li>No haber realizado más de 5 transacciones importantes en el sistema (excepto en pruebas).</li>
              <li>Estar cumpliendo con los Términos y Condiciones (sin violaciones de seguridad o fraude).</li>
              <li>Proporcionar una razón clara para el reembolso.</li>
              <li>No haber utilizado herramientas premium más allá de pruebas funcionales.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>4. Exclusiones de Reembolso</h2>
            <p>No se otorgarán reembolsos en los siguientes casos:</p>
            <ul>
              <li>Solicitud realizada después de 30 días desde la compra.</li>
              <li>Planes anuales después de 60 días de compra (se ofrece cambio de plan como alternativa).</li>
              <li>Uso extensivo del servicio (cientos de transacciones, miles de usuarios).</li>
              <li>Acciones que resulten de uso incorrecto o no autorizado.</li>
              <li>Cambios en los requisitos de negocio del usuario.</li>
              <li>Fallos atribuibles a terceros (proveedor de internet, hardware del cliente).</li>
              <li>Violación de estos términos o Términos y Condiciones.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>5. Proceso de Solicitud</h2>
            <p>Para solicitar un reembolso:</p>
            <ol style={{ marginLeft: "20px" }}>
              <li style={{ marginBottom: "8px" }}>Envía un correo a <strong>reembolsos@centrala.local</strong> con el asunto "Solicitud de Reembolso".</li>
              <li style={{ marginBottom: "8px" }}>Incluye tu nombre de usuario, correo asociado a la cuenta y razón del reembolso.</li>
              <li style={{ marginBottom: "8px" }}>Nuestro equipo revisará tu solicitud dentro de 5 días hábiles.</li>
              <li style={{ marginBottom: "8px" }}>Si es aprobada, procesaremos el reembolso en 7-10 días hábiles.</li>
            </ol>
          </div>

          <div className="legal-section">
            <h2>6. Forma de Reembolso</h2>
            <p>
              Los reembolsos se realizarán al método de pago original. Si el pago fue con tarjeta de crédito, el reembolso aparecerá en tu estado de cuenta bancario en 7-14 días hábiles. Si fue transferencia, se procesará de la misma manera.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Alternativas a Reembolso</h2>
            <p>
              Si tu solicitud no es elegible para reembolso pero aún tienes problemas, podemos ofrecer:
            </p>
            <ul>
              <li>Extensión gratuita del servicio por 1 mes.</li>
              <li>Cambio a un plan diferente sin costo de cambio.</li>
              <li>Crédito de cuenta para usar en futuras suscripciones.</li>
              <li>Sesión de soporte técnico prioritario.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>8. Cancelación de Cuenta</h2>
            <p>
              Puedes cancelar tu suscripción en cualquier momento desde la configuración de tu cuenta. La cancelación entra en vigor al final del período de facturación actual. No se ofrecen reembolsos prorrateados por períodos incompletos después de 30 días.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Disputas y Reclamaciones</h2>
            <p>
              Si consideras que tu solicitud de reembolso fue rechazada injustamente, puedes presentar una reclamación formal enviando evidencia adicional a <strong>legal@centrala.local</strong>. Revisaremos tu caso en 10 días hábiles.
            </p>
          </div>

          <div className="legal-section">
            <h2>10. Cambios en Esta Política</h2>
            <p>
              Nos reservamos el derecho de modificar esta política. Los cambios se notificarán con 30 días de anticipación. Tu continuación con el servicio implica aceptación de los nuevos términos.
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
