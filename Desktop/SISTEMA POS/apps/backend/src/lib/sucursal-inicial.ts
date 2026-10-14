import { prisma } from "./prisma.js";

// Una empresa sin ninguna sucursal no puede entrar al POS (la pantalla de selección
// queda vacía). Le crea la "Sucursal Principal", igual que el registro con pago.
// Solo actúa si no tiene ninguna, ni siquiera inactiva.
export async function asegurarSucursalInicial(empresaId: string): Promise<void> {
  const existentes = await prisma.sucursal.count({ where: { empresaId } });
  if (existentes > 0) return;
  await prisma.sucursal.create({
    data: { empresaId, nombre: "Sucursal Principal", tipo: "FISICA", activo: true },
  });
  console.log(`[sucursal-inicial] Creada "Sucursal Principal" para la empresa ${empresaId}`);
}
