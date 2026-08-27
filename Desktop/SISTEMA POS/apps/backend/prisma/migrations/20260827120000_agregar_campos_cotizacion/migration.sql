-- AddColumn tipoDocumento
ALTER TABLE "cotizaciones" ADD COLUMN "tipoDocumento" TEXT DEFAULT 'NIT';

-- AddColumn numeroDocumento
ALTER TABLE "cotizaciones" ADD COLUMN "numeroDocumento" TEXT;

-- AddColumn firmaBase64 (para almacenar la firma en base64)
ALTER TABLE "cotizaciones" ADD COLUMN "firmaBase64" TEXT;
