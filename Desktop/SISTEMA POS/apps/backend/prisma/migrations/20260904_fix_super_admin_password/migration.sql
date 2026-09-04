-- Actualizar Super Admin con la contraseña correcta
UPDATE "usuarios"
SET
  "passwordHash" = '$2b$10$SiW.5Ebg7ybQS6xumY4yduBQkajK7Y682TRwnrNI4zdrR2V6D/mka',
  "es_super_admin" = true,
  "activo" = true
WHERE "email" = 'hnieto@deepscan.com.co';

-- Si el usuario no existe, crearlo
INSERT INTO "usuarios" ("id", "empresaId", "nombre", "email", "passwordHash", "rol", "permisos", "activo", "creadoEn", "es_super_admin")
SELECT
  gen_random_uuid()::text,
  (SELECT "id" FROM "empresas" WHERE "nombre" = 'Sistema POS' LIMIT 1),
  'Super Admin',
  'hnieto@deepscan.com.co',
  '$2b$10$SiW.5Ebg7ybQS6xumY4yduBQkajK7Y682TRwnrNI4zdrR2V6D/mka',
  'ADMIN',
  '{}',
  true,
  NOW(),
  true
WHERE NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "email" = 'hnieto@deepscan.com.co');
