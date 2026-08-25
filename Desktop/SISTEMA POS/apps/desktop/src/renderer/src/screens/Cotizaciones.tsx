import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  sku?: string;
  codigoBarras?: string;
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

// Iconos SVG inline
const Iconos = {
  document: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>,
  plus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>,
  barcode: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5M5 3v2M7 3v2M9 3v2M12 3v2M15 3v2M17 3v2M19 3v2M5 19v2M7 19v2M9 19v2M12 19v2M15 19v2M17 19v2M19 19v2"></path></svg>,
  trash: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>,
  download: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>,
  user: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  mail: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22 6 12 13 2 6"></polyline></svg>,
  phone: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>,
  building: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="12 3 20 7.5 20 19.5 4 21 4 7.5 12 3"></polyline><polyline points="9 12 9 21"></polyline><polyline points="15 5.5 15 21"></polyline><polyline points="9 12 15 12"></polyline></svg>,
  map: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24"></path></svg>,
  check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>,
};

export default function Cotizaciones() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

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

  // Buscar producto por código de barras o SKU
  const buscarProductoPorCodigo = (codigo: string) => {
    const producto = productos.find(
      (p) =>
        p.sku?.toLowerCase().includes(codigo.toLowerCase()) ||
        p.codigoBarras?.toLowerCase().includes(codigo.toLowerCase()) ||
        p.nombre.toLowerCase().includes(codigo.toLowerCase())
    );
    return producto;
  };

  const manejarEscaneoCodigoBarras = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const codigo = (e.target as HTMLInputElement).value.trim();
      if (codigo) {
        const producto = buscarProductoPorCodigo(codigo);
        if (producto) {
          setLineaEnEdicion({
            ...lineaEnEdicion,
            productoId: producto.id,
            precioUnitario: producto.precio,
            cantidad: 1,
          });
          (e.target as HTMLInputElement).value = "";
        } else {
          alert("Producto no encontrado: " + codigo);
          (e.target as HTMLInputElement).value = "";
        }
      }
    }
  };

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

  const descargarPDFCorrectamente = async (cotizacionId: string, numeroCotz: string) => {
    try {
      // Usar fetch en lugar de axios para blob
      const response = await fetch(
        `/cotizaciones/${cotizacionId}/descargar/pdf`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${(window as any).__token || ""}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Error descargando PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${numeroCotz}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentElement?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error descargando PDF:", err);
      alert("Error descargando PDF, pero la cotización fue creada correctamente.");
    }
  };

  const crearCotizacion = async () => {
    if (!form.clienteNombre.trim()) {
      alert("El nombre del cliente es obligatorio");
      return;
    }

    if (form.lineas.length === 0) {
      alert("Debes agregar al menos un producto");
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
      alert(`Cotización ${cotizacionCreada.numero} creada. Descargando PDF...`);

      // Descargar PDF después de crear
      setTimeout(() => {
        descargarPDFCorrectamente(cotizacionCreada.id, cotizacionCreada.numero);
      }, 800);

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

      setTimeout(() => cargar(), 1500);
    } catch (err) {
      console.error("Error creando cotización:", err);
      mensajeError(err);
    } finally {
      setCargando(false);
    }
  };

  const descargarCotizacion = async (id: string, formato: "pdf" | "word") => {
    try {
      const response = await fetch(
        `/cotizaciones/${id}/descargar/${formato}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${(window as any).__token || ""}`,
          },
        }
      );

      if (!response.ok) throw new Error("Error descargando");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cotizacion = cotizaciones.find((c) => c.id === id);
      link.setAttribute("download", `${cotizacion?.numero}.${formato === "pdf" ? "pdf" : "docx"}`);
      document.body.appendChild(link);
      link.click();
      link.parentElement?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error descargando archivo");
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
        <button onClick={() => setMostrarForm(true)} style={{ backgroundColor: "#4CAF50", display: "flex", alignItems: "center", gap: "8px" }}>
          {Iconos.plus} Nueva cotización
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total de cotizaciones</div>
          <div className="value">{cotizaciones.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Valor total</div>
          <div className="value">
            ${cotizaciones.reduce((a, c) => a + c.total, 0).toLocaleString("es-CO")}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 12 }}>
          {Iconos.search}
          <input
            placeholder="Buscar por cliente o número..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "4px" }}
          />
        </div>

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
                        style={{ marginRight: 4, backgroundColor: "#d32f2f", display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        {Iconos.download} PDF
                      </button>
                      <button
                        onClick={() => descargarCotizacion(cot.id, "word")}
                        style={{ backgroundColor: "#1976d2", display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        {Iconos.download} Word
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
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
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
            <h3>Nueva Cotización</h3>

            <div style={{ backgroundColor: "#f5f5f5", padding: "12px", borderRadius: "4px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ color: "#1976d2", marginTop: "4px" }}>{Iconos.user}</div>
              <div>
                <strong>Datos del Cliente</strong>
                <p style={{ fontSize: "0.85em", color: "#666", margin: "4px 0 0 0" }}>
                  Información de quién recibirá la cotización
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", marginBottom: 4 }}>
                  {Iconos.user} Nombre del cliente
                </label>
                <input
                  placeholder="Ej: Juan Pérez"
                  value={form.clienteNombre}
                  onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
                <small style={{ color: "#999" }}>Obligatorio</small>
              </div>

              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", marginBottom: 4 }}>
                  {Iconos.mail} Email
                </label>
                <input
                  placeholder="juan@example.com"
                  type="email"
                  value={form.clienteEmail}
                  onChange={(e) => setForm({ ...form, clienteEmail: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", marginBottom: 4 }}>
                  {Iconos.phone} Teléfono
                </label>
                <input
                  placeholder="+57 300 123 4567"
                  value={form.clienteTelefono}
                  onChange={(e) => setForm({ ...form, clienteTelefono: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", marginBottom: 4 }}>
                  {Iconos.building} Empresa
                </label>
                <input
                  placeholder="Acme Corp"
                  value={form.clienteEmpresa}
                  onChange={(e) => setForm({ ...form, clienteEmpresa: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", marginBottom: 4 }}>
                  {Iconos.map} Dirección
                </label>
                <input
                  placeholder="Calle 123 #45-67"
                  value={form.clienteDireccion}
                  onChange={(e) => setForm({ ...form, clienteDireccion: e.target.value })}
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>
            </div>

            <div style={{ backgroundColor: "#f5f5f5", padding: "12px", borderRadius: "4px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ color: "#1976d2", marginTop: "4px" }}>{Iconos.barcode}</div>
              <div>
                <strong>Agregar Productos</strong>
                <p style={{ fontSize: "0.85em", color: "#666", margin: "4px 0 0 0" }}>
                  Escanea código de barras o selecciona manualmente
                </p>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", marginBottom: 4 }}>
                {Iconos.barcode} Escanear Código de Barras
              </label>
              <input
                ref={scanInputRef}
                placeholder="Escanea aquí con la pistola..."
                onKeyDown={manejarEscaneoCodigoBarras}
                style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "2px solid #4CAF50" }}
                autoFocus
              />
              <small style={{ color: "#999" }}>Presiona Enter después de escanear</small>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 16 }}>
              <div>
                <label style={{ fontWeight: "bold", marginBottom: 4, display: "block" }}>
                  Producto
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
                  <option value="">Selecciona...</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontWeight: "bold", marginBottom: 4, display: "block" }}>
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  value={lineaEnEdicion.cantidad}
                  onChange={(e) =>
                    setLineaEnEdicion({ ...lineaEnEdicion, cantidad: Number(e.target.value) })
                  }
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div>
                <label style={{ fontWeight: "bold", marginBottom: 4, display: "block" }}>
                  Precio
                </label>
                <input
                  type="number"
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
                <label style={{ fontWeight: "bold", marginBottom: 4, display: "block" }}>
                  Desc %
                </label>
                <input
                  type="number"
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Iconos.plus}
              </button>
            </div>

            {form.lineas.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: "bold", marginBottom: 8, display: "block" }}>
                  Productos agregados
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
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {Iconos.trash}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ backgroundColor: "#f5f5f5", padding: "12px", borderRadius: "4px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ color: "#1976d2", marginTop: "4px" }}>{Iconos.settings}</div>
              <div>
                <strong>Cálculos y Condiciones</strong>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontWeight: "bold", marginBottom: 4, display: "block" }}>
                  Descuento Global (%)
                </label>
                <input
                  type="number"
                  value={form.descuentoPorcentaje}
                  onChange={(e) => setForm({ ...form, descuentoPorcentaje: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>

              <div>
                <label style={{ fontWeight: "bold", marginBottom: 4, display: "block" }}>
                  IVA (%)
                </label>
                <input
                  type="number"
                  value={form.impuestoPorcentaje}
                  onChange={(e) => setForm({ ...form, impuestoPorcentaje: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontWeight: "bold", marginBottom: 4, display: "block" }}>
                Comentarios o Notas
              </label>
              <textarea
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                placeholder="Términos de pago, vigencia, etc..."
                rows={3}
                style={{ width: "100%", padding: "8px", fontFamily: "inherit" }}
              />
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
                <span>Subtotal:</span>
                <span style={{ textAlign: "right" }}>${subtotal.toLocaleString("es-CO")}</span>

                <span>Descuento:</span>
                <span style={{ textAlign: "right", color: "#d32f2f" }}>
                  -${descuentoValor.toLocaleString("es-CO")}
                </span>

                <span>IVA ({form.impuestoPorcentaje}%):</span>
                <span style={{ textAlign: "right", color: "#2e7d32" }}>
                  +${impuestoValor.toLocaleString("es-CO")}
                </span>

                <span style={{ borderTop: "2px solid #1976d2", paddingTop: 8, fontWeight: "bold" }}>
                  TOTAL:
                </span>
                <span
                  style={{
                    textAlign: "right",
                    borderTop: "2px solid #1976d2",
                    paddingTop: 8,
                    fontWeight: "bold",
                    color: "#1976d2",
                    fontSize: "1.1em",
                  }}
                >
                  ${total.toLocaleString("es-CO")}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "flex-end" }}>
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
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  opacity: cargando || form.lineas.length === 0 ? 0.5 : 1,
                }}
              >
                {Iconos.check} {cargando ? "Creando..." : "Crear y descargar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
