import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMensajeNuevo, type EventoMensaje } from "../lib/socket";
import { avisosMensajes, sonarMensaje } from "../lib/mensajes-avisos";
import logo from "../assets/CENTRALA.pdf.png";

// Aviso emergente cuando llega un mensaje (en cualquier pantalla de CENTRALA), con sonido y, si la
// persona lo activó, notificación del navegador cuando CENTRALA está en otra pestaña o minimizado.

interface Aviso extends EventoMensaje {
  clave: string;
}

const COLOR: Record<string, string> = { MESSENGER: "#0866ff", INSTAGRAM: "#e1306c", WHATSAPP: "#25d366" };
const NOMBRE: Record<string, string> = { MESSENGER: "Messenger", INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp" };
const DURACION_MS = 8000;

export function AvisosMensajes({ activo }: { activo: boolean }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pendientesFuera, setPendientesFuera] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const enMensajes = useRef(false);
  enMensajes.current = location.pathname.startsWith("/mensajes");

  const cerrar = useCallback((clave: string) => setAvisos((a) => a.filter((x) => x.clave !== clave)), []);

  const abrir = useCallback(
    (conversacionId: string) => {
      window.focus();
      navigate(`/mensajes?c=${encodeURIComponent(conversacionId)}`);
    },
    [navigate]
  );

  useMensajeNuevo(
    useCallback(
      (evt: EventoMensaje) => {
        if (!activo || evt.direccion !== "ENTRANTE" || !evt.conversacionId) return;
        const visible = document.visibilityState === "visible";
        if (!visible) setPendientesFuera((n) => n + 1);
        // Ya la está viendo: no hace falta avisar.
        if (visible && enMensajes.current && avisosMensajes.conversacionAbierta === evt.conversacionId) return;

        if (avisosMensajes.sonido()) sonarMensaje();

        if (!visible && avisosMensajes.navegador()) {
          try {
            const n = new Notification(`${evt.contacto || "Nuevo mensaje"} · ${NOMBRE[evt.tipoCanal] ?? ""}`, {
              body: evt.resumen ?? "Te escribieron",
              icon: evt.foto || logo,
              tag: evt.conversacionId, // un solo aviso por conversación
            });
            n.onclick = () => {
              abrir(evt.conversacionId);
              n.close();
            };
          } catch {
            /* algunos celulares solo permiten avisos desde una app instalada */
          }
        }

        // En la bandeja la lista ya se actualiza sola; en las demás pantallas sale la tarjeta.
        if (enMensajes.current && visible) return;
        const clave = `${evt.mensajeId}-${Date.now()}`;
        setAvisos((a) => [...a.filter((x) => x.conversacionId !== evt.conversacionId), { ...evt, clave }].slice(-3));
        setTimeout(() => cerrar(clave), DURACION_MS);
      },
      [activo, abrir, cerrar]
    )
  );

  // Título de la pestaña con el número de mensajes que llegaron mientras no estaba a la vista.
  useEffect(() => {
    const volver = () => {
      if (document.visibilityState === "visible") setPendientesFuera(0);
    };
    document.addEventListener("visibilitychange", volver);
    return () => document.removeEventListener("visibilitychange", volver);
  }, []);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = pendientesFuera > 0 ? `(${pendientesFuera}) ${base}` : base;
  }, [pendientesFuera]);

  if (avisos.length === 0) return null;
  return (
    <div className="msj-avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div
          key={a.clave}
          className="msj-aviso-pop"
          onClick={() => {
            cerrar(a.clave);
            abrir(a.conversacionId);
          }}
        >
          <div className="msj-aviso-pop-avatar" style={{ borderColor: COLOR[a.tipoCanal] ?? "#94a3b8" }}>
            {a.foto ? <img src={a.foto} alt="" /> : <span>{(a.contacto || "?").charAt(0).toUpperCase()}</span>}
          </div>
          <div className="msj-aviso-pop-texto">
            <div className="msj-aviso-pop-fila">
              <strong>{a.contacto || "Nuevo mensaje"}</strong>
              <span style={{ color: COLOR[a.tipoCanal] }}>{NOMBRE[a.tipoCanal]}</span>
            </div>
            <p>{a.resumen ?? "Te escribieron"}</p>
            <span className="msj-aviso-pop-accion">Toca para responder</span>
          </div>
          <button
            type="button"
            className="msj-aviso-pop-cerrar"
            aria-label="Cerrar"
            onClick={(e) => {
              e.stopPropagation();
              cerrar(a.clave);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
