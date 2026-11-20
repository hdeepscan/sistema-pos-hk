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

export default function EliminarDatos() {
  const navigate = useNavigate();

  return (
    <>
      <style>{styles}</style>
      <div className="legal-container">
        <div className="legal-header">
          <button className="legal-back-btn" onClick={() => navigate(-1)} title="Volver">
            <ArrowLeft size={20} />
          </button>
          <h1 className="legal-title">Eliminación de datos</h1>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <p>
              CENTRALA (Centrala Colombia SAS) permite a las tiendas conectar su página de Facebook, su cuenta de
              Instagram y su número de WhatsApp para recibir y responder los mensajes de sus clientes. Esta página explica
              cómo pedir que se eliminen esos datos.
            </p>
          </div>

          <div className="legal-section">
            <h2>1. Qué datos guardamos</h2>
            <ul>
              <li>Los datos de la página, cuenta de Instagram o número de WhatsApp conectados, y el permiso (token) para usarlos, guardado cifrado.</li>
              <li>Las conversaciones: el nombre, usuario y foto de perfil públicos de quien escribe, y los mensajes enviados y recibidos.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>2. Si eres una tienda que usa CENTRALA</h2>
            <ul>
              <li>Puedes desconectar tus canales en cualquier momento desde CENTRALA → Mensajes → Canales conectados → Desconectar.</li>
              <li>También puedes quitar el acceso desde Facebook: Configuración → Integraciones comerciales → CENTRALA → Eliminar.</li>
              <li>Para borrar las conversaciones guardadas, escríbenos a <strong>admin@centrala.com.co</strong> desde el correo de tu cuenta.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>3. Si le escribiste a una tienda que usa CENTRALA</h2>
            <p>
              Escribe a <strong>admin@centrala.com.co</strong> con el nombre de la tienda, la red (Facebook, Instagram o
              WhatsApp) y tu nombre de usuario o número. Eliminaremos tus mensajes y datos de perfil en un máximo de 30 días
              y te confirmaremos por correo cuando esté hecho.
            </p>
          </div>

          <div className="legal-footer">Última actualización: 20 de noviembre de 2026</div>
        </div>
      </div>
    </>
  );
}
