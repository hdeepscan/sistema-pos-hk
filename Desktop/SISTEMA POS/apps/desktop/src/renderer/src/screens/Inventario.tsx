import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { useInventarioActualizado } from "../lib/socket";
import type { TipoMovimiento } from "@sistema-pos/shared";

interface ProductoConsolidado {
  productoId: string;
  sku: string;
  nombre: string;
  totalGeneral: number;
  porSucursal: { sucursalId: string; sucursalNombre: string; cantidad: number }[];
}

export default function Inventario() {
  const { sucursales } = useSesionStore();
  const [productos, setProductos] = useState<ProductoConsolidado[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarMovimiento, setMostrarMovimiento] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await api.get<ProductoConsolidado[]>("/inventario/consolidado");
    setProductos(data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useInventarioActualizado(useCallback(() => cargar(), [cargar]));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h3>Inventario consolidado</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMostrarMovimiento(true)} type="button">
            Registrar movimiento
          </button>
          <button onClick={() => setMostrarForm(true)} type="button">
            Nuevo producto
          </button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              {sucursales.map((s) => (
                <th key={s.id}>{s.nombre}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.productoId}>
                <td>{p.sku}</td>
                <td>{p.nombre}</td>
                {sucursales.map((s) => (
                  <td key={s.id}>{p.porSucursal.find((i) => i.sucursalId === s.id)?.cantidad ?? 0}</td>
                ))}
                <td>{p.totalGeneral}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrarForm && <NuevoProducto onClose={() => setMostrarForm(false)} onCreado={cargar} />}
      {mostrarMovimiento && (
        <RegistrarMovimiento
          productos={productos}
          onClose={() => setMostrarMovimiento(false)}
          onRegistrado={cargar}
        />
      )}
    </div>
  );
}

function NuevoProducto({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("0");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.post("/productos", {
        sku,
        nombre,
        categoria: categoria || undefined,
        precio: Number(precio),
        costo: Number(costo || 0),
        codigoBarras: codigoBarras || undefined,
      });
      onCreado();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo crear el producto");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16, maxWidth: 420 }}>
      <h4>Nuevo producto</h4>
      <form className="grid-form" onSubmit={guardar}>
        <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required />
        <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <input placeholder="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        <input
          placeholder="Precio de venta"
          type="number"
          step="0.01"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          required
        />
        <input placeholder="Costo" type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
        <input
          placeholder="Codigo de barras (opcional)"
          value={codigoBarras}
          onChange={(e) => setCodigoBarras(e.target.value)}
        />
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
  );
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
  const [productoId, setProductoId] = useState(productos[0]?.productoId ?? "");
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [sucursalDestinoId, setSucursalDestinoId] = useState(sucursales[1]?.id ?? "");
  const [tipo, setTipo] = useState<TipoMovimiento>("ENTRADA");
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.post("/inventario/movimientos", {
        productoId,
        sucursalId,
        tipo,
        cantidad: Number(cantidad),
        motivo: motivo || undefined,
        sucursalDestinoId: tipo === "TRASLADO" ? sucursalDestinoId : undefined,
      });
      onRegistrado();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "No se pudo registrar el movimiento");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16, maxWidth: 420 }}>
      <h4>Registrar movimiento</h4>
      <form className="grid-form" onSubmit={guardar}>
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
          {productos.map((p) => (
            <option key={p.productoId} value={p.productoId}>
              {p.nombre}
            </option>
          ))}
        </select>
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
        <input
          placeholder="Cantidad"
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          required
        />
        <input placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        {error && <span className="error-text">{error}</span>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Registrar"}
          </button>
          <button className="secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
