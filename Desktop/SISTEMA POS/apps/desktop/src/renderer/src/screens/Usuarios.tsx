import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
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

interface Empresa {
  id: string;
  nombre: string;
  limiteUsuarios: number;
}

const ROLES_DISPONIBLES: { valor: RolUsuario; etiqueta: string }[] = [
  { valor: "ADMIN", etiqueta: "Administrador" },
  { valor: "SUPERVISOR", etiqueta: "Supervisor" },
  { valor: "CAJERO", etiqueta: "Cajero" },
  { valor: "BODEGA", etiqueta: "Bodega" },
];

export default function Usuarios() {
  const sesion = useSesionStore();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [mostrarPago, setMostrarPago] = useState(false);
  const [editar, setEditar] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data: usuariosData } = await api.get<Usuario[]>("/usuarios");
      setUsuarios(usuariosData);
      // Obtener datos de la empresa (limiteUsuarios) desde sesión
      if (sesion.empresa) {
        setEmpresa({
          id: sesion.empresa.id,
          nombre: sesion.empresa.nombre,
          limiteUsuarios: sesion.empresa.limiteUsuarios || 2,
        });
      }
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    } finally {
      setCargando(false);
    }
  }, [sesion.empresa]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleNuevoUsuario = () => {
    // Verificar si hay slots disponibles
    if (usuarios.length >= (empresa?.limiteUsuarios || 2)) {
      // No hay slots: mostrar modal de pago + formulario
      setMostrarPago(true);
    } else {
      // Hay slots: mostrar formulario normal
      setMostrarNuevo(true);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Usuarios y permisos</h2>
          <p>Cuentas secundarias, roles y control de acceso por permiso</p>
        </div>
        <button onClick={handleNuevoUsuario} type="button">
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

      {mostrarNuevo && <FormularioUsuario onClose={() => setMostrarNuevo(false)} onGuardado={cargar} />}
      {editar && <FormularioUsuario usuario={editar} onClose={() => setEditar(null)} onGuardado={cargar} />}
      {mostrarPago && (
        <FormularioPagoYUsuario
          onClose={() => setMostrarPago(false)}
          onComprado={() => {
            setMostrarPago(false);
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
}: {
  usuario?: Usuario;
  onClose: () => void;
  onGuardado: () => void;
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
      setError(mensajeError(err, "No se pudo guardar el usuario"));
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
 * Formulario para crear nuevo usuario cuando el límite está alcanzado.
 * COMBINA: Datos del usuario + Pago ($10,000 COP) en UN SOLO FLUJO
 */
function FormularioPagoYUsuario({
  onClose,
  onComprado,
}: {
  onClose: () => void;
  onComprado: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<RolUsuario>("CAJERO");
  const [permisos, setPermisos] = useState<Permiso[]>(PERMISOS_POR_ROL["CAJERO"]);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const PRECIO = 10000; // $10,000 COP

  function cambiarRol(nuevoRol: RolUsuario) {
    setRol(nuevoRol);
    setPermisos(PERMISOS_POR_ROL[nuevoRol]);
  }

  function alternarPermiso(p: Permiso) {
    setPermisos((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function pagarYCrear(e: React.FormEvent) {
    e.preventDefault();
    setProcesando(true);
    setError(null);

    try {
      // Validaciones básicas
      if (!nombre || !email || !password) {
        throw new Error("Todos los campos son requeridos");
      }

      if (password.length < 8) {
        throw new Error("La contraseña debe tener al menos 8 caracteres");
      }

      // Guardar datos del usuario en localStorage (serán usados después del pago)
      const datosUsuarioNuevo = {
        nombre,
        email,
        password,
        rol,
        permisos,
      };
      localStorage.setItem("usuarioPreregistrado", JSON.stringify(datosUsuarioNuevo));

      // Crear checkout en Wompi
      const response = await api.post("/checkout/usuarios-adicionales", {
        cantidadUsuarios: 1, // Siempre es 1 usuario al crearlo directamente
        datosUsuario: datosUsuarioNuevo, // Enviar datos del usuario
      });

      // Redirigir a Wompi
      if (response.data?.checkout?.url) {
        window.location.href = response.data.checkout.url;
      } else {
        setError("No se pudo generar el checkout");
      }
    } catch (err: any) {
      setError(mensajeError(err, "Error al procesar el pago"));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 520 }}>
        <h4 style={{ marginBottom: 16 }}>Nuevo Usuario (Pago incluido)</h4>

        {/* Banner de costo */}
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "#0066FF20", borderRadius: "6px", border: "1px solid #0066FF40" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: "500" }}>Slot de usuario adicional</span>
            <span style={{ fontSize: 16, fontWeight: "700", color: "#0066FF" }}>$10,000 COP</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Se procesará el pago en Wompi al completar este formulario
          </div>
        </div>

        <form className="grid-form" onSubmit={pagarYCrear}>
          <label>
            Nombre completo
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>

          <label>
            Correo electrónico
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            Contraseña (mínimo 8 caracteres)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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

          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>
              Permisos (se cargan los del rol por defecto; puedes personalizarlos)
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8, maxHeight: 180, overflowY: "auto" }}>
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
            <button type="submit" disabled={procesando} style={{ flex: 1 }}>
              {procesando ? "Procesando..." : `Pagar $${PRECIO.toLocaleString("es-CO")} y crear usuario`}
            </button>
            <button className="secondary" type="button" onClick={onClose} disabled={procesando}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
