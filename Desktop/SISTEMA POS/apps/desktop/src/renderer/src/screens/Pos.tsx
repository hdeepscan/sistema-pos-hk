import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useSesionStore, usePermiso } from "../lib/store";
import { useHardwareStore } from "../lib/hardwareStore";
import { useInventarioActualizado } from "../lib/socket";
import { reproducir } from "../lib/sonidos";
import type { MetodoPago } from "@sistema-pos/shared";
import type { ReciboData } from "../../../shared/api-types";
import { mensajeError } from "../lib/errores";
import { ModalCredito } from "../components/ModalCredito";
import { DetalleCreditoModal } from "../components/DetalleCreditoModal";
import { electronAPI } from "../lib/electron-api";

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  precio: string | number;
  codigoBarras: string | null;
  imagenUrl: string | null;
  stockSucursal?: number;
}

interface ItemCarrito {
  // Los items de "venta libre" no tienen producto del inventario: usan un id
  // local (libre-...) solo para manejarlos en el carrito.
  productoId: string;
  esLibre?: boolean;
  nombre: string;
  imagenUrl: string | null;
  cantidad: number;
  precioUnitario: number;
  stockSucursal?: number;
}

interface Cliente {
  id: string;
  nombre: string;
  puntos: number;
}

interface VentaEnEspera {
  id: string;
  nombre: string;
  carrito: ItemCarrito[];
  creada: number;
}

interface ResultadoVenta {
  total: number;
  consecutivo: number;
  sincronizada: boolean;
  metodoPago: MetodoPago;
  cambio: number | null;
  puntosGanados: number;
}

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function Reloj() {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fecha = `${DIAS[ahora.getDay()]}, ${ahora.getDate()} de ${MESES[ahora.getMonth()]} de ${ahora.getFullYear()}`;
  const hora = ahora.toLocaleTimeString("es-CO");
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{hora}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", textTransform: "capitalize" }}>{fecha}</div>
    </div>
  );
}

export default function Pos() {
  const { sucursalActivaId, sucursales, empresa, usuario } = useSesionStore();
  const registrarEscaneo = useHardwareStore((s) => s.registrarEscaneo);
  const puedeDescuentos = usePermiso("descuentos.aplicar");
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);

  const [codigo, setCodigo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [dineroRecibido, setDineroRecibido] = useState("");
  const [cuentas, setCuentas] = useState<{ id: string; nombre: string }[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  // Venta libre: concepto suelto que no descuenta inventario.
  const [mostrarVentaLibre, setMostrarVentaLibre] = useState(false);
  const [libreDescripcion, setLibreDescripcion] = useState("");
  const [libreValor, setLibreValor] = useState("");
  const [libreCantidad, setLibreCantidad] = useState("1");
  const [libreObservaciones, setLibreObservaciones] = useState("");
  const [observacionesVenta, setObservacionesVenta] = useState("");
  const [clienteId, setClienteId] = useState<string>("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarDatosCliente, setMostrarDatosCliente] = useState(false);
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoEmail, setContactoEmail] = useState("");
  const [contactoCelular, setContactoCelular] = useState("");
  const [contactoCedula, setContactoCedula] = useState("");
  const [mostrarModalCredito, setMostrarModalCredito] = useState(false);
  const [creditoCuotas, setCreditoCuotas] = useState(1);
  const [creditoPlazo, setCreditoPlazo] = useState(1);
  const [descuentoTipo, setDescuentoTipo] = useState<"PORCENTAJE" | "VALOR">("PORCENTAJE");
  const [descuentoValor, setDescuentoValor] = useState("");
  const [puntosARedimir, setPuntosARedimir] = useState("");
  const [mostrarModalClaveDescuento, setMostrarModalClaveDescuento] = useState(false);
  const [claveDescuentoIngresada, setClaveDescuentoIngresada] = useState("");
  const [esAdministrador, setEsAdministrador] = useState(false);
  const [fidelizacion, setFidelizacion] = useState<{ pesosPorPunto: number | null; valorPunto: number | null }>({
    pesosPorPunto: null,
    valorPunto: null,
  });
  const [enEspera, setEnEspera] = useState<VentaEnEspera[]>([]);
  const [plantilla, setPlantilla] = useState<ReciboData["plantilla"] | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [ventaExitosa, setVentaExitosa] = useState<ResultadoVenta | null>(null);
  const inputCodigoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputCodigoRef.current?.focus();
  }, []);

  useEffect(() => {
    api.get<Cliente[]>("/clientes").then(({ data }) => setClientes(data));
    api.get("/fidelizacion/config").then(({ data }) => setFidelizacion(data));
    api
      .get<{ id: string; nombre: string }[]>("/cuentas-bancarias", { params: { soloActivas: true } })
      .then(({ data }) => setCuentas(data))
      .catch(() => setCuentas([]));
    api.get("/plantilla-recibo").then(async ({ data }) => {
      const qrDataUrl = data.mostrarQr && data.qrContenido ? await QRCode.toDataURL(data.qrContenido, { width: 180, margin: 1 }) : null;
      setPlantilla({
        logoUrl: data.logoUrl ?? null,
        direccion: data.direccion ?? null,
        telefono: data.telefono ?? null,
        email: data.email ?? null,
        redesSociales: data.redesSociales ?? null,
        mensajeAgradecimiento: data.mensajeAgradecimiento ?? null,
        politicasCambios: data.politicasCambios ?? null,
        piePagina: data.piePagina ?? null,
        qrDataUrl,
        imagenPromocionalUrl: data.imagenPromocionalUrl ?? null,
        cuponDescuento: data.cuponDescuento ?? null,
        promociones: data.promociones ?? null,
      });
    });
  }, []);

  const requiereCuenta = metodoPago !== "EFECTIVO" && metodoPago !== "CREDITO";

  useEffect(() => {
    // Cargar config de descuentosClave y detectar si es administrador
    electronAPI.getConfig().then((config) => {
      setEsAdministrador(usuario?.permisos?.includes("admin.configurar") ?? false);
    });
  }, [usuario?.permisos]);

  useEffect(() => {
    if (metodoPago !== "EFECTIVO") setDineroRecibido("");
    // Al elegir un pago no-efectivo/no-credito, sugiere la primera cuenta.
    if (metodoPago !== "EFECTIVO" && metodoPago !== "CREDITO") {
      setCuentaId((prev) => prev || cuentas[0]?.id || "");
    } else {
      setCuentaId("");
    }
  }, [metodoPago, cuentas]);

  useInventarioActualizado(
    useCallback((evt) => {
      if (evt.sucursalId === sucursalActivaId) {
        setCarrito((prev) =>
          prev.map((i) => (i.productoId === evt.productoId ? { ...i, stockSucursal: evt.cantidad } : i))
        );
      }
    }, [sucursalActivaId])
  );

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const fidelizacionActiva = fidelizacion.pesosPorPunto != null && fidelizacion.valorPunto != null;

  function agregarAlCarrito(p: Producto) {
    void reproducir("producto_agregado");
    setCarrito((prev) => {
      const existente = prev.find((i) => i.productoId === p.id);
      if (existente) {
        return prev.map((i) => (i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...prev,
        {
          productoId: p.id,
          nombre: p.nombre,
          imagenUrl: p.imagenUrl,
          cantidad: 1,
          precioUnitario: Number(p.precio),
          stockSucursal: p.stockSucursal,
        },
      ];
    });
  }

  async function handleCodigoKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const valor = codigo.trim();
    setCodigo("");
    if (!valor) return;
    registrarEscaneo();
    try {
      const { data } = await api.get<Producto>("/productos/buscar", {
        params: { codigo: valor, sucursalId: sucursalActivaId },
      });
      agregarAlCarrito(data);
      setMensaje(null);
    } catch {
      void reproducir("error");
      setMensaje(`No se encontro ningun producto con el codigo "${valor}" en esta sucursal`);
    }
  }

  async function handleBusqueda(valor: string) {
    setBusqueda(valor);
    if (valor.trim().length < 1) {
      setResultados([]);
      return;
    }
    const { data } = await api.get<Producto[]>("/productos", {
      params: { q: valor, sucursalId: sucursalActivaId },
    });
    setResultados(data);
  }

  function seleccionarResultado(p: Producto) {
    agregarAlCarrito(p);
    setBusqueda("");
    setResultados([]);
    inputCodigoRef.current?.focus();
  }

  function actualizarCantidad(productoId: string, cantidad: number) {
    if (cantidad <= 0) void reproducir("producto_eliminado");
    setCarrito((prev) =>
      cantidad <= 0
        ? prev.filter((i) => i.productoId !== productoId)
        : prev.map((i) => (i.productoId === productoId ? { ...i, cantidad } : i))
    );
  }

  // Agrega al carrito un concepto libre (sin producto del inventario).
  function agregarVentaLibre(e: React.FormEvent) {
    e.preventDefault();
    const valor = Number(libreValor);
    const cantidad = Math.max(1, Number(libreCantidad) || 1);
    if (!libreDescripcion.trim()) return setError("Escribe la descripcion de la venta libre");
    if (!(valor > 0)) return setError("Escribe un valor valido");
    setError(null);
    setCarrito((prev) => [
      ...prev,
      {
        productoId: `libre-${crypto.randomUUID()}`,
        esLibre: true,
        nombre: libreDescripcion.trim(),
        imagenUrl: null,
        cantidad,
        precioUnitario: valor,
      },
    ]);
    if (libreObservaciones.trim()) {
      setObservacionesVenta((prev) => (prev ? `${prev} · ${libreObservaciones.trim()}` : libreObservaciones.trim()));
    }
    void reproducir("producto_agregado");
    setMostrarVentaLibre(false);
    setLibreDescripcion("");
    setLibreValor("");
    setLibreCantidad("1");
    setLibreObservaciones("");
  }

  const subtotal = carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
  const totalUnidades = carrito.reduce((acc, i) => acc + i.cantidad, 0);

  const montoDescuento = (() => {
    const v = Number(descuentoValor) || 0;
    if (v <= 0) return 0;
    return descuentoTipo === "PORCENTAJE" ? Math.min((subtotal * v) / 100, subtotal) : Math.min(v, subtotal);
  })();

  const puntosNum = Number(puntosARedimir) || 0;
  const valorPuntos =
    fidelizacionActiva && puntosNum > 0 && fidelizacion.valorPunto
      ? Math.min(puntosNum * fidelizacion.valorPunto, subtotal - montoDescuento)
      : 0;

  const total = Math.max(0, Math.round((subtotal - montoDescuento - valorPuntos) * 100) / 100);
  const dineroRecibidoNum = dineroRecibido.trim() === "" ? null : Number(dineroRecibido);
  const cambio = dineroRecibidoNum !== null ? dineroRecibidoNum - total : null;

  function guardarEnEspera() {
    if (carrito.length === 0) return;
    const nombre = prompt("Nombre o referencia para esta venta en espera:", `Cliente ${enEspera.length + 1}`);
    if (nombre === null) return;
    setEnEspera((prev) => [...prev, { id: uuidv4(), nombre: nombre || `Venta ${prev.length + 1}`, carrito, creada: Date.now() }]);
    limpiarCarrito();
    setMensaje("Venta guardada en espera");
  }

  function recuperarEspera(v: VentaEnEspera) {
    if (carrito.length > 0 && !confirm("El carrito actual tiene productos. ¿Reemplazarlo por la venta en espera?")) return;
    setCarrito(v.carrito);
    setEnEspera((prev) => prev.filter((e) => e.id !== v.id));
  }

  async function handleDescuentoChange(valor: string) {
    // Si el valor es vacío, permitir sin restricción
    if (!valor || Number(valor) <= 0) {
      setDescuentoValor(valor);
      return;
    }

    // Si es administrador, permitir descuento sin clave
    if (esAdministrador) {
      setDescuentoValor(valor);
      return;
    }

    // Si no es administrador, pedir clave
    const config = await electronAPI.getConfig();
    if (config.descuentosClave) {
      // Mostrar modal para pedir la clave
      setMostrarModalClaveDescuento(true);
      setClaveDescuentoIngresada("");
      setDescuentoValor(valor); // Almacenar el valor temporalmente
    } else {
      // No hay clave configurada, permitir descuento
      setDescuentoValor(valor);
    }
  }

  function limpiarCarrito() {
    setCarrito([]);
    setDescuentoValor("");
    setPuntosARedimir("");
    setClienteId("");
    setDineroRecibido("");
    setObservacionesVenta("");
  }

  function handleCobrarClick() {
    if (carrito.length === 0 || !sucursalActivaId) return;
    if (metodoPago === "CREDITO") {
      setMostrarModalCredito(true);
    } else {
      void cobrar();
    }
  }

  async function cobrar(creditoData?: { clienteId: string; cuotas: number; plazo: number; abonoInicial: number }) {
    if (carrito.length === 0 || !sucursalActivaId) return;
    setError(null);
    if (metodoPago === "EFECTIVO" && dineroRecibidoNum !== null && dineroRecibidoNum < total) {
      void reproducir("error");
      setError("El dinero recibido es menor al total de la venta");
      return;
    }
    // Validar que cada item tenga productoId o descripcionLibre antes de enviar
    const itemSinId = carrito.find((i) => !i.esLibre && !i.productoId);
    if (itemSinId) {
      void reproducir("error");
      setError(`El producto "${itemSinId.nombre}" no tiene un identificador válido. Quítalo y agrégalo de nuevo.`);
      return;
    }

    setProcesando(true);
    const clienteIdEfectivo = creditoData?.clienteId ?? clienteId;
    const clienteUuid = uuidv4();
    const contactoCliente =
      metodoPago !== "CREDITO" && !clienteIdEfectivo && (contactoNombre || contactoEmail || contactoCelular || contactoCedula)
        ? {
            nombre: contactoNombre || undefined,
            email: contactoEmail || undefined,
            telefono: contactoCelular || undefined,
            cedula: contactoCedula || undefined,
          }
        : undefined;
    const payload = {
      clienteUuid,
      sucursalId: sucursalActivaId,
      metodoPago,
      cuentaBancariaId: requiereCuenta && cuentaId ? cuentaId : undefined,
      clienteId: clienteIdEfectivo || undefined,
      contactoCliente,
      items: carrito.map((i) => {
        // Valida que sean realmente items de venta libre o del inventario
        if (i.esLibre || i.productoId.startsWith("libre-")) {
          // Venta libre: solo envía descripción
          return { descripcionLibre: i.nombre, cantidad: i.cantidad, precioUnitario: i.precioUnitario };
        } else {
          // Producto del inventario: envía el productoId
          return { productoId: i.productoId, cantidad: i.cantidad, precioUnitario: i.precioUnitario };
        }
      }),
      observaciones: observacionesVenta || undefined,
      dineroRecibido: metodoPago === "EFECTIVO" && dineroRecibidoNum !== null ? dineroRecibidoNum : undefined,
      descuento: montoDescuento > 0 ? { tipo: descuentoTipo, valor: Number(descuentoValor) } : undefined,
      puntosARedimir: valorPuntos > 0 ? puntosNum : undefined,
      numeroCuotas: creditoData?.cuotas,
      plazoMeses: creditoData?.plazo,
    };

    let consecutivo = 0;
    let sincronizada = true;
    let puntosGanados = 0;
    let impuestoVenta: number | undefined;
    try {
      const { data } = await api.post("/ventas", payload);
      consecutivo = data.consecutivo;
      puntosGanados = data.puntosGanados ?? 0;
      impuestoVenta = data.impuestoTotal ? Number(data.impuestoTotal) : undefined;
      if (creditoData?.abonoInicial && creditoData.abonoInicial > 0 && data.id) {
        try {
          await api.post(`/creditos/${data.id}/abonar`, { monto: creditoData.abonoInicial });
        } catch {
          // El credito queda registrado; el abono inicial fallara silenciosamente
        }
      }
    } catch (err: any) {
      if (err?.response?.status === 409 || err?.response?.status === 403 || err?.response?.status === 400) {
        void reproducir("error");
        setError(mensajeError(err, "No se pudo registrar la venta"));
        setProcesando(false);
        return;
      }
      sincronizada = false;
      await electronAPI.queueAdd({ id: clienteUuid, tipo: "venta", endpoint: "/ventas", payload });
    }

    const config = await electronAPI.getConfig();
    const reciboData = {
      empresaNombre: empresa?.nombre ?? "",
      sucursalNombre: sucursalActiva?.nombre ?? "",
      consecutivo: consecutivo || 0,
      fecha: new Date().toLocaleString("es-CO"),
      cajero: usuario?.nombre ?? "",
      items: carrito.map((i) => ({
        nombre: i.esLibre ? `Venta Libre: ${i.nombre}` : i.nombre,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
      })),
      total,
      metodoPago,
      impuesto: impuestoVenta,
      subtotal: montoDescuento > 0 || valorPuntos > 0 ? subtotal : undefined,
      descuento: montoDescuento > 0 ? montoDescuento : undefined,
      puntosRedimidos: valorPuntos > 0 ? puntosNum : undefined,
      valorPuntosRedimidos: valorPuntos > 0 ? valorPuntos : undefined,
      puntosGanados: puntosGanados > 0 ? puntosGanados : undefined,
      dineroRecibido: metodoPago === "EFECTIVO" && dineroRecibidoNum !== null ? dineroRecibidoNum : undefined,
      cambio: metodoPago === "EFECTIVO" && cambio !== null ? cambio : undefined,
      plantilla: plantilla ?? undefined,
    };

    try {
      console.log(`[RECEIPT] Attempting to print with printer: ${config.printerName || "default"}`);
      // Use printRecibo for direct printing to configured printer
      await electronAPI.printRecibo(reciboData, config.printerName);
      console.log("[RECEIPT] Print successful");
    } catch (printErr) {
      // Venta ya está guardada en backend, pero notificamos al usuario del error de impresión
      console.error("[RECEIPT] Print error:", printErr);
      setMensaje(`Venta guardada pero no se pudo imprimir: ${printErr instanceof Error ? printErr.message : "Error desconocido"}`);
    }

    void reproducir("venta");
    setVentaExitosa({ total, consecutivo, sincronizada, metodoPago, cambio, puntosGanados });
    limpiarCarrito();
    setContactoNombre("");
    setContactoEmail("");
    setContactoCelular("");
    setContactoCedula("");
    setMostrarDatosCliente(false);
    if (clienteId) api.get<Cliente[]>("/clientes").then(({ data }) => setClientes(data));
    setProcesando(false);
  }

  function nuevaVenta() {
    setVentaExitosa(null);
    setMensaje(null);
    inputCodigoRef.current?.focus();
  }

  return (
    <div>
      {/* Encabezado con contexto y reloj en vivo */}
      <div
        className="card"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, padding: "14px 18px" }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Punto de venta</h2>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            {usuario?.nombre} · {sucursalActiva?.nombre}
          </div>
        </div>
        <Reloj />
      </div>

      {enEspera.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: "10px 14px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
            Ventas en espera
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {enEspera.map((v) => (
              <button key={v.id} type="button" className="secondary" onClick={() => recuperarEspera(v)}>
                {v.nombre} ({v.carrito.reduce((a, i) => a + i.cantidad, 0)})
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        <div className="card">
          <input
            ref={inputCodigoRef}
            placeholder="Escanea o escribe el codigo de barras y presiona Enter"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={handleCodigoKeyDown}
            style={{ width: "100%", marginBottom: 12 }}
            autoFocus
          />

          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              placeholder="Buscar producto por nombre, SKU o codigo de barras"
              value={busqueda}
              onChange={(e) => handleBusqueda(e.target.value)}
              style={{ width: "100%" }}
            />
            {resultados.length > 0 && (
              <div
                className="card"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  maxHeight: 340,
                  overflowY: "auto",
                  padding: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                }}
              >
                {resultados.map((p) => {
                  const sinStock = (p.stockSucursal ?? 0) <= 0;
                  return (
                    <div
                      key={p.id}
                      className="list-item"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        justifyContent: "space-between",
                        padding: 8,
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                      onClick={() => seleccionarResultado(p)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        {p.imagenUrl ? (
                          <img src={p.imagenUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: 6, background: "#f3f4f6" }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nombre}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                            {p.sku} · {sinStock ? <span style={{ color: "var(--danger)" }}>Sin stock</span> : `${p.stockSucursal} disp.`}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontWeight: 600 }}>${Number(p.precio).toLocaleString("es-CO")}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {mensaje && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{mensaje}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", margin: "6px 0 10px" }}>
            <button
              type="button"
              onClick={() => setMostrarVentaLibre(true)}
              style={{
                background: "#f5a623",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "7px 16px",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: "pointer",
                letterSpacing: 0.2,
              }}
            >
              + Venta libre
            </button>
          </div>

          {carrito.length === 0 ? (
            <div className="empty-state" style={{ padding: "48px 0" }}>
              El carrito esta vacio — escanea un codigo de barras, busca un producto o usa "+ Venta libre"
            </div>
          ) : (
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
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {i.imagenUrl ? (
                          <img src={i.imagenUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#f3f4f6" }} />
                        )}
                        <div>
                          <div>
                            {i.nombre}
                            {i.esLibre && (
                              <span className="badge neutral" style={{ marginLeft: 6 }}>
                                Venta libre
                              </span>
                            )}
                          </div>
                          {i.stockSucursal !== undefined && i.cantidad > i.stockSucursal && (
                            <div style={{ fontSize: 11, color: "var(--warning)" }}>
                              Solo {i.stockSucursal} en stock
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button className="secondary" type="button" style={{ padding: "2px 8px" }} onClick={() => actualizarCantidad(i.productoId, i.cantidad - 1)}>
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={i.cantidad}
                          onChange={(e) => actualizarCantidad(i.productoId, Number(e.target.value))}
                          style={{ width: 44, textAlign: "center" }}
                        />
                        <button className="secondary" type="button" style={{ padding: "2px 8px" }} onClick={() => actualizarCantidad(i.productoId, i.cantidad + 1)}>
                          +
                        </button>
                      </div>
                    </td>
                    <td>${i.precioUnitario.toLocaleString("es-CO")}</td>
                    <td>${(i.cantidad * i.precioUnitario).toLocaleString("es-CO")}</td>
                    <td>
                      <button className="secondary" onClick={() => actualizarCantidad(i.productoId, 0)} type="button">
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {carrito.length > 0 && (
            <button className="secondary" type="button" style={{ marginTop: 12 }} onClick={guardarEnEspera}>
              Dejar en espera
            </button>
          )}
        </div>

        <div className="card" style={{ height: "fit-content" }}>
          <h3>Cobro</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>
            {totalUnidades} {totalUnidades === 1 ? "unidad" : "unidades"}
          </p>

          <label style={{ marginTop: 4 }}>
            Cliente (opcional)
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Sin cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {fidelizacionActiva ? ` (${c.puntos} pts)` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ marginTop: 10 }}>
            Metodo de pago
            <select
              value={metodoPago}
              onChange={(e) => {
                const valor = e.target.value as MetodoPago;
                setMetodoPago(valor);
              }}
              style={{ width: "100%" }}
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CREDITO">Credito (fiado)</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>

          {requiereCuenta &&
            (cuentas.length > 0 ? (
              <label style={{ marginTop: 10 }}>
                Cuenta que recibe el pago
                <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} style={{ width: "100%" }}>
                  <option value="">Sin especificar</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                Crea cuentas en <strong>"Cuentas bancarias"</strong> para registrar a que cuenta (Nequi, Bancolombia…)
                entra este pago y cuadrar la caja automaticamente.
              </p>
            ))}

          {puedeDescuentos && (
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 12.5 }}>Descuento</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={descuentoTipo} onChange={(e) => setDescuentoTipo(e.target.value as any)} style={{ width: 90 }}>
                  <option value="PORCENTAJE">%</option>
                  <option value="VALOR">$</option>
                </select>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={descuentoValor}
                  onChange={(e) => handleDescuentoChange(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          )}

          {fidelizacionActiva && clienteSeleccionado && clienteSeleccionado.puntos > 0 && (
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 12.5 }}>
                Canjear puntos (tiene {clienteSeleccionado.puntos}, valen ${((fidelizacion.valorPunto ?? 0) * clienteSeleccionado.puntos).toLocaleString("es-CO")})
              </label>
              <input
                type="number"
                min={0}
                max={clienteSeleccionado.puntos}
                placeholder="0"
                value={puntosARedimir}
                onChange={(e) => setPuntosARedimir(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 13.5 }}>
            {(montoDescuento > 0 || valorPuntos > 0) && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Subtotal</span>
                  <span>${subtotal.toLocaleString("es-CO")}</span>
                </div>
                {montoDescuento > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--success)" }}>
                    <span>Descuento</span>
                    <span>-${montoDescuento.toLocaleString("es-CO")}</span>
                  </div>
                )}
                {valorPuntos > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--success)" }}>
                    <span>Puntos ({puntosNum})</span>
                    <span>-${valorPuntos.toLocaleString("es-CO")}</span>
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
              <span style={{ fontWeight: 700 }}>TOTAL</span>
              <span style={{ fontSize: 26, fontWeight: 700 }}>${total.toLocaleString("es-CO")}</span>
            </div>
          </div>

          {metodoPago === "EFECTIVO" && (
            <div style={{ marginTop: 10 }}>
              <label>
                Dinero recibido
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={total.toFixed(2)}
                  value={dineroRecibido}
                  onChange={(e) => setDineroRecibido(e.target.value)}
                  style={{ width: "100%" }}
                />
              </label>
              {cambio !== null && (
                <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 700, color: cambio < 0 ? "var(--danger)" : "var(--success)" }}>
                  {cambio < 0
                    ? `Falta $${Math.abs(cambio).toLocaleString("es-CO")} para completar el pago`
                    : `Cambio: $${cambio.toLocaleString("es-CO")}`}
                </p>
              )}
            </div>
          )}

          {metodoPago !== "CREDITO" && !clienteId && (
            <div style={{ marginTop: 10 }}>
              <button type="button" className="secondary" style={{ width: "100%", fontSize: 12.5 }} onClick={() => setMostrarDatosCliente((v) => !v)}>
                {mostrarDatosCliente ? "Ocultar" : "+ Agregar"} datos del cliente (opcional)
              </button>
              {mostrarDatosCliente && (
                <div className="grid-form" style={{ marginTop: 8 }}>
                  <input placeholder="Nombre" value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} />
                  <input placeholder="Correo" type="email" value={contactoEmail} onChange={(e) => setContactoEmail(e.target.value)} />
                  <input placeholder="Celular" value={contactoCelular} onChange={(e) => setContactoCelular(e.target.value)} />
                  <input placeholder="Cedula" value={contactoCedula} onChange={(e) => setContactoCedula(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
          <button
            style={{ width: "100%", marginTop: 12 }}
            disabled={carrito.length === 0 || procesando || (cambio !== null && cambio < 0)}
            onClick={handleCobrarClick}
            type="button"
          >
            {procesando ? "Procesando..." : "Cobrar e imprimir"}
          </button>
        </div>
      </div>

      <ModalCredito
        mostrar={mostrarModalCredito}
        clienteId={clienteId}
        clientes={clientes}
        total={total}
        onConfirmar={(data) => {
          setMostrarModalCredito(false);
          setClienteId(data.clienteId);
          void cobrar(data);
        }}
        onCerrar={() => setMostrarModalCredito(false)}
      />

      {ventaExitosa && <VentaExitosaModal resultado={ventaExitosa} onCerrar={nuevaVenta} />}

      {mostrarVentaLibre && (
        <div className="modal-backdrop">
          <div className="card" style={{ width: 460, maxWidth: "94vw" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ background: "#f5a623", color: "#fff", borderRadius: 5, padding: "3px 10px", fontWeight: 700, fontSize: 13 }}>Venta libre</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Producto express · sin inventario</span>
            </div>
            <p style={{ marginTop: 0, marginBottom: 14, fontSize: 12.5, color: "var(--text-muted)" }}>
              Cobra cualquier producto o servicio que no esta cargado en el sistema. Solo genera el recibo — no mueve stock.
            </p>
            <form className="grid-form" onSubmit={agregarVentaLibre}>
              <label>
                Descripcion o concepto
                <input
                  value={libreDescripcion}
                  onChange={(e) => setLibreDescripcion(e.target.value)}
                  placeholder="Ej. Arreglo de prenda, domicilio..."
                  required
                  autoFocus
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  Valor
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={libreValor}
                    onChange={(e) => setLibreValor(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Cantidad
                  <input type="number" min={1} value={libreCantidad} onChange={(e) => setLibreCantidad(e.target.value)} />
                </label>
              </div>
              <label>
                Observaciones (opcional)
                <textarea rows={2} value={libreObservaciones} onChange={(e) => setLibreObservaciones(e.target.value)} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit">Agregar al carrito</button>
                <button type="button" className="secondary" onClick={() => setMostrarVentaLibre(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de clave de descuento */}
      {mostrarModalClaveDescuento && (
        <div className="modal-backdrop" onClick={() => setMostrarModalClaveDescuento(false)}>
          <div className="card" style={{ width: 340 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Autorización requerida</h3>
            <p>Este usuario necesita ingresar la clave de autorización para aplicar descuentos.</p>
            <input
              type="password"
              placeholder="Ingresa la clave"
              value={claveDescuentoIngresada}
              onChange={(e) => setClaveDescuentoIngresada(e.target.value)}
              autoFocus
              style={{ width: "100%", marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  const config = await electronAPI.getConfig();
                  if (claveDescuentoIngresada === config.descuentosClave) {
                    setMostrarModalClaveDescuento(false);
                    setClaveDescuentoIngresada("");
                  } else {
                    setError("Clave incorrecta. Intenta de nuevo.");
                    setClaveDescuentoIngresada("");
                  }
                }}
                style={{ flex: 1 }}
              >
                Confirmar
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setMostrarModalClaveDescuento(false);
                  setDescuentoValor("");
                  setClaveDescuentoIngresada("");
                  setError(null);
                }}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VentaExitosaModal({ resultado, onCerrar }: { resultado: ResultadoVenta; onCerrar: () => void }) {
  useEffect(() => {
    const t = setTimeout(onCerrar, 4500);
    return () => clearTimeout(t);
  }, [onCerrar]);

  return (
    <div className="modal-backdrop" onClick={onCerrar}>
      <div className="card venta-exitosa" style={{ width: 340, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div className="check-circle">
          <svg viewBox="0 0 52 52" width="56" height="56">
            <circle className="check-circle-bg" cx="26" cy="26" r="25" fill="none" />
            <path className="check-mark" fill="none" d="M14 27l7 7 16-16" />
          </svg>
        </div>
        <h3 style={{ margin: "12px 0 2px" }}>¡Venta exitosa!</h3>
        <p style={{ fontSize: 26, fontWeight: 700, margin: "4px 0" }}>${resultado.total.toLocaleString("es-CO")}</p>
        {resultado.metodoPago === "EFECTIVO" && resultado.cambio !== null && resultado.cambio > 0 && (
          <p style={{ fontSize: 16, fontWeight: 600, color: "var(--success)", margin: "0 0 4px" }}>
            Cambio: ${resultado.cambio.toLocaleString("es-CO")}
          </p>
        )}
        {resultado.puntosGanados > 0 && (
          <p style={{ fontSize: 13, color: "var(--brand)", margin: "0 0 4px" }}>+{resultado.puntosGanados} puntos</p>
        )}
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
          {resultado.sincronizada ? `Comprobante No. ${resultado.consecutivo} · ${resultado.metodoPago}` : "Guardada localmente, se sincronizara sola"}
        </p>
        <button style={{ width: "100%" }} onClick={onCerrar} type="button">
          Nueva venta
        </button>
      </div>
    </div>
  );
}
