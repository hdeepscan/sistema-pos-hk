import { useState } from 'react';
import { api } from '../lib/api';
import { mensajeError } from '../lib/errores';

interface ResultadoProducto {
  shopifyProductId: string;
  titulo: string;
  estado: 'importado' | 'ya_existe' | 'omitido' | 'error';
  motivo?: string;
  variantes?: number;
}

interface ResultadoImportacion {
  revisados: number;
  importados: number;
  productos: ResultadoProducto[];
}

const ETIQUETA: Record<ResultadoProducto['estado'], string> = {
  importado: 'Importado',
  ya_existe: 'Ya estaba',
  omitido: 'No importado',
  error: 'Error',
};

export default function ImportarProductosShopify() {
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const importados = resultado?.productos.filter((p) => p.estado === 'importado') ?? [];

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: '0 24px' }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Productos creados en Shopify</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
          Cada minuto CENTRALA trae automáticamente los productos nuevos creados en Shopify. Con este botón revisas
          todo el catálogo de Shopify, importas lo que falte (con su stock de la sucursal ecommerce) y ves por qué
          algún producto no se pudo importar.
        </p>

        <button type="button" onClick={() => void importar()} disabled={cargando}>
          {cargando ? 'Revisando Shopify...' : 'Traer productos nuevos de Shopify'}
        </button>

        {error && <p className="error-text">{error}</p>}

        {resultado && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            <p style={{ margin: '0 0 8px' }}>
              {resultado.revisados} producto(s) revisados en Shopify · {resultado.importados} importado(s)
              {conProblema.length > 0 && ` · ${conProblema.length} sin importar`}
            </p>
            {resultado.productos.length === 0 && <p style={{ margin: 0 }}>Todos los productos de Shopify ya están en CENTRALA.</p>}

            {[...importados, ...conProblema].length > 0 && (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Producto</th>
                    <th style={{ textAlign: 'left' }}>Resultado</th>
                    <th style={{ textAlign: 'left' }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {[...importados, ...conProblema].map((p) => (
                    <tr key={p.shopifyProductId}>
                      <td>{p.titulo}</td>
                      <td style={{ color: p.estado === 'importado' ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                        {ETIQUETA[p.estado]}
                      </td>
                      <td>{p.estado === 'importado' ? `${p.variantes} variante(s)` : p.motivo}</td>
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
