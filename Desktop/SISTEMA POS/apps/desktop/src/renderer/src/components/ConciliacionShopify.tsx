import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mensajeError } from '../lib/errores';

interface FilaProducto {
  productoId: string;
  nombre: string;
  sku: string;
  varianteTitulo: string | null;
  centrala: number;
}

interface ResultadoConciliacion {
  revisadoEn: string;
  totalShopify: number;
  totalVinculados: number;
  coinciden: number;
  diferencias: (FilaProducto & { shopify: number; diferencia: number })[];
  noEnShopify: FilaProducto[];
  sinVincular: { sku: string | null; inventoryItemId: string; shopify: number }[];
  corregidos: number;
  corregidosCentrala?: number;
  fallidos?: string[];
  omitido: string | null;
  sucursal?: { id: string; nombre: string } | null;
  ubicacion?: { id: string; nombre: string } | null;
}

interface InfoUbicaciones {
  sucursal: { id: string; nombre: string } | null;
  ubicacionActual: string | null;
  ubicaciones: { id: string; nombre: string }[];
}

interface AjusteCola {
  id: string;
  estado: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'ERROR';
  intentos: number;
  errorMensaje: string | null;
  datos: string;
  creadoEn: string;
  producto: { nombre: string; sku: string } | null;
}

const ETIQUETA_ESTADO: Record<AjusteCola['estado'], string> = {
  PENDIENTE: 'Pendiente',
  PROCESANDO: 'Procesando',
  COMPLETADO: 'Aplicado',
  ERROR: 'Falló',
};

function cambioDe(ajuste: AjusteCola): string {
  try {
    const cantidad = Number(JSON.parse(ajuste.datos).cantidad);
    return cantidad > 0 ? `+${cantidad}` : String(cantidad);
  } catch {
    return '—';
  }
}

type Accion = 'revisar' | 'shopify' | 'centrala';

export default function ConciliacionShopify() {
  const [resultado, setResultado] = useState<ResultadoConciliacion | null>(null);
  const [cargando, setCargando] = useState<Accion | 'ubicacion' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState<AjusteCola[]>([]);
  const [info, setInfo] = useState<InfoUbicaciones | null>(null);

  async function cargarAjustes() {
    try {
      const { data } = await api.get<AjusteCola[]>('/shopify/historial-sincronizacion', {
        params: { tipo: 'INVENTORY_UPDATE', limit: 15 },
      });
      setAjustes(data);
    } catch {
      setAjustes([]);
    }
  }

  async function cargarUbicaciones() {
    try {
      const { data } = await api.get<InfoUbicaciones>('/shopify/ubicaciones');
      setInfo(data);
    } catch {
      setInfo(null);
    }
  }

  useEffect(() => {
    void cargarAjustes();
    void cargarUbicaciones();
  }, []);

  async function ejecutar(accion: Accion) {
    if (accion === 'shopify' && !window.confirm(
      'Se cambiará el inventario de Shopify para que quede IGUAL al de CENTRALA (sucursal ecommerce).\n\n' +
      'Úsalo cuando CENTRALA tiene el inventario correcto. ¿Continuar?'
    )) return;
    if (accion === 'centrala' && !window.confirm(
      'Se cambiará el inventario de CENTRALA (sucursal ecommerce) para que quede IGUAL al de Shopify.\n\n' +
      'Úsalo solo cuando Shopify tiene el inventario correcto. Quedará registrado como ajuste. ¿Continuar?'
    )) return;
    setCargando(accion);
    setError(null);
    setAviso(null);
    try {
      const { data } =
        accion === 'revisar'
          ? await api.get<ResultadoConciliacion>('/shopify/conciliacion')
          : await api.post<ResultadoConciliacion>(
              accion === 'shopify' ? '/shopify/conciliacion/corregir' : '/shopify/conciliacion/corregir-centrala'
            );
      setResultado(data);
      if (accion === 'shopify' && !data.omitido) {
        setAviso(`Listo: ${data.corregidos} artículo(s) corregidos en Shopify.`);
      } else if (accion === 'centrala' && !data.omitido) {
        setAviso(`Listo: ${data.corregidosCentrala ?? 0} artículo(s) igualados en CENTRALA.`);
      }
      if (accion !== 'revisar') void cargarAjustes();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo revisar el inventario de Shopify'));
    } finally {
      setCargando(null);
    }
  }

  async function cambiarUbicacion(locationId: string) {
    if (!info || locationId === info.ubicacionActual) return;
    const nombre = info.ubicaciones.find((u) => u.id === locationId)?.nombre ?? locationId;
    if (!window.confirm(
      `¿Vincular la sucursal "${info.sucursal?.nombre}" con la ubicación de Shopify "${nombre}"?\n\n` +
      'Desde ahora el inventario se sincronizará con esa ubicación. Después revisa las diferencias.'
    )) return;
    setCargando('ubicacion');
    setError(null);
    try {
      await api.patch('/shopify/ubicacion-ecommerce', { locationId });
      await cargarUbicaciones();
      setResultado(null);
      setAviso('Ubicación actualizada. Presiona "Revisar diferencias".');
    } catch (err) {
      setError(mensajeError(err, 'No se pudo cambiar la ubicación'));
    } finally {
      setCargando(null);
    }
  }

  const nombreFila = (f: FilaProducto) => (f.varianteTitulo ? `${f.nombre} (${f.varianteTitulo})` : f.nombre);
  const ocupado = cargando !== null;

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 24px' }}>
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Inventario CENTRALA ↔ Shopify</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
          Solo se sincroniza el stock de la <strong>sucursal ecommerce</strong> de CENTRALA con <strong>una ubicación</strong> de
          Shopify. Cada venta se envía al instante y cada 15 minutos el sistema corrige Shopify para que quede igual a CENTRALA.
        </p>

        <div className="cs-vinculo">
          <div>
            <span className="cs-vinculo-etiqueta">Sucursal de CENTRALA</span>
            <strong>{info?.sucursal?.nombre ?? '—'}</strong>
          </div>
          <span className="cs-vinculo-flecha">⇄</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <span className="cs-vinculo-etiqueta">Ubicación de Shopify</span>
            {info && info.ubicaciones.length > 0 ? (
              <select
                value={info.ubicacionActual ?? ''}
                disabled={ocupado}
                onChange={(e) => void cambiarUbicacion(e.target.value)}
              >
                {!info.ubicacionActual && <option value="">Sin vincular</option>}
                {info.ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{resultado?.ubicacion?.nombre ?? '—'}</strong>
            )}
          </div>
        </div>
        <p className="cs-nota">
          Si vendes o ajustas stock en otra sucursal (por ejemplo la tienda física), ese stock no se envía a Shopify. Si la
          ubicación de Shopify no es la correcta, cámbiala aquí.
        </p>

        <div className="cs-acciones">
          <div className="cs-accion">
            <button type="button" className="secondary" onClick={() => void ejecutar('revisar')} disabled={ocupado}>
              {cargando === 'revisar' ? 'Revisando...' : '1. Revisar diferencias'}
            </button>
            <span>Compara los dos inventarios sin cambiar nada.</span>
          </div>
          <div className="cs-accion">
            <button type="button" onClick={() => void ejecutar('shopify')} disabled={ocupado}>
              {cargando === 'shopify' ? 'Corrigiendo...' : 'Corregir inventario en Shopify'}
            </button>
            <span>
              <strong>CENTRALA está bien.</strong> Shopify queda igual a CENTRALA (también agrega a la ubicación los productos
              que faltan).
            </span>
          </div>
          <div className="cs-accion">
            <button type="button" className="cs-btn-alterno" onClick={() => void ejecutar('centrala')} disabled={ocupado}>
              {cargando === 'centrala' ? 'Corrigiendo...' : 'Corregir inventario en CENTRALA'}
            </button>
            <span>
              <strong>Shopify está bien.</strong> CENTRALA queda igual a Shopify. Queda registrado como ajuste de inventario.
            </span>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {aviso && <p className="badge success" style={{ display: 'inline-block', marginTop: 12 }}>{aviso}</p>}

        {resultado && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            <p style={{ margin: '0 0 8px' }}>
              <strong>{resultado.coinciden}</strong> de {resultado.totalVinculados} productos coinciden ·{' '}
              <strong>{resultado.diferencias.length}</strong> con diferencia
              {resultado.noEnShopify.length > 0 && ` · ${resultado.noEnShopify.length} sin stock asignado en la ubicación`}
            </p>
            {resultado.omitido && <p className="error-text">{resultado.omitido}</p>}
            {resultado.fallidos && resultado.fallidos.length > 0 && (
              <p className="error-text">
                No se pudieron corregir {resultado.fallidos.length}: {resultado.fallidos.join(', ')}. Vuelve a intentar en un momento.
              </p>
            )}

            {resultado.diferencias.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', marginBottom: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Producto</th>
                      <th>SKU</th>
                      <th>CENTRALA</th>
                      <th>Shopify</th>
                      <th title="Shopify menos CENTRALA">Diferencia (Shopify − CENTRALA)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.diferencias.map((d) => (
                      <tr key={d.productoId}>
                        <td>{nombreFila(d)}</td>
                        <td style={{ textAlign: 'center' }}>{d.sku}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{d.centrala}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{d.shopify}</td>
                        <td style={{ textAlign: 'center', color: 'var(--danger, #dc2626)' }}>
                          {d.diferencia > 0 ? `+${d.diferencia}` : d.diferencia}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {resultado.noEnShopify.length > 0 && (
              <p style={{ margin: '0 0 4px' }}>
                No tienen stock asignado en la ubicación de Shopify ({resultado.noEnShopify.length}):{' '}
                {resultado.noEnShopify.map(nombreFila).join(', ')}. "Corregir inventario en Shopify" los agrega.
              </p>
            )}
            {resultado.sinVincular.length > 0 && (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                {resultado.sinVincular.length} artículo(s) de Shopify no están vinculados a CENTRALA y no se modifican.
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4 style={{ margin: 0 }}>Últimos ajustes enviados a Shopify</h4>
            <button type="button" className="secondary" onClick={() => void cargarAjustes()}>
              Actualizar
            </button>
          </div>
          {ajustes.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Aún no hay ajustes. Al vender en CENTRALA un producto vinculado, aparecerá aquí.
            </p>
          ) : (
            <table style={{ width: '100%', fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Fecha</th>
                  <th style={{ textAlign: 'left' }}>Producto</th>
                  <th>Cambio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ajustes.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.creadoEn).toLocaleString('es-CO')}</td>
                    <td>{a.producto ? `${a.producto.nombre} (${a.producto.sku})` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>{cambioDe(a)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: a.estado === 'ERROR' ? 'var(--danger, #dc2626)' : undefined }}>
                        {ETIQUETA_ESTADO[a.estado] ?? a.estado}
                      </span>
                      {a.errorMensaje && (
                        <div style={{ fontSize: 11.5, color: 'var(--danger, #dc2626)', textAlign: 'left' }}>
                          {a.errorMensaje}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
