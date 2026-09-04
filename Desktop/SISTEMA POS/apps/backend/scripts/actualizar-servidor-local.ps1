# Actualiza el backend de Sistema POS HK que ya esta corriendo como servicio
# de Windows en esta PC (instalado con instalar-servidor-local.ps1), despues
# de haber copiado encima el contenido de una version nueva de
# SistemaPOS-Servidor.zip (sobrescribiendo esta misma carpeta del proyecto).
#
# No toca el archivo .env (tus datos de conexion locales quedan intactos:
# el .zip nunca lo incluye, asi que sobrescribir la carpeta no lo borra).
#
# Como correrlo: extrae el .zip nuevo ENCIMA de esta misma carpeta del
# proyecto (aceptando reemplazar los archivos existentes), abre PowerShell
# COMO ADMINISTRADOR, ubicate en apps/backend/scripts y ejecuta:
#   powershell -ExecutionPolicy Bypass -File actualizar-servidor-local.ps1

$ErrorActionPreference = "Stop"
Write-Host "=== Actualizador de servidor local - Sistema POS HK ===" -ForegroundColor Cyan

$scriptsDir = $PSScriptRoot
$backendDir = Split-Path -Parent $scriptsDir
$repoRoot = Split-Path -Parent (Split-Path -Parent $backendDir)
$serviceName = "SistemaPOSBackend"
$nssmPath = Join-Path $backendDir "nssm.exe"

if (-not (Test-Path (Join-Path $backendDir ".env"))) {
    Write-Host "No se encontro apps\backend\.env - parece que este servidor no fue instalado con instalar-servidor-local.ps1 todavia." -ForegroundColor Red
    Write-Host "Corre primero instalar-servidor-local.ps1."
    exit 1
}

$servicio = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($servicio) {
    Write-Host "Deteniendo el servicio para actualizar..."
    & $nssmPath stop $serviceName | Out-Null
}

Set-Location $repoRoot
Write-Host "Instalando/actualizando dependencias..."
npm install
Write-Host "Regenerando el cliente de Prisma..."
npm run prisma:generate -w apps/backend
Write-Host "Aplicando migraciones nuevas a la base de datos (si las hay)..."
npm run migrate:deploy -w apps/backend
Write-Host "Compilando el backend actualizado..."
npm run build -w apps/backend

if ($servicio) {
    Write-Host "Reiniciando el servicio..."
    & $nssmPath start $serviceName | Out-Null
    Write-Host "Servicio reiniciado con la version nueva." -ForegroundColor Green
} else {
    Write-Host "No habia un servicio instalado. Corre instalar-servidor-local.ps1 para dejarlo corriendo como servicio." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== LISTO ===" -ForegroundColor Cyan
Write-Host "El servidor quedo actualizado. Las bases de datos y la configuracion (.env) no se tocaron."
