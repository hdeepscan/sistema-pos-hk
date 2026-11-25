import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { mensajeError } from "../../lib/errores";

// Buscar un producto de CENTRALA y mandarlo por el chat con foto, precio y tallas/colores disponibles.

interface ProductoChat {
  id: string;
  nombre: string;
  imagenUrl: string | null;
  precioDesde: number;
  precioHasta: number;
  stock: number;
  variantes: { id: string; titulo: string; precio: number; stock: number }[];
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

export function EnviarProducto({
  conversacionId,
  tipoCanal,
  onCerrar,
  onEnviado,
}: {
  conversacionId: string;
  tipoCanal: string;
  onCerrar: () => void;
  onEnviado: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoChat[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<ProductoChat | null>(null);
  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [conFoto, setConFoto] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBuscando(true);
    const t = setTimeout(() => {
      api
        .get<ProductoChat[]>("/mensajeria/productos", { params: { q } })
        .then(({ data }) => setResultados(data))
        .catch((err) => setError(mensajeError(err)))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function elegir(p: ProductoChat) {
    setError(null);
    setElegido(p);
    setTexto("");
    try {
      const { data } = await api.get<{ texto: string; imagen: string | null }>(`/mensajeria/productos/${p.id}/ficha`);
      setTexto(data.texto);
      setImagen(data.imagen);
      setConFoto(!!data.imagen);
    } catch (err) {
      setError(mensajeError(err, "No se pudo armar la ficha"));
    }
  }

  async function enviar() {
    if (!elegido) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/mensajeria/conversaciones/${conversacionId}/producto`, { productoId: elegido.id, texto, conFoto });
      onEnviado();
      onCerrar();
    } catch (err) {
      setError(mensajeError(err, "No se pudo enviar el producto"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCerrar}>
      <div className="card msj-config" onClick={(e) => e.stopPropagation()}>
        <div className="msj-config-cabecera">
          <h4>{elegido ? "Enviar producto" : "Elegir producto"}</h4>
          <button type="button" className="msj-btn-link" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        {!elegido ? (
          <>
            <input autoFocus placeholder="Buscar por nombre, referencia, código, categoría…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="msj-prod-lista">
              {resultados.length === 0 ? (
                <p className="msj-config-ayuda">{buscando ? "Buscando…" : "No se encontraron productos."}</p>
              ) : (
                resultados.map((p) => (
                  <button key={p.id} type="button" className="msj-prod" onClick={() => void elegir(p)}>
                    <span className="msj-prod-foto">
                      {p.imagenUrl && p.imagenUrl !== "local" ? <img src={p.imagenUrl} alt="" loading="lazy" /> : "📦"}
                    </span>
                    <span className="msj-prod-texto">
                      <strong>{p.nombre}</strong>
                      <span>
                        {p.precioDesde === p.precioHasta ? pesos(p.precioDesde) : `${pesos(p.precioDesde)} – ${pesos(p.precioHasta)}`}
                        {p.variantes.length > 0 && ` · ${p.variantes.map((v) => v.titulo).join(", ")}`}
                      </span>
                    </span>
                    <span className={`badge ${p.stock > 0 ? "success" : "danger"}`}>{p.stock > 0 ? `${p.stock} disp.` : "Agotado"}</span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="msj-config-cuerpo">
            <button type="button" className="msj-btn-link msj-volver-lista" onClick={() => setElegido(null)}>
              ← Elegir otro producto
            </button>
            <div className="msj-prod-previa">
              {imagen && conFoto && <img src={imagen} alt="" />}
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} maxLength={1000} placeholder="Cargando ficha…" />
            </div>
            {imagen ? (
              <label className="msj-interruptor">
                <input type="checkbox" checked={conFoto} onChange={(e) => setConFoto(e.target.checked)} />
                Enviar con la foto
              </label>
            ) : (
              <p className="msj-config-ayuda">Este producto no tiene foto: se envía solo el texto.</p>
            )}
            <p className="msj-config-ayuda">
              Puedes cambiar el texto antes de enviarlo.
              {tipoCanal === "WHATSAPP" ? " En WhatsApp llega como foto con la descripción debajo." : " Llega la foto y luego la descripción."}
            </p>
            {error && <span className="error-text">{error}</span>}
            <button type="button" disabled={enviando || !texto.trim()} onClick={() => void enviar()}>
              {enviando ? "Enviando..." : "Enviar al chat"}
            </button>
          </div>
        )}
        {!elegido && error && <span className="error-text">{error}</span>}
      </div>
    </div>
  );
}
