import { z } from "zod";

// ---------- Enums (mirror Prisma enums) ----------

export const RolUsuario = z.enum(["ADMIN", "GERENTE", "SUPERVISOR", "CAJERO", "BODEGA"]);
export type RolUsuario = z.infer<typeof RolUsuario>;

// ---------- Permisos ----------

export const PERMISOS = [
  "ventas.ver",
  "ventas.crear",
  "ventas.editar",
  "ventas.eliminar",
  "ventas.sin_stock",
  "productos.administrar",
  "inventario.administrar",
  "reportes.ver",
  "clientes.administrar",
  "creditos.administrar",
  "gastos.administrar",
  "configuracion.administrar",
  "sucursales.administrar",
  "usuarios.administrar",
  "devoluciones.realizar",
  "descuentos.aplicar",
  "facturas.anular",
  "caja.administrar",
  "contabilidad.ver",
  "contabilidad.administrar",
] as const;
export type Permiso = (typeof PERMISOS)[number];

export const ETIQUETAS_PERMISOS: Record<Permiso, string> = {
  "ventas.ver": "Ver ventas",
  "ventas.crear": "Crear ventas",
  "ventas.editar": "Editar ventas",
  "ventas.eliminar": "Eliminar ventas",
  "productos.administrar": "Administrar productos",
  "inventario.administrar": "Administrar inventario",
  "reportes.ver": "Ver reportes",
  "clientes.administrar": "Administrar clientes",
  "creditos.administrar": "Administrar creditos",
  "gastos.administrar": "Gestionar gastos",
  "configuracion.administrar": "Configuracion del sistema",
  "sucursales.administrar": "Administrar sucursales",
  "usuarios.administrar": "Administrar usuarios",
  "devoluciones.realizar": "Realizar devoluciones",
  "descuentos.aplicar": "Aplicar descuentos",
  "facturas.anular": "Anular facturas",
  "ventas.sin_stock": "Vender sin existencias",
  "caja.administrar": "Abrir y cerrar caja",
  "contabilidad.ver": "Ver contabilidad",
  "contabilidad.administrar": "Administrar contabilidad",
};

// Roles predefinidos con sus permisos por defecto. "GERENTE" se mantiene solo
// por compatibilidad con cuentas creadas antes de este cambio (equivale a
// SUPERVISOR); ya no se ofrece al crear usuarios nuevos.
export const PERMISOS_POR_ROL: Record<RolUsuario, Permiso[]> = {
  ADMIN: [...PERMISOS],
  GERENTE: [
    "ventas.ver",
    "ventas.crear",
    "ventas.editar",
    "productos.administrar",
    "inventario.administrar",
    "reportes.ver",
    "clientes.administrar",
    "creditos.administrar",
    "gastos.administrar",
    "devoluciones.realizar",
    "descuentos.aplicar",
    "caja.administrar",
    "ventas.sin_stock",
    "contabilidad.ver",
    "contabilidad.administrar",
  ],
  SUPERVISOR: [
    "ventas.ver",
    "ventas.crear",
    "ventas.editar",
    "productos.administrar",
    "inventario.administrar",
    "reportes.ver",
    "clientes.administrar",
    "creditos.administrar",
    "gastos.administrar",
    "devoluciones.realizar",
    "descuentos.aplicar",
    "caja.administrar",
    "ventas.sin_stock",
    "contabilidad.ver",
    "contabilidad.administrar",
  ],
  CAJERO: [
    "ventas.ver",
    "ventas.crear",
    "clientes.administrar",
    "creditos.administrar",
    "descuentos.aplicar",
    "caja.administrar",
  ],
  BODEGA: ["inventario.administrar", "productos.administrar", "reportes.ver"],
};

export const TipoSucursal = z.enum(["FISICA", "ECOMMERCE"]);
export type TipoSucursal = z.infer<typeof TipoSucursal>;

export const TipoMovimiento = z.enum(["ENTRADA", "SALIDA", "TRASLADO", "AJUSTE", "VENTA"]);
export type TipoMovimiento = z.infer<typeof TipoMovimiento>;

export const MetodoPago = z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "CREDITO", "OTRO"]);
export type MetodoPago = z.infer<typeof MetodoPago>;

export const CanalVenta = z.enum(["POS", "SHOPIFY", "WHATSAPP", "OTRO"]);
export type CanalVenta = z.infer<typeof CanalVenta>;

export const ETIQUETAS_CANAL: Record<CanalVenta, string> = {
  POS: "Punto de venta",
  SHOPIFY: "Shopify",
  WHATSAPP: "WhatsApp",
  OTRO: "Otro",
};

// ---------- Auth ----------

export const RegistroEmpresaSchema = z.object({
  empresaNombre: z.string().min(2),
  adminNombre: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});
export type RegistroEmpresaInput = z.infer<typeof RegistroEmpresaSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// ---------- Sucursales ----------

export const CrearSucursalSchema = z.object({
  nombre: z.string().min(1),
  tipo: TipoSucursal.default("FISICA"),
  direccion: z.string().optional(),
});
export type CrearSucursalInput = z.infer<typeof CrearSucursalSchema>;

// ---------- Productos ----------

export const CrearProductoSchema = z.object({
  sku: z.string().min(1),
  nombre: z.string().min(1),
  categoria: z.string().optional(),
  marca: z.string().nullable().optional(),
  descripcion: z.string().nullable().optional(),
  impuestoPorcentaje: z.number().min(0).max(100).optional(),
  precio: z.number().nonnegative(),
  costo: z.number().nonnegative().default(0),
  codigoBarras: z.string().optional(),
  activo: z.boolean().optional(),
  proveedorId: z.string().nullable().optional(),
  // Stock minimo para el recordatorio de reposicion (0 = sin aviso).
  stockMinimo: z.number().int().nonnegative().optional(),
  // undefined u [] = disponible en todas las sucursales.
  sucursalIds: z.array(z.string()).optional(),
});
export type CrearProductoInput = z.infer<typeof CrearProductoSchema>;

// Creacion "inteligente": un producto base + combinaciones de variantes
// generadas desde grupos (ej. Color x Talla). Si no hay variantes, se crea un
// solo producto. La imagen va como dataUrl (base64) y Shopify/local la hostea.
export const VarianteCombinadaSchema = z.object({
  titulo: z.string().min(1), // ej. "Negro / 38"
  sku: z.string().min(1),
  codigoBarras: z.string().optional(),
  precio: z.number().nonnegative().optional(), // si difiere del base
  stockInicial: z.number().int().nonnegative().optional(),
  imagenDataUrl: z.string().optional(),
});

export const CrearProductoCompletoSchema = z.object({
  sku: z.string().min(1),
  nombre: z.string().min(1),
  categoria: z.string().optional(),
  marca: z.string().optional(),
  descripcion: z.string().optional(),
  impuestoPorcentaje: z.number().min(0).max(100).optional(),
  precio: z.number().nonnegative(),
  costo: z.number().nonnegative().default(0),
  codigoBarras: z.string().optional(),
  activo: z.boolean().optional(),
  proveedorId: z.string().nullable().optional(),
  sucursalIds: z.array(z.string()).optional(),
  stockInicial: z.number().int().nonnegative().optional(), // para el sucursal activo, sin variantes
  sucursalStockId: z.string().optional(),
  imagenesDataUrl: z.array(z.string()).optional(), // la primera = principal
  // Nombres de las opciones en el orden en que aparecen en el titulo de cada
  // variante (ej. ["Color", "Talla"] para un titulo "Negro / 38"). Se usan para
  // nombrar las opciones del producto en Shopify.
  nombresOpciones: z.array(z.string()).optional(),
  // Si es false, el producto se crea en Shopify como borrador (no visible en la
  // tienda). Por defecto se publica.
  publicarEnShopify: z.boolean().optional(),
  variantes: z.array(VarianteCombinadaSchema).optional(),
});
export type CrearProductoCompletoInput = z.infer<typeof CrearProductoCompletoSchema>;

// Edicion masiva: solo los campos incluidos se actualizan, en todos los
// productos de la lista.
export const EdicionMasivaProductosSchema = z.object({
  productoIds: z.array(z.string()).min(1),
  categoria: z.string().optional(),
  proveedorId: z.string().nullable().optional(),
  activo: z.boolean().optional(),
});
export type EdicionMasivaProductosInput = z.infer<typeof EdicionMasivaProductosSchema>;

// Ajuste directo de stock (fija la cantidad absoluta, en vez de un delta por
// movimiento) desde la edicion rapida de Inventario.
export const AjustarStockDirectoSchema = z.object({
  productoId: z.string(),
  sucursalId: z.string(),
  cantidad: z.number().int().nonnegative(),
  motivo: z.string().optional(),
});
export type AjustarStockDirectoInput = z.infer<typeof AjustarStockDirectoSchema>;

// ---------- Inventario ----------

export const RegistrarMovimientoSchema = z.object({
  productoId: z.string(),
  sucursalId: z.string(),
  tipo: TipoMovimiento,
  cantidad: z.number().int().positive(),
  motivo: z.string().optional(),
  sucursalDestinoId: z.string().optional(),
});
export type RegistrarMovimientoInput = z.infer<typeof RegistrarMovimientoSchema>;

// ---------- Ventas ----------

// Un item de venta es un producto del inventario (productoId) o una "venta
// libre": un concepto suelto con su descripcion, que no descuenta stock.
export const VentaItemSchema = z
  .object({
    productoId: z.string().optional().or(z.null()),
    descripcionLibre: z.string().optional().or(z.null()),
    cantidad: z.number().int().positive(),
    precioUnitario: z.number().nonnegative(),
  })
  .refine((i) => !!(i.productoId && i.productoId.trim()) || !!(i.descripcionLibre && i.descripcionLibre.trim()), {
    message: "Cada item debe tener un producto o una descripción",
  });
export type VentaItemInput = z.infer<typeof VentaItemSchema>;

export const ContactoClienteSchema = z.object({
  nombre: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefono: z.string().optional(),
  cedula: z.string().optional(),
});
export type ContactoClienteInput = z.infer<typeof ContactoClienteSchema>;

export const DescuentoVentaSchema = z.object({
  tipo: z.enum(["PORCENTAJE", "VALOR"]),
  valor: z.number().positive(),
});
export type DescuentoVentaInput = z.infer<typeof DescuentoVentaSchema>;

export const CrearVentaSchema = z.object({
  clienteUuid: z.string().uuid(), // generated client-side, used for offline dedupe
  sucursalId: z.string(),
  clienteId: z.string().optional(),
  contactoCliente: ContactoClienteSchema.optional(),
  metodoPago: MetodoPago,
  // Cuenta bancaria que recibio el pago (para tarjeta/transferencia/QR).
  cuentaBancariaId: z.string().optional(),
  items: z.array(VentaItemSchema).min(1),
  // Solo aplica (y se guarda) cuando metodoPago = EFECTIVO.
  dineroRecibido: z.number().nonnegative().optional(),
  // Requiere permiso descuentos.aplicar; el backend calcula el monto final.
  descuento: DescuentoVentaSchema.optional(),
  // Requiere cliente seleccionado y programa de fidelizacion configurado.
  puntosARedimir: z.number().int().positive().optional(),
  // Nota libre de la venta (se guarda y sale en el historial).
  observaciones: z.string().optional(),
  // Solo para ventas a credito: numero de cuotas y plazo en meses.
  numeroCuotas: z.number().int().positive().optional(),
  plazoMeses: z.number().int().positive().optional(),
});
export type CrearVentaInput = z.infer<typeof CrearVentaSchema>;

export const DevolucionParcialSchema = z.object({
  items: z.array(z.object({ productoId: z.string(), cantidad: z.number().int().positive() })).min(1),
  motivo: z.string().optional(),
});
export type DevolucionParcialInput = z.infer<typeof DevolucionParcialSchema>;

// ---------- Clientes / cobranza ----------

export const CrearClienteSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  direccion: z.string().optional(),
  cedula: z.string().optional(),
  ciudad: z.string().optional(),
});
export type CrearClienteInput = z.infer<typeof CrearClienteSchema>;

export const RegistrarAbonoSchema = z.object({
  clienteId: z.string(),
  monto: z.number().positive(),
  metodoPago: MetodoPago.default("EFECTIVO"),
});
export type RegistrarAbonoInput = z.infer<typeof RegistrarAbonoSchema>;

// ---------- Creditos ----------

export const EstadoCredito = z.enum(["VIGENTE", "PROXIMO_A_VENCER", "VENCIDO", "PAGADO"]);
export type EstadoCredito = z.infer<typeof EstadoCredito>;

export const ActualizarConfigCreditoSchema = z.object({
  diasVencimientoCredito: z.number().int().positive(),
});
export type ActualizarConfigCreditoInput = z.infer<typeof ActualizarConfigCreditoSchema>;

// ---------- Caja ----------

// Saldo de una cuenta bancaria capturado al abrir/cerrar el turno.
export const SaldoCuentaTurnoSchema = z.object({
  cuentaId: z.string(),
  saldo: z.number(),
});

export const AbrirCajaSchema = z.object({
  sucursalId: z.string(),
  montoInicial: z.number().nonnegative(),
  saldosIniciales: z.array(SaldoCuentaTurnoSchema).optional(),
});
export type AbrirCajaInput = z.infer<typeof AbrirCajaSchema>;

export const CerrarCajaSchema = z.object({
  sucursalId: z.string(),
  montoContado: z.number().nonnegative(),
  // Saldo final (contado) de cada cuenta bancaria al cerrar el turno.
  saldosFinales: z.array(SaldoCuentaTurnoSchema).optional(),
});
export type CerrarCajaInput = z.infer<typeof CerrarCajaSchema>;

// ---------- Cuentas bancarias ----------
export const CrearCuentaBancariaSchema = z.object({
  nombre: z.string().min(1),
  banco: z.string().optional(),
  numeroCuenta: z.string().optional(),
  tipoCuenta: z.string().optional(),
  saldoInicial: z.number().default(0),
  activa: z.boolean().optional(),
});
export type CrearCuentaBancariaInput = z.infer<typeof CrearCuentaBancariaSchema>;

// ---------- Calendario / Agenda ----------
export const PrioridadEvento = z.enum(["BAJA", "MEDIA", "ALTA"]);
export type PrioridadEvento = z.infer<typeof PrioridadEvento>;
export const EstadoEvento = z.enum(["PENDIENTE", "EN_PROCESO", "COMPLETADO"]);
export type EstadoEvento = z.infer<typeof EstadoEvento>;
export const TipoEvento = z.enum(["TAREA", "RECORDATORIO", "EVENTO", "REUNION", "SEGUIMIENTO"]);
export type TipoEvento = z.infer<typeof TipoEvento>;

export const CrearEventoSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  fecha: z.string(), // ISO date
  hora: z.string().optional(),
  prioridad: PrioridadEvento.optional(),
  estado: EstadoEvento.optional(),
  tipo: TipoEvento.optional(),
  responsableId: z.string().nullable().optional(),
});
export type CrearEventoInput = z.infer<typeof CrearEventoSchema>;

// ---------- Fidelizacion ----------

export const FidelizacionConfigSchema = z.object({
  // null = programa desactivado
  pesosPorPunto: z.number().positive().nullable(),
  valorPunto: z.number().positive().nullable(),
});
export type FidelizacionConfigInput = z.infer<typeof FidelizacionConfigSchema>;

// ---------- Proveedores / compras ----------

export const CrearProveedorSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  direccion: z.string().optional(),
});
export type CrearProveedorInput = z.infer<typeof CrearProveedorSchema>;

export const CompraItemSchema = z.object({
  productoId: z.string(),
  cantidad: z.number().int().positive(),
  costoUnitario: z.number().nonnegative(),
});
export type CompraItemInput = z.infer<typeof CompraItemSchema>;

export const CrearCompraSchema = z.object({
  proveedorId: z.string(),
  sucursalId: z.string(),
  items: z.array(CompraItemSchema).min(1),
});
export type CrearCompraInput = z.infer<typeof CrearCompraSchema>;

// ---------- Gastos ----------

export const CrearGastoSchema = z.object({
  sucursalId: z.string().optional(),
  categoria: z.string().min(1),
  descripcion: z.string().optional(),
  monto: z.number().positive(),
});
export type CrearGastoInput = z.infer<typeof CrearGastoSchema>;

// ---------- Shopify ----------

export const GuardarShopifyConfigSchema = z.object({
  shopDomain: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  sucursalEcommerceId: z.string(),
});
export type GuardarShopifyConfigInput = z.infer<typeof GuardarShopifyConfigSchema>;

// ---------- Colecciones ----------

export const CrearColeccionSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
});
export type CrearColeccionInput = z.infer<typeof CrearColeccionSchema>;

export const AgregarProductoColeccionSchema = z.object({
  productoId: z.string(),
});
export type AgregarProductoColeccionInput = z.infer<typeof AgregarProductoColeccionSchema>;

// ---------- Variantes ----------

export const CrearVarianteSchema = z.object({
  opcionValor: z.string().min(1),
  sku: z.string().min(1),
  precio: z.number().nonnegative(),
  codigoBarras: z.string().optional(),
});
export type CrearVarianteInput = z.infer<typeof CrearVarianteSchema>;

// ---------- Meta Ads ----------

export const GuardarMetaConfigSchema = z.object({
  accessToken: z.string().min(1),
  adAccountId: z.string().min(1),
  pixelId: z.string().optional(),
  sucursalEcommerceId: z.string().optional(),
});
export type GuardarMetaConfigInput = z.infer<typeof GuardarMetaConfigSchema>;

// ---------- Usuarios y permisos ----------

export const CrearUsuarioSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  rol: RolUsuario,
  // Si se omite, se usan los permisos por defecto de PERMISOS_POR_ROL[rol].
  permisos: z.array(z.enum(PERMISOS)).optional(),
});
export type CrearUsuarioInput = z.infer<typeof CrearUsuarioSchema>;

export const ActualizarUsuarioSchema = z.object({
  nombre: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
  rol: RolUsuario.optional(),
  permisos: z.array(z.enum(PERMISOS)).optional(),
  activo: z.boolean().optional(),
});
export type ActualizarUsuarioInput = z.infer<typeof ActualizarUsuarioSchema>;

// ---------- Plantilla del recibo ----------

export const GuardarPlantillaReciboSchema = z.object({
  nombre: z.string().min(1).optional(),
  esPredeterminada: z.boolean().optional(),
  logoUrl: z.string().nullable().optional(),
  nombreNegocio: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  redesSociales: z.string().nullable().optional(),
  mensajeAgradecimiento: z.string().nullable().optional(),
  politicasCambios: z.string().nullable().optional(),
  piePagina: z.string().nullable().optional(),
  mostrarQr: z.boolean().optional(),
  qrContenido: z.string().nullable().optional(),
  imagenPromocionalUrl: z.string().nullable().optional(),
  cuponDescuento: z.string().nullable().optional(),
  promociones: z.string().nullable().optional(),
});
export type GuardarPlantillaReciboInput = z.infer<typeof GuardarPlantillaReciboSchema>;

// ---------- Creditos manuales ----------

export const FrecuenciaPago = z.enum(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"]);
export type FrecuenciaPago = z.infer<typeof FrecuenciaPago>;

export const EstadoCuota = z.enum(["PENDIENTE", "PAGADA", "VENCIDA", "PARCIAL"]);
export type EstadoCuota = z.infer<typeof EstadoCuota>;

export const CrearCreditoManualSchema = z.object({
  clienteId: z.string().min(1),
  valorTotal: z.number().positive(),
  fechaInicio: z.string(), // ISO date: fecha en que se otorga el credito
  fechaPrimerPago: z.string(), // ISO date: vencimiento de la primera cuota
  numeroCuotas: z.number().int().positive(),
  frecuencia: FrecuenciaPago,
  // Si se envia, se usa como valor de cada cuota (editable); si no, se calcula
  // valorTotal / numeroCuotas y el residuo se ajusta en la ultima cuota.
  valorCuota: z.number().positive().optional(),
  observaciones: z.string().optional(),
});
export type CrearCreditoManualInput = z.infer<typeof CrearCreditoManualSchema>;

export const RegistrarPagoCreditoManualSchema = z.object({
  monto: z.number().positive(),
});
export type RegistrarPagoCreditoManualInput = z.infer<typeof RegistrarPagoCreditoManualSchema>;

// ---------- WebSocket events ----------

export interface InventarioActualizadoEvent {
  productoId: string;
  sucursalId: string;
  cantidad: number;
}

export interface VentaCreadaEvent {
  ventaId: string;
  sucursalId: string;
  total: number;
  fecha: string;
}

export interface PedidoShopifyEvent {
  id: string;
  ordenId: string;
  nombre: string;
  clienteNombre: string | null;
  total: number;
  productos: { nombre: string; cantidad: number }[];
  fecha: string;
}

// ---------- Utilidades para formatear variantes ----------

/**
 * Formatea varianteTitulo limpiando JSON y devolviendo texto legible.
 * Maneja múltiples formatos:
 * - JSON: [{"name":"Color","value":"Negro"}] → "Color: Negro"
 * - String con separadores: "Rojo / M" → "Rojo / M"
 * - Texto plano: "UNICA" → "UNICA"
 */
export function formatearVariante(varianteTitulo: string | null): string {
  if (!varianteTitulo) return "";

  // Intentar parsear como JSON de opciones
  try {
    const parsed = JSON.parse(varianteTitulo);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const opciones = parsed
        .filter((opt: any) => opt.name && opt.value)
        .map((opt: any) => `${opt.name}: ${opt.value}`)
        .join(", ");
      if (opciones) return opciones;
    }
  } catch {
    // No es JSON, devolver como está
  }

  return varianteTitulo;
}
