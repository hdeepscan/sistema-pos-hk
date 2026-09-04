import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";
import {
  IconoMas,
  IconoChevronIzq,
  IconoChevronDer,
  IconoCheck,
  IconoReloj,
  IconoCalendario,
  IconoAlerta,
  IconoDinero,
  IconoInventario,
  IconoBasura,
} from "../lib/iconos";

interface Evento {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora: string | null;
  prioridad: "BAJA" | "MEDIA" | "ALTA";
  estado: "PENDIENTE" | "EN_PROCESO" | "COMPLETADO";
  tipo: string;
  responsableId: string | null;
  responsableNombre: string | null;
  origen: "manual" | "credito" | "inventario";
  editable: boolean;
}

interface Usuario {
  id: string;
  nombre: string;
}

const TIPOS = ["TAREA", "RECORDATORIO", "EVENTO", "REUNION", "SEGUIMIENTO"];
const PRIORIDADES = ["BAJA", "MEDIA", "ALTA"] as const;
const ESTADOS = ["PENDIENTE", "EN_PROCESO", "COMPLETADO"] as const;
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const colorPrioridad: Record<Evento["prioridad"], string> = { BAJA: "#9ca3af", MEDIA: "#f59e0b", ALTA: "#dc2626" };
const etiquetaEstado: Record<Evento["estado"], string> = { PENDIENTE: "Pendiente", EN_PROCESO: "En proceso", COMPLETADO: "Completado" };
const badgeEstado: Record<Evento["estado"], string> = { PENDIENTE: "neutral", EN_PROCESO: "warning", COMPLETADO: "success" };

function claveDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function iconoOrigen(o: Evento["origen"]) {
  if (o === "credito") return <IconoDinero size={13} />;
  if (o === "inventario") return <IconoInventario size={13} />;
  return <IconoCalendario size={13} />;
}
const vacio = (fecha: string) => ({
  titulo: "",
  descripcion: "",
  fecha,
  hora: "",
  prioridad: "MEDIA" as Evento["prioridad"],
  estado: "PENDIENTE" as Evento["estado"],
  tipo: "TAREA",
  responsableId: "",
});

export default function Calendario() {
  const [mesRef, setMesRef] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [diaSel, setDiaSel] = useState(() => claveDia(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(vacio(claveDia(new Date())));
  const [guardando, setGuardando] = useState(false);

  // Rango visible del calendario: desde el domingo de la primera semana hasta
  // el sabado de la ultima.
  const { celdas, inicio, fin } = useMemo(() => {
    const primero = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
    const inicio = new Date(primero);
    inicio.setDate(primero.getDate() - primero.getDay());
    const ultimo = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0);
    const fin = new Date(ultimo);
    fin.setDate(ultimo.getDate() + (6 - ultimo.getDay()));
    const celdas: Date[] = [];
    const cur = new Date(inicio);
    while (cur <= fin) {
      celdas.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return { celdas, inicio, fin };
  }, [mesRef]);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<Evento[]>("/calendario", {
        params: { desde: inicio.toISOString(), hasta: new Date(fin.getTime() + 86400000).toISOString() },
      });
      setEventos(data);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version."
          : mensajeError(err, "No se pudo cargar el calendario")
      );
    }
  }, [inicio, fin]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api.get<Usuario[]>("/usuarios").then(({ data }) => setUsuarios(data)).catch(() => setUsuarios([]));
  }, []);

  // Eventos agrupados por dia.
  const porDia = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const e of eventos) {
      const k = claveDia(new Date(e.fecha));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [eventos]);

  // KPIs del rango visible.
  const kpis = useMemo(() => {
    const hoyK = claveDia(new Date());
    const ahora = Date.now();
    const en7 = ahora + 7 * 86400000;
    let hoy = 0, vencidos = 0, proximos = 0, completados = 0;
    for (const e of eventos) {
      const t = new Date(e.fecha).getTime();
      const comp = e.estado === "COMPLETADO";
      if (comp) completados++;
      if (claveDia(new Date(e.fecha)) === hoyK && !comp) hoy++;
      if (t < ahora && !comp) vencidos++;
      else if (t >= ahora && t <= en7 && !comp) proximos++;
    }
    return { hoy, vencidos, proximos, completados };
  }, [eventos]);

  function nuevoEn(fecha: string) {
    setEditandoId(null);
    setForm(vacio(fecha));
    setMostrarForm(true);
  }
  function editar(e: Evento) {
    if (!e.editable) return;
    setEditandoId(e.id);
    setForm({
      titulo: e.titulo,
      descripcion: e.descripcion ?? "",
      fecha: e.fecha.slice(0, 10),
      hora: e.hora ?? "",
      prioridad: e.prioridad,
      estado: e.estado,
      tipo: e.tipo,
      responsableId: e.responsableId ?? "",
    });
    setMostrarForm(true);
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.titulo.trim()) return setError("Ponle un titulo al evento");
    setGuardando(true);
    setError(null);
    const cuerpo = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion || undefined,
      fecha: new Date(form.fecha + "T00:00:00").toISOString(),
      hora: form.hora || undefined,
      prioridad: form.prioridad,
      estado: form.estado,
      tipo: form.tipo,
      responsableId: form.responsableId || null,
    };
    try {
      if (editandoId) await api.put(`/calendario/${editandoId}`, cuerpo);
      else await api.post("/calendario", cuerpo);
      setMostrarForm(false);
      cargar();
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo guardar el evento"));
    } finally {
      setGuardando(false);
    }
  }
  async function completar(e: Evento) {
    await api.put(`/calendario/${e.id}`, { estado: "COMPLETADO" }).catch(() => {});
    cargar();
  }
  async function eliminar(e: Evento) {
    if (!confirm(`¿Eliminar el evento "${e.titulo}"?`)) return;
    await api.delete(`/calendario/${e.id}`).catch(() => {});
    cargar();
  }

  const hoyK = claveDia(new Date());
  const eventosDia = (porDia.get(diaSel) ?? []).sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
  const tiles = [
    { label: "Pendientes hoy", valor: kpis.hoy, color: "#4f46e5", icono: <IconoReloj size={18} /> },
    { label: "Vencidos", valor: kpis.vencidos, color: "#dc2626", icono: <IconoAlerta size={18} /> },
    { label: "Proximos 7 dias", valor: kpis.proximos, color: "#f59e0b", icono: <IconoCalendario size={18} /> },
    { label: "Completados", valor: kpis.completados, color: "#16a34a", icono: <IconoCheck size={18} /> },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Calendario</h2>
          <p>Agenda del negocio: tareas, cobros de creditos y reposiciones en un solo lugar</p>
        </div>
        <button type="button" onClick={() => nuevoEn(diaSel)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconoMas size={16} /> Nuevo evento
          </span>
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              background: "var(--surface,#fff)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: t.color + "1a",
                color: t.color,
              }}
            >
              {t.icono}
            </span>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{t.valor}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.label}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        {/* Calendario mensual */}
        <div
          style={{
            background: "var(--surface,#fff)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>
              {MESES[mesRef.getMonth()]} {mesRef.getFullYear()}
            </h3>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="secondary" style={{ padding: "6px 10px" }} onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))}>
                <IconoChevronIzq size={16} />
              </button>
              <button type="button" className="secondary" onClick={() => { const d = new Date(); setMesRef(new Date(d.getFullYear(), d.getMonth(), 1)); setDiaSel(claveDia(d)); }}>
                Hoy
              </button>
              <button type="button" className="secondary" style={{ padding: "6px 10px" }} onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))}>
                <IconoChevronDer size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {DIAS_SEMANA.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", padding: "2px 0" }}>
                {d}
              </div>
            ))}
            {celdas.map((dia) => {
              const k = claveDia(dia);
              const delMes = dia.getMonth() === mesRef.getMonth();
              const esHoy = k === hoyK;
              const seleccionado = k === diaSel;
              const evs = porDia.get(k) ?? [];
              return (
                <div
                  key={k}
                  onClick={() => setDiaSel(k)}
                  onDoubleClick={() => nuevoEn(k)}
                  style={{
                    minHeight: 92,
                    border: `1px solid ${seleccionado ? "var(--brand,#4f46e5)" : "var(--border)"}`,
                    borderRadius: 10,
                    padding: 6,
                    background: delMes ? (esHoy ? "var(--brand-light,#eef2ff)" : "transparent") : "#f9fafb",
                    opacity: delMes ? 1 : 0.55,
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: esHoy ? 800 : 600,
                      color: esHoy ? "var(--brand,#4f46e5)" : "inherit",
                      textAlign: "right",
                    }}
                  >
                    {dia.getDate()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                    {evs.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        title={e.titulo}
                        style={{
                          fontSize: 10.5,
                          padding: "1px 4px",
                          borderRadius: 4,
                          background: colorPrioridad[e.prioridad] + "22",
                          color: "#111827",
                          borderLeft: `3px solid ${colorPrioridad[e.prioridad]}`,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          textDecoration: e.estado === "COMPLETADO" ? "line-through" : "none",
                        }}
                      >
                        {e.hora ? `${e.hora} ` : ""}{e.titulo}
                      </div>
                    ))}
                    {evs.length > 3 && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>+{evs.length - 3} mas</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agenda del dia seleccionado */}
        <div
          style={{
            background: "var(--surface,#fff)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
            position: "sticky",
            top: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ margin: 0, textTransform: "capitalize" }}>
              {new Date(diaSel + "T00:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
            </h4>
            <button type="button" className="secondary" style={{ padding: "4px 8px" }} onClick={() => nuevoEn(diaSel)} title="Nuevo evento este dia">
              <IconoMas size={15} />
            </button>
          </div>
          {eventosDia.length === 0 ? (
            <p className="empty-state" style={{ fontSize: 13 }}>Sin eventos este dia.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {eventosDia.map((e) => (
                <div
                  key={e.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderLeft: `4px solid ${colorPrioridad[e.prioridad]}`,
                    borderRadius: 10,
                    padding: 10,
                    opacity: e.estado === "COMPLETADO" ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600 }}>
                    <span style={{ color: "var(--text-muted)" }}>{iconoOrigen(e.origen)}</span>
                    <span style={{ textDecoration: e.estado === "COMPLETADO" ? "line-through" : "none" }}>
                      {e.hora ? `${e.hora} · ` : ""}{e.titulo}
                    </span>
                  </div>
                  {e.descripcion && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{e.descripcion}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`badge ${badgeEstado[e.estado]}`}>{etiquetaEstado[e.estado]}</span>
                    {e.responsableNombre && <span className="badge neutral">{e.responsableNombre}</span>}
                    {e.editable ? (
                      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
                        {e.estado !== "COMPLETADO" && (
                          <button type="button" className="secondary" style={{ padding: "3px 7px" }} title="Completar" onClick={() => completar(e)}>
                            <IconoCheck size={14} />
                          </button>
                        )}
                        <button type="button" className="secondary" style={{ padding: "3px 7px" }} onClick={() => editar(e)}>
                          Editar
                        </button>
                        <button type="button" className="secondary" style={{ padding: "3px 7px", color: "var(--danger,#dc2626)" }} title="Eliminar" onClick={() => eliminar(e)}>
                          <IconoBasura size={14} />
                        </button>
                      </span>
                    ) : (
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>automatico</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {mostrarForm && (
        <div className="modal-backdrop">
          <div className="card" style={{ width: 520, maxWidth: "94vw" }}>
            <h4 style={{ marginTop: 0 }}>{editandoId ? "Editar evento" : "Nuevo evento"}</h4>
            <form className="grid-form" onSubmit={guardar}>
              <label>
                Titulo
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
              </label>
              <label>
                Descripcion
                <textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  Fecha
                  <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
                </label>
                <label>
                  Hora (opcional)
                  <input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                </label>
                <label>
                  Tipo
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prioridad
                  <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value as Evento["prioridad"] })}>
                    {PRIORIDADES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Estado
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as Evento["estado"] })}>
                    {ESTADOS.map((s) => (
                      <option key={s} value={s}>{etiquetaEstado[s]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsable
                  <select value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })}>
                    <option value="">Sin asignar</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                  </select>
                </label>
              </div>
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
