-- CreateEnum
CREATE TYPE "CanalVenta" AS ENUM ('POS', 'SHOPIFY', 'WHATSAPP', 'OTRO');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "pesosPorPunto" DECIMAL(12,2),
ADD COLUMN     "valorPunto" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "canal" "CanalVenta" NOT NULL DEFAULT 'POS',
ADD COLUMN     "descuento" DECIMAL(12,2),
ADD COLUMN     "puntosGanados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "puntosRedimidos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "puntos" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "turnos_caja" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "usuarioAperturaId" TEXT NOT NULL,
    "usuarioCierreId" TEXT,
    "montoInicial" DECIMAL(12,2) NOT NULL,
    "fechaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),
    "ventasEfectivo" DECIMAL(12,2),
    "totalEsperado" DECIMAL(12,2),
    "montoContado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),

    CONSTRAINT "turnos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones_venta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "montoDevuelto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devoluciones_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_puntos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ventaId" TEXT,
    "tipo" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "turnos_caja_empresaId_sucursalId_fechaApertura_idx" ON "turnos_caja"("empresaId", "sucursalId", "fechaApertura");

-- CreateIndex
CREATE INDEX "devoluciones_venta_empresaId_fecha_idx" ON "devoluciones_venta"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "devoluciones_venta_ventaId_idx" ON "devoluciones_venta"("ventaId");

-- CreateIndex
CREATE INDEX "movimientos_puntos_clienteId_idx" ON "movimientos_puntos"("clienteId");

-- AddForeignKey
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_usuarioAperturaId_fkey" FOREIGN KEY ("usuarioAperturaId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_usuarioCierreId_fkey" FOREIGN KEY ("usuarioCierreId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_venta" ADD CONSTRAINT "devoluciones_venta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_venta" ADD CONSTRAINT "devoluciones_venta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_venta" ADD CONSTRAINT "devoluciones_venta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_puntos" ADD CONSTRAINT "movimientos_puntos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

