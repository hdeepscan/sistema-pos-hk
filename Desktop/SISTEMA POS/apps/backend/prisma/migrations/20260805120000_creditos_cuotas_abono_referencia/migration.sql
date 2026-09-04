-- Agrega numero de cuotas a ventas a credito
ALTER TABLE "ventas" ADD COLUMN "numeroCuotasCredito" INTEGER;

-- Agrega referencia opcional a abonos
ALTER TABLE "abonos" ADD COLUMN "referencia" TEXT;
