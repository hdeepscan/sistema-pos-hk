-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RolUsuario" ADD VALUE 'SUPERVISOR';
ALTER TYPE "RolUsuario" ADD VALUE 'BODEGA';

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "diasVencimientoCredito" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "permisos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "cambio" DECIMAL(12,2),
ADD COLUMN     "dineroRecibido" DECIMAL(12,2),
ADD COLUMN     "fechaVencimientoCredito" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "producto_sucursales" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,

    CONSTRAINT "producto_sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "producto_sucursales_sucursalId_idx" ON "producto_sucursales"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "producto_sucursales_productoId_sucursalId_key" ON "producto_sucursales"("productoId", "sucursalId");

-- CreateIndex
CREATE INDEX "registro_auditoria_empresaId_fecha_idx" ON "registro_auditoria"("empresaId", "fecha");

-- AddForeignKey
ALTER TABLE "producto_sucursales" ADD CONSTRAINT "producto_sucursales_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_sucursales" ADD CONSTRAINT "producto_sucursales_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

