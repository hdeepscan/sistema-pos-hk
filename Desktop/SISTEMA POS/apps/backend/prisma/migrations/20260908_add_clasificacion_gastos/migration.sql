-- Add clasificacion and metodoPago fields to gastos table

ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "clasificacion" VARCHAR(50) NOT NULL DEFAULT 'GASTO';
ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "metodoPago" VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO';

-- Create index for clasificacion
CREATE INDEX IF NOT EXISTS "gastos_clasificacion_idx" ON "gastos"("clasificacion");
