import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { mensajeError } from "../../lib/errores";
import { avisosMensajes, sonarMensaje } from "../../lib/mensajes-avisos";
import type { RespuestaRapida } from "./Redactor";

type Pestana = "rapidas" | "bienvenida" | "horario" | "avisos";
type Dia = { abre: string; cierra: string } | null;

const DIAS = [
  { v: "1", t: "Lunes" },
  { v: "2", t: "Martes" },
  { v: "3", t: "Miércoles" },
  { v: "4", t: "Jueves" },
  { v: "5", t: "Viernes" },
  { v: "6", t: "Sábado" },
  { v: "0", t: "Domingo" },
];

const HORARIO_INICIAL: Record<string, Dia> = {
  "1": { abre: "08:00", cierra: "18:00" },
  "2": { abre: "08:00", cierra: "18:00" },
  "3": { abre: "08:00", cierra: "18:00" },
  "4": { abre: "08:00", cierra: "18:00" },
  "5": { abre: "08:00", cierra: "18:00" },
  "6": { abre: "09:00", cierra: "14:00" },
  "0": null,
};

const EJEMPLOS: { atajo: string; texto: string }[] = [
  { atajo: "hola", texto: "¡Hola {nombre}! Gracias por escribirnos. ¿En qué te podemos ayudar?" },
  { atajo: "envios", texto: "Hacemos envíos a todo el país. El envío tarda de 2 a 5 días hábiles." },
  { atajo: "pagos", texto: "Recibimos transferencia, Nequi, Daviplata, tarjeta y pago contra entrega." },
  { atajo: "gracias", texto: "¡Gracias por tu compra, {nombre}! Cualquier cosa aquí estamos." },
];

export function ConfigMensajes({
  pestanaInicial = "rapidas",
  puedeConfigurar,
  respuestas,
  onRespuestasCambiadas,
  onCerrar,
}: {
  pestanaInicial?: Pestana;
  puedeConfigurar: boolean;
  respuestas: RespuestaRapida[];
  onRespuestasCambiadas: () => void;
  onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  return (
    <div className="modal-backdrop" onClick={onCerrar}>
      <div className="card msj-config" onClick={(e) => e.stopPropagation()}>
        <div className="msj-config-cabecera">
          <h4>Respuestas y avisos</h4>
          <button type="button" className="msj-btn-link" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <div className="msj-config-pestanas">
          {(
            [
              ["rapidas", "⚡ Respuestas rápidas"],
              ["bienvenida", "👋 Bienvenida"],
              ["horario", "🌙 Fuera de horario"],
              ["avisos", "🔔 Avisos"],
            ] as [Pestana, string][]
          ).map(([v, t]) => (
            <button key={v} type="button" className={`msj-pestana${pestana === v ? " activa" : ""}`} onClick={() => setPestana(v)}>
              {t}
            </button>
          ))}
        </div>
        {pestana === "rapidas" && <RespuestasRapidas respuestas={respuestas} onCambio={onRespuestasCambiadas} />}
        {(pestana === "bienvenida" || pestana === "horario") && <Automatizaciones parte={pestana} puedeConfigurar={puedeConfigurar} />}
        {pestana === "avisos" && <Avisos />}
      </div>
    </div>
  );
}

function RespuestasRapidas({ respuestas, onCambio }: { respuestas: RespuestaRapida[]; onCambio: () => void }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [atajo, setAtajo] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function editar(r: RespuestaRapida | null) {
    setEditando(r?.id ?? "nueva");
    setAtajo(r?.atajo ?? "");
    setTexto(r?.texto ?? "");
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      if (editando === "nueva") await api.post("/mensajeria/respuestas", { atajo, texto });
      else await api.put(`/mensajeria/respuestas/${editando}`, { atajo, texto });
      setEditando(null);
      onCambio();
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(r: RespuestaRapida) {
    if (!confirm(`¿Borrar la respuesta /${r.atajo}?`)) return;
    await api.delete(`/mensajeria/respuestas/${r.id}`).catch(() => {});
    onCambio();
  }

  async function crearEjemplos() {
    for (const e of EJEMPLOS) await api.post("/mensajeria/respuestas", e).catch(() => {});
    onCambio();
  }

  return (
    <div className="msj-config-cuerpo">
      <p className="msj-config-ayuda">
        Mensajes que escribes muchas veces. En el chat toca ⚡ o escribe <b>/</b> y el atajo. Usa <b>{"{nombre}"}</b> para poner
        el nombre del cliente.
      </p>
      {editando ? (
        <form className="msj-config-form" onSubmit={guardar}>
          <label>
            Atajo
            <input value={atajo} onChange={(e) => setAtajo(e.target.value)} placeholder="envios" maxLength={30} required />
          </label>
          <label>
            Mensaje
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={1000} required />
          </label>
          {error && <span className="error-text">{error}</span>}
          <div className="toolbar">
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" className="secondary" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          {respuestas.length === 0 ? (
            <div className="msj-config-vacio">
              <p>Todavía no tienes respuestas rápidas.</p>
              <button type="button" className="secondary" onClick={() => void crearEjemplos()}>
                Agregar ejemplos (saludo, envíos, pagos, gracias)
              </button>
            </div>
          ) : (
            <ul className="msj-config-lista">
              {respuestas.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>/{r.atajo}</strong>
                    <span>{r.texto}</span>
                  </div>
                  <div className="toolbar">
                    <button type="button" className="msj-btn-link" onClick={() => editar(r)}>
                      Editar
                    </button>
                    <button type="button" className="msj-btn-link" onClick={() => void borrar(r)}>
                      Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => editar(null)}>
            + Nueva respuesta
          </button>
        </>
      )}
    </div>
  );
}

interface ConfigAuto {
  bienvenidaActiva: boolean;
  bienvenidaTexto: string;
  ausenciaActiva: boolean;
  ausenciaTexto: string;
  horario: Record<string, Dia> | null;
  abiertoAhora: boolean;
}

function Automatizaciones({ parte, puedeConfigurar }: { parte: "bienvenida" | "horario"; puedeConfigurar: boolean }) {
  const [c, setC] = useState<ConfigAuto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api
      .get<ConfigAuto>("/mensajeria/automatizaciones")
      .then(({ data }) => setC(data))
      .catch((err) => setError(mensajeError(err)));
  }, []);

  if (!c) return <div className="msj-config-cuerpo">{error ? <span className="error-text">{error}</span> : "Cargando..."}</div>;
  const horario = c.horario ?? HORARIO_INICIAL;

  async function guardar() {
    if (!c) return;
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      await api.put("/mensajeria/automatizaciones", { ...c, horario });
      const { data } = await api.get<ConfigAuto>("/mensajeria/automatizaciones");
      setC(data);
      setOk("Guardado.");
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  const setDia = (dia: string, valor: Dia) => setC({ ...c, horario: { ...horario, [dia]: valor } });

  return (
    <div className="msj-config-cuerpo">
      {parte === "bienvenida" ? (
        <>
          <p className="msj-config-ayuda">
            Se envía solo cuando una persona escribe <b>por primera vez</b> a tu Messenger, Instagram o WhatsApp.
          </p>
          <label className="msj-interruptor">
            <input
              type="checkbox"
              checked={c.bienvenidaActiva}
              disabled={!puedeConfigurar}
              onChange={(e) => setC({ ...c, bienvenidaActiva: e.target.checked })}
            />
            Enviar mensaje de bienvenida
          </label>
          <textarea
            value={c.bienvenidaTexto}
            disabled={!puedeConfigurar}
            onChange={(e) => setC({ ...c, bienvenidaTexto: e.target.value })}
            rows={4}
            maxLength={1000}
            placeholder="¡Hola {nombre}! 👋 Gracias por escribir a nuestra tienda. En un momento te atendemos. Mira el catálogo en..."
          />
        </>
      ) : (
        <>
          <p className="msj-config-ayuda">
            Si escriben fuera de tu horario de atención, se responde solo (una vez cada 12 horas por cliente). Ahora mismo estás{" "}
            <b>{c.abiertoAhora ? "dentro" : "fuera"}</b> del horario guardado (hora de Colombia).
          </p>
          <label className="msj-interruptor">
            <input
              type="checkbox"
              checked={c.ausenciaActiva}
              disabled={!puedeConfigurar}
              onChange={(e) => setC({ ...c, ausenciaActiva: e.target.checked })}
            />
            Responder automáticamente fuera de horario
          </label>
          <textarea
            value={c.ausenciaTexto}
            disabled={!puedeConfigurar}
            onChange={(e) => setC({ ...c, ausenciaTexto: e.target.value })}
            rows={3}
            maxLength={1000}
            placeholder="¡Hola {nombre}! Ya cerramos por hoy. Te respondemos mañana desde las 8:00 a. m. 🙌"
          />
          <div className="msj-horario">
            {DIAS.map((d) => {
              const v = horario[d.v] ?? null;
              return (
                <div key={d.v} className="msj-horario-dia">
                  <label className="msj-interruptor">
                    <input
                      type="checkbox"
                      checked={!!v}
                      disabled={!puedeConfigurar}
                      onChange={(e) => setDia(d.v, e.target.checked ? { abre: "08:00", cierra: "18:00" } : null)}
                    />
                    {d.t}
                  </label>
                  {v ? (
                    <span className="msj-horario-horas">
                      <input type="time" value={v.abre} disabled={!puedeConfigurar} onChange={(e) => setDia(d.v, { ...v, abre: e.target.value })} />
                      a
                      <input type="time" value={v.cierra} disabled={!puedeConfigurar} onChange={(e) => setDia(d.v, { ...v, cierra: e.target.value })} />
                    </span>
                  ) : (
                    <span className="msj-horario-cerrado">Cerrado</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {error && <span className="error-text">{error}</span>}
      {ok && <span className="msj-config-ok">{ok}</span>}
      {puedeConfigurar ? (
        <button type="button" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      ) : (
        <p className="msj-config-ayuda">Solo el administrador puede cambiar los mensajes automáticos.</p>
      )}
    </div>
  );
}

function Avisos() {
  const [sonido, setSonido] = useState(avisosMensajes.sonido());
  const [navegador, setNavegador] = useState(avisosMensajes.navegador());
  const [nota, setNota] = useState<string | null>(null);
  const soporta = avisosMensajes.soportaNavegador();
  const bloqueado = soporta && Notification.permission === "denied";

  async function cambiarNavegador(v: boolean) {
    setNota(null);
    if (!v) {
      avisosMensajes.setNavegador(false);
      return setNavegador(false);
    }
    const ok = await avisosMensajes.activarNavegador();
    setNavegador(ok);
    if (ok) {
      try {
        new Notification("CENTRALA", { body: "¡Listo! Así se verán los avisos de mensajes nuevos." });
      } catch {
        /* sin avisos en este dispositivo */
      }
    } else {
      setNota("El navegador no dio permiso. Actívalo en el candado 🔒 junto a la dirección de la página → Notificaciones → Permitir.");
    }
  }

  return (
    <div className="msj-config-cuerpo">
      <p className="msj-config-ayuda">
        Cuando llega un mensaje sale una tarjeta en cualquier pantalla de CENTRALA. Estas opciones son de este computador o
        celular.
      </p>
      <label className="msj-interruptor">
        <input
          type="checkbox"
          checked={sonido}
          onChange={(e) => {
            avisosMensajes.setSonido(e.target.checked);
            setSonido(e.target.checked);
            if (e.target.checked) sonarMensaje();
          }}
        />
        Sonar cuando llega un mensaje
      </label>
      <label className="msj-interruptor">
        <input type="checkbox" checked={navegador} disabled={!soporta} onChange={(e) => void cambiarNavegador(e.target.checked)} />
        Avisos del navegador (cuando CENTRALA está minimizado o en otra pestaña)
      </label>
      {!soporta && <p className="msj-config-ayuda">Este navegador no permite avisos. En el celular, agrega CENTRALA a la pantalla de inicio.</p>}
      {bloqueado && !nota && (
        <p className="msj-config-ayuda">
          Los avisos están bloqueados en este navegador. Actívalos en el candado 🔒 junto a la dirección → Notificaciones → Permitir.
        </p>
      )}
      {nota && <p className="msj-config-ayuda">{nota}</p>}
    </div>
  );
}
