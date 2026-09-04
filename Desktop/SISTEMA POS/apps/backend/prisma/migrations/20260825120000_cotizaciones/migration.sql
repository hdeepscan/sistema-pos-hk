-- CreateEnum "EstadoCotizacion"
CREATE TYPE "EstadoCotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA');

-- CreateTable "cotizaciones"
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "secuencial" INTEGER NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "clienteEmail" TEXT,
    "clienteTelefono" TEXT,
    "clienteEmpresa" TEXT,
    "clienteDireccion" TEXT,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'BORRADOR',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVigencia" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descuentoPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "descuentoValor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impuestoPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "impuestoValor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "comentarios" TEXT,
    "condicionesPago" TEXT,
    "creadoPor" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable "lineas_cotizacion"
CREATE TABLE "lineas_cotizacion" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "precioUnitario" DECIMAL(14,2) NOT NULL,
    "descuentoPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "descuentoValor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lineas_cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_numero_key" ON "cotizaciones"("numero");

-- CreateIndex
CREATE INDEX "cotizaciones_empresaId_numero_idx" ON "cotizaciones"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "cotizaciones_empresaId_estado_idx" ON "cotizaciones"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "cotizaciones_empresaId_fechaCreacion_idx" ON "cotizaciones"("empresaId", "fechaCreacion");

-- CreateIndex
CREATE INDEX "lineas_cotizacion_cotizacionId_idx" ON "lineas_cotizacion"("cotizacionId");

-- CreateIndex
CREATE INDEX "lineas_cotizacion_productoId_idx" ON "lineas_cotizacion"("productoId");

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_cotizacion" ADD CONSTRAINT "lineas_cotizacion_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_cotizacion" ADD CONSTRAINT "lineas_cotizacion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
