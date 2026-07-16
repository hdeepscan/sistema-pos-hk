-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "proveedorId" TEXT;

-- CreateTable
CREATE TABLE "plantilla_recibo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "nombreNegocio" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "redesSociales" TEXT,
    "mensajeAgradecimiento" TEXT,
    "politicasCambios" TEXT,
    "piePagina" TEXT,
    "mostrarQr" BOOLEAN NOT NULL DEFAULT false,
    "qrContenido" TEXT,
    "imagenPromocionalUrl" TEXT,
    "cuponDescuento" TEXT,
    "promociones" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantilla_recibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_shopify_notificacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "numeroOrden" TEXT NOT NULL,
    "clienteNombre" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "productos" TEXT NOT NULL,
    "fechaPedido" TIMESTAMP(3) NOT NULL,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "fechaAtendido" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_shopify_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_recibo_empresaId_key" ON "plantilla_recibo"("empresaId");

-- CreateIndex
CREATE INDEX "pedidos_shopify_notificacion_empresaId_creadoEn_idx" ON "pedidos_shopify_notificacion"("empresaId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_shopify_notificacion_empresaId_ordenId_key" ON "pedidos_shopify_notificacion"("empresaId", "ordenId");

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_recibo" ADD CONSTRAINT "plantilla_recibo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_shopify_notificacion" ADD CONSTRAINT "pedidos_shopify_notificacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

