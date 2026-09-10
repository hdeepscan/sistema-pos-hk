import { useState, useEffect } from 'react';
import { X, Check, Zap, Mail, Shield, Palette } from 'lucide-react';

export default function UpdatesPopup() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Mostrar el popup si nunca fue cerrado en esta sesión
    const hasSeenUpdates = sessionStorage.getItem('hasSeenWeeklyUpdates');
    if (!hasSeenUpdates) {
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    sessionStorage.setItem('hasSeenWeeklyUpdates', 'true');
  };

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(59, 130, 246, 0.15)',
        maxWidth: '500px',
        width: '100%',
        overflow: 'hidden'
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
          padding: '32px 24px',
          color: 'white',
          position: 'relative'
        }}>
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Zap size={28} style={{ color: '#FCD34D' }} />
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>
              Actualizaciones Recientes
            </h2>
          </div>
          <p style={{ margin: '0', fontSize: '13px', opacity: 0.9, fontWeight: 500 }}>
            Última semana (Sep 3-10, 2026)
          </p>
        </div>

        {/* Contenido */}
        <div style={{ padding: '32px 24px' }}>

          {/* Update 1 */}
          <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3B82F6',
                flexShrink: 0
              }}>
                <Mail size={20} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Sistema de Correos Automatizados
                </h3>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                  Integración completa de Nodemailer con Resend API. Correos de bienvenida y notificación de ventas.
                </p>
              </div>
            </div>
          </div>

          {/* Update 2 */}
          <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fce7f3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ec4899',
                flexShrink: 0
              }}>
                <Palette size={20} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Diseño Premium de Correos
                </h3>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                  Plantillas HTML profesionales con fuente Poppins, imágenes de productos y colores Centrala.
                </p>
              </div>
            </div>
          </div>

          {/* Update 3 */}
          <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22C55E',
                flexShrink: 0
              }}>
                <Shield size={20} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Dominio Verificado en Resend
                </h3>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                  centrala.com.co verificado oficialmente. Correos 100% confiables sin llegar a spam.
                </p>
              </div>
            </div>
          </div>

          {/* Update 4 */}
          <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
                flexShrink: 0
              }}>
                <Zap size={20} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Soporte Puerto 587 (TLS)
                </h3>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                  Configuración flexible: SMTPS (465) y SMTP+STARTTLS (587) funcionando perfectamente.
                </p>
              </div>
            </div>
          </div>

          {/* Update 5 */}
          <div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#e0e7ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3B82F6',
                flexShrink: 0
              }}>
                <Check size={20} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Hotfixes y Optimizaciones
                </h3>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
                  Sincronización de schema, timeout en endpoints de diagnóstico, y mejoras de seguridad.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          backgroundColor: '#f8fafc',
          padding: '20px 24px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <button
            onClick={handleClose}
            style={{
              background: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
              width: '100%'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#2563EB')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#3B82F6')}
          >
            Entendido, Gracias
          </button>
        </div>

      </div>
    </div>
  );
}
