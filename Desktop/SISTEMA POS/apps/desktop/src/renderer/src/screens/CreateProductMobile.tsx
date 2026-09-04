import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore, usePermiso } from "../lib/store";
import { mensajeError } from "../lib/errores";
import { reproducir } from "../lib/sonidos";
import { ScannerCamera } from "../components/ScannerCamera";

interface Variante {
  nombre: string;
  sku: string;
  precio: number;
}

export default function CreateProductMobile({ onClose }: { onClose: () => void }) {
  const { sucursalActivaId, sucursales } = useSesionStore();
  const puedeCrearProductos = usePermiso("productos.administrar");

  const [nombre, setNombre] = useState("");
  const [sku, setSku] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [precioCosto, setPrecioCosto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [nuevoVariante, setNuevoVariante] = useState({ nombre: "", sku: "", precio: "" });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);

  // Cargar categorías
  useEffect(() => {
    api
      .get("/categorias")
      .then(({ data }) => setCategorias(data.map((c: any) => c.nombre)))
      .catch(() => setCategorias([]));
  }, []);

  if (!puedeCrearProductos) {
    return (
      <div className="pos-mobile-error" style={{ padding: "16px" }}>
        <strong>⚠️ Permiso Denegado</strong>
        <p>No tienes permiso para crear productos.</p>
        <button
          onClick={onClose}
          className="pos-mobile-btn-secondary"
          style={{ width: "100%", marginTop: "12px" }}
        >
          Cerrar
        </button>
      </div>
    );
  }

  const buscarPorBarcode = useCallback(
    async (codigo: string) => {
      setCodigoBarras(codigo);
      setMostrarScanner(false);
      void reproducir("sonido_exito");
    },
    []
  );

  const agregarVariante = () => {
    if (!nuevoVariante.nombre.trim() || !nuevoVariante.sku.trim() || !nuevoVariante.precio.trim()) {
      setError("Completa todos los campos de la variante");
      return;
    }

    setVariantes([
      ...variantes,
      {
        nombre: nuevoVariante.nombre,
        sku: nuevoVariante.sku,
        precio: Number(nuevoVariante.precio),
      },
    ]);
    setNuevoVariante({ nombre: "", sku: "", precio: "" });
    setError(null);
  };

  const eliminarVariante = (index: number) => {
    setVariantes(variantes.filter((_, i) => i !== index));
  };

  const crearProducto = async () => {
    // Validaciones
    if (!nombre.trim()) {
      setError("El nombre del producto es requerido");
      return;
    }
    if (!sku.trim()) {
      setError("El SKU es requerido");
      return;
    }
    if (!precioVenta.trim() || Number(precioVenta) <= 0) {
      setError("El precio de venta debe ser mayor a 0");
      return;
    }
    if (precioCosto && Number(precioCosto) < 0) {
      setError("El precio de costo no puede ser negativo");
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const productoData = {
        nombre: nombre.trim(),
        sku: sku.trim(),
        codigoBarras: codigoBarras.trim() || null,
        precioVenta: Number(precioVenta),
        precioCosto: precioCosto ? Number(precioCosto) : 0,
        categoria: categoria.trim() || "Sin categoría",
        descripcion: descripcion.trim() || null,
        variantes: variantes.length > 0 ? variantes : undefined,
        sucursalId: sucursalActivaId,
      };

      const { data: nuevoProducto } = await api.post("/productos", productoData);

      void reproducir("sonido_exito");
      alert(`✅ Producto creado:\n${nuevoProducto.nombre}\nSKU: ${nuevoProducto.sku}`);

      // Limpiar formulario
      setNombre("");
      setSku("");
      setCodigoBarras("");
      setPrecioVenta("");
      setPrecioCosto("");
      setCategoria("");
      setDescripcion("");
      setVariantes([]);

      // Cerrar modal
      setTimeout(() => onClose(), 500);
    } catch (err) {
      setError(mensajeError(err, "Error al crear el producto"));
      void reproducir("sonido_error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="pos-mobile-create-product">
      <div className="pos-mobile-create-header">
        <h2>Crear Producto</h2>
        <button
          className="pos-mobile-btn-close"
          onClick={onClose}
          title="Cerrar"
        >
          ✕
        </button>
      </div>

      <div className="pos-mobile-create-content">
        {/* Información Básica */}
        <div className="pos-mobile-section">
          <h3>Información Básica</h3>

          <div className="pos-mobile-field">
            <label>Nombre del Producto *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Camiseta Azul"
              className="pos-mobile-input"
            />
          </div>

          <div className="pos-mobile-field">
            <label>SKU *</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Ej: CAMI-001"
              className="pos-mobile-input"
            />
          </div>

          <div className="pos-mobile-field">
            <label>Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción del producto..."
              className="pos-mobile-input"
              style={{ minHeight: "60px" }}
            />
          </div>
        </div>

        {/* Código de Barras */}
        <div className="pos-mobile-section">
          <h3>Código de Barras</h3>

          {!mostrarScanner ? (
            <>
              <div className="pos-mobile-field">
                <label>Código de Barras</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={codigoBarras}
                    onChange={(e) => setCodigoBarras(e.target.value)}
                    placeholder="Capturar con cámara o ingresar"
                    className="pos-mobile-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="pos-mobile-btn-scanner"
                    onClick={() => setMostrarScanner(true)}
                    title="Escanear código"
                  >
                    📷
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <ScannerCamera
                onScan={(codigo) => buscarPorBarcode(codigo)}
                onError={(err) => setError(err)}
              />
              <button
                className="pos-mobile-btn-secondary"
                onClick={() => setMostrarScanner(false)}
                style={{ width: "100%", marginTop: "12px" }}
              >
                ← Cancelar escaneo
              </button>
            </>
          )}
        </div>

        {/* Precios */}
        <div className="pos-mobile-section">
          <h3>Precios</h3>

          <div className="pos-mobile-field">
            <label>Precio de Venta *</label>
            <input
              type="number"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              placeholder="0"
              className="pos-mobile-input"
              min="0"
              step="0.01"
            />
          </div>

          <div className="pos-mobile-field">
            <label>Precio de Costo</label>
            <input
              type="number"
              value={precioCosto}
              onChange={(e) => setPrecioCosto(e.target.value)}
              placeholder="0"
              className="pos-mobile-input"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        {/* Categoría */}
        <div className="pos-mobile-section">
          <h3>Categoría</h3>

          <div className="pos-mobile-field">
            <label>Categoría</label>
            {categorias.length > 0 ? (
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="pos-mobile-select">
                <option value="">Selecciona una categoría</option>
                {categorias.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Ej: Ropa"
                className="pos-mobile-input"
              />
            )}
          </div>
        </div>

        {/* Variantes */}
        <div className="pos-mobile-section">
          <h3>Variantes (Opcional)</h3>

          {variantes.length > 0 && (
            <div className="pos-mobile-variantes-list">
              {variantes.map((v, idx) => (
                <div key={idx} className="pos-mobile-variante-item">
                  <div>
                    <strong>{v.nombre}</strong> - SKU: {v.sku}
                    <br />
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      ${v.precio.toLocaleString("es-CO")}
                    </span>
                  </div>
                  <button
                    onClick={() => eliminarVariante(idx)}
                    className="pos-mobile-btn-delete"
                    title="Eliminar variante"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pos-mobile-field">
            <label>Nombre de Variante (Ej: Talla, Color)</label>
            <input
              type="text"
              value={nuevoVariante.nombre}
              onChange={(e) => setNuevoVariante({ ...nuevoVariante, nombre: e.target.value })}
              placeholder="Ej: Talla M"
              className="pos-mobile-input"
            />
          </div>

          <div className="pos-mobile-field">
            <label>SKU de Variante</label>
            <input
              type="text"
              value={nuevoVariante.sku}
              onChange={(e) => setNuevoVariante({ ...nuevoVariante, sku: e.target.value })}
              placeholder="Ej: CAMI-001-M"
              className="pos-mobile-input"
            />
          </div>

          <div className="pos-mobile-field">
            <label>Precio de Variante</label>
            <input
              type="number"
              value={nuevoVariante.precio}
              onChange={(e) => setNuevoVariante({ ...nuevoVariante, precio: e.target.value })}
              placeholder="0"
              className="pos-mobile-input"
              min="0"
              step="0.01"
            />
          </div>

          <button
            onClick={agregarVariante}
            className="pos-mobile-btn-secondary"
            style={{ width: "100%" }}
          >
            + Agregar Variante
          </button>
        </div>

        {/* Errores */}
        {error && (
          <div className="pos-mobile-error">
            <strong>⚠️ Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pos-mobile-create-footer">
        <button
          onClick={onClose}
          className="pos-mobile-btn-secondary"
          disabled={cargando}
        >
          Cancelar
        </button>
        <button
          onClick={crearProducto}
          className="pos-mobile-btn-primary"
          disabled={cargando}
        >
          {cargando ? "Creando..." : "Crear Producto"}
        </button>
      </div>
    </div>
  );
}
