import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input, Select, Alert, Spinner } from '../components/ui';
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Paso 1: Conexión
  const [subdominio, setSubdominio] = useState('');
  const [conectandoOAuth, setConectandoOAuth] = useState(false);

  // Paso 2: Mapeo e Importación
  const [importando, setImportando] = useState(false);
  const [tokenValido, setTokenValido] = useState(false);

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
        setTokenValido(true);
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

      // Guardar dominio
      const dominio = subdominio.includes('.myshopify.com')
        ? subdominio
        : `${subdominio}.myshopify.com`;

      await api.post('/shopify/config', {
        shopDomain: dominio,
        sucursalEcommerceId: '', // Será elegido en paso 2
        clientId: '', // Backend los gestiona
        clientSecret: '', // Backend los gestiona
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

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Configuración de Shopify
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Sincroniza tu tienda Shopify con Centrala POS en 3 pasos
        </p>
      </div>

      {/* Indicador de Pasos */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((p) => (
          <div key={p} className="flex items-center gap-2">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                p < paso
                  ? 'bg-green-500 text-white'
                  : p === paso
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {p < paso ? <Check size={20} /> : p}
            </div>
            {p < 3 && (
              <div
                className={`w-8 h-1 ${
                  p < paso
                    ? 'bg-green-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Mensajes */}
      {error && <Alert type="error" className="mb-6">{error}</Alert>}
      {mensaje && <Alert type="success" className="mb-6">{mensaje}</Alert>}

      {/* PASO 1: CONEXIÓN */}
      {paso === 1 && (
        <Card className="p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Link2 className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                Paso 1: Conecta tu tienda Shopify
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Autoriza a Centrala POS para acceder a tu tienda
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Subdominio de tu tienda
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="mi-tienda"
                  value={subdominio}
                  onChange={(e) => setSubdominio(e.target.value)}
                  className="flex-1"
                />
                <span className="flex items-center text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 rounded-lg">
                  .myshopify.com
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                Por ejemplo: si tu tienda es "mi-tienda.myshopify.com", escribe "mi-tienda"
              </p>
            </div>

            <Button
              onClick={handleConectarShopify}
              disabled={conectandoOAuth}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 font-semibold"
            >
              {conectandoOAuth ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Conectando...
                </>
              ) : (
                <>
                  Conectar con Shopify
                  <ArrowRight className="ml-2" size={18} />
                </>
              )}
            </Button>

            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                <strong>ℹ️ Nota:</strong> Se abrirá una ventana de Shopify para que autorices la conexión.
                Asegúrate de estar logged en tu cuenta de Shopify.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* PASO 2: MAPEO E IMPORTACIÓN */}
      {paso === 2 && (
        <Card className="p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Zap className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                Paso 2: Importa tus productos
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Vincula tu inventario de Shopify con Centrala POS
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Estado de Token */}
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-900 dark:text-green-200">
                <Check size={20} />
                <span>
                  <strong>Tienda conectada:</strong> {subdominio}.myshopify.com
                </span>
              </div>
            </div>

            {/* Opciones de importación */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Opciones de sincronización:
              </h3>

              <Button
                onClick={handleImportarProductos}
                disabled={importando}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
              >
                {importando ? (
                  <>
                    <Spinner className="mr-2" size="sm" />
                    Importando...
                  </>
                ) : (
                  <>
                    Importar Productos y Stock
                    <ArrowRight className="ml-2" size={18} />
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full py-3"
              >
                Vincular por SKU
              </Button>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>⚙️ Próximo paso:</strong> Después de importar, podrás activar la
                sincronización automática en tiempo real.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* PASO 3: AUTOMATIZACIÓN */}
      {paso === 3 && (
        <Card className="p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <Settings className="text-green-600 dark:text-green-400" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                Paso 3: Activa automatización
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Configura la sincronización en tiempo real
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Toggle 1: Sincronización de Stock */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Sincronización de Stock en Tiempo Real
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Cuando realizas una venta en POS, el stock se actualiza automáticamente en Shopify
                  </p>
                </div>
                <label className="relative inline-block w-12 h-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sincronizacionActiva}
                    onChange={(e) => setSincronizacionActiva(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`absolute inset-0 rounded-full transition-colors ${
                    sincronizacionActiva ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    sincronizacionActiva ? 'translate-x-6' : ''
                  }`} />
                </label>
              </div>
            </div>

            {/* Toggle 2: Webhooks de Órdenes */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Descuento Automático de Stock desde Web
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Cuando se realiza una venta en Shopify, el stock se descuenta automáticamente en POS
                  </p>
                </div>
                <label className="relative inline-block w-12 h-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhooksActivos}
                    onChange={(e) => setWebhooksActivos(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`absolute inset-0 rounded-full transition-colors ${
                    webhooksActivos ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    webhooksActivos ? 'translate-x-6' : ''
                  }`} />
                </label>
              </div>
            </div>

            {/* Información del Webhook */}
            <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2">
                🔗 URL del Webhook:
              </h4>
              <div className="bg-white dark:bg-gray-800 rounded p-3 font-mono text-sm text-gray-700 dark:text-gray-300 break-all">
                https://sistema-pos-hk.up.railway.app/webhooks/shopify/orders-create
              </div>
              <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-3">
                Configura esta URL en tu panel de Shopify (Admin → Apps → Webhooks) para eventos
                "Order Created" y "Order Updated".
              </p>
            </div>

            {/* Estado Final */}
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 dark:text-green-200 mb-2">
                ✅ Configuración completada
              </h4>
              <p className="text-sm text-green-800 dark:text-green-300">
                Tu tienda Shopify está vinculada con Centrala POS. La sincronización bidireccional
                está activa y lista para funcionar.
              </p>
            </div>

            <Button
              onClick={() => {
                setMensaje(null);
                setError(null);
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
            >
              ✅ Completado - Volver al Dashboard
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
