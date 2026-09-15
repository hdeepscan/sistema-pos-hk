import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ArrowRight, Check, Zap, Link2, Settings } from 'lucide-react';

type Paso = 1 | 2 | 3;

interface ConfigShopify {
  conectado: boolean;
  shopDomain?: string;
  sucursalEcommerceId?: string;
  ultimaSincronizacion?: string;
}

export default function ShopifySetupWizard() {
  const [paso, setPaso] = useState<Paso>(1);
  const [config, setConfig] = useState<ConfigShopify | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Paso 1: Conexión
  const [subdominio, setSubdominio] = useState('');
  const [conectandoOAuth, setConectandoOAuth] = useState(false);

  // Paso 2: Mapeo e Importación
  const [importando, setImportando] = useState(false);
  const [forzandoPush, setForzandoPush] = useState(false);
  const [resultadoPush, setResultadoPush] = useState<any>(null);

  // Paso 3: Automatización
  const [sincronizacionActiva, setSincronizacionActiva] = useState(false);
  const [webhooksActivos, setWebhooksActivos] = useState(false);

  // Cargar configuración inicial
  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      setCargando(true);
      const { data } = await api.get<ConfigShopify>('/shopify/config');
      setConfig(data);
      if (data.conectado) {
        setSubdominio(data.shopDomain || '');
        // Avanzar al siguiente paso si ya está conectado
        setPaso(2);
      }
    } catch (err) {
      setError('Error cargando configuración');
    } finally {
      setCargando(false);
    }
  };

  const handleConectarShopify = async () => {
    if (!subdominio.trim()) {
      setError('Ingresa el subdominio de tu tienda');
      return;
    }

    try {
      setConectandoOAuth(true);
      setError(null);

      // Guardar dominio - limpiar sufijo si existe y luego agregarlo
      const dominioLimpio = subdominio.replace(/\.myshopify\.com$/i, '').trim();
      const dominio = `${dominioLimpio}.myshopify.com`;

      await api.post('/shopify/config', {
        shopDomain: dominio,
        sucursalEcommerceId: '',
        clientId: '',
        clientSecret: '',
      });

      // Iniciar OAuth
      const { data: oauthData } = await api.get('/shopify/connect');
      if (oauthData.authorizationUrl) {
        window.location.href = oauthData.authorizationUrl;
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error conectando con Shopify');
    } finally {
      setConectandoOAuth(false);
    }
  };

  const handleImportarProductos = async () => {
    try {
      setImportando(true);
      setError(null);
      const { data } = await api.post('/shopify/sync-inicial');
      setMensaje(`✅ ${data.productosImportados} productos importados`);
      setPaso(3);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error importando productos');
    } finally {
      setImportando(false);
    }
  };

  const handleForzarPushInventario = async () => {
    try {
      setForzandoPush(true);
      setError(null);
      const { data } = await api.post('/shopify/force-push-inventory');
      setResultadoPush(data);
      setMensaje(`✅ ${data.productosActualizados}/${data.totalProductos} productos sincronizados`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error forzando push de inventario');
    } finally {
      setForzandoPush(false);
    }
  };

  if (cargando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div>Cargando...</div>
      </div>
    );
  }

  const baseStyle = {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '30px',
    fontWeight: 'bold',
    marginBottom: '8px',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '16px',
    color: '#666',
    marginBottom: '32px',
  };

  const stepIndicatorStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    marginBottom: '32px',
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '32px',
    marginTop: '24px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    marginTop: '12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  };

  const alertStyle: React.CSSProperties = {
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  };

  return (
    <div style={baseStyle}>
      {/* Header */}
      <h1 style={titleStyle}>Configuración de Shopify</h1>
      <p style={subtitleStyle}>Sincroniza tu tienda Shopify con Centrala POS en 3 pasos</p>

      {/* Indicador de Pasos */}
      <div style={stepIndicatorStyle}>
        {[1, 2, 3].map((p) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 'bold',
                color: 'white',
                backgroundColor:
                  p < paso ? '#22c55e' : p === paso ? '#7c3aed' : '#ddd',
              }}
            >
              {p < paso ? <Check size={20} /> : p}
            </div>
            {p < 3 && (
              <div
                style={{
                  width: '32px',
                  height: '4px',
                  backgroundColor:
                    p < paso ? '#22c55e' : '#ddd',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Mensajes */}
      {error && (
        <div style={{ ...alertStyle, backgroundColor: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      )}
      {mensaje && (
        <div style={{ ...alertStyle, backgroundColor: '#dcfce7', color: '#166534' }}>
          {mensaje}
        </div>
      )}

      {/* PASO 1: CONEXIÓN */}
      {paso === 1 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div
              style={{
                padding: '12px',
                backgroundColor: '#ede9fe',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Link2 size={24} color="#7c3aed" />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                Paso 1: Conecta tu tienda Shopify
              </h2>
              <p style={{ fontSize: '14px', color: '#666' }}>
                Autoriza a Centrala POS para acceder a tu tienda
              </p>
            </div>
          </div>

          <div style={{ marginTop: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
              Subdominio de tu tienda
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="mi-tienda"
                value={subdominio}
                onChange={(e) => setSubdominio(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: '#666',
                  backgroundColor: '#f3f4f6',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                .myshopify.com
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
              Por ejemplo: si tu tienda es "mi-tienda.myshopify.com", escribe "mi-tienda"
            </p>

            <button
              onClick={handleConectarShopify}
              disabled={conectandoOAuth}
              style={{
                ...buttonStyle,
                backgroundColor: '#7c3aed',
                color: 'white',
              }}
            >
              {conectandoOAuth ? 'Conectando...' : <>Conectar con Shopify</>}
            </button>

            <div
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '12px',
                marginTop: '16px',
                fontSize: '12px',
                color: '#1e40af',
              }}
            >
              <strong>ℹ️ Nota:</strong> Se abrirá una ventana de Shopify para que autorices la conexión.
              Asegúrate de estar logged en tu cuenta de Shopify.
            </div>
          </div>
        </div>
      )}

      {/* PASO 2: MAPEO E IMPORTACIÓN */}
      {paso === 2 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div
              style={{
                padding: '12px',
                backgroundColor: '#dbeafe',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Zap size={24} color="#2563eb" />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                Paso 2: Importa tus productos
              </h2>
              <p style={{ fontSize: '14px', color: '#666' }}>
                Vincula tu inventario de Shopify con Centrala POS
              </p>
            </div>
          </div>

          <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', color: '#166534' }}>
              <Check size={20} />
              <span>
                <strong>Tienda conectada:</strong> {subdominio}.myshopify.com
              </span>
            </div>
          </div>

          <button
            onClick={handleImportarProductos}
            disabled={importando}
            style={{
              ...buttonStyle,
              backgroundColor: '#2563eb',
              color: 'white',
            }}
          >
            {importando ? 'Importando...' : <>Importar Productos y Stock</>}
          </button>

          <button
            onClick={handleForzarPushInventario}
            disabled={forzandoPush}
            style={{
              ...buttonStyle,
              backgroundColor: '#ea580c',
              color: 'white',
            }}
          >
            {forzandoPush ? 'Sincronizando...' : '🔄 Forzar Stock de Centrala ➔ Shopify'}
          </button>

          {resultadoPush && (
            <div
              style={{
                backgroundColor: '#dcfce7',
                border: '1px solid #86efac',
                borderRadius: '6px',
                padding: '12px',
                marginTop: '12px',
                fontSize: '12px',
                color: '#166534',
              }}
            >
              <p>
                <strong>✅ Resultado:</strong> {resultadoPush.productosActualizados}/{resultadoPush.totalProductos} productos sincronizados
              </p>
              {resultadoPush.erroresDetalle?.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <strong>Advertencias:</strong>
                  {resultadoPush.erroresDetalle.map((err: any, i: number) => (
                    <div key={i}>• {err.producto}: {err.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '6px',
              padding: '12px',
              marginTop: '16px',
              fontSize: '12px',
              color: '#92400e',
            }}
          >
            <strong>⚙️ Próximo paso:</strong> Después de importar, podrás activar la sincronización automática en tiempo real.
          </div>
        </div>
      )}

      {/* PASO 3: AUTOMATIZACIÓN */}
      {paso === 3 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div
              style={{
                padding: '12px',
                backgroundColor: '#dcfce7',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Settings size={24} color="#22c55e" />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                Paso 3: Activa automatización
              </h2>
              <p style={{ fontSize: '14px', color: '#666' }}>
                Configura la sincronización en tiempo real
              </p>
            </div>
          </div>

          {/* Toggle 1 */}
          <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontWeight: '600', marginBottom: '4px' }}>
                  Sincronización de Stock en Tiempo Real
                </h3>
                <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 0' }}>
                  Cuando realizas una venta en POS, el stock se actualiza automáticamente en Shopify
                </p>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                <input
                  type="checkbox"
                  checked={sincronizacionActiva}
                  onChange={(e) => setSincronizacionActiva(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <div
                  style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: sincronizacionActiva ? '#22c55e' : '#ccc',
                    transition: 'background-color 0.3s',
                    borderRadius: '24px',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    content: '',
                    height: '16px',
                    width: '16px',
                    left: sincronizacionActiva ? '26px' : '4px',
                    bottom: '4px',
                    backgroundColor: 'white',
                    transition: 'left 0.3s',
                    borderRadius: '50%',
                  }}
                />
              </label>
            </div>
          </div>

          {/* Toggle 2 */}
          <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontWeight: '600', marginBottom: '4px' }}>
                  Descuento Automático de Stock desde Web
                </h3>
                <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 0' }}>
                  Cuando se realiza una venta en Shopify, el stock se descuenta automáticamente en POS
                </p>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                <input
                  type="checkbox"
                  checked={webhooksActivos}
                  onChange={(e) => setWebhooksActivos(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <div
                  style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: webhooksActivos ? '#22c55e' : '#ccc',
                    transition: 'background-color 0.3s',
                    borderRadius: '24px',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    content: '',
                    height: '16px',
                    width: '16px',
                    left: webhooksActivos ? '26px' : '4px',
                    bottom: '4px',
                    backgroundColor: 'white',
                    transition: 'left 0.3s',
                    borderRadius: '50%',
                  }}
                />
              </label>
            </div>
          </div>

          {/* Webhook URL */}
          <div
            style={{
              backgroundColor: '#eef2ff',
              border: '1px solid #c7d2fe',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '12px',
            }}
          >
            <h4 style={{ color: '#4338ca', marginBottom: '8px' }}>🔗 URL del Webhook:</h4>
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '4px',
                padding: '8px',
                fontSize: '12px',
                color: '#374151',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
              }}
            >
              https://sistema-pos-hk.up.railway.app/webhooks/shopify/orders-create
            </div>
            <p style={{ fontSize: '11px', color: '#4338ca', marginTop: '8px' }}>
              Configura esta URL en tu panel de Shopify (Admin → Apps → Webhooks) para eventos
              "Order Created" y "Order Updated".
            </p>
          </div>

          {/* Estado Final */}
          <div
            style={{
              backgroundColor: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '12px',
            }}
          >
            <h4 style={{ color: '#166534', marginBottom: '4px' }}>✅ Configuración completada</h4>
            <p style={{ fontSize: '12px', color: '#166534', margin: 0 }}>
              Tu tienda Shopify está vinculada con Centrala POS. La sincronización bidireccional está activa y lista para funcionar.
            </p>
          </div>

          <button
            onClick={() => {
              setMensaje(null);
              setError(null);
            }}
            style={{
              ...buttonStyle,
              backgroundColor: '#22c55e',
              color: 'white',
            }}
          >
            ✅ Completado - Volver al Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
