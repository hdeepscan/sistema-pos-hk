# ============================================================================
#  Publicar una nueva version de Sistema POS HK a GitHub Releases.
#  Las tiendas que ya tengan la app instalada la detectaran y se actualizaran
#  solas.
#
#  USO (en PowerShell, dentro de la carpeta "SISTEMA POS"):
#     $env:GH_TOKEN = "TU_TOKEN_DE_GITHUB"
#     .\publicar-actualizacion.ps1
#
#  El token de GitHub NO se guarda en ningun archivo; solo vive en tu sesion.
# ============================================================================

if (-not $env:GH_TOKEN) {
  Write-Host "Falta el token. Antes de correr esto, ejecuta:" -ForegroundColor Yellow
  Write-Host '   $env:GH_TOKEN = "tu_token_de_github"' -ForegroundColor Yellow
  exit 1
}

$raiz = $PSScriptRoot
Set-Location $raiz

# Muestra la version que se va a publicar.
$ver = (Get-Content "apps/desktop/package.json" | ConvertFrom-Json).version
Write-Host "Publicando Sistema POS HK version $ver ..." -ForegroundColor Cyan

# 1) Compila la app.
npm run --workspace apps/desktop build
if ($LASTEXITCODE -ne 0) { Write-Host "Fallo la compilacion." -ForegroundColor Red; exit 1 }

# 2) Empaqueta y publica en GitHub Releases (usa GH_TOKEN del entorno).
npx --prefix apps/desktop electron-builder --win --projectDir apps/desktop --publish always
if ($LASTEXITCODE -ne 0) { Write-Host "Fallo la publicacion." -ForegroundColor Red; exit 1 }

Write-Host "Listo. Version $ver publicada. Las tiendas se actualizaran solas." -ForegroundColor Green

# 3) Copia el instalador nuevo a la carpeta "POS - Instalar en tiendas" del escritorio
#    para que siempre tengas ahi la version mas reciente lista para compartir.
$carpetaInstaladores = "C:\Users\PC\Desktop\POS - Instalar en tiendas"
$distDir = Join-Path $raiz "apps\desktop\release"

# Busca el .exe del instalador generado (el que dice "Setup", no el de auto-update)
$instaladorNuevo = Get-ChildItem $distDir -Filter "*.exe" |
    Where-Object { $_.Name -like "*Setup*" -or $_.Name -like "*Instalador*" -or ($_.Name -notlike "*Squirrel*" -and $_.Name -notlike "*Update*") } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($instaladorNuevo) {
  $destino = Join-Path $carpetaInstaladores "Instalador - Sistema POS HK v$ver.exe"
  Copy-Item $instaladorNuevo.FullName $destino -Force

  # Elimina instaladores viejos de esa carpeta (mantiene solo el nuevo)
  Get-ChildItem $carpetaInstaladores -Filter "Instalador - Sistema POS HK*.exe" |
    Where-Object { $_.FullName -ne $destino } |
    Remove-Item -Force

  Write-Host "Instalador v$ver copiado a: $carpetaInstaladores" -ForegroundColor Green
  Write-Host "  -> $($instaladorNuevo.Name) => Instalador - Sistema POS HK v$ver.exe" -ForegroundColor Gray
} else {
  Write-Host "No se encontro el instalador en $distDir - copialo manualmente si lo necesitas." -ForegroundColor Yellow
}
