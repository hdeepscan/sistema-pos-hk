import { prisma } from "./prisma.js";
import {
  alicuotaPara,
  alicuotasDe,
  credencialesDe,
  ErrorTFactura,
  leerResultado,
  llamarTFactura,
} from "./tfactura.js";

// Paquetes de facturación electrónica y emisión de comprobantes.
//
// - Se venden paquetes mensuales de 50 y 100 facturas (y recargas de 10). Se pagan con Wompi y al
//   aprobarse el pago se cargan solos.
// - Cada paquete dura 30 días; lo que sobra se puede usar 1 mes más (venceEn = compra + 60 días).
// - Se gasta primero el paquete que vence antes.
// - Cada factura o nota crédito descuenta 1. Si TFactura la rechaza de forma definitiva, se devuelve.

export const PAQUETES = {
  P50: { nombre: "Paquete 50 facturas", cantidad: 50, precio: 39_900 },
  P100: { nombre: "Paquete 100 facturas", cantidad: 100, precio: 69_900 },
  RECARGA10: { nombre: "Recarga 10 facturas", cantidad: 10, precio: 12_900 },
} as const;
export type TipoPaquete = keyof typeof PAQUETES;

const DIA_MS = 24 * 60 * 60_000;
const DIAS_PERIODO = 30;
const DIAS_EXTRA = 30;
export const DIAS_AVISO_RENOVACION = 5;

export async function saldoFacturacion(empresaId: string) {
  const ahora = new Date();
  const paquetes = await prisma.paqueteFacturacion.findMany({
    where: { empresaId, venceEn: { gt: ahora } },
    orderBy: { venceEn: "asc" },
  });
  const disponibles = paquetes.reduce((acc, p) => acc + Math.max(0, p.cantidad - p.usadas), 0);
  // El periodo vigente es el del paquete mensual más reciente.
  const mensuales = paquetes.filter((p) => p.tipo === "P50" || p.tipo === "P100").sort((a, b) => +b.periodoHasta - +a.periodoHasta);
  const periodoHasta = mensuales[0]?.periodoHasta ?? null;
  const conSaldo = paquetes.filter((p) => p.cantidad > p.usadas);
  const proximoVencimiento = conSaldo[0]?.venceEn ?? null;
  const diasParaRenovar = periodoHasta ? Math.ceil((+periodoHasta - +ahora) / DIA_MS) : null;
  return {
    disponibles,
    periodoHasta,
    diasParaRenovar,
    renovarPronto: diasParaRenovar !== null && diasParaRenovar <= DIAS_AVISO_RENOVACION,
    proximoVencimiento,
    paquetes: paquetes.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      cantidad: p.cantidad,
      usadas: p.usadas,
      disponibles: Math.max(0, p.cantidad - p.usadas),
      periodoHasta: p.periodoHasta,
      venceEn: p.venceEn,
      creadoEn: p.creadoEn,
    })),
  };
}

/** Carga un paquete pagado. Idempotente por referencia de pago. */
export async function acreditarPaquete(empresaId: string, tipo: TipoPaquete, referenciaPago: string, precio: number) {
  const ya = await prisma.paqueteFacturacion.findUnique({ where: { referenciaPago } });
  if (ya) return ya;
  const def = PAQUETES[tipo];
  const ahora = Date.now();
  let periodoHasta = new Date(ahora + DIAS_PERIODO * DIA_MS);
  let venceEn = new Date(ahora + (DIAS_PERIODO + DIAS_EXTRA) * DIA_MS);
  if (tipo === "RECARGA10") {
    // La recarga acompaña al paquete del mes: vence cuando vence lo del paquete vigente (mínimo 30 días).
    const vigente = await prisma.paqueteFacturacion.findFirst({
      where: { empresaId, tipo: { in: ["P50", "P100"] }, venceEn: { gt: new Date() } },
      orderBy: { venceEn: "desc" },
    });
    if (vigente && +vigente.venceEn > +periodoHasta) {
      venceEn = vigente.venceEn;
      periodoHasta = vigente.periodoHasta;
    } else {
      venceEn = periodoHasta;
    }
  }
  return prisma.paqueteFacturacion.create({
    data: { empresaId, tipo, cantidad: def.cantidad, precio, referenciaPago, periodoHasta, venceEn },
  });
}

/** Toma 1 factura del paquete que vence primero. Devuelve el id del paquete o null si no hay saldo. */
export async function consumirFactura(empresaId: string): Promise<string | null> {
  // Reintento optimista: si dos cajas toman la misma factura a la vez, una vuelve a intentar.
  for (let intento = 0; intento < 50; intento++) {
    const paquetes = await prisma.paqueteFacturacion.findMany({
      where: { empresaId, venceEn: { gt: new Date() } },
      orderBy: { venceEn: "asc" },
    });
    const p = paquetes.find((x) => x.usadas < x.cantidad);
    if (!p) return null;
    // Solo si nadie más tomó la última factura de este paquete al mismo tiempo.
    const r = await prisma.paqueteFacturacion.updateMany({
      where: { id: p.id, usadas: p.usadas },
      data: { usadas: { increment: 1 } },
    });
    if (r.count === 1) return p.id;
  }
  return null;
}

export async function devolverFactura(paqueteId: string | null) {
  if (!paqueteId) return;
  await prisma.paqueteFacturacion.updateMany({
    where: { id: paqueteId, usadas: { gt: 0 } },
    data: { usadas: { decrement: 1 } },
  });
}

// ---------- Emisión ----------

export class ErrorFacturacion extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/**
 * Pide la factura electrónica de una venta: toma 1 del paquete y la deja en cola. Se envía a
 * TFactura en segundo plano (y se reintenta si TFactura no responde).
 */
export async function solicitarFacturaVenta(
  empresaId: string,
  ventaId: string,
  opciones: { enviarAConversacionId?: string } = {}
) {
  const venta = await prisma.venta.findFirst({ where: { id: ventaId, empresaId }, select: { id: true } });
  if (!venta) throw new ErrorFacturacion("Venta no encontrada", 404);

  const existente = await prisma.comprobanteElectronico.findFirst({
    where: { ventaId, tipo: "FACTURA", estado: { not: "ERROR" } },
  });
  if (existente) {
    // Ya estaba pedida: si se pidió enviarla por el chat, se envía apenas quede emitida.
    if (opciones.enviarAConversacionId && existente.estado !== "EMITIDA") {
      return prisma.comprobanteElectronico.update({
        where: { id: existente.id },
        data: { enviarAConversacionId: opciones.enviarAConversacionId },
      });
    }
    return existente;
  }

  const config = await prisma.facturacionConfig.findUnique({ where: { empresaId } });
  if (!config?.activo) {
    throw new ErrorFacturacion("Primero conecta tu cuenta de TFactura en Facturación electrónica");
  }

  // Si ya hubo un intento fallido, se reintenta ese mismo comprobante (sin gastar otra factura).
  const fallido = await prisma.comprobanteElectronico.findFirst({
    where: { ventaId, tipo: "FACTURA", estado: "ERROR" },
    orderBy: { creadoEn: "desc" },
  });
  let paqueteId = fallido?.paqueteId ?? null;
  if (!paqueteId) {
    paqueteId = await consumirFactura(empresaId);
    if (!paqueteId) {
      throw new ErrorFacturacion("Se acabaron las facturas electrónicas. Compra una recarga para seguir facturando.", 402);
    }
  }

  const comprobante = fallido
    ? await prisma.comprobanteElectronico.update({
        where: { id: fallido.id },
        data: {
          estado: "PENDIENTE",
          paqueteId,
          proximoIntento: new Date(),
          ultimoError: null,
          intentos: 0,
          ...(opciones.enviarAConversacionId ? { enviarAConversacionId: opciones.enviarAConversacionId } : {}),
        },
      })
    : await prisma.comprobanteElectronico.create({
        data: { empresaId, ventaId, tipo: "FACTURA", paqueteId, enviarAConversacionId: opciones.enviarAConversacionId ?? null },
      });
  void procesarComprobante(comprobante.id);
  return comprobante;
}

/** Tras una devolución: si la venta ya tenía factura electrónica, se hace la nota crédito. */
export async function programarNotaCredito(empresaId: string, ventaId: string, devolucionId: string) {
  const factura = await prisma.comprobanteElectronico.findFirst({
    where: { ventaId, tipo: "FACTURA", estado: { in: ["EMITIDA", "ENVIANDO"] } },
  });
  if (!factura) return null;
  const paqueteId = await consumirFactura(empresaId);
  const nota = await prisma.comprobanteElectronico.create({
    data: { empresaId, ventaId, devolucionId, tipo: "NOTA_CREDITO", paqueteId },
  });
  void procesarComprobante(nota.id);
  return nota;
}

const TIPO_DOC_CONSUMIDOR_FINAL = 3; // cédula de ciudadanía
const DOC_CONSUMIDOR_FINAL = "222222222222";

function datosCliente(cliente: {
  id: string;
  nombre: string;
  cedula: string | null;
  email: string | null;
  direccion: string | null;
  tipoDocumento: number | null;
  tipoPersona: number | null;
  categoriaImpositiva: string | null;
} | null) {
  const documento = cliente?.cedula?.replace(/[^\dA-Za-z-]/g, "") ?? "";
  if (!cliente || !documento) {
    return {
      ClienteCodigo: "CF",
      ClienteNombre: "Consumidor final",
      ClienteTipoDocumento: TIPO_DOC_CONSUMIDOR_FINAL,
      ClienteNumeroDocumento: DOC_CONSUMIDOR_FINAL,
      CategoriaImpositivaCodigo: "ZZ",
      ClienteTipoOrganizacion: 2,
      ...(cliente?.email ? { ClienteEmail: cliente.email } : {}),
    };
  }
  const tipoDocumento = cliente.tipoDocumento ?? (/^\d{9,10}-?\d?$/.test(documento) && documento.includes("-") ? 6 : 3);
  const esNit = tipoDocumento === 6;
  // El NIT va sin dígito de verificación en el código del cliente.
  const codigo = documento.split("-")[0].replace(/\D/g, "").slice(-10) || cliente.id.slice(0, 10);
  return {
    ClienteCodigo: codigo,
    ClienteNombre: cliente.nombre,
    ClienteTipoDocumento: tipoDocumento,
    ClienteNumeroDocumento: esNit ? documento : documento.replace(/\D/g, "") || documento,
    CategoriaImpositivaCodigo: cliente.categoriaImpositiva || (esNit ? "99" : "ZZ"),
    ClienteTipoOrganizacion: cliente.tipoPersona ?? (esNit ? 1 : 2),
    ...(cliente.email ? { ClienteEmail: cliente.email } : {}),
    ...(cliente.direccion ? { ClienteDireccion: cliente.direccion } : {}),
  };
}

interface Linea {
  codigo: string;
  nombre: string;
  cantidad: number;
  precioConIva: number;
  iva: number;
}

function redondear(n: number, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

async function detalles(
  empresaId: string,
  credenciales: Awaited<ReturnType<typeof credencialesDe>>,
  lineas: Linea[],
  factorPago: number,
  preciosIncluyenIva: boolean
) {
  const alicuotas = await alicuotasDe(empresaId, credenciales!);
  const bonificacion = redondear(Math.max(0, Math.min(100, (1 - factorPago) * 100)), 4);
  return lineas.map((l) => {
    const alicuota = alicuotaPara(alicuotas, l.iva);
    if (!alicuota && l.iva > 0) {
      throw new ErrorTFactura(`TFactura no tiene configurado el IVA del ${l.iva}%`, false);
    }
    const precio = preciosIncluyenIva ? l.precioConIva / (1 + l.iva / 100) : l.precioConIva;
    return {
      ProductoCodigo: l.codigo.slice(0, 30),
      ProductoNombre: l.nombre.slice(0, 200),
      Cantidad: l.cantidad,
      Precio: redondear(precio, 4),
      Bonificacion: bonificacion,
      DetalleAlicuotas: alicuota
        ? [
            {
              AlicuotaCodigo: alicuota.AlicuotaCodigo,
              AlicuotaPorcentaje: alicuota.AlicuotaPorcentaje,
              ...(alicuota.ImpuestoID != null ? { ImpuestoID: alicuota.ImpuestoID } : {}),
            },
          ]
        : [],
    };
  });
}

const enCurso = new Set<string>();
const ESPERAS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
const MAX_INTENTOS = ESPERAS_MS.length + 1;

/** Envía un comprobante a TFactura. Si falla por la red se reintenta más tarde. */
export async function procesarComprobante(comprobanteId: string): Promise<void> {
  if (enCurso.has(comprobanteId)) return;
  enCurso.add(comprobanteId);
  try {
    const tomado = await prisma.comprobanteElectronico.updateMany({
      where: { id: comprobanteId, estado: "PENDIENTE" },
      data: { estado: "ENVIANDO", intentos: { increment: 1 } },
    });
    if (tomado.count === 0) return;
    const c = await prisma.comprobanteElectronico.findUniqueOrThrow({ where: { id: comprobanteId } });

    try {
      const resultado = c.tipo === "FACTURA" ? await enviarFactura(c.empresaId, c.ventaId) : await enviarNotaCredito(c);
      await prisma.comprobanteElectronico.update({
        where: { id: c.id },
        data: {
          estado: "EMITIDA",
          movimientoId: resultado.movimientoId,
          numero: resultado.numero,
          cufe: resultado.cufe,
          urlPdf: resultado.urlPdf,
          total: resultado.total,
          emitidaEn: new Date(),
          ultimoError: null,
        },
      });
      // Pedida desde el chat: se le envía el PDF al cliente apenas la DIAN la aprueba.
      if (c.enviarAConversacionId && c.tipo === "FACTURA") {
        const { enviarFacturaChat } = await import("./mensajeria-modulos.js");
        await enviarFacturaChat(c.empresaId, c.id, c.enviarAConversacionId).catch((err) =>
          console.error(`[facturacion] Factura emitida, pero no se pudo enviar por el chat: ${err instanceof Error ? err.message : err}`)
        );
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      const reintentable = err instanceof ErrorTFactura ? err.reintentable : false;
      const esperando = c.tipo === "NOTA_CREDITO" && mensaje === ESPERA_FACTURA;
      if ((reintentable || esperando) && c.intentos < MAX_INTENTOS) {
        await prisma.comprobanteElectronico.update({
          where: { id: c.id },
          data: {
            estado: "PENDIENTE",
            ultimoError: mensaje,
            proximoIntento: new Date(Date.now() + ESPERAS_MS[Math.min(c.intentos - 1, ESPERAS_MS.length - 1)]),
          },
        });
      } else {
        // Rechazo definitivo: se devuelve la factura al paquete.
        await prisma.comprobanteElectronico.update({
          where: { id: c.id },
          data: { estado: "ERROR", ultimoError: mensaje, paqueteId: null },
        });
        await devolverFactura(c.paqueteId);
      }
      console.error(`[facturacion] ${c.tipo} ${c.id.slice(0, 8)} (venta ${c.ventaId.slice(0, 8)}): ${mensaje}`);
    }
  } finally {
    enCurso.delete(comprobanteId);
  }
}

async function enviarFactura(empresaId: string, ventaId: string) {
  const credenciales = await credencialesDe(empresaId);
  if (!credenciales) throw new ErrorTFactura("La cuenta de TFactura no está conectada", false);
  const config = await prisma.facturacionConfig.findUniqueOrThrow({ where: { empresaId } });
  const venta = await prisma.venta.findUniqueOrThrow({
    where: { id: ventaId },
    include: {
      cliente: true,
      items: { include: { producto: { select: { sku: true, nombre: true, varianteTitulo: true, impuestoPorcentaje: true } } } },
    },
  });

  const lineas: Linea[] = venta.items
    .map((i) => ({
      codigo: i.producto?.sku ?? "LIBRE",
      nombre: i.producto
        ? i.producto.varianteTitulo
          ? `${i.producto.nombre} (${i.producto.varianteTitulo})`
          : i.producto.nombre
        : i.descripcionLibre || "Venta libre",
      cantidad: i.cantidad - i.cantidadDevuelta,
      precioConIva: Number(i.precioUnitario),
      iva: Number(i.producto?.impuestoPorcentaje ?? 0),
    }))
    .filter((l) => l.cantidad > 0);
  if (lineas.length === 0) throw new ErrorTFactura("La venta no tiene productos para facturar (se devolvió todo)", false);

  // Descuentos y puntos: lo que pagó el cliente frente a la suma de los precios.
  const suma = lineas.reduce((acc, l) => acc + l.cantidad * l.precioConIva, 0);
  const factor = suma > 0 ? Math.min(1, Number(venta.total) / suma) : 1;

  const data = await llamarTFactura(empresaId, credenciales, "CrearFactura", {
    ...datosCliente(venta.cliente),
    Observacion: `Venta CENTRALA #${venta.consecutivo}`,
    DetallesMovimiento: await detalles(empresaId, credenciales, lineas, factor, config.preciosIncluyenIva),
  });
  return leerResultado(data);
}

const ESPERA_FACTURA = "Esperando a que se emita la factura de la venta";

async function enviarNotaCredito(c: { empresaId: string; ventaId: string; devolucionId: string | null }) {
  const credenciales = await credencialesDe(c.empresaId);
  if (!credenciales) throw new ErrorTFactura("La cuenta de TFactura no está conectada", false);
  const config = await prisma.facturacionConfig.findUniqueOrThrow({ where: { empresaId: c.empresaId } });
  const factura = await prisma.comprobanteElectronico.findFirst({
    where: { ventaId: c.ventaId, tipo: "FACTURA", estado: "EMITIDA" },
  });
  if (!factura?.movimientoId) throw new ErrorTFactura(ESPERA_FACTURA, true);

  const venta = await prisma.venta.findUniqueOrThrow({
    where: { id: c.ventaId },
    include: { cliente: true, items: { include: { producto: { select: { sku: true, impuestoPorcentaje: true } } } } },
  });
  const devolucion = c.devolucionId
    ? await prisma.devolucionVenta.findUnique({ where: { id: c.devolucionId } })
    : null;

  // Si se devolvió todo, la nota crédito anula la factura completa.
  const todoDevuelto = venta.items.every((i) => i.cantidadDevuelta >= i.cantidad);
  if (todoDevuelto || !devolucion) {
    const data = await llamarTFactura(c.empresaId, credenciales, "CrearCredito", { MovimientoId: factura.movimientoId });
    return leerResultado(data);
  }

  const detalle: { productoId: string; nombre: string; cantidad: number; precioUnitario: number }[] = JSON.parse(
    devolucion.detalle
  );
  const lineas: Linea[] = detalle.map((d) => {
    const item = venta.items.find((i) => i.productoId === d.productoId);
    return {
      codigo: item?.producto?.sku ?? "DEV",
      nombre: d.nombre,
      cantidad: d.cantidad,
      precioConIva: d.precioUnitario,
      iva: Number(item?.producto?.impuestoPorcentaje ?? 0),
    };
  });
  const data = await llamarTFactura(c.empresaId, credenciales, "CrearCreditoACuenta", {
    ...datosCliente(venta.cliente),
    Observacion: `Devolución de la venta CENTRALA #${venta.consecutivo} (factura ${factura.numero ?? factura.movimientoId})`,
    DetallesMovimiento: await detalles(c.empresaId, credenciales, lineas, 1, config.preciosIncluyenIva),
  });
  return leerResultado(data);
}

// ---------- Reintentos en segundo plano ----------

let timer: ReturnType<typeof setInterval> | undefined;

async function revisarPendientes() {
  // Comprobantes que quedaron "ENVIANDO" por un reinicio del servidor vuelven a la cola.
  await prisma.comprobanteElectronico.updateMany({
    where: { estado: "ENVIANDO", actualizadoEn: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { estado: "PENDIENTE" },
  });
  const pendientes = await prisma.comprobanteElectronico.findMany({
    where: { estado: "PENDIENTE", proximoIntento: { lte: new Date() } },
    orderBy: { creadoEn: "asc" },
    take: 20,
    select: { id: true },
  });
  for (const p of pendientes) await procesarComprobante(p.id);
}

export function iniciarFacturacionElectronica() {
  if (timer) return;
  timer = setInterval(() => {
    revisarPendientes().catch((err) => console.error("[facturacion] Error revisando pendientes:", err));
  }, 60_000);
}
