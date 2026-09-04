import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore, usePermiso } from "../lib/store";
import { useVentaCreada } from "../lib/socket";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";
import { electronAPI } from "../lib/electron-api";
import { generarSvgCodigoBarras } from "../lib/barcode";
import { Pagination } from "../components/Pagination";
import type { ReciboData } from "../../../shared/api-types";

interface VentaItem {
  id: string;
  // null en items de "venta libre" (concepto suelto sin producto).
  productoId: string | null;
  descripcionLibre?: string | null;
  cantidad: number;
  cantidadDevuelta: number;
  precioUnitario: string | number;
  producto: { nombre: string; sku: string; imagenUrl: string | null; costo: string | number } | null;
}

// Nombre a mostrar de un item: el producto, o la descripcion si es venta libre.
function nombreItem(i: VentaItem): string {
  return i.producto?.nombre ?? i.descripcionLibre ?? "Venta libre";
}

interface Venta {
  id: string;
  consecutivo: number;
  total: string | number;
  metodoPago: string;
  canal: string;
  fecha: string;
  sucursalId: string;
  descuento: string | number | null;
  ventaLibre?: boolean;
  observaciones?: string | null;
  items: VentaItem[];
  cliente: { nombre: string } | null;
  usuario: { id: string; nombre: string } | null;
}

interface Cliente {
  id: string;
  nombre: string;
}

// Iconos SVG inline
const Iconos = {
  print: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
  ),
  tag: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
      <line x1="7" y1="7" x2="7.01" y2="7"></line>
    </svg>
  ),
};

const ESTADOS_CREDITO: Record<string, string> = {
  VIGENTE: "Vigente",
  PROXIMO_A_VENCER: "Proximo a vencer",
  VENCIDO: "Vencido",
  PAGADO: "Pagada",
};

const ETIQUETAS_CANAL: Record<string, string> = {
  PUNTO_DE_VENTA: "Punto de venta",
  SHOPIFY: "Shopify",
  WHATSAPP: "WhatsApp",
  OTRO: "Otro",
};

const badgeCanal: Record<string, string> = {
  PUNTO_DE_VENTA: "neutral",
  SHOPIFY: "success",
  WHATSAPP: "warning",
  OTRO: "neutral",
};

const badgePago: Record<string, string> = {
  EFECTIVO: "success",
  TARJETA: "neutral",
  TRANSFERENCIA: "neutral",
  CREDITO: "warning",
  OTRO: "neutral",
};

function resumenItems(items: VentaItem[]): string {
  const nombres = items.map((i) => `${i.cantidad}x ${nombreItem(i)}`);
  if (nombres.length <= 2) return nombres.join(", ");
  return `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} mas`;
}

function columnasExportVentas(
  sucursales: { id: string; nombre: string }[],
  estadoDe: (venta: Venta) => string
): ColumnaExport<Venta>[] {
  return [
    { encabezado: "Numero de factura", clave: "consecutivo", formato: (v) => `#${v}` },
    { encabezado: "Fecha", clave: "fecha", formato: (v) => new Date(v).toLocaleString("es-CO") },
    { encabezado: "Sucursal", clave: "sucursalId", formato: (v) => sucursales.find((s) => s.id === v)?.nombre ?? "" },
    { encabezado: "Cliente", clave: "cliente", formato: (v) => v?.nombre ?? "" },
    { encabezado: "Cajero", clave: "usuario", formato: (v) => v?.nombre ?? "" },
    { encabezado: "Productos", clave: "items", formato: (_v, fila) => resumenItems(fila.items) },
    {
      encabezado: "Cantidad",
      clave: "items",
      formato: (_v, fila) => String(fila.items.reduce((acc, i) => acc + i.cantidad, 0)),
    },
    { encabezado: "Total", clave: "total", formato: (v) => String(v) },
    { encabezado: "Metodo de pago", clave: "metodoPago" },
    { encabezado: "Canal de venta", clave: "canal", formato: (v) => ETIQUETAS_CANAL[v] ?? v },
    { encabezado: "Estado", clave: "id", formato: (_v, fila) => estadoDe(fila) },
    {
      encabezado: "Ganancia",
      clave: "total",
      formato: (v, fila) => {
        const costoTotal = fila.items.reduce((acc, i) => acc + i.cantidad * Number(i.producto.costo), 0);
        return String(Number(v) - costoTotal);
      },
    },
  ];
}

export default function Ventas() {
  const { sucursales, sucursalActivaId, empresa } = useSesionStore();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [estadoPorVenta, setEstadoPorVenta] = useState<Map<string, string>>(new Map());
  const [filtroSucursal, setFiltroSucursal] = useState<string>(sucursalActivaId ?? "");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [filtroClienteId, setFiltroClienteId] = useState("");
  const [filtroUsuarioId, setFiltroUsuarioId] = useState("");
  const [filtroMetodoPago, setFiltroMetodoPago] = useState("");
  const [filtroCanal, setFiltroCanal] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [seleccionada, setSeleccionada] = useState<Venta | null>(null);
  const [totalReal, setTotalReal] = useState(0);
  const [totalCartera, setTotalCartera] = useState(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // Si no hay filtro de sucursal pero hay sucursal activa, usa esa
      const sucursalParaFiltro = filtroSucursal || sucursalActivaId || undefined;

      const params = {
        sucursalId: sucursalParaFiltro,
        desde: desde || undefined,
        hasta: hasta || undefined,
        montoMin: montoMin || undefined,
        montoMax: montoMax || undefined,
        clienteId: filtroClienteId || undefined,
        usuarioId: filtroUsuarioId || undefined,
        metodoPago: filtroMetodoPago || undefined,
        canal: filtroCanal || undefined,
        limit: 2000,
      };

      // Cargar ventas y totales en paralelo
      const [ventasRes, totalesRes] = await Promise.all([
        api.get<Venta[]>("/ventas", { params }),
        api.get<{ totalReal: number; totalCartera: number }>("/ventas/totales-resumen", { params }).catch(() => ({
          data: { totalReal: 0, totalCartera: 0 },
        })),
      ]);

      setVentas(ventasRes.data);
      setTotalReal(totalesRes.data.totalReal);
      setTotalCartera(totalesRes.data.totalCartera);
    } catch (err) {
      console.error("Error al cargar ventas:", err);
    } finally {
      setCargando(false);
    }
  }, [filtroSucursal, sucursalActivaId, desde, hasta, montoMin, montoMax, filtroClienteId, filtroUsuarioId, filtroMetodoPago, filtroCanal]);

  const reimprimir = useCallback(async (venta: Venta, sucursalNombre: string) => {
    try {
      // Construir datos del recibo como en Pos.tsx
      const reciboData: ReciboData = {
        empresaNombre: empresa?.nombre ?? "",
        sucursalNombre: sucursalNombre,
        consecutivo: venta.consecutivo,
        fecha: new Date(venta.fecha).toLocaleString("es-CO"),
        cajero: venta.usuario?.nombre ?? "Desconocido",
        items: venta.items.map((item) => ({
          nombre: item.producto?.nombre || item.descripcionLibre || "Venta libre",
          cantidad: item.cantidad,
          precioUnitario: Number(item.precioUnitario),
        })),
        total: Number(venta.total),
        metodoPago: venta.metodoPago,
        descuento: Number(venta.descuento) || undefined,
      };

      const config = await electronAPI.getConfig();
      console.log(`[REPRINT] Reimprimir recibo #${venta.consecutivo} con impresora: ${config.printerName || "default"}`);
      await electronAPI.generarReciboPDF(reciboData, config.printerName);
    } catch (err) {
      console.error("Error al reimprimir recibo:", err);
      mensajeError("No se pudo reimprimir el recibo");
    }
  }, [empresa]);

  const imprimirEtiquetas = useCallback(async (venta: Venta) => {
    try {
      // Construir items de etiquetas a partir de los productos de la venta
      const items = venta.items
        .filter((item) => item.producto) // Solo productos, no ventas libres
        .map((item) => ({
          nombre: item.producto!.nombre,
          sku: item.producto!.sku,
          precio: Number(item.producto!.precio || item.precioUnitario),
          copias: item.cantidad,
          svgCodigoBarras: generarSvgCodigoBarras(item.producto!.codigoBarras || item.producto!.sku),
        }));

      if (items.length === 0) {
        mensajeError("No hay productos para imprimir etiquetas");
        return;
      }

      const config = await electronAPI.getConfig();
      console.log(`[LABELS] Imprimiendo ${items.length} etiqueta(s) para venta #${venta.consecutivo}`);

      const resultado = await electronAPI.printODescargarEtiquetas(items, config.printerName || null, "rollo2");

      if (resultado.imprimio) {
        console.log(`[LABELS] ${items.length} etiqueta(s) impresa(s) correctamente`);
      }
    } catch (err) {
      console.error("Error al imprimir etiquetas:", err);
      mensajeError("No se pudieron imprimir las etiquetas");
    }
  }, []);

  const cambiarCanal = useCallback(async (ventaId: string, nuevoCanal: string) => {
    try {
      await api.put(`/ventas/${ventaId}/canal`, { canal: nuevoCanal });
      cargar(); // Recargar lista de ventas
    } catch (err) {
      console.error("Error al cambiar canal:", err);
      mensajeError("No se pudo cambiar el canal");
    }
  }, [cargar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Auto-refresh cada 10 segundos como fallback si el WebSocket no funciona
  useEffect(() => {
    const intervalo = setInterval(() => {
      cargar();
    }, 10000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  useEffect(() => {
    api.get<Cliente[]>("/clientes").then(({ data }) => setClientes(data));
  }, []);

  useEffect(() => {
    Promise.all([
      api.get("/creditos", { params: { estado: undefined } }).catch(() => ({ data: [] })),
      api.get("/creditos", { params: { estado: "PAGADO" } }).catch(() => ({ data: [] })),
    ]).then(([activos, pagados]) => {
      const mapa = new Map<string, string>();
      for (const c of [...activos.data, ...pagados.data]) mapa.set(c.ventaId, c.estado);
      setEstadoPorVenta(mapa);
    });
  }, [ventas]);

  // Escucha cuando se crea una venta y recarga inmediatamente
  useVentaCreada(useCallback(() => {
    console.log("Venta creada detectada, recargando...");
    cargar();
  }, [cargar]));

  const cajeros = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of ventas) if (v.usuario) mapa.set(v.usuario.id, v.usuario.nombre);
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [ventas]);

  function estadoDe(venta: Venta): string {
    if (venta.metodoPago !== "CREDITO") return "Pagada";
    const estado = estadoPorVenta.get(venta.id);
    return estado ? ESTADOS_CREDITO[estado] ?? estado : "Vigente";
  }

  const ventasFiltradas = filtroEstado ? ventas.filter((v) => estadoDe(v) === filtroEstado) : ventas;
  const totalListado = ventasFiltradas.reduce((acc, v) => acc + Number(v.total), 0);

  function limpiarFiltros() {
    setFiltroSucursal("");
    setDesde("");
    setHasta("");
    setMontoMin("");
    setMontoMax("");
    setFiltroClienteId("");
    setFiltroUsuarioId("");
    setFiltroMetodoPago("");
    setFiltroCanal("");
    setFiltroEstado("");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Ventas</h2>
          <p>Historial de ventas registradas, en vivo</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label>
            Sucursal
            <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label>
            Monto minimo
            <input type="number" placeholder="0" value={montoMin} onChange={(e) => setMontoMin(e.target.value)} style={{ width: 100 }} />
          </label>
          <label>
            Monto maximo
            <input type="number" placeholder="Sin limite" value={montoMax} onChange={(e) => setMontoMax(e.target.value)} style={{ width: 110 }} />
          </label>
          <label>
            Cliente
            <select value={filtroClienteId} onChange={(e) => setFiltroClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cajero
            <select value={filtroUsuarioId} onChange={(e) => setFiltroUsuarioId(e.target.value)}>
              <option value="">Todos</option>
              {cajeros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Metodo de pago
            <select value={filtroMetodoPago} onChange={(e) => setFiltroMetodoPago(e.target.value)}>
              <option value="">Todos</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CREDITO">Credito</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <label>
            Canal de venta
            <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)}>
              <option value="">Todos</option>
              <option value="PUNTO_DE_VENTA">Punto de venta</option>
              <option value="SHOPIFY">Shopify</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <label>
            Estado
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="Pagada">Pagada</option>
              <option value="Vigente">Vigente</option>
              <option value="Proximo a vencer">Proximo a vencer</option>
              <option value="Vencido">Vencido</option>
            </select>
          </label>
          <button className="secondary" type="button" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <BotonesExportar
          nombreArchivo="ventas"
          titulo="Historial de ventas"
          columnas={columnasExportVentas(sucursales, estadoDe)}
          filas={ventasFiltradas}
        />
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Ventas en el listado</div>
          <div className="value">{ventasFiltradas.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Real</div>
          <div className="value positive">${totalReal.toLocaleString("es-CO")}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Cartera</div>
          <div className="value warning">${totalCartera.toLocaleString("es-CO")}</div>
        </div>
      </div>

      <Pagination
        items={ventasFiltradas}
        itemsPerPageOptions={[10, 25, 50]}
        renderTable={(pageItems) =>
          cargando ? (
            <div className="card">
              <p className="empty-state">Cargando...</p>
            </div>
          ) : pageItems.length === 0 && ventasFiltradas.length === 0 ? (
            <div className="card">
              <p className="empty-state">No hay ventas que coincidan con estos filtros</p>
            </div>
          ) : (
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Fecha</th>
                    <th>Canal</th>
                    <th>Sucursal</th>
                    <th>Productos</th>
                    <th>Pago</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((v) => (
                    <tr key={v.id} className="list-item" style={{ cursor: "pointer" }} onClick={() => setSeleccionada(v)}>
                      <td>#{v.consecutivo}</td>
                      <td>{new Date(v.fecha).toLocaleString("es-CO")}</td>
                      <td>
                        <span className={`badge ${badgeCanal[v.canal] ?? "neutral"}`}>{ETIQUETAS_CANAL[v.canal] ?? v.canal}</span>
                        {v.ventaLibre && (
                          <span className="badge warning" style={{ marginLeft: 4 }}>
                            Libre
                          </span>
                        )}
                      </td>
                      <td>{sucursales.find((s) => s.id === v.sucursalId)?.nombre ?? "-"}</td>
                      <td style={{ maxWidth: 280 }}>{resumenItems(v.items)}</td>
                      <td>
                        <span className={`badge ${badgePago[v.metodoPago] ?? "neutral"}`}>{v.metodoPago}</span>
                      </td>
                      <td>${Number(v.total).toLocaleString("es-CO")}</td>
                      <td>
                        <button className="secondary" type="button" onClick={(e) => { e.stopPropagation(); setSeleccionada(v); }}>
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      />

      {seleccionada && (
        <DetalleVenta
          venta={seleccionada}
          sucursalNombre={sucursales.find((s) => s.id === seleccionada.sucursalId)?.nombre ?? "-"}
          onClose={() => setSeleccionada(null)}
          onEliminada={() => {
            setSeleccionada(null);
            cargar();
          }}
          onDevuelta={() => {
            setSeleccionada(null);
            cargar();
          }}
          onReimprimir={(v, nombre) => reimprimir(v, nombre)}
          onImprimirEtiquetas={imprimirEtiquetas}
          onCambiarCanal={cambiarCanal}
        />
      )}
    </div>
  );
}

function DetalleVenta({
  venta,
  sucursalNombre,
  onClose,
  onEliminada,
  onDevuelta,
  onReimprimir,
  onImprimirEtiquetas,
  onCambiarCanal,
}: {
  venta: Venta;
  sucursalNombre: string;
  onClose: () => void;
  onEliminada: () => void;
  onDevuelta: () => void;
  onReimprimir: (v: Venta, nombre: string) => Promise<void>;
  onImprimirEtiquetas: (v: Venta) => Promise<void>;
  onCambiarCanal: (ventaId: string, canal: string) => Promise<void>;
}) {
  const puedeDevolver = usePermiso("devoluciones.realizar");
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [modoDevolucion, setModoDevolucion] = useState(false);
  const [devolver, setDevolver] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState("");
  const [procesandoDev, setProcesandoDev] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canalEditando, setCanalEditando] = useState(venta.canal);

  async function eliminar() {
    setEliminando(true);
    setError(null);
    try {
      await api.delete(`/ventas/${venta.id}`);
      onEliminada();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo eliminar la venta"));
      setEliminando(false);
    }
  }

  // Se indexa por productoId porque es lo que identifica al item en el backend.
  const itemsADevolver = Object.entries(devolver).filter(([, c]) => c > 0);
  const totalDevolucion = itemsADevolver.reduce((acc, [productoId, cant]) => {
    const item = venta.items.find((i) => i.productoId === productoId);
    return acc + (item ? cant * Number(item.precioUnitario) : 0);
  }, 0);

  async function registrarDevolucion() {
    if (itemsADevolver.length === 0) return;
    setProcesandoDev(true);
    setError(null);
    try {
      await api.post(`/ventas/${venta.id}/devoluciones`, {
        items: itemsADevolver.map(([productoId, cantidad]) => ({ productoId, cantidad })),
        motivo: motivo || undefined,
      });
      onDevuelta();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo registrar la devolucion"));
      setProcesandoDev(false);
    }
  }

  const hayDevoluciones = venta.items.some((i) => i.cantidadDevuelta > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Venta #{venta.consecutivo}</h3>
          <button className="secondary" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
          {new Date(venta.fecha).toLocaleString("es-CO")} · {sucursalNombre}
          {venta.usuario && <> · Cajero: {venta.usuario.nombre}</>}
        </p>

        {/* Canal selector */}
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, minWidth: 60 }}>Canal:</label>
          <select
            value={canalEditando}
            onChange={(e) => setCanalEditando(e.target.value)}
            style={{ flex: 1, padding: "4px 6px", fontSize: 13 }}
          >
            <option value="POS">Punto de venta</option>
            <option value="SHOPIFY">Shopify</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="OTRO">Otro</option>
          </select>
          {canalEditando !== venta.canal && (
            <button
              type="button"
              onClick={() => onCambiarCanal(venta.id, canalEditando)}
              style={{ padding: "4px 12px", fontSize: 12 }}
            >
              Guardar
            </button>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant.</th>
              <th>Subtotal</th>
              {modoDevolucion && <th>Devolver</th>}
            </tr>
          </thead>
          <tbody>
            {venta.items.map((i) => {
              const disponibles = i.cantidad - i.cantidadDevuelta;
              return (
                <tr key={i.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {i.producto?.imagenUrl ? (
                        <img src={i.producto.imagenUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: "#f3f4f6" }} />
                      )}
                      <div>
                        <div>{nombreItem(i)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {i.producto ? i.producto.sku : "Venta libre"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {i.cantidad}
                    {i.cantidadDevuelta > 0 && (
                      <div style={{ fontSize: 11, color: "var(--danger)" }}>{i.cantidadDevuelta} devuelto(s)</div>
                    )}
                  </td>
                  <td>${(i.cantidad * Number(i.precioUnitario)).toLocaleString("es-CO")}</td>
                  {modoDevolucion && (
                    <td>
                      {disponibles > 0 ? (
                        <input
                          type="number"
                          min={0}
                          max={disponibles}
                          value={devolver[i.productoId] ?? 0}
                          onChange={(e) =>
                            setDevolver((prev) => ({
                              ...prev,
                              [i.productoId]: Math.max(0, Math.min(disponibles, Number(e.target.value) || 0)),
                            }))
                          }
                          style={{ width: 60 }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Todo devuelto</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <div>
            <span className={`badge ${badgePago[venta.metodoPago] ?? "neutral"}`}>{venta.metodoPago}</span>
            {venta.cliente && <span style={{ marginLeft: 8, fontSize: 13 }}>Cliente: {venta.cliente.nombre}</span>}
            {hayDevoluciones && <span className="badge danger" style={{ marginLeft: 8 }}>Con devoluciones</span>}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>${Number(venta.total).toLocaleString("es-CO")}</div>
        </div>

        {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}

        {modoDevolucion && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <input
              placeholder="Motivo de la devolucion (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            {totalDevolucion > 0 && (
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                Se devolveran <strong>${totalDevolucion.toLocaleString("es-CO")}</strong> y el inventario volvera al stock.
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={itemsADevolver.length === 0 || procesandoDev} onClick={registrarDevolucion}>
                {procesandoDev ? "Registrando..." : "Confirmar devolucion"}
              </button>
              <button className="secondary" type="button" onClick={() => { setModoDevolucion(false); setDevolver({}); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {!modoDevolucion && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {!confirmando ? (
              <div className="toolbar">
                <button type="button" onClick={() => onReimprimir(venta, sucursalNombre)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {Iconos.print} Reimprimir recibo
                </button>
                <button type="button" onClick={() => onImprimirEtiquetas(venta)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {Iconos.tag} Imprimir etiquetas
                </button>
                {puedeDevolver && (
                  <button className="secondary" type="button" onClick={() => setModoDevolucion(true)}>
                    Devolucion parcial
                  </button>
                )}
                <button className="danger" type="button" onClick={() => setConfirmando(true)}>
                  Eliminar venta
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, marginBottom: 8 }}>
                  ¿Seguro? Esto anula la venta completa y restaura todo el inventario. Para devolver solo algunos productos, usa
                  "Devolucion parcial".
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="danger" type="button" disabled={eliminando} onClick={eliminar}>
                    {eliminando ? "Eliminando..." : "Si, eliminar"}
                  </button>
                  <button className="secondary" type="button" onClick={() => setConfirmando(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
