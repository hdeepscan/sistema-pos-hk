import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { useInventarioActualizado } from "../lib/socket";
import type { MetodoPago } from "@sistema-pos/shared";

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  precio: string | number;
  codigoBarras: string | null;
}

interface ItemCarrito {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export default function Pos() {
  const { sucursalActivaId, sucursales, empresa, usuario } = useSesionStore();
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);

  const [codigo, setCodigo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const inputCodigoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputCodigoRef.current?.focus();
  }, []);

  useInventarioActualizado(
    useCallback((evt) => {
      if (evt.sucursalId === sucursalActivaId) {
        setMensaje(`Inventario actualizado en tiempo real (producto ${evt.productoId.slice(0, 8)})`);
      }
    }, [sucursalActivaId])
  );

  function agregarAlCarrito(p: Producto) {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.productoId === p.id);
      if (existente) {
        return prev.map((i) => (i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...prev, { productoId: p.id, nombre: p.nombre, cantidad: 1, precioUnitario: Number(p.precio) }];
    });
  }

  async function handleCodigoKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const valor = codigo.trim();
    setCodigo("");
    if (!valor) return;
    try {
      const { data } = await api.get<Producto>("/productos/buscar", { params: { codigo: valor } });
      agregarAlCarrito(data);
      setMensaje(null);
    } catch {
      setMensaje(`No se encontro ningun producto con el codigo "${valor}"`);
    }
  }

  async function handleBusqueda(valor: string) {
    setBusqueda(valor);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    const { data } = await api.get<Producto[]>("/productos", { params: { q: valor } });
    setResultados(data);
  }

  function actualizarCantidad(productoId: string, cantidad: number) {
    setCarrito((prev) =>
      cantidad <= 0
        ? prev.filter((i) => i.productoId !== productoId)
        : prev.map((i) => (i.productoId === productoId ? { ...i, cantidad } : i))
    );
  }

  const total = carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);

  async function cobrar() {
    if (carrito.length === 0 || !sucursalActivaId) return;
    setProcesando(true);
    const clienteUuid = uuidv4();
    const payload = {
      clienteUuid,
      sucursalId: sucursalActivaId,
      metodoPago,
      items: carrito.map((i) => ({
        productoId: i.productoId,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
      })),
    };

    let consecutivo = 0;
    let sincronizada = true;
    try {
      const { data } = await api.post("/ventas", payload);
      consecutivo = data.consecutivo;
    } catch {
      sincronizada = false;
      await window.pos.queueAdd({ id: clienteUuid, tipo: "venta", endpoint: "/ventas", payload });
    }

    const config = await window.pos.getConfig();
    try {
      await window.pos.printRecibo(
        {
          empresaNombre: empresa?.nombre ?? "",
          sucursalNombre: sucursalActiva?.nombre ?? "",
          consecutivo: consecutivo || 0,
          fecha: new Date().toLocaleString("es-CO"),
          cajero: usuario?.nombre ?? "",
          items: carrito.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
          total,
          metodoPago,
        },
        config.printerName
      );
    } catch {
      // Si no hay impresora configurada, la venta igual queda registrada/encolada.
    }

    setMensaje(
      sincronizada
        ? `Venta registrada${consecutivo ? ` (No. ${consecutivo})` : ""}`
        : "Venta guardada localmente, se sincronizara cuando haya conexion"
    );
    setCarrito([]);
    setProcesando(false);
    inputCodigoRef.current?.focus();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
      <div className="card">
        <h3>Punto de venta</h3>
        <input
          ref={inputCodigoRef}
          placeholder="Escanea o escribe el codigo de barras y presiona Enter"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={handleCodigoKeyDown}
          style={{ width: "100%", marginBottom: 12 }}
          autoFocus
        />

        <input
          placeholder="Buscar producto por nombre o SKU"
          value={busqueda}
          onChange={(e) => handleBusqueda(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        />
        {resultados.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            {resultados.map((p) => (
              <div
                key={p.id}
                style={{ display: "flex", justifyContent: "space-between", padding: 6, cursor: "pointer" }}
                onClick={() => {
                  agregarAlCarrito(p);
                  setBusqueda("");
                  setResultados([]);
                }}
              >
                <span>{p.nombre} ({p.sku})</span>
                <span>${Number(p.precio).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {mensaje && <p>{mensaje}</p>}

        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carrito.map((i) => (
              <tr key={i.productoId}>
                <td>{i.nombre}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={i.cantidad}
                    onChange={(e) => actualizarCantidad(i.productoId, Number(e.target.value))}
                    style={{ width: 60 }}
                  />
                </td>
                <td>${i.precioUnitario.toFixed(2)}</td>
                <td>${(i.cantidad * i.precioUnitario).toFixed(2)}</td>
                <td>
                  <button className="secondary" onClick={() => actualizarCantidad(i.productoId, 0)} type="button">
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ height: "fit-content" }}>
        <h3>Cobro</h3>
        <p style={{ fontSize: 24, fontWeight: 700 }}>${total.toFixed(2)}</p>
        <label>
          Metodo de pago
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as MetodoPago)} style={{ width: "100%" }}>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="OTRO">Otro</option>
          </select>
        </label>
        <button
          style={{ width: "100%", marginTop: 12 }}
          disabled={carrito.length === 0 || procesando}
          onClick={cobrar}
          type="button"
        >
          {procesando ? "Procesando..." : "Cobrar e imprimir"}
        </button>
      </div>
    </div>
  );
}
