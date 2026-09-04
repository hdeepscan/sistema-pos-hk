-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN     "shopifyLocationId" TEXT;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "imagenUrl" TEXT,
ADD COLUMN     "shopifyInventoryItemId" TEXT;

