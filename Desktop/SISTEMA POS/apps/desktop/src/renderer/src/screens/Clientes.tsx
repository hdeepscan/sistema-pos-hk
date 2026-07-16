import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { reproducir } from "../lib/sonidos";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";

interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  cedula: string | null;
  ciudad: string | null;
  saldoPendiente: number;
}

const COLUMNAS_CLIENTES: ColumnaExport<Cliente>[] = [
  { encabezado: "Nombre", clave: "nombre" },
  { encabezado: "Telefono", clave: "telefono", formato: (v) => v ?? "" },
  { encabezado: "Email", clave: "email", formato: (v) => v ?? "" },
  { encabezado: "Cedula", clave: "cedula", formato: (v) => v ?? "" },
  { encabezado: "Ciudad", clave: "ciudad", formato: (v) => v ?? "" },
  { encabezado: "Saldo pendiente", clave: "saldoPendiente", formato: (v) => String(v) },
];

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [clienteAbono, setClienteAbono] = useState<Cliente | null>(null);
  const [clienteEditar, setClienteEditar] = useState<Cliente | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await api.get<Cliente[]>("/clientes", { params: busqueda ? { q: busqueda } : undefined });
    setClientes(data);
  }, [busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalCartera = clientes.reduce((acc, c) => acc + c.saldoPendiente, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Clientes</h2>
          <p>Contactos, segmentacion y cobranza de cartera</p>
        </div>
        <div className="toolbar">
          <BotonesExportar nombreArchivo="clientes" titulo="Clientes" columnas={COLUMNAS_CLIENTES} filas={clientes} />
          <button onClick={() => setMostrarForm(true)} type="button">
            Nuevo cliente
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Clientes</div>
          <div className="value">{clientes.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Cartera pendiente</div>
          <div className={`value ${totalCartera > 0 ? "negative" : ""}`}>
            ${totalCartera.toLocaleString("es-CO")}
          </div>
        </div>
      </div>

      <div className="card">
        <input
          placeholder="Buscar por nombre, telefono, cedula o ciudad"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: "100%", marginBottom: 12 }}
        />
        {clientes.length === 0 ? (
          <p className="empty-state">No hay clientes registrados</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Telefono</th>
                <th>Ciudad</th>
                <th>Cedula</th>
                <th>Saldo pendiente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.telefono ?? "-"}</td>
                  <td>{c.ciudad ?? "-"}</td>
                  <td>{c.cedula ?? "-"}</td>
                  <td>
                    {c.saldoPendiente > 0 ? (
                      <span className="badge danger">${c.saldoPendiente.toLocaleString("es-CO")}</span>
                    ) : (
                      <span className="badge success">Al dia</span>
                    )}
                  </td>
                  <td>
                    <div className="toolbar">
                      <button className="secondary" onClick={() => setClienteEditar(c)} type="button">
                        Editar
                      </button>
                      {c.saldoPendiente > 0 && (
                        <button className="secondary" onClick={() => setClienteAbono(c)} type="button">
                          Registrar abono
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarForm && <FormularioCliente onClose={() => setMostrarForm(false)} onGuardado={cargar} />}
      {clienteEditar && (
        <FormularioCliente cliente={clienteEditar} onClose={() => setClienteEditar(null)} onGuardado={cargar} />
      )}
      {clienteAbono && (
        <RegistrarAbono cliente={clienteAbono} onClose={() => setClienteAbono(null)} onRegistrado={cargar} />
      )}
    </div>
  );
}

function FormularioCliente({
  cliente,
  onClose,
  onGuardado,
}: {
  cliente?: Cliente;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [telefono, setTelefono] = useState(cliente?.telefono ?? "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [direccion, setDireccion] = useState(cliente?.direccion ?? "");
  const [cedula, setCedula] = useState(cliente?.cedula ?? "");
  const [ciudad, setCiudad] = useState(cliente?.ciudad ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const datos = {
      nombre,
      telefono: telefono || undefined,
      email: email || undefined,
      direccion: direccion || undefined,
      cedula: cedula || undefined,
      ciudad: ciudad || undefined,
    };
    try {
      if (cliente) await api.patch(`/clientes/${cliente.id}`, datos);
      else {
        await api.post("/clientes", datos);
        void reproducir("cliente_registrado");
      }
      onGuardado();
      onClose();
    } catch (err: any) {
      void reproducir("error");
      setError(mensajeError(err, "No se pudo guardar el cliente"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>{cliente ? "Editar cliente" : "Nuevo cliente"}</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label>
            Telefono / celular
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <label>
            Correo electronico
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Cedula
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} />
          </label>
          <label>
            Ciudad
            <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
          </label>
          <label>
            Direccion
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </label>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Todos estos campos son opcionales excepto el nombre — te sirven para segmentar tu base de clientes
            (ej. por ciudad) si mas adelante quieres conectarla a un CRM.
          </p>
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

function RegistrarAbono({
  cliente,
  onClose,
  onRegistrado,
}: {
  cliente: Cliente;
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.post(`/clientes/${cliente.id}/abonos`, { monto: Number(monto), metodoPago: "EFECTIVO" });
      onRegistrado();
      onClose();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo registrar el abono"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card">
        <h4 style={{ marginBottom: 4 }}>Abono de {cliente.nombre}</h4>
        <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 12 }}>
          Saldo pendiente actual: ${cliente.saldoPendiente.toLocaleString("es-CO")}
        </p>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Monto a abonar
            <input
              type="number"
              min={1}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
          </label>
          {error && <span className="error-text">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Registrar abono"}
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
