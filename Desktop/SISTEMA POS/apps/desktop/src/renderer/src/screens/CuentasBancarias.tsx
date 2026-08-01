import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";

interface Cuenta {
  id: string;
  nombre: string;
  banco: string | null;
  numeroCuenta: string | null;
  tipoCuenta: string | null;
  saldoInicial: string | number;
  activa: boolean;
}

const TIPOS = ["Ahorros", "Corriente", "Billetera (Nequi/Daviplata)", "Caja menor", "Efectivo", "Otra"];

const vacia = () => ({ nombre: "", banco: "", numeroCuenta: "", tipoCuenta: "Ahorros", saldoInicial: "0", activa: true });

export default function CuentasBancarias() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(vacia());
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get<Cuenta[]>("/cuentas-bancarias");
      setCuentas(data);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version."
          : mensajeError(err, "No se pudieron cargar las cuentas")
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function nueva() {
    setEditandoId(null);
    setForm(vacia());
    setMostrarForm(true);
  }

  function editar(c: Cuenta) {
    setEditandoId(c.id);
    setForm({
      nombre: c.nombre,
      banco: c.banco ?? "",
      numeroCuenta: c.numeroCuenta ?? "",
      tipoCuenta: c.tipoCuenta ?? "Ahorros",
      saldoInicial: String(c.saldoInicial),
      activa: c.activa,
    });
    setMostrarForm(true);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return setError("Ponle un nombre a la cuenta");
    setGuardando(true);
    setError(null);
    const cuerpo = {
      nombre: form.nombre.trim(),
      banco: form.banco || undefined,
      numeroCuenta: form.numeroCuenta || undefined,
      tipoCuenta: form.tipoCuenta || undefined,
      saldoInicial: Number(form.saldoInicial || 0),
      activa: form.activa,
    };
    try {
      if (editandoId) await api.put(`/cuentas-bancarias/${editandoId}`, cuerpo);
      else await api.post("/cuentas-bancarias", cuerpo);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar la cuenta"));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(c: Cuenta) {
    if (!confirm(`¿Eliminar la cuenta "${c.nombre}"?`)) return;
    try {
      await api.delete(`/cuentas-bancarias/${c.id}`);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo eliminar"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Cuentas bancarias</h2>
          <p>Administra tus cuentas (Bancolombia, Nequi, Caja menor, Efectivo...) para el control de caja</p>
        </div>
        <button type="button" onClick={nueva}>
          + Nueva cuenta
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        {cargando ? (
          <p className="empty-state">Cargando...</p>
        ) : cuentas.length === 0 ? (
          <p className="empty-state">No hay cuentas todavia. Crea la primera con "+ Nueva cuenta".</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Banco</th>
                <th>Numero</th>
                <th>Tipo</th>
                <th>Saldo inicial</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                  <td>{c.banco ?? "-"}</td>
                  <td>{c.numeroCuenta ?? "-"}</td>
                  <td>{c.tipoCuenta ?? "-"}</td>
                  <td>${Number(c.saldoInicial).toLocaleString("es-CO")}</td>
                  <td>
                    <span className={`badge ${c.activa ? "success" : "neutral"}`}>{c.activa ? "Activa" : "Inactiva"}</span>
                  </td>
                  <td>
                    <div className="toolbar">
                      <button type="button" className="secondary" onClick={() => editar(c)}>
                        Editar
                      </button>
                      <button type="button" className="secondary" onClick={() => eliminar(c)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarForm && (
        <div className="modal-backdrop">
          <div className="card" style={{ width: 460, maxWidth: "94vw" }}>
            <h4 style={{ marginTop: 0 }}>{editandoId ? "Editar cuenta" : "Nueva cuenta"}</h4>
            <form className="grid-form" onSubmit={guardar}>
              <label>
                Nombre
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required placeholder="Ej. Bancolombia principal" />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  Banco
                  <input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} placeholder="Bancolombia, Nequi..." />
                </label>
                <label>
                  Tipo de cuenta
                  <select value={form.tipoCuenta} onChange={(e) => setForm({ ...form, tipoCuenta: e.target.value })}>
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Numero de cuenta
                  <input value={form.numeroCuenta} onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value })} />
                </label>
                <label>
                  Saldo inicial
                  <input type="number" step="0.01" value={form.saldoInicial} onChange={(e) => setForm({ ...form, saldoInicial: e.target.value })} />
                </label>
              </div>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} style={{ width: "auto" }} />
                Cuenta activa
              </label>
              {error && <span className="error-text">{error}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={guardando}>
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" className="secondary" onClick={() => setMostrarForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
