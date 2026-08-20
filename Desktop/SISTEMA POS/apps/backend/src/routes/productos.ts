import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import {
  CrearProductoSchema,
  CrearProductoCompletoSchema,
  CrearVarianteSchema,
  EdicionMasivaProductosSchema,
} from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import {
  empujarProductoAShopify,
  subirImagenAShopify,
  crearVarianteEnShopify,
  crearProductoConVariantesEnShopify,
  crearProductoEnShopify,
  fijarInventarioEnShopify,
  asegurarUbicacionEcommerce,
  eliminarProductoEnShopify,
  eliminarVarianteEnShopify,
  subirImagenGaleria,
  eliminarImagenEnShopify,
  obtenerOpcionesShopifyProducto,
} from "../lib/shopify.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

// Sin filas en ProductoSucursal = disponible en todas las sucursales.
// sucursalIds=[] limpia la restriccion (vuelve a "disponible en todas").
async function sincronizarDisponibilidad(
  tx: Prisma.TransactionClient,
  empresaId: string,
  productoIds: string[],
  sucursalIds: string[]
) {
  await tx.productoSucursal.deleteMany({ where: { productoId: { in: productoIds } } });
  if (sucursalIds.length === 0) return;
  const validas = await tx.sucursal.findMany({ where: { empresaId, id: { in: sucursalIds } }, select: { id: true } });
  const data = productoIds.flatMap((productoId) => validas.map((s) => ({ productoId, sucursalId: s.id })));
  if (data.length > 0) await tx.productoSucursal.createMany({ data });
}

export async function productosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Categorias ya usadas por la empresa, para sugerirlas al crear/editar.
  app.get("/productos/categorias", async (request) => {
    const { empresaId } = request.user;
    const filas = await prisma.producto.findMany({
      where: { empresaId, categoria: { not: null } },
      distinct: ["categoria"],
      select: { categoria: true },
      orderBy: { categoria: "asc" },
    });
    return filas.map((f) => f.categoria).filter((c): c is string => !!c && c.trim().length > 0);
  });

  app.get("/productos", async (request) => {
    const { empresaId } = request.user;
    const { q, sucursalId } = request.query as { q?: string; sucursalId?: string };
    const productos = await prisma.producto.findMany({
      where: {
        empresaId,
        activo: true,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { codigoBarras: { contains: q, mode: "insensitive" } },
                { categoria: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(sucursalId
          ? { AND: [{ OR: [{ sucursalesDisponibles: { none: {} } }, { sucursalesDisponibles: { some: { sucursalId } } }] }] }
          : {}),
      },
      include: sucursalId ? { inventario: { where: { sucursalId } } } : undefined,
      orderBy: { nombre: "asc" },
    });
    // stockSucursal solo viene cuando se pide con sucursalId (lo usa el POS
    // para avisar de falta de existencias antes de cobrar).
    return productos.map((p) => {
      const { inventario, ...resto } = p as typeof p & { inventario?: { cantidad: number }[] };
      return { ...resto, stockSucursal: sucursalId ? inventario?.[0]?.cantidad ?? 0 : undefined };
    });
  });

  // Usado por el lector de código de barras en el POS: busca coincidencia exacta.
  // Si se pasa sucursalId, solo encuentra el producto si esta disponible ahi.
  app.get("/productos/buscar", async (request, reply) => {
    const { empresaId } = request.user;
    const { codigo, sucursalId } = request.query as { codigo?: string; sucursalId?: string };
    if (!codigo) return reply.code(400).send({ error: "Falta el parametro codigo" });

    const producto = await prisma.producto.findFirst({
      where: {
        empresaId,
        activo: true,
        OR: [{ codigoBarras: codigo }, { sku: codigo }],
      },
      include: {
        sucursalesDisponibles: true,
        ...(sucursalId ? { inventario: { where: { sucursalId } } } : {}),
      },
    });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    if (sucursalId && producto.sucursalesDisponibles.length > 0) {
      const disponibleAqui = producto.sucursalesDisponibles.some((d) => d.sucursalId === sucursalId);
      if (!disponibleAqui) {
        return reply.code(404).send({ error: "Este producto no esta disponible en esta sucursal" });
      }
    }
    const { sucursalesDisponibles, inventario, ...resto } = producto as typeof producto & {
      inventario?: { cantidad: number }[];
    };
    return { ...resto, stockSucursal: sucursalId ? inventario?.[0]?.cantidad ?? 0 : undefined };
  });

  app.get("/productos/:id", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const producto = await prisma.producto.findFirst({
      where: { id, empresaId },
      include: { colecciones: { include: { coleccion: true } }, sucursalesDisponibles: true },
    });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    // Las variantes son las otras filas del mismo producto: comparten el
    // producto de Shopify o, si es local, el mismo grupoVariantes.
    const variantes =
      producto.shopifyProductId || producto.grupoVariantes
        ? await prisma.producto.findMany({
            where: {
              empresaId,
              id: { not: producto.id },
              ...(producto.shopifyProductId
                ? { shopifyProductId: producto.shopifyProductId }
                : { grupoVariantes: producto.grupoVariantes }),
            },
            orderBy: { varianteTitulo: "asc" },
          })
        : [];

    const { sucursalesDisponibles, ...resto } = producto;
    return {
      ...resto,
      colecciones: producto.colecciones.map((pc) => pc.coleccion),
      sucursalIds: sucursalesDisponibles.map((d) => d.sucursalId),
      variantes,
    };
  });

  // Stock por sucursal de un producto y todas sus variantes, para editarlo
  // desde la pantalla de producto.
  app.get("/productos/:id/inventario", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const unidades = await prisma.producto.findMany({
      where: {
        empresaId,
        ...(producto.shopifyProductId
          ? { shopifyProductId: producto.shopifyProductId }
          : producto.grupoVariantes
            ? { grupoVariantes: producto.grupoVariantes }
            : { id }),
      },
      include: { inventario: true },
      orderBy: { varianteTitulo: "asc" },
    });
    const sucursales = await prisma.sucursal.findMany({
      where: { empresaId, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    return {
      sucursales,
      unidades: unidades.map((u) => ({
        id: u.id,
        sku: u.sku,
        nombre: u.nombre,
        varianteTitulo: u.varianteTitulo,
        grupoOpciones: u.grupoOpciones,
        stock: sucursales.map((s) => ({
          sucursalId: s.id,
          cantidad: u.inventario.find((i) => i.sucursalId === s.id)?.cantidad ?? 0,
        })),
      })),
    };
  });

  app.post("/productos", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const parsed = CrearProductoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    }
    const { sucursalIds, ...datosProducto } = parsed.data;

    const existente = await prisma.producto.findUnique({
      where: { empresaId_sku: { empresaId, sku: parsed.data.sku } },
    });
    if (existente) {
      return reply.code(409).send({ error: "Ya existe un producto con ese SKU" });
    }

    const producto = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({ data: { empresaId, ...datosProducto } as Prisma.ProductoUncheckedCreateInput });
      const sucursales = await tx.sucursal.findMany({ where: { empresaId, activo: true } });
      if (sucursales.length > 0) {
        await tx.inventarioSucursal.createMany({
          data: sucursales.map((s) => ({ productoId: producto.id, sucursalId: s.id, cantidad: 0 })),
        });
      }
      if (sucursalIds && sucursalIds.length > 0) {
        await sincronizarDisponibilidad(tx, empresaId, [producto.id], sucursalIds);
      }
      return producto;
    });
    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_PRODUCTO",
      entidad: "Producto",
      entidadId: producto.id,
      detalle: producto.nombre,
    });

    const conShopify = await empujarProductoAShopify(producto);
    let productoFinal = producto;
    if (conShopify.shopifyProductId !== producto.shopifyProductId) {
      productoFinal = await prisma.producto.update({
        where: { id: producto.id },
        data: {
          shopifyProductId: conShopify.shopifyProductId,
          shopifyVariantId: conShopify.shopifyVariantId,
          shopifyInventoryItemId: conShopify.shopifyInventoryItemId,
        },
      });
    }

    return reply.code(201).send(productoFinal);
  });

  // Creacion "inteligente": crea un producto y, si trae combinaciones de
  // variantes (ej. Color x Talla), crea una fila por combinacion agrupada por
  // grupoVariantes, con su propio SKU/codigo/precio/stock/imagen. Las imagenes
  // llegan como data URL y se guardan tal cual (el POS/frontend las renderiza);
  // si Shopify esta conectado, el empuje se hace best-effort despues.
  app.post("/productos/completo", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const parsed = CrearProductoCompletoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const {
      variantes,
      imagenesDataUrl,
      nombresOpciones,
      publicarEnShopify = true,
      stockInicial,
      sucursalStockId,
      sucursalIds,
      ...base
    } = parsed.data;

    const tieneVariantes = !!variantes && variantes.length > 0;
    const imagenPrincipal = imagenesDataUrl?.[0];

    // Verificar SKUs unicos: entre las variantes y contra la base de datos.
    const skus = tieneVariantes ? variantes!.map((v) => v.sku) : [base.sku];
    const repetido = skus.find((s, i) => skus.indexOf(s) !== i);
    if (repetido) return reply.code(400).send({ error: `El SKU "${repetido}" esta repetido entre las variantes` });
    const yaExisten = await prisma.producto.findMany({
      where: { empresaId, sku: { in: skus } },
      select: { sku: true },
    });
    if (yaExisten.length > 0) {
      return reply.code(409).send({ error: `Ya existe un producto con el SKU "${yaExisten[0].sku}"` });
    }

    const grupo = tieneVariantes ? randomUUID() : null;

    const creados = await prisma.$transaction(async (tx) => {
      const sucursales = await tx.sucursal.findMany({ where: { empresaId, activo: true }, select: { id: true } });
      // Sucursal donde entra el stock inicial (por defecto, la primera activa).
      const sucStock = sucursalStockId ?? sucursales[0]?.id;

      const filas: { id: string; sku: string; stock: number }[] = [];

      async function crearFila(datos: {
        sku: string;
        codigoBarras?: string | null;
        precio: number;
        varianteTitulo?: string | null;
        imagenUrl?: string | null;
        stock: number;
      }) {
        const producto = await tx.producto.create({
          data: {
            empresaId,
            nombre: base.nombre,
            categoria: base.categoria,
            marca: base.marca,
            descripcion: base.descripcion,
            impuestoPorcentaje: base.impuestoPorcentaje,
            costo: base.costo,
            activo: base.activo,
            proveedorId: base.proveedorId,
            grupoVariantes: grupo,
            grupoOpciones: tieneVariantes && nombresOpciones && nombresOpciones.length > 0 ? nombresOpciones.join("|") : null,
            sku: datos.sku,
            codigoBarras: datos.codigoBarras,
            precio: datos.precio,
            varianteTitulo: datos.varianteTitulo,
            imagenUrl: datos.imagenUrl,
          },
        });
        if (sucursales.length > 0) {
          await tx.inventarioSucursal.createMany({
            data: sucursales.map((s) => ({
              productoId: producto.id,
              sucursalId: s.id,
              cantidad: s.id === sucStock ? datos.stock : 0,
            })),
          });
          if (datos.stock > 0 && sucStock) {
            await tx.movimientoInventario.create({
              data: {
                productoId: producto.id,
                sucursalId: sucStock,
                tipo: "ENTRADA",
                cantidad: datos.stock,
                motivo: "Stock inicial",
                usuarioId: request.user.usuarioId,
              },
            });
          }
        }
        filas.push({ id: producto.id, sku: producto.sku, stock: datos.stock });
      }

      if (tieneVariantes) {
        for (const v of variantes!) {
          await crearFila({
            sku: v.sku,
            codigoBarras: v.codigoBarras,
            precio: v.precio ?? base.precio,
            varianteTitulo: v.titulo,
            imagenUrl: v.imagenDataUrl ?? imagenPrincipal,
            stock: v.stockInicial ?? 0,
          });
        }
      } else {
        await crearFila({
          sku: base.sku,
          codigoBarras: base.codigoBarras,
          precio: base.precio,
          imagenUrl: imagenPrincipal,
          stock: stockInicial ?? 0,
        });
      }

      // Disponibilidad por sucursal (compartida por todas las filas del grupo).
      if (sucursalIds && sucursalIds.length > 0) {
        await sincronizarDisponibilidad(tx, empresaId, filas.map((f) => f.id), sucursalIds);
      }

      return filas;
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CREAR_PRODUCTO",
      entidad: "Producto",
      entidadId: creados[0]?.id,
      detalle: tieneVariantes ? `${base.nombre} (${creados.length} variantes)` : base.nombre,
    });

    // Empuje a Shopify best-effort (no bloquea la creacion local si falla).
    // Se captura el error para informarlo al frontend y permitir reintentar.
    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    let shopifySync: { intentado: boolean; ok: boolean; error?: string } = { intentado: false, ok: false };
    if (config) {
      shopifySync = { intentado: true, ok: false };
      try {
        const rows = await prisma.producto.findMany({ where: { id: { in: creados.map((f) => f.id) } } });
        const locationId = await asegurarUbicacionEcommerce(empresaId, config.sucursalEcommerceId);

        async function subirImagenFila(shopifyProductId: string, row: (typeof rows)[number]) {
          if (!row.imagenUrl?.startsWith("data:")) return;
          try {
            const base64 = row.imagenUrl.replace(/^data:image\/\w+;base64,/, "");
            const variantIds = row.shopifyVariantId && tieneVariantes ? [row.shopifyVariantId] : undefined;
            const imagenUrl = await subirImagenAShopify(empresaId, shopifyProductId, base64, variantIds);
            await prisma.producto.update({ where: { id: row.id }, data: { imagenUrl } });
          } catch (errImg) {
            request.log.error(errImg);
          }
        }

        // Empuja a Shopify el inventario de la sucursal ecommerce para esa fila.
        async function empujarInventarioFila(row: (typeof rows)[number]) {
          if (!row.shopifyInventoryItemId || !locationId) return;
          const inv = await prisma.inventarioSucursal.findUnique({
            where: { productoId_sucursalId: { productoId: row.id, sucursalId: config!.sucursalEcommerceId } },
          });
          await fijarInventarioEnShopify(empresaId, row.shopifyInventoryItemId, locationId, inv?.cantidad ?? 0);
        }

        if (tieneVariantes) {
          const res = await crearProductoConVariantesEnShopify(
            empresaId,
            { nombre: base.nombre, categoria: base.categoria },
            nombresOpciones ?? [],
            variantes!.map((v) => ({
              titulo: v.titulo,
              sku: v.sku,
              precio: v.precio ?? base.precio,
              codigoBarras: v.codigoBarras,
            })),
            publicarEnShopify
          );
          const porSku = new Map(res.variantes.map((v) => [v.sku, v]));
          for (const row of rows) {
            const v = porSku.get(row.sku);
            const actualizado = await prisma.producto.update({
              where: { id: row.id },
              data: {
                shopifyProductId: res.shopifyProductId,
                shopifyVariantId: v?.shopifyVariantId ?? null,
                shopifyInventoryItemId: v?.shopifyInventoryItemId ?? null,
              },
            });
            await subirImagenFila(res.shopifyProductId, actualizado);
            await empujarInventarioFila(actualizado);
          }
        } else {
          const row = rows[0];
          if (row) {
            const ids = await crearProductoEnShopify(row, publicarEnShopify);
            const actualizado = await prisma.producto.update({
              where: { id: row.id },
              data: {
                shopifyProductId: ids.shopifyProductId,
                shopifyVariantId: ids.shopifyVariantId,
                shopifyInventoryItemId: ids.shopifyInventoryItemId,
              },
            });
            await subirImagenFila(actualizado.shopifyProductId!, actualizado);
            await empujarInventarioFila(actualizado);
          }
        }
        shopifySync.ok = true;
      } catch (err) {
        request.log.error(err);
        shopifySync.error = err instanceof Error ? err.message : "Error sincronizando con Shopify";
      }
    }

    return reply
      .code(201)
      .send({ creados: creados.length, grupoVariantes: grupo, productoIds: creados.map((f) => f.id), shopifySync });
  });

  // Elimina un producto y todas sus variantes (del POS y de Shopify). Si el
  // producto tiene ventas asociadas no se puede borrar sin perder el historial,
  // asi que en ese caso se archiva (activo=false) pero igual se quita de Shopify.
  app.delete("/productos/:id", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id } = request.params as { id: string };
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    // Todas las filas del mismo producto (sus variantes).
    const grupo = await prisma.producto.findMany({
      where: {
        empresaId,
        ...(producto.shopifyProductId
          ? { shopifyProductId: producto.shopifyProductId }
          : producto.grupoVariantes
            ? { grupoVariantes: producto.grupoVariantes }
            : { id }),
      },
      select: { id: true, shopifyProductId: true, nombre: true },
    });
    const ids = grupo.map((g) => g.id);
    const shopifyProductIds = [...new Set(grupo.map((g) => g.shopifyProductId).filter((s): s is string => !!s))];

    // 1) Eliminar de Shopify (si aplica). El error se informa pero no impide el
    //    borrado local.
    let shopifyError: string | undefined;
    for (const spid of shopifyProductIds) {
      try {
        await eliminarProductoEnShopify(empresaId, spid);
      } catch (err) {
        request.log.error(err);
        shopifyError = err instanceof Error ? err.message : "Error eliminando en Shopify";
      }
    }

    // 2) Borrado local. Si hay ventas asociadas, se archiva en vez de borrar.
    const conVentas = await prisma.ventaItem.count({ where: { productoId: { in: ids } } });
    let archivado = false;
    if (conVentas > 0) {
      await prisma.producto.updateMany({ where: { id: { in: ids } }, data: { activo: false } });
      archivado = true;
    } else {
      await prisma.$transaction([
        prisma.movimientoInventario.deleteMany({ where: { productoId: { in: ids } } }),
        prisma.producto.deleteMany({ where: { id: { in: ids }, empresaId } }),
      ]);
    }

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: archivado ? "ARCHIVAR_PRODUCTO" : "ELIMINAR_PRODUCTO",
      entidad: "Producto",
      entidadId: id,
      detalle: `${producto.nombre}${ids.length > 1 ? ` (${ids.length} variantes)` : ""}`,
    });

    return {
      ok: true,
      archivado,
      variantesEliminadas: ids.length,
      shopifyError,
      mensaje: archivado
        ? "El producto tenia ventas asociadas: se archivo (ya no aparece) y se elimino de Shopify."
        : "Producto eliminado del POS y de Shopify.",
    };
  });

  // Reintenta la sincronizacion con Shopify de un producto (y sus variantes):
  // si aun no existe alla lo crea, y en todo caso empuja el inventario de la
  // sucursal ecommerce. Sirve cuando la sync fallo al crear el producto.
  app.post("/productos/:id/sincronizar-shopify", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id } = request.params as { id: string };
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    if (!config) return reply.code(400).send({ error: "Conecta Shopify primero (Configuracion → Shopify)" });

    // Filas del grupo (variantes).
    const rows = await prisma.producto.findMany({
      where: {
        empresaId,
        ...(producto.shopifyProductId
          ? { shopifyProductId: producto.shopifyProductId }
          : producto.grupoVariantes
            ? { grupoVariantes: producto.grupoVariantes }
            : { id }),
      },
      orderBy: { varianteTitulo: "asc" },
    });
    const tieneVariantes = rows.length > 1 || rows.some((r) => r.varianteTitulo);

    try {
      const locationId = await asegurarUbicacionEcommerce(empresaId, config.sucursalEcommerceId);

      async function empujarInventario(row: (typeof rows)[number]) {
        if (!row.shopifyInventoryItemId || !locationId) return;
        const inv = await prisma.inventarioSucursal.findUnique({
          where: { productoId_sucursalId: { productoId: row.id, sucursalId: config!.sucursalEcommerceId } },
        });
        await fijarInventarioEnShopify(empresaId, row.shopifyInventoryItemId, locationId, inv?.cantidad ?? 0);
      }

      async function subirImagen(shopifyProductId: string, row: (typeof rows)[number]) {
        if (!row.imagenUrl?.startsWith("data:")) return;
        const base64 = row.imagenUrl.replace(/^data:image\/\w+;base64,/, "");
        const variantIds = row.shopifyVariantId && tieneVariantes ? [row.shopifyVariantId] : undefined;
        const imagenUrl = await subirImagenAShopify(empresaId, shopifyProductId, base64, variantIds);
        await prisma.producto.update({ where: { id: row.id }, data: { imagenUrl } });
      }

      const yaVinculado = rows.some((r) => r.shopifyProductId);
      if (!yaVinculado) {
        if (tieneVariantes) {
          const nombresOpciones = rows[0].grupoOpciones ? rows[0].grupoOpciones.split("|") : [];
          const res = await crearProductoConVariantesEnShopify(
            empresaId,
            { nombre: rows[0].nombre, categoria: rows[0].categoria },
            nombresOpciones,
            rows.map((r) => ({
              titulo: r.varianteTitulo ?? r.sku,
              sku: r.sku,
              precio: Number(r.precio),
              codigoBarras: r.codigoBarras,
            }))
          );
          const porSku = new Map(res.variantes.map((v) => [v.sku, v]));
          for (const row of rows) {
            const v = porSku.get(row.sku);
            const act = await prisma.producto.update({
              where: { id: row.id },
              data: {
                shopifyProductId: res.shopifyProductId,
                shopifyVariantId: v?.shopifyVariantId ?? null,
                shopifyInventoryItemId: v?.shopifyInventoryItemId ?? null,
              },
            });
            await subirImagen(res.shopifyProductId, act).catch((e) => request.log.error(e));
            await empujarInventario(act);
          }
        } else {
          const ids = await crearProductoEnShopify(rows[0]);
          const act = await prisma.producto.update({
            where: { id: rows[0].id },
            data: {
              shopifyProductId: ids.shopifyProductId,
              shopifyVariantId: ids.shopifyVariantId,
              shopifyInventoryItemId: ids.shopifyInventoryItemId,
            },
          });
          await subirImagen(act.shopifyProductId!, act).catch((e) => request.log.error(e));
          await empujarInventario(act);
        }
      } else {
        // Ya existe en Shopify: solo re-empujar inventario.
        for (const row of rows) await empujarInventario(row);
      }

      return { ok: true, mensaje: "Sincronizado con Shopify correctamente." };
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "No se pudo sincronizar con Shopify" });
    }
  });

  // Elimina UNA variante de un producto (una fila), del POS y de Shopify.
  app.delete("/productos/:id/variante", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id } = request.params as { id: string };
    const variante = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!variante) return reply.code(404).send({ error: "Variante no encontrada" });

    // ¿Cuantas filas tiene el grupo? Si es la unica, es borrar el producto entero.
    const hermanos = await prisma.producto.count({
      where: {
        empresaId,
        ...(variante.shopifyProductId
          ? { shopifyProductId: variante.shopifyProductId }
          : variante.grupoVariantes
            ? { grupoVariantes: variante.grupoVariantes }
            : { id }),
      },
    });
    if (hermanos <= 1) {
      return reply.code(400).send({ error: "Es la unica variante: usa 'Eliminar producto' para borrar el producto completo." });
    }

    const conVentas = await prisma.ventaItem.count({ where: { productoId: id } });
    if (conVentas > 0) {
      return reply.code(409).send({ error: "Esta variante tiene ventas asociadas y no se puede eliminar sin perder el historial." });
    }

    // Eliminar la variante en Shopify (si aplica).
    let shopifyError: string | undefined;
    if (variante.shopifyProductId && variante.shopifyVariantId) {
      try {
        await eliminarVarianteEnShopify(empresaId, variante.shopifyProductId, variante.shopifyVariantId);
      } catch (err) {
        request.log.error(err);
        shopifyError = err instanceof Error ? err.message : "Error eliminando la variante en Shopify";
      }
    }

    await prisma.$transaction([
      prisma.movimientoInventario.deleteMany({ where: { productoId: id } }),
      prisma.producto.delete({ where: { id } }),
    ]);

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "ELIMINAR_VARIANTE",
      entidad: "Producto",
      entidadId: id,
      detalle: `${variante.nombre} - ${variante.varianteTitulo ?? variante.sku}`,
    });

    return { ok: true, shopifyError, mensaje: "Variante eliminada del POS y de Shopify." };
  });

  // Opciones del producto en Shopify (Color, Talla...), con sus valores
  // actuales, para que el formulario de "agregar variante" pida un valor por
  // cada opcion y no falle con "You need to add option values".
  app.get("/productos/:id/opciones-shopify", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    if (!producto.shopifyProductId) return { opciones: [] };
    try {
      const opciones = await obtenerOpcionesShopifyProducto(empresaId, producto.shopifyProductId);
      return { opciones };
    } catch (err) {
      request.log.error(err);
      return { opciones: [] };
    }
  });

  // ---------- Galeria de imagenes del producto ----------
  function grupoClaveDe(p: { shopifyProductId: string | null; grupoVariantes: string | null; id: string }): string {
    return p.shopifyProductId ?? p.grupoVariantes ?? p.id;
  }

  app.get("/productos/:id/imagenes", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    return prisma.productoImagen.findMany({
      where: { empresaId, grupoClave: grupoClaveDe(producto) },
      orderBy: [{ esPrincipal: "desc" }, { orden: "asc" }, { creadoEn: "asc" }],
    });
  });

  app.post("/productos/:id/imagenes", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id } = request.params as { id: string };
    const { imagenesDataUrl } = request.body as { imagenesDataUrl?: string[] };
    if (!imagenesDataUrl || imagenesDataUrl.length === 0) return reply.code(400).send({ error: "No hay imagenes" });

    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    const grupoClave = grupoClaveDe(producto);

    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    const existentes = await prisma.productoImagen.count({ where: { empresaId, grupoClave } });

    let ordenBase = existentes;
    const creadas = [];
    for (const dataUrl of imagenesDataUrl) {
      let url = dataUrl;
      let shopifyImageId: string | null = null;
      // Subir a Shopify si el producto esta vinculado.
      if (config && producto.shopifyProductId && dataUrl.startsWith("data:")) {
        try {
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
          const r = await subirImagenGaleria(empresaId, producto.shopifyProductId, base64);
          url = r.url;
          shopifyImageId = r.shopifyImageId;
        } catch (err) {
          request.log.error(err);
        }
      }
      const esPrincipal = existentes === 0 && ordenBase === 0;
      const img = await prisma.productoImagen.create({
        data: { empresaId, grupoClave, url, shopifyImageId, orden: ordenBase, esPrincipal },
      });
      if (esPrincipal) {
        await prisma.producto.update({ where: { id: producto.id }, data: { imagenUrl: url } });
      }
      creadas.push(img);
      ordenBase++;
    }
    return reply.code(201).send(creadas);
  });

  app.patch("/productos/:id/imagenes/:imgId/principal", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id, imgId } = request.params as { id: string; imgId: string };
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    const grupoClave = grupoClaveDe(producto);
    const img = await prisma.productoImagen.findFirst({ where: { id: imgId, empresaId, grupoClave } });
    if (!img) return reply.code(404).send({ error: "Imagen no encontrada" });

    await prisma.$transaction([
      prisma.productoImagen.updateMany({ where: { empresaId, grupoClave }, data: { esPrincipal: false } }),
      prisma.productoImagen.update({ where: { id: imgId }, data: { esPrincipal: true } }),
    ]);
    // La imagen principal se refleja en todas las filas del grupo.
    await prisma.producto.updateMany({
      where: {
        empresaId,
        ...(producto.shopifyProductId
          ? { shopifyProductId: producto.shopifyProductId }
          : producto.grupoVariantes
            ? { grupoVariantes: producto.grupoVariantes }
            : { id }),
      },
      data: { imagenUrl: img.url },
    });
    return { ok: true };
  });

  app.delete("/productos/:id/imagenes/:imgId", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id, imgId } = request.params as { id: string; imgId: string };
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });
    const img = await prisma.productoImagen.findFirst({ where: { id: imgId, empresaId } });
    if (!img) return reply.code(404).send({ error: "Imagen no encontrada" });

    if (producto.shopifyProductId && img.shopifyImageId) {
      try {
        await eliminarImagenEnShopify(empresaId, producto.shopifyProductId, img.shopifyImageId);
      } catch (err) {
        request.log.error(err);
      }
    }
    await prisma.productoImagen.delete({ where: { id: imgId } });
    // Si era principal, promover la siguiente.
    if (img.esPrincipal) {
      const otra = await prisma.productoImagen.findFirst({
        where: { empresaId, grupoClave: img.grupoClave },
        orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
      });
      if (otra) {
        await prisma.productoImagen.update({ where: { id: otra.id }, data: { esPrincipal: true } });
        await prisma.producto.updateMany({
          where: {
            empresaId,
            ...(producto.shopifyProductId
              ? { shopifyProductId: producto.shopifyProductId }
              : producto.grupoVariantes
                ? { grupoVariantes: producto.grupoVariantes }
                : { id }),
          },
          data: { imagenUrl: otra.url },
        });
      }
    }
    return reply.code(204).send();
  });

  // Edicion masiva: aplica los mismos cambios (categoria/proveedor/activo) a
  // varios productos a la vez, desde la seleccion multiple en Inventario.
  app.patch("/productos/bulk", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const parsed = EdicionMasivaProductosSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    const { productoIds, ...cambios } = parsed.data;
    if (Object.keys(cambios).length === 0) {
      return reply.code(400).send({ error: "No hay cambios para aplicar" });
    }

    const resultado = await prisma.producto.updateMany({
      where: { id: { in: productoIds }, empresaId },
      data: cambios,
    });

    registrarAuditoria({
      empresaId,
      usuarioId: request.user.usuarioId,
      accion: "EDICION_MASIVA_PRODUCTOS",
      entidad: "Producto",
      detalle: `${resultado.count} producto(s): ${Object.keys(cambios).join(", ")}`,
    });

    return { actualizados: resultado.count };
  });

  app.patch("/productos/:id", async (request, reply) => {
    const { empresaId } = request.user;
    if (!request.user.permisos.includes("productos.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar productos" });
    }
    const { id } = request.params as { id: string };
    const parsed = CrearProductoSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    }
    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const { sucursalIds, ...datosProducto } = parsed.data;
    if (datosProducto.sku && datosProducto.sku !== producto.sku) {
      const choca = await prisma.producto.findUnique({
        where: { empresaId_sku: { empresaId, sku: datosProducto.sku } },
      });
      if (choca) return reply.code(409).send({ error: "Ya existe otro producto con ese SKU" });
    }
    let actualizado = await prisma.producto.update({ where: { id }, data: datosProducto });

    if (sucursalIds !== undefined) {
      // La disponibilidad se comparte entre todas las variantes del mismo
      // producto de Shopify (misma prenda, distintos talle/color).
      const idsHermanos = producto.shopifyProductId
        ? (
            await prisma.producto.findMany({
              where: { empresaId, shopifyProductId: producto.shopifyProductId },
              select: { id: true },
            })
          ).map((p) => p.id)
        : [id];
      await prisma.$transaction((tx) => sincronizarDisponibilidad(tx, empresaId, idsHermanos, sucursalIds));
      registrarAuditoria({
        empresaId,
        usuarioId: request.user.usuarioId,
        accion: "ACTUALIZAR_DISPONIBILIDAD_PRODUCTO",
        entidad: "Producto",
        entidadId: id,
        detalle: sucursalIds.length > 0 ? `restringido a ${sucursalIds.length} sucursal(es)` : "disponible en todas",
      });
    }

    const conShopify = await empujarProductoAShopify(actualizado);
    if (conShopify.shopifyProductId !== actualizado.shopifyProductId) {
      actualizado = await prisma.producto.update({
        where: { id },
        data: {
          shopifyProductId: conShopify.shopifyProductId,
          shopifyVariantId: conShopify.shopifyVariantId,
          shopifyInventoryItemId: conShopify.shopifyInventoryItemId,
        },
      });
    }

    return actualizado;
  });

  // Sube una imagen (JSON: { dataUrl: "data:image/png;base64,...." }) y la
  // asocia al producto en Shopify (si esta configurado); Shopify hostea la
  // imagen y devuelve la URL publica que guardamos localmente.
  app.post("/productos/:id/imagen", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const { dataUrl } = request.body as { dataUrl?: string };
    if (!dataUrl) return reply.code(400).send({ error: "Falta la imagen" });

    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const config = await prisma.shopifyConfig.findUnique({ where: { empresaId } });
    // Sin Shopify: guardamos la imagen localmente (data URL) para que el
    // catalogo la muestre igual. Con Shopify: la subimos y usamos su URL.
    if (!config) {
      const actualizado = await prisma.producto.update({ where: { id }, data: { imagenUrl: dataUrl } });
      return actualizado;
    }

    let shopifyProductId = producto.shopifyProductId;
    if (!shopifyProductId) {
      const conShopify = await empujarProductoAShopify(producto);
      shopifyProductId = conShopify.shopifyProductId;
      if (shopifyProductId) {
        await prisma.producto.update({
          where: { id },
          data: {
            shopifyProductId: conShopify.shopifyProductId,
            shopifyVariantId: conShopify.shopifyVariantId,
            shopifyInventoryItemId: conShopify.shopifyInventoryItemId,
          },
        });
      }
    }
    if (!shopifyProductId) {
      return reply.code(502).send({ error: "No se pudo vincular el producto con Shopify" });
    }

    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    try {
      const imagenUrl = await subirImagenAShopify(empresaId, shopifyProductId, base64);
      const actualizado = await prisma.producto.update({ where: { id }, data: { imagenUrl } });
      return actualizado;
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: err instanceof Error ? err.message : "No se pudo subir la imagen" });
    }
  });

  // Agrega una nueva variante (ej. otro color) al mismo producto de Shopify.
  // Requiere que el producto ya este vinculado a Shopify (tenga shopifyProductId).
  app.post("/productos/:id/variantes", async (request, reply) => {
    const { empresaId } = request.user;
    const { id } = request.params as { id: string };
    const parsed = CrearVarianteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });

    const producto = await prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    const existente = await prisma.producto.findUnique({
      where: { empresaId_sku: { empresaId, sku: parsed.data.sku } },
    });
    if (existente) return reply.code(409).send({ error: "Ya existe un producto con ese SKU" });

    // Intentar crear en Shopify solo si el producto está vinculado
    let ids: { shopifyVariantId: string; shopifyInventoryItemId: string } | null = null;
    let shopifyError: string | null = null;

    if (producto.shopifyProductId) {
      try {
        ids = await crearVarianteEnShopify(empresaId, producto.shopifyProductId, parsed.data as any);
      } catch (err) {
        request.log.error(err);
        const mensaje = err instanceof Error ? err.message : "";
        if (mensaje.includes("already exists")) {
          return reply.code(409).send({
            error: `Esa combinacion (${parsed.data.opcionValor}) ya existe en este producto. Elige una talla/color diferente.`,
          });
        }
        if (mensaje.includes("linked to a metafield")) {
          return reply.code(502).send({
            error:
              "Este producto usa opciones vinculadas a un metafield en Shopify (por ejemplo, un color estandarizado con muestra de color). " +
              "Shopify no permite crear valores nuevos para ese tipo de opcion desde la API; el valor debe existir ya en la lista de opciones " +
              "definida en Shopify, o tienes que agregarlo primero desde el admin de Shopify.",
          });
        }
        // Si falla, guardar localmente pero avisar del error
        shopifyError = mensaje || "No se pudo sincronizar con Shopify";
        request.log.warn(`[variante] Creando localmente pero Shopify falló: ${shopifyError}`);
      }
    }

    const nuevaVariante = await prisma.$transaction(async (tx) => {
      const nueva = await tx.producto.create({
        data: {
          empresaId,
          sku: parsed.data.sku,
          nombre: producto.nombre,
          categoria: producto.categoria,
          precio: parsed.data.precio,
          costo: producto.costo,
          codigoBarras: parsed.data.codigoBarras,
          varianteTitulo: parsed.data.opcionValor,
          grupoOpciones: producto.grupoOpciones,
          grupoVariantes: producto.grupoVariantes,
          shopifyProductId: producto.shopifyProductId,
          shopifyVariantId: ids?.shopifyVariantId ?? null,
          shopifyInventoryItemId: ids?.shopifyInventoryItemId ?? null,
          imagenUrl: producto.imagenUrl,
        },
      });
      const sucursales = await tx.sucursal.findMany({ where: { empresaId, activo: true } });
      if (sucursales.length > 0) {
        await tx.inventarioSucursal.createMany({
          data: sucursales.map((s) => ({ productoId: nueva.id, sucursalId: s.id, cantidad: 0 })),
        });
      }
      // La nueva variante hereda la disponibilidad por sucursal del producto padre.
      const disponibilidadPadre = await tx.productoSucursal.findMany({ where: { productoId: producto.id } });
      if (disponibilidadPadre.length > 0) {
        await tx.productoSucursal.createMany({
          data: disponibilidadPadre.map((d) => ({ productoId: nueva.id, sucursalId: d.sucursalId })),
        });
      }
      return nueva;
    });

    // Si hay error de Shopify pero la variante se creó localmente, informar al cliente
    if (shopifyError) {
      return reply.code(201).send({
        ...nuevaVariante,
        _warning: `Variante creada localmente, pero no se pudo sincronizar con Shopify: ${shopifyError}. Se sincronizará cuando conectes este producto.`,
      });
    }

    return reply.code(201).send(nuevaVariante);
  });

  // Importar productos desde CSV
  app.post("/productos/importar", async (request, reply) => {
    const { empresaId } = request.user;
    const { productos } = request.body as {
      productos: Array<{
        sku: string;
        nombre: string;
        categoria?: string;
        precio?: number;
        costo?: number;
        codigoBarras?: string;
      }>;
    };

    if (!Array.isArray(productos) || productos.length === 0) {
      return reply.code(400).send({ error: "Se requiere un array de productos" });
    }

    const resultados = {
      creados: 0,
      actualizados: 0,
      errores: [] as string[],
    };

    try {
      for (const prod of productos) {
        if (!prod.sku || !prod.nombre) {
          resultados.errores.push(`Falta SKU o nombre en producto`);
          continue;
        }

        try {
          const existente = await prisma.producto.findUnique({
            where: { empresaId_sku: { empresaId, sku: prod.sku } },
          });

          if (existente) {
            // Actualizar producto existente
            await prisma.producto.update({
              where: { id: existente.id },
              data: {
                nombre: prod.nombre,
                categoria: prod.categoria || undefined,
                precio: prod.precio ?? undefined,
                costo: prod.costo ?? undefined,
                codigoBarras: prod.codigoBarras || undefined,
              },
            });
            resultados.actualizados++;
          } else {
            // Crear nuevo producto
            await prisma.producto.create({
              data: {
                id: randomUUID(),
                empresaId,
                sku: prod.sku,
                nombre: prod.nombre,
                categoria: prod.categoria || null,
                precio: prod.precio ?? 0,
                costo: prod.costo ?? 0,
                codigoBarras: prod.codigoBarras || null,
                activo: true,
              },
            });
            resultados.creados++;
          }
        } catch (err) {
          resultados.errores.push(`Error procesando SKU ${prod.sku}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return reply.code(200).send(resultados);
    } catch (err) {
      request.log.error(err, "Error importando productos");
      return reply.code(500).send({
        error: "Error procesando importación",
        detalles: process.env.NODE_ENV === "development" ? String(err) : undefined,
      });
    }
  });
}
