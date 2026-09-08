-- AlterTable "turnos_caja" - Add all missing columns for omnichannel cash register
-- This migration is comprehensive and handles the complete TurnoCaja model

-- Add missing sales columns (if they don't exist, this will be idempotent in deploy)
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "ventasCredito" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "ventasOtro" NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Tarjeta (Credit Card) reconciliation columns
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "esperadoTarjeta" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "reportadoTarjeta" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "diferenciaTarjeta" NUMERIC(14,2);

-- Transferencia (Bank Transfer) reconciliation columns
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "esperadoTransferencia" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "reportadoTransferencia" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "diferenciaTransferencia" NUMERIC(14,2);

-- Crédito (Credit/Fiado) reconciliation columns
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "esperadoCredito" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "reportadoCredito" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "diferenciaCredito" NUMERIC(14,2);

-- Otro (Other) reconciliation columns
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "esperadoOtro" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "reportadoOtro" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "diferenciaOtro" NUMERIC(14,2);

-- Ensure estado column exists (should already be there from initial schema)
-- and rename old "diferencia" to "diferenciaEfectivo" if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'turnos_caja' AND column_name = 'diferencia'
  ) THEN
    ALTER TABLE "turnos_caja" RENAME COLUMN "diferencia" TO "diferenciaEfectivo";
  END IF;
END $$;
