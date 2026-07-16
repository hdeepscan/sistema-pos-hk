import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { leerArchivoComoDataUrl } from "../lib/files";
import { construirReciboHtml } from "../../../shared/recibo-html";
import type { ReciboData } from "../../../shared/api-types";
import { mensajeError } from "../lib/errores";

interface PlantillaForm {
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

const VACIA: PlantillaForm = {
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
  const [form, setForm] = useState<PlantillaForm>(VACIA);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/plantilla-recibo")
      .then(({ data }) => {
        setForm({
          logoUrl: data.logoUrl ?? null,
          nombreNegocio: data.nombreNegocio ?? "",
          direccion: data.direccion ?? "",
          telefono: data.telefono ?? "",
          email: data.email ?? "",
          redesSociales: data.redesSociales ?? "",
          mensajeAgradecimiento: data.mensajeAgradecimiento ?? "",
          politicasCambios: data.politicasCambios ?? "",
          piePagina: data.piePagina ?? "",
          mostrarQr: data.mostrarQr ?? false,
          qrContenido: data.qrContenido ?? "",
          imagenPromocionalUrl: data.imagenPromocionalUrl ?? null,
          cuponDescuento: data.cuponDescuento ?? "",
          promociones: data.promociones ?? "",
        });
      })
      .catch((err) => {
        setErrorCarga(
          err?.response?.status === 404
            ? "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version."
            : "No se pudo cargar la plantilla del recibo"
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

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      await api.put("/plantilla-recibo", form);
      setMensaje("Plantilla guardada");
    } catch (err: any) {
      setMensaje(mensajeError(err, "No se pudo guardar la plantilla"));
    } finally {
      setGuardando(false);
    }
  }

  async function restaurar() {
    if (!confirm("¿Restaurar la plantilla por defecto? Se perderan los cambios personalizados.")) return;
    setGuardando(true);
    try {
      await api.delete("/plantilla-recibo");
      setForm(VACIA);
      setMensaje("Plantilla restaurada por defecto");
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
          <h2>Plantilla del recibo</h2>
          <p>Personaliza lo que se imprime en cada venta. Lo obligatorio (productos, totales, factura) siempre se muestra.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        <div className="card">
          <div className="grid-form">
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
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar plantilla"}
              </button>
              <button type="button" className="secondary" onClick={restaurar} disabled={guardando}>
                Restaurar por defecto
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
