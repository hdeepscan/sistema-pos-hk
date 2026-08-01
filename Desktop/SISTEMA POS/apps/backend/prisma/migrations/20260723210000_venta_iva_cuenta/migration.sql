-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "cuentaBancariaId" TEXT,
ADD COLUMN     "impuestoTotal" DECIMAL(12,2);


-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cuentaBancariaId_fkey" FOREIGN KEY ("cuentaBancariaId") REFERENCES "cuentas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

