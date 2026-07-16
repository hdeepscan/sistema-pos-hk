import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import type { Sucursal } from "../lib/store";
import { useInventarioActualizado } from "../lib/socket";
import { reproducir } from "../lib/sonidos";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import type { TipoMovimiento } from "@sistema-pos/shared";
import { mensajeError } from "../lib/errores";

const UMBRAL_STOCK_BAJO = 5;

interface ProductoConsolidado {
  productoId: string;
  sku: string;
  nombre: string;
  precio: string | number;
  costo: string | number;
  categoria: string | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
  proveedorId: string | null;
  // [] = disponible en todas las sucursales.
  disponibleEn: string[];
  totalGeneral: number;
  porSucursal: { sucursalId: string; sucursalNombre: string; cantidad: number }[];
}

interface Proveedor {
  id: string;
  nombre: string;
}

function Miniatura({ url }: { url: string | null }) {
  if (!url) {
    return <div style={{ width: 32, height: 32, borderRadius: 6, background: "#f3f4f6" }} />;
  }
  return (
    <img src={url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", border: "1px solid var(--border)" }} />
  );
}

export default function Inventario() {
  const { sucursales } = useSesionStore();
  const [productos, setProductos] = useState<ProductoConsolidado[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mostrarMovimiento, setMostrarMovimiento] = useState(false);
  const [editando, setEditando] = useState<ProductoConsolidado | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [celdaEditando, setCeldaEditando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const avisoStockBajo = useRef(false);

  const cargar = useCallback(async () => {
    const { data } = await api.get<ProductoConsolidado[]>("/inventario/consolidado");
    setProductos(data);
    if (!avisoStockBajo.current && data.some((p) => p.totalGeneral <= UMBRAL_STOCK_BAJO)) {
      avisoStockBajo.current = true;
      void reproducir("inventario_bajo");
    }
  }, []);

  useEffect(() => {
    cargar();
    api.get<Proveedor[]>("/proveedores").then(({ data }) => setProveedores(data));
  }, [cargar]);

  useInventarioActualizado(useCallback(() => cargar(), [cargar]));

  function alternarSeleccion(productoId: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(productoId)) next.delete(productoId);
      else next.add(productoId);
      return next;
    });
  }

  const nombreProveedor = useCallback(
    (id: string | null) => (id ? proveedores.find((p) => p.id === id)?.nombre ?? "" : ""),
    [proveedores]
  );

  // Filtro local: la vista consolidada ya trae todos los productos, asi que
  // buscar en memoria responde al instante mientras se escribe.
  const productosFiltrados = productos.filter((p) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.codigoBarras ?? "").toLowerCase().includes(q) ||
      (p.categoria ?? "").toLowerCase().includes(q) ||
      nombreProveedor(p.proveedorId).toLowerCase().includes(q)
    );
  });

  function alternarTodos() {
    setSeleccionados((prev) =>
      prev.size === productosFiltrados.length ? new Set() : new Set(productosFiltrados.map((p) => p.productoId))
    );
  }

  async function guardarCeldaStock(productoId: string, sucursalId: string, valor: string) {
    const clave = `${productoId}:${sucursalId}`;
    const cantidad = Number(valor);
    if (Number.isNaN(cantidad) || cantidad < 0) {
      setCeldaEditando(null);
      return;
    }
    setCeldaEditando(clave);
    try {
      await api.patch("/inventario/ajustar-directo", { productoId, sucursalId, cantidad });
      await cargar();
    } finally {
      setCeldaEditando(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Inventario consolidado</h2>
          <p>Stock por sucursal, en vivo. Edita el stock directo en la tabla o usa "Editar" para el resto del producto.</p>
        </div>
        <div className="toolbar">
          <BotonesExportar
            nombreArchivo="inventario"
            titulo="Inventario consolidado"
            columnas={columnasExportInventario(sucursales)}
            filas={productosFiltrados}
          />
          <button onClick={() => setMostrarMovimiento(true)} type="button">
            Registrar movimiento
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          placeholder="Buscar por nombre, SKU, codigo de barras, categoria o proveedor"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: "100%" }}
        />
        {busqueda && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            {productosFiltrados.length} de {productos.length} producto(s)
          </div>
        )}
      </div>

      {seleccionados.size > 0 && (
        <EdicionMasivaBar
          cantidad={seleccionados.size}
          proveedores={proveedores}
          onCancelar={() => setSeleccionados(new Set())}
          onAplicado={() => {
            setSeleccionados(new Set());
            cargar();
          }}
          productoIds={[...seleccionados]}
        />
      )}

      <div className="card">
        {productos.length === 0 ? (
          <p className="empty-state">Aun no hay productos. Crealos desde la seccion "Productos".</p>
        ) : productosFiltrados.length === 0 ? (
          <p className="empty-state">Ningun producto coincide con "{busqueda}"</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={seleccionados.size === productosFiltrados.length && productosFiltrados.length > 0}
                    onChange={alternarTodos}
                    style={{ width: "auto" }}
                  />
                </th>
                <th></th>
                <th>SKU</th>
                <th>Producto</th>
                {sucursales.map((s) => (
                  <th key={s.id}>{s.nombre}</th>
                ))}
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p) => (
                <tr key={p.productoId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionados.has(p.productoId)}
                      onChange={() => alternarSeleccion(p.productoId)}
                      style={{ width: "auto" }}
                    />
                  </td>
                  <td>
                    <Miniatura url={p.imagenUrl} />
                  </td>
                  <td>{p.sku}</td>
                  <td>{p.nombre}</td>
                  {sucursales.map((s) => {
                    const disponible = p.disponibleEn.length === 0 || p.disponibleEn.includes(s.id);
                    const cantidad = p.porSucursal.find((i) => i.sucursalId === s.id)?.cantidad ?? 0;
                    const clave = `${p.productoId}:${s.id}`;
                    if (!disponible) {
                      return (
                        <td key={s.id} style={{ color: "var(--text-muted)" }}>
                          N/A
                        </td>
                      );
                    }
                    return (
                      <td key={s.id}>
                        <input
                          type="number"
                          min={0}
                          defaultValue={cantidad}
                          key={`${clave}-${cantidad}`}
                          disabled={celdaEditando === clave}
                          onBlur={(e) => {
                            if (Number(e.target.value) !== cantidad) guardarCeldaStock(p.productoId, s.id, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          style={{ width: 64 }}
                        />
                      </td>
                    );
                  })}
                  <td>{p.totalGeneral}</td>
                  <td>
                    <button className="secondary" type="button" onClick={() => setEditando(p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarMovimiento && (
        <RegistrarMovimiento
          productos={productos}
          onClose={() => setMostrarMovimiento(false)}
          onRegistrado={cargar}
        />
      )}

      {editando && (
        <EditarProductoModal
          producto={editando}
          proveedores={proveedores}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function EditarProductoModal({
  producto,
  proveedores,
  onClose,
  onGuardado,
}: {
  producto: ProductoConsolidado;
  proveedores: Proveedor[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoria, setCategoria] = useState(producto.categoria ?? "");
  const [precio, setPrecio] = useState(String(producto.precio));
  const [costo, setCosto] = useState(String(producto.costo));
  const [codigoBarras, setCodigoBarras] = useState(producto.codigoBarras ?? "");
  const [proveedorId, setProveedorId] = useState(producto.proveedorId ?? "");
  const [activo, setActivo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/productos/${producto.productoId}`, {
        nombre,
        categoria: categoria || undefined,
        precio: Number(precio),
        costo: Number(costo || 0),
        codigoBarras: codigoBarras || undefined,
        proveedorId: proveedorId || null,
        activo,
      });
      onGuardado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar el producto"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 420 }}>
        <h4 style={{ marginBottom: 12 }}>Editar producto</h4>
        <form className="grid-form" onSubmit={guardar}>
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
            SKU
            <input value={producto.sku} disabled />
          </label>
          <label>
            Codigo de barras
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
          </label>
          <label>
            Proveedor
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ width: "auto" }} />
            Producto activo
          </label>
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
            <button className="secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>
            Para variantes, imagenes, colecciones y sucursales disponibles, ve a la seccion "Productos".
          </p>
        </form>
      </div>
    </div>
  );
}

function EdicionMasivaBar({
  cantidad,
  productoIds,
  proveedores,
  onCancelar,
  onAplicado,
}: {
  cantidad: number;
  productoIds: string[];
  proveedores: Proveedor[];
  onCancelar: () => void;
  onAplicado: () => void;
}) {
  const [cambiarCategoria, setCambiarCategoria] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [cambiarProveedor, setCambiarProveedor] = useState(false);
  const [proveedorId, setProveedorId] = useState("");
  const [cambiarActivo, setCambiarActivo] = useState(false);
  const [activo, setActivo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hayAlgo = cambiarCategoria || cambiarProveedor || cambiarActivo;

  async function aplicar() {
    if (!hayAlgo) return;
    setGuardando(true);
    setError(null);
    try {
      await api.patch("/productos/bulk", {
        productoIds,
        ...(cambiarCategoria ? { categoria } : {}),
        ...(cambiarProveedor ? { proveedorId: proveedorId || null } : {}),
        ...(cambiarActivo ? { activo } : {}),
      });
      onAplicado();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo aplicar la edicion masiva"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, background: "var(--brand-light)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>{cantidad} producto(s) seleccionado(s)</strong>
        <button className="secondary" type="button" onClick={onCancelar}>
          Cancelar seleccion
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={cambiarCategoria} onChange={(e) => setCambiarCategoria(e.target.checked)} style={{ width: "auto" }} />
          Categoria
        </label>
        {cambiarCategoria && <input value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: 160 }} />}

        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={cambiarProveedor} onChange={(e) => setCambiarProveedor(e.target.checked)} style={{ width: "auto" }} />
          Proveedor
        </label>
        {cambiarProveedor && (
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={{ width: 160 }}>
            <option value="">Sin proveedor</option>
            {proveedores.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.nombre}
              </option>
            ))}
          </select>
        )}

        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={cambiarActivo} onChange={(e) => setCambiarActivo(e.target.checked)} style={{ width: "auto" }} />
          Estado
        </label>
        {cambiarActivo && (
          <select value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")} style={{ width: 120 }}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        )}

        <button type="button" onClick={aplicar} disabled={!hayAlgo || guardando}>
          {guardando ? "Aplicando..." : `Aplicar a ${cantidad}`}
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function columnasExportInventario(sucursales: Sucursal[]): ColumnaExport<ProductoConsolidado>[] {
  return [
    { encabezado: "SKU", clave: "sku" },
    { encabezado: "Producto", clave: "nombre" },
    { encabezado: "Categoria", clave: "categoria", formato: (v) => v ?? "" },
    { encabezado: "Precio", clave: "precio", formato: (v) => String(v) },
    { encabezado: "Costo", clave: "costo", formato: (v) => String(v) },
    ...sucursales.map((s) => ({
      encabezado: s.nombre,
      clave: "productoId" as const,
      formato: (_v: unknown, fila: ProductoConsolidado) => {
        const disponible = fila.disponibleEn.length === 0 || fila.disponibleEn.includes(s.id);
        if (!disponible) return "N/A";
        return String(fila.porSucursal.find((i) => i.sucursalId === s.id)?.cantidad ?? 0);
      },
    })),
    { encabezado: "Total", clave: "totalGeneral", formato: (v) => String(v) },
  ];
}

interface ItemLote {
  productoId: string;
  nombre: string;
  cantidad: number;
}

function RegistrarMovimiento({
  productos,
  onClose,
  onRegistrado,
}: {
  productos: ProductoConsolidado[];
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const { sucursales } = useSesionStore();
  const [modoLotes, setModoLotes] = useState(false);
  const [productoId, setProductoId] = useState(productos[0]?.productoId ?? "");
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [sucursalDestinoId, setSucursalDestinoId] = useState(sucursales[1]?.id ?? "");
  const [tipo, setTipo] = useState<TipoMovimiento>("ENTRADA");
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [avisoScan, setAvisoScan] = useState<string | null>(null);
  const [items, setItems] = useState<ItemLote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function buscarPorCodigo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const codigo = codigoBarras.trim();
    setCodigoBarras("");
    if (!codigo) return;
    try {
      const { data } = await api.get("/productos/buscar", { params: { codigo } });
      setProductoId(data.id);
      setAvisoScan(`Seleccionado: ${data.nombre}`);
    } catch {
      setAvisoScan(`No se encontro ningun producto con el codigo "${codigo}"`);
    }
  }

  function agregarAlLote() {
    const producto = productos.find((p) => p.productoId === productoId);
    if (!producto) return;
    const cant = Number(cantidad) || 0;
    if (cant <= 0) return;
    setItems((prev) => {
      const existente = prev.find((i) => i.productoId === productoId);
      if (existente) {
        return prev.map((i) => (i.productoId === productoId ? { ...i, cantidad: i.cantidad + cant } : i));
      }
      return [...prev, { productoId, nombre: producto.nombre, cantidad: cant }];
    });
    setCantidad("1");
    setAvisoScan(null);
  }

  function quitarDelLote(id: string) {
    setItems((prev) => prev.filter((i) => i.productoId !== id));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      if (modoLotes) {
        if (items.length === 0) {
          setError("Agrega al menos un producto al lote");
          setGuardando(false);
          return;
        }
        for (const item of items) {
          await api.post("/inventario/movimientos", {
            productoId: item.productoId,
            sucursalId,
            tipo,
            cantidad: item.cantidad,
            motivo: motivo || undefined,
            sucursalDestinoId: tipo === "TRASLADO" ? sucursalDestinoId : undefined,
          });
        }
      } else {
        await api.post("/inventario/movimientos", {
          productoId,
          sucursalId,
          tipo,
          cantidad: Number(cantidad),
          motivo: motivo || undefined,
          sucursalDestinoId: tipo === "TRASLADO" ? sucursalDestinoId : undefined,
        });
      }
      onRegistrado();
      onClose();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo registrar el movimiento"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Registrar movimiento</h4>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={modoLotes}
              onChange={(e) => {
                setModoLotes(e.target.checked);
                setItems([]);
                setError(null);
              }}
              style={{ width: "auto" }}
            />
            Modo por lotes
          </label>
        </div>

        <form className="grid-form" onSubmit={guardar}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
            <option value="ENTRADA">Entrada</option>
            <option value="SALIDA">Salida</option>
            <option value="TRASLADO">Traslado entre sucursales</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} required>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          {tipo === "TRASLADO" && (
            <select value={sucursalDestinoId} onChange={(e) => setSucursalDestinoId(e.target.value)} required>
              {sucursales
                .filter((s) => s.id !== sucursalId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    Hacia: {s.nombre}
                  </option>
                ))}
            </select>
          )}

          <label style={{ fontSize: 12.5 }}>
            Buscar producto con pistola de codigo de barras
            <input
              placeholder="Escanea o escribe un codigo y presiona Enter"
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(e.target.value)}
              onKeyDown={buscarPorCodigo}
              autoFocus
            />
          </label>
          {avisoScan && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{avisoScan}</span>}

          <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
            {productos.map((p) => (
              <option key={p.productoId} value={p.productoId}>
                {p.nombre}
              </option>
            ))}
          </select>

          {modoLotes ? (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <input
                placeholder="Cantidad"
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="secondary" type="button" onClick={agregarAlLote}>
                Agregar a la lista
              </button>
            </div>
          ) : (
            <input
              placeholder="Cantidad"
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              required
            />
          )}

          {modoLotes && items.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {items.map((i) => (
                <div
                  key={i.productoId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <span>
                    {i.cantidad}x {i.nombre}
                  </span>
                  <button
                    className="secondary"
                    type="button"
                    style={{ padding: "2px 8px" }}
                    onClick={() => quitarDelLote(i.productoId)}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          <input placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={guardando}>
              {guardando
                ? "Guardando..."
                : modoLotes
                  ? `Registrar ${items.length} movimiento(s)`
                  : "Registrar"}
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
