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

export default function PoliticaPrivacidad() {
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
          <h1 className="legal-title">Política de Privacidad</h1>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <h2>1. Introducción</h2>
            <p>
              En CENTRALA, nos comprometemos a proteger tu privacidad y garantizar que comprendas cómo utilizamos tu información personal. Esta Política de Privacidad explica nuestras prácticas de recopilación, uso y protección de datos.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. Información que Recopilamos</h2>
            <p>Recopilamos información de varias formas:</p>
            <ul>
              <li><strong>Información de Registro:</strong> Nombre, correo electrónico, empresa, teléfono y contraseña.</li>
              <li><strong>Información de Transacciones:</strong> Detalles de ventas, compras, inventario y datos financieros.</li>
              <li><strong>Información de Dispositivo:</strong> Dirección IP, tipo de navegador, sistema operativo, zona horaria e idioma.</li>
              <li><strong>Información de Cookies:</strong> Identificadores únicos y datos de navegación para mejorar tu experiencia.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>3. Cómo Utilizamos Tu Información</h2>
            <p>Utilizamos tu información para:</p>
            <ul>
              <li>Proporcionar, mantener y mejorar nuestros servicios.</li>
              <li>Procesar transacciones y enviar información relacionada.</li>
              <li>Personalizar tu experiencia y contenido.</li>
              <li>Comunicarnos contigo sobre actualizaciones, cambios de servicio y soporte técnico.</li>
              <li>Cumplir con obligaciones legales y regulatorias.</li>
              <li>Detectar, prevenir y abordar fraude, seguridad o problemas técnicos.</li>
              <li>Analizar tendencias y uso de nuestros servicios.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>4. Compartición de Información</h2>
            <p>
              No vendemos, intercambiamos ni alquilamos tu información personal a terceros. Podemos compartir información en los siguientes casos:
            </p>
            <ul>
              <li><strong>Proveedores de Servicios:</strong> Socios técnicos que nos ayudan a operar (servidores de correo, análisis, almacenamiento).</li>
              <li><strong>Requisitos Legales:</strong> Si así lo requiere la ley o una autoridad competente.</li>
              <li><strong>Protección de Derechos:</strong> Para proteger la seguridad y derechos de nuestros usuarios.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>5. Seguridad de Datos</h2>
            <p>
              Implementamos medidas técnicas y organizativas robustas para proteger tu información personal contra acceso no autorizado, alteración, divulgación o destrucción. Utilizamos cifrado SSL/TLS, autenticación de dos factores y acceso limitado a datos sensibles.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Retención de Datos</h2>
            <p>
              Retenemos tu información personal solo durante el tiempo que sea necesario para proporcionar nuestros servicios o cumplir con obligaciones legales. Puedes solicitar la eliminación de tu cuenta en cualquier momento.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Tus Derechos</h2>
            <p>Tienes derecho a:</p>
            <ul>
              <li>Acceder a tu información personal.</li>
              <li>Corregir información inexacta.</li>
              <li>Solicitar la eliminación de tu cuenta.</li>
              <li>Obtener una copia de tus datos.</li>
              <li>Retirar tu consentimiento en cualquier momento.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>8. Contacto</h2>
            <p>
              Para consultas sobre privacidad, contacta: <strong>privacy@centrala.local</strong>
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Cambios en Esta Política</h2>
            <p>
              Nos reservamos el derecho de actualizar esta política en cualquier momento. Los cambios significativos se notificarán por correo electrónico.
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
