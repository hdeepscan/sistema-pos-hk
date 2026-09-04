-- Shopify Integration Tables

-- ShopifyConfig: Credenciales y configuración OAuth
CREATE TABLE "shopify_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL UNIQUE,
    "shopDomain" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "sucursalEcommerceId" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiraEn" TIMESTAMP(3),
    "ultimaSincronizacion" TIMESTAMP(3),
    "ultimaAlertaOrdenes" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopify_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas" ("id") ON DELETE CASCADE
);

-- ShopifyLocation: Ubicaciones de Shopify
CREATE TABLE "shopify_locations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "shopifyLocationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopify_locations_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas" ("id") ON DELETE CASCADE,
    CONSTRAINT "shopify_locations_empresaId_shopifyLocationId_key" UNIQUE("empresaId", "shopifyLocationId")
);

CREATE INDEX "shopify_locations_empresaId_idx" ON "shopify_locations"("empresaId");

-- ShopifyInventoryItem: Items de inventario de Shopify
CREATE TABLE "shopify_inventory_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "shopifyInventoryItemId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "productoId" TEXT,
    "tracked" BOOLEAN NOT NULL DEFAULT true,
    "requiresShipping" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopify_inventory_items_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas" ("id") ON DELETE CASCADE,
    CONSTRAINT "shopify_inventory_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos" ("id") ON DELETE SET NULL,
    CONSTRAINT "shopify_inventory_items_empresaId_shopifyInventoryItemId_key" UNIQUE("empresaId", "shopifyInventoryItemId")
);

CREATE INDEX "shopify_inventory_items_empresaId_shopifyVariantId_idx" ON "shopify_inventory_items"("empresaId", "shopifyVariantId");
CREATE INDEX "shopify_inventory_items_productoId_idx" ON "shopify_inventory_items"("productoId");

-- ShopifyInventoryLevel: Niveles de stock por ubicación
CREATE TABLE "shopify_inventory_levels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "disponible" INTEGER NOT NULL DEFAULT 0,
    "enMano" INTEGER NOT NULL DEFAULT 0,
    "comprometida" INTEGER NOT NULL DEFAULT 0,
    "entrante" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopify_inventory_levels_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas" ("id") ON DELETE CASCADE,
    CONSTRAINT "shopify_inventory_levels_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "shopify_inventory_items" ("id") ON DELETE CASCADE,
    CONSTRAINT "shopify_inventory_levels_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "shopify_locations" ("id") ON DELETE CASCADE,
    CONSTRAINT "shopify_inventory_levels_inventoryItemId_locationId_key" UNIQUE("inventoryItemId", "locationId")
);

CREATE INDEX "shopify_inventory_levels_empresaId_idx" ON "shopify_inventory_levels"("empresaId");
CREATE INDEX "shopify_inventory_levels_locationId_idx" ON "shopify_inventory_levels"("locationId");

-- ShopifySyncQueue: Cola de cambios para sincronizar
CREATE TABLE "shopify_sync_queue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "productoId" TEXT,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "datos" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "maxIntentos" INTEGER NOT NULL DEFAULT 3,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMensaje" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3),
    CONSTRAINT "shopify_sync_queue_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas" ("id") ON DELETE CASCADE,
    CONSTRAINT "shopify_sync_queue_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos" ("id") ON DELETE SET NULL
);

CREATE INDEX "shopify_sync_queue_empresaId_estado_proximoIntento_idx" ON "shopify_sync_queue"("empresaId", "estado", "proximoIntento");
CREATE INDEX "shopify_sync_queue_productoId_idx" ON "shopify_sync_queue"("productoId");

-- ShopifyWebhookEvent: Log de webhooks recibidos
CREATE TABLE "shopify_webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "shopifyResourceId" TEXT NOT NULL,
    "shopifyResourceGid" TEXT,
    "datos" TEXT NOT NULL,
    "procesado" BOOLEAN NOT NULL DEFAULT false,
    "procesoError" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopify_webhook_events_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas" ("id") ON DELETE CASCADE
);

CREATE INDEX "shopify_webhook_events_empresaId_tipo_creadoEn_idx" ON "shopify_webhook_events"("empresaId", "tipo", "creadoEn");
CREATE INDEX "shopify_webhook_events_empresaId_procesado_idx" ON "shopify_webhook_events"("empresaId", "procesado");

-- ShopifyOAuthState: Estado temporal para OAuth (CSRF protection)
CREATE TABLE "shopify_oauth_state" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL UNIQUE,
    "empresaId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "expiradoEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "shopify_oauth_state_state_idx" ON "shopify_oauth_state"("state");
CREATE INDEX "shopify_oauth_state_empresaId_idx" ON "shopify_oauth_state"("empresaId");
