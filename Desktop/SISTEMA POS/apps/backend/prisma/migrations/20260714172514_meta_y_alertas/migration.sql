-- AlterTable
ALTER TABLE "shopify_config" ADD COLUMN     "ultimaAlertaOrdenes" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "meta_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "pixelId" TEXT,
    "sucursalEcommerceId" TEXT,
    "ultimaSincronizacion" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto_pauta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "campaniaId" TEXT NOT NULL,
    "campania" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "gasto" DECIMAL(12,2) NOT NULL,
    "impresiones" INTEGER NOT NULL DEFAULT 0,
    "clics" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gasto_pauta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_config_empresaId_key" ON "meta_config"("empresaId");

-- CreateIndex
CREATE INDEX "gasto_pauta_empresaId_fecha_idx" ON "gasto_pauta"("empresaId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "gasto_pauta_empresaId_campaniaId_fecha_key" ON "gasto_pauta"("empresaId", "campaniaId", "fecha");

-- AddForeignKey
ALTER TABLE "meta_config" ADD CONSTRAINT "meta_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto_pauta" ADD CONSTRAINT "gasto_pauta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

