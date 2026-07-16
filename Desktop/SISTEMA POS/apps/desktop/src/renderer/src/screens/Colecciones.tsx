import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface Coleccion {
  id: string;
  titulo: string;
  descripcion: string | null;
  imagenUrl: string | null;
  shopifyCollectionId: string | null;
  totalProductos: number;
}

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  imagenUrl: string | null;
}

export default function Colecciones() {
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<Coleccion | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await api.get<Coleccion[]>("/colecciones");
    setColecciones(data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function sincronizar() {
    setSincronizando(true);
    setMensaje(null);
    try {
      const { data } = await api.post("/colecciones/sincronizar");
      setMensaje(`Sincronizado: ${data.coleccionesCreadas} nuevas, ${data.coleccionesActualizadas} actualizadas`);
      await cargar();
    } catch (err: any) {
      setMensaje(err?.response?.data?.error ?? "No se pudo sincronizar");
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Colecciones</h2>
          <p>Organiza tus productos en colecciones, igual que en Shopify</p>
        </div>
        <div className="toolbar">
          <button className="secondary" onClick={sincronizar} disabled={sincronizando} type="button">
            {sincronizando ? "Sincronizando..." : "Sincronizar desde Shopify"}
          </button>
          <button onClick={() => setMostrarForm(true)} type="button">
            Nueva coleccion
          </button>
        </div>
      </div>

      {mensaje && <p className="badge success" style={{ marginBottom: 12, width: "fit-content" }}>{mensaje}</p>}

      {colecciones.length === 0 ? (
        <div className="card">
          <p className="empty-state">
            No hay colecciones todavia. Si tienes Shopify conectado, dale "Sincronizar desde Shopify".
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {colecciones.map((c) => (
            <div
              key={c.id}
              className="card"
              style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}
              onClick={() => setSeleccionada(c)}
            >
              {c.imagenUrl ? (
                <img src={c.imagenUrl} alt="" style={{ width: "100%", height: 120, objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: 120, background: "#f3f4f6" }} />
              )}
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{c.titulo}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.totalProductos} productos</div>
                {c.shopifyCollectionId && <span className="badge success" style={{ marginTop: 8 }}>Shopify</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {mostrarForm && <NuevaColeccion onClose={() => setMostrarForm(false)} onCreada={cargar} />}
      {seleccionada && (
        <DetalleColeccion
          coleccionId={seleccionada.id}
          onClose={() => setSeleccionada(null)}
          onCambiado={cargar}
        />
      )}
    </div>
  );
}

function NuevaColeccion({ onClose, onCreada }: { onClose: () => void; onCreada: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.post("/colecciones", { titulo, descripcion: descripcion || undefined });
      onCreada();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo crear la coleccion");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Nueva coleccion</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Titulo
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
          </label>
          <label>
            Descripcion
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </label>
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
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

function DetalleColeccion({
  coleccionId,
  onClose,
  onCambiado,
}: {
  coleccionId: string;
  onClose: () => void;
  onCambiado: () => void;
}) {
  const [detalle, setDetalle] = useState<(Coleccion & { productos: Producto[] }) | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await api.get(`/colecciones/${coleccionId}`);
    setDetalle(data);
  }, [coleccionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function buscar(valor: string) {
    setBusqueda(valor);
    if (valor.trim().length < 2) return setResultados([]);
    const { data } = await api.get<Producto[]>("/productos", { params: { q: valor } });
    setResultados(data);
  }

  async function agregar(productoId: string) {
    setOcupado(true);
    try {
      await api.post(`/colecciones/${coleccionId}/productos`, { productoId });
      setBusqueda("");
      setResultados([]);
      await cargar();
      onCambiado();
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(productoId: string) {
    setOcupado(true);
    try {
      await api.delete(`/colecciones/${coleccionId}/productos/${productoId}`);
      await cargar();
      onCambiado();
    } finally {
      setOcupado(false);
    }
  }

  if (!detalle) return null;

  const idsActuales = new Set(detalle.productos.map((p) => p.id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card" style={{ width: 560, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{detalle.titulo}</h3>
          <button className="secondary" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {detalle.descripcion && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{detalle.descripcion}</p>}

        <label>
          Agregar producto a esta coleccion
          <input
            placeholder="Buscar por nombre o SKU"
            value={busqueda}
            onChange={(e) => buscar(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        {resultados.length > 0 && (
          <div className="card" style={{ marginTop: 8, marginBottom: 8 }}>
            {resultados.map((p) => (
              <div
                key={p.id}
                style={{ display: "flex", justifyContent: "space-between", padding: 6, cursor: idsActuales.has(p.id) ? "default" : "pointer", opacity: idsActuales.has(p.id) ? 0.5 : 1 }}
                onClick={() => !idsActuales.has(p.id) && !ocupado && agregar(p.id)}
              >
                <span>{p.nombre} ({p.sku})</span>
                <span>{idsActuales.has(p.id) ? "Ya esta" : "+ Agregar"}</span>
              </div>
            ))}
          </div>
        )}

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Productos en esta coleccion ({detalle.productos.length})</h4>
        {detalle.productos.length === 0 ? (
          <p className="empty-state">Aun no tiene productos</p>
        ) : (
          <table>
            <tbody>
              {detalle.productos.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td style={{ color: "var(--text-muted)" }}>{p.sku}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="secondary" type="button" disabled={ocupado} onClick={() => quitar(p.id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
