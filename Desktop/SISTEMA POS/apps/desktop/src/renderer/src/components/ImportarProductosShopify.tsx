import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mensajeError } from '../lib/errores';

interface ResultadoProducto {
  shopifyProductId: string;
  titulo: string;
  estado: 'importado' | 'ya_existe' | 'reactivado' | 'omitido' | 'error';
  motivo?: string;
  variantes?: number;
}

interface ResultadoImportacion {
  revisados: number;
  importados: number;
  productos: ResultadoProducto[];
  // Variantes nuevas creadas en Shopify en productos que ya estaban en CENTRALA.
  variantesNuevas?: { producto: string; variante: string; sku: string }[];
  lineasCompletadas?: number;
}

interface EstadoPaso {
  ultimaVez: string;
  ok: boolean;
  detalle: string | null;
}

const PASOS: [string, string][] = [
  ['pedidos', 'Pedidos de la tienda online'],
  ['productosNuevos', 'Productos nuevos'],
  ['productosOmitidos', 'Productos que no se pudieron traer'],
  ['variantesNuevas', 'Variantes nuevas'],
  ['ventasCompletadas', 'Ventas completadas'],
  ['precios', 'Precios'],
  ['inventario', 'Inventario (cada 5 minutos)'],
];

function haceCuanto(fecha: string): string {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
}

// Último resultado de cada paso de la sincronización automática (cada minuto).
function EstadoSincronizacion() {
  const [estado, setEstado] = useState<Record<string, EstadoPaso> | null>(null);
  useEffect(() => {
    const cargar = () =>
      api
        .get<Record<string, EstadoPaso>>('/shopify/sincronizacion/estado')
        .then(({ data }) => setEstado(data))
        .catch(() => setEstado(null));
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!estado) return null;
  const pasos = PASOS.filter(([clave]) => estado[clave]);
  return (
    <div style={{ margin: '0 0 16px', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary, #f8fafc)', fontSize: 13 }}>
      <strong style={{ display: 'block', marginBottom: 6 }}>Sincronización automática</strong>
      {pasos.length === 0 ? (
        <span style={{ color: 'var(--text-muted)' }}>Todavía no ha corrido desde el último reinicio del servidor (corre cada minuto).</span>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {pasos.map(([clave, nombre]) => {
            const p = estado[clave];
            return (
              <li key={clave}>
                <span style={{ color: p.ok ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)', fontWeight: 700 }}>
                  {p.ok ? '✓' : '✗'}
                </span>{' '}
                {nombre} <span style={{ color: 'var(--text-muted)' }}>· {haceCuanto(p.ultimaVez)}</span>
                {p.detalle && <div style={{ marginLeft: 18, color: p.ok ? 'var(--text-muted)' : 'var(--danger, #dc2626)' }}>{p.detalle}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const ETIQUETA: Record<ResultadoProducto['estado'], string> = {
  importado: 'Importado',
  ya_existe: 'Ya estaba en CENTRALA',
  reactivado: 'Reactivado',
  omitido: 'No importado',
  error: 'Error',
};

export default function ImportarProductosShopify() {
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mayoristas, setMayoristas] = useState<{
    revisadas: number;
    preciosActualizados: { nombre: string; antes: number; ahora: number }[];
    mayoristasActualizados: number;
  } | null>(null);
  const [cargandoMayoristas, setCargandoMayoristas] = useState(false);

  async function traerMayoristas() {
    setCargandoMayoristas(true);
    setError(null);
    try {
      const { data } = await api.post('/shopify/precios/sincronizar');
      setMayoristas(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargandoMayoristas(false);
    }
  }

  async function importar() {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.post<ResultadoImportacion>('/shopify/productos-nuevos/importar');
      setResultado(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  const conProblema = resultado?.productos.filter((p) => p.estado === 'omitido' || p.estado === 'error') ?? [];
  const importados = resultado?.productos.filter((p) => p.estado === 'importado' || p.estado === 'reactivado') ?? [];
  const recientes = resultado?.productos.filter((p) => p.estado === 'ya_existe') ?? [];

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: '0 24px' }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Productos creados en Shopify</h3>
        <EstadoSincronizacion />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
          Cada minuto CENTRALA trae automáticamente los productos y las variantes nuevas creadas en Shopify (si una
          variante viene sin SKU, CENTRALA le genera uno y lo guarda también en Shopify). Con este botón revisas
          todo el catálogo de Shopify, importas lo que falte (con su stock de la sucursal ecommerce) y ves por qué
          algún producto no se pudo importar.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void importar()} disabled={cargando}>
            {cargando ? 'Revisando Shopify...' : 'Traer productos nuevos de Shopify'}
          </button>
          <button type="button" className="secondary" onClick={() => void traerMayoristas()} disabled={cargandoMayoristas}>
            {cargandoMayoristas ? 'Leyendo precios...' : 'Traer precios de Shopify'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Si cambias un precio en Shopify, CENTRALA lo trae solo en 1 o 2 minutos (también el precio mayorista, del
          metacampo "Precio Mayorista"). El botón revisa todo el catálogo de una vez.
        </p>
        {mayoristas && (
          <div style={{ fontSize: 13, margin: '8px 0 0' }}>
            <p style={{ margin: 0, color: 'var(--success, #16a34a)' }}>
              {mayoristas.revisadas} variante(s) revisadas · {mayoristas.preciosActualizados.length} precio(s) de venta
              actualizados · precio mayorista actualizado en {mayoristas.mayoristasActualizados} variante(s)
            </p>
            {mayoristas.preciosActualizados.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {mayoristas.preciosActualizados.slice(0, 30).map((p, i) => (
                  <li key={i}>
                    {p.nombre}: ${p.antes.toLocaleString('es-CO')} → ${p.ahora.toLocaleString('es-CO')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {resultado && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            <p style={{ margin: '0 0 8px' }}>
              {resultado.revisados} producto(s) revisados en Shopify · {resultado.importados} importado(s)
              {conProblema.length > 0 && ` · ${conProblema.length} sin importar`}
            </p>
            {resultado.productos.length === 0 && !resultado.variantesNuevas?.length && (
              <p style={{ margin: 0 }}>Todos los productos de Shopify ya están en CENTRALA.</p>
            )}
            {!!resultado.lineasCompletadas && (
              <p style={{ margin: '0 0 8px', color: 'var(--success, #16a34a)' }}>
                {resultado.lineasCompletadas} producto(s) agregados a ventas de Shopify que habían entrado antes de que el
                producto existiera en CENTRALA.
              </p>
            )}
            {!!resultado.variantesNuevas?.length && (
              <div style={{ margin: '0 0 10px' }}>
                <p style={{ margin: '0 0 4px', color: 'var(--success, #16a34a)' }}>
                  {resultado.variantesNuevas.length} variante(s) nueva(s) traída(s) a productos que ya existían:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {resultado.variantesNuevas.map((v) => (
                    <li key={v.sku}>
                      {v.producto}
                      {v.variante ? ` (${v.variante})` : ''} · SKU {v.sku}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {[...importados, ...conProblema, ...recientes].length > 0 && (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Producto</th>
                    <th style={{ textAlign: 'left' }}>Resultado</th>
                    <th style={{ textAlign: 'left' }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {[...importados, ...conProblema, ...recientes].map((p) => (
                    <tr key={p.shopifyProductId}>
                      <td>{p.titulo}</td>
                      <td
                        style={{
                          color:
                            p.estado === 'importado' || p.estado === 'reactivado'
                              ? 'var(--success, #16a34a)'
                              : p.estado === 'ya_existe'
                                ? 'var(--text-muted)'
                                : 'var(--danger, #dc2626)',
                        }}
                      >
                        {ETIQUETA[p.estado]}
                      </td>
                      <td>
                        {p.estado === 'importado'
                          ? `${p.variantes} variante(s)`
                          : p.estado === 'ya_existe'
                            ? 'Creado en Shopify estos días; ya está activo en CENTRALA'
                            : p.motivo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
