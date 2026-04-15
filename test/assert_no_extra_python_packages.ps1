param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$PythonExe = "",
    [string]$AllowlistPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
    $PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
}
if ([string]::IsNullOrWhiteSpace($AllowlistPath)) {
    $AllowlistPath = Join-Path $ProjectRoot "test\allowed-python-packages.txt"
}

if (-not (Test-Path $PythonExe)) {
    Write-Error "Python nicht gefunden: $PythonExe"
    exit 1
}
if (-not (Test-Path $AllowlistPath)) {
    Write-Error "Allowlist nicht gefunden: $AllowlistPath"
    exit 1
}

$allowed = Get-Content -Path $AllowlistPath |
    ForEach-Object { $_.Trim().ToLowerInvariant() } |
    Where-Object { $_ -and -not $_.StartsWith("#") } |
    Sort-Object -Unique

if (-not $allowed -or $allowed.Count -eq 0) {
    Write-Error "Allowlist ist leer: $AllowlistPath"
    exit 1
}

$pkgJson = & $PythonExe -m pip list --format=json
if ($LASTEXITCODE -ne 0) {
    Write-Error "pip list konnte nicht ausgefuehrt werden."
    exit 1
}

$installed = ($pkgJson | ConvertFrom-Json |
    ForEach-Object { $_.name.ToLowerInvariant() } |
    Sort-Object -Unique)

$extra = $installed | Where-Object { $allowed -notcontains $_ }
$missing = $allowed | Where-Object { $installed -notcontains $_ }

Write-Host "Erlaubt : $($allowed -join ', ')"
Write-Host "Installiert: $($installed -join ', ')"

if ($extra.Count -gt 0) {
    Write-Host ""
    Write-Host "ABBRUCH: Nicht erlaubte Zusatzpakete gefunden:" -ForegroundColor Red
    $extra | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 2
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Hinweis: Diese erlaubten Pakete fehlen aktuell:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "OK: Keine zusaetzlichen Python-Pakete gefunden." -ForegroundColor Green
exit 0
