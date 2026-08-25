import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";

interface Producto {
  id: string;
  nombre: string;
  precio: number;
}

interface LineaCotizacion {
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje: number;
  descuentoValor: number;
  subtotal: number;
}

interface Cotizacion {
  id: string;
  numero: string;
  clienteNombre: string;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  clienteEmpresa: string | null;
  clienteDireccion: string | null;
  estado: string;
  fechaCreacion: string;
  fechaVigencia: string | null;
  subtotal: number;
  descuentoValor: number;
  impuestoValor: number;
  total: number;
  lineas: LineaCotizacion[];
}

export default function Cotizaciones() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(false);

  const [form, setForm] = useState({
    clienteNombre: "",
    clienteEmail: "",
    clienteTelefono: "",
    clienteEmpresa: "",
    clienteDireccion: "",
    descuentoPorcentaje: 0,
    impuestoPorcentaje: 19,
    comentarios: "",
    lineas: [] as LineaCotizacion[],
  });

  const [lineaEnEdicion, setLineaEnEdicion] = useState({
    productoId: "",
    cantidad: 1,
    precioUnitario: 0,
    descuentoPorcentaje: 0,
  });

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<Cotizacion[]>("/cotizaciones");
      setCotizaciones(data);
    } catch (err) {
      mensajeError(err);
    }
  }, []);

  const cargarProductos = useCallback(async () => {
    try {
      const { data } = await api.get<Producto[]>("/productos");
      setProductos(data);
    } catch (err) {
      mensajeError(err);
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarProductos();
  }, [cargar, cargarProductos]);

  const agregarLinea = () => {
    if (!lineaEnEdicion.productoId) {
      alert("Selecciona un producto");
      return;
    }

    const subtotal = lineaEnEdicion.cantidad * lineaEnEdicion.precioUnitario;
    const descuentoValor = (subtotal * lineaEnEdicion.descuentoPorcentaje) / 100;

    setForm({
      ...form,
      lineas: [
        ...form.lineas,
        {
          productoId: lineaEnEdicion.productoId,
          cantidad: lineaEnEdicion.cantidad,
          precioUnitario: lineaEnEdicion.precioUnitario,
          descuentoPorcentaje: lineaEnEdicion.descuentoPorcentaje,
          descuentoValor,
          subtotal: subtotal - descuentoValor,
        },
      ],
    });

    setLineaEnEdicion({ productoId: "", cantidad: 1, precioUnitario: 0, descuentoPorcentaje: 0 });
  };

  const eliminarLinea = (idx: number) => {
    setForm({ ...form, lineas: form.lineas.filter((_, i) => i !== idx) });
  };

  const calcularTotales = () => {
    const subtotal = form.lineas.reduce((acc, l) => acc + l.subtotal, 0);
    const descuentoValor = (subtotal * form.descuentoPorcentaje) / 100;
    const impuestoValor = ((subtotal - descuentoValor) * form.impuestoPorcentaje) / 100;
    const total = subtotal - descuentoValor + impuestoValor;
    return { subtotal, descuentoValor, impuestoValor, total };
  };

  const { subtotal, descuentoValor, impuestoValor, total } = calcularTotales();

  const crearCotizacion = async () => {
    if (!form.clienteNombre || form.lineas.length === 0) {
      alert("Completa los datos obligatorios");
      return;
    }

    setCargando(true);
    try {
      await api.post("/cotizaciones", {
        clienteNombre: form.clienteNombre,
        clienteEmail: form.clienteEmail || undefined,
        clienteTelefono: form.clienteTelefono || undefined,
        clienteEmpresa: form.clienteEmpresa || undefined,
        clienteDireccion: form.clienteDireccion || undefined,
        descuentoPorcentaje: form.descuentoPorcentaje,
        impuestoPorcentaje: form.impuestoPorcentaje,
        comentarios: form.comentarios || undefined,
        lineas: form.lineas,
      });

      alert("Cotización creada exitosamente");
      setForm({
        clienteNombre: "",
        clienteEmail: "",
        clienteTelefono: "",
        clienteEmpresa: "",
        clienteDireccion: "",
        descuentoPorcentaje: 0,
        impuestoPorcentaje: 19,
        comentarios: "",
        lineas: [],
      });
      setMostrarForm(false);
      cargar();
    } catch (err) {
      mensajeError(err);
    } finally {
      setCargando(false);
    }
  };

  const descargarCotizacion = async (id: string, formato: "pdf" | "word") => {
    try {
      const response = await api.get(`/cotizaciones/${id}/descargar/${formato}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data as any]));
      const link = document.createElement("a");
      link.href = url;
      const cotizacion = cotizaciones.find((c) => c.id === id);
      link.setAttribute("download", `${cotizacion?.numero}.${formato === "pdf" ? "pdf" : "docx"}`);
      document.body.appendChild(link);
      link.click();
      link.parentElement?.removeChild(link);
    } catch (err) {
      mensajeError(err);
    }
  };

  const cotizacionesFiltradas = cotizaciones.filter((c) =>
    c.clienteNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.numero.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Cotizaciones</h2>
          <p>Gestión de presupuestos y cotizaciones a clientes</p>
        </div>
        <button onClick={() => setMostrarForm(true)}>Nueva cotización</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total de cotizaciones</div>
          <div className="value">{cotizaciones.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total valor</div>
          <div className="value">
            ${cotizaciones.reduce((a, c) => a + c.total, 0).toLocaleString("es-CO")}
          </div>
        </div>
      </div>

      <div className="card">
        <input
          placeholder="Buscar por cliente o número"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: "100%", marginBottom: 12 }}
        />

        {cotizacionesFiltradas.length === 0 ? (
          <p className="empty-state">No hay cotizaciones</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cotizacionesFiltradas.map((cot) => (
                  <tr key={cot.id}>
                    <td>{cot.numero}</td>
                    <td>{cot.clienteNombre}</td>
                    <td>{cot.estado}</td>
                    <td>{new Date(cot.fechaCreacion).toLocaleDateString("es-CO")}</td>
                    <td>${cot.total.toLocaleString("es-CO")}</td>
                    <td>
                      <button
                        onClick={() => descargarCotizacion(cot.id, "pdf")}
                        style={{ marginRight: 4 }}
                      >
                        PDF
                      </button>
                      <button onClick={() => descargarCotizacion(cot.id, "word")}>
                        Word
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mostrarForm && (
        <div
          className="modal-overlay"
          onClick={() => !cargando && setMostrarForm(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Nueva cotización</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                placeholder="Nombre cliente *"
                value={form.clienteNombre}
                onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })}
              />
              <input
                placeholder="Email"
                value={form.clienteEmail}
                onChange={(e) => setForm({ ...form, clienteEmail: e.target.value })}
              />
              <input
                placeholder="Teléfono"
                value={form.clienteTelefono}
                onChange={(e) => setForm({ ...form, clienteTelefono: e.target.value })}
              />
              <input
                placeholder="Empresa"
                value={form.clienteEmpresa}
                onChange={(e) => setForm({ ...form, clienteEmpresa: e.target.value })}
              />
              <input
                placeholder="Dirección"
                value={form.clienteDireccion}
                onChange={(e) => setForm({ ...form, clienteDireccion: e.target.value })}
                style={{ gridColumn: "1 / -1" }}
              />
            </div>

            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <h4>Agregar productos</h4>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8 }}>
                <select
                  value={lineaEnEdicion.productoId}
                  onChange={(e) => {
                    const prod = productos.find((p) => p.id === e.target.value);
                    setLineaEnEdicion({
                      ...lineaEnEdicion,
                      productoId: e.target.value,
                      precioUnitario: prod?.precio || 0,
                    });
                  }}
                >
                  <option value="">Producto</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Cantidad"
                  min="1"
                  value={lineaEnEdicion.cantidad}
                  onChange={(e) =>
                    setLineaEnEdicion({ ...lineaEnEdicion, cantidad: Number(e.target.value) })
                  }
                />
                <input
                  type="number"
                  placeholder="Precio"
                  value={lineaEnEdicion.precioUnitario}
                  onChange={(e) =>
                    setLineaEnEdicion({
                      ...lineaEnEdicion,
                      precioUnitario: Number(e.target.value),
                    })
                  }
                />
                <input
                  type="number"
                  placeholder="Desc %"
                  value={lineaEnEdicion.descuentoPorcentaje}
                  onChange={(e) =>
                    setLineaEnEdicion({
                      ...lineaEnEdicion,
                      descuentoPorcentaje: Number(e.target.value),
                    })
                  }
                />
                <button onClick={agregarLinea}>Agregar</button>
              </div>
            </div>

            {form.lineas.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <table style={{ width: "100%", fontSize: "0.9em" }}>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Precio</th>
                      <th>Descuento</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineas.map((linea, idx) => (
                      <tr key={idx}>
                        <td>{productos.find((p) => p.id === linea.productoId)?.nombre}</td>
                        <td>{linea.cantidad}</td>
                        <td>${linea.precioUnitario.toLocaleString("es-CO")}</td>
                        <td>{linea.descuentoPorcentaje}%</td>
                        <td>${linea.subtotal.toLocaleString("es-CO")}</td>
                        <td>
                          <button onClick={() => eliminarLinea(idx)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label>Descuento global %</label>
                <input
                  type="number"
                  value={form.descuentoPorcentaje}
                  onChange={(e) => setForm({ ...form, descuentoPorcentaje: Number(e.target.value) })}
                />
              </div>
              <div>
                <label>IVA %</label>
                <input
                  type="number"
                  value={form.impuestoPorcentaje}
                  onChange={(e) => setForm({ ...form, impuestoPorcentaje: Number(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Comentarios</label>
              <textarea
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                rows={3}
                style={{ width: "100%" }}
              />
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: "#f5f5f5",
                borderRadius: 4,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.9em" }}>
                <span>Subtotal:</span>
                <span style={{ textAlign: "right" }}>${subtotal.toLocaleString("es-CO")}</span>
                <span>Descuento:</span>
                <span style={{ textAlign: "right" }}>
                  -${descuentoValor.toLocaleString("es-CO")}
                </span>
                <span>IVA:</span>
                <span style={{ textAlign: "right" }}>+${impuestoValor.toLocaleString("es-CO")}</span>
                <span style={{ fontWeight: "bold" }}>Total:</span>
                <span style={{ textAlign: "right", fontWeight: "bold" }}>
                  ${total.toLocaleString("es-CO")}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => !cargando && setMostrarForm(false)}
                disabled={cargando}
              >
                Cancelar
              </button>
              <button
                onClick={crearCotizacion}
                disabled={cargando}
                style={{ backgroundColor: "#4CAF50" }}
              >
                {cargando ? "Creando..." : "Crear cotización"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
