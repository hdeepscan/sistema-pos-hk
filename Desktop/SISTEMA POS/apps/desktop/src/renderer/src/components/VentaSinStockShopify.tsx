import { useState } from 'react';
import { api } from '../lib/api';
import { mensajeError } from '../lib/errores';

interface VarianteSinControl {
  shopifyProductId: string;
  shopifyVariantId: string;
  producto: string;
  variante: string;
  disponible: number | null;
  motivo: 'SIGUE_VENDIENDO' | 'SIN_SEGUIMIENTO' | 'AMBOS';
}

const MOTIVO: Record<VarianteSinControl['motivo'], string> = {
  SIGUE_VENDIENDO: 'Sigue vendiendo sin stock',
  SIN_SEGUIMIENTO: 'Sin seguimiento de inventario',
  AMBOS: 'Sigue vendiendo y sin seguimiento',
};

// Encuentra las variantes que la tienda online vende aunque tengan 0 unidades y las corrige.
export default function VentaSinStockShopify() {
  const [resultado, setResultado] = useState<{ revisadas: number; variantes: VarianteSinControl[] } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revisar() {
    setCargando(true);
    setError(null);
    setMensaje(null);
    try {
      const { data } = await api.get('/shopify/venta-sin-stock');
      setResultado(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function corregir() {
    if (!resultado || resultado.variantes.length === 0) return;
    if (
      !confirm(
        `¿Dejar de vender sin stock en ${resultado.variantes.length} variante(s)?\n\n` +
          'Shopify mostrará "Agotado" cuando no haya unidades. Si vendes alguna en preventa (sin stock a propósito), ' +
          'no uses este botón y corrígela a mano en Shopify.'
      )
    ) {
      return;
    }
    setCorrigiendo(true);
    setError(null);
    try {
      const { data } = await api.post<{ corregidas: number; fallidas: string[] }>('/shopify/venta-sin-stock/corregir', {
        variantIds: resultado.variantes.map((v) => v.shopifyVariantId),
      });
      await revisar();
      setMensaje(
        `✓ ${data.corregidas} variante(s) corregidas: ya no se venden sin stock.` +
          (data.fallidas.length ? ` No se pudieron corregir: ${data.fallidas.join(', ')}.` : '')
      );
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCorrigiendo(false);
    }
  }

  const lista = resultado?.variantes ?? [];
  const productos = new Set(lista.map((v) => v.shopifyProductId)).size;

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: '0 24px' }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ventas sin stock en la tienda online</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
          Busca las variantes que Shopify vende aunque tengan 0 unidades (por tener activado "Seguir vendiendo cuando
          no haya stock" o no llevar el seguimiento del inventario) y las deja en "no vender sin stock".
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void revisar()} disabled={cargando || corrigiendo}>
            {cargando ? 'Revisando Shopify...' : 'Revisar ventas sin stock'}
          </button>
          {lista.length > 0 && (
            <button type="button" className="secondary" onClick={() => void corregir()} disabled={corrigiendo || cargando}>
              {corrigiendo ? 'Corrigiendo...' : `No vender sin stock (${lista.length})`}
            </button>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}
        {mensaje && <p style={{ fontSize: 13, color: 'var(--success, #16a34a)' }}>{mensaje}</p>}

        {resultado && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            {lista.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--success, #16a34a)' }}>
                ✓ Revisadas {resultado.revisadas} variantes: ninguna se vende sin stock.
              </p>
            ) : (
              <>
                <p style={{ margin: '0 0 8px', color: 'var(--danger, #dc2626)' }}>
                  {lista.length} variante(s) de {productos} producto(s) se pueden vender sin stock.
                </p>
                <div style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Producto</th>
                        <th style={{ textAlign: 'left' }}>Variante</th>
                        <th style={{ textAlign: 'right' }}>Disponibles</th>
                        <th style={{ textAlign: 'left' }}>Problema</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((v) => (
                        <tr key={v.shopifyVariantId}>
                          <td>{v.producto}</td>
                          <td>{v.variante || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{v.disponible ?? '—'}</td>
                          <td>{MOTIVO[v.motivo]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
