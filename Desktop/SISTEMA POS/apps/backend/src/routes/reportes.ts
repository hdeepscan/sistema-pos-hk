import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

function rangoFechas(desde?: string, hasta?: string) {
  const fin = hasta ? new Date(`${hasta}T23:59:59.999`) : new Date();
  const inicio = desde ? new Date(desde) : new Date(fin.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { inicio, fin };
}

async function totalesEnRango(empresaId: string, sucursalId: string | undefined, inicio: Date, fin: Date, canal?: string) {
  const [ventas, gastos] = await Promise.all([
    prisma.venta.aggregate({
      where: { empresaId, ...(sucursalId ? { sucursalId } : {}), ...(canal ? { canal: canal as any } : {}), fecha: { gte: inicio, lte: fin } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.gasto.aggregate({
      where: { empresaId, ...(sucursalId ? { sucursalId } : {}), fecha: { gte: inicio, lte: fin } },
      _sum: { monto: true },
    }),
  ]);
  return {
    totalVentas: Number(ventas._sum.total ?? 0),
    numeroVentas: ventas._count,
    totalGastos: Number(gastos._sum.monto ?? 0),
  };
}

function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / anterior) * 100;
}

export async function reportesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/reportes/resumen", async (request, reply) => {
    if (!request.user.permisos.includes("reportes.ver")) {
      return reply.code(403).send({ error: "No tienes permiso para ver reportes" });
    }
    const { empresaId } = request.user;
    const { desde, hasta, sucursalId, canal } = request.query as {
      desde?: string;
      hasta?: string;
      sucursalId?: string;
      canal?: string;
    };
    const { inicio, fin } = rangoFechas(desde, hasta);
    const duracionMs = fin.getTime() - inicio.getTime();
    const inicioAnterior = new Date(inicio.getTime() - duracionMs);
    const finAnterior = new Date(inicio.getTime() - 1);

    const [ventas, gastos, sucursales, periodoAnterior, gastoPautaAgg] = await Promise.all([
      prisma.venta.findMany({
        where: {
          empresaId,
          ...(sucursalId ? { sucursalId } : {}),
          ...(canal ? { canal: canal as any } : {}),
          fecha: { gte: inicio, lte: fin },
        },
        include: { items: { include: { producto: true } } },
      }),
      prisma.gasto.findMany({
        where: {
          empresaId,
          ...(sucursalId ? { sucursalId } : {}),
          fecha: { gte: inicio, lte: fin },
        },
      }),
      prisma.sucursal.findMany({ where: { empresaId, activo: true } }),
      totalesEnRango(empresaId, sucursalId, inicioAnterior, finAnterior, canal),
      prisma.gastoPauta.aggregate({
        where: { empresaId, fecha: { gte: inicio, lte: fin } },
        _sum: { gasto: true },
      }),
    ]);

    const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
    const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
    // Los items de "venta libre" no tienen producto (ni costo asociado).
    const costoVentas = ventas.reduce(
      (acc, v) => acc + v.items.reduce((a, i) => a + i.cantidad * Number(i.producto?.costo ?? 0), 0),
      0
    );
    const utilidadBruta = totalVentas - costoVentas - totalGastos;
    const unidadesVendidas = ventas.reduce(
      (acc, v) => acc + v.items.reduce((a, i) => a + i.cantidad, 0),
      0
    );
    const ticketPromedio = ventas.length > 0 ? totalVentas / ventas.length : 0;

    const porProducto = new Map<string, { nombre: string; cantidad: number; total: number }>();
    for (const venta of ventas) {
      for (const item of venta.items) {
        // Las ventas libres se agrupan bajo su descripcion (no tienen producto).
        const clave = item.productoId ?? `libre:${item.descripcionLibre ?? "Venta libre"}`;
        const actual = porProducto.get(clave) ?? {
          nombre: item.producto?.nombre ?? item.descripcionLibre ?? "Venta libre",
          cantidad: 0,
          total: 0,
        };
        actual.cantidad += item.cantidad;
        actual.total += item.cantidad * Number(item.precioUnitario);
        porProducto.set(clave, actual);
      }
    }
    const productosMasVendidos = [...porProducto.entries()]
      .map(([productoId, v]) => ({ productoId, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    const porDia = new Map<string, number>();
    for (const venta of ventas) {
      const dia = venta.fecha.toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + Number(venta.total));
    }
    const ventasPorDia = [...porDia.entries()]
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const porMetodoPago = new Map<string, number>();
    for (const venta of ventas) {
      porMetodoPago.set(venta.metodoPago, (porMetodoPago.get(venta.metodoPago) ?? 0) + Number(venta.total));
    }
    const ventasPorMetodoPago = [...porMetodoPago.entries()].map(([metodoPago, total]) => ({ metodoPago, total }));

    const porSucursal = new Map<string, number>();
    for (const venta of ventas) {
      porSucursal.set(venta.sucursalId, (porSucursal.get(venta.sucursalId) ?? 0) + Number(venta.total));
    }
    const ventasPorSucursal = sucursales
      .map((s) => ({ sucursalId: s.id, sucursalNombre: s.nombre, total: porSucursal.get(s.id) ?? 0 }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);

    // ANÁLISIS POR CANAL DE VENTA
    const porCanal = new Map<string, { total: number; cantidad: number; unidades: number }>();
    const canalesDisponibles = ["POS", "SHOPIFY", "WHATSAPP", "OTRO"];
    for (const canalNombre of canalesDisponibles) {
      porCanal.set(canalNombre, { total: 0, cantidad: 0, unidades: 0 });
    }
    for (const venta of ventas) {
      const canalNombre = venta.canal || "OTRO";
      const actual = porCanal.get(canalNombre) || { total: 0, cantidad: 0, unidades: 0 };
      actual.total += Number(venta.total);
      actual.cantidad += 1;
      actual.unidades += venta.items.reduce((acc, i) => acc + i.cantidad, 0);
      porCanal.set(canalNombre, actual);
    }
    const ventasPorCanal = canalesDisponibles.map((canal) => {
      const data = porCanal.get(canal) || { total: 0, cantidad: 0, unidades: 0 };
      return {
        canal,
        total: data.total,
        cantidad: data.cantidad,
        unidades: data.unidades,
        ticketPromedio: data.cantidad > 0 ? data.total / data.cantidad : 0,
        porcentajeVentas: totalVentas > 0 ? (data.total / totalVentas) * 100 : 0,
      };
    });

    const gastoPauta = Number(gastoPautaAgg._sum.gasto ?? 0);
    const roas = gastoPauta > 0 ? totalVentas / gastoPauta : null;

    return {
      rango: { inicio: inicio.toISOString(), fin: fin.toISOString() },
      totalVentas,
      totalGastos,
      costoVentas,
      utilidadBruta,
      numeroVentas: ventas.length,
      unidadesVendidas,
      ticketPromedio,
      gastoPauta,
      roas,
      productosMasVendidos,
      ventasPorDia,
      ventasPorMetodoPago,
      ventasPorSucursal,
      ventasPorCanal,
      comparacion: {
        totalVentasAnterior: periodoAnterior.totalVentas,
        variacionVentas: variacionPorcentual(totalVentas, periodoAnterior.totalVentas),
        variacionNumeroVentas: variacionPorcentual(ventas.length, periodoAnterior.numeroVentas),
      },
    };
  });

  // 📦 GET /reportes/analisis-proveedores - Análisis de Proveedores para Cliente
  app.get("/reportes/analisis-proveedores", async (request, reply) => {
    try {
      if (!request.user.permisos.includes("reportes.ver")) {
        return reply.code(403).send({ error: "No tienes permiso para ver reportes" });
      }

      const { empresaId } = request.user;
      console.log(`📦 ANALYTICS: Fetching data for empresa ${empresaId}`);

      // Obtener proveedores de esta empresa con sus productos e inventario
      const proveedores = await prisma.proveedor.findMany({
        where: { empresaId }, // CRÍTICO: Filtro por empresaId
        include: {
          productos: {
            where: { empresaId }, // CRÍTICO: Filtro por empresaId
            include: {
              inventario: true, // InventarioSucursal
            },
          },
        },
      });

      console.log(`📦 ANALYTICS: Found ${proveedores.length} proveedores for empresa ${empresaId}`);

      // Calcular ranking dinámicamente
      interface ProveedorCalculo {
        id: string;
        nombre: string;
        productos: number;
        unidades: number;
        costo: number;
        venta: number;
        utilidad: number;
        margenPorcentaje: number;
      }

      const ranking: ProveedorCalculo[] = proveedores
        .map((prov) => {
          let totalProductos = 0;
          let totalUnidades = 0;
          let totalCosto = 0;
          let totalVenta = 0;

          for (const producto of prov.productos) {
            totalProductos++;
            let cantidadProducto = 0;
            for (const inv of producto.inventario) {
              cantidadProducto += inv.cantidad;
            }
            totalUnidades += cantidadProducto;
            totalCosto += Number(producto.costo) * cantidadProducto;
            totalVenta += Number(producto.precio) * cantidadProducto;
          }

          const utilidad = totalVenta - totalCosto;
          const margenPorcentaje = totalVenta > 0 ? (utilidad / totalVenta) * 100 : 0;

          return {
            id: prov.id,
            nombre: prov.nombre,
            productos: totalProductos,
            unidades: totalUnidades,
            costo: Math.round(totalCosto),
            venta: Math.round(totalVenta),
            utilidad: Math.round(utilidad),
            margenPorcentaje: Number(margenPorcentaje.toFixed(1)),
          };
        })
        .filter((prov) => prov.productos > 0)
        .sort((a, b) => b.costo - a.costo);

      // Calcular KPIs
      const totalProveedores = ranking.length;
      const valorInventario = ranking.reduce((sum, p) => sum + p.costo, 0);
      const valorVenta = ranking.reduce((sum, p) => sum + p.venta, 0);
      const utilidadPotencial = ranking.reduce((sum, p) => sum + p.utilidad, 0);

      const kpis = {
        totalProveedores,
        valorInventario,
        valorVenta,
        utilidadPotencial,
      };

      // Gráfico de distribución
      interface DistribucionItem {
        nombre: string;
        valor: number;
        porcentaje: number;
      }

      const top5Ranking = ranking.slice(0, 5);
      const sumaTop5 = top5Ranking.reduce((sum, p) => sum + p.costo, 0);
      const graficoDistribucion: DistribucionItem[] = top5Ranking.map((prov) => ({
        nombre: prov.nombre,
        valor: prov.costo,
        porcentaje: sumaTop5 > 0 ? Number(((prov.costo / sumaTop5) * 100).toFixed(1)) : 0,
      }));

      // Insights dinámicos
      interface Insight {
        id: string;
        icon: string;
        titulo: string;
        descripcion: string;
        tipo: string;
      }

      const insights: Insight[] = [];

      if (ranking.length > 0) {
        const mayor = ranking[0];
        const porcentajeMayor = valorInventario > 0
          ? Number(((mayor.costo / valorInventario) * 100).toFixed(0))
          : 0;
        insights.push({
          id: "insight-1",
          icon: "💰",
          titulo: "Mayor Inversión",
          descripcion: `${mayor.nombre} concentra el ${porcentajeMayor}% del inventario ($${(mayor.costo / 1000000).toFixed(1)}M)`,
          tipo: "info",
        });
      }

      if (ranking.length > 0) {
        const masRentable = ranking.reduce((prev, curr) =>
          curr.margenPorcentaje > prev.margenPorcentaje ? curr : prev
        );
        insights.push({
          id: "insight-2",
          icon: "📈",
          titulo: "Mayor Rentabilidad",
          descripcion: `${masRentable.nombre} lidera con ${masRentable.margenPorcentaje}% de margen bruto`,
          tipo: "success",
        });
      }

      if (ranking.length > 0) {
        const conPocosStock = ranking.filter((p) => p.unidades < 100);
        if (conPocosStock.length > 0) {
          insights.push({
            id: "insight-3",
            icon: "🚨",
            titulo: "Stock Bajo",
            descripcion: `${conPocosStock.length} proveedor(es) con menos de 100 unidades en inventario`,
            tipo: "warning",
          });
        } else {
          insights.push({
            id: "insight-3",
            icon: "✅",
            titulo: "Inventario Saludable",
            descripcion: `Todos los proveedores tienen stock adecuado (${ranking.reduce((sum, p) => sum + p.unidades, 0)} unidades totales)`,
            tipo: "success",
          });
        }
      }

      console.log(`✅ ANALYTICS: Real data ready for empresa ${empresaId}`);
      reply.send({
        insights,
        kpis,
        graficoDistribucion,
        ranking,
      });
    } catch (error: any) {
      console.error("❌ ANALYTICS ERROR:", {
        error: error.message,
        stack: error.stack,
      });

      // Fallback con estructura válida
      reply.send({
        insights: [],
        kpis: {
          totalProveedores: 0,
          valorInventario: 0,
          valorVenta: 0,
          utilidadPotencial: 0,
        },
        graficoDistribucion: [],
        ranking: [],
      });
    }
  });

  // 📦 GET /reportes/analisis-proveedores/:proveedorId/productos - Detalle de Productos del Proveedor
  app.get("/reportes/analisis-proveedores/:proveedorId/productos", async (request, reply) => {
    try {
      if (!request.user.permisos.includes("reportes.ver")) {
        return reply.code(403).send({ error: "No tienes permiso para ver reportes" });
      }

      const { empresaId } = request.user;
      const { proveedorId } = request.params as { proveedorId: string };

      console.log(`📦 DRILL-DOWN: Fetching products for proveedor ${proveedorId} en empresa ${empresaId}`);

      // CRÍTICO: Filtrar por proveedorId AND empresaId para seguridad
      const productos = await prisma.producto.findMany({
        where: {
          proveedorId: proveedorId,
          empresaId: empresaId, // ← SEGURIDAD: Solo ver productos de esta empresa
        },
        include: {
          inventario: true, // InventarioSucursal
        },
      });

      console.log(`📦 DRILL-DOWN: Found ${productos.length} products for proveedor ${proveedorId}`);

      // Mapear y calcular valores
      interface ProductoDetalle {
        id: string;
        nombre: string;
        sku: string;
        stockTotal: number;
        costoUnitario: number;
        precioVenta: number;
        valorInventarioCosto: number;
        utilidadPotencial: number;
      }

      const productosDetallados: ProductoDetalle[] = productos.map((prod) => {
        // Sumar inventario de todas las sucursales
        const stockTotal = prod.inventario.reduce((sum, inv) => sum + inv.cantidad, 0);
        const costoUnitario = Number(prod.costo);
        const precioVenta = Number(prod.precio);
        const valorInventarioCosto = stockTotal * costoUnitario;
        const utilidadUnitaria = precioVenta - costoUnitario;
        const utilidadPotencial = stockTotal * utilidadUnitaria;

        return {
          id: prod.id,
          nombre: prod.nombre,
          sku: prod.sku,
          stockTotal,
          costoUnitario: Math.round(costoUnitario),
          precioVenta: Math.round(precioVenta),
          valorInventarioCosto: Math.round(valorInventarioCosto),
          utilidadPotencial: Math.round(utilidadPotencial),
        };
      });

      console.log(`✅ DRILL-DOWN: Products ready for proveedor ${proveedorId}`);
      reply.send(productosDetallados);
    } catch (error: any) {
      console.error("❌ DRILL-DOWN ERROR:", {
        error: error.message,
        stack: error.stack,
        proveedorId: request.params.proveedorId,
      });

      // Fallback: array vacío (seguridad)
      reply.send([]);
    }
  });
}
