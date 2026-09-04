import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { leerArchivoComoDataUrl } from "../lib/files";
import { construirReciboHtml } from "../../../shared/recibo-html";
import type { ReciboData } from "../../../shared/api-types";
import { mensajeError } from "../lib/errores";

interface PlantillaForm {
  id: string | null;
  nombre: string;
  esPredeterminada: boolean;
  logoUrl: string | null;
  nombreNegocio: string;
  direccion: string;
  telefono: string;
  email: string;
  redesSociales: string;
  mensajeAgradecimiento: string;
  politicasCambios: string;
  piePagina: string;
  mostrarQr: boolean;
  qrContenido: string;
  imagenPromocionalUrl: string | null;
  cuponDescuento: string;
  promociones: string;
}

interface PlantillaApi {
  id: string;
  nombre: string;
  esPredeterminada: boolean;
  logoUrl: string | null;
  nombreNegocio: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  redesSociales: string | null;
  mensajeAgradecimiento: string | null;
  politicasCambios: string | null;
  piePagina: string | null;
  mostrarQr: boolean;
  qrContenido: string | null;
  imagenPromocionalUrl: string | null;
  cuponDescuento: string | null;
  promociones: string | null;
}

function nuevaVacia(nombre: string): PlantillaForm {
  return {
    id: null,
    nombre,
    esPredeterminada: false,
    logoUrl: null,
    nombreNegocio: "",
    direccion: "",
    telefono: "",
    email: "",
    redesSociales: "",
    mensajeAgradecimiento: "",
    politicasCambios: "",
    piePagina: "",
    mostrarQr: false,
    qrContenido: "",
    imagenPromocionalUrl: null,
    cuponDescuento: "",
    promociones: "",
  };
}

function desdeApi(p: PlantillaApi): PlantillaForm {
  return {
    id: p.id,
    nombre: p.nombre,
    esPredeterminada: p.esPredeterminada,
    logoUrl: p.logoUrl ?? null,
    nombreNegocio: p.nombreNegocio ?? "",
    direccion: p.direccion ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    redesSociales: p.redesSociales ?? "",
    mensajeAgradecimiento: p.mensajeAgradecimiento ?? "",
    politicasCambios: p.politicasCambios ?? "",
    piePagina: p.piePagina ?? "",
    mostrarQr: p.mostrarQr ?? false,
    qrContenido: p.qrContenido ?? "",
    imagenPromocionalUrl: p.imagenPromocionalUrl ?? null,
    cuponDescuento: p.cuponDescuento ?? "",
    promociones: p.promociones ?? "",
  };
}

const DATOS_EJEMPLO: Omit<ReciboData, "plantilla"> = {
  empresaNombre: "Mi Negocio",
  sucursalNombre: "Sucursal Principal",
  consecutivo: 1042,
  fecha: new Date().toLocaleString("es-CO"),
  cajero: "Ana Cajera",
  items: [
    { nombre: "Camiseta Basica", cantidad: 2, precioUnitario: 35000 },
    { nombre: "Pantalon Slim", cantidad: 1, precioUnitario: 89000 },
  ],
  total: 159000,
  metodoPago: "EFECTIVO",
  dineroRecibido: 200000,
  cambio: 41000,
};

export default function PlantillaRecibo() {
  const { empresa } = useSesionStore();
  const [lista, setLista] = useState<PlantillaApi[]>([]);
  const [form, setForm] = useState<PlantillaForm>(nuevaVacia("Recibo estandar"));
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  async function cargarLista(seleccionarId?: string) {
    const { data } = await api.get<PlantillaApi[]>("/plantillas-recibo");
    setLista(data);
    if (data.length > 0) {
      const elegir = seleccionarId
        ? data.find((p) => p.id === seleccionarId)
        : data.find((p) => p.esPredeterminada) ?? data[0];
      if (elegir) setForm(desdeApi(elegir));
    } else {
      setForm(nuevaVacia("Recibo estandar"));
    }
  }

  useEffect(() => {
    cargarLista()
      .catch((err: any) => {
        setErrorCarga(
          err?.response?.status === 404
            ? "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version."
            : "No se pudieron cargar las plantillas del recibo"
        );
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!form.mostrarQr || !form.qrContenido.trim()) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(form.qrContenido, { width: 180, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [form.mostrarQr, form.qrContenido]);

  function actualizar<K extends keyof PlantillaForm>(campo: K, valor: PlantillaForm[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function elegirImagen(campo: "logoUrl" | "imagenPromocionalUrl", file: File | undefined) {
    if (!file) return;
    const dataUrl = await leerArchivoComoDataUrl(file);
    actualizar(campo, dataUrl);
  }

  function seleccionar(p: PlantillaApi) {
    setMensaje(null);
    setForm(desdeApi(p));
  }

  function nuevaPlantilla() {
    setMensaje(null);
    setForm(nuevaVacia(`Recibo ${lista.length + 1}`));
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      setMensaje("Ponle un nombre a la plantilla");
      return;
    }
    setGuardando(true);
    setMensaje(null);
    const cuerpo = {
      nombre: form.nombre.trim(),
      logoUrl: form.logoUrl,
      nombreNegocio: form.nombreNegocio,
      direccion: form.direccion,
      telefono: form.telefono,
      email: form.email,
      redesSociales: form.redesSociales,
      mensajeAgradecimiento: form.mensajeAgradecimiento,
      politicasCambios: form.politicasCambios,
      piePagina: form.piePagina,
      mostrarQr: form.mostrarQr,
      qrContenido: form.qrContenido,
      imagenPromocionalUrl: form.imagenPromocionalUrl,
      cuponDescuento: form.cuponDescuento,
      promociones: form.promociones,
    };
    try {
      if (form.id) {
        await api.put(`/plantillas-recibo/${form.id}`, cuerpo);
        await cargarLista(form.id);
        setMensaje("Plantilla guardada");
      } else {
        const { data } = await api.post<PlantillaApi>("/plantillas-recibo", cuerpo);
        await cargarLista(data.id);
        setMensaje("Plantilla creada");
      }
    } catch (err: any) {
      setMensaje(mensajeError(err, "No se pudo guardar la plantilla"));
    } finally {
      setGuardando(false);
    }
  }

  async function hacerPredeterminada() {
    if (!form.id) {
      setMensaje("Guarda la plantilla antes de marcarla como predeterminada");
      return;
    }
    setGuardando(true);
    try {
      await api.patch(`/plantillas-recibo/${form.id}/predeterminada`);
      await cargarLista(form.id);
      setMensaje("Ahora es la plantilla predeterminada del punto de venta");
    } catch (err: any) {
      setMensaje(mensajeError(err, "No se pudo cambiar la predeterminada"));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!form.id) {
      setForm(lista.length > 0 ? desdeApi(lista.find((p) => p.esPredeterminada) ?? lista[0]) : nuevaVacia("Recibo estandar"));
      return;
    }
    if (!confirm(`¿Eliminar la plantilla "${form.nombre}"?`)) return;
    setGuardando(true);
    try {
      await api.delete(`/plantillas-recibo/${form.id}`);
      await cargarLista();
      setMensaje("Plantilla eliminada");
    } catch (err: any) {
      setMensaje(mensajeError(err, "No se pudo eliminar la plantilla"));
    } finally {
      setGuardando(false);
    }
  }

  const previewHtml = construirReciboHtml({
    ...DATOS_EJEMPLO,
    empresaNombre: form.nombreNegocio || empresa?.nombre || DATOS_EJEMPLO.empresaNombre,
    plantilla: {
      logoUrl: form.logoUrl,
      direccion: form.direccion || null,
      telefono: form.telefono || null,
      email: form.email || null,
      redesSociales: form.redesSociales || null,
      mensajeAgradecimiento: form.mensajeAgradecimiento || null,
      politicasCambios: form.politicasCambios || null,
      piePagina: form.piePagina || null,
      qrDataUrl: form.mostrarQr ? qrDataUrl : null,
      imagenPromocionalUrl: form.imagenPromocionalUrl,
      cuponDescuento: form.cuponDescuento || null,
      promociones: form.promociones || null,
    },
  });

  if (cargando) return <p className="empty-state">Cargando...</p>;
  if (errorCarga) return <p className="error-text">{errorCarga}</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Plantillas del recibo</h2>
          <p>
            Crea varias plantillas y elige cual usa el punto de venta. Lo obligatorio (productos, cantidades, impuestos,
            total, fecha y numero de factura) siempre se imprime.
          </p>
        </div>
        <button type="button" onClick={nuevaPlantilla}>
          + Nueva plantilla
        </button>
      </div>

      {/* Selector de plantillas */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {lista.length === 0 && <span className="empty-state" style={{ margin: 0 }}>Aun no tienes plantillas guardadas.</span>}
          {lista.map((p) => {
            const activa = form.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={activa ? "" : "secondary"}
                onClick={() => seleccionar(p)}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {p.nombre}
                {p.esPredeterminada && (
                  <span className="badge success" style={{ marginLeft: 2 }}>
                    Predeterminada
                  </span>
                )}
              </button>
            );
          })}
          {!form.id && (
            <button type="button" style={{ pointerEvents: "none" }}>
              {form.nombre || "Nueva plantilla"} <span className="badge warning">Sin guardar</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        <div className="card">
          <div className="grid-form">
            <label>
              Nombre de la plantilla
              <input
                placeholder="Ej. Recibo estandar, Promocional, Minimalista"
                value={form.nombre}
                onChange={(e) => actualizar("nombre", e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ flex: 1 }}>
                Logo
                <input type="file" accept="image/*" onChange={(e) => elegirImagen("logoUrl", e.target.files?.[0])} />
              </label>
              {form.logoUrl && (
                <img src={form.logoUrl} alt="" style={{ width: 60, height: 60, objectFit: "contain", border: "1px solid var(--border)", borderRadius: 8 }} />
              )}
            </div>
            <label>
              Nombre del negocio (si lo dejas vacio se usa el de la empresa)
              <input value={form.nombreNegocio} onChange={(e) => actualizar("nombreNegocio", e.target.value)} />
            </label>
            <label>
              Direccion
              <input value={form.direccion} onChange={(e) => actualizar("direccion", e.target.value)} />
            </label>
            <label>
              Telefono
              <input value={form.telefono} onChange={(e) => actualizar("telefono", e.target.value)} />
            </label>
            <label>
              Correo electronico
              <input value={form.email} onChange={(e) => actualizar("email", e.target.value)} />
            </label>
            <label>
              Redes sociales
              <input
                placeholder="@minegocio · facebook.com/minegocio"
                value={form.redesSociales}
                onChange={(e) => actualizar("redesSociales", e.target.value)}
              />
            </label>
            <label>
              Mensaje de agradecimiento
              <input
                placeholder="¡Gracias por su compra!"
                value={form.mensajeAgradecimiento}
                onChange={(e) => actualizar("mensajeAgradecimiento", e.target.value)}
              />
            </label>
            <label>
              Politicas de cambios
              <textarea
                rows={2}
                value={form.politicasCambios}
                onChange={(e) => actualizar("politicasCambios", e.target.value)}
              />
            </label>
            <label>
              Cupon de descuento para la proxima compra
              <input value={form.cuponDescuento} onChange={(e) => actualizar("cuponDescuento", e.target.value)} />
            </label>
            <label>
              Promociones especiales
              <textarea rows={2} value={form.promociones} onChange={(e) => actualizar("promociones", e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ flex: 1 }}>
                Imagen promocional
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => elegirImagen("imagenPromocionalUrl", e.target.files?.[0])}
                />
              </label>
              {form.imagenPromocionalUrl && (
                <img
                  src={form.imagenPromocionalUrl}
                  alt=""
                  style={{ width: 60, height: 60, objectFit: "cover", border: "1px solid var(--border)", borderRadius: 8 }}
                />
              )}
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.mostrarQr}
                onChange={(e) => actualizar("mostrarQr", e.target.checked)}
                style={{ width: "auto" }}
              />
              Incluir codigo QR
            </label>
            {form.mostrarQr && (
              <label>
                Contenido del QR (link a tu web, WhatsApp, redes, etc.)
                <input
                  placeholder="https://..."
                  value={form.qrContenido}
                  onChange={(e) => actualizar("qrContenido", e.target.value)}
                />
              </label>
            )}
            <label>
              Texto del pie del recibo
              <input value={form.piePagina} onChange={(e) => actualizar("piePagina", e.target.value)} />
            </label>

            {mensaje && <p className="badge success" style={{ width: "fit-content" }}>{mensaje}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando..." : form.id ? "Guardar cambios" : "Crear plantilla"}
              </button>
              {form.id && !form.esPredeterminada && (
                <button type="button" className="secondary" onClick={hacerPredeterminada} disabled={guardando}>
                  Usar como predeterminada
                </button>
              )}
              <button type="button" className="secondary" onClick={eliminar} disabled={guardando}>
                {form.id ? "Eliminar" : "Descartar"}
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ position: "sticky", top: 16 }}>
          <h4 style={{ marginTop: 0, marginBottom: 10 }}>Vista previa</h4>
          <div style={{ background: "#e5e7eb", borderRadius: 8, padding: 12, display: "flex", justifyContent: "center" }}>
            <iframe
              title="Vista previa del recibo"
              srcDoc={previewHtml}
              style={{ width: 300, height: 520, border: "none", background: "#fff", borderRadius: 4 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
