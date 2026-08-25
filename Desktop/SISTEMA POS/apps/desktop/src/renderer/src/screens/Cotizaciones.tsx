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
      alert("⚠️ Por favor selecciona un producto");
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

  const descargarPDFAutomatico = async (cotizacionId: string, numeroCotz: string) => {
    try {
      const response = await api.get(`/cotizaciones/${cotizacionId}/descargar/pdf`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data as any]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${numeroCotz}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentElement?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error descargando PDF:", err);
    }
  };

  const crearCotizacion = async () => {
    if (!form.clienteNombre.trim()) {
      alert("⚠️ El nombre del cliente es obligatorio");
      return;
    }

    if (form.lineas.length === 0) {
      alert("⚠️ Debes agregar al menos un producto a la cotización");
      return;
    }

    setCargando(true);
    try {
      const response = await api.post<Cotizacion>("/cotizaciones", {
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

      const cotizacionCreada = response.data;

      alert(
        `✅ Cotización ${cotizacionCreada.numero} creada exitosamente.\n\nDescargando PDF...`
      );

      // Descargar PDF automáticamente
      setTimeout(() => {
        descargarPDFAutomatico(cotizacionCreada.id, cotizacionCreada.numero);
      }, 500);

      // Limpiar formulario
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

      // Recargar lista
      setTimeout(() => cargar(), 1000);
    } catch (err) {
      console.error("Error creando cotización:", err);
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
      window.URL.revokeObjectURL(url);
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
          <h2>💼 Cotizaciones</h2>
          <p>Gestión de presupuestos y cotizaciones a clientes</p>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ backgroundColor: "#4CAF50" }}>
          ➕ Nueva cotización
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">📊 Total de cotizaciones</div>
          <div className="value">{cotizaciones.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">💰 Valor total</div>
          <div className="value">
            ${cotizaciones.reduce((a, c) => a + c.total, 0).toLocaleString("es-CO")}
          </div>
        </div>
      </div>

      <div className="card">
        <input
          placeholder="🔍 Buscar por nombre de cliente o número de cotización..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: "10px", borderRadius: "4px" }}
        />

        {cotizacionesFiltradas.length === 0 ? (
          <p className="empty-state">📋 No hay cotizaciones registradas</p>
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
                  <th>Descargar</th>
                </tr>
              </thead>
              <tbody>
                {cotizacionesFiltradas.map((cot) => (
                  <tr key={cot.id}>
                    <td>{cot.numero}</td>
                    <td>{cot.clienteNombre}</td>
                    <td>
                      <span style={{ padding: "4px 8px", borderRadius: "4px", backgroundColor: "#e3f2fd", color: "#1976d2" }}>
                        {cot.estado}
                      </span>
                    </td>
                    <td>{new Date(cot.fechaCreacion).toLocaleDateString("es-CO")}</td>
                    <td style={{ fontWeight: "bold", color: "#2e7d32" }}>
                      ${cot.total.toLocaleString("es-CO")}
                    </td>
                    <td>
                      <button
                        onClick={() => descargarCotizacion(cot.id, "pdf")}
                        style={{ marginRight: 4, backgroundColor: "#d32f2f" }}
                      >
                        📄 PDF
                      </button>
                      <button
                        onClick={() => descargarCotizacion(cot.id, "word")}
                        style={{ backgroundColor: "#1976d2" }}
                      >
                        📝 Word
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
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)", position: "fixed", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxHeight: "90vh",
              overflowY: "auto",
              width: "90%",
              maxWidth: "800px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
          >
            <h3>📋 Nueva Cotización</h3>
            <p style={{ color: "#666", marginBottom: "16px" }}>
              Completa todos los datos del cliente y agrega los productos que deseas cotizar.
            </p>

            <div style={{ backgroundColor: "#f5f5f5", padding: "12px", borderRadius: "4px", marginBottom: "16px" }}>
              <strong>📌 Datos del Cliente</strong>
              <p style={{ fontSize: "0.9em", color: "#666", margin: "8px 0 0 0" }}>
                Información de quién recibirá la cotización
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  👤 Nombre del cliente *
                </label>
                <input
                  placeholder="Ej: Juan Pérez"
                  value={form.clienteNombre}
                  onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Campo obligatorio</small>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  📧 Email
                </label>
                <input
                  placeholder="Ej: juan@example.com"
                  type="email"
                  value={form.clienteEmail}
                  onChange={(e) => setForm({ ...form, clienteEmail: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Para enviar la cotización por correo</small>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  📱 Teléfono
                </label>
                <input
                  placeholder="Ej: +57 300 123 4567"
                  value={form.clienteTelefono}
                  onChange={(e) => setForm({ ...form, clienteTelefono: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Número de contacto</small>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  🏢 Empresa
                </label>
                <input
                  placeholder="Ej: Acme Corp"
                  value={form.clienteEmpresa}
                  onChange={(e) => setForm({ ...form, clienteEmpresa: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Nombre de la empresa (opcional)</small>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  📍 Dirección
                </label>
                <input
                  placeholder="Ej: Calle 123 #45-67, Apto 8B"
                  value={form.clienteDireccion}
                  onChange={(e) => setForm({ ...form, clienteDireccion: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Dirección de entrega o envío</small>
              </div>
            </div>

            <div style={{ backgroundColor: "#f5f5f5", padding: "12px", borderRadius: "4px", marginBottom: "16px" }}>
              <strong>🛒 Productos a Cotizar</strong>
              <p style={{ fontSize: "0.9em", color: "#666", margin: "8px 0 0 0" }}>
                Selecciona los productos que deseas incluir en la cotización
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  Producto *
                </label>
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
                  style={{ width: "100%", padding: "8px" }}
                >
                  <option value="">-- Selecciona un producto --</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  Cantidad
                </label>
                <input
                  type="number"
                  placeholder="1"
                  min="1"
                  value={lineaEnEdicion.cantidad}
                  onChange={(e) =>
                    setLineaEnEdicion({ ...lineaEnEdicion, cantidad: Number(e.target.value) })
                  }
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  Precio Unit.
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={lineaEnEdicion.precioUnitario}
                  onChange={(e) =>
                    setLineaEnEdicion({
                      ...lineaEnEdicion,
                      precioUnitario: Number(e.target.value),
                    })
                  }
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  Desc %
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={lineaEnEdicion.descuentoPorcentaje}
                  onChange={(e) =>
                    setLineaEnEdicion({
                      ...lineaEnEdicion,
                      descuentoPorcentaje: Number(e.target.value),
                    })
                  }
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <button
                onClick={agregarLinea}
                style={{
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  marginTop: "20px",
                }}
              >
                ➕
              </button>
            </div>

            {form.lineas.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 8 }}>
                  Productos agregados:
                </label>
                <table style={{ width: "100%", fontSize: "0.9em" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f0f0f0" }}>
                      <th style={{ textAlign: "left", padding: "8px" }}>Producto</th>
                      <th style={{ textAlign: "center", padding: "8px" }}>Cantidad</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Precio</th>
                      <th style={{ textAlign: "center", padding: "8px" }}>Desc</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Subtotal</th>
                      <th style={{ textAlign: "center", padding: "8px" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineas.map((linea, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #ddd" }}>
                        <td style={{ padding: "8px" }}>
                          {productos.find((p) => p.id === linea.productoId)?.nombre}
                        </td>
                        <td style={{ textAlign: "center", padding: "8px" }}>{linea.cantidad}</td>
                        <td style={{ textAlign: "right", padding: "8px" }}>
                          ${linea.precioUnitario.toLocaleString("es-CO")}
                        </td>
                        <td style={{ textAlign: "center", padding: "8px" }}>
                          {linea.descuentoPorcentaje}%
                        </td>
                        <td style={{ textAlign: "right", padding: "8px", fontWeight: "bold" }}>
                          ${linea.subtotal.toLocaleString("es-CO")}
                        </td>
                        <td style={{ textAlign: "center", padding: "8px" }}>
                          <button
                            onClick={() => eliminarLinea(idx)}
                            style={{
                              backgroundColor: "#d32f2f",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              padding: "4px 8px",
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ backgroundColor: "#f5f5f5", padding: "12px", borderRadius: "4px", marginBottom: "16px" }}>
              <strong>💵 Cálculos y Condiciones</strong>
              <p style={{ fontSize: "0.9em", color: "#666", margin: "8px 0 0 0" }}>
                Configura descuentos, impuestos y términos de pago
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  💳 Descuento Global (%)
                </label>
                <input
                  type="number"
                  value={form.descuentoPorcentaje}
                  onChange={(e) => setForm({ ...form, descuentoPorcentaje: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Se aplica sobre el subtotal</small>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                  📊 IVA (%)
                </label>
                <input
                  type="number"
                  value={form.impuestoPorcentaje}
                  onChange={(e) => setForm({ ...form, impuestoPorcentaje: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Impuesto sobre valor agregado (19% estándar)</small>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                📝 Comentarios o Notas
              </label>
              <textarea
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                placeholder="Ej: Válido por 15 días, entrega a 5 días, contáctanos para pedidos mayores..."
                rows={3}
                style={{ width: "100%", padding: "8px", fontFamily: "inherit" }}
              />
              <small style={{ color: "#999" }}>Incluye términos de pago, vigencia, etc.</small>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 16,
                backgroundColor: "#e3f2fd",
                borderRadius: 8,
                borderLeft: "4px solid #1976d2",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: "0.95em" }}>
                <div>
                  <span style={{ color: "#666" }}>Subtotal:</span>
                </div>
                <div style={{ textAlign: "right", fontWeight: "bold" }}>
                  ${subtotal.toLocaleString("es-CO")}
                </div>

                <div>
                  <span style={{ color: "#666" }}>Descuento:</span>
                </div>
                <div style={{ textAlign: "right", color: "#d32f2f", fontWeight: "bold" }}>
                  -${descuentoValor.toLocaleString("es-CO")}
                </div>

                <div>
                  <span style={{ color: "#666" }}>IVA ({form.impuestoPorcentaje}%):</span>
                </div>
                <div style={{ textAlign: "right", color: "#2e7d32", fontWeight: "bold" }}>
                  +${impuestoValor.toLocaleString("es-CO")}
                </div>

                <div style={{ borderTop: "2px solid #1976d2", paddingTop: 8 }}>
                  <span style={{ fontWeight: "bold", fontSize: "1.1em" }}>💰 TOTAL:</span>
                </div>
                <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "1.1em", color: "#1976d2" }}>
                  ${total.toLocaleString("es-CO")}
                </div>
              </div>
            </div>

            <div
              style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => !cargando && setMostrarForm(false)}
                disabled={cargando}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#999",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: cargando ? "not-allowed" : "pointer",
                  opacity: cargando ? 0.5 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={crearCotizacion}
                disabled={cargando || form.lineas.length === 0}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: cargando || form.lineas.length === 0 ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                  fontSize: "1em",
                  opacity: cargando || form.lineas.length === 0 ? 0.5 : 1,
                }}
              >
                {cargando ? "⏳ Creando cotización..." : "✅ Crear cotización y descargar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
