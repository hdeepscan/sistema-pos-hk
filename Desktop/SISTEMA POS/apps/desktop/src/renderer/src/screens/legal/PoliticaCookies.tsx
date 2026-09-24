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

  .cookie-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }

  .cookie-table th, .cookie-table td {
    border: 1px solid #e2e8f0;
    padding: 12px;
    text-align: left;
    color: #475569;
  }

  .cookie-table th {
    background: #f8fafc;
    font-weight: 700;
    color: #0f172a;
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

export default function PoliticaCookies() {
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
          <h1 className="legal-title">Política de Cookies</h1>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <h2>1. ¿Qué son las Cookies?</h2>
            <p>
              Las cookies son pequeños archivos de texto almacenados en tu dispositivo cuando visitas un sitio web. Utilizamos cookies para mejorar tu experiencia, recordar preferencias y analizar el uso de nuestro servicio.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. Tipos de Cookies Utilizadas</h2>
            <p>Utilizamos los siguientes tipos de cookies:</p>
            <ul>
              <li><strong>Cookies Esenciales:</strong> Necesarias para el funcionamiento de CENTRALA (autenticación, seguridad).</li>
              <li><strong>Cookies de Preferencia:</strong> Recuerdan tus preferencias (idioma, tema oscuro/claro).</li>
              <li><strong>Cookies de Análisis:</strong> Nos ayudan a entender cómo usas el servicio para mejorarlo.</li>
              <li><strong>Cookies de Publicidad:</strong> Personalizan contenido y publicidad según tu interés.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>3. Tabla de Cookies</h2>
            <table className="cookie-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Propósito</th>
                  <th>Duración</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>auth_token</td>
                  <td>Esencial</td>
                  <td>Almacena el token JWT de autenticación</td>
                  <td>24 horas / Sesión</td>
                </tr>
                <tr>
                  <td>tema</td>
                  <td>Preferencia</td>
                  <td>Recuerda tu preferencia de tema (claro/oscuro)</td>
                  <td>1 año</td>
                </tr>
                <tr>
                  <td>idioma</td>
                  <td>Preferencia</td>
                  <td>Almacena tu idioma preferido</td>
                  <td>1 año</td>
                </tr>
                <tr>
                  <td>_ga</td>
                  <td>Análisis</td>
                  <td>Google Analytics - Número identificador único</td>
                  <td>2 años</td>
                </tr>
                <tr>
                  <td>_gid</td>
                  <td>Análisis</td>
                  <td>Google Analytics - Identificador de sesión</td>
                  <td>24 horas</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="legal-section">
            <h2>4. Consentimiento de Cookies</h2>
            <p>
              <strong>REQUERIMIENTO LEGAL:</strong> De acuerdo con la LSSI-CE (Ley de Sociedad de la Información) y RGPD, necesitamos tu consentimiento explícito antes de almacenar cookies no esenciales. Un banner de cookies aparecerá la primera vez que visites CENTRALA con opciones para "Aceptar" o "Rechazar".
            </p>
            <ul>
              <li><strong>Cookies Esenciales:</strong> Se activan automáticamente (no requieren consentimiento).</li>
              <li><strong>Cookies No Esenciales:</strong> Requieren tu consentimiento explícito.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>5. Gestión de Cookies</h2>
            <p>Puedes gestionar tus preferencias de cookies de varias formas:</p>
            <ul>
              <li>A través del banner de cookies que aparece al visitar el sitio.</li>
              <li>Configurando tu navegador para rechazar cookies (nota: esto puede afectar la funcionalidad).</li>
              <li>Eliminando manualmente las cookies de tu dispositivo a través de la configuración del navegador.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>6. Cookies de Terceros</h2>
            <p>
              CENTRALA puede integrar herramientas de terceros (Google Analytics, Resend para emails) que pueden almacenar sus propias cookies. No tenemos control total sobre estas, pero monitoreamos su cumplimiento legal.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Tu Derecho a Retirar Consentimiento</h2>
            <p>
              Puedes retirar tu consentimiento de cookies en cualquier momento visitando la configuración de cookies o eliminando las cookies de tu navegador. Los cambios entran en vigor inmediatamente.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Cambios en Esta Política</h2>
            <p>
              Nos reservamos el derecho de actualizar esta política. Los cambios significativos se comunicarán a través de un nuevo banner de cookies.
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
