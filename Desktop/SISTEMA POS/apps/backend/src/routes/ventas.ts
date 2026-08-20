import type { FastifyInstance } from "fastify";
import { CrearVentaSchema, DevolucionParcialSchema } from "@sistema-pos/shared";
import type { MetodoPago, CanalVenta } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { emitInventarioActualizado, emitVentaCreada } from "../lib/ws.js";
import { ajustarInventarioEnShopifySiCorresponde } from "../lib/shopify.js";
import { enviarEventoCompraAMeta } from "../lib/meta.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

const MS_DIA = 24 * 60 * 60 * 1000;

// Busca un cliente existente por cedula, email o telefono; si no existe y hay
// al menos un dato util, lo crea. Se usa para capturar datos de contacto en
// cualquier venta sin obligar a elegir un cliente de una lista.
async function encontrarOCrearCliente(
  empresaId: string,
  contacto: { nombre?: string; email?: string; telefono?: string; cedula?: string }
): Promise<string | undefined> {
  const { nombre, email, telefono, cedula } = contacto;
  if (!nombre && !email && !telefono && !cedula) return undefined;

  const existente = await prisma.cliente.findFirst({
    where: {
      empresaId,
      OR: [
        cedula ? { cedula } : undefined,
        email ? { email } : undefined,
        telefono ? { telefono } : undefined,
      ].filter(Boolean) as object[],
    },
  });
  if (existente) return existente.id;

  const nuevo = await prisma.cliente.create({
    data: {
      empresaId,
      nombre: nombre || "Cliente sin nombre",
      email: email || undefined,
      telefono: telefono || undefined,
      cedula: cedula || undefined,
    },
  });
  return nuevo.id;
}

export async function ventasRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/ventas", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("ventas.ver")) {
      return reply.code(403).send({ error: "No tienes permiso para ver las ventas" });
    }
    const { sucursalId, desde, hasta, montoMin, montoMax, clienteId, usuarioId, metodoPago, canal, limit } =
      request.query as {
        sucursalId?: string;
        desde?: string;
        hasta?: string;
        montoMin?: string;
        montoMax?: string;
        clienteId?: string;
        usuarioId?: string;
        metodoPago?: string;
        canal?: string;
        limit?: string;
      };
    return prisma.venta.findMany({
      where: {
        empresaId,
        ...(sucursalId ? { sucursalId } : {}),
        ...(clienteId ? { clienteId } : {}),
        ...(usuarioId ? { usuarioId } : {}),
        ...(metodoPago ? { metodoPago: metodoPago as MetodoPago } : {}),
        ...(canal ? { canal: canal as CanalVenta } : {}),
        ...(desde || hasta
          ? {
              fecha: {
                ...(desde ? { gte: new Date(desde) } : {}),
                ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999`) } : {}),
              },
            }
          : {}),
        ...(montoMin || montoMax
          ? {
              total: {
                ...(montoMin ? { gte: Number(montoMin) } : {}),
                ...(montoMax ? { lte: Number(montoMax) } : {}),
              },
            }
          : {}),
      },
      include: {
        items: { include: { producto: { select: { nombre: true, sku: true, imagenUrl: true, costo: true } } } },
        cliente: { select: { nombre: true } },
        usuario: { select: { id: true, nombre: true } },
        devoluciones: { orderBy: { fecha: "desc" } },
      },
      orderBy: { fecha: "desc" },
      take: Math.min(Number(limit) || 200, 5000),
    });
  });

  // Endpoint para obtener los totales de ventas separados en Real (dinero recibido) y Cartera (créditos pendientes)
  app.get("/ventas/totales-resumen", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("ventas.ver")) {
      return reply.code(403).send({ error: "No tienes permiso para ver las ventas" });
    }

    const { sucursalId, desde, hasta, montoMin, montoMax, clienteId, usuarioId, metodoPago, canal } =
      request.query as {
        sucursalId?: string;
        desde?: string;
        hasta?: string;
        montoMin?: string;
        montoMax?: string;
        clienteId?: string;
        usuarioId?: string;
        metodoPago?: string;
        canal?: string;
      };

    // Construir el filtro base (mismo que en GET /ventas)
    const filtroBase = {
      empresaId,
      ...(sucursalId ? { sucursalId } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(usuarioId ? { usuarioId } : {}),
      ...(metodoPago ? { metodoPago: metodoPago as MetodoPago } : {}),
      ...(canal ? { canal: canal as CanalVenta } : {}),
      ...(desde || hasta
        ? {
            fecha: {
              ...(desde ? { gte: new Date(desde) } : {}),
              ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999`) } : {}),
            },
          }
        : {}),
      ...(montoMin || montoMax
        ? {
            total: {
              ...(montoMin ? { gte: Number(montoMin) } : {}),
              ...(montoMax ? { lte: Number(montoMax) } : {}),
            },
          }
        : {}),
    };

    // 1. Obtener ventas no-crédito (EFECTIVO, TARJETA, TRANSFERENCIA, OTRO) en el rango
    const ventasNoCredito = await prisma.venta.findMany({
      where: {
        ...filtroBase,
        metodoPago: { not: "CREDITO" },
      },
      select: { total: true },
    });

    // 2. Obtener abonos en el rango de fechas (dinero real recibido)
    const abonos = await prisma.abono.findMany({
      where: {
        cliente: { empresaId },
        ...(desde || hasta
          ? {
              fecha: {
                ...(desde ? { gte: new Date(desde) } : {}),
                ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999`) } : {}),
              },
            }
          : {}),
      },
      select: { monto: true },
    });

    // 3. Obtener ventas a crédito para calcular cartera pendiente
    const ventasCredito = await prisma.venta.findMany({
      where: {
        ...filtroBase,
        metodoPago: "CREDITO",
      },
      include: { cliente: { select: { id: true } } },
      orderBy: { fecha: "asc" },
    });

    // 4. Obtener todos los abonos del cliente para calcular pendientes correctamente
    // (necesitamos TODOS los abonos para aplicar FIFO, no solo los del rango)
    const abonosPorClienteTodos = await prisma.abono.groupBy({
      by: ["clienteId"],
      where: { cliente: { empresaId } },
      _sum: { monto: true },
    });

    // Calcular los totales
    const totalReal = ventasNoCredito.reduce((acc, v) => acc + Number(v.total), 0) + abonos.reduce((acc, a) => acc + Number(a.monto), 0);

    // Para cartera: aplicar abonos FIFO a créditos (como en creditos.ts)
    const poolAbonos = new Map(abonosPorClienteTodos.map((a) => [a.clienteId, Number(a._sum.monto ?? 0)]));
    let totalCartera = 0;

    for (const venta of ventasCredito) {
      const total = Number(venta.total);
      const disponible = poolAbonos.get(venta.cliente?.id) ?? 0;
      const aplicado = Math.min(disponible, total);
      poolAbonos.set(venta.cliente?.id, disponible - aplicado);
      const pendiente = Math.round((total - aplicado) * 100) / 100;
      totalCartera += pendiente;
    }

    return {
      totalReal: Math.round(totalReal * 100) / 100,
      totalCartera: Math.round(totalCartera * 100) / 100,
    };
  });

  // Idempotente por clienteUuid: si el POS reintenta una venta ya sincronizada
  // (por ejemplo tras recuperar conexion), devuelve la venta existente.
  app.post("/ventas", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("ventas.crear")) {
      return reply.code(403).send({ error: "No tienes permiso para registrar ventas" });
    }
    const parsed = CrearVentaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    }
    const { clienteUuid, sucursalId, contactoCliente, metodoPago, cuentaBancariaId, items, dineroRecibido, descuento, puntosARedimir, observaciones, numeroCuotas, plazoMeses } =
      parsed.data;
    let { clienteId } = parsed.data;

    // Items del inventario vs items de "venta libre" (sin producto): estos
    // ultimos no validan ni descuentan stock.
    const itemsProducto = items.filter((i): i is typeof i & { productoId: string } => !!(i.productoId && i.productoId.trim() && !i.productoId.startsWith("libre-")));
    const hayVentaLibre = items.some((i) => !i.productoId || i.productoId.startsWith("libre-"));

    if (metodoPago === "CREDITO" && !clienteId) {
      return reply.code(400).send({ error: "Una venta a credito requiere seleccionar un cliente" });
    }

    const existente = await prisma.venta.findUnique({
      where: { clienteUuid },
      include: { items: true },
    });
    if (existente) {
      return reply.code(200).send(existente);
    }

    const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    if (!sucursal) return reply.code(404).send({ error: "Sucursal no encontrada" });

    if (clienteId) {
      const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
      if (!cliente) return reply.code(404).send({ error: "Cliente no encontrado" });
    } else if (contactoCliente) {
      clienteId = await encontrarOCrearCliente(empresaId, contactoCliente);
    }

    // Si el pago no es en efectivo ni a credito, se puede indicar a que cuenta
    // bancaria entro (para cuadrar la caja por cuenta).
    if (cuentaBancariaId) {
      const cuenta = await prisma.cuentaBancaria.findFirst({ where: { id: cuentaBancariaId, empresaId } });
      if (!cuenta) return reply.code(404).send({ error: "Cuenta bancaria no encontrada" });
    }

    const productoIds = itemsProducto.map((i) => i.productoId);
    const [inventarios, productosDb] = await Promise.all([
      prisma.inventarioSucursal.findMany({ where: { sucursalId, productoId: { in: productoIds } } }),
      prisma.producto.findMany({
        where: { id: { in: productoIds }, empresaId },
        select: { id: true, nombre: true, impuestoPorcentaje: true },
      }),
    ]);
    const stockPorProducto = new Map(inventarios.map((i) => [i.productoId, i.cantidad]));
    const impuestoPorProducto = new Map(productosDb.map((p) => [p.id, Number(p.impuestoPorcentaje)]));
    const nombrePorProducto = new Map(productosDb.map((p) => [p.id, p.nombre]));
    const puedeVenderSinStock = request.user.permisos.includes("ventas.sin_stock");
    for (const item of itemsProducto) {
      const disponible = stockPorProducto.get(item.productoId) ?? 0;
      if (disponible < item.cantidad && !puedeVenderSinStock) {
        const nombre = nombrePorProducto.get(item.productoId) ?? item.productoId;
        return reply.code(409).send({ error: `No hay existencias disponibles para: ${nombre}` });
      }
    }

    const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);

    // Descuento manual: requiere permiso; se guarda ya convertido a pesos.
    let montoDescuento = 0;
    if (descuento) {
      if (!request.user.permisos.includes("descuentos.aplicar")) {
        return reply.code(403).send({ error: "No tienes permiso para aplicar descuentos" });
      }
      montoDescuento =
        descuento.tipo === "PORCENTAJE" ? (subtotal * descuento.valor) / 100 : descuento.valor;
      montoDescuento = Math.min(Math.round(montoDescuento * 100) / 100, subtotal);
    }

    // Canje de puntos de fidelizacion.
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { diasVencimientoCredito: true, pesosPorPunto: true, valorPunto: true },
    });
    let valorPuntosRedimidos = 0;
    if (puntosARedimir && puntosARedimir > 0) {
      if (!clienteId) {
        return reply.code(400).send({ error: "Selecciona un cliente para canjear puntos" });
      }
      const valorPunto = empresa?.valorPunto ? Number(empresa.valorPunto) : 0;
      if (valorPunto <= 0) {
        return reply.code(400).send({ error: "El programa de puntos no esta configurado" });
      }
      const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { puntos: true } });
      if (!cliente || cliente.puntos < puntosARedimir) {
        return reply.code(400).send({ error: "El cliente no tiene suficientes puntos" });
      }
      valorPuntosRedimidos = Math.min(puntosARedimir * valorPunto, subtotal - montoDescuento);
    }

    const total = Math.max(0, Math.round((subtotal - montoDescuento - valorPuntosRedimidos) * 100) / 100);

    // IVA contenido en el total (los precios incluyen IVA). Se calcula por
    // producto y se escala proporcionalmente si hubo descuentos/puntos.
    let impuestoBruto = 0;
    for (const item of itemsProducto) {
      const iva = impuestoPorProducto.get(item.productoId) ?? 0;
      if (iva > 0) {
        const lineaBruta = item.cantidad * item.precioUnitario;
        impuestoBruto += (lineaBruta * iva) / (100 + iva);
      }
    }
    const factorDescuento = subtotal > 0 ? total / subtotal : 1;
    const impuestoTotal = Math.round(impuestoBruto * factorDescuento * 100) / 100;

    if (metodoPago === "EFECTIVO" && dineroRecibido !== undefined && dineroRecibido < total) {
      return reply.code(400).send({ error: "El dinero recibido es menor al total de la venta" });
    }
    const cambio = metodoPago === "EFECTIVO" && dineroRecibido !== undefined ? dineroRecibido - total : undefined;

    let fechaVencimientoCredito: Date | undefined;
    if (metodoPago === "CREDITO") {
      if (plazoMeses) {
        fechaVencimientoCredito = new Date(Date.now() + plazoMeses * 30 * MS_DIA);
      } else {
        const dias = empresa?.diasVencimientoCredito ?? 20;
        fechaVencimientoCredito = new Date(Date.now() + dias * MS_DIA);
      }
    }

    // Acumulacion de puntos sobre el total final pagado.
    const pesosPorPunto = empresa?.pesosPorPunto ? Number(empresa.pesosPorPunto) : 0;
    const puntosGanados = clienteId && pesosPorPunto > 0 ? Math.floor(total / pesosPorPunto) : 0;

    const venta = await prisma.$transaction(async (tx) => {
      const ultima = await tx.venta.findFirst({
        where: { empresaId },
        orderBy: { consecutivo: "desc" },
        select: { consecutivo: true },
      });
      const consecutivo = (ultima?.consecutivo ?? 0) + 1;

      const venta = await tx.venta.create({
        data: {
          clienteUuid,
          empresaId,
          sucursalId,
          usuarioId,
          clienteId,
          consecutivo,
          total,
          impuestoTotal: impuestoTotal > 0 ? impuestoTotal : undefined,
          metodoPago,
          cuentaBancariaId: cuentaBancariaId ?? undefined,
          dineroRecibido,
          cambio,
          fechaVencimientoCredito,
          numeroCuotasCredito: metodoPago === "CREDITO" ? (numeroCuotas ?? 1) : undefined,
          descuento: montoDescuento + valorPuntosRedimidos > 0 ? montoDescuento + valorPuntosRedimidos : undefined,
          puntosGanados,
          puntosRedimidos: puntosARedimir ?? 0,
          ventaLibre: hayVentaLibre,
          observaciones,
          items: {
            create: items.map((i) => ({
              productoId: i.productoId ?? null,
              descripcionLibre: i.productoId ? null : (i.descripcionLibre ?? "Venta libre"),
              cantidad: i.cantidad,
              precioUnitario: i.precioUnitario,
            })),
          },
        },
        include: { items: true },
      });

      // Solo los items de inventario mueven stock; los de venta libre no.
      for (const item of itemsProducto) {
        // El stock nunca baja de 0: si se vende sin existencias (permiso
        // ventas.sin_stock) el inventario queda en 0, no en negativo.
        const invActual = await tx.inventarioSucursal.findUnique({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId } },
        });
        const nuevaCantidad = Math.max(0, (invActual?.cantidad ?? 0) - item.cantidad);
        await tx.inventarioSucursal.upsert({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId } },
          update: { cantidad: nuevaCantidad },
          create: { productoId: item.productoId, sucursalId, cantidad: nuevaCantidad },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: item.productoId,
            sucursalId,
            tipo: "VENTA",
            cantidad: item.cantidad,
            motivo: `Venta ${venta.consecutivo}`,
            usuarioId,
          },
        });
      }

      if (clienteId && (puntosARedimir || puntosGanados > 0)) {
        const delta = puntosGanados - (puntosARedimir ?? 0);
        await tx.cliente.update({ where: { id: clienteId }, data: { puntos: { increment: delta } } });
        if (puntosARedimir) {
          await tx.movimientoPuntos.create({
            data: { clienteId, ventaId: venta.id, tipo: "REDENCION", puntos: -puntosARedimir },
          });
        }
        if (puntosGanados > 0) {
          await tx.movimientoPuntos.create({
            data: { clienteId, ventaId: venta.id, tipo: "ACUMULACION", puntos: puntosGanados },
          });
        }
      }

      return venta;
    });

    const puntosSaldo = clienteId
      ? (await prisma.cliente.findUnique({ where: { id: clienteId }, select: { puntos: true } }))?.puntos ?? 0
      : 0;

    emitVentaCreada(empresaId, {
      ventaId: venta.id,
      sucursalId,
      total: Number(venta.total),
      fecha: venta.fecha.toISOString(),
    });
    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "CREAR_VENTA",
      entidad: "Venta",
      entidadId: venta.id,
      detalle: `Venta #${venta.consecutivo} por $${total} (${metodoPago})${hayVentaLibre ? " · venta libre" : ""}`,
    });
    for (const item of itemsProducto) {
      const [inv, producto] = await Promise.all([
        prisma.inventarioSucursal.findUnique({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId } },
        }),
        prisma.producto.findUnique({ where: { id: item.productoId } }),
      ]);
      if (inv) {
        emitInventarioActualizado(empresaId, {
          productoId: item.productoId,
          sucursalId,
          cantidad: inv.cantidad,
        });
      }
      if (producto) {
        void ajustarInventarioEnShopifySiCorresponde(empresaId, sucursalId, producto, -item.cantidad);
      }
    }

    void (async () => {
      const metaConfig = await prisma.metaConfig.findUnique({ where: { empresaId } });
      if (!metaConfig?.pixelId) return;
      if (metaConfig.sucursalEcommerceId && metaConfig.sucursalEcommerceId !== sucursalId) return;

      const cliente = clienteId ? await prisma.cliente.findUnique({ where: { id: clienteId } }) : null;
      await enviarEventoCompraAMeta(empresaId, {
        ventaId: venta.id,
        total: Number(venta.total),
        fecha: venta.fecha,
        clienteEmail: cliente?.email,
        clienteTelefono: cliente?.telefono,
      });
    })();

    return reply.code(201).send({ ...venta, subtotal, puntosSaldo });
  });

  // Devolucion PARCIAL: devuelve solo algunos items/cantidades de una venta,
  // restaurando inventario y ajustando el total, sin borrar la venta.
  app.post("/ventas/:id/devoluciones", async (request, reply) => {
    const { empresaId, usuarioId } = request.user;
    if (!request.user.permisos.includes("devoluciones.realizar")) {
      return reply.code(403).send({ error: "No tienes permiso para realizar devoluciones" });
    }
    const { id } = request.params as { id: string };
    const parsed = DevolucionParcialSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const venta = await prisma.venta.findFirst({
      where: { id, empresaId },
      include: { items: { include: { producto: { select: { nombre: true } } } } },
    });
    if (!venta) return reply.code(404).send({ error: "Venta no encontrada" });

    const detalle: { productoId: string; nombre: string; cantidad: number; precioUnitario: number }[] = [];
    for (const item of parsed.data.items) {
      const ventaItem = venta.items.find((vi) => vi.productoId === item.productoId);
      if (!ventaItem || !ventaItem.productoId) {
        return reply.code(400).send({ error: "El producto no pertenece a esta venta" });
      }
      const nombreItem = ventaItem.producto?.nombre ?? ventaItem.descripcionLibre ?? "Producto";
      // Se valida contra lo que queda por devolver, no contra lo vendido:
      // asi dos devoluciones parciales no pueden sumar mas que la venta.
      const pendiente = ventaItem.cantidad - ventaItem.cantidadDevuelta;
      if (item.cantidad > pendiente) {
        return reply.code(400).send({
          error: `Solo quedan ${pendiente} unidad(es) por devolver de ${nombreItem}`,
        });
      }
      detalle.push({
        productoId: item.productoId,
        nombre: nombreItem,
        cantidad: item.cantidad,
        precioUnitario: Number(ventaItem.precioUnitario),
      });
    }
    const montoDevuelto = detalle.reduce((acc, d) => acc + d.cantidad * d.precioUnitario, 0);

    const devolucion = await prisma.$transaction(async (tx) => {
      for (const d of detalle) {
        const ventaItem = venta.items.find((vi) => vi.productoId === d.productoId)!;
        // Se conserva "cantidad" intacta (historial de la venta original) y
        // se acumula lo devuelto aparte.
        await tx.ventaItem.update({
          where: { id: ventaItem.id },
          data: { cantidadDevuelta: { increment: d.cantidad } },
        });
        await tx.inventarioSucursal.upsert({
          where: { productoId_sucursalId: { productoId: d.productoId, sucursalId: venta.sucursalId } },
          update: { cantidad: { increment: d.cantidad } },
          create: { productoId: d.productoId, sucursalId: venta.sucursalId, cantidad: d.cantidad },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: d.productoId,
            sucursalId: venta.sucursalId,
            tipo: "AJUSTE",
            cantidad: d.cantidad,
            motivo: `Devolucion parcial venta ${venta.consecutivo}`,
            usuarioId,
          },
        });
      }
      await tx.venta.update({
        where: { id },
        data: { total: Math.max(0, Number(venta.total) - montoDevuelto) },
      });
      return tx.devolucionVenta.create({
        data: {
          empresaId,
          ventaId: id,
          usuarioId,
          detalle: JSON.stringify(detalle),
          montoDevuelto,
          motivo: parsed.data.motivo,
        },
      });
    });

    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "DEVOLUCION_PARCIAL",
      entidad: "Venta",
      entidadId: id,
      detalle: `Venta #${venta.consecutivo}: ${detalle.map((d) => `${d.cantidad}x ${d.nombre}`).join(", ")} ($${montoDevuelto})`,
    });

    for (const d of detalle) {
      const [inv, producto] = await Promise.all([
        prisma.inventarioSucursal.findUnique({
          where: { productoId_sucursalId: { productoId: d.productoId, sucursalId: venta.sucursalId } },
        }),
        prisma.producto.findUnique({ where: { id: d.productoId } }),
      ]);
      if (inv) {
        emitInventarioActualizado(empresaId, {
          productoId: d.productoId,
          sucursalId: venta.sucursalId,
          cantidad: inv.cantidad,
        });
      }
      if (producto) {
        void ajustarInventarioEnShopifySiCorresponde(empresaId, venta.sucursalId, producto, d.cantidad);
      }
    }

    return reply.code(201).send({ ...devolucion, detalle });
  });

  // Elimina una venta (por error de cobro o devolucion) y restaura el
  // inventario que se habia descontado, incluyendo Shopify si aplica.
  app.delete("/ventas/:id", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("ventas.eliminar")) {
      return reply.code(403).send({ error: "No tienes permiso para eliminar ventas" });
    }
    const { id } = request.params as { id: string };

    const venta = await prisma.venta.findFirst({
      where: { id, empresaId },
      include: { items: true },
    });
    if (!venta) return reply.code(404).send({ error: "Venta no encontrada" });

    // Los items de venta libre no tienen producto: no devuelven stock.
    const itemsConProducto = venta.items.filter(
      (i): i is typeof i & { productoId: string } => !!i.productoId
    );

    await prisma.$transaction(async (tx) => {
      for (const item of itemsConProducto) {
        await tx.inventarioSucursal.update({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId: venta.sucursalId } },
          data: { cantidad: { increment: item.cantidad } },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: item.productoId,
            sucursalId: venta.sucursalId,
            tipo: "AJUSTE",
            cantidad: item.cantidad,
            motivo: `Eliminacion de venta ${venta.consecutivo}`,
            usuarioId: request.user.usuarioId,
          },
        });
      }
      await tx.venta.delete({ where: { id } });
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ELIMINAR_VENTA",
      entidad: "Venta",
      entidadId: venta.id,
      detalle: `Venta #${venta.consecutivo} por $${venta.total}`,
    });

    for (const item of itemsConProducto) {
      const [inv, producto] = await Promise.all([
        prisma.inventarioSucursal.findUnique({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId: venta.sucursalId } },
        }),
        prisma.producto.findUnique({ where: { id: item.productoId } }),
      ]);
      if (inv) {
        emitInventarioActualizado(empresaId, {
          productoId: item.productoId,
          sucursalId: venta.sucursalId,
          cantidad: inv.cantidad,
        });
      }
      if (producto) {
        void ajustarInventarioEnShopifySiCorresponde(empresaId, venta.sucursalId, producto, item.cantidad);
      }
    }

    return reply.code(204).send();
  });
}
