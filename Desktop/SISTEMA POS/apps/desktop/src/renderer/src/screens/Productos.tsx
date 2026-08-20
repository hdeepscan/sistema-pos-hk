import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { leerArchivoComoDataUrl } from "../lib/files";
import { generarSvgCodigoBarras, generarCodigoBarrasEan13 } from "../lib/barcode";
import { BotonesExportar } from "../lib/BotonesExportar";
import { ModalImportarProductos } from "../lib/ModalImportarProductos";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";
import { electronAPI } from "../lib/electron-api";
import { NuevoProductoInteligente } from "./NuevoProductoInteligente";
import type { EtiquetaFormato } from "../../../shared/api-types";
import {
  IconoInfo,
  IconoPrecio,
  IconoImagen,
  IconoInventario,
  IconoColeccion,
  IconoBasura,
  IconoEstrella,
  IconoMas,
} from "../lib/iconos";

// Convierte la variante en lineas legibles: si hay nombres de opcion
// (grupoOpciones "Color|Talla") y valores (varianteTitulo "Rojo / M") devuelve
// ["Color: Rojo", "Talla: M"]; si no hay nombres, solo los valores.
function lineasVariante(u: { varianteTitulo: string | null; grupoOpciones: string | null }): string[] {
  if (!u.varianteTitulo) return [];
  const valores = u.varianteTitulo.split("/").map((v) => v.trim()).filter(Boolean);
  const nombres = u.grupoOpciones ? u.grupoOpciones.split("|").map((n) => n.trim()) : [];
  return valores.map((valor, i) => (nombres[i] ? `${nombres[i]}: ${valor}` : valor));
}

const FORMATOS_ETIQUETA: { valor: EtiquetaFormato; titulo: string; detalle: string }[] = [
  {
    valor: "rollo2",
    titulo: "Rollo · 2 por fila",
    detalle: "Etiquetas 50 × 25 mm en rollo termico, salen de dos en dos (como el rollo de la tienda).",
  },
  {
    valor: "rollo1",
    titulo: "Rollo · 1 por fila",
    detalle: "Etiquetas 50 × 25 mm en rollo termico, una sola por fila (media hoja).",
  },
  {
    valor: "zebra3",
    titulo: "Zebra ZT230 · 3 por fila",
    detalle: "Impresora Zebra ZT230, 3 etiquetas por fila (~33.3 × 25 mm), optimizado para rollo de 104mm de ancho.",
  },
  {
    valor: "carta",
    titulo: "Hoja tamaño carta",
    detalle: "Hoja carta en impresora normal, varias etiquetas por hoja para recortar.",
  },
];

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  marca: string | null;
  descripcion: string | null;
  impuestoPorcentaje: string | number | null;
  proveedorId: string | null;
  stockMinimo: number | null;
  activo: boolean;
  precio: string | number;
  costo: string | number;
  codigoBarras: string | null;
  imagenUrl: string | null;
  varianteTitulo: string | null;
  grupoOpciones: string | null;
  shopifyProductId: string | null;
  grupoVariantes: string | null;
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
  const [modalImportarAbierto, setModalImportarAbierto] = useState(false);

  const cargarLista = useCallback(async () => {
    const { data } = await api.get<Producto[]>("/productos", { params: busqueda ? { q: busqueda } : undefined });
    setProductos(data);
  }, [busqueda]);

  // Agrupa las variantes de un mismo producto en una sola entrada (por
  // shopifyProductId o grupoVariantes). Se muestra un representante con el
  // numero de variantes; el detalle lista todas las variantes.
  const productosAgrupados = useMemo(() => {
    const grupos = new Map<string, { representante: Producto; total: number }>();
    for (const p of productos) {
      const clave = p.shopifyProductId ?? p.grupoVariantes ?? p.id;
      const existente = grupos.get(clave);
      if (existente) {
        existente.total += 1;
      } else {
        grupos.set(clave, { representante: p, total: 1 });
      }
    }
    return Array.from(grupos.values());
  }, [productos]);

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
          <button onClick={() => setModalImportarAbierto(true)} type="button" className="secondary">
            <IconoMas /> Importar CSV
          </button>
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
            {productosAgrupados.length} producto{productosAgrupados.length === 1 ? "" : "s"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 560, overflowY: "auto" }}>
            {productosAgrupados.map(({ representante: p, total }) => {
              const seleccionadoEnGrupo =
                detalle &&
                (detalle.id === p.id ||
                  (p.shopifyProductId && detalle.shopifyProductId === p.shopifyProductId) ||
                  (p.grupoVariantes && detalle.grupoVariantes === p.grupoVariantes));
              return (
                <div
                  key={p.id}
                  onClick={() => setSeleccionadoId(p.id)}
                  className={`list-item${seleccionadoEnGrupo ? " selected" : ""}`}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 8, borderRadius: 8, cursor: "pointer" }}
                >
                  <Miniatura url={p.imagenUrl} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div title={p.nombre} style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                      {p.nombre}
                      {total > 1 && (
                        <span className="badge neutral" style={{ marginLeft: 6 }}>
                          {total} variantes
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {total > 1 ? p.categoria ?? "Varias variantes" : p.sku + (p.categoria ? ` · ${p.categoria}` : "")}
                    </div>
                  </div>
                </div>
              );
            })}
            {productosAgrupados.length === 0 && <p className="empty-state">Sin resultados</p>}
          </div>
        </div>

        {detalle ? (
          <DetalleProducto
            key={detalle.id}
            producto={detalle}
            todasColecciones={colecciones}
            onActualizado={refrescarTodo}
            onEliminado={() => {
              setSeleccionadoId(null);
              setDetalle(null);
              cargarLista();
            }}
          />
        ) : (
          <div className="card">
            <p className="empty-state">Selecciona un producto de la lista para ver su detalle</p>
          </div>
        )}
      </div>

      {mostrarNuevo && (
        <NuevoProductoInteligente
          onClose={() => setMostrarNuevo(false)}
          onCreado={() => {
            cargarLista();
          }}
        />
      )}

      <ModalImportarProductos
        abierto={modalImportarAbierto}
        onCerrar={() => setModalImportarAbierto(false)}
        onSuccess={() => {
          cargarLista();
        }}
      />
    </div>
  );
}

// Tarjeta de seccion con estilo moderno (esquinas redondeadas, sombra suave,
// titulo con icono) para organizar la edicion del producto.
function Seccion({
  icono,
  titulo,
  subtitulo,
  aside,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  subtitulo?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface, #fff)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--brand-light, #eef2ff)",
              color: "var(--brand, #4f46e5)",
              flexShrink: 0,
            }}
          >
            {icono}
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</div>
            {subtitulo && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subtitulo}</div>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// Inventario del producto y sus variantes por sucursal, editable en linea.
interface UnidadInventario {
  id: string;
  sku: string;
  nombre: string;
  varianteTitulo: string | null;
  grupoOpciones: string | null;
  stock: { sucursalId: string; cantidad: number }[];
}

function InventarioSection({ producto, onActualizado }: { producto: ProductoDetalle; onActualizado: () => void }) {
  const [data, setData] = useState<{
    sucursales: { id: string; nombre: string }[];
    unidades: UnidadInventario[];
  } | null>(null);
  const [editado, setEditado] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api
      .get(`/productos/${producto.id}/inventario`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }, [producto.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar() {
    if (!data) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      for (const [clave, valor] of Object.entries(editado)) {
        const [unidadId, sucursalId] = clave.split("::");
        await api.patch("/inventario/ajustar-directo", {
          productoId: unidadId,
          sucursalId,
          cantidad: Number(valor) || 0,
        });
      }
      setEditado({});
      setMensaje("Stock actualizado");
      cargar();
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo actualizar el stock"));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarVariante(u: UnidadInventario) {
    const nombre = [u.nombre, ...lineasVariante(u)].filter(Boolean).join(" · ");
    if (!confirm(`¿Eliminar la variante "${nombre}"? Se quitara del POS y de Shopify.`)) return;
    setError(null);
    try {
      const { data } = await api.delete(`/productos/${u.id}/variante`);
      if (data?.shopifyError) alert(`${data.mensaje}\n\nOjo en Shopify: ${data.shopifyError}`);
      cargar();
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo eliminar la variante"));
    }
  }

  if (!data) return <p className="empty-state">Cargando inventario...</p>;
  const hayVariantes = data.unidades.length > 1;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Variante</th>
            {data.sucursales.map((s) => (
              <th key={s.id} style={{ textAlign: "center" }}>
                {s.nombre}
              </th>
            ))}
            {hayVariantes && <th></th>}
          </tr>
        </thead>
        <tbody>
          {data.unidades.map((u) => {
            const lineas = lineasVariante(u);
            return (
              <tr key={u.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                  {lineas.length > 0 ? (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{lineas.join(" · ")}</div>
                  ) : null}
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.sku}</div>
                </td>
                {data.sucursales.map((s) => {
                  const clave = `${u.id}::${s.id}`;
                  const actual = u.stock.find((x) => x.sucursalId === s.id)?.cantidad ?? 0;
                  return (
                    <td key={s.id} style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        min={0}
                        value={editado[clave] ?? String(actual)}
                        onChange={(e) =>
                          setEditado((p) => ({ ...p, [clave]: String(Math.max(0, Number(e.target.value) || 0)) }))
                        }
                        style={{ width: 68, textAlign: "center" }}
                      />
                    </td>
                  );
                })}
                {hayVariantes && (
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="secondary"
                      title="Eliminar variante"
                      onClick={() => eliminarVariante(u)}
                      style={{ padding: "4px 8px", display: "inline-flex", alignItems: "center", color: "var(--danger,#dc2626)" }}
                    >
                      <IconoBasura size={16} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button type="button" onClick={guardar} disabled={guardando || Object.keys(editado).length === 0}>
          {guardando ? "Guardando..." : "Guardar stock"}
        </button>
        {mensaje && <span className="badge success">{mensaje}</span>}
        {error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}

// Galeria de imagenes del producto: subir varias, elegir principal, eliminar.
function GaleriaSection({ producto, onActualizado }: { producto: ProductoDetalle; onActualizado: () => void }) {
  const [imagenes, setImagenes] = useState<{ id: string; url: string; esPrincipal: boolean }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api
      .get<{ id: string; url: string; esPrincipal: boolean }[]>(`/productos/${producto.id}/imagenes`)
      .then(({ data }) => setImagenes(data))
      .catch(() => setImagenes([]));
  }, [producto.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function agregar(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    setSubiendo(true);
    setError(null);
    try {
      const dataUrls = await Promise.all(arr.map(leerArchivoComoDataUrl));
      await api.post(`/productos/${producto.id}/imagenes`, { imagenesDataUrl: dataUrls });
      cargar();
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudieron subir las imagenes"));
    } finally {
      setSubiendo(false);
    }
  }

  async function hacerPrincipal(id: string) {
    await api.patch(`/productos/${producto.id}/imagenes/${id}/principal`).catch(() => {});
    cargar();
    onActualizado();
  }

  async function eliminar(id: string) {
    await api.delete(`/productos/${producto.id}/imagenes/${id}`).catch(() => {});
    cargar();
    onActualizado();
  }

  return (
    <div>
      {imagenes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          {imagenes.map((img) => (
            <div key={img.id} style={{ width: 110 }}>
              <div style={{ position: "relative" }}>
                <img
                  src={img.url}
                  alt=""
                  style={{
                    width: 110,
                    height: 110,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: img.esPrincipal ? "2px solid var(--brand, #4f46e5)" : "1px solid var(--border)",
                  }}
                />
                {img.esPrincipal && (
                  <span className="badge success" style={{ position: "absolute", top: 4, left: 4, fontSize: 9 }}>
                    Principal
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
                {!img.esPrincipal && (
                  <button
                    type="button"
                    className="secondary"
                    title="Marcar como principal"
                    style={{ padding: "3px 7px", display: "inline-flex" }}
                    onClick={() => hacerPrincipal(img.id)}
                  >
                    <IconoEstrella size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  title="Eliminar imagen"
                  style={{ padding: "3px 7px", display: "inline-flex", color: "var(--danger,#dc2626)" }}
                  onClick={() => eliminar(img.id)}
                >
                  <IconoBasura size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) agregar(e.dataTransfer.files);
        }}
        style={{
          border: "1.5px dashed var(--border)",
          borderRadius: 12,
          padding: 18,
          textAlign: "center",
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        {subiendo ? (
          "Subiendo imagenes..."
        ) : (
          <>
            Arrastra imagenes aqui o{" "}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--brand,#4f46e5)", cursor: "pointer", fontWeight: 600 }}>
              <IconoMas size={15} /> Cargar mas imagenes
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => e.target.files && agregar(e.target.files)}
              />
            </label>
          </>
        )}
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function DetalleProducto({
  producto,
  todasColecciones,
  onActualizado,
  onEliminado,
}: {
  producto: ProductoDetalle;
  todasColecciones: Coleccion[];
  onActualizado: () => void;
  onEliminado: () => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoria, setCategoria] = useState(producto.categoria ?? "");
  const [marca, setMarca] = useState(producto.marca ?? "");
  const [proveedorId, setProveedorId] = useState(producto.proveedorId ?? "");
  const [precio, setPrecio] = useState(String(producto.precio));
  const [costo, setCosto] = useState(String(producto.costo));
  const [sku, setSku] = useState(producto.sku);
  const [codigoBarras, setCodigoBarras] = useState(producto.codigoBarras ?? "");
  const [impuesto, setImpuesto] = useState(String(producto.impuestoPorcentaje ?? 0));
  const [stockMinimo, setStockMinimo] = useState(String(producto.stockMinimo ?? 0));
  const [descripcion, setDescripcion] = useState(producto.descripcion ?? "");
  const [activo, setActivo] = useState(producto.activo ?? true);
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [previewImagen, setPreviewImagen] = useState<string | null>(producto.imagenUrl);
  const [archivoImagen, setArchivoImagen] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);

  async function reintentarShopify() {
    setAccionando(true);
    setError(null);
    setMensaje(null);
    try {
      const { data } = await api.post(`/productos/${producto.id}/sincronizar-shopify`);
      setMensaje(data?.mensaje ?? "Sincronizado con Shopify");
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo sincronizar con Shopify"));
    } finally {
      setAccionando(false);
    }
  }

  async function eliminarProducto() {
    const cuantas = producto.variantes.length;
    const texto =
      cuantas > 0
        ? `¿Eliminar "${producto.nombre}" y sus ${cuantas} variante(s)? Se quitara del POS y de Shopify. Esta accion no se puede deshacer.`
        : `¿Eliminar "${producto.nombre}"? Se quitara del POS y de Shopify. Esta accion no se puede deshacer.`;
    if (!confirm(texto)) return;
    setAccionando(true);
    setError(null);
    try {
      const { data } = await api.delete(`/productos/${producto.id}`);
      if (data?.shopifyError) {
        alert(`${data.mensaje}\n\nOjo: hubo un problema al eliminar en Shopify: ${data.shopifyError}`);
      }
      onEliminado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo eliminar el producto"));
      setAccionando(false);
    }
  }

  useEffect(() => {
    api.get<{ id: string; nombre: string }[]>("/proveedores").then(({ data }) => setProveedores(data)).catch(() => setProveedores([]));
    api.get<string[]>("/productos/categorias").then(({ data }) => setCategorias(data)).catch(() => setCategorias([]));
  }, []);

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
        categoria: categoria || null,
        marca: marca || null,
        proveedorId: proveedorId || null,
        sku,
        precio: Number(precio),
        costo: Number(costo || 0),
        codigoBarras: codigoBarras || null,
        impuestoPorcentaje: Number(impuesto || 0),
        stockMinimo: Number(stockMinimo || 0),
        descripcion: descripcion || null,
        activo,
      });
      if (archivoImagen) {
        const dataUrl = await leerArchivoComoDataUrl(archivoImagen);
        await api.post(`/productos/${producto.id}/imagen`, { dataUrl });
      }
      setMensaje("Cambios guardados" + (producto.shopifyProductId ? " y sincronizados con Shopify" : ""));
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar"));
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
      {/* Encabezado con imagen, nombre, estado y acciones */}
      <div
        style={{
          background: "var(--surface, #fff)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        <Miniatura url={previewImagen} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{producto.nombre}</h3>
            {producto.varianteTitulo && <span className="badge neutral">{producto.varianteTitulo}</span>}
            <span className={`badge ${activo ? "success" : "neutral"}`}>{activo ? "Activo" : "Inactivo"}</span>
            {producto.shopifyProductId ? (
              <span className="badge success">Shopify</span>
            ) : (
              <span className="badge warning">Sin Shopify</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{producto.sku}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="secondary" onClick={reintentarShopify} disabled={accionando}>
            {accionando ? "..." : "Reintentar Shopify"}
          </button>
          <button
            type="button"
            onClick={eliminarProducto}
            disabled={accionando}
            style={{ background: "var(--danger, #dc2626)", color: "#fff" }}
          >
            Eliminar
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      {mensaje && <span className="badge success" style={{ width: "fit-content" }}>{mensaje}</span>}

      {/* Informacion general */}
      <Seccion icono={<IconoInfo />} titulo="Informacion general" subtitulo="Nombre, categoria, marca, proveedor y descripcion">
        <div className="grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label>
            Categoria
            <input
              list="categorias-detalle"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Escribe o elige una existente"
            />
            <datalist id="categorias-detalle">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            Marca
            <input value={marca} onChange={(e) => setMarca(e.target.value)} />
          </label>
          <label>
            Proveedor
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Descripcion
            <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ width: "auto" }} />
            Producto activo (visible en el POS)
          </label>
        </div>
      </Seccion>

      {/* Precios, impuestos e identificadores */}
      <Seccion icono={<IconoPrecio />} titulo="Precios e identificadores" subtitulo="Costo, precio, impuesto, SKU y codigo de barras">
        <div className="grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label>
            Precio de compra (costo)
            <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </label>
          <label>
            Precio de venta
            <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <label>
            Impuesto (%)
            <input type="number" step="0.01" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} />
          </label>
          <label>
            SKU
            <input value={sku} onChange={(e) => setSku(e.target.value)} />
          </label>
          <label>
            Codigo de barras
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Si lo dejas vacio se usa el SKU" />
          </label>
          <label>
            Stock minimo (aviso reposicion)
            <input type="number" min={0} value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
          </label>
        </div>
      </Seccion>

      {/* Galeria de imagenes */}
      <Seccion icono={<IconoImagen />} titulo="Imagenes" subtitulo="Sube varias, elige la principal y sincroniza con Shopify">
        <GaleriaSection producto={producto} onActualizado={onActualizado} />
      </Seccion>

      {/* Inventario por sucursal */}
      <Seccion icono={<IconoInventario />} titulo="Inventario por sucursal" subtitulo="Ajusta el stock de cada variante en cada sucursal">
        <InventarioSection producto={producto} onActualizado={onActualizado} />
      </Seccion>

      {/* Variantes, disponibilidad y etiquetas (tarjetas propias) */}
      <VariantesCard producto={producto} onActualizado={onActualizado} />
      <SucursalesDisponiblesCard producto={producto} onActualizado={onActualizado} />
      <EtiquetaCard producto={producto} onActualizado={onActualizado} />

      {/* Colecciones */}
      <Seccion icono={<IconoColeccion />} titulo="Colecciones" subtitulo="Agrupa el producto en colecciones de Shopify">
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
      </Seccion>
    </div>
  );
}

function EtiquetaCard({ producto, onActualizado }: { producto: ProductoDetalle; onActualizado: () => void }) {
  // Cada unidad imprimible es el producto (representante) mas sus variantes;
  // cada una lleva su propio codigo de barras.
  const unidades = useMemo(() => [producto, ...producto.variantes], [producto]);
  const tieneVariantes = producto.variantes.length > 0;
  const faltanCodigos = unidades.filter((u) => !u.codigoBarras).length;

  const [copias, setCopias] = useState<Record<string, number>>(() => ({ [producto.id]: 1 }));
  const [formato, setFormato] = useState<EtiquetaFormato>("rollo2");
  const [imprimiendo, setImprimiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [codigoTmp, setCodigoTmp] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Precalcula el SVG de cada unidad (no cambia al variar las copias).
  const svgPorUnidad = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of unidades) map[u.id] = generarSvgCodigoBarras(u.codigoBarras || u.sku);
    return map;
  }, [unidades]);

  function setCopiasUnidad(id: string, n: number) {
    setCopias((prev) => ({ ...prev, [id]: Math.max(0, n) }));
    setMensaje(null);
  }

  function ponerATodas(n: number) {
    setCopias(Object.fromEntries(unidades.map((u) => [u.id, n])));
    setMensaje(null);
  }

  const totalEtiquetas = unidades.reduce((acc, u) => acc + (copias[u.id] || 0), 0);

  async function guardarCodigo(id: string, valor: string | null) {
    setOcupado(true);
    setError(null);
    try {
      await api.patch(`/productos/${id}`, { codigoBarras: valor || null });
      setEditando(null);
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar el codigo"));
    } finally {
      setOcupado(false);
    }
  }

  async function generarFaltantes() {
    setOcupado(true);
    setError(null);
    try {
      for (const u of unidades) {
        if (!u.codigoBarras) {
          await api.patch(`/productos/${u.id}`, { codigoBarras: generarCodigoBarrasEan13() });
        }
      }
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudieron generar los codigos"));
    } finally {
      setOcupado(false);
    }
  }

  async function imprimir() {
    setImprimiendo(true);
    setError(null);
    setMensaje(null);
    try {
      const items = unidades
        .filter((u) => (copias[u.id] || 0) > 0)
        .map((u) => ({
          svgCodigoBarras: svgPorUnidad[u.id],
          nombre: u.nombre,
          variante: lineasVariante(u).join(" · ") || undefined,
          sku: u.sku,
          precio: Number(u.precio),
          copias: copias[u.id],
        }));
      if (items.length === 0) {
        setError("Elige al menos una etiqueta para imprimir.");
        return;
      }
      const config = await electronAPI.getConfig();
      await electronAPI.printEtiquetas(items, config.printerName, formato);
      setMensaje(`${totalEtiquetas} etiqueta${totalEtiquetas === 1 ? "" : "s"} enviada${totalEtiquetas === 1 ? "" : "s"} a la impresora`);
    } catch {
      setError("No se pudo imprimir. Revisa que haya una impresora configurada en Configuracion.");
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h4 style={{ margin: 0 }}>Etiquetas / codigos de barras</h4>
        <div style={{ display: "flex", gap: 6 }}>
          {faltanCodigos > 0 && (
            <button type="button" className="secondary" style={{ padding: "4px 10px" }} onClick={generarFaltantes} disabled={ocupado}>
              Generar {faltanCodigos} codigo{faltanCodigos === 1 ? "" : "s"} faltante{faltanCodigos === 1 ? "" : "s"}
            </button>
          )}
          {tieneVariantes && (
            <>
              <button type="button" className="secondary" style={{ padding: "4px 10px" }} onClick={() => ponerATodas(1)}>
                1 de cada
              </button>
              <button type="button" className="secondary" style={{ padding: "4px 10px" }} onClick={() => ponerATodas(0)}>
                Ninguna
              </button>
            </>
          )}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 12 }}>
        {tieneVariantes
          ? "Elige cuantas etiquetas imprimir de cada variante. Cada una lleva su propio codigo de barras."
          : "Imprime la etiqueta con el codigo de barras de este producto."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {unidades.map((u) => {
          const n = copias[u.id] || 0;
          const lineas = lineasVariante(u);
          return (
            <div
              key={u.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 8,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: n > 0 ? "var(--brand-light, #eef2ff)" : "transparent",
              }}
            >
              <div
                style={{ background: "#fff", padding: 4, borderRadius: 6, border: "1px solid var(--border)", flexShrink: 0 }}
                dangerouslySetInnerHTML={{ __html: svgPorUnidad[u.id] }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{u.nombre}</div>
                {lineas.map((l) => (
                  <div key={l} style={{ fontSize: 12, color: "var(--text)" }}>
                    {l}
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{u.sku}</span>
                  <span>·</span>
                  {editando === u.id ? (
                    <>
                      <input
                        value={codigoTmp}
                        onChange={(e) => setCodigoTmp(e.target.value)}
                        placeholder="Codigo de barras"
                        style={{ width: 150, fontSize: 11.5, padding: "2px 6px" }}
                      />
                      <button type="button" style={{ padding: "2px 8px" }} onClick={() => guardarCodigo(u.id, codigoTmp)} disabled={ocupado}>
                        Guardar
                      </button>
                      <button type="button" className="secondary" style={{ padding: "2px 8px" }} onClick={() => setEditando(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: u.codigoBarras ? 600 : 400, color: u.codigoBarras ? "inherit" : "var(--danger, #dc2626)" }}>
                        {u.codigoBarras || "sin codigo"}
                      </span>
                      {u.codigoBarras ? (
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "2px 8px" }}
                          onClick={() => {
                            setEditando(u.id);
                            setCodigoTmp(u.codigoBarras || "");
                          }}
                        >
                          Editar
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={{ padding: "2px 8px" }}
                          onClick={() => guardarCodigo(u.id, generarCodigoBarrasEan13())}
                          disabled={ocupado}
                        >
                          Generar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button type="button" className="secondary" style={{ padding: "2px 8px" }} onClick={() => setCopiasUnidad(u.id, n - 1)}>
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={n}
                  onChange={(e) => setCopiasUnidad(u.id, Number(e.target.value) || 0)}
                  style={{ width: 56, textAlign: "center" }}
                />
                <button type="button" className="secondary" style={{ padding: "2px 8px" }} onClick={() => setCopiasUnidad(u.id, n + 1)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Tamaño de impresion</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {FORMATOS_ETIQUETA.map((f) => {
            const activo = formato === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => setFormato(f.valor)}
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 8,
                  border: `1.5px solid ${activo ? "var(--brand, #4f46e5)" : "var(--border)"}`,
                  background: activo ? "var(--brand-light, #eef2ff)" : "transparent",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{f.titulo}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.35 }}>{f.detalle}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button type="button" onClick={imprimir} disabled={imprimiendo || totalEtiquetas === 0}>
          {imprimiendo ? "Imprimiendo..." : `Imprimir ${totalEtiquetas} etiqueta${totalEtiquetas === 1 ? "" : "s"}`}
        </button>
        {mensaje && <span className="badge success">{mensaje}</span>}
        {error && <span className="error-text">{error}</span>}
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
  const [opciones, setOpciones] = useState<{ name: string; values: string[] }[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [modoOtro, setModoOtro] = useState<Record<string, boolean>>({});
  const [sku, setSku] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [precio, setPrecio] = useState(String(producto.precio));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Carga las opciones reales del producto en Shopify (Color, Talla...) para
  // pedir un valor por cada una y evitar el error "add option values".
  useEffect(() => {
    if (!producto.shopifyProductId) return;
    api
      .get<{ opciones: { name: string; values: string[] }[] }>(`/productos/${producto.id}/opciones-shopify`)
      .then(({ data }) => setOpciones(data.opciones ?? []))
      .catch(() => setOpciones([]));
  }, [producto.id, producto.shopifyProductId]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    // Une los valores en el orden de las opciones del producto ("Rojo / M").
    const listaValores = opciones.length > 0 ? opciones.map((o) => (valores[o.name] ?? "").trim()) : [(valores.__unico ?? "").trim()];
    if (listaValores.some((v) => !v)) {
      setError("Completa el valor de cada opcion");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.post(`/productos/${producto.id}/variantes`, {
        opcionValor: listaValores.join(" / "),
        sku,
        codigoBarras: codigoBarras || undefined,
        precio: Number(precio),
      });
      setMostrarForm(false);
      setValores({});
      setModoOtro({});
      setSku("");
      setCodigoBarras("");
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo crear la variante"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0 }}>Variantes</h4>
        <button className="secondary" type="button" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "Agregar variante"}
        </button>
      </div>
      {!producto.shopifyProductId && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 6 }}>
          ℹ️ Las variantes se guardarán localmente. Se sincronizarán con Shopify cuando conectes este producto.
        </div>
      )}

      {mostrarForm && (
        <form className="grid-form" onSubmit={guardar} style={{ marginBottom: 12, maxWidth: 360 }}>
          {opciones.length > 0 ? (
            opciones.map((o) => (
              <label key={o.name}>
                {o.name}
                <select
                  value={modoOtro[o.name] ? "__otro__" : valores[o.name] ?? ""}
                  onChange={(e) => {
                    if (e.target.value === "__otro__") {
                      setModoOtro((p) => ({ ...p, [o.name]: true }));
                      setValores((p) => ({ ...p, [o.name]: "" }));
                    } else {
                      setModoOtro((p) => ({ ...p, [o.name]: false }));
                      setValores((p) => ({ ...p, [o.name]: e.target.value }));
                    }
                  }}
                  required
                >
                  <option value="">Selecciona {o.name}...</option>
                  {o.values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                  <option value="__otro__">+ Otro valor nuevo...</option>
                </select>
                {modoOtro[o.name] && (
                  <input
                    style={{ marginTop: 6 }}
                    placeholder={`Nuevo ${o.name}`}
                    value={valores[o.name] ?? ""}
                    onChange={(e) => setValores((p) => ({ ...p, [o.name]: e.target.value }))}
                    required
                  />
                )}
              </label>
            ))
          ) : (
            <label>
              Valor de la variante
              <input value={valores.__unico ?? ""} onChange={(e) => setValores({ __unico: e.target.value })} required />
            </label>
          )}
          <label>
            SKU nuevo
            <input value={sku} onChange={(e) => setSku(e.target.value)} required />
          </label>
          <label>
            Codigo de barras (opcional)
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
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
