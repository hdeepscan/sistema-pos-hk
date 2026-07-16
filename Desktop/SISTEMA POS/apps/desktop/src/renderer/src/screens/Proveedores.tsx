import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";

interface Proveedor {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}

const COLUMNAS_PROVEEDORES: ColumnaExport<Proveedor>[] = [
  { encabezado: "Nombre", clave: "nombre" },
  { encabezado: "Telefono", clave: "telefono", formato: (v) => v ?? "" },
  { encabezado: "Email", clave: "email", formato: (v) => v ?? "" },
];

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  costo: string | number;
}

interface ItemCompra {
  productoId: string;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
}

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarCompra, setMostrarCompra] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await api.get<Proveedor[]>("/proveedores");
    setProveedores(data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Proveedores</h2>
          <p>Contactos y compras que abastecen tu inventario</p>
        </div>
        <div className="toolbar">
          <BotonesExportar nombreArchivo="proveedores" titulo="Proveedores" columnas={COLUMNAS_PROVEEDORES} filas={proveedores} />
          <button className="secondary" onClick={() => setMostrarForm(true)} type="button">
            Nuevo proveedor
          </button>
          <button onClick={() => setMostrarCompra(true)} type="button" disabled={proveedores.length === 0}>
            Registrar compra
          </button>
        </div>
      </div>

      <div className="card">
        {proveedores.length === 0 ? (
          <p className="empty-state">No hay proveedores registrados</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Telefono</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.telefono ?? "-"}</td>
                  <td>{p.email ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarForm && <NuevoProveedor onClose={() => setMostrarForm(false)} onCreado={cargar} />}
      {mostrarCompra && <RegistrarCompra proveedores={proveedores} onClose={() => setMostrarCompra(false)} />}
    </div>
  );
}

function NuevoProveedor({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.post("/proveedores", { nombre, telefono: telefono || undefined, email: email || undefined });
      onCreado();
      onClose();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo crear el proveedor"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Nuevo proveedor</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label>
            Telefono
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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

function RegistrarCompra({ proveedores, onClose }: { proveedores: Proveedor[]; onClose: () => void }) {
  const { sucursales, sucursalActivaId } = useSesionStore();
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [sucursalId, setSucursalId] = useState(sucursalActivaId ?? sucursales[0]?.id ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [items, setItems] = useState<ItemCompra[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function buscar(valor: string) {
    setBusqueda(valor);
    if (valor.trim().length < 2) return setResultados([]);
    const { data } = await api.get<Producto[]>("/productos", { params: { q: valor } });
    setResultados(data);
  }

  function agregar(p: Producto) {
    setItems((prev) =>
      prev.some((i) => i.productoId === p.id)
        ? prev
        : [...prev, { productoId: p.id, nombre: p.nombre, cantidad: 1, costoUnitario: Number(p.costo) }]
    );
    setBusqueda("");
    setResultados([]);
  }

  function actualizar(productoId: string, campo: "cantidad" | "costoUnitario", valor: number) {
    setItems((prev) => prev.map((i) => (i.productoId === productoId ? { ...i, [campo]: valor } : i)));
  }

  const total = items.reduce((acc, i) => acc + i.cantidad * i.costoUnitario, 0);

  async function guardar() {
    setError(null);
    if (items.length === 0) return setError("Agrega al menos un producto");
    setGuardando(true);
    try {
      await api.post("/compras", {
        proveedorId,
        sucursalId,
        items: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad, costoUnitario: i.costoUnitario })),
      });
      onClose();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo registrar la compra"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 520 }}>
        <h4 style={{ marginBottom: 12 }}>Registrar compra</h4>
        <div className="grid-form">
          <label>
            Proveedor
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sucursal que recibe el inventario
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agregar producto
            <input placeholder="Buscar por nombre o SKU" value={busqueda} onChange={(e) => buscar(e.target.value)} />
          </label>
          {resultados.length > 0 && (
            <div className="card">
              {resultados.map((p) => (
                <div
                  key={p.id}
                  style={{ padding: 6, cursor: "pointer" }}
                  onClick={() => agregar(p)}
                >
                  {p.nombre} ({p.sku})
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Costo unit.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.productoId}>
                    <td>{i.nombre}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={i.cantidad}
                        onChange={(e) => actualizar(i.productoId, "cantidad", Number(e.target.value))}
                        style={{ width: 60 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={i.costoUnitario}
                        onChange={(e) => actualizar(i.productoId, "costoUnitario", Number(e.target.value))}
                        style={{ width: 90 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={{ fontWeight: 700, margin: 0 }}>Total: ${total.toLocaleString("es-CO")}</p>
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={guardar} disabled={guardando} type="button">
              {guardando ? "Guardando..." : "Registrar compra"}
            </button>
            <button className="secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
