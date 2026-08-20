import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { useHardwareStore } from "../lib/hardwareStore";
import { reproducir } from "../lib/sonidos";
import type { EstadoActualizacion } from "../../../shared/api-types";
import { mensajeError } from "../lib/errores";
import { generarSvgCodigoBarras } from "../lib/barcode";
import { electronAPI } from "../lib/electron-api";

function tiempoRelativo(fecha: Date): string {
  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (segundos < 60) return "hace un momento";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

export default function Configuracion() {
  const { sucursales, setSesion, token, usuario, empresa, apiBaseUrl } = useSesionStore();
  const ultimoEscaneo = useHardwareStore((s) => s.ultimoEscaneo);
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const [impresoraSeleccionada, setImpresoraSeleccionada] = useState<string>("");
  const [impresorasCargadas, setImpresorasCargadas] = useState(false);
  const [nombreSucursal, setNombreSucursal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [version, setVersion] = useState("");
  const [estadoUpdate, setEstadoUpdate] = useState<EstadoActualizacion | null>(null);
  const [buscandoUpdate, setBuscandoUpdate] = useState(false);
  const [sonidoActivado, setSonidoActivado] = useState(true);
  const [sonidoVolumen, setSonidoVolumen] = useState(0.6);
  const [descuentosClave, setDescuentosClave] = useState("");
  const [puntosActivo, setPuntosActivo] = useState(false);
  const [pesosPorPunto, setPesosPorPunto] = useState("");
  const [valorPunto, setValorPunto] = useState("");
  const [guardandoPuntos, setGuardandoPuntos] = useState(false);
  const [mensajePuntos, setMensajePuntos] = useState<string | null>(null);
  // Calibracion de etiquetas (mm).
  const [etqAncho, setEtqAncho] = useState("50");
  const [etqAlto, setEtqAlto] = useState("25");
  const [etqOffsetX, setEtqOffsetX] = useState("0");
  const [etqOffsetY, setEtqOffsetY] = useState("0");
  const [mensajeEtq, setMensajeEtq] = useState<string | null>(null);

  useEffect(() => {
    electronAPI.listPrinters().then((lista) => {
      setImpresoras(lista);
      setImpresorasCargadas(true);
    });
    electronAPI.getConfig().then((c) => {
      setImpresoraSeleccionada(c.printerName ?? "");
      setSonidoActivado(c.sonidoActivado);
      setSonidoVolumen(c.sonidoVolumen);
      setDescuentosClave(c.descuentosClave ?? "");
      setEtqAncho(String(c.etiquetaAnchoMm ?? 50));
      setEtqAlto(String(c.etiquetaAltoMm ?? 25));
      setEtqOffsetX(String(c.etiquetaOffsetXMm ?? 0));
      setEtqOffsetY(String(c.etiquetaOffsetYMm ?? 0));
    });
    electronAPI.getVersion().then(setVersion);
    api
      .get("/fidelizacion/config")
      .then(({ data }) => {
        const activo = data.pesosPorPunto != null && data.valorPunto != null;
        setPuntosActivo(activo);
        setPesosPorPunto(data.pesosPorPunto != null ? String(data.pesosPorPunto) : "");
        setValorPunto(data.valorPunto != null ? String(data.valorPunto) : "");
      })
      .catch(() => {});
    return electronAPI.onEstadoActualizacion((estado) => {
      setEstadoUpdate(estado);
      if (estado.estado !== "buscando" && estado.estado !== "descargando") setBuscandoUpdate(false);
    });
  }, []);

  async function guardarPuntos(e: React.FormEvent) {
    e.preventDefault();
    setGuardandoPuntos(true);
    setMensajePuntos(null);
    try {
      await api.put("/fidelizacion/config", {
        pesosPorPunto: puntosActivo ? Number(pesosPorPunto) : null,
        valorPunto: puntosActivo ? Number(valorPunto) : null,
      });
      setMensajePuntos(puntosActivo ? "Programa de puntos activado" : "Programa de puntos desactivado");
    } catch (err: any) {
      setMensajePuntos(mensajeError(err, "No se pudo guardar"));
    } finally {
      setGuardandoPuntos(false);
    }
  }

  async function buscarActualizaciones() {
    setBuscandoUpdate(true);
    setEstadoUpdate({ estado: "buscando" });
    try {
      await electronAPI.buscarActualizaciones();
    } catch (err: any) {
      setEstadoUpdate({ estado: "error", mensaje: err?.message ?? "No se pudo buscar actualizaciones" });
      setBuscandoUpdate(false);
    }
  }

  const escaneoReciente = ultimoEscaneo ? Date.now() - ultimoEscaneo.getTime() < 10 * 60 * 1000 : false;

  const estadoImpresora = !impresorasCargadas
    ? { clase: "espera", texto: "Buscando impresoras..." }
    : impresoras.length > 0
      ? { clase: "ok", texto: `${impresoras.length} impresora(s) detectada(s)` }
      : { clase: "mal", texto: "No se detecto ninguna impresora" };

  const estadoScanner = !ultimoEscaneo
    ? { clase: "espera", texto: "Esperando el primer escaneo" }
    : escaneoReciente
      ? { clase: "ok", texto: `Activo · ultimo escaneo ${tiempoRelativo(ultimoEscaneo)}` }
      : { clase: "espera", texto: `Sin actividad reciente · ultimo escaneo ${tiempoRelativo(ultimoEscaneo)}` };

  async function cambiarSonidoActivado(activo: boolean) {
    setSonidoActivado(activo);
    await window.pos.setConfig({ sonidoActivado: activo });
    if (activo) void reproducir("venta");
  }

  async function cambiarVolumen(valor: number) {
    setSonidoVolumen(valor);
    await window.pos.setConfig({ sonidoVolumen: valor });
  }

  async function guardarImpresora(nombre: string) {
    setImpresoraSeleccionada(nombre);
    await window.pos.setConfig({ printerName: nombre || null });
  }

  async function guardarCalibracion(e: React.FormEvent) {
    e.preventDefault();
    await window.pos.setConfig({
      etiquetaAnchoMm: Number(etqAncho) || 50,
      etiquetaAltoMm: Number(etqAlto) || 25,
      etiquetaOffsetXMm: Number(etqOffsetX) || 0,
      etiquetaOffsetYMm: Number(etqOffsetY) || 0,
    });
    setMensajeEtq("Guardado. Imprime una etiqueta de prueba para verificar.");
  }

  // Imprime una etiqueta de ejemplo para calibrar sin gastar producto real.
  async function imprimirPrueba() {
    setMensajeEtq(null);
    try {
      const svg = generarSvgCodigoBarras("2001234567890");
      await electronAPI.printEtiquetas(
        [{ svgCodigoBarras: svg, nombre: "PRUEBA DE ETIQUETA", variante: "Talla: M · Color: Azul", sku: "PRUEBA-001", precio: 85000, copias: 1 }],
        impresoraSeleccionada || null,
        "rollo1"
      );
      setMensajeEtq("Etiqueta de prueba enviada. Si sale corrida, ajusta el desplazamiento y repite.");
    } catch {
      setMensajeEtq("No se pudo imprimir. Revisa que la impresora este configurada.");
    }
  }

  async function crearSucursal(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post("/sucursales", { nombre: nombreSucursal, tipo: "FISICA" });
      const { data } = await api.get("/sucursales");
      setSesion({ token: token!, usuario, empresa, sucursales: data });
      setNombreSucursal("");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      <div className="card">
        <h3>Estado del hardware</h3>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className={`estado-punto ${estadoImpresora.clase}`} />
            <div>
              <div style={{ fontWeight: 600 }}>Impresora de recibos</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{estadoImpresora.texto}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className={`estado-punto ${estadoScanner.clase}`} />
            <div>
              <div style={{ fontWeight: 600 }}>Lector de codigo de barras</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{estadoScanner.texto}</div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>
          El lector es un dispositivo tipo teclado: no existe forma de confirmar que esta
          "conectado" sin que escanee algo, por eso el estado se basa en actividad reciente.
        </p>
      </div>

      <div className="card">
        <h3>Calibracion de etiquetas</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
          Si la etiqueta sale corrida o partida entre dos, ajusta aqui. Mide tu etiqueta con una regla y usa el
          desplazamiento para centrarla (valores negativos suben o mueven a la izquierda).
        </p>
        <form className="grid-form" onSubmit={guardarCalibracion} style={{ marginTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              Ancho de la etiqueta (mm)
              <input type="number" step="0.5" value={etqAncho} onChange={(e) => setEtqAncho(e.target.value)} />
            </label>
            <label>
              Alto de la etiqueta (mm)
              <input type="number" step="0.5" value={etqAlto} onChange={(e) => setEtqAlto(e.target.value)} />
            </label>
            <label>
              Desplazar horizontal (mm)
              <input type="number" step="0.5" value={etqOffsetX} onChange={(e) => setEtqOffsetX(e.target.value)} />
            </label>
            <label>
              Desplazar vertical (mm)
              <input type="number" step="0.5" value={etqOffsetY} onChange={(e) => setEtqOffsetY(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit">Guardar calibracion</button>
            <button type="button" className="secondary" onClick={imprimirPrueba}>
              Imprimir etiqueta de prueba
            </button>
          </div>
          {mensajeEtq && <span className="badge success" style={{ whiteSpace: "normal" }}>{mensajeEtq}</span>}
        </form>
      </div>

      <div className="card">
        <h3>Impresora de recibos</h3>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          Servidor: {apiBaseUrl}
        </p>
        <select value={impresoraSeleccionada} onChange={(e) => guardarImpresora(e.target.value)} style={{ width: "100%" }}>
          <option value="">Impresora predeterminada del sistema</option>
          {impresoras.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h3>Sonidos</h3>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={sonidoActivado}
            onChange={(e) => cambiarSonidoActivado(e.target.checked)}
            style={{ width: "auto" }}
          />
          Activar efectos de sonido
        </label>
        {sonidoActivado && (
          <label style={{ marginTop: 10 }}>
            Volumen
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sonidoVolumen}
              onChange={(e) => cambiarVolumen(Number(e.target.value))}
              onMouseUp={() => reproducir("venta")}
              style={{ width: "100%" }}
            />
          </label>
        )}
      </div>

      <div className="card">
        <h3>Descuentos</h3>
        <label>
          Clave para autorizar descuentos (usuarios normales necesitarán esta clave)
          <input
            type="password"
            placeholder="Dejar vacío para no requerir clave"
            value={descuentosClave}
            onChange={(e) => setDescuentosClave(e.target.value)}
          />
        </label>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "8px 0 0" }}>
          💡 Si configuras una clave, los usuarios normales deberán ingresarla cada vez que intenten hacer un descuento. Los administradores pueden descontar sin clave.
        </p>
        <button
          type="button"
          onClick={async () => {
            await electronAPI.setConfig({ descuentosClave });
            setMensajeEtq("Clave guardada correctamente");
            setTimeout(() => setMensajeEtq(null), 3000);
          }}
          style={{ width: "fit-content", marginTop: 12 }}
        >
          Guardar clave
        </button>
      </div>

      <div className="card">
        <h3>Programa de puntos (fidelizacion)</h3>
        <form className="grid-form" onSubmit={guardarPuntos}>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={puntosActivo}
              onChange={(e) => setPuntosActivo(e.target.checked)}
              style={{ width: "auto" }}
            />
            Activar programa de puntos
          </label>
          {puntosActivo && (
            <>
              <label>
                Pesos que el cliente debe gastar para ganar 1 punto
                <input
                  type="number"
                  min={1}
                  placeholder="Ej: 10000 (gasta $10.000 = 1 punto)"
                  value={pesosPorPunto}
                  onChange={(e) => setPesosPorPunto(e.target.value)}
                  required
                />
              </label>
              <label>
                Cuanto vale 1 punto al canjearlo (en pesos)
                <input
                  type="number"
                  min={1}
                  placeholder="Ej: 100 (1 punto = $100 de descuento)"
                  value={valorPunto}
                  onChange={(e) => setValorPunto(e.target.value)}
                  required
                />
              </label>
              {pesosPorPunto && valorPunto && Number(pesosPorPunto) > 0 && (
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>
                  Equivale a devolverle al cliente un{" "}
                  <strong>{((Number(valorPunto) / Number(pesosPorPunto)) * 100).toFixed(1)}%</strong> de lo que gasta.
                </p>
              )}
            </>
          )}
          {mensajePuntos && <p className="badge success" style={{ width: "fit-content" }}>{mensajePuntos}</p>}
          <button type="submit" disabled={guardandoPuntos} style={{ width: "fit-content" }}>
            {guardandoPuntos ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Actualizaciones</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>Version instalada: {version || "..."}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={buscarActualizaciones} disabled={buscandoUpdate} className="secondary">
            {buscandoUpdate ? "Buscando..." : "Buscar actualizaciones"}
          </button>
          {estadoUpdate?.estado === "al-dia" && <span style={{ fontSize: 13, color: "var(--success)" }}>Ya tienes la ultima version</span>}
          {estadoUpdate?.estado === "error" && (
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No se pudo verificar (normal si aun no hay releases publicadas)</span>
          )}
        </div>
        {estadoUpdate?.estado === "disponible" && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, margin: "0 0 8px" }}>Hay una version nueva disponible: {estadoUpdate.version}</p>
            <button type="button" onClick={() => window.pos.descargarActualizacion()}>
              Descargar actualizacion
            </button>
          </div>
        )}
        {estadoUpdate?.estado === "descargando" && (
          <p style={{ fontSize: 13, marginTop: 10 }}>Descargando... {estadoUpdate.porcentaje ?? 0}%</p>
        )}
        {estadoUpdate?.estado === "listo-para-instalar" && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, margin: "0 0 8px" }}>Actualizacion lista. Se instalara al reiniciar la app.</p>
            <button type="button" onClick={() => window.pos.instalarActualizacion()}>
              Reiniciar e instalar ahora
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Sucursales</h3>
        <ul>
          {sucursales.map((s) => (
            <li key={s.id}>
              {s.nombre} {s.tipo === "ECOMMERCE" ? "(Ecommerce)" : ""}
            </li>
          ))}
        </ul>
        <form className="grid-form" onSubmit={crearSucursal}>
          <input
            placeholder="Nombre de la nueva sucursal"
            value={nombreSucursal}
            onChange={(e) => setNombreSucursal(e.target.value)}
            required
          />
          <button type="submit" disabled={guardando}>
            {guardando ? "Creando..." : "Agregar sucursal"}
          </button>
        </form>
      </div>
    </div>
  );
}
