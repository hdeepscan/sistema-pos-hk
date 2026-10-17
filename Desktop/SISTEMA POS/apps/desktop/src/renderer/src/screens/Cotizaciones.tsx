import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";
import { useSesionStore, usePermiso } from "../lib/store";

// Los montos llegan como texto (Decimal de Prisma): siempre se convierten con Number().
type Numero = number | string;

interface Producto {
  id: string;
  nombre: string;
  precio: Numero;
  sku?: string;
  codigoBarras?: string | null;
  varianteTitulo?: string | null;
}

type Estado = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "VENCIDA";

interface LineaApi {
  productoId: string;
  cantidad: Numero;
  precioUnitario: Numero;
  descuentoPorcentaje: Numero;
  subtotal: Numero;
  producto?: { nombre: string; sku: string; varianteTitulo: string | null } | null;
}

interface Cotizacion {
  id: string;
  numero: string;
  clienteNombre: string;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  clienteEmpresa: string | null;
  clienteDireccion: string | null;
  clienteTipoDocumento: string | null;
  clienteNumeroDocumento: string | null;
  estado: Estado;
  fechaCreacion: string;
  fechaVigencia: string | null;
  subtotal: Numero;
  descuentoPorcentaje: Numero;
  descuentoValor: Numero;
  impuestoPorcentaje: Numero;
  impuestoValor: Numero;
  total: Numero;
  comentarios: string | null;
  condicionesPago: string | null;
  firmaBase64?: string | null;
  lineas: LineaApi[];
}

// Línea en el formulario (los valores se editan como texto para permitir borrar el campo).
interface LineaForm {
  productoId: string;
  nombre: string;
  cantidad: string;
  precioUnitario: string;
  descuentoPorcentaje: string;
}

const ESTADOS: { valor: Estado; etiqueta: string; badge: string }[] = [
  { valor: "BORRADOR", etiqueta: "Borrador", badge: "neutral" },
  { valor: "ENVIADA", etiqueta: "Enviada", badge: "warning" },
  { valor: "ACEPTADA", etiqueta: "Aceptada", badge: "success" },
  { valor: "RECHAZADA", etiqueta: "Rechazada", badge: "danger" },
  { valor: "VENCIDA", etiqueta: "Vencida", badge: "danger" },
];
const infoEstado = (e: string) => ESTADOS.find((x) => x.valor === e) ?? ESTADOS[0];

const pesos = (n: Numero) =>
  `$${Number(n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const redondear = (n: number) => Math.round(n * 100) / 100;
const nombreProducto = (p: { nombre: string; varianteTitulo?: string | null }) =>
  p.varianteTitulo ? `${p.nombre} (${p.varianteTitulo})` : p.nombre;
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota" });

const FORM_VACIO = {
  clienteNombre: "",
  clienteEmail: "",
  clienteTelefono: "",
  clienteEmpresa: "",
  clienteDireccion: "",
  clienteTipoDocumento: "NIT",
  clienteNumeroDocumento: "",
  fechaVigencia: "",
  condicionesPago: "",
  comentarios: "",
  descuentoPorcentaje: "0",
  impuestoPorcentaje: "19",
  firmaBase64: "",
  quitarFirma: false,
  lineas: [] as LineaForm[],
};
type FormCotizacion = typeof FORM_VACIO;

// Mismo cálculo que el servidor: IVA sobre el subtotal ya descontado.
function calcularTotales(form: FormCotizacion) {
  const lineas = form.lineas.map((l) => {
    const bruto = (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0);
    return redondear(bruto - redondear((bruto * (Number(l.descuentoPorcentaje) || 0)) / 100));
  });
  const subtotal = redondear(lineas.reduce((a, b) => a + b, 0));
  const descuentoValor = redondear((subtotal * (Number(form.descuentoPorcentaje) || 0)) / 100);
  const impuestoValor = redondear(((subtotal - descuentoValor) * (Number(form.impuestoPorcentaje) || 0)) / 100);
  return { lineas, subtotal, descuentoValor, impuestoValor, total: redondear(subtotal - descuentoValor + impuestoValor) };
}

const estiloCampo = { width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 };

export default function Cotizaciones() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<Estado | "">("");
  const [cargandoLista, setCargandoLista] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormCotizacion>(FORM_VACIO);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [filtroProducto, setFiltroProducto] = useState("");
  const [productoSel, setProductoSel] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const puedeCrear = usePermiso("cotizaciones.crear");
  const puedeEditar = usePermiso("cotizaciones.editar");
  const puedeEliminar = usePermiso("cotizaciones.eliminar");

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<Cotizacion[]>("/cotizaciones");
      setCotizaciones(data);
      setError(null);
    } catch (err) {
      setError(mensajeError(err, "No se pudieron cargar las cotizaciones"));
    } finally {
      setCargandoLista(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    api
      .get<Producto[]>("/productos")
      .then(({ data }) => setProductos(data))
      .catch(() => undefined);
  }, [cargar]);

  // ---------- Listado ----------
  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return cotizaciones.filter(
      (c) =>
        (!filtroEstado || c.estado === filtroEstado) &&
        (!q ||
          normalizar(c.clienteNombre).includes(q) ||
          normalizar(c.numero).includes(q) ||
          normalizar(c.clienteEmpresa ?? "").includes(q))
    );
  }, [cotizaciones, busqueda, filtroEstado]);

  const valorListado = filtradas.reduce((a, c) => a + Number(c.total), 0);
  const valorAceptadas = filtradas.filter((c) => c.estado === "ACEPTADA").reduce((a, c) => a + Number(c.total), 0);

  async function descargar(c: { id: string; numero: string }, formato: "pdf" | "word") {
    try {
      const { apiBaseUrl, token } = useSesionStore.getState();
      if (!token) throw new Error("No hay sesión activa");
      const base = apiBaseUrl && apiBaseUrl !== "/" ? apiBaseUrl : window.location.origin;
      const res = await fetch(`${base}/cotizaciones/${c.id}/descargar/${formato}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        throw new Error(cuerpo?.error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.numero}.${formato === "pdf" ? "pdf" : "docx"}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 200);
    } catch (err) {
      setError(`No se pudo descargar ${c.numero}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function cambiarEstado(c: Cotizacion, estado: Estado) {
    if (estado === c.estado) return;
    setProcesando(c.id);
    try {
      const { data } = await api.patch<Cotizacion>(`/cotizaciones/${c.id}/estado`, { estado });
      setCotizaciones((prev) => prev.map((x) => (x.id === c.id ? { ...x, estado: data.estado } : x)));
    } catch (err) {
      setError(mensajeError(err, "No se pudo cambiar el estado"));
    } finally {
      setProcesando(null);
    }
  }

  async function eliminar(c: Cotizacion) {
    if (!window.confirm(`¿Eliminar la cotización ${c.numero} de ${c.clienteNombre}? No se puede deshacer.`)) return;
    setProcesando(c.id);
    try {
      await api.delete(`/cotizaciones/${c.id}`);
      setCotizaciones((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setError(mensajeError(err, "No se pudo eliminar la cotización"));
    } finally {
      setProcesando(null);
    }
  }

  // ---------- Formulario ----------
  function abrirNueva() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setErrorForm(null);
    setFiltroProducto("");
    setProductoSel("");
    setMostrarForm(true);
  }

  async function abrirEdicion(c: Cotizacion) {
    setProcesando(c.id);
    try {
      const { data } = await api.get<Cotizacion>(`/cotizaciones/${c.id}`);
      setEditandoId(c.id);
      setForm({
        clienteNombre: data.clienteNombre,
        clienteEmail: data.clienteEmail ?? "",
        clienteTelefono: data.clienteTelefono ?? "",
        clienteEmpresa: data.clienteEmpresa ?? "",
        clienteDireccion: data.clienteDireccion ?? "",
        clienteTipoDocumento: data.clienteTipoDocumento ?? "NIT",
        clienteNumeroDocumento: data.clienteNumeroDocumento ?? "",
        fechaVigencia: data.fechaVigencia ? data.fechaVigencia.slice(0, 10) : "",
        condicionesPago: data.condicionesPago ?? "",
        comentarios: data.comentarios ?? "",
        descuentoPorcentaje: String(Number(data.descuentoPorcentaje)),
        impuestoPorcentaje: String(Number(data.impuestoPorcentaje)),
        firmaBase64: data.firmaBase64 ?? "",
        quitarFirma: false,
        lineas: data.lineas.map((l) => ({
          productoId: l.productoId,
          nombre: l.producto ? nombreProducto(l.producto) : "Producto",
          cantidad: String(Number(l.cantidad)),
          precioUnitario: String(Number(l.precioUnitario)),
          descuentoPorcentaje: String(Number(l.descuentoPorcentaje)),
        })),
      });
      setErrorForm(null);
      setFiltroProducto("");
      setProductoSel("");
      setMostrarForm(true);
    } catch (err) {
      setError(mensajeError(err, "No se pudo abrir la cotización"));
    } finally {
      setProcesando(null);
    }
  }

  // Agrega el producto; si ya está en la cotización, suma 1 a la cantidad.
  function agregarProducto(p: Producto) {
    setForm((f) => {
      const idx = f.lineas.findIndex((l) => l.productoId === p.id);
      if (idx >= 0) {
        const lineas = [...f.lineas];
        lineas[idx] = { ...lineas[idx], cantidad: String((Number(lineas[idx].cantidad) || 0) + 1) };
        return { ...f, lineas };
      }
      return {
        ...f,
        lineas: [
          ...f.lineas,
          {
            productoId: p.id,
            nombre: nombreProducto(p),
            cantidad: "1",
            precioUnitario: String(Number(p.precio)),
            descuentoPorcentaje: "0",
          },
        ],
      };
    });
  }

  function escanear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const codigo = e.currentTarget.value.trim().toLowerCase();
    if (!codigo) return;
    // Coincidencia exacta por código de barras o SKU (antes una coincidencia parcial podía
    // agregar otro producto).
    const p = productos.find((x) => x.codigoBarras?.toLowerCase() === codigo || x.sku?.toLowerCase() === codigo);
    if (p) {
      agregarProducto(p);
      setErrorForm(null);
    } else {
      setErrorForm(`No se encontró un producto con el código "${e.currentTarget.value.trim()}"`);
    }
    e.currentTarget.value = "";
  }

  const productosFiltrados = useMemo(() => {
    const q = normalizar(filtroProducto.trim());
    const lista = q
      ? productos.filter((p) =>
          normalizar(`${p.nombre} ${p.varianteTitulo ?? ""} ${p.sku ?? ""} ${p.codigoBarras ?? ""}`).includes(q)
        )
      : productos;
    return lista.slice(0, 300);
  }, [productos, filtroProducto]);

  function actualizarLinea(idx: number, campo: "cantidad" | "precioUnitario" | "descuentoPorcentaje", valor: string) {
    setForm((f) => {
      const lineas = [...f.lineas];
      lineas[idx] = { ...lineas[idx], [campo]: valor };
      return { ...f, lineas };
    });
  }

  function cargarFirma(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setErrorForm("La firma debe ser una imagen PNG o JPG");
      return;
    }
    if (file.size > 500 * 1024) {
      setErrorForm("La imagen de la firma debe pesar menos de 500 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, firmaBase64: String(ev.target?.result ?? ""), quitarFirma: false }));
    reader.readAsDataURL(file);
  }

  const totales = calcularTotales(form);

  async function guardar() {
    setErrorForm(null);
    if (!form.clienteNombre.trim()) return setErrorForm("El nombre del cliente es obligatorio");
    if (form.lineas.length === 0) return setErrorForm("Agrega al menos un producto");
    const invalida = form.lineas.findIndex((l) => !(Number(l.cantidad) > 0));
    if (invalida >= 0) return setErrorForm(`La cantidad de "${form.lineas[invalida].nombre}" debe ser mayor a 0`);

    const cuerpo = {
      clienteNombre: form.clienteNombre,
      clienteEmail: form.clienteEmail,
      clienteTelefono: form.clienteTelefono,
      clienteEmpresa: form.clienteEmpresa,
      clienteDireccion: form.clienteDireccion,
      clienteTipoDocumento: form.clienteTipoDocumento,
      clienteNumeroDocumento: form.clienteNumeroDocumento,
      fechaVigencia: form.fechaVigencia || null,
      condicionesPago: form.condicionesPago,
      comentarios: form.comentarios,
      descuentoPorcentaje: Number(form.descuentoPorcentaje) || 0,
      impuestoPorcentaje: Number(form.impuestoPorcentaje) || 0,
      firmaBase64: form.firmaBase64 || undefined,
      quitarFirma: form.quitarFirma,
      lineas: form.lineas.map((l) => ({
        productoId: l.productoId,
        cantidad: Number(l.cantidad),
        precioUnitario: Number(l.precioUnitario) || 0,
        descuentoPorcentaje: Number(l.descuentoPorcentaje) || 0,
      })),
    };

    setGuardando(true);
    try {
      const { data } = editandoId
        ? await api.put<Cotizacion>(`/cotizaciones/${editandoId}`, cuerpo)
        : await api.post<Cotizacion>("/cotizaciones", cuerpo);
      setMostrarForm(false);
      await cargar();
      if (!editandoId) await descargar(data, "pdf");
    } catch (err) {
      setErrorForm(mensajeError(err, "No se pudo guardar la cotización"));
    } finally {
      setGuardando(false);
    }
  }

  // ---------- Render ----------
  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Cotizaciones</h2>
          <p>Presupuestos para clientes: créalos, envíalos y haz seguimiento a su estado</p>
        </div>
        {puedeCrear && (
          <button type="button" onClick={abrirNueva}>
            + Nueva cotización
          </button>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Cotizaciones en el listado</div>
          <div className="value">{filtradas.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Valor del listado</div>
          <div className="value">{pesos(valorListado)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Aceptadas</div>
          <div className="value positive">{pesos(valorAceptadas)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <input
            type="search"
            placeholder="Buscar por cliente, empresa o número..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ ...estiloCampo, flex: 1, minWidth: 220 }}
          />
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as Estado | "")} style={{ ...estiloCampo, width: 200 }}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        {cargandoLista ? (
          <p className="empty-state">Cargando...</p>
        ) : filtradas.length === 0 ? (
          <p className="empty-state">
            {cotizaciones.length === 0 ? 'Aún no hay cotizaciones. Crea la primera con "+ Nueva cotización".' : "Ninguna cotización coincide con el filtro"}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Vigencia</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => {
                  const est = infoEstado(c.estado);
                  return (
                    <tr key={c.id}>
                      <td>{c.numero}</td>
                      <td>
                        {c.clienteNombre}
                        {c.clienteEmpresa && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.clienteEmpresa}</div>}
                      </td>
                      <td>{fechaCorta(c.fechaCreacion)}</td>
                      <td>{c.fechaVigencia ? fechaCorta(c.fechaVigencia) : "-"}</td>
                      <td style={{ fontWeight: 600 }}>{pesos(c.total)}</td>
                      <td>
                        {puedeEditar ? (
                          <select
                            value={c.estado}
                            disabled={procesando === c.id}
                            onChange={(e) => void cambiarEstado(c, e.target.value as Estado)}
                            className={`badge ${est.badge}`}
                            style={{ cursor: "pointer" }}
                          >
                            {ESTADOS.map((e) => (
                              <option key={e.valor} value={e.valor}>
                                {e.etiqueta}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`badge ${est.badge}`}>{est.etiqueta}</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {puedeEditar && (
                            <button type="button" className="secondary" disabled={procesando === c.id} onClick={() => void abrirEdicion(c)}>
                              Editar
                            </button>
                          )}
                          <button type="button" className="secondary" onClick={() => void descargar(c, "pdf")}>
                            PDF
                          </button>
                          <button type="button" className="secondary" onClick={() => void descargar(c, "word")}>
                            Word
                          </button>
                          {puedeEliminar && (
                            <button type="button" className="secondary" disabled={procesando === c.id} onClick={() => void eliminar(c)}>
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mostrarForm && (
        <div className="modal-backdrop" onClick={() => !guardando && setMostrarForm(false)}>
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 860, maxWidth: "96vw", maxHeight: "92vh" }}
          >
            <h3 style={{ marginTop: 0 }}>{editandoId ? "Editar cotización" : "Nueva cotización"}</h3>

            <h4 style={{ margin: "8px 0" }}>Cliente</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
              <label>
                Nombre *
                <input value={form.clienteNombre} onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })} style={estiloCampo} />
              </label>
              <label>
                Empresa
                <input value={form.clienteEmpresa} onChange={(e) => setForm({ ...form, clienteEmpresa: e.target.value })} style={estiloCampo} />
              </label>
              <label>
                Tipo de documento
                <select value={form.clienteTipoDocumento} onChange={(e) => setForm({ ...form, clienteTipoDocumento: e.target.value })} style={estiloCampo}>
                  <option value="NIT">NIT</option>
                  <option value="CC">Cédula (CC)</option>
                  <option value="CE">Cédula de extranjería (CE)</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
              </label>
              <label>
                Número de documento
                <input value={form.clienteNumeroDocumento} onChange={(e) => setForm({ ...form, clienteNumeroDocumento: e.target.value })} style={estiloCampo} />
              </label>
              <label>
                Teléfono
                <input value={form.clienteTelefono} onChange={(e) => setForm({ ...form, clienteTelefono: e.target.value })} style={estiloCampo} />
              </label>
              <label>
                Email
                <input type="email" value={form.clienteEmail} onChange={(e) => setForm({ ...form, clienteEmail: e.target.value })} style={estiloCampo} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Dirección
                <input value={form.clienteDireccion} onChange={(e) => setForm({ ...form, clienteDireccion: e.target.value })} style={estiloCampo} />
              </label>
            </div>

            <h4 style={{ margin: "8px 0" }}>Productos</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
              <label>
                Escanear código de barras o SKU
                <input ref={scanRef} placeholder="Escanea y presiona Enter" onKeyDown={escanear} style={{ ...estiloCampo, borderColor: "#22c55e" }} />
              </label>
              <label>
                Buscar producto
                <input
                  placeholder="Nombre, talla, color o SKU"
                  value={filtroProducto}
                  onChange={(e) => setFiltroProducto(e.target.value)}
                  style={estiloCampo}
                />
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <select value={productoSel} onChange={(e) => setProductoSel(e.target.value)} style={{ ...estiloCampo, flex: 1 }}>
                  <option value="">Selecciona ({productosFiltrados.length})</option>
                  {productosFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nombreProducto(p)} — {pesos(p.precio)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!productoSel}
                  onClick={() => {
                    const p = productos.find((x) => x.id === productoSel);
                    if (p) agregarProducto(p);
                    setProductoSel("");
                  }}
                >
                  Agregar
                </button>
              </div>
            </div>

            {form.lineas.length > 0 && (
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Producto</th>
                      <th>Cantidad</th>
                      <th>Precio unitario</th>
                      <th>Desc. %</th>
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineas.map((l, idx) => (
                      <tr key={l.productoId}>
                        <td>{l.nombre}</td>
                        <td>
                          <input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => actualizarLinea(idx, "cantidad", e.target.value)} style={{ ...estiloCampo, width: 80 }} />
                        </td>
                        <td>
                          <input type="number" min="0" step="any" value={l.precioUnitario} onChange={(e) => actualizarLinea(idx, "precioUnitario", e.target.value)} style={{ ...estiloCampo, width: 120 }} />
                        </td>
                        <td>
                          <input type="number" min="0" max="100" step="any" value={l.descuentoPorcentaje} onChange={(e) => actualizarLinea(idx, "descuentoPorcentaje", e.target.value)} style={{ ...estiloCampo, width: 70 }} />
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{pesos(totales.lineas[idx])}</td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setForm((f) => ({ ...f, lineas: f.lineas.filter((_, i) => i !== idx) }))}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 style={{ margin: "8px 0" }}>Condiciones</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
              <label>
                Descuento global (%)
                <input type="number" min="0" max="100" step="any" value={form.descuentoPorcentaje} onChange={(e) => setForm({ ...form, descuentoPorcentaje: e.target.value })} style={estiloCampo} />
              </label>
              <label>
                IVA (%)
                <input type="number" min="0" max="100" step="any" value={form.impuestoPorcentaje} onChange={(e) => setForm({ ...form, impuestoPorcentaje: e.target.value })} style={estiloCampo} />
              </label>
              <label>
                Válida hasta
                <input type="date" value={form.fechaVigencia} onChange={(e) => setForm({ ...form, fechaVigencia: e.target.value })} style={estiloCampo} />
              </label>
              <label>
                Condiciones de pago
                <input placeholder="Ej: 50% anticipo" value={form.condicionesPago} onChange={(e) => setForm({ ...form, condicionesPago: e.target.value })} style={estiloCampo} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Comentarios o notas
                <textarea rows={3} value={form.comentarios} onChange={(e) => setForm({ ...form, comentarios: e.target.value })} style={{ ...estiloCampo, fontFamily: "inherit" }} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Firma (imagen PNG o JPG, opcional)
                <input type="file" accept="image/png,image/jpeg" onChange={(e) => cargarFirma(e.target.files?.[0])} style={estiloCampo} />
              </label>
              {form.firmaBase64 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={form.firmaBase64} alt="Firma" style={{ maxHeight: 60, maxWidth: 160 }} />
                  <button type="button" className="secondary" onClick={() => setForm({ ...form, firmaBase64: "", quitarFirma: true })}>
                    Quitar firma
                  </button>
                </div>
              )}
            </div>

            <div style={{ marginLeft: "auto", maxWidth: 320, display: "grid", gridTemplateColumns: "1fr auto", gap: 6, fontSize: 14 }}>
              <span>Subtotal</span>
              <span style={{ textAlign: "right" }}>{pesos(totales.subtotal)}</span>
              <span>Descuento ({Number(form.descuentoPorcentaje) || 0}%)</span>
              <span style={{ textAlign: "right" }}>-{pesos(totales.descuentoValor)}</span>
              <span>IVA ({Number(form.impuestoPorcentaje) || 0}%)</span>
              <span style={{ textAlign: "right" }}>{pesos(totales.impuestoValor)}</span>
              <strong style={{ borderTop: "2px solid var(--border-light, #e2e8f0)", paddingTop: 6 }}>Total</strong>
              <strong style={{ textAlign: "right", borderTop: "2px solid var(--border-light, #e2e8f0)", paddingTop: 6 }}>{pesos(totales.total)}</strong>
            </div>

            {errorForm && <p className="error-text">{errorForm}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="secondary" disabled={guardando} onClick={() => setMostrarForm(false)}>
                Cancelar
              </button>
              <button type="button" disabled={guardando} onClick={() => void guardar()}>
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Crear y descargar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
