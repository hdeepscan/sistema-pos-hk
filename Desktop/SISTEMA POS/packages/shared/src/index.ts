import { z } from "zod";

// ---------- Enums (mirror Prisma enums) ----------

export const RolUsuario = z.enum(["ADMIN", "GERENTE", "CAJERO"]);
export type RolUsuario = z.infer<typeof RolUsuario>;

export const TipoSucursal = z.enum(["FISICA", "ECOMMERCE"]);
export type TipoSucursal = z.infer<typeof TipoSucursal>;

export const TipoMovimiento = z.enum(["ENTRADA", "SALIDA", "TRASLADO", "AJUSTE", "VENTA"]);
export type TipoMovimiento = z.infer<typeof TipoMovimiento>;

export const MetodoPago = z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"]);
export type MetodoPago = z.infer<typeof MetodoPago>;

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
  precio: z.number().nonnegative(),
  costo: z.number().nonnegative().default(0),
  codigoBarras: z.string().optional(),
});
export type CrearProductoInput = z.infer<typeof CrearProductoSchema>;

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

export const VentaItemSchema = z.object({
  productoId: z.string(),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().nonnegative(),
});
export type VentaItemInput = z.infer<typeof VentaItemSchema>;

export const CrearVentaSchema = z.object({
  clienteUuid: z.string().uuid(), // generated client-side, used for offline dedupe
  sucursalId: z.string(),
  metodoPago: MetodoPago,
  items: z.array(VentaItemSchema).min(1),
});
export type CrearVentaInput = z.infer<typeof CrearVentaSchema>;

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
