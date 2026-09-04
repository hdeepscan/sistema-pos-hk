-- AlterTable
ALTER TABLE "venta_items" ADD COLUMN     "cantidadDevuelta" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "devoluciones_venta" ADD COLUMN     "motivo" TEXT;
