
-- CreateTable
CREATE TABLE "producto_imagenes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "grupoClave" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "shopifyImageId" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_imagenes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "producto_imagenes_empresaId_grupoClave_idx" ON "producto_imagenes"("empresaId", "grupoClave");

