-- CreateEnum
CREATE TYPE "PrioridadEvento" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "EstadoEvento" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO');

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "stockMinimo" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "turnos_caja" ADD COLUMN     "desgloseCierre" JSONB,
ADD COLUMN     "saldosIniciales" JSONB;


-- CreateTable
CREATE TABLE "cuentas_bancarias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "banco" TEXT,
    "numeroCuenta" TEXT,
    "tipoCuenta" TEXT,
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_calendario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "hora" TEXT,
    "prioridad" "PrioridadEvento" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoEvento" NOT NULL DEFAULT 'PENDIENTE',
    "tipo" TEXT NOT NULL DEFAULT 'TAREA',
    "responsableId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_calendario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuentas_bancarias_empresaId_idx" ON "cuentas_bancarias"("empresaId");

-- CreateIndex
CREATE INDEX "eventos_calendario_empresaId_fecha_idx" ON "eventos_calendario"("empresaId", "fecha");

-- AddForeignKey
ALTER TABLE "cuentas_bancarias" ADD CONSTRAINT "cuentas_bancarias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_calendario" ADD CONSTRAINT "eventos_calendario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_calendario" ADD CONSTRAINT "eventos_calendario_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

