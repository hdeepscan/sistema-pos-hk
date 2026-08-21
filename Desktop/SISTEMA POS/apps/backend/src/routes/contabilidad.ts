import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { mensajeDeValidacion } from "../lib/errores.js";

// Función helper para crear un asiento contable automáticamente desde una venta
export async function crearAsientoDesdeVenta(
  empresaId: string,
  venta: {
    id: string;
    total: number;
    impuestoTotal?: number;
    metodoPago: string;
    consecutivo: number;
  }
) {
  try {
    // Obtener o crear las cuentas necesarias
    const [cuentaVentas, cuentaIVA, cuentaCaja] = await Promise.all([
      prisma.cuentaContable.upsert({
        where: { empresaId_codigo: { empresaId, codigo: "4105" } },
        update: {},
        create: {
          empresaId,
          codigo: "4105",
          nombre: "Ventas",
          tipo: "INGRESO",
          descripcion: "Ingresos por ventas",
        },
      }),
      prisma.cuentaContable.upsert({
        where: { empresaId_codigo: { empresaId, codigo: "2408" } },
        update: {},
        create: {
          empresaId,
          codigo: "2408",
          nombre: "IVA Cobrado",
          tipo: "PASIVO",
          descripcion: "IVA por cobrar",
        },
      }),
      prisma.cuentaContable.upsert({
        where: { empresaId_codigo: { empresaId, codigo: "1105" } },
        update: {},
        create: {
          empresaId,
          codigo: "1105",
          nombre: "Caja",
          tipo: "ACTIVO",
          descripcion: "Efectivo en caja",
        },
      }),
    ]);

    // Calcular el neto de ventas (sin IVA)
    const ivaTotal = venta.impuestoTotal ?? 0;
    const ventaNeta = venta.total - ivaTotal;

    // Crear líneas del asiento
    const lineas: any[] = [
      {
        cuentaId: cuentaCaja.id,
        descripcion: `Venta #${venta.consecutivo}`,
        debe: venta.total,
        haber: 0,
      },
      {
        cuentaId: cuentaVentas.id,
        descripcion: `Venta #${venta.consecutivo}`,
        debe: 0,
        haber: ventaNeta,
      },
    ];

    // Si hay IVA, agregar línea
    if (ivaTotal > 0) {
      lineas.push({
        cuentaId: cuentaIVA.id,
        descripcion: `IVA Venta #${venta.consecutivo}`,
        debe: 0,
        haber: ivaTotal,
      });
    }

    // Crear el asiento contable
    await prisma.asientoContable.create({
      data: {
        empresaId,
        fecha: new Date(),
        descripcion: `Venta #${venta.consecutivo}`,
        referencia: `VENTA_${venta.id}`,
        estado: "CONTABILIZADO", // Se contabiliza automáticamente
        contabilizadoEn: new Date(),
        totalDebe: venta.total.toString(),
        totalHaber: venta.total.toString(),
        lineas: {
          create: lineas.map((l, idx) => ({
            cuentaId: l.cuentaId,
            descripcion: l.descripcion,
            debe: l.debe,
            haber: l.haber,
            orden: idx,
          })),
        },
      },
    });

    console.log(`[Contabilidad] Asiento creado automáticamente para venta #${venta.consecutivo}`);
  } catch (err) {
    console.error(`[Contabilidad] Error creando asiento para venta #${venta.consecutivo}:`, err);
    // No lanzar error: la falta de asiento no debe bloquear la venta
  }
}

export async function contabilidadRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // ===== PLAN DE CUENTAS =====

  // Obtener plan de cuentas
  app.get("/contabilidad/cuentas", async (request) => {
    const { empresaId } = request.user;

    try {
      const cuentas = await prisma.cuentaContable.findMany({
        where: { empresaId },
        orderBy: { codigo: "asc" },
      });

      return cuentas;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      return { error: mensaje };
    }
  });

  // Crear cuenta contable
  app.post("/contabilidad/cuentas", async (request, reply) => {
    const { empresaId } = request.user;
    const { codigo, nombre, tipo, descripcion } = request.body as any;

    if (!codigo || !nombre || !tipo) {
      return reply.code(400).send({ error: "Faltan campos requeridos" });
    }

    try {
      const cuenta = await prisma.cuentaContable.create({
        data: {
          empresaId,
          codigo,
          nombre,
          tipo,
          descripcion,
        },
      });

      return reply.code(201).send(cuenta);
    } catch (err: any) {
      if (err.code === "P2002") {
        return reply.code(400).send({ error: "El código de cuenta ya existe" });
      }
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      return reply.code(500).send({ error: mensaje });
    }
  });

  // ===== ASIENTOS CONTABLES =====

  // Obtener asientos
  app.get("/contabilidad/asientos", async (request) => {
    const { empresaId } = request.user;
    const { estado, fecha_inicio, fecha_fin } = request.query as any;

    try {
      const where: any = { empresaId };

      if (estado) where.estado = estado;
      if (fecha_inicio || fecha_fin) {
        where.fecha = {};
        if (fecha_inicio) where.fecha.gte = new Date(fecha_inicio);
        if (fecha_fin) where.fecha.lte = new Date(fecha_fin);
      }

      const asientos = await prisma.asientoContable.findMany({
        where,
        include: {
          lineas: {
            include: { cuenta: true },
            orderBy: { orden: "asc" },
          },
        },
        orderBy: { fecha: "desc" },
        take: 100,
      });

      return asientos;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      return { error: mensaje };
    }
  });

  // Crear asiento contable
  app.post("/contabilidad/asientos", async (request, reply) => {
    const { empresaId } = request.user;
    const { fecha, descripcion, referencia, lineas } = request.body as any;

    if (!fecha || !descripcion || !lineas || lineas.length === 0) {
      return reply.code(400).send({ error: "Faltan campos requeridos" });
    }

    // Validar que debe = haber
    const totalDebe = lineas.reduce((sum: number, l: any) => sum + (parseFloat(l.debe) || 0), 0);
    const totalHaber = lineas.reduce((sum: number, l: any) => sum + (parseFloat(l.haber) || 0), 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      return reply.code(400).send({ error: "Debe y Haber no coinciden" });
    }

    try {
      const asiento = await prisma.asientoContable.create({
        data: {
          empresaId,
          fecha: new Date(fecha),
          descripcion,
          referencia,
          totalDebe: totalDebe.toString(),
          totalHaber: totalHaber.toString(),
          lineas: {
            create: lineas.map((l: any, idx: number) => ({
              cuentaId: l.cuentaId,
              descripcion: l.descripcion,
              debe: parseFloat(l.debe) || 0,
              haber: parseFloat(l.haber) || 0,
              orden: idx,
            })),
          },
        },
        include: {
          lineas: {
            include: { cuenta: true },
            orderBy: { orden: "asc" },
          },
        },
      });

      return reply.code(201).send(asiento);
    } catch (err: any) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      return reply.code(500).send({ error: mensaje });
    }
  });

  // Contabilizar asiento (cambiar estado a CONTABILIZADO)
  app.post("/contabilidad/asientos/:id/contabilizar", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as any;

    try {
      const asiento = await prisma.asientoContable.findUnique({
        where: { id },
        include: { lineas: true },
      });

      if (!asiento || asiento.empresaId !== empresaId) {
        return reply.code(404).send({ error: "Asiento no encontrado" });
      }

      if (asiento.estado !== "BORRADOR") {
        return reply.code(400).send({ error: "Solo se pueden contabilizar asientos en BORRADOR" });
      }

      const actualizado = await prisma.asientoContable.update({
        where: { id },
        data: {
          estado: "CONTABILIZADO",
          contabilizadoEn: new Date(),
        },
        include: {
          lineas: {
            include: { cuenta: true },
            orderBy: { orden: "asc" },
          },
        },
      });

      return actualizado;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      return reply.code(500).send({ error: mensaje });
    }
  });

  // ===== REPORTES =====

  // Balance General
  app.get("/contabilidad/reportes/balance-general", async (request) => {
    const { empresaId } = request.user;

    try {
      const cuentas = await prisma.cuentaContable.findMany({
        where: { empresaId },
        include: {
          asientos: {
            where: {
              asiento: {
                estado: "CONTABILIZADO",
              },
            },
          },
        },
      });

      const balance = cuentas.map((cuenta) => {
        const saldo = cuenta.asientos.reduce((sum, linea) => {
          return sum + parseFloat(linea.debe.toString()) - parseFloat(linea.haber.toString());
        }, 0);

        return {
          id: cuenta.id,
          codigo: cuenta.codigo,
          nombre: cuenta.nombre,
          tipo: cuenta.tipo,
          saldo,
        };
      });

      return balance;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      return { error: mensaje };
    }
  });

  // Estado de Resultados
  app.get("/contabilidad/reportes/estado-resultados", async (request) => {
    const { empresaId } = request.user;

    try {
      const cuentas = await prisma.cuentaContable.findMany({
        where: {
          empresaId,
          tipo: { in: ["INGRESO", "GASTO"] },
        },
        include: {
          asientos: {
            where: {
              asiento: {
                estado: "CONTABILIZADO",
              },
            },
          },
        },
      });

      const ingresos = cuentas
        .filter((c) => c.tipo === "INGRESO")
        .reduce((sum, c) => {
          const saldo = c.asientos.reduce((s, linea) => {
            return s + parseFloat(linea.haber.toString()) - parseFloat(linea.debe.toString());
          }, 0);
          return sum + saldo;
        }, 0);

      const gastos = cuentas
        .filter((c) => c.tipo === "GASTO")
        .reduce((sum, c) => {
          const saldo = c.asientos.reduce((s, linea) => {
            return s + parseFloat(linea.debe.toString()) - parseFloat(linea.haber.toString());
          }, 0);
          return sum + saldo;
        }, 0);

      return {
        ingresos,
        gastos,
        utilidadNeta: ingresos - gastos,
      };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      return { error: mensaje };
    }
  });
}
