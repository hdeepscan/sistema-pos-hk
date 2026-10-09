import { useState } from 'react';
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
  omitido: string | null;
}

export default function ConciliacionShopify() {
  const [resultado, setResultado] = useState<ResultadoConciliacion | null>(null);
  const [cargando, setCargando] = useState<'revisar' | 'corregir' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(accion: 'revisar' | 'corregir') {
    setCargando(accion);
    setError(null);
    try {
      const { data } =
        accion === 'revisar'
          ? await api.get<ResultadoConciliacion>('/shopify/conciliacion')
          : await api.post<ResultadoConciliacion>('/shopify/conciliacion/corregir');
      setResultado(data);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo revisar el inventario de Shopify'));
    } finally {
      setCargando(null);
    }
  }

  const nombreFila = (f: FilaProducto) => (f.varianteTitulo ? `${f.nombre} (${f.varianteTitulo})` : f.nombre);

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: '0 24px' }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Inventario CENTRALA ↔ Shopify</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
          Cada venta se sincroniza al instante. Además, cada 15 minutos el sistema compara ambos inventarios y
          corrige Shopify para que quede igual a CENTRALA. Solo afecta productos vinculados.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="secondary" onClick={() => ejecutar('revisar')} disabled={cargando !== null}>
            {cargando === 'revisar' ? 'Revisando...' : 'Revisar diferencias'}
          </button>
          <button type="button" onClick={() => ejecutar('corregir')} disabled={cargando !== null}>
            {cargando === 'corregir' ? 'Corrigiendo...' : 'Corregir Shopify ahora'}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        {resultado && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            <p style={{ margin: '0 0 8px' }}>
              {resultado.coinciden} de {resultado.totalVinculados} productos coinciden ·{' '}
              {resultado.diferencias.length} con diferencia
              {resultado.corregidos > 0 && ` · ${resultado.corregidos} corregido(s) en Shopify`}
            </p>
            {resultado.omitido && <p className="error-text">{resultado.omitido}</p>}

            {resultado.diferencias.length > 0 && (
              <table style={{ width: '100%', marginBottom: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Producto</th>
                    <th>SKU</th>
                    <th>CENTRALA</th>
                    <th>Shopify</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.diferencias.map((d) => (
                    <tr key={d.productoId}>
                      <td>{nombreFila(d)}</td>
                      <td style={{ textAlign: 'center' }}>{d.sku}</td>
                      <td style={{ textAlign: 'center' }}>{d.centrala}</td>
                      <td style={{ textAlign: 'center' }}>{d.shopify}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {resultado.noEnShopify.length > 0 && (
              <p style={{ margin: '0 0 4px' }}>
                {resultado.noEnShopify.length} producto(s) vinculados no están en la ubicación de Shopify:{' '}
                {resultado.noEnShopify.map(nombreFila).join(', ')}
              </p>
            )}
            {resultado.sinVincular.length > 0 && (
              <p style={{ margin: 0 }}>
                {resultado.sinVincular.length} artículo(s) de Shopify no están vinculados a CENTRALA y no se modifican.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
