import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { usePermiso } from "../lib/store";
import { useMensajeNuevo } from "../lib/socket";
import { mensajeError } from "../lib/errores";

type TipoCanal = "MESSENGER" | "INSTAGRAM" | "WHATSAPP";

interface Canal {
  id: string;
  tipo: TipoCanal;
  nombre: string;
  usuario: string | null;
  fotoUrl: string | null;
}

interface Conversacion {
  id: string;
  tipoCanal: TipoCanal;
  canalNombre: string;
  contactoNombre: string | null;
  contactoUsuario: string | null;
  contactoFoto: string | null;
  clienteId: string | null;
  noLeidos: number;
  ultimoMensajeEn: string;
  ultimoMensajeTexto: string | null;
  ventanaAbierta: boolean;
  estado: string;
}

interface Mensaje {
  id: string;
  direccion: "ENTRANTE" | "SALIENTE";
  tipo: string;
  texto: string | null;
  adjuntoUrl: string | null;
  estado: string;
  creadoEn: string;
}

interface ClienteResumen {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  cedula: string | null;
  puntos: number;
}

const PESTANAS: { valor: "TODOS" | TipoCanal; etiqueta: string }[] = [
  { valor: "TODOS", etiqueta: "Todos los mensajes" },
  { valor: "MESSENGER", etiqueta: "Messenger" },
  { valor: "INSTAGRAM", etiqueta: "Instagram" },
  { valor: "WHATSAPP", etiqueta: "WhatsApp" },
];

const NOMBRE_CANAL: Record<TipoCanal, string> = { MESSENGER: "Messenger", INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp" };

function IconoCanal({ tipo, size = 16 }: { tipo: TipoCanal; size?: number }) {
  const color = tipo === "MESSENGER" ? "#0866ff" : tipo === "INSTAGRAM" ? "#e1306c" : "#25d366";
  const letra = tipo === "MESSENGER" ? "m" : tipo === "INSTAGRAM" ? "ig" : "w";
  return (
    <span className="msj-icono-canal" style={{ background: color, width: size, height: size, fontSize: size * 0.5 }} title={NOMBRE_CANAL[tipo]}>
      {letra}
    </span>
  );
}

function hora(fecha: string): string {
  const d = new Date(fecha);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function nombreContacto(c: Pick<Conversacion, "contactoNombre" | "contactoUsuario">) {
  return c.contactoNombre || c.contactoUsuario || "Cliente sin nombre";
}

export default function Mensajes() {
  const puedeConfigurar = usePermiso("configuracion.administrar");
  const location = useLocation();
  const navigate = useNavigate();

  const [canales, setCanales] = useState<Canal[]>([]);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [pestana, setPestana] = useState<"TODOS" | TipoCanal>("TODOS");
  const [buscar, setBuscar] = useState("");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cliente, setCliente] = useState<ClienteResumen | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarCanales, setMostrarCanales] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [formWhatsapp, setFormWhatsapp] = useState(false);
  const [waNumeroId, setWaNumeroId] = useState("");
  const [waCuentaId, setWaCuentaId] = useState("");
  const [waToken, setWaToken] = useState("");
  const [conectandoWa, setConectandoWa] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  // Resultado de conectar con Facebook (vuelve con ?conectados= o ?error=).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("conectados")) {
      setAviso(
        `✓ ${params.get("conectados")} canal(es) conectados.` + (params.get("aviso") ? ` Ojo: ${params.get("aviso")}` : "")
      );
      navigate("/mensajes", { replace: true });
    } else if (params.get("error")) {
      setError(params.get("error"));
      navigate("/mensajes", { replace: true });
    }
  }, [location.search, navigate]);

  const cargarCanales = useCallback(() => {
    api
      .get<Canal[]>("/mensajeria/canales")
      .then(({ data }) => setCanales(data))
      .catch(() => setCanales([]));
  }, []);

  const cargarConversaciones = useCallback(() => {
    api
      .get<Conversacion[]>("/mensajeria/conversaciones", { params: { buscar: buscar || undefined } })
      .then(({ data }) => setConversaciones(data))
      .catch((err) => setError(mensajeError(err)))
      .finally(() => setCargando(false));
  }, [buscar]);

  const cargarMensajes = useCallback((id: string) => {
    api
      .get<{ mensajes: Mensaje[]; cliente: ClienteResumen | null }>(`/mensajeria/conversaciones/${id}/mensajes`)
      .then(({ data }) => {
        setMensajes(data.mensajes);
        setCliente(data.cliente);
        setConversaciones((prev) => prev.map((c) => (c.id === id ? { ...c, noLeidos: 0 } : c)));
      })
      .catch((err) => setError(mensajeError(err)));
  }, []);

  useEffect(() => {
    cargarCanales();
  }, [cargarCanales]);

  useEffect(() => {
    const t = setTimeout(cargarConversaciones, buscar ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargarConversaciones, buscar]);

  useEffect(() => {
    if (seleccionada) cargarMensajes(seleccionada);
  }, [seleccionada, cargarMensajes]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  // Tiempo real: un mensaje nuevo refresca la lista y, si es de la conversación abierta, el chat.
  useMensajeNuevo(
    useCallback(
      (evt) => {
        cargarConversaciones();
        if (evt.conversacionId === seleccionada) cargarMensajes(evt.conversacionId);
      },
      [cargarConversaciones, cargarMensajes, seleccionada]
    )
  );

  const visibles = useMemo(
    () => conversaciones.filter((c) => pestana === "TODOS" || c.tipoCanal === pestana),
    [conversaciones, pestana]
  );
  const noLeidasPor = useMemo(() => {
    const r: Record<string, number> = { TODOS: 0 };
    for (const c of conversaciones) {
      if (c.noLeidos > 0) {
        r.TODOS++;
        r[c.tipoCanal] = (r[c.tipoCanal] ?? 0) + 1;
      }
    }
    return r;
  }, [conversaciones]);
  const actual = conversaciones.find((c) => c.id === seleccionada) ?? null;

  async function conectarMeta() {
    setError(null);
    try {
      const { data } = await api.get<{ url: string }>("/mensajeria/meta/conectar-url");
      window.location.href = data.url;
    } catch (err) {
      setError(mensajeError(err, "No se pudo iniciar la conexión con Facebook"));
    }
  }

  async function traerHistorial() {
    setImportando(true);
    setError(null);
    try {
      await api.post("/mensajeria/canales/importar");
      setAviso(
        "Trayendo el historial en segundo plano. Las conversaciones van apareciendo solas; con muchos chats puede tardar unos minutos."
      );
      cargarConversaciones();
    } catch (err) {
      setError(mensajeError(err, "No se pudieron traer las conversaciones"));
    } finally {
      setImportando(false);
    }
  }

  async function conectarWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    setConectandoWa(true);
    setError(null);
    try {
      const { data } = await api.post<{ nombre: string; numero: string | null }>("/mensajeria/whatsapp/conectar", {
        phoneNumberId: waNumeroId,
        wabaId: waCuentaId,
        token: waToken,
      });
      setAviso(`✓ WhatsApp conectado: ${data.nombre}${data.numero ? ` (${data.numero})` : ""}.`);
      setFormWhatsapp(false);
      setWaToken("");
      cargarCanales();
    } catch (err) {
      setError(mensajeError(err, "No se pudo conectar WhatsApp"));
    } finally {
      setConectandoWa(false);
    }
  }

  async function desconectar(canal: Canal) {
    if (!confirm(`¿Desconectar ${canal.usuario || canal.nombre}? Dejarán de llegar sus mensajes a CENTRALA.`)) return;
    try {
      await api.delete(`/mensajeria/canales/${canal.id}`);
      cargarCanales();
      cargarConversaciones();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!actual || !texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/mensajeria/conversaciones/${actual.id}/mensajes`, { texto });
      setTexto("");
      cargarMensajes(actual.id);
      cargarConversaciones();
    } catch (err) {
      setError(mensajeError(err, "No se pudo enviar el mensaje"));
    } finally {
      setEnviando(false);
    }
  }

  const sinCanales = canales.length === 0;

  return (
    <div className="msj">
      <div className="msj-encabezado">
        <div>
          <h2>Mensajes</h2>
          <p>Messenger, Instagram y WhatsApp en un solo lugar</p>
        </div>
        <button type="button" className="secondary" onClick={() => setMostrarCanales((v) => !v)}>
          Canales conectados ({canales.length})
        </button>
      </div>

      {aviso && <div className="msj-aviso">{aviso}</div>}
      {error && <div className="msj-error">{error}</div>}

      {(mostrarCanales || (sinCanales && !cargando)) && (
        <div className="msj-canales">
          {sinCanales ? (
            <p className="msj-canales-vacio">
              Todavía no hay canales conectados. Conecta la página de Facebook de tu tienda y su cuenta de Instagram para
              recibir y responder los mensajes aquí.
            </p>
          ) : (
            <ul>
              {canales.map((c) => (
                <li key={c.id}>
                  <IconoCanal tipo={c.tipo} size={22} />
                  <span>
                    <strong>{c.usuario || c.nombre}</strong> · {NOMBRE_CANAL[c.tipo]}
                  </span>
                  {puedeConfigurar && (
                    <button type="button" className="msj-btn-link" onClick={() => void desconectar(c)}>
                      Desconectar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {puedeConfigurar && formWhatsapp && (
            <form className="msj-form-wa" onSubmit={conectarWhatsapp}>
              <p>
                Mientras Meta aprueba el botón de conexión, el número se conecta con los datos de la sección WhatsApp de la app
                de Meta. La clave de acceso se guarda cifrada.
              </p>
              <label>
                <span>Identificador del número (Phone Number ID)</span>
                <input value={waNumeroId} onChange={(e) => setWaNumeroId(e.target.value.trim())} inputMode="numeric" required />
              </label>
              <label>
                <span>Identificador de la cuenta de WhatsApp Business (WABA ID)</span>
                <input value={waCuentaId} onChange={(e) => setWaCuentaId(e.target.value.trim())} inputMode="numeric" required />
              </label>
              <label>
                <span>Clave de acceso (token)</span>
                <input type="password" value={waToken} onChange={(e) => setWaToken(e.target.value)} autoComplete="off" required />
              </label>
              <div className="msj-canales-acciones">
                <button type="submit" disabled={conectandoWa}>
                  {conectandoWa ? "Conectando..." : "Conectar número"}
                </button>
                <button type="button" className="secondary" onClick={() => setFormWhatsapp(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {puedeConfigurar ? (
            <div className="msj-canales-acciones">
              <button type="button" onClick={() => void conectarMeta()}>
                Conectar Facebook e Instagram
              </button>
              {!sinCanales && (
                <button type="button" className="secondary" onClick={() => void traerHistorial()} disabled={importando}>
                  {importando ? "Iniciando..." : "Traer todo el historial"}
                </button>
              )}
              <button type="button" className="secondary" onClick={() => setFormWhatsapp((v) => !v)}>
                Conectar WhatsApp
              </button>
            </div>
          ) : (
            sinCanales && <p className="msj-canales-vacio">Pídele al administrador que conecte los canales.</p>
          )}
        </div>
      )}

      <div className="msj-pestanas">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            className={`msj-pestana${pestana === p.valor ? " activa" : ""}`}
            onClick={() => setPestana(p.valor)}
          >
            {p.etiqueta}
            {(noLeidasPor[p.valor] ?? 0) > 0 && <span className="msj-contador">{noLeidasPor[p.valor]}</span>}
            {p.valor === "WHATSAPP" && !canales.some((c) => c.tipo === "WHATSAPP") && <span className="msj-pronto">Pronto</span>}
          </button>
        ))}
      </div>

      <div className={`msj-cuerpo${actual ? " con-chat" : ""}`}>
        {/* Lista de conversaciones */}
        <div className="msj-lista">
          <input
            className="msj-buscar"
            placeholder="Buscar por nombre o mensaje"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
          {visibles.length === 0 ? (
            <p className="msj-vacio">{cargando ? "Cargando..." : "No hay conversaciones todavía."}</p>
          ) : (
            visibles.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`msj-item${c.id === seleccionada ? " activo" : ""}${c.noLeidos > 0 ? " no-leido" : ""}`}
                onClick={() => setSeleccionada(c.id)}
              >
                <div className="msj-avatar">
                  {c.contactoFoto ? <img src={c.contactoFoto} alt="" /> : <span>{nombreContacto(c).charAt(0).toUpperCase()}</span>}
                  <IconoCanal tipo={c.tipoCanal} />
                </div>
                <div className="msj-item-texto">
                  <div className="msj-item-fila">
                    <strong>{nombreContacto(c)}</strong>
                    <span className="msj-hora">{hora(c.ultimoMensajeEn)}</span>
                  </div>
                  <div className="msj-item-fila">
                    <span className="msj-ultimo">{c.ultimoMensajeTexto ?? ""}</span>
                    {c.noLeidos > 0 && <span className="msj-contador">{c.noLeidos}</span>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Chat */}
        <div className="msj-chat">
          {!actual ? (
            <div className="msj-chat-vacio">Elige una conversación para verla aquí.</div>
          ) : (
            <>
              <div className="msj-chat-cabecera">
                <button type="button" className="msj-volver" onClick={() => setSeleccionada(null)} aria-label="Volver">
                  ←
                </button>
                <IconoCanal tipo={actual.tipoCanal} size={20} />
                <div>
                  <strong>{nombreContacto(actual)}</strong>
                  <span>
                    {actual.contactoUsuario ? `${actual.contactoUsuario} · ` : ""}a {actual.canalNombre}
                  </span>
                </div>
              </div>
              <div className="msj-burbujas">
                {mensajes.map((m) => (
                  <div key={m.id} className={`msj-burbuja ${m.direccion === "SALIENTE" ? "saliente" : "entrante"}`}>
                    {m.tipo === "IMAGEN" && m.adjuntoUrl ? (
                      <img src={m.adjuntoUrl} alt="Foto" className="msj-foto" />
                    ) : m.tipo !== "TEXTO" && !m.texto ? (
                      <em>{m.tipo === "AUDIO" ? "🎤 Audio" : m.tipo === "VIDEO" ? "🎬 Video" : "📎 Adjunto"}</em>
                    ) : null}
                    {m.texto && <p>{m.texto}</p>}
                    <span className="msj-burbuja-hora">
                      {hora(m.creadoEn)}
                      {m.direccion === "SALIENTE" && (m.estado === "LEIDO" ? " · Visto" : m.estado === "ERROR" ? " · No entregado" : "")}
                    </span>
                  </div>
                ))}
                <div ref={finRef} />
              </div>
              {actual.ventanaAbierta ? (
                <form className="msj-escribir" onSubmit={enviar}>
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escribe una respuesta…"
                    rows={2}
                    maxLength={1000}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar(e);
                      }
                    }}
                  />
                  <button type="submit" disabled={enviando || !texto.trim()}>
                    {enviando ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              ) : (
                <div className="msj-ventana-cerrada">
                  Pasaron más de 24 horas desde el último mensaje del cliente. Meta no permite responder hasta que vuelva a
                  escribir.
                </div>
              )}
            </>
          )}
        </div>

        {/* Ficha del cliente */}
        {actual && (
          <PanelCliente
            conversacion={actual}
            cliente={cliente}
            onVinculado={() => {
              cargarMensajes(actual.id);
              cargarConversaciones();
            }}
          />
        )}
      </div>
    </div>
  );
}

function PanelCliente({
  conversacion,
  cliente,
  onVinculado,
}: {
  conversacion: Conversacion;
  cliente: ClienteResumen | null;
  onVinculado: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ClienteResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<ClienteResumen[]>("/clientes", { params: { q: busqueda.trim() } })
        .then(({ data }) => setResultados(data.slice(0, 6)))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  async function vincular(clienteId: string | null) {
    setError(null);
    try {
      await api.patch(`/mensajeria/conversaciones/${conversacion.id}`, { clienteId });
      setBusqueda("");
      setResultados([]);
      onVinculado();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function crearCliente() {
    setError(null);
    try {
      const { data } = await api.post<{ id: string }>("/clientes", { nombre: nombreContacto(conversacion) });
      await vincular(data.id);
    } catch (err) {
      setError(mensajeError(err, "No se pudo crear el cliente"));
    }
  }

  return (
    <aside className="msj-panel">
      <div className="msj-panel-titulo">Cliente</div>
      {cliente ? (
        <div className="msj-ficha">
          <strong>{cliente.nombre}</strong>
          {cliente.cedula && <span>CC/NIT {cliente.cedula}</span>}
          {cliente.telefono && <span>Tel. {cliente.telefono}</span>}
          {cliente.email && <span>{cliente.email}</span>}
          <span>{cliente.puntos} puntos</span>
          <button type="button" className="msj-btn-link" onClick={() => void vincular(null)}>
            Quitar vínculo
          </button>
        </div>
      ) : (
        <div className="msj-ficha">
          <p className="msj-panel-ayuda">Vincula esta conversación con un cliente de CENTRALA para ver su información.</p>
          <input placeholder="Buscar cliente (nombre, cédula, teléfono)" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {resultados.map((r) => (
            <button key={r.id} type="button" className="msj-resultado" onClick={() => void vincular(r.id)}>
              {r.nombre}
              {r.cedula ? ` · ${r.cedula}` : ""}
            </button>
          ))}
          <button type="button" className="secondary" onClick={() => void crearCliente()}>
            Crear cliente "{nombreContacto(conversacion)}"
          </button>
        </div>
      )}
      {error && <span className="error-text">{error}</span>}
    </aside>
  );
}
