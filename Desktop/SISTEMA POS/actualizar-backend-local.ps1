# ============================================================
#  Actualiza el backend local de Sistema POS HK.
#  Corre esto DESPUES de cerrar el backend (Ctrl+C en la terminal).
#  Luego vuelve a arrancar con: npm run backend:dev
# ============================================================

$raiz = $PSScriptRoot
Set-Location $raiz

Write-Host ""
Write-Host "=== Actualizando backend local ===" -ForegroundColor Cyan

# 1) Regenerar el cliente de Prisma con los nuevos campos de la BD
Write-Host "`n[1/3] Regenerando cliente Prisma..." -ForegroundColor Yellow
npx prisma generate --schema "apps\backend\prisma\schema.prisma"
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: No se pudo regenerar Prisma." -ForegroundColor Red
  Write-Host "Asegurate de haber cerrado el backend antes de correr este script." -ForegroundColor Red
  pause
  exit 1
}
Write-Host "Cliente Prisma regenerado OK" -ForegroundColor Green

# 2) Aplicar migraciones pendientes a la BD
Write-Host "`n[2/3] Aplicando migraciones a la base de datos..." -ForegroundColor Yellow
npm run migrate:deploy -w apps/backend
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR al aplicar migraciones." -ForegroundColor Red
  pause
  exit 1
}
Write-Host "Migraciones aplicadas OK" -ForegroundColor Green

# 3) Compilar el backend
Write-Host "`n[3/3] Compilando backend..." -ForegroundColor Yellow
npm run build -w apps/backend
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR al compilar." -ForegroundColor Red
  pause
  exit 1
}
Write-Host "Backend compilado OK" -ForegroundColor Green

Write-Host ""
Write-Host "=== LISTO ===" -ForegroundColor Cyan
Write-Host "Ahora arranca el backend con:  npm run backend:dev" -ForegroundColor White
Write-Host ""
pause
