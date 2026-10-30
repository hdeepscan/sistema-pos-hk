import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { leerArchivoComoDataUrl } from "../lib/files";
import { generarSvgCodigoBarras, generarSKUCorto, generarCodigoBarrasEan13 } from "../lib/barcode";
import { BotonesExportar } from "../lib/BotonesExportar";
import { ModalImportarProductos } from "../lib/ModalImportarProductos";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";
import { electronAPI } from "../lib/electron-api";
import { NuevoProductoInteligente } from "./NuevoProductoInteligente";
import {
  FILTRO_TODAS,
  coincideFiltroLote,
  opcionesFiltroLote,
  skuConNuevosValores,
  skuParaVariante,
  valoresDeTitulo,
} from "../lib/variantes-lote";
import type { EtiquetaFormato } from "../../../shared/api-types";
import { formatearVariante } from "@sistema-pos/shared";
import {
  IconoInfo,
  IconoPrecio,
  IconoImagen,
  IconoInventario,
  IconoColeccion,
  IconoBasura,
  IconoEstrella,
  IconoMas,
  IconoVariantes,
  IconoSucursal,
  IconoEtiqueta,
} from "../lib/iconos";

// Convierte la variante en lineas legibles usando formatearVariante de shared
// Luego las divide por comas para mostrar en múltiples líneas
function lineasVariante(u: { varianteTitulo: string | null }): string[] {
  if (!u.varianteTitulo) return [];
  const formateado = formatearVariante(u.varianteTitulo);
  return formateado ? formateado.split(",").map((l) => l.trim()) : [];
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
            onDuplicado={(nuevoId) => {
              cargarLista();
              setSeleccionadoId(nuevoId);
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
  // Edición en lote
  const [loteCantidad, setLoteCantidad] = useState("");
  const [loteModo, setLoteModo] = useState<"fijar" | "sumar">("fijar");
  const [loteSucursal, setLoteSucursal] = useState("todas");
  const [loteFiltro, setLoteFiltro] = useState(FILTRO_TODAS);

  const cargar = useCallback(() => {
    api
      .get(`/productos/${producto.id}/inventario`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }, [producto.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cantidadActual = (u: UnidadInventario, sucursalId: string) =>
    u.stock.find((x) => x.sucursalId === sucursalId)?.cantidad ?? 0;

  // Solo se guardan las celdas cuyo valor cambió de verdad.
  const cambios = useMemo(() => {
    if (!data) return [];
    return Object.entries(editado)
      .map(([clave, valor]) => {
        const [unidadId, sucursalId] = clave.split("::");
        const u = data.unidades.find((x) => x.id === unidadId);
        return { clave, unidadId, sucursalId, cantidad: Math.max(0, Math.floor(Number(valor) || 0)), actual: u ? cantidadActual(u, sucursalId) : 0 };
      })
      .filter((c) => c.cantidad !== c.actual);
  }, [editado, data]);

  function aplicarLote() {
    if (!data) return;
    const n = Math.floor(Number(loteCantidad));
    if (loteCantidad.trim() === "" || !Number.isFinite(n) || (loteModo === "fijar" && n < 0)) {
      setError("Escribe una cantidad válida para aplicar en lote");
      return;
    }
    setError(null);
    const sucursalesDestino = loteSucursal === "todas" ? data.sucursales : data.sucursales.filter((s) => s.id === loteSucursal);
    const unidadesDestino = data.unidades.filter((u) => coincideFiltroLote(valoresDeTitulo(u.varianteTitulo), loteFiltro));
    setEditado((prev) => {
      const sig = { ...prev };
      for (const u of unidadesDestino) {
        for (const s of sucursalesDestino) {
          const clave = `${u.id}::${s.id}`;
          const base = sig[clave] !== undefined ? Number(sig[clave]) || 0 : cantidadActual(u, s.id);
          sig[clave] = String(Math.max(0, loteModo === "fijar" ? n : base + n));
        }
      }
      return sig;
    });
    setMensaje(
      `${loteModo === "fijar" ? "Fijado" : "Sumado"} en ${unidadesDestino.length * sucursalesDestino.length} casilla(s). Revisa y presiona "Guardar stock".`
    );
  }

  async function guardar() {
    if (!data || cambios.length === 0) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const fallidos: string[] = [];
    // Se envían de a 4 en paralelo para que muchas variantes no tarden demasiado.
    const pendientes = [...cambios];
    async function trabajador() {
      for (let c = pendientes.shift(); c; c = pendientes.shift()) {
        try {
          await api.patch("/inventario/ajustar-directo", { productoId: c.unidadId, sucursalId: c.sucursalId, cantidad: c.cantidad });
        } catch {
          fallidos.push(c.clave);
        }
      }
    }
    await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]);
    setEditado((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => fallidos.includes(k))));
    if (fallidos.length > 0) setError(`No se pudieron guardar ${fallidos.length} casilla(s). Intenta de nuevo.`);
    else setMensaje(`Stock actualizado (${cambios.length} cambio${cambios.length === 1 ? "" : "s"})`);
    cargar();
    onActualizado();
    setGuardando(false);
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
  const nombresOpciones = (data.unidades.find((u) => u.grupoOpciones)?.grupoOpciones ?? "").split("|").filter(Boolean);
  const totalPorSucursal = (sucursalId: string) =>
    data.unidades.reduce((acc, u) => {
      const clave = `${u.id}::${sucursalId}`;
      return acc + (editado[clave] !== undefined ? Number(editado[clave]) || 0 : cantidadActual(u, sucursalId));
    }, 0);

  return (
    <div className="inv-contenedor">
      <div className="lote-barra">
        <span className="lote-titulo">Editar en lote</span>
        <div className="lote-campo">
          <span>Acción</span>
          <select value={loteModo} onChange={(e) => setLoteModo(e.target.value as "fijar" | "sumar")}>
            <option value="fijar">Dejar en</option>
            <option value="sumar">Sumar (+) / restar (−)</option>
          </select>
        </div>
        <div className="lote-campo">
          <span>Cantidad</span>
          <input
            type="number"
            placeholder={loteModo === "fijar" ? "Ej: 10" : "Ej: 5 o -2"}
            value={loteCantidad}
            onChange={(e) => setLoteCantidad(e.target.value)}
          />
        </div>
        <div className="lote-campo">
          <span>Sucursal</span>
          <select value={loteSucursal} onChange={(e) => setLoteSucursal(e.target.value)}>
            <option value="todas">Todas</option>
            {data.sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        {hayVariantes && (
          <div className="lote-campo lote-campo-ancho">
            <span>Variantes</span>
            <select value={loteFiltro} onChange={(e) => setLoteFiltro(e.target.value)}>
              {opcionesFiltroLote(
                data.unidades.map((u) => valoresDeTitulo(u.varianteTitulo)),
                nombresOpciones
              ).map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="button" onClick={aplicarLote}>
          Aplicar
        </button>
      </div>

      <div className="inv-tabla-scroll">
        <table className="inv-tabla">
          <thead>
            <tr>
              <th>Variante</th>
              {data.sucursales.map((s) => (
                <th key={s.id} className="inv-col-num">
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
                  <td className="inv-variante">
                    <div className="inv-variante-nombre">{lineas.length > 0 ? lineas.join(" · ") : u.nombre}</div>
                    <div className="inv-variante-sku">{u.sku}</div>
                  </td>
                  {data.sucursales.map((s) => {
                    const clave = `${u.id}::${s.id}`;
                    const actual = cantidadActual(u, s.id);
                    const valor = editado[clave] ?? String(actual);
                    const cambiado = editado[clave] !== undefined && Number(editado[clave]) !== actual;
                    return (
                      <td key={s.id} className="inv-col-num">
                        <input
                          type="number"
                          min={0}
                          className={`inv-input ${cambiado ? "inv-input-cambiado" : ""}`}
                          value={valor}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setEditado((p) => ({ ...p, [clave]: e.target.value }))}
                          title={cambiado ? `Antes: ${actual}` : undefined}
                        />
                      </td>
                    );
                  })}
                  {hayVariantes && (
                    <td className="inv-col-num">
                      <button
                        type="button"
                        className="secondary inv-borrar"
                        title="Eliminar variante"
                        onClick={() => eliminarVariante(u)}
                      >
                        <IconoBasura size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {hayVariantes && (
            <tfoot>
              <tr>
                <td className="inv-total">Total</td>
                {data.sucursales.map((s) => (
                  <td key={s.id} className="inv-col-num inv-total">
                    {totalPorSucursal(s.id)}
                  </td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="inv-acciones">
        <button type="button" onClick={guardar} disabled={guardando || cambios.length === 0}>
          {guardando ? "Guardando..." : cambios.length > 0 ? `Guardar stock (${cambios.length})` : "Guardar stock"}
        </button>
        {Object.keys(editado).length > 0 && !guardando && (
          <button type="button" className="secondary" onClick={() => setEditado({})}>
            Descartar cambios
          </button>
        )}
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

function ModalDuplicarProducto({
  producto,
  onCerrar,
  onCreado,
}: {
  producto: ProductoDetalle;
  onCerrar: () => void;
  onCreado: (nuevoId: string) => void;
}) {
  const [nombre, setNombre] = useState(`Copia de ${producto.nombre}`);
  const [sku, setSku] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [precio, setPrecio] = useState(String(producto.precio));
  const [costo, setCosto] = useState(String(producto.costo));
  const [sucursales, setSucursales] = useState<{ id: string; nombre: string; activo?: boolean }[]>([]);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ id: string; nombre: string; activo?: boolean }[]>("/sucursales")
      .then(({ data }) => {
        const activas = data.filter((s) => s.activo !== false);
        setSucursales(activas);
        setStock(Object.fromEntries(activas.map((s) => [s.id, "0"])));
      })
      .catch(() => setError("No se pudieron cargar las sucursales"));
  }, []);

  function generarSku() {
    setSku(`DUP-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim() || !sku.trim()) {
      setError("Nombre y SKU son obligatorios");
      return;
    }
    const inventarioInicial = sucursales.map((s) => ({
      sucursalId: s.id,
      cantidad: Math.max(0, Math.floor(Number(stock[s.id]) || 0)),
    }));
    setGuardando(true);
    try {
      const { data } = await api.post(`/productos/${producto.id}/duplicar`, {
        nombre: nombre.trim(),
        sku: sku.trim(),
        codigoBarras: codigoBarras.trim() || null,
        precio: Number(precio),
        costo: Number(costo),
        inventarioInicial,
      });
      onCreado(data.id);
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo duplicar el producto"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <h4 style={{ marginBottom: 12 }}>Duplicar producto</h4>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
          El stock del producto original no se copia. Define el inventario inicial de cada sucursal.
        </p>
        {error && <p className="error-text">{error}</p>}
        <form className="grid-form" onSubmit={crear}>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label>
            SKU (obligatorio, único)
            <div style={{ display: "flex", gap: 8 }}>
              <input value={sku} onChange={(e) => setSku(e.target.value)} required style={{ flex: 1 }} />
              <button type="button" className="secondary" onClick={generarSku}>
                Generar
              </button>
            </div>
          </label>
          <label>
            Código de barras (opcional, único)
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
          </label>
          <label>
            Precio
            <input type="number" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <label>
            Costo
            <input type="number" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} />
          </label>
        </form>

        <h5 style={{ marginTop: 16, marginBottom: 8 }}>Inventario inicial por sucursal</h5>
        <table style={{ width: "100%", fontSize: 13 }}>
          <tbody>
            {sucursales.map((s) => (
              <tr key={s.id}>
                <td>{s.nombre}</td>
                <td style={{ width: 120 }}>
                  <input
                    type="number"
                    min={0}
                    value={stock[s.id] ?? "0"}
                    onChange={(e) => setStock((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    style={{ width: "100%" }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" onClick={crear} disabled={guardando}>
            {guardando ? "Creando..." : "Crear producto duplicado"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalleProducto({
  producto,
  todasColecciones,
  onActualizado,
  onEliminado,
  onDuplicado,
}: {
  producto: ProductoDetalle;
  todasColecciones: Coleccion[];
  onActualizado: () => void;
  onEliminado: () => void;
  onDuplicado: (nuevoId: string) => void;
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
  const [mostrarDuplicar, setMostrarDuplicar] = useState(false);

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
      } else if (data?.archivado) {
        alert(data.mensaje);
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
      {/* Encabezado: imagen + nombre + estado a la izquierda, acciones a la derecha (bajan si no caben) */}
      <div className="pd-header">
        <Miniatura url={previewImagen} size={64} />
        <div className="pd-header-info">
          <h3 title={producto.nombre}>{producto.nombre}</h3>
          <div className="pd-header-meta">
            <span className="pd-sku">SKU {producto.sku}</span>
            {producto.variantes.length > 0 && (
              <span className="pd-pill pd-pill-neutral">{producto.variantes.length + 1} variantes</span>
            )}
            <span className={`pd-pill ${activo ? "pd-pill-ok" : "pd-pill-neutral"}`}>{activo ? "Activo" : "Inactivo"}</span>
            <span className={`pd-pill ${producto.shopifyProductId ? "pd-pill-ok" : "pd-pill-aviso"}`}>
              {producto.shopifyProductId ? "En Shopify" : "Sin Shopify"}
            </span>
          </div>
        </div>
        <div className="pd-header-acciones">
          <button type="button" className="secondary" onClick={() => setMostrarDuplicar(true)} disabled={accionando}>
            Duplicar
          </button>
          <button
            type="button"
            className="secondary"
            onClick={reintentarShopify}
            disabled={accionando}
            title={producto.shopifyProductId ? "Volver a enviar los datos a Shopify" : "Publicar este producto en Shopify"}
          >
            {accionando ? "..." : producto.shopifyProductId ? "Sincronizar Shopify" : "Subir a Shopify"}
          </button>
          <button type="button" className="secondary pd-btn-eliminar" onClick={eliminarProducto} disabled={accionando}>
            Eliminar
          </button>
          <button type="button" className="pd-btn-guardar" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      {mensaje && <span className="badge success" style={{ width: "fit-content" }}>{mensaje}</span>}
      {mostrarDuplicar && (
        <ModalDuplicarProducto
          producto={producto}
          onCerrar={() => setMostrarDuplicar(false)}
          onCreado={(nuevoId) => {
            setMostrarDuplicar(false);
            onDuplicado(nuevoId);
          }}
        />
      )}

      {/* Informacion general */}
      <Seccion icono={<IconoInfo />} titulo="Información general" subtitulo="Nombre, categoría, marca, proveedor y descripción">
        <div className="pd-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Nombre
            </label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Categoria
            </label>
            <input
              list="categorias-detalle"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Escribe o elige una existente"
              style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
            />
            <datalist id="categorias-detalle">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Marca
            </label>
            <input value={marca} onChange={(e) => setMarca(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Proveedor
            </label>
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Descripcion
            </label>
            <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} />
          </div>
          <label className="np-switch" style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            <span className="np-switch-pista" />
            <span>
              <strong>Producto activo</strong>
              <small>Si lo desactivas, no aparece en el punto de venta.</small>
            </span>
          </label>
        </div>
      </Seccion>

      {/* Precios, impuestos e identificadores */}
      <Seccion icono={<IconoPrecio />} titulo="Precios e identificadores" subtitulo="Costo, precio, impuesto, SKU y código de barras">
        <div className="pd-grid pd-grid-3">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Precio de compra (costo)
            </label>
            <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Precio de venta
            </label>
            <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Impuesto (%)
            </label>
            <input type="number" step="0.01" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              SKU
            </label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Codigo de barras
            </label>
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Si lo dejas vacio se usa el SKU" style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Stock minimo (aviso reposicion)
            </label>
            <input type="number" min={0} value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
        </div>
      </Seccion>

      {/* Galeria de imagenes */}
      <Seccion icono={<IconoImagen />} titulo="Imágenes" subtitulo="Sube varias, elige la principal y sincroniza con Shopify">
        <GaleriaSection producto={producto} onActualizado={onActualizado} />
      </Seccion>

      {/* Inventario por sucursal */}
      <Seccion
        icono={<IconoInventario />}
        titulo="Inventario por sucursal"
        subtitulo="Edita una casilla o usa “Editar en lote” para cambiar muchas variantes a la vez"
      >
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
      // ✅ NUEVO: Detectar error específico de código de barras duplicado
      if (err?.response?.status === 409 && err?.response?.data?.codigo === "CODIGO_BARRAS_DUPLICADO") {
        setError("Este código de barras ya existe. Intenta con uno distinto.");
        console.warn(`⚠️ Código de barras duplicado intentado: ${valor}`);
      } else {
        setError(mensajeError(err, "No se pudo guardar el codigo"));
      }
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
          try {
            await api.patch(`/productos/${u.id}`, { codigoBarras: generarSKUCorto() });
          } catch (err: any) {
            // ✅ NUEVO: Si hay duplicado al generar, al menos no fallar todo
            if (err?.response?.status === 409 && err?.response?.data?.codigo === "CODIGO_BARRAS_DUPLICADO") {
              console.warn(`⚠️ No se pudo generar código único para producto ${u.id}: código duplicado`);
              // Intentar generar otro
              await api.patch(`/productos/${u.id}`, { codigoBarras: generarSKUCorto() });
            } else {
              throw err;
            }
          }
        }
      }
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudieron generar los codigos. Algunos productos pueden tener códigos de barras duplicados."));
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
      console.log(`[LABELS] Processing ${items.length} etiqueta(s)`);
      console.log(`[LABELS] Printer configured: ${config.printerName || "NONE"}`);
      console.log(`[LABELS] Is Electron: ${electronAPI.isElectron()}`);

      // Use printODescargarEtiquetas which has smart logic:
      // - If printer configured: try to print, fallback to PDF if fails
      // - If no printer: automatically generate PDF
      const resultado = await electronAPI.printODescargarEtiquetas(
        items,
        config.printerName || null,
        formato
      );

      console.log(`[LABELS] Result:`, resultado);

      if (resultado.imprimio) {
        setMensaje(`${items.length} etiqueta${items.length === 1 ? "" : "s"} impresa${items.length === 1 ? "" : "s"} correctamente`);
      } else {
        setMensaje(resultado.mensaje || `${items.length} etiqueta${items.length === 1 ? "" : "s"} descargada${items.length === 1 ? "" : "s"} como PDF`);
      }
    } catch (err) {
      console.error("[LABELS] Error:", err);
      setError(`Error al procesar etiquetas: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <Seccion
      icono={<IconoEtiqueta />}
      titulo="Etiquetas y códigos de barras"
      subtitulo="Imprime etiquetas con el código de cada variante"
      aside={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
      }
    >
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
                          onClick={() => guardarCodigo(u.id, generarSKUCorto())}
                          disabled={ocupado}
                        >
                          Generar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="pos-cantidad" style={{ flexShrink: 0 }}>
                <button type="button" className="secondary pos-cantidad-boton" aria-label="Una etiqueta menos" onClick={() => setCopiasUnidad(u.id, n - 1)}>
                  −
                </button>
                <input
                  className="pos-cantidad-input"
                  type="number"
                  min={0}
                  value={n}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setCopiasUnidad(u.id, Number(e.target.value) || 0)}
                />
                <button type="button" className="secondary pos-cantidad-boton" aria-label="Una etiqueta más" onClick={() => setCopiasUnidad(u.id, n + 1)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="etq-titulo">Tamaño de impresión</div>
        <div className="etq-formatos" role="radiogroup" aria-label="Tamaño de impresión">
          {FORMATOS_ETIQUETA.map((f) => {
            const activo = formato === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                role="radio"
                aria-checked={activo}
                className={`etq-formato ${activo ? "activo" : ""}`}
                onClick={() => setFormato(f.valor)}
              >
                <span className="etq-formato-radio" aria-hidden="true" />
                <span className="etq-formato-texto">
                  <span className="etq-formato-nombre">{f.titulo}</span>
                  <span className="etq-formato-detalle">{f.detalle}</span>
                </span>
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
        {error && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "#fee2e2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Seccion>
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
    <Seccion
      icono={<IconoSucursal />}
      titulo="Sucursales disponibles"
      subtitulo={
        producto.shopifyProductId
          ? "Aplica a todas las variantes de este producto (talla, color, etc.)"
          : "En qué sucursales se puede vender este producto"
      }
    >
      <div className="pd-inline">
        <div className="np-segmentado">
          <button type="button" className={modo === "todas" ? "activo" : ""} onClick={() => setModo("todas")}>
            Todas las sucursales
          </button>
          <button type="button" className={modo === "algunas" ? "activo" : ""} onClick={() => setModo("algunas")}>
            Solo algunas
          </button>
        </div>
        {modo === "algunas" && (
          <div className="np-chips" style={{ marginTop: 10 }}>
            {sucursales.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`np-chip-toggle ${sucursalIds.includes(s.id) ? "activo" : ""}`}
                onClick={() => alternarSucursal(s.id)}
              >
                {sucursalIds.includes(s.id) ? "✓ " : ""}
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="inv-acciones">
        <button type="button" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar disponibilidad"}
        </button>
        {mensaje && <span className="badge success">{mensaje}</span>}
      </div>
    </Seccion>
  );
}

// Formulario para editar una variante ya creada. Si cambian los valores (talla/color) y el SKU
// se había armado con ellos, propone el SKU nuevo; el servidor garantiza que no se repita.
function EditorVariante({
  variante,
  nombresOpciones,
  onCancelar,
  onGuardado,
}: {
  variante: Producto;
  nombresOpciones: string[];
  onCancelar: () => void;
  onGuardado: (avisos: string[]) => void;
}) {
  const valoresIniciales = valoresDeTitulo(variante.varianteTitulo);
  const cantidadOpciones = Math.max(valoresIniciales.length, 1);
  const [valores, setValores] = useState<string[]>(
    valoresIniciales.length > 0 ? valoresIniciales : [""]
  );
  const [skuManual, setSkuManual] = useState<string | null>(null);
  const [codigoBarras, setCodigoBarras] = useState(variante.codigoBarras ?? "");
  const [precio, setPrecio] = useState(String(Number(variante.precio)));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const valoresLimpios = valores.map((v) => v.trim());
  const cambiaronValores = valoresLimpios.join(" / ") !== (variante.varianteTitulo ?? "");
  const skuAuto = cambiaronValores ? skuConNuevosValores(variante.sku, valoresIniciales, valoresLimpios) : null;
  const sku = skuManual ?? skuAuto ?? variante.sku;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (valoresLimpios.some((v) => !v)) return setError("Completa el valor de cada opción");
    if (!sku.trim()) return setError("El SKU no puede quedar vacío");
    if (precio === "" || Number(precio) < 0) return setError("Pon un precio válido");
    setGuardando(true);
    setError(null);
    try {
      const { data } = await api.patch<{ avisos?: string[] }>(`/productos/${variante.id}/variante`, {
        ...(cambiaronValores ? { valores: valoresLimpios } : {}),
        sku: sku.trim(),
        codigoBarras: codigoBarras.trim() || null,
        precio: Number(precio),
      });
      onGuardado(data.avisos ?? []);
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar la variante"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="var-editor" onSubmit={guardar}>
      <div className="var-editor-titulo">Editar variante {formatearVariante(variante.varianteTitulo)}</div>
      <div className="var-editor-campos">
        {Array.from({ length: cantidadOpciones }, (_, i) => (
          <label key={i} className="var-campo">
            <span>{nombresOpciones[i] || (cantidadOpciones === 1 ? "Variante" : `Opción ${i + 1}`)}</span>
            <input
              value={valores[i] ?? ""}
              onChange={(e) => setValores((p) => p.map((v, j) => (j === i ? e.target.value : v)))}
              required
            />
          </label>
        ))}
        <label className="var-campo">
          <span>SKU</span>
          <input value={sku} onChange={(e) => setSkuManual(e.target.value)} required />
          {skuManual === null && skuAuto && <small className="var-ayuda">Se actualiza solo con la variante</small>}
        </label>
        <label className="var-campo var-campo-ancho">
          <span>Código de barras</span>
          <div className="var-campo-fila">
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Opcional" />
            <button type="button" className="var-btn-generar" onClick={() => setCodigoBarras(generarCodigoBarrasEan13())}>
              Generar
            </button>
          </div>
        </label>
        <label className="var-campo">
          <span>Precio</span>
          <input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required />
        </label>
      </div>
      <p className="var-nota">El SKU y el código de barras nunca se repiten: si ya existen en otro producto, el sistema lo ajusta o te avisa.</p>
      {error && <span className="error-text">{error}</span>}
      <div className="var-editor-acciones">
        <button type="button" className="secondary" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function VariantesCard({ producto, onActualizado }: { producto: ProductoDetalle; onActualizado: () => void }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [opcionesShopify, setOpciones] = useState<{ name: string; values: string[] }[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [modoOtro, setModoOtro] = useState<Record<string, boolean>>({});
  // null = el SKU se arma solo con los valores elegidos; texto = lo escribió el usuario.
  const [skuManual, setSkuManual] = useState<string | null>(null);
  const [codigoBarras, setCodigoBarras] = useState("");
  const [precio, setPrecio] = useState(String(producto.precio));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // El producto abierto también es una variante: se lista junto con las demás.
  const todas = useMemo(
    () =>
      [producto, ...producto.variantes].sort((a, b) =>
        (a.varianteTitulo ?? "").localeCompare(b.varianteTitulo ?? "", "es", { numeric: true })
      ),
    [producto]
  );
  // Opciones del producto: las de Shopify o, si no está en Shopify, las que se definieron al
  // crearlo (Talla|Color) con los valores que ya usan sus variantes.
  const opciones = useMemo(() => {
    if (opcionesShopify.length > 0) return opcionesShopify;
    const nombres = (producto.grupoOpciones ?? "").split("|").filter(Boolean);
    const valoresPorVariante = todas.map((v) => valoresDeTitulo(v.varianteTitulo));
    if (nombres.length === 0 || valoresPorVariante.some((vs) => vs.length !== nombres.length)) return [];
    return nombres.map((name, i) => ({ name, values: [...new Set(valoresPorVariante.map((vs) => vs[i]))] }));
  }, [opcionesShopify, producto.grupoOpciones, todas]);
  const nombresOpciones = opciones.map((o) => o.name);

  // Carga las opciones reales del producto en Shopify (Color, Talla...) para
  // pedir un valor por cada una y evitar el error "add option values".
  useEffect(() => {
    if (!producto.shopifyProductId) return;
    api
      .get<{ opciones: { name: string; values: string[] }[] }>(`/productos/${producto.id}/opciones-shopify`)
      .then(({ data }) => setOpciones(data.opciones ?? []))
      .catch(() => setOpciones([]));
  }, [producto.id, producto.shopifyProductId]);

  // Une los valores en el orden de las opciones del producto ("Rojo / M").
  const listaValores = opciones.length > 0 ? opciones.map((o) => (valores[o.name] ?? "").trim()) : [(valores.__unico ?? "").trim()];
  const skuAuto = listaValores.some(Boolean)
    ? skuParaVariante(producto.sku, valoresDeTitulo(producto.varianteTitulo), listaValores.filter(Boolean))
    : "";
  const sku = skuManual ?? skuAuto;

  function abrirFormulario() {
    if (!mostrarForm) {
      setSkuManual(null);
      setCodigoBarras(generarCodigoBarrasEan13());
      setPrecio(String(producto.precio));
      setError(null);
    }
    setMostrarForm((v) => !v);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (listaValores.some((v) => !v)) {
      setError("Completa el valor de cada opcion");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const { data } = await api.post<{ sku: string; avisos?: string[]; _warning?: string }>(`/productos/${producto.id}/variantes`, {
        opcionValor: listaValores.join(" / "),
        sku: sku.trim() || undefined,
        codigoBarras: codigoBarras.trim() || undefined,
        precio: Number(precio),
      });
      setMostrarForm(false);
      setValores({});
      setModoOtro({});
      setSkuManual(null);
      setCodigoBarras("");
      setAviso([`✓ Variante creada con SKU ${data.sku}.`, ...(data.avisos ?? []), data._warning ?? ""].filter(Boolean).join(" "));
      onActualizado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo crear la variante"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion
      icono={<IconoVariantes />}
      titulo="Variantes"
      subtitulo="Tallas, colores u otras opciones de este producto"
      aside={
        <button className="secondary" type="button" onClick={abrirFormulario}>
          {mostrarForm ? "Cancelar" : "+ Agregar variante"}
        </button>
      }
    >
      {!producto.shopifyProductId && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 6 }}>
          ℹ️ Las variantes se guardarán localmente. Se sincronizarán con Shopify cuando conectes este producto.
        </div>
      )}

      {mostrarForm && (
        <form onSubmit={guardar} style={{ marginBottom: 12, maxWidth: 360, display: "flex", flexDirection: "column", gap: 12 }}>
          {opciones.length > 0 ? (
            opciones.map((o) => (
              <div key={o.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                  {o.name}
                </label>
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
                  style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
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
                    placeholder={`Nuevo ${o.name}`}
                    value={valores[o.name] ?? ""}
                    onChange={(e) => setValores((p) => ({ ...p, [o.name]: e.target.value }))}
                    required
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                )}
              </div>
            ))
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                Valor de la variante
              </label>
              <input value={valores.__unico ?? ""} onChange={(e) => setValores({ __unico: e.target.value })} required style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              SKU
            </label>
            <input
              value={sku}
              onChange={(e) => setSkuManual(e.target.value)}
              placeholder="Se genera solo al elegir la variante"
              style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
            />
            <small style={{ fontSize: 11, color: "#2563eb" }}>
              {skuManual === null ? "Se genera solo. Puedes cambiarlo si quieres." : "Si ya existe, el sistema le agrega un número para que no se repita."}
            </small>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Codigo de barras
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Opcional" style={{ flex: 1, height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
              <button type="button" className="var-btn-generar-nuevo" onClick={() => setCodigoBarras(generarCodigoBarrasEan13())}>
                Generar
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
              Precio
            </label>
            <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }} />
          </div>
          {error && <span className="error-text">{error}</span>}
          <button type="submit" disabled={guardando}>
            {guardando ? "Creando..." : "Crear variante"}
          </button>
        </form>
      )}

      {aviso && <div className="var-aviso">{aviso}</div>}

      {todas.length <= 1 && !producto.varianteTitulo ? (
        <p className="empty-state">Este producto no tiene otras variantes</p>
      ) : (
        <table className="var-tabla">
          <thead>
            <tr>
              <th>Variante</th>
              <th>SKU</th>
              <th>Código de barras</th>
              <th>Precio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {todas.map((v) =>
              editandoId === v.id ? (
                <tr key={v.id} className="var-fila-editando">
                  <td colSpan={5}>
                    <EditorVariante
                      variante={v}
                      nombresOpciones={nombresOpciones}
                      onCancelar={() => setEditandoId(null)}
                      onGuardado={(avisos) => {
                        setEditandoId(null);
                        setAviso(avisos.length > 0 ? avisos.join(" ") : "✓ Variante actualizada");
                        onActualizado();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={v.id}>
                  <td>
                    {formatearVariante(v.varianteTitulo) || "-"}
                    {v.id === producto.id && <span className="var-actual">este</span>}
                  </td>
                  <td>{v.sku}</td>
                  <td>{v.codigoBarras || <span className="var-vacio">—</span>}</td>
                  <td>${Number(v.precio).toLocaleString("es-CO")}</td>
                  <td className="var-acciones">
                    <button
                      type="button"
                      className="var-btn-editar"
                      onClick={() => {
                        setAviso(null);
                        setEditandoId(v.id);
                      }}
                    >
                      ✏️ Editar variante
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </Seccion>
  );
}
