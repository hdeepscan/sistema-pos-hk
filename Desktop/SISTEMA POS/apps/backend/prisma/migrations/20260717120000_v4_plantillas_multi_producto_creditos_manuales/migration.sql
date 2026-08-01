-- CreateEnum
CREATE TYPE "FrecuenciaPago" AS ENUM ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL');

-- DropIndex
DROP INDEX "plantilla_recibo_empresaId_key";

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "diasAvisoCuota" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "grupoVariantes" TEXT,
ADD COLUMN     "impuestoPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "marca" TEXT;

-- AlterTable
ALTER TABLE "plantilla_recibo" ADD COLUMN     "esPredeterminada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nombre" TEXT NOT NULL DEFAULT 'Plantilla principal';

-- CreateTable
CREATE TABLE "creditos_manuales" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "numeroCuotas" INTEGER NOT NULL,
    "frecuencia" "FrecuenciaPago" NOT NULL,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creditos_manuales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuotas_credito" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "pagado" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "cuotas_credito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_credito_manual" (
    "id" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "pagos_credito_manual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creditos_manuales_empresaId_idx" ON "creditos_manuales"("empresaId");

-- CreateIndex
CREATE INDEX "creditos_manuales_clienteId_idx" ON "creditos_manuales"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "creditos_manuales_empresaId_numero_key" ON "creditos_manuales"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "cuotas_credito_creditoId_idx" ON "cuotas_credito"("creditoId");

-- CreateIndex
CREATE INDEX "pagos_credito_manual_cuotaId_idx" ON "pagos_credito_manual"("cuotaId");

-- CreateIndex
CREATE INDEX "plantilla_recibo_empresaId_idx" ON "plantilla_recibo"("empresaId");

-- AddForeignKey
ALTER TABLE "creditos_manuales" ADD CONSTRAINT "creditos_manuales_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creditos_manuales" ADD CONSTRAINT "creditos_manuales_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuotas_credito" ADD CONSTRAINT "cuotas_credito_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "creditos_manuales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_credito_manual" ADD CONSTRAINT "pagos_credito_manual_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "cuotas_credito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_credito_manual" ADD CONSTRAINT "pagos_credito_manual_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Las plantillas de recibo que ya existian (una por empresa) pasan a ser la
-- predeterminada, para que el POS las siga usando tras el cambio a multi-plantilla.
UPDATE "plantilla_recibo" SET "esPredeterminada" = true;
