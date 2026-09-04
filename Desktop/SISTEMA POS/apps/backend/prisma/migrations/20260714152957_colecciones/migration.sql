-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "varianteTitulo" TEXT;

-- CreateTable
CREATE TABLE "colecciones" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagenUrl" TEXT,
    "shopifyCollectionId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colecciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_colecciones" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "coleccionId" TEXT NOT NULL,

    CONSTRAINT "producto_colecciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "colecciones_empresaId_idx" ON "colecciones"("empresaId");

-- CreateIndex
CREATE INDEX "colecciones_empresaId_shopifyCollectionId_idx" ON "colecciones"("empresaId", "shopifyCollectionId");

-- CreateIndex
CREATE INDEX "producto_colecciones_coleccionId_idx" ON "producto_colecciones"("coleccionId");

-- CreateIndex
CREATE UNIQUE INDEX "producto_colecciones_productoId_coleccionId_key" ON "producto_colecciones"("productoId", "coleccionId");

-- AddForeignKey
ALTER TABLE "colecciones" ADD CONSTRAINT "colecciones_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_colecciones" ADD CONSTRAINT "producto_colecciones_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_colecciones" ADD CONSTRAINT "producto_colecciones_coleccionId_fkey" FOREIGN KEY ("coleccionId") REFERENCES "colecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

