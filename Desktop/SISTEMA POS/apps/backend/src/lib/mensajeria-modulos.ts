import { prisma } from "./prisma.js";
import { emitMensajeNuevo } from "./ws.js";
import { enviarAdjuntoMeta, enviarTextoMeta, resumenDe, VENTANA_RESPUESTA_MS } from "./mensajeria.js";
import { guardarAdjunto } from "./mensajeria-medios.js";

// Conexión de la bandeja de Mensajes con los demás módulos de CENTRALA:
// - Productos: enviar la ficha de un producto (foto, precio, tallas/colores disponibles).
// - Ventas: enviar el resumen de una compra.
// - Facturación electrónica: enviar el PDF de la factura (o emitirla y enviarla al aprobarse).

export class ErrorChat extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Conversacion = NonNullable<Awaited<ReturnType<typeof conversacionAbierta>>>;

/** La conversación, verificando que sea de la empresa y que Meta deje responder (24 horas). */
export async function conversacionAbierta(empresaId: string, conversacionId: string) {
  const c = await prisma.conversacionMensajeria.findFirst({
    where: { id: conversacionId, empresaId },
    include: { canal: true },
  });
  if (!c || !c.canal.activo) throw new ErrorChat("Conversación no encontrada", 404);
  if (!c.ultimoEntranteEn || Date.now() - c.ultimoEntranteEn.getTime() >= VENTANA_RESPUESTA_MS) {
    throw new ErrorChat(
      "Pasaron más de 24 horas desde el último mensaje del cliente: Meta no permite escribirle hasta que vuelva a escribir.",
      409
    );
  }
  return c;
}

async function registrarSaliente(
  c: Conversacion,
  datos: { tipo?: string; texto?: string | null; adjuntoUrl?: string | null; externoId: string; usuarioId?: string | null }
) {
  const mensaje = await prisma.mensajeMensajeria.create({
    data: {
      empresaId: c.empresaId,
      conversacionId: c.id,
      direccion: "SALIENTE",
      tipo: datos.tipo ?? "TEXTO",
      texto: datos.texto ?? null,
      adjuntoUrl: datos.adjuntoUrl ?? null,
      externoId: datos.externoId,
      usuarioId: datos.usuarioId ?? null,
    },
  });
  await prisma.conversacionMensajeria.update({
    where: { id: c.id },
    data: { ultimoMensajeEn: mensaje.creadoEn, ultimoMensajeTexto: resumenDe(mensaje.tipo, mensaje.texto), noLeidos: 0 },
  });
  emitMensajeNuevo(c.empresaId, { conversacionId: c.id, mensajeId: mensaje.id, tipoCanal: c.canal.tipo, direccion: "SALIENTE" });
  return mensaje;
}

/** Envía una foto/documento + texto. En WhatsApp el texto va como pie de la foto o el documento. */
async function enviarConAdjunto(
  c: Conversacion,
  adjunto: { tipo: "IMAGEN" | "ARCHIVO"; url: string; nombre?: string | null } | null,
  texto: string,
  usuarioId?: string | null
) {
  if (adjunto) {
    const textoJunto = c.canal.tipo === "WHATSAPP";
    const externoId = await enviarAdjuntoMeta(c.canal, c.contactoExternoId, { ...adjunto, texto: textoJunto ? texto : null });
    await registrarSaliente(c, { tipo: adjunto.tipo, adjuntoUrl: adjunto.url, texto: textoJunto ? texto : null, externoId, usuarioId });
    if (textoJunto) return;
  }
  const externoId = await enviarTextoMeta(c.canal, c.contactoExternoId, texto);
  await registrarSaliente(c, { texto, externoId, usuarioId });
}

// ---------- Productos ----------

const SELECT_PRODUCTO = {
  id: true,
  nombre: true,
  sku: true,
  precio: true,
  descripcion: true,
  categoria: true,
  marca: true,
  imagenUrl: true,
  varianteTitulo: true,
  grupoOpciones: true,
  shopifyProductId: true,
  grupoVariantes: true,
  inventario: { select: { cantidad: true } },
} as const;

type FilaProducto = {
  id: string;
  nombre: string;
  sku: string;
  precio: unknown;
  descripcion: string | null;
  categoria: string | null;
  marca: string | null;
  imagenUrl: string | null;
  varianteTitulo: string | null;
  grupoOpciones: string | null;
  shopifyProductId: string | null;
  grupoVariantes: string | null;
  inventario: { cantidad: number }[];
};

const claveGrupo = (p: FilaProducto) =>
  p.shopifyProductId ? `s:${p.shopifyProductId}` : p.grupoVariantes ? `g:${p.grupoVariantes}` : `p:${p.id}`;
const stockDe = (p: FilaProducto) => p.inventario.reduce((a, i) => a + Math.max(0, i.cantidad), 0);

// Tallas en su orden natural (XS, S, M, L, XL…), luego números y luego el resto alfabético.
const TALLAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];
function ordenVariante(titulo: string): [number, number, string] {
  const primero = titulo.split("/")[0].trim().toUpperCase();
  const talla = TALLAS.indexOf(primero);
  if (talla >= 0) return [0, talla, titulo];
  const n = Number(primero.replace(",", "."));
  if (Number.isFinite(n)) return [1, n, titulo];
  return [2, 0, titulo.toLowerCase()];
}
function compararVariantes(a: { titulo: string }, b: { titulo: string }) {
  const [x1, y1, z1] = ordenVariante(a.titulo);
  const [x2, y2, z2] = ordenVariante(b.titulo);
  return x1 - x2 || y1 - y2 || z1.localeCompare(z2, "es");
}
const plural = (palabra: string) => (/[aeiouáéíóú]$/i.test(palabra) ? `${palabra}s` : `${palabra}es`);

function agrupar(filas: FilaProducto[]) {
  const grupos = new Map<string, FilaProducto[]>();
  for (const f of filas) {
    const k = claveGrupo(f);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.values()].map((vs) => {
    const base = vs[0];
    const precios = vs.map((v) => Number(v.precio));
    return {
      id: base.id,
      nombre: base.nombre,
      imagenUrl: vs.find((v) => v.imagenUrl && !v.imagenUrl.startsWith("data:"))?.imagenUrl ?? (base.imagenUrl ? "local" : null),
      precioDesde: Math.min(...precios),
      precioHasta: Math.max(...precios),
      stock: vs.reduce((a, v) => a + stockDe(v), 0),
      variantes: vs
        .filter((v) => v.varianteTitulo)
        .map((v) => ({ id: v.id, titulo: v.varianteTitulo!, precio: Number(v.precio), stock: stockDe(v) }))
        .sort(compararVariantes),
    };
  });
}

/** Busca productos para mandar por el chat (agrupa las tallas/colores de un mismo producto). */
export async function buscarProductosChat(empresaId: string, q: string) {
  const texto = normalizar(q.trim());
  const filas = (await prisma.producto.findMany({
    where: { empresaId, activo: true },
    select: { ...SELECT_PRODUCTO, codigoBarras: true },
    orderBy: { nombre: "asc" },
  })) as (FilaProducto & { codigoBarras: string | null })[];
  const palabras = texto.split(/\s+/).filter(Boolean);
  const coinciden = palabras.length
    ? filas.filter((f) => {
        const t = normalizar(`${f.nombre} ${f.sku} ${f.codigoBarras ?? ""} ${f.categoria ?? ""} ${f.marca ?? ""} ${f.varianteTitulo ?? ""}`);
        return palabras.every((p) => t.includes(p) || (p.endsWith("s") && t.includes(p.slice(0, -1))));
      })
    : filas;
  // Para mostrar todas las tallas/colores del producto encontrado, se traen sus hermanas.
  const claves = new Set(coinciden.map(claveGrupo));
  return agrupar(filas.filter((f) => claves.has(claveGrupo(f)))).slice(0, 25);
}

/** Arma el texto de la ficha y la foto de un producto (con todas sus tallas/colores). */
export async function fichaProducto(empresaId: string, productoId: string, opciones: { mostrarAgotadas?: boolean } = {}) {
  const p = (await prisma.producto.findFirst({ where: { id: productoId, empresaId }, select: SELECT_PRODUCTO })) as FilaProducto | null;
  if (!p) throw new ErrorChat("Producto no encontrado", 404);
  const hermanas = (p.shopifyProductId || p.grupoVariantes
    ? await prisma.producto.findMany({
        where: {
          empresaId,
          activo: true,
          ...(p.shopifyProductId ? { shopifyProductId: p.shopifyProductId } : { grupoVariantes: p.grupoVariantes }),
        },
        select: SELECT_PRODUCTO,
      })
    : [p]) as FilaProducto[];
  const [grupo] = agrupar(hermanas.length ? hermanas : [p]);

  const lineas: string[] = [`*${p.nombre}*`];
  lineas.push(
    grupo.precioDesde === grupo.precioHasta ? `💲 ${pesos(grupo.precioDesde)}` : `💲 Desde ${pesos(grupo.precioDesde)} hasta ${pesos(grupo.precioHasta)}`
  );
  if (grupo.variantes.length) {
    const nombreOpciones = p.grupoOpciones
      ?.split("|")
      .map((o) => plural(o.trim().toLowerCase()))
      .join(" / ")
      .replace(/^./, (l) => l.toUpperCase());
    const disponibles = grupo.variantes.filter((v) => v.stock > 0);
    const agotadas = grupo.variantes.filter((v) => v.stock <= 0);
    const conPrecio = (v: { titulo: string; precio: number }) =>
      grupo.precioDesde !== grupo.precioHasta ? `${v.titulo} (${pesos(v.precio)})` : v.titulo;
    lineas.push(
      disponibles.length
        ? `✅ ${nombreOpciones ? `${nombreOpciones} disponibles` : "Disponible en"}: ${disponibles.map(conPrecio).join(", ")}`
        : "⚠️ Agotado por ahora"
    );
    if (opciones.mostrarAgotadas && agotadas.length) lineas.push(`Agotado: ${agotadas.map((v) => v.titulo).join(", ")}`);
  } else {
    lineas.push(grupo.stock > 0 ? "✅ Disponible" : "⚠️ Agotado por ahora");
  }
  const detalles = [p.marca && `Marca: ${p.marca}`, p.categoria && `Categoría: ${p.categoria}`].filter(Boolean);
  if (detalles.length) lineas.push(detalles.join(" · "));
  if (p.descripcion?.trim()) {
    const d = p.descripcion.trim().replace(/\n{3,}/g, "\n\n");
    lineas.push("", d.length > 500 ? `${d.slice(0, 500).trim()}…` : d);
  }
  if (!grupo.variantes.length) lineas.push("", `Ref: ${p.sku}`);

  // Foto: la de Shopify es un enlace público; la cargada en CENTRALA viene incrustada y se guarda
  // como adjunto para tener un enlace que Meta pueda descargar.
  const imagen = hermanas.find((h) => h.imagenUrl && !h.imagenUrl.startsWith("data:"))?.imagenUrl ?? hermanas.find((h) => h.imagenUrl)?.imagenUrl ?? p.imagenUrl;
  return { texto: lineas.join("\n"), imagen, grupo };
}

async function urlPublicaImagen(empresaId: string, imagen: string | null): Promise<string | null> {
  if (!imagen) return null;
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(imagen);
  if (m) return (await guardarAdjunto(empresaId, Buffer.from(m[2], "base64"), m[1].toLowerCase(), "producto")).url;
  return /^https:\/\//i.test(imagen) ? imagen : null;
}

export async function enviarProductoChat(
  empresaId: string,
  conversacionId: string,
  productoId: string,
  opciones: { texto?: string; conFoto?: boolean; usuarioId?: string }
) {
  const c = await conversacionAbierta(empresaId, conversacionId);
  const ficha = await fichaProducto(empresaId, productoId);
  const texto = (opciones.texto?.trim() || ficha.texto).slice(0, 1000);
  const url = opciones.conFoto === false ? null : await urlPublicaImagen(empresaId, ficha.imagen);
  await enviarConAdjunto(c, url ? { tipo: "IMAGEN", url } : null, texto, opciones.usuarioId);
}

// ---------- Compras y facturas ----------

const NOMBRE_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  CREDITO: "Crédito",
  QR: "QR",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
};

/** Compras del cliente vinculado a la conversación, con el estado de su factura electrónica. */
export async function comprasDeConversacion(empresaId: string, conversacionId: string) {
  const c = await prisma.conversacionMensajeria.findFirst({ where: { id: conversacionId, empresaId } });
  if (!c) throw new ErrorChat("Conversación no encontrada", 404);
  if (!c.clienteId) return { clienteVinculado: false, compras: [] };
  const ventas = await prisma.venta.findMany({
    where: { empresaId, clienteId: c.clienteId },
    orderBy: { fecha: "desc" },
    take: 15,
    select: { id: true, consecutivo: true, fecha: true, total: true, metodoPago: true, _count: { select: { items: true } } },
  });
  const comprobantes = await prisma.comprobanteElectronico.findMany({
    where: { empresaId, ventaId: { in: ventas.map((v) => v.id) }, tipo: "FACTURA" },
    orderBy: { creadoEn: "desc" },
  });
  return {
    clienteVinculado: true,
    compras: ventas.map((v) => {
      const f = comprobantes.find((x) => x.ventaId === v.id);
      return {
        id: v.id,
        consecutivo: v.consecutivo,
        fecha: v.fecha,
        total: Number(v.total),
        metodoPago: v.metodoPago,
        productos: v._count.items,
        factura: f ? { id: f.id, estado: f.estado, numero: f.numero, tienePdf: !!f.urlPdf, error: f.ultimoError } : null,
      };
    }),
  };
}

export async function resumenCompraTexto(empresaId: string, ventaId: string) {
  const v = await prisma.venta.findFirst({
    where: { id: ventaId, empresaId },
    include: {
      empresa: { select: { nombre: true } },
      items: { include: { producto: { select: { nombre: true, varianteTitulo: true } } } },
    },
  });
  if (!v) throw new ErrorChat("Venta no encontrada", 404);
  const lineas = [
    `🧾 *Resumen de tu compra #${v.consecutivo}*`,
    `${v.empresa.nombre} · ${v.fecha.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" })}`,
    "",
  ];
  for (const i of v.items) {
    const cant = i.cantidad - i.cantidadDevuelta;
    if (cant <= 0) continue;
    const nombre = i.producto
      ? i.producto.varianteTitulo
        ? `${i.producto.nombre} (${i.producto.varianteTitulo})`
        : i.producto.nombre
      : i.descripcionLibre || "Producto";
    lineas.push(`• ${cant} x ${nombre} — ${pesos(cant * Number(i.precioUnitario))}`);
  }
  if (v.descuento && Number(v.descuento) > 0) lineas.push(`Descuento: -${pesos(Number(v.descuento))}`);
  lineas.push("", `*Total: ${pesos(Number(v.total))}*`, `Pago: ${NOMBRE_PAGO[v.metodoPago] ?? v.metodoPago}`, "", "¡Gracias por tu compra! 🙌");
  return lineas.join("\n");
}

export async function enviarResumenCompraChat(empresaId: string, conversacionId: string, ventaId: string, usuarioId?: string) {
  const c = await conversacionAbierta(empresaId, conversacionId);
  await enviarConAdjunto(c, null, await resumenCompraTexto(empresaId, ventaId), usuarioId);
}

/** Envía el PDF de una factura electrónica ya emitida por el chat. */
export async function enviarFacturaChat(empresaId: string, comprobanteId: string, conversacionId: string, usuarioId?: string | null) {
  const f = await prisma.comprobanteElectronico.findFirst({ where: { id: comprobanteId, empresaId } });
  if (!f || f.estado !== "EMITIDA") throw new ErrorChat("La factura todavía no está emitida");
  if (!f.urlPdf) throw new ErrorChat("TFactura no entregó el PDF de esta factura");
  const c = await conversacionAbierta(empresaId, conversacionId);
  const venta = await prisma.venta.findUnique({ where: { id: f.ventaId }, select: { consecutivo: true } });
  const nombre = `Factura-${f.numero ?? venta?.consecutivo ?? "electronica"}.pdf`.replace(/[^\w.-]/g, "_");

  // Se guarda una copia en CENTRALA: así el enlace siempre funciona y lleva el nombre del archivo.
  let url = f.urlPdf;
  try {
    const res = await fetch(f.urlPdf, { signal: AbortSignal.timeout(30_000) });
    const tipo = res.headers.get("content-type") ?? "";
    if (res.ok && tipo.includes("pdf")) url = (await guardarAdjunto(empresaId, Buffer.from(await res.arrayBuffer()), "application/pdf", nombre)).url;
  } catch {
    /* se usa el enlace de TFactura */
  }
  const texto = `Aquí está tu factura electrónica ${f.numero ?? ""} de la compra #${venta?.consecutivo ?? ""}. ¡Gracias por tu compra! 🙌`
    .replace(/\s+/g, " ")
    .trim();
  if (c.canal.tipo === "INSTAGRAM") {
    // Instagram no recibe documentos: se manda el enlace.
    await enviarConAdjunto(c, null, `${texto}\n${url}`, usuarioId);
  } else {
    await enviarConAdjunto(c, { tipo: "ARCHIVO", url, nombre }, texto, usuarioId);
  }
  await prisma.comprobanteElectronico.update({ where: { id: f.id }, data: { enviarAConversacionId: null } });
}

/** La conversación más reciente del cliente de una venta en la que todavía se le puede escribir. */
export async function conversacionDeVenta(empresaId: string, ventaId: string) {
  const v = await prisma.venta.findFirst({ where: { id: ventaId, empresaId }, select: { clienteId: true } });
  if (!v?.clienteId) return null;
  const conversaciones = await prisma.conversacionMensajeria.findMany({
    where: { empresaId, clienteId: v.clienteId, canal: { activo: true } },
    include: { canal: { select: { tipo: true, nombre: true, usuario: true } } },
    orderBy: { ultimoMensajeEn: "desc" },
  });
  const abierta = conversaciones.find((c) => c.ultimoEntranteEn && Date.now() - c.ultimoEntranteEn.getTime() < VENTANA_RESPUESTA_MS);
  const c = abierta ?? conversaciones[0];
  if (!c) return null;
  return { id: c.id, tipoCanal: c.canal.tipo, contacto: c.contactoNombre || c.contactoUsuario, ventanaAbierta: c === abierta };
}
