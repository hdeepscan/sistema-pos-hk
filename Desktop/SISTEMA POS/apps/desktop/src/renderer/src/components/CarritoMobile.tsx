/**
 * Componente de Carrito Móvil Reutilizable
 * Muestra items del carrito con controles de cantidad
 */

interface ItemCarrito {
  productoId: string;
  nombre: string;
  imagenUrl: string | null;
  cantidad: number;
  precioUnitario: number;
  esLibre?: boolean;
}

interface CarritoMobileProps {
  items: ItemCarrito[];
  onModificarCantidad: (productoId: string, cantidad: number) => void;
  total: number;
  subtotal: number;
}

export function CarritoMobile({
  items,
  onModificarCantidad,
  total,
  subtotal,
}: CarritoMobileProps) {
  if (items.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "24px",
          color: "var(--text-muted)",
        }}
      >
        <p>📦 Carrito vacío</p>
        <p style={{ fontSize: "12px", margin: "0" }}>
          Busca productos para comenzar
        </p>
      </div>
    );
  }

  return (
    <div className="pos-mobile-carrito">
      <div className="pos-mobile-carrito-title">Carrito ({items.length})</div>
      {items.map((item) => (
        <div key={item.productoId} className="pos-mobile-carrito-item">
          <div className="pos-mobile-carrito-item-info">
            <div className="pos-mobile-carrito-item-nombre">{item.nombre}</div>
            <div className="pos-mobile-carrito-item-precio">
              ${item.precioUnitario.toLocaleString("es-CO")}
            </div>
          </div>
          <div className="pos-mobile-carrito-item-cantidad">
            <button
              onClick={() => onModificarCantidad(item.productoId, item.cantidad - 1)}
              className="pos-mobile-btn-small"
            >
              −
            </button>
            <input
              type="number"
              min="1"
              value={item.cantidad}
              onChange={(e) =>
                onModificarCantidad(item.productoId, parseInt(e.target.value) || 1)
              }
              className="pos-mobile-cantidad-input"
            />
            <button
              onClick={() => onModificarCantidad(item.productoId, item.cantidad + 1)}
              className="pos-mobile-btn-small"
            >
              +
            </button>
          </div>
        </div>
      ))}

      {/* Totales */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid var(--border-light)",
          backgroundColor: "var(--brand-light)",
          fontSize: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <span>Subtotal:</span>
          <span>${subtotal.toLocaleString("es-CO")}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: "14px",
            color: "var(--brand)",
          }}
        >
          <span>Total:</span>
          <span>${total.toLocaleString("es-CO")}</span>
        </div>
      </div>
    </div>
  );
}
