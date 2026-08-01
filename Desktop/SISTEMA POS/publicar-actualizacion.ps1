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
