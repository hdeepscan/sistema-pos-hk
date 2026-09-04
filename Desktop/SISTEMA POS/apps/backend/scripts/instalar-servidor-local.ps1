# Instala y deja corriendo el backend de Sistema POS HK como servicio de
# Windows en esta PC, usando una base de datos PostgreSQL local (no depende
# de internet ni de servicios externos). Pensado para negocios de una sola
# tienda: esta PC actua como "servidor" y las demas cajas se conectan a ella
# por la red local del negocio.
#
# Requisitos previos (instalar antes de correr este script):
#   1. Node.js LTS: https://nodejs.org
#   2. PostgreSQL: https://www.postgresql.org/download/windows/
#      (durante su instalacion te pide una contraseña para el usuario
#      "postgres" - anotala, la vas a necesitar aqui)
#
# Como correrlo: abrir PowerShell COMO ADMINISTRADOR, ubicarse en esta
# carpeta (apps/backend/scripts) y ejecutar:
#   powershell -ExecutionPolicy Bypass -File instalar-servidor-local.ps1

$ErrorActionPreference = "Stop"
Write-Host "=== Instalador de servidor local - Sistema POS HK ===" -ForegroundColor Cyan

# 1. Verificar Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js no esta instalado." -ForegroundColor Red
    Write-Host "Descargalo de https://nodejs.org (version LTS), instalalo y vuelve a correr este script."
    exit 1
}
Write-Host "Node.js encontrado: $(node --version)"

# 2. Verificar PostgreSQL
$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
    Write-Host "PostgreSQL no esta instalado (o 'psql' no esta en el PATH)." -ForegroundColor Red
    Write-Host "Descargalo de https://www.postgresql.org/download/windows/, instalalo y vuelve a correr este script."
    exit 1
}
Write-Host "PostgreSQL encontrado"

# 3. Crear la base de datos local si no existe
$pgPasswordSecure = Read-Host "Contraseña del usuario 'postgres' de PostgreSQL" -AsSecureString
$pgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPasswordSecure))
$env:PGPASSWORD = $pgPassword
$dbName = "sistema_pos"

$existe = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
if ($existe -ne "1") {
    Write-Host "Creando base de datos '$dbName'..."
    & psql -U postgres -h localhost -c "CREATE DATABASE $dbName;"
} else {
    Write-Host "La base de datos '$dbName' ya existe, se reutiliza."
}

# 4. Escribir el archivo .env del backend
$scriptsDir = $PSScriptRoot
$backendDir = Split-Path -Parent $scriptsDir
$repoRoot = Split-Path -Parent (Split-Path -Parent $backendDir)
$jwtSecret = -join ((48..57) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$envContent = @"
DATABASE_URL="postgresql://postgres:$pgPassword@localhost:5432/$dbName"
JWT_SECRET="$jwtSecret"
PORT=4000
CORS_ORIGIN="*"
"@
Set-Content -Path (Join-Path $backendDir ".env") -Value $envContent -Encoding utf8
Write-Host "Archivo .env creado con una base de datos local y una clave de seguridad unica."

# 5. Instalar dependencias, migrar la base de datos y compilar
Set-Location $repoRoot
Write-Host "Instalando dependencias (puede tardar varios minutos la primera vez)..."
npm install
Write-Host "Generando el cliente de Prisma..."
npm run prisma:generate -w apps/backend
Write-Host "Aplicando la estructura de la base de datos..."
npm run migrate:deploy -w apps/backend
Write-Host "Compilando el backend..."
npm run build -w apps/backend

# 6. Descargar NSSM (para correr el backend como servicio de Windows) si falta
$nssmPath = Join-Path $backendDir "nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Host "Descargando NSSM..."
    $tmpZip = Join-Path $backendDir "nssm.zip"
    $tmpDir = Join-Path $backendDir "nssm-tmp"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $tmpZip
    Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
    Copy-Item (Join-Path $tmpDir "nssm-2.24\win64\nssm.exe") $nssmPath
    Remove-Item $tmpZip, $tmpDir -Recurse -Force
}

# 7. Registrar (o actualizar) el servicio de Windows
$serviceName = "SistemaPOSBackend"
$existente = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existente) {
    Write-Host "Actualizando el servicio existente..."
    & $nssmPath stop $serviceName
    & $nssmPath remove $serviceName confirm
}

$nodePath = (Get-Command node).Source
& $nssmPath install $serviceName $nodePath "dist\server.js"
& $nssmPath set $serviceName AppDirectory $backendDir
& $nssmPath set $serviceName Start SERVICE_AUTO_START
& $nssmPath set $serviceName AppStdout (Join-Path $backendDir "servicio.log")
& $nssmPath set $serviceName AppStderr (Join-Path $backendDir "servicio-error.log")
& $nssmPath start $serviceName
Write-Host "Servicio '$serviceName' instalado e iniciado (arranca solo con Windows)." -ForegroundColor Green

# 8. Abrir el puerto en el Firewall de Windows
New-NetFirewallRule -DisplayName "Sistema POS HK Backend" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -ErrorAction SilentlyContinue | Out-Null
Write-Host "Regla de Firewall creada para el puerto 4000."

# 9. Mostrar la IP local para configurar las demas cajas
$ip = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "=== LISTO ===" -ForegroundColor Cyan
Write-Host "El backend quedo corriendo como servicio en esta PC, con base de datos local."
Write-Host ""
Write-Host "En cada punto de venta (incluida esta PC si tambien vende), instala Sistema POS HK"
Write-Host "y en 'URL del servidor' de la pantalla de inicio de sesion usa:"
Write-Host "  http://${ip}:4000" -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANTE: configura una IP fija (reserva DHCP) para esta PC en el router del" -ForegroundColor Yellow
Write-Host "negocio, para que esa direccion no cambie con el tiempo." -ForegroundColor Yellow
