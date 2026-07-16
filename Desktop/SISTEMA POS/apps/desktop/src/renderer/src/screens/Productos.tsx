import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { leerArchivoComoDataUrl } from "../lib/files";
import { generarSvgCodigoBarras } from "../lib/barcode";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  precio: string | number;
  costo: string | number;
  codigoBarras: string | null;
  imagenUrl: string | null;
  varianteTitulo: string | null;
  shopifyProductId: string | null;
}

interface Coleccion {
  id: string;
  titulo: string;
  totalProductos: number;
}

interface ProductoDetalle extends Producto {
  colecciones: Coleccion[];
  variantes: Producto[];
  sucursalIds: string[];
}

const COLUMNAS_PRODUCTOS: ColumnaExport<Producto>[] = [
  { encabezado: "SKU", clave: "sku" },
  { encabezado: "Producto", clave: "nombre" },
  { encabezado: "Categoria", clave: "categoria", formato: (v) => v ?? "" },
  { encabezado: "Precio", clave: "precio", formato: (v) => String(v) },
  { encabezado: "Costo", clave: "costo", formato: (v) => String(v) },
  { encabezado: "Codigo de barras", clave: "codigoBarras", formato: (v) => v ?? "" },
];

function Miniatura({ url, size = 40 }: { url: string | null; size?: number }) {
  if (!url) {
    return <div style={{ width: size, height: size, borderRadius: 8, background: "#f3f4f6", flexShrink: 0 }} />;
  }
  return (
    <img
      src={url}
      alt=""
      style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }}
    />
  );
}

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ProductoDetalle | null>(null);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);

  const cargarLista = useCallback(async () => {
    const { data } = await api.get<Producto[]>("/productos", { params: busqueda ? { q: busqueda } : undefined });
    setProductos(data);
  }, [busqueda]);

  const cargarColecciones = useCallback(async () => {
    const { data } = await api.get<Coleccion[]>("/colecciones");
    setColecciones(data);
  }, []);

  const cargarDetalle = useCallback(async (id: string) => {
    const { data } = await api.get<ProductoDetalle>(`/productos/${id}`);
    setDetalle(data);
  }, []);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  useEffect(() => {
    cargarColecciones();
  }, [cargarColecciones]);

  useEffect(() => {
    if (seleccionadoId) cargarDetalle(seleccionadoId);
    else setDetalle(null);
  }, [seleccionadoId, cargarDetalle]);

  async function refrescarTodo() {
    await cargarLista();
    if (seleccionadoId) await cargarDetalle(seleccionadoId);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Productos</h2>
          <p>Catalogo, imagenes, variantes, colecciones y etiquetas</p>
        </div>
        <div className="toolbar">
          <BotonesExportar nombreArchivo="productos" titulo="Productos" columnas={COLUMNAS_PRODUCTOS} filas={productos} />
          <button onClick={() => setMostrarNuevo(true)} type="button">
            Nuevo producto
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 12 }}>
          <input
            placeholder="Buscar por nombre, SKU, codigo de barras o categoria"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
            {productos.length} producto{productos.length === 1 ? "" : "s"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 560, overflowY: "auto" }}>
            {productos.map((p) => (
              <div
                key={p.id}
                onClick={() => setSeleccionadoId(p.id)}
                className={`list-item${seleccionadoId === p.id ? " selected" : ""}`}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 8, borderRadius: 8, cursor: "pointer" }}
              >
                <Miniatura url={p.imagenUrl} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div title={p.nombre} style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                    {p.nombre}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    {p.sku}
                    {p.categoria ? ` · ${p.categoria}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {productos.length === 0 && <p className="empty-state">Sin resultados</p>}
          </div>
        </div>

        {detalle ? (
          <DetalleProducto
            key={detalle.id}
            producto={detalle}
            todasColecciones={colecciones}
            onActualizado={refrescarTodo}
          />
        ) : (
          <div className="card">
            <p className="empty-state">Selecciona un producto de la lista para ver su detalle</p>
          </div>
        )}
      </div>

      {mostrarNuevo && (
        <NuevoProducto
          onClose={() => setMostrarNuevo(false)}
          onCreado={(id) => {
            cargarLista();
            setSeleccionadoId(id);
          }}
        />
      )}
    </div>
  );
}

function NuevoProducto({ onClose, onCreado }: { onClose: () => void; onCreado: (id: string) => void }) {
  const { sucursales } = useSesionStore();
  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("0");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [modoSucursales, setModoSucursales] = useState<"todas" | "algunas">("todas");
  const [sucursalIds, setSucursalIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function alternarSucursal(id: string) {
    setSucursalIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const { data } = await api.post("/productos", {
        sku,
        nombre,
        categoria: categoria || undefined,
        precio: Number(precio),
        costo: Number(costo || 0),
        codigoBarras: codigoBarras || undefined,
        sucursalIds: modoSucursales === "algunas" ? sucursalIds : undefined,
      });
      onCreado(data.id);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo crear el producto");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Nuevo producto</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            SKU
            <input value={sku} onChange={(e) => setSku(e.target.value)} required />
          </label>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label>
            Categoria
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          </label>
          <label>
            Precio de venta
            <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required />
          </label>
          <label>
            Costo
            <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </label>
          <label>
            Codigo de barras (opcional, se puede generar despues)
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
          </label>
          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>Sucursales disponibles</span>
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 13 }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={modoSucursales === "todas"} onChange={() => setModoSucursales("todas")} style={{ width: "auto" }} />
                Todas las sucursales
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={modoSucursales === "algunas"} onChange={() => setModoSucursales("algunas")} style={{ width: "auto" }} />
                Solo algunas
              </label>
            </div>
            {modoSucursales === "algunas" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                {sucursales.map((s) => (
                  <label key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={sucursalIds.includes(s.id)}
                      onChange={() => alternarSucursal(s.id)}
                      style={{ width: "auto" }}
                    />
                    {s.nombre}
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button className="secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetalleProducto({
  producto,
  todasColecciones,
  onActualizado,
}: {
  producto: ProductoDetalle;
  todasColecciones: Coleccion[];
  onActualizado: () => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoria, setCategoria] = useState(producto.categoria ?? "");
  const [precio, setPrecio] = useState(String(producto.precio));
  const [costo, setCosto] = useState(String(producto.costo));
  const [codigoBarras, setCodigoBarras] = useState(producto.codigoBarras ?? "");
  const [previewImagen, setPreviewImagen] = useState<string | null>(producto.imagenUrl);
  const [archivoImagen, setArchivoImagen] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function elegirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivoImagen(file);
    setPreviewImagen(await leerArchivoComoDataUrl(file));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api.patch(`/productos/${producto.id}`, {
        nombre,
        categoria: categoria || undefined,
        precio: Number(precio),
        costo: Number(costo || 0),
        codigoBarras: codigoBarras || undefined,
      });
      if (archivoImagen) {
        const dataUrl = await leerArchivoComoDataUrl(archivoImagen);
        await api.post(`/productos/${producto.id}/imagen`, { dataUrl });
      }
      setMensaje("Cambios guardados" + (producto.shopifyProductId ? " y sincronizados con Shopify" : ""));
      onActualizado();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const idsColeccionesActuales = new Set(producto.colecciones.map((c) => c.id));

  async function alternarColeccion(coleccionId: string, pertenece: boolean) {
    if (pertenece) {
      await api.delete(`/colecciones/${coleccionId}/productos/${producto.id}`);
    } else {
      await api.post(`/colecciones/${coleccionId}/productos`, { productoId: producto.id });
    }
    onActualizado();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Miniatura url={previewImagen} size={110} />
            <label className="secondary" style={{ fontSize: 12, cursor: "pointer", padding: "6px 10px", borderRadius: 6, background: "#f3f4f6" }}>
              Cambiar imagen
              <input type="file" accept="image/*" onChange={elegirImagen} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{producto.nombre}</h3>
              {producto.shopifyProductId && <span className="badge success">Shopify</span>}
              {producto.varianteTitulo && <span className="badge neutral">{producto.varianteTitulo}</span>}
            </div>
            <div className="grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>
                Nombre
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </label>
              <label>
                Categoria
                <input value={categoria} onChange={(e) => setCategoria(e.target.value)} />
              </label>
              <label>
                Precio de venta
                <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
              </label>
              <label>
                Costo
                <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
              </label>
              <label>
                SKU
                <input value={producto.sku} disabled />
              </label>
              <label>
                Codigo de barras
                <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Si lo dejas vacio se usa el SKU" />
              </label>
            </div>
            {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
            {mensaje && <p className="badge success" style={{ marginTop: 8, width: "fit-content" }}>{mensaje}</p>}
            <button style={{ marginTop: 12 }} onClick={guardar} disabled={guardando} type="button">
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>

      <EtiquetaCard producto={producto} codigoBarras={codigoBarras} />

      <SucursalesDisponiblesCard producto={producto} onActualizado={onActualizado} />

      <VariantesCard producto={producto} onActualizado={onActualizado} />

      <div className="card">
        <h4 style={{ marginTop: 0, marginBottom: 10 }}>Colecciones</h4>
        {todasColecciones.length === 0 ? (
          <p className="empty-state">
            No hay colecciones todavia. Ve a la seccion "Colecciones" para sincronizarlas desde Shopify o crear una.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {todasColecciones.map((c) => {
              const pertenece = idsColeccionesActuales.has(c.id);
              return (
                <span
                  key={c.id}
                  className={`collection-chip${pertenece ? " active" : ""}`}
                  onClick={() => alternarColeccion(c.id, pertenece)}
                >
                  {pertenece ? "✓ " : "+ "}
                  {c.titulo}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EtiquetaCard({ producto, codigoBarras }: { producto: Producto; codigoBarras: string }) {
  const [copias, setCopias] = useState("1");
  const [imprimiendo, setImprimiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valor = codigoBarras || producto.sku;
  const svg = generarSvgCodigoBarras(valor);

  async function imprimir() {
    setImprimiendo(true);
    setError(null);
    try {
      const config = await window.pos.getConfig();
      await window.pos.printEtiquetas(
        [
          {
            svgCodigoBarras: svg,
            nombre: producto.nombre,
            sku: producto.sku,
            precio: Number(producto.precio),
            copias: Math.max(1, Number(copias) || 1),
          },
        ],
        config.printerName
      );
    } catch {
      setError("No se pudo imprimir. Revisa que haya una impresora configurada en Configuracion.");
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <div className="card">
      <h4 style={{ marginTop: 0, marginBottom: 10 }}>Etiqueta / codigo de barras</h4>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="grid-form" style={{ maxWidth: 200 }}>
          <label>
            Copias a imprimir
            <input type="number" min={1} value={copias} onChange={(e) => setCopias(e.target.value)} />
          </label>
          <button type="button" onClick={imprimir} disabled={imprimiendo}>
            {imprimiendo ? "Imprimiendo..." : "Imprimir etiqueta"}
          </button>
          {error && <span className="error-text">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function SucursalesDisponiblesCard({
  producto,
  onActualizado,
}: {
  producto: ProductoDetalle;
  onActualizado: () => void;
}) {
  const { sucursales } = useSesionStore();
  const [modo, setModo] = useState<"todas" | "algunas">(producto.sucursalIds.length > 0 ? "algunas" : "todas");
  const [sucursalIds, setSucursalIds] = useState<string[]>(producto.sucursalIds);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function alternarSucursal(id: string) {
    setSucursalIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      await api.patch(`/productos/${producto.id}`, { sucursalIds: modo === "algunas" ? sucursalIds : [] });
      setMensaje(
        producto.shopifyProductId
          ? "Guardado. Se aplico a todas las variantes de este producto."
          : "Guardado."
      );
      onActualizado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card">
      <h4 style={{ marginTop: 0, marginBottom: 4 }}>Sucursales disponibles</h4>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 10 }}>
        {producto.shopifyProductId
          ? "Aplica a todas las variantes de este producto (talla, color, etc.)."
          : "En que sucursales se puede vender este producto."}
      </p>
      <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <input type="radio" checked={modo === "todas"} onChange={() => setModo("todas")} style={{ width: "auto" }} />
          Todas las sucursales
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <input type="radio" checked={modo === "algunas"} onChange={() => setModo("algunas")} style={{ width: "auto" }} />
          Solo algunas
        </label>
      </div>
      {modo === "algunas" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
          {sucursales.map((s) => (
            <label key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={sucursalIds.includes(s.id)}
                onChange={() => alternarSucursal(s.id)}
                style={{ width: "auto" }}
              />
              {s.nombre}
            </label>
          ))}
        </div>
      )}
      {mensaje && <p className="badge success" style={{ marginTop: 10, width: "fit-content" }}>{mensaje}</p>}
      <button type="button" style={{ marginTop: 12 }} onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando..." : "Guardar disponibilidad"}
      </button>
    </div>
  );
}

function VariantesCard({ producto, onActualizado }: { producto: ProductoDetalle; onActualizado: () => void }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [opcionValor, setOpcionValor] = useState("");
  const [sku, setSku] = useState("");
  const [precio, setPrecio] = useState(String(producto.precio));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.post(`/productos/${producto.id}/variantes`, { opcionValor, sku, precio: Number(precio) });
      setMostrarForm(false);
      setOpcionValor("");
      setSku("");
      onActualizado();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo crear la variante");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0 }}>Variantes</h4>
        {producto.shopifyProductId ? (
          <button className="secondary" type="button" onClick={() => setMostrarForm((v) => !v)}>
            Agregar variante
          </button>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Conecta este producto a Shopify (guardando cambios) para poder agregar variantes
          </span>
        )}
      </div>

      {mostrarForm && (
        <form className="grid-form" onSubmit={guardar} style={{ marginBottom: 12, maxWidth: 320 }}>
          <label>
            Valor de la opcion (si el producto tiene Talla y Color, escribe "L / Rojo"; si solo tiene una opcion, escribe solo el valor)
            <input value={opcionValor} onChange={(e) => setOpcionValor(e.target.value)} required />
          </label>
          <label>
            SKU nuevo
            <input value={sku} onChange={(e) => setSku(e.target.value)} required />
          </label>
          <label>
            Precio
            <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required />
          </label>
          {error && <span className="error-text">{error}</span>}
          <button type="submit" disabled={guardando}>
            {guardando ? "Creando..." : "Crear variante"}
          </button>
        </form>
      )}

      {producto.variantes.length === 0 ? (
        <p className="empty-state">Este producto no tiene otras variantes</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Variante</th>
              <th>SKU</th>
              <th>Precio</th>
            </tr>
          </thead>
          <tbody>
            {producto.variantes.map((v) => (
              <tr key={v.id}>
                <td>{v.varianteTitulo ?? "-"}</td>
                <td>{v.sku}</td>
                <td>${Number(v.precio).toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
