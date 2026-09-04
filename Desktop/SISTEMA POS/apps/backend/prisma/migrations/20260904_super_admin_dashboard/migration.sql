-- Migration: Add Super Admin Dashboard infrastructure
-- Date: 2026-09-04
-- Safety: All new columns have DEFAULT values to protect existing records

-- 1. Add role and super_admin columns to usuarios table
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(50) DEFAULT 'usuario';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_super_admin BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso_admin TIMESTAMP;

-- 2. Add license and status columns to empresas table
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT 'activa';
-- Estados: 'activa', 'bloqueada', 'prueba', 'suspendida', 'vencida'

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS tipo_licencia VARCHAR(50) DEFAULT 'mensual';
-- Tipos: 'prueba', 'mensual', 'trimestral', 'anual'

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dias_restantes INT DEFAULT 30;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS bloqueada_por_admin BOOLEAN DEFAULT false;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS razon_bloqueo TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS fecha_ultimo_bloqueo TIMESTAMP;

-- 3. Create admin_auditoria table for security logs
CREATE TABLE IF NOT EXISTS admin_auditoria (
  id SERIAL PRIMARY KEY,
  super_admin_id VARCHAR(255) NOT NULL,
  accion VARCHAR(100) NOT NULL,
  entidad VARCHAR(100) NOT NULL,
  entidad_id VARCHAR(255),
  detalles JSONB,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_auditoria_fecha ON admin_auditoria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_admin_auditoria_super_admin ON admin_auditoria(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_empresas_estado ON empresas(estado);
CREATE INDEX IF NOT EXISTS idx_empresas_bloqueada ON empresas(bloqueada_por_admin);
CREATE INDEX IF NOT EXISTS idx_usuarios_es_super_admin ON usuarios(es_super_admin);

-- 5. Create extension for UUID if needed (already exists typically)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration completed successfully
-- ✅ All changes are backward compatible
-- ✅ Existing data is protected with DEFAULT values
