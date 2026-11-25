import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { mensajeError } from "../../lib/errores";

// Compras del cliente de la conversación: enviar el resumen de la compra o la factura electrónica
// por el mismo chat. Si la factura no está emitida, se emite y el PDF sale solo al aprobarse.

interface Compra {
  id: string;
  consecutivo: number;
  fecha: string;
  total: number;
  metodoPago: string;
  productos: number;
  factura: { id: string; estado: "PENDIENTE" | "ENVIANDO" | "EMITIDA" | "ERROR"; numero: string | null; tienePdf: boolean; error: string | null } | null;
}

interface Respuesta {
  clienteVinculado: boolean;
  compras: Compra[];
  facturacion: { conectada: boolean; disponibles: number; puedeEmitir: boolean };
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

export function ComprasChat({
  conversacionId,
  onCerrar,
  onEnviado,
}: {
  conversacionId: string;
  onCerrar: () => void;
  onEnviado: () => void;
}) {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api
      .get<Respuesta>(`/mensajeria/conversaciones/${conversacionId}/compras`)
      .then(({ data }) => setDatos(data))
      .catch((err) => setError(mensajeError(err)));
  }, [conversacionId]);

  useEffect(() => cargar(), [cargar]);

  async function accion(clave: string, url: string, exito: (r: any) => string) {
    setOcupado(clave);
    setError(null);
    setAviso(null);
    try {
      const { data } = await api.post(url);
      setAviso(exito(data));
      onEnviado();
      cargar();
    } catch (err) {
      setError(mensajeError(err, "No se pudo enviar"));
    } finally {
      setOcupado(null);
    }
  }

  const fe = datos?.facturacion;

  function botonFactura(c: Compra) {
    const f = c.factura;
    const url = `/mensajeria/conversaciones/${conversacionId}/compras/${c.id}/factura`;
    const ocupada = ocupado === `f-${c.id}`;
    if (f?.estado === "EMITIDA") {
      return (
        <button type="button" disabled={!!ocupado} onClick={() => void accion(`f-${c.id}`, url, () => "Factura enviada por el chat.")}>
          {ocupada ? "Enviando..." : `🧾 Enviar factura ${f.numero ?? ""}`}
        </button>
      );
    }
    if (f?.estado === "PENDIENTE" || f?.estado === "ENVIANDO") {
      return (
        <button
          type="button"
          className="secondary"
          disabled={!!ocupado}
          title="Se enviará sola al cliente apenas la DIAN la apruebe"
          onClick={() => void accion(`f-${c.id}`, url, () => "Listo: la factura se enviará sola apenas la DIAN la apruebe.")}
        >
          ⏳ Factura en proceso · enviar al aprobarse
        </button>
      );
    }
    if (!fe?.conectada) {
      return (
        <button type="button" className="secondary" disabled title="Se activa cuando conectes TFactura en Factura electrónica">
          🧾 Factura electrónica (al conectar TFactura)
        </button>
      );
    }
    if (!fe.puedeEmitir) {
      return (
        <button type="button" className="secondary" onClick={() => navigate("/facturacion")}>
          Sin facturas · Recargar
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={!!ocupado}
        onClick={() =>
          void accion(`f-${c.id}`, url, (r) =>
            r.estado === "ENVIADA" ? "Factura enviada por el chat." : "Factura en proceso: el PDF se enviará solo al cliente apenas la DIAN la apruebe."
          )
        }
      >
        {ocupada ? "Emitiendo..." : `🧾 Emitir y enviar factura (quedan ${fe.disponibles})`}
      </button>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onCerrar}>
      <div className="card msj-config" onClick={(e) => e.stopPropagation()}>
        <div className="msj-config-cabecera">
          <h4>Compras y facturas del cliente</h4>
          <button type="button" className="msj-btn-link" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        {aviso && <div className="msj-aviso">{aviso}</div>}
        {error && <div className="msj-error">{error}</div>}
        {!datos ? (
          <p className="msj-config-ayuda">Cargando…</p>
        ) : !datos.clienteVinculado ? (
          <p className="msj-config-ayuda">
            Primero vincula esta conversación con un cliente de CENTRALA (panel "Cliente" a la derecha). Así aparecen aquí sus
            compras para enviarle el resumen o la factura.
          </p>
        ) : datos.compras.length === 0 ? (
          <p className="msj-config-ayuda">Este cliente todavía no tiene compras registradas en CENTRALA.</p>
        ) : (
          <>
            {!fe?.conectada && (
              <p className="msj-config-ayuda">
                La factura electrónica se activa cuando conectes TFactura. Mientras tanto puedes enviar el resumen de la compra.
              </p>
            )}
            <ul className="msj-compras">
              {datos.compras.map((c) => (
                <li key={c.id}>
                  <div className="msj-compra-datos">
                    <strong>
                      Compra #{c.consecutivo} · {pesos(c.total)}
                    </strong>
                    <span>
                      {new Date(c.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })} · {c.productos}{" "}
                      producto(s)
                      {c.factura?.estado === "EMITIDA" && ` · Factura ${c.factura.numero ?? "emitida"}`}
                      {c.factura?.estado === "ERROR" && " · Factura con error"}
                    </span>
                  </div>
                  <div className="msj-compra-acciones">
                    <button
                      type="button"
                      className="secondary"
                      disabled={!!ocupado}
                      onClick={() =>
                        void accion(`r-${c.id}`, `/mensajeria/conversaciones/${conversacionId}/compras/${c.id}/resumen`, () => "Resumen enviado.")
                      }
                    >
                      {ocupado === `r-${c.id}` ? "Enviando..." : "Enviar resumen"}
                    </button>
                    {botonFactura(c)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
