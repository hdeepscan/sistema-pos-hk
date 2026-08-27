import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "../lib/api";
import { useSesionStore, usePermiso } from "../lib/store";
import { reproducir } from "../lib/sonidos";
import type { MetodoPago } from "@sistema-pos/shared";
import { mensajeError } from "../lib/errores";
import { CarritoMobile } from "../components/CarritoMobile";
import { ScannerCamera } from "../components/ScannerCamera";

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  precio: string | number;
  codigoBarras: string | null;
  imagenUrl: string | null;
  stockSucursal?: number;
}

interface ItemCarrito {
  productoId: string;
  esLibre?: boolean;
  nombre: string;
  imagenUrl: string | null;
  cantidad: number;
  precioUnitario: number;
  stockSucursal?: number;
}

interface Cliente {
  id: string;
  nombre: string;
  puntos: number;
}

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default function PosMobile() {
  const { sucursalActivaId, sucursales, empresa, usuario } = useSesionStore();
  const puedeDescuentos = usePermiso("descuentos.aplicar");
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [dineroRecibido, setDineroRecibido] = useState("");
  const [clienteId, setClienteId] = useState<string>("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarCheckout, setMostrarCheckout] = useState(false);
  const [cargandoVenta, setCargandoVenta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [buscandoPorScanner, setBuscandoPorScanner] = useState(false);

  // Cargar clientes al montar
  useEffect(() => {
    api
      .get("/clientes")
      .then(({ data }) => setClientes(data))
      .catch(() => setClientes([]));
  }, []);

  // Buscar productos
  const buscarProductos = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    try {
      const { data } = await api.get("/productos", {
        params: { q, sucursalId: sucursalActivaId, limit: 10 },
      });
      setResultados(data);
      setError(null);
    } catch (err) {
      setError(mensajeError(err, "Error al buscar productos"));
      setResultados([]);
    }
  }, [sucursalActivaId]);

  // Debounce en búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      buscarProductos(busqueda);
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda, buscarProductos]);

  // Buscar producto por código de barras (desde scanner)
  const buscarPorBarcode = useCallback(
    async (codigo: string) => {
      setBuscandoPorScanner(true);
      setError(null);
      try {
        const { data: producto } = await api.get<Producto>("/productos/buscar", {
          params: { codigo, sucursalId: sucursalActivaId },
        });

        // Agregar directamente al carrito
        agregarAlCarrito(producto);
        void reproducir("sonido_exito");
        setMostrarScanner(false); // Cerrar scanner después de escanear
      } catch (err) {
        setError(
          mensajeError(err, `Código no encontrado: ${codigo}`)
        );
        void reproducir("sonido_error");
      } finally {
        setBuscandoPorScanner(false);
      }
    },
    [sucursalActivaId]
  );

  // Agregar producto al carrito
  const agregarAlCarrito = (producto: Producto) => {
    const itemExistente = carrito.find((i) => i.productoId === producto.id);
    if (itemExistente) {
      setCarrito(
        carrito.map((i) =>
          i.productoId === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        )
      );
    } else {
      setCarrito([
        ...carrito,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          imagenUrl: producto.imagenUrl,
          cantidad: 1,
          precioUnitario: Number(producto.precio),
          stockSucursal: producto.stockSucursal,
        },
      ]);
    }
  };

  // Modificar cantidad
  const modificarCantidad = (productoId: string, cantidad: number) => {
    if (cantidad <= 0) {
      setCarrito(carrito.filter((i) => i.productoId !== productoId));
    } else {
      setCarrito(
        carrito.map((i) =>
          i.productoId === productoId ? { ...i, cantidad } : i
        )
      );
    }
  };

  // Calcular total
  const subtotal = carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
  const total = subtotal;
  const cambio = metodoPago === "EFECTIVO" ? Number(dineroRecibido) - total : 0;

  // Crear venta
  const crearVenta = async () => {
    if (carrito.length === 0) {
      setError("El carrito está vacío");
      return;
    }
    if (total <= 0) {
      setError("El total debe ser mayor a 0");
      return;
    }
    if (metodoPago === "EFECTIVO" && Number(dineroRecibido) < total) {
      setError("El dinero recibido es insuficiente");
      return;
    }

    setCargandoVenta(true);
    setError(null);

    try {
      const ventaData = {
        clienteUuid: uuidv4(),
        sucursalId: sucursalActivaId,
        clienteId: clienteId || undefined,
        metodoPago,
        dineroRecibido: metodoPago === "EFECTIVO" ? Number(dineroRecibido) : undefined,
        cambio: metodoPago === "EFECTIVO" ? cambio : undefined,
        items: carrito.map((i) => ({
          productoId: i.productoId,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
        })),
      };

      const { data: venta } = await api.post("/ventas", ventaData);

      // Éxito
      void reproducir("sonido_venta_exitosa");
      alert(`✅ Venta registrada #${venta.consecutivo}\nTotal: $${total.toLocaleString("es-CO")}`);

      // Limpiar
      setCarrito([]);
      setDineroRecibido("");
      setClienteId("");
      setMostrarCheckout(false);
      setMetodoPago("EFECTIVO");
    } catch (err) {
      setError(mensajeError(err, "Error al registrar la venta"));
    } finally {
      setCargandoVenta(false);
    }
  };

  return (
    <div className="pos-mobile">
      {/* Header minimalista */}
      <div className="pos-mobile-header">
        <div>
          <h2 style={{ margin: 0 }}>POS Móvil</h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            {sucursalActiva?.nombre}
          </p>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          Items: <strong>{carrito.length}</strong>
        </div>
      </div>

      {/* Búsqueda o Scanner */}
      {!mostrarScanner ? (
        <div className="pos-mobile-search">
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
              className="pos-mobile-search-input"
              style={{ flex: 1 }}
            />
            <button
              className="pos-mobile-btn-scanner"
              onClick={() => setMostrarScanner(true)}
              title="Escanear código de barras"
            >
              📷
            </button>
          </div>
        </div>
      ) : (
        <div className="pos-mobile-search">
          <button
            className="pos-mobile-btn-secondary"
            onClick={() => setMostrarScanner(false)}
            style={{ width: "100%" }}
          >
            ← Volver a búsqueda manual
          </button>
        </div>
      )}

      {/* Resultados o Carrito o Scanner */}
      <div className="pos-mobile-content">
        {!mostrarCheckout ? (
          <>
            {/* Scanner */}
            {mostrarScanner ? (
              <ScannerCamera
                onScan={(codigo) => {
                  if (!buscandoPorScanner) {
                    void buscarPorBarcode(codigo);
                  }
                }}
                onError={(err) => setError(err)}
              />
            ) : null}

            {/* Resultados de búsqueda */}
            {!mostrarScanner && resultados.length > 0 && (
              <div className="pos-mobile-resultados">
                {resultados.map((prod) => (
                  <div
                    key={prod.id}
                    className="pos-mobile-resultado-item"
                    onClick={() => agregarAlCarrito(prod)}
                  >
                    {prod.imagenUrl && (
                      <img
                        src={prod.imagenUrl}
                        alt={prod.nombre}
                        className="pos-mobile-resultado-img"
                      />
                    )}
                    <div className="pos-mobile-resultado-info">
                      <div className="pos-mobile-resultado-nombre">{prod.nombre}</div>
                      <div className="pos-mobile-resultado-sku">{prod.sku}</div>
                    </div>
                    <div className="pos-mobile-resultado-precio">
                      ${Number(prod.precio).toLocaleString("es-CO")}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Carrito */}
            <CarritoMobile
              items={carrito}
              onModificarCantidad={modificarCantidad}
              total={total}
              subtotal={subtotal}
            />

            {/* Errores */}
            {error && (
              <div className="pos-mobile-error">
                <strong>⚠️ Error:</strong> {error}
              </div>
            )}
          </>
        ) : (
          /* Checkout */
          <div className="pos-mobile-checkout">
            <h3>Resumen de Venta</h3>

            {/* Items resumen */}
            <div className="pos-mobile-checkout-items">
              {carrito.map((item) => (
                <div key={item.productoId} className="pos-mobile-checkout-item">
                  <span>{item.cantidad}x {item.nombre}</span>
                  <span>${(item.cantidad * item.precioUnitario).toLocaleString("es-CO")}</span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="pos-mobile-checkout-totals">
              <div className="pos-mobile-total-row">
                <span>Subtotal:</span>
                <span>${subtotal.toLocaleString("es-CO")}</span>
              </div>
              <div className="pos-mobile-total-row total">
                <span>Total:</span>
                <span>${total.toLocaleString("es-CO")}</span>
              </div>
            </div>

            {/* Cliente */}
            <div className="pos-mobile-field">
              <label>Cliente (opcional)</label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="pos-mobile-select"
              >
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Método de pago */}
            <div className="pos-mobile-field">
              <label>Método de Pago</label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                className="pos-mobile-select"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            {/* Dinero recibido (si es efectivo) */}
            {metodoPago === "EFECTIVO" && (
              <>
                <div className="pos-mobile-field">
                  <label>Dinero Recibido</label>
                  <input
                    type="number"
                    value={dineroRecibido}
                    onChange={(e) => setDineroRecibido(e.target.value)}
                    placeholder="0"
                    className="pos-mobile-input"
                  />
                </div>
                {cambio >= 0 && dineroRecibido && (
                  <div className="pos-mobile-cambio">
                    Cambio: ${cambio.toLocaleString("es-CO")}
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="pos-mobile-error">
                <strong>⚠️ Error:</strong> {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer con acciones */}
      <div className="pos-mobile-footer">
        {!mostrarCheckout ? (
          <>
            <button
              className="pos-mobile-btn-secondary"
              onClick={() => {
                setCarrito([]);
                setBusqueda("");
              }}
              disabled={carrito.length === 0}
            >
              Limpiar
            </button>
            <button
              className="pos-mobile-btn-primary"
              onClick={() => setMostrarCheckout(true)}
              disabled={carrito.length === 0}
            >
              Cobrar
              {carrito.length > 0 && ` $${total.toLocaleString("es-CO")}`}
            </button>
          </>
        ) : (
          <>
            <button
              className="pos-mobile-btn-secondary"
              onClick={() => setMostrarCheckout(false)}
              disabled={cargandoVenta}
            >
              Volver
            </button>
            <button
              className="pos-mobile-btn-primary"
              onClick={() => crearVenta()}
              disabled={cargandoVenta}
            >
              {cargandoVenta ? "Procesando..." : "Confirmar Venta"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
