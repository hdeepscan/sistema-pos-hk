import { prisma } from "./prisma.js";

// Registro de auditoria best-effort: nunca debe tumbar la operacion principal
// si falla (por ejemplo, si la DB esta momentaneamente inalcanzable).
export function registrarAuditoria(args: {
  empresaId: string;
  usuarioId?: string;
  accion: string;
  entidad: string;
  entidadId?: string;
  detalle?: string;
}) {
  void prisma.registroAuditoria
    .create({
      data: {
        empresaId: args.empresaId,
        usuarioId: args.usuarioId,
        accion: args.accion,
        entidad: args.entidad,
        entidadId: args.entidadId,
        detalle: args.detalle,
      },
    })
    .catch((err) => {
      console.error("[auditoria] No se pudo registrar:", err);
    });
}
