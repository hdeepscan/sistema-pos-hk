-- Add omnichannel payment method fields to turnos_caja table

-- Add new sales columns for payment methods
ALTER TABLE "turnos_caja" ADD COLUMN "ventasCredito" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN "ventasOtro" NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Add Tarjeta (Credit Card) fields
ALTER TABLE "turnos_caja" ADD COLUMN "esperadoTarjeta" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN "reportadoTarjeta" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN "diferenciaTarjeta" NUMERIC(14,2);

-- Add Transferencia (Bank Transfer) fields
ALTER TABLE "turnos_caja" ADD COLUMN "esperadoTransferencia" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN "reportadoTransferencia" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN "diferenciaTransferencia" NUMERIC(14,2);

-- Add Crédito (Credit/Fiado) fields
ALTER TABLE "turnos_caja" ADD COLUMN "esperadoCredito" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN "reportadoCredito" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN "diferenciaCredito" NUMERIC(14,2);

-- Add Otro (Other) fields
ALTER TABLE "turnos_caja" ADD COLUMN "esperadoOtro" NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "turnos_caja" ADD COLUMN "reportadoOtro" NUMERIC(14,2);
ALTER TABLE "turnos_caja" ADD COLUMN "diferenciaOtro" NUMERIC(14,2);

-- Rename old "diferencia" column to "diferenciaEfectivo" if it exists
ALTER TABLE "turnos_caja" RENAME COLUMN "diferencia" TO "diferenciaEfectivo";
