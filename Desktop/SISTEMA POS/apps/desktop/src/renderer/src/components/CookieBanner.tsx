import { useEffect, useState } from "react";
import { X } from "lucide-react";

const styles = `
  .cookie-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: white;
    padding: 24px 20px;
    z-index: 999;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(100px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .cookie-container {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
  }

  .cookie-content {
    flex: 1;
    min-width: 280px;
  }

  .cookie-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .cookie-description {
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .cookie-links {
    font-size: 12px;
  }

  .cookie-links a {
    color: #93c5fd;
    text-decoration: none;
    margin-right: 16px;
    transition: color 0.2s;
  }

  .cookie-links a:hover {
    color: #bfdbfe;
    text-decoration: underline;
  }

  .cookie-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  }

  .cookie-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .cookie-btn-accept {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }

  .cookie-btn-accept:hover {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5);
  }

  .cookie-btn-reject {
    background: transparent;
    color: #cbd5e1;
    border: 1px solid #475569;
  }

  .cookie-btn-reject:hover {
    background: #334155;
    color: white;
  }

  .cookie-close {
    background: none;
    border: none;
    color: #cbd5e1;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .cookie-close:hover {
    color: white;
  }

  @media (max-width: 768px) {
    .cookie-container {
      flex-direction: column;
      align-items: flex-start;
    }

    .cookie-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .cookie-btn {
      flex: 1;
      min-width: 120px;
    }
  }
`;

export function CookieBanner() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    // Verificar si el usuario ya aceptó cookies
    const consentimiento = localStorage.getItem("cookie-consent");
    if (!consentimiento) {
      // Pequeño delay para que no sea tan abrupto
      setTimeout(() => setMostrar(true), 500);
    }
  }, []);

  function aceptarCookies() {
    localStorage.setItem("cookie-consent", "accepted");
    localStorage.setItem("cookie-consent-date", new Date().toISOString());
    setMostrar(false);
  }

  function rechazarCookies() {
    localStorage.setItem("cookie-consent", "rejected");
    localStorage.setItem("cookie-consent-date", new Date().toISOString());
    setMostrar(false);
  }

  if (!mostrar) return null;

  return (
    <>
      <style>{styles}</style>
      <div className="cookie-banner" role="dialog" aria-label="Cookie consent banner">
        <div className="cookie-container">
          <div className="cookie-content">
            <div className="cookie-title">🍪 Utilizamos Cookies</div>
            <div className="cookie-description">
              Utilizamos cookies para mejorar tu experiencia, personalizar contenido, analizar tráfico y recordar tus preferencias. Puedes aceptar todas las cookies o gestionar tus preferencias.
            </div>
            <div className="cookie-links">
              <a href="/legal/privacidad">
                Privacidad
              </a>
              <a href="/legal/cookies">
                Política de Cookies
              </a>
              <a href="/legal/terminos">
                Términos
              </a>
            </div>
          </div>

          <div className="cookie-actions">
            <button
              className="cookie-btn cookie-btn-reject"
              onClick={rechazarCookies}
              aria-label="Rechazar cookies no esenciales"
            >
              Rechazar
            </button>
            <button
              className="cookie-btn cookie-btn-accept"
              onClick={aceptarCookies}
              aria-label="Aceptar todas las cookies"
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
