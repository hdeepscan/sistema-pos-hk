import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { mensajeError } from "../lib/errores";

interface Pedido {
  id: string;
  ordenId: string;
  numeroOrden: string;
  clienteNombre: string | null;
  total: number;
  productos: { nombre: string; cantidad: number }[];
  fechaPedido: string;
  atendido: boolean;
  fechaAtendido: string | null;
}

export default function Notificaciones() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "atendidos">("pendientes");
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get<Pedido[]>("/pedidos-shopify", {
        params: filtro === "todos" ? undefined : { atendido: filtro === "atendidos" },
      });
      setPedidos(data);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version."
          : mensajeError(err, "No se pudo cargar el centro de notificaciones")
      );
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api
      .get("/shopify/config")
      .then(({ data }) => setShopDomain(data.conectado ? data.shopDomain : null))
      .catch(() => setShopDomain(null));
  }, []);

  async function atender(id: string) {
    await api.patch(`/pedidos-shopify/${id}/atender`);
    cargar();
  }

  function verPedido(ordenId: string) {
    if (!shopDomain) return;
    window.pos.abrirEnlaceExterno(`https://${shopDomain}/admin/orders/${ordenId}`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Centro de notificaciones</h2>
          <p>Historial de pedidos recibidos desde Shopify</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["pendientes", "atendidos", "todos"] as const).map((f) => (
            <button key={f} type="button" className={filtro === f ? "" : "secondary"} onClick={() => setFiltro(f)}>
              {f === "pendientes" ? "Pendientes" : f === "atendidos" ? "Atendidos" : "Todos"}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p className="empty-state">Cargando...</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : pedidos.length === 0 ? (
          <p className="empty-state">No hay pedidos en este filtro</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Productos</th>
                <th>Total</th>
                <th>Hora</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td>{p.numeroOrden}</td>
                  <td>{p.clienteNombre ?? "-"}</td>
                  <td style={{ maxWidth: 260, fontSize: 12.5 }}>
                    {p.productos.map((i) => `${i.cantidad}x ${i.nombre}`).join(", ")}
                  </td>
                  <td>${p.total.toLocaleString("es-CO")}</td>
                  <td>{new Date(p.fechaPedido).toLocaleString("es-CO")}</td>
                  <td>
                    <span className={`badge ${p.atendido ? "success" : "warning"}`}>
                      {p.atendido ? "Atendido" : "Pendiente"}
                    </span>
                  </td>
                  <td>
                    <div className="toolbar">
                      {shopDomain && (
                        <button className="secondary" type="button" onClick={() => verPedido(p.ordenId)}>
                          Ver pedido
                        </button>
                      )}
                      {!p.atendido && (
                        <button type="button" onClick={() => atender(p.id)}>
                          Preparar pedido
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
