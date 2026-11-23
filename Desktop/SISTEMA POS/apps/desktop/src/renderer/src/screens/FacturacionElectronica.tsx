import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { usePermiso } from "../lib/store";
import { mensajeError } from "../lib/errores";

interface Paquete {
  id: string;
  tipo: string;
  cantidad: number;
  usadas: number;
  disponibles: number;
  periodoHasta: string;
  venceEn: string;
  creadoEn: string;
}

export interface EstadoFacturacion {
  disponibles: number;
  periodoHasta: string | null;
  diasParaRenovar: number | null;
  renovarPronto: boolean;
  proximoVencimiento: string | null;
  paquetes: Paquete[];
  conectada: boolean;
  puedeEmitir: boolean;
  config: {
    activo: boolean;
    preciosIncluyenIva: boolean;
    ultimaPrueba: string | null;
    ultimaPruebaOk: boolean | null;
    ultimaPruebaMensaje: string | null;
  } | null;
  precios: { tipo: string; nombre: string; cantidad: number; precio: number }[];
}

interface Comprobante {
  id: string;
  ventaId: string;
  tipo: "FACTURA" | "NOTA_CREDITO";
  estado: "PENDIENTE" | "ENVIANDO" | "EMITIDA" | "ERROR";
  intentos: number;
  ultimoError: string | null;
  numero: string | null;
  cufe: string | null;
  urlPdf: string | null;
  emitidaEn: string | null;
  creadoEn: string;
  venta: { consecutivo: number; total: number; fecha: string; cliente: string | null } | null;
}

const NOMBRE_PAQUETE: Record<string, string> = {
  P50: "Paquete 50",
  P100: "Paquete 100",
  RECARGA10: "Recarga 10",
  CORTESIA: "Cortesía",
};

const ESTADO: Record<Comprobante["estado"], { texto: string; clase: string }> = {
  PENDIENTE: { texto: "En cola", clase: "warning" },
  ENVIANDO: { texto: "Enviando", clase: "warning" },
  EMITIDA: { texto: "Emitida", clase: "success" },
  ERROR: { texto: "Con error", clase: "danger" },
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "-";

export default function FacturacionElectronica() {
  const puedeConfigurar = usePermiso("configuracion.administrar");
  const location = useLocation();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<EstadoFacturacion | null>(null);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [usadasMes, setUsadasMes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);
  const [mostrarConexion, setMostrarConexion] = useState(false);
  const [reintentando, setReintentando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([
        api.get<EstadoFacturacion>("/facturacion/estado"),
        api.get<{ usadasMes: number; comprobantes: Comprobante[] }>("/facturacion/comprobantes"),
      ]);
      setEstado(e.data);
      setComprobantes(c.data.comprobantes);
      setUsadasMes(c.data.usadasMes);
    } catch (err) {
      setError(mensajeError(err, "No se pudo cargar la facturación electrónica"));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Mientras haya comprobantes en cola, se refresca cada 10 segundos.
  useEffect(() => {
    if (!comprobantes.some((c) => c.estado === "PENDIENTE" || c.estado === "ENVIANDO")) return;
    const t = setInterval(() => void cargar(), 10_000);
    return () => clearInterval(t);
  }, [comprobantes, cargar]);

  // Regreso desde Wompi: se espera a que el pago se confirme y se carguen las facturas.
  useEffect(() => {
    const referencia = new URLSearchParams(location.search).get("pago");
    if (!referencia) return;
    let vueltas = 0;
    setAviso("Confirmando tu pago con Wompi...");
    const t = setInterval(async () => {
      vueltas++;
      try {
        const { data } = await api.get<{ estado: string; acreditado: boolean }>(`/facturacion/pagos/${encodeURIComponent(referencia)}`);
        if (data.acreditado) {
          clearInterval(t);
          setAviso("¡Pago aprobado! Tus facturas electrónicas ya están cargadas.");
          navigate("/facturacion", { replace: true });
          void cargar();
          return;
        }
        if (data.estado === "FALLIDO") {
          clearInterval(t);
          setAviso(null);
          setError("El pago no fue aprobado. Puedes intentarlo de nuevo.");
          navigate("/facturacion", { replace: true });
        }
      } catch {
        /* se reintenta */
      }
      if (vueltas >= 40) {
        clearInterval(t);
        setAviso("Wompi aún no confirma el pago. Si ya pagaste, las facturas se cargarán solas en unos minutos.");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [location.search, navigate, cargar]);

  async function comprar(tipo: string) {
    setComprando(tipo);
    setError(null);
    try {
      const { data } = await api.post<{ url: string }>("/facturacion/comprar", { paquete: tipo });
      window.location.href = data.url;
    } catch (err) {
      setError(mensajeError(err, "No se pudo iniciar el pago"));
      setComprando(null);
    }
  }

  async function reintentar(c: Comprobante) {
    setReintentando(c.id);
    setError(null);
    try {
      await api.post(`/facturacion/comprobantes/${c.id}/reintentar`);
      await cargar();
    } catch (err) {
      setError(mensajeError(err, "No se pudo reintentar"));
    } finally {
      setReintentando(null);
    }
  }

  if (!estado) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h2>Facturación electrónica</h2>
          </div>
        </div>
        {error ? <p className="error-text">{error}</p> : <p className="empty-state">Cargando...</p>}
      </div>
    );
  }

  const mensuales = estado.precios.filter((p) => p.tipo !== "RECARGA10");
  const recarga = estado.precios.find((p) => p.tipo === "RECARGA10");
  const sinFacturas = estado.disponibles === 0;

  return (
    <div className="fe-pagina">
      <div className="page-header">
        <div>
          <h2>Facturación electrónica</h2>
          <p>Factura ante la DIAN desde el punto de venta. Compras un paquete al mes y en cada venta eliges si la facturas.</p>
        </div>
      </div>

      {aviso && <p className="fe-aviso">{aviso}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="fe-resumen">
        <div className={`card fe-contador ${sinFacturas ? "fe-contador-vacio" : ""}`}>
          <span className="fe-contador-numero">{estado.disponibles}</span>
          <span className="fe-contador-texto">facturas disponibles</span>
          <span className="fe-contador-detalle">
            {estado.periodoHasta
              ? `Paquete del mes hasta el ${fecha(estado.periodoHasta)}`
              : sinFacturas
                ? "No tienes un paquete activo"
                : ""}
          </span>
          <span className="fe-contador-detalle">Usadas este mes: {usadasMes}</span>
        </div>
        <div className="card fe-conexion">
          <h4>Cuenta de TFactura</h4>
          {estado.conectada ? (
            <>
              <span className="badge success">Conectada</span>
              {estado.config?.ultimaPrueba && (
                <p className="fe-nota">
                  Última revisión: {fecha(estado.config.ultimaPrueba)} —{" "}
                  {estado.config.ultimaPruebaOk ? "todo bien" : estado.config.ultimaPruebaMensaje}
                </p>
              )}
            </>
          ) : (
            <>
              <span className="badge neutral">Sin conectar</span>
              <p className="fe-nota">Para emitir facturas necesitas conectar la cuenta de TFactura de tu negocio (una sola vez).</p>
            </>
          )}
          {puedeConfigurar && (
            <button type="button" className={estado.conectada ? "secondary" : ""} onClick={() => setMostrarConexion(true)}>
              {estado.conectada ? "Cambiar datos de conexión" : "Conectar TFactura"}
            </button>
          )}
        </div>
      </div>

      {estado.renovarPronto && estado.diasParaRenovar !== null && (
        <p className="fe-aviso fe-aviso-alerta">
          {estado.diasParaRenovar <= 0
            ? "Tu paquete del mes terminó. Renueva para seguir facturando el próximo mes (lo que te sobró lo puedes usar 1 mes más)."
            : `Tu paquete del mes termina en ${estado.diasParaRenovar} día(s). Renueva a tiempo para no quedarte sin facturas.`}
        </p>
      )}
      {sinFacturas && estado.conectada && (
        <p className="fe-aviso fe-aviso-alerta">Se acabaron tus facturas: en el punto de venta la opción quedará bloqueada hasta que compres un paquete o una recarga.</p>
      )}

      <h3 className="fe-titulo">{estado.periodoHasta ? "Renovar o recargar" : "Elige tu paquete mensual"}</h3>
      <div className="fe-planes">
        {mensuales.map((p) => (
          <div key={p.tipo} className={`card fe-plan ${p.tipo === "P100" ? "fe-plan-destacado" : ""}`}>
            {p.tipo === "P100" && <span className="fe-plan-etiqueta">Mejor precio por factura</span>}
            <h4>{p.cantidad} facturas</h4>
            <span className="fe-plan-precio">{pesos(p.precio)}</span>
            <span className="fe-nota">al mes · IVA incluido · {pesos(p.precio / p.cantidad)} por factura</span>
            <ul>
              <li>Facturas y notas crédito ante la DIAN</li>
              <li>Lo que sobre se puede usar 1 mes más</li>
              <li>Se envían por correo al cliente</li>
            </ul>
            {puedeConfigurar ? (
              <button type="button" disabled={comprando !== null} onClick={() => comprar(p.tipo)}>
                {comprando === p.tipo ? "Abriendo Wompi..." : "Comprar con Wompi"}
              </button>
            ) : (
              <span className="fe-nota">Pídele al administrador que compre el paquete.</span>
            )}
          </div>
        ))}
        {recarga && (
          <div className="card fe-plan">
            <h4>Recarga de {recarga.cantidad}</h4>
            <span className="fe-plan-precio">{pesos(recarga.precio)}</span>
            <span className="fe-nota">pago único · para cuando se acaban las del mes</span>
            <ul>
              <li>Se suman a tu saldo de inmediato</li>
              <li>Vencen junto con tu paquete del mes</li>
            </ul>
            {puedeConfigurar && (
              <button type="button" className="secondary" disabled={comprando !== null} onClick={() => comprar(recarga.tipo)}>
                {comprando === recarga.tipo ? "Abriendo Wompi..." : "Recargar"}
              </button>
            )}
          </div>
        )}
      </div>

      {estado.paquetes.length > 0 && (
        <>
          <h3 className="fe-titulo">Mis paquetes</h3>
          <div className="card fe-tabla">
            <table>
              <thead>
                <tr>
                  <th>Paquete</th>
                  <th>Comprado</th>
                  <th>Usadas</th>
                  <th>Disponibles</th>
                  <th>Se pueden usar hasta</th>
                </tr>
              </thead>
              <tbody>
                {estado.paquetes.map((p) => (
                  <tr key={p.id}>
                    <td>{NOMBRE_PAQUETE[p.tipo] ?? p.tipo}</td>
                    <td>{fecha(p.creadoEn)}</td>
                    <td>
                      {p.usadas} de {p.cantidad}
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.disponibles}</td>
                    <td>{fecha(p.venceEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="fe-titulo">Facturas emitidas</h3>
      <div className="card">
        {comprobantes.length === 0 ? (
          <p className="empty-state">
            Todavía no hay facturas electrónicas. En el punto de venta marca "Emitir factura electrónica" al cobrar.
          </p>
        ) : (
          <div className="fe-tabla">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Venta</th>
                  <th>Cliente</th>
                  <th>Número</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {comprobantes.map((c) => (
                  <tr key={c.id}>
                    <td>{fecha(c.emitidaEn ?? c.creadoEn)}</td>
                    <td>{c.tipo === "FACTURA" ? "Factura" : "Nota crédito"}</td>
                    <td>
                      {c.venta ? (
                        <>
                          #{c.venta.consecutivo} · {pesos(c.venta.total)}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{c.venta?.cliente ?? "Consumidor final"}</td>
                    <td>{c.numero ?? "-"}</td>
                    <td>
                      <span className={`badge ${ESTADO[c.estado].clase}`}>{ESTADO[c.estado].texto}</span>
                      {c.estado !== "EMITIDA" && c.ultimoError && <div className="fe-error-linea">{c.ultimoError}</div>}
                    </td>
                    <td>
                      <div className="toolbar">
                        {c.urlPdf && (
                          <a className="fe-enlace" href={c.urlPdf} target="_blank" rel="noreferrer">
                            Ver PDF
                          </a>
                        )}
                        {c.estado === "ERROR" && (
                          <button type="button" className="secondary" disabled={reintentando === c.id} onClick={() => reintentar(c)}>
                            {reintentando === c.id ? "Enviando..." : "Reintentar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mostrarConexion && (
        <ConexionTFactura
          conectada={estado.conectada}
          preciosIncluyenIva={estado.config?.preciosIncluyenIva ?? true}
          onCerrar={() => setMostrarConexion(false)}
          onGuardado={() => {
            setMostrarConexion(false);
            setAviso("¡Listo! Tu cuenta de TFactura quedó conectada.");
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ConexionTFactura({
  conectada,
  preciosIncluyenIva,
  onCerrar,
  onGuardado,
}: {
  conectada: boolean;
  preciosIncluyenIva: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState({ usuario: "", password: "", identificador: "", clavePublica: "", preciosIncluyenIva });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.put("/facturacion/config", form);
      onGuardado();
    } catch (err) {
      setError(mensajeError(err, "No se pudo conectar con TFactura"));
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: "usuario" | "password" | "identificador" | "clavePublica", etiqueta: string, tipo = "text") => (
    <label>
      {etiqueta}
      <input
        type={tipo}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        required
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 520, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <h4 style={{ marginTop: 0 }}>{conectada ? "Cambiar conexión con TFactura" : "Conectar TFactura"}</h4>
        <ol className="fe-pasos">
          <li>Entra a tu cuenta de TFactura.</li>
          <li>
            Ve a <b>Configuración → Aplicaciones</b> y crea una aplicación llamada "CENTRALA".
          </li>
          <li>Copia aquí los 4 datos que te muestra. Se guardan cifrados: nadie más los puede ver.</li>
        </ol>
        <form className="grid-form" onSubmit={guardar}>
          {campo("usuario", "Usuario / Username")}
          {campo("password", "Contraseña / Password", "password")}
          {campo("identificador", "Identificador de usuario / User identifier")}
          {campo("clavePublica", "Clave pública / Public key")}
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.preciosIncluyenIva}
              onChange={(e) => setForm({ ...form, preciosIncluyenIva: e.target.checked })}
              style={{ width: "auto" }}
            />
            Mis precios ya incluyen IVA (lo normal)
          </label>
          {error && <span className="error-text">{error}</span>}
          <div className="toolbar" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="secondary" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando}>
              {guardando ? "Probando conexión..." : "Conectar y probar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
