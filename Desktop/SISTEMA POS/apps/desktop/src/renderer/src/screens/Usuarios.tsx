import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { PERMISOS, ETIQUETAS_PERMISOS, PERMISOS_POR_ROL } from "@sistema-pos/shared";
import type { Permiso, RolUsuario } from "@sistema-pos/shared";
import { mensajeError } from "../lib/errores";

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  permisos: Permiso[];
  permisosEfectivos: Permiso[];
  activo: boolean;
}

const ROLES_DISPONIBLES: { valor: RolUsuario; etiqueta: string }[] = [
  { valor: "ADMIN", etiqueta: "Administrador" },
  { valor: "SUPERVISOR", etiqueta: "Supervisor" },
  { valor: "CAJERO", etiqueta: "Cajero" },
  { valor: "BODEGA", etiqueta: "Bodega" },
];

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [editar, setEditar] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [limitePendiente, setLimitePendiente] = useState<{
    usuariosActuales: number;
    limiteUsuarios: number;
  } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await api.get<Usuario[]>("/usuarios");
    setUsuarios(data);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Usuarios y permisos</h2>
          <p>Cuentas secundarias, roles y control de acceso por permiso</p>
        </div>
        <button onClick={() => setMostrarNuevo(true)} type="button">
          Nuevo usuario
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        {cargando ? (
          <p className="empty-state">Cargando...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>{ROLES_DISPONIBLES.find((r) => r.valor === u.rol)?.etiqueta ?? u.rol}</td>
                  <td>
                    <span className={`badge ${u.activo ? "success" : "neutral"}`}>{u.activo ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td>
                    <button className="secondary" type="button" onClick={() => setEditar(u)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        El historial de acciones de los usuarios ahora esta en la seccion "Auditoria".
      </p>

      {mostrarNuevo && (
        <FormularioUsuario
          onClose={() => setMostrarNuevo(false)}
          onGuardado={cargar}
          onLimitePendiente={(data) => {
            setMostrarNuevo(false);
            setLimitePendiente(data);
          }}
        />
      )}
      {editar && (
        <FormularioUsuario
          usuario={editar}
          onClose={() => setEditar(null)}
          onGuardado={cargar}
          onLimitePendiente={(data) => {
            setEditar(null);
            setLimitePendiente(data);
          }}
        />
      )}
      {limitePendiente && (
        <ModalComprarUsuarios
          usuariosActuales={limitePendiente.usuariosActuales}
          limiteUsuarios={limitePendiente.limiteUsuarios}
          onClose={() => setLimitePendiente(null)}
          onComprado={() => {
            setLimitePendiente(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function FormularioUsuario({
  usuario,
  onClose,
  onGuardado,
  onLimitePendiente,
}: {
  usuario?: Usuario;
  onClose: () => void;
  onGuardado: () => void;
  onLimitePendiente?: (data: { usuariosActuales: number; limiteUsuarios: number }) => void;
}) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<RolUsuario>(usuario?.rol ?? "CAJERO");
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [permisos, setPermisos] = useState<Permiso[]>(usuario?.permisosEfectivos ?? PERMISOS_POR_ROL["CAJERO"]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cambiarRol(nuevoRol: RolUsuario) {
    setRol(nuevoRol);
    setPermisos(PERMISOS_POR_ROL[nuevoRol]);
  }

  function alternarPermiso(p: Permiso) {
    setPermisos((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      if (usuario) {
        await api.patch(`/usuarios/${usuario.id}`, {
          nombre,
          rol,
          activo,
          permisos,
          password: password || undefined,
        });
      } else {
        await api.post("/usuarios", { nombre, email, password, rol, permisos });
      }
      onGuardado();
      onClose();
    } catch (err: any) {
      // Capturar error de límite de usuarios
      if (err?.response?.data?.codigo === "LIMITE_USUARIOS_ALCANZADO") {
        const { usuariosActuales, limiteUsuarios } = err.response.data;
        if (onLimitePendiente) {
          onLimitePendiente({ usuariosActuales, limiteUsuarios });
        }
      } else {
        setError(mensajeError(err, "No se pudo guardar el usuario"));
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 480 }}>
        <h4 style={{ marginBottom: 12 }}>{usuario ? "Editar usuario" : "Nuevo usuario"}</h4>
        <form className="grid-form" onSubmit={guardar}>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label>
            Correo electronico
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!usuario} required />
          </label>
          <label>
            {usuario ? "Nueva contraseña (dejar vacio para no cambiarla)" : "Contraseña"}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!usuario}
              minLength={8}
            />
          </label>
          <label>
            Rol
            <select value={rol} onChange={(e) => cambiarRol(e.target.value as RolUsuario)}>
              {ROLES_DISPONIBLES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </label>
          {usuario && (
            <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ width: "auto" }} />
              Usuario activo
            </label>
          )}

          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>
              Permisos (se cargan los del rol por defecto; puedes personalizarlos)
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
              {PERMISOS.map((p) => (
                <label key={p} style={{ flexDirection: "row", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={permisos.includes(p)}
                    onChange={() => alternarPermiso(p)}
                    style={{ width: "auto" }}
                  />
                  {ETIQUETAS_PERMISOS[p]}
                </label>
              ))}
            </div>
          </div>

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

/**
 * Modal para comprar usuarios adicionales ($10,000 COP c/u)
 */
function ModalComprarUsuarios({
  usuariosActuales,
  limiteUsuarios,
  onClose,
  onComprado,
}: {
  usuariosActuales: number;
  limiteUsuarios: number;
  onClose: () => void;
  onComprado: () => void;
}) {
  const [cantidadUsuarios, setCantidadUsuarios] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const precioUnitario = 10000; // $10,000 COP
  const precioTotal = cantidadUsuarios * precioUnitario;

  async function comprar() {
    setCargando(true);
    setError(null);
    try {
      const response = await api.post("/checkout/usuarios-adicionales", {
        cantidadUsuarios,
      });

      // Redirigir a Wompi
      if (response.data?.checkout?.url) {
        window.location.href = response.data.checkout.url;
      } else {
        setError("No se pudo generar el checkout");
      }
    } catch (err: any) {
      setError(mensajeError(err, "Error al crear el checkout"));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 480 }}>
        <h4 style={{ marginBottom: 16 }}>Comprar usuarios adicionales</h4>

        <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--bg-tertiary)", borderRadius: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.8 }}>Usuarios actuales</span>
            <span style={{ fontWeight: "600" }}>{usuariosActuales} / {limiteUsuarios}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Necesitas comprar más slots para crear nuevos usuarios
          </div>
        </div>

        <div className="grid-form" style={{ marginBottom: 20 }}>
          <label>
            Cantidad de usuarios a comprar
            <input
              type="number"
              min="1"
              max="100"
              value={cantidadUsuarios}
              onChange={(e) => setCantidadUsuarios(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </label>
        </div>

        <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>Precio unitario</span>
            <span style={{ fontSize: 13 }}>$10,000 COP</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <span style={{ fontWeight: "600", fontSize: 14 }}>Total</span>
            <span style={{ fontWeight: "700", fontSize: 16, color: "#0066FF" }}>
              ${precioTotal.toLocaleString("es-CO")} COP
            </span>
          </div>
        </div>

        {error && <span className="error-text" style={{ display: "block", marginBottom: 16 }}>{error}</span>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={comprar} disabled={cargando} style={{ flex: 1 }}>
            {cargando ? "Procesando..." : "Proceder al pago"}
          </button>
          <button className="secondary" type="button" onClick={onClose} disabled={cargando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
