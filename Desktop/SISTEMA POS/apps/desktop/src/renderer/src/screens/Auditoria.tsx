import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";
import { mensajeError } from "../lib/errores";

interface EntradaAuditoria {
  id: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: string | null;
  fecha: string;
  usuarioId: string | null;
  usuario: { nombre: string } | null;
}

interface Usuario {
  id: string;
  nombre: string;
}

const ETIQUETAS_ACCION: Record<string, string> = {
  INICIAR_SESION: "Inicio de sesion",
  CERRAR_SESION: "Cierre de sesion",
  CREAR_VENTA: "Venta realizada",
  ELIMINAR_VENTA: "Venta eliminada",
  DEVOLUCION_PARCIAL: "Devolucion parcial",
  CREAR_PRODUCTO: "Producto creado",
  ACTUALIZAR_DISPONIBILIDAD_PRODUCTO: "Disponibilidad de producto",
  EDICION_MASIVA_PRODUCTOS: "Edicion masiva de productos",
  AJUSTE_DIRECTO_STOCK: "Ajuste de inventario",
  ABRIR_CAJA: "Apertura de caja",
  CERRAR_CAJA: "Cierre de caja",
  CREAR_USUARIO: "Usuario creado",
  ACTUALIZAR_USUARIO: "Usuario actualizado",
  GENERAR_BACKUP: "Copia de seguridad",
  RESTAURAR_BACKUP: "Restauracion de copia",
  ACTUALIZAR_PLANTILLA_RECIBO: "Plantilla de recibo",
  RESTAURAR_PLANTILLA_RECIBO: "Plantilla restaurada",
  ACTUALIZAR_CONFIG_CREDITO: "Config. de creditos",
  ACTUALIZAR_CONFIG_FIDELIZACION: "Config. de puntos",
};

function etiqueta(accion: string) {
  return ETIQUETAS_ACCION[accion] ?? accion;
}

export default function Auditoria() {
  const [entradas, setEntradas] = useState<EntradaAuditoria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get<EntradaAuditoria[]>("/auditoria", {
        params: {
          limit: 500,
          usuarioId: filtroUsuario || undefined,
          accion: filtroAccion || undefined,
          desde: desde || undefined,
          hasta: hasta || undefined,
        },
      });
      setEntradas(data);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version."
          : mensajeError(err, "No se pudo cargar la auditoria")
      );
    } finally {
      setCargando(false);
    }
  }, [filtroUsuario, filtroAccion, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api
      .get<Usuario[]>("/usuarios")
      .then(({ data }) => setUsuarios(data))
      .catch(() => setUsuarios([]));
  }, []);

  const accionesDisponibles = useMemo(() => Object.keys(ETIQUETAS_ACCION), []);

  function limpiar() {
    setFiltroUsuario("");
    setFiltroAccion("");
    setDesde("");
    setHasta("");
  }

  const columnas: ColumnaExport<EntradaAuditoria>[] = [
    { encabezado: "Fecha", clave: "fecha", formato: (v) => new Date(v).toLocaleString("es-CO") },
    { encabezado: "Usuario", clave: "usuario", formato: (v) => v?.nombre ?? "" },
    { encabezado: "Accion", clave: "accion", formato: (v) => etiqueta(v) },
    { encabezado: "Entidad", clave: "entidad" },
    { encabezado: "Detalle", clave: "detalle", formato: (v) => v ?? "" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Auditoria</h2>
          <p>Historial completo de acciones realizadas en el sistema</p>
        </div>
        <BotonesExportar nombreArchivo="auditoria" titulo="Auditoria del sistema" columnas={columnas} filas={entradas} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label>
            Usuario
            <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de accion
            <select value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)}>
              <option value="">Todas</option>
              {accionesDisponibles.map((a) => (
                <option key={a} value={a}>
                  {etiqueta(a)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <button className="secondary" type="button" onClick={limpiar}>
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p className="empty-state">Cargando...</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : entradas.length === 0 ? (
          <p className="empty-state">No hay actividad que coincida con estos filtros</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Accion</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(e.fecha).toLocaleString("es-CO")}</td>
                  <td>{e.usuario?.nombre ?? "-"}</td>
                  <td>
                    <span className="badge neutral">{etiqueta(e.accion)}</span>
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{e.detalle ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
