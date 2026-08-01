-- DropForeignKey
ALTER TABLE "venta_items" DROP CONSTRAINT "venta_items_productoId_fkey";

-- AlterTable
ALTER TABLE "venta_items" ADD COLUMN     "descripcionLibre" TEXT,
ALTER COLUMN "productoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "ventaLibre" BOOLEAN NOT NULL DEFAULT false;


-- AddForeignKey
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

