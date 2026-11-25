import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { mensajeError } from "../../lib/errores";

// Caja para responder: texto, fotos y documentos (botón, pegar o arrastrar), notas de voz y
// respuestas rápidas (botón ⚡ o escribiendo "/").

export interface RespuestaRapida {
  id: string;
  atajo: string;
  texto: string;
}

interface Archivo {
  nombre: string;
  mime: string;
  datos: Blob;
  vista: string | null; // vista previa de fotos
}

const MAX_SEGUNDOS_AUDIO = 180;
const ACEPTA = "image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/*";

function aBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/** Las fotos del celular pesan mucho: se reducen a 1600 px (WhatsApp acepta máximo 5 MB). */
async function prepararFoto(archivo: File): Promise<Blob> {
  if (archivo.type === "image/gif" || archivo.size < 1.2 * 1024 * 1024) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}

function personalizar(texto: string, nombre: string | null) {
  const primerNombre = nombre?.trim().split(/\s+/)[0] ?? "";
  return texto.replace(/\{nombre\}/gi, primerNombre).replace(/\s+([,!.?])/g, "$1").replace(/[ \t]{2,}/g, " ");
}

function duracion(seg: number) {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

export function Redactor({
  conversacionId,
  contactoNombre,
  tipoCanal,
  respuestas,
  onEnviado,
  onGestionarRespuestas,
  onProducto,
  onCompras,
}: {
  conversacionId: string;
  contactoNombre: string | null;
  tipoCanal: string;
  respuestas: RespuestaRapida[];
  onEnviado: () => void;
  onGestionarRespuestas: () => void;
  onProducto: () => void;
  onCompras: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarRapidas, setMostrarRapidas] = useState(false);
  const [seleccion, setSeleccion] = useState(0);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const cancelarGrabacion = useRef(false);

  // Al cambiar de conversación se limpia lo que se estaba escribiendo.
  useEffect(() => {
    setTexto("");
    setArchivo(null);
    setError(null);
    setMostrarRapidas(false);
  }, [conversacionId]);

  useEffect(() => () => grabadora.current?.stream.getTracks().forEach((t) => t.stop()), []);

  // Respuestas rápidas: "/" al inicio filtra por atajo o texto.
  const filtro = texto.startsWith("/") ? texto.slice(1).toLowerCase() : null;
  const rapidasVisibles = useMemo(() => {
    const q = filtro ?? "";
    return respuestas.filter((r) => !q || r.atajo.includes(q) || r.texto.toLowerCase().includes(q)).slice(0, 8);
  }, [respuestas, filtro]);
  const abiertoRapidas = (mostrarRapidas || filtro !== null) && !grabando;
  useEffect(() => setSeleccion(0), [filtro, mostrarRapidas]);

  function usarRapida(r: RespuestaRapida) {
    setTexto(personalizar(r.texto, contactoNombre));
    setMostrarRapidas(false);
    textareaRef.current?.focus();
  }

  const elegirArchivo = useCallback(async (f: File | null | undefined) => {
    if (!f) return;
    setError(null);
    if (f.type.startsWith("image/")) {
      const datos = await prepararFoto(f);
      if (datos.size > 5 * 1024 * 1024) return setError("La foto pesa más de 5 MB");
      setArchivo({ nombre: f.name, mime: datos.type || f.type, datos, vista: URL.createObjectURL(datos) });
    } else if (f.type === "application/pdf" || f.type.startsWith("audio/")) {
      if (f.size > 16 * 1024 * 1024) return setError("El archivo pesa más de 16 MB");
      setArchivo({ nombre: f.name, mime: f.type, datos: f, vista: null });
    } else {
      setError("Solo se pueden enviar fotos (JPG, PNG), audios o PDF");
    }
  }, []);

  async function enviarArchivo(a: Archivo, pie: string) {
    await api.post(`/mensajeria/conversaciones/${conversacionId}/adjuntos`, {
      mime: a.mime,
      nombre: a.nombre,
      datos: await aBase64(a.datos),
      texto: pie || undefined,
    });
  }

  async function enviar() {
    const limpio = texto.trim();
    if ((!limpio && !archivo) || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      if (archivo) {
        await enviarArchivo(archivo, limpio);
        setArchivo(null);
      } else {
        await api.post(`/mensajeria/conversaciones/${conversacionId}/mensajes`, { texto: limpio });
      }
      setTexto("");
      onEnviado();
    } catch (err) {
      setError(mensajeError(err, "No se pudo enviar"));
    } finally {
      setEnviando(false);
    }
  }

  // ---------- Notas de voz ----------
  async function empezarGrabacion() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setError("Este navegador no permite grabar audio");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      trozos.current = [];
      cancelarGrabacion.current = false;
      rec.ondataavailable = (e) => e.data.size > 0 && trozos.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        if (cancelarGrabacion.current) return;
        const blob = new Blob(trozos.current, { type: rec.mimeType || tipo || "audio/webm" });
        if (blob.size < 1000) return setError("La nota de voz quedó vacía");
        setEnviando(true);
        try {
          await enviarArchivo({ nombre: "nota-de-voz", mime: blob.type, datos: blob, vista: null }, "");
          onEnviado();
        } catch (err) {
          setError(mensajeError(err, "No se pudo enviar la nota de voz"));
        } finally {
          setEnviando(false);
        }
      };
      grabadora.current = rec;
      rec.start();
      setSegundos(0);
      setGrabando(true);
    } catch {
      setError("No se pudo usar el micrófono. Revisa que el navegador tenga permiso.");
    }
  }

  function terminarGrabacion(cancelar: boolean) {
    cancelarGrabacion.current = cancelar;
    if (grabadora.current?.state === "recording") grabadora.current.stop();
  }

  useEffect(() => {
    if (!grabando) return;
    const t = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= MAX_SEGUNDOS_AUDIO) terminarGrabacion(false);
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [grabando]);

  return (
    <div
      className={`msj-redactor${arrastrando ? " arrastrando" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        void elegirArchivo(e.dataTransfer.files?.[0]);
      }}
    >
      {abiertoRapidas && (
        <div className="msj-rapidas">
          <div className="msj-rapidas-cabecera">
            <span>Respuestas rápidas</span>
            <button type="button" className="msj-btn-link" onClick={onGestionarRespuestas}>
              Administrar
            </button>
          </div>
          {rapidasVisibles.length === 0 ? (
            <p className="msj-rapidas-vacio">
              {respuestas.length === 0 ? "Aún no hay respuestas rápidas. Créalas en \"Administrar\"." : "Ninguna coincide."}
            </p>
          ) : (
            rapidasVisibles.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className={`msj-rapida${i === seleccion ? " activa" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => usarRapida(r)}
              >
                <strong>/{r.atajo}</strong>
                <span>{r.texto}</span>
              </button>
            ))
          )}
        </div>
      )}

      {archivo && (
        <div className="msj-adjunto-previo">
          {archivo.vista ? <img src={archivo.vista} alt="" /> : <span className="msj-adjunto-icono">{archivo.mime.startsWith("audio/") ? "🎤" : "📄"}</span>}
          <span className="msj-adjunto-nombre">{archivo.nombre}</span>
          <button type="button" className="msj-btn-link" onClick={() => setArchivo(null)}>
            Quitar
          </button>
        </div>
      )}

      {error && <div className="msj-redactor-error">{error}</div>}

      {grabando ? (
        <div className="msj-grabando">
          <span className="msj-grabando-punto" />
          <span>Grabando nota de voz · {duracion(segundos)}</span>
          <button type="button" className="secondary" onClick={() => terminarGrabacion(true)}>
            Cancelar
          </button>
          <button type="button" onClick={() => terminarGrabacion(false)}>
            Enviar
          </button>
        </div>
      ) : (
        <form
          className="msj-escribir"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <div className="msj-herramientas">
            <button type="button" className="msj-herramienta" title="Enviar foto o PDF" onClick={() => inputArchivo.current?.click()}>
              📎
            </button>
            <button
              type="button"
              className={`msj-herramienta${mostrarRapidas ? " activa" : ""}`}
              title="Respuestas rápidas (o escribe /)"
              onClick={() => setMostrarRapidas((v) => !v)}
            >
              ⚡
            </button>
            <button type="button" className="msj-herramienta" title="Enviar un producto (foto, precio y tallas)" onClick={onProducto}>
              📦
            </button>
            <button type="button" className="msj-herramienta" title="Compras del cliente: resumen o factura" onClick={onCompras}>
              🧾
            </button>
            <input
              ref={inputArchivo}
              type="file"
              accept={tipoCanal === "INSTAGRAM" ? "image/jpeg,image/png,image/webp,image/gif,audio/*" : ACEPTA}
              hidden
              onChange={(e) => {
                void elegirArchivo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={archivo ? "Agrega un texto (opcional)…" : "Escribe una respuesta… ( / para respuestas rápidas)"}
            rows={2}
            maxLength={1000}
            onPaste={(e) => {
              const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                void elegirArchivo(f);
              }
            }}
            onKeyDown={(e) => {
              if (abiertoRapidas && rapidasVisibles.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  return setSeleccion((s) => (s + 1) % rapidasVisibles.length);
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  return setSeleccion((s) => (s - 1 + rapidasVisibles.length) % rapidasVisibles.length);
                }
                if ((e.key === "Enter" || e.key === "Tab") && filtro !== null) {
                  e.preventDefault();
                  return usarRapida(rapidasVisibles[seleccion]);
                }
              }
              if (e.key === "Escape") setMostrarRapidas(false);
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
          />
          {texto.trim() || archivo ? (
            <button type="submit" disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          ) : (
            <button type="button" className="msj-microfono" disabled={enviando} title="Grabar nota de voz" onClick={() => void empezarGrabacion()}>
              {enviando ? "…" : "🎤"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
