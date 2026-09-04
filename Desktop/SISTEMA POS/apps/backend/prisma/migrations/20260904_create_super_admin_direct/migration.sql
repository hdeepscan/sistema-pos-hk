-- Crear empresa Sistema POS si no existe
INSERT INTO "empresas" ("id", "nombre", "plan", "activo", "fechaRegistro", "fechaVencimiento", "planSuscripcion", "limiteUsuarios", "diasVencimientoCredito", "diasAvisoCuota", "pesosPorPunto", "valorPunto", "estado", "tipo_licencia", "dias_restantes", "bloqueada_por_admin", "razon_bloqueo", "fecha_ultimo_bloqueo")
SELECT
  'sistema-pos-admin-' || gen_random_uuid()::text,
  'Sistema POS',
  'ENTERPRISE',
  true,
  NOW(),
  NOW() + INTERVAL '365 days',
  'ANUAL',
  2,
  20,
  3,
  NULL,
  NULL,
  'activa',
  'ANUAL',
  999,
  false,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM "empresas" WHERE "nombre" = 'Sistema POS');

-- Obtener el ID de la empresa
-- Crear sucursal principal si no existe
WITH emp AS (SELECT "id" FROM "empresas" WHERE "nombre" = 'Sistema POS' LIMIT 1)
INSERT INTO "sucursales" ("id", "empresaId", "nombre", "tipo", "direccion", "activo", "creadoEn", "shopifyLocationId")
SELECT
  'sucursal-' || gen_random_uuid()::text,
  emp."id",
  'Principal',
  'FISICA',
  NULL,
  true,
  NOW(),
  NULL
FROM emp
WHERE NOT EXISTS (
  SELECT 1 FROM "sucursales" s
  WHERE s."empresaId" = emp."id"
);

-- Eliminar usuario anterior si existe
DELETE FROM "usuarios" WHERE "email" = 'hnieto@deepscan.com.co';

-- Crear Super Admin
WITH emp AS (SELECT "id" FROM "empresas" WHERE "nombre" = 'Sistema POS' LIMIT 1)
INSERT INTO "usuarios" ("id", "empresaId", "nombre", "email", "passwordHash", "rol", "permisos", "activo", "creadoEn", "es_super_admin")
SELECT
  'admin-' || gen_random_uuid()::text,
  emp."id",
  'Super Admin',
  'hnieto@deepscan.com.co',
  '$2b$10$SiW.5Ebg7ybQS6xumY4yduBQkajK7Y682TRwnrNI4zdrR2V6D/mka',
  'ADMIN',
  '{}',
  true,
  NOW(),
  true
FROM emp;
