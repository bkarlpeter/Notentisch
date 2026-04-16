param(
    [string]$Version = "v2026.04.16",
    [string]$OutputDir = "release"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$releaseDir = Join-Path $repoRoot $OutputDir
$stageDir = Join-Path $releaseDir ("Notentisch-" + $Version)
$zipPath = Join-Path $releaseDir ("Notentisch-" + $Version + ".zip")

$excludeDirs = @(
    '.git',
    '.github',
    '.venv',
    '.vscode',
    '__pycache__',
    'board_files',
    'mysounds',
    'tmp_placeholder',
    'release',
    'Noten',
    'Blätter',
    'myMusic'
)

$excludeFilePatterns = @(
    '*.accdb',
    '*.webm',
    '*.bak',
    '*.tmp'
)

if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

if (Test-Path $stageDir) {
    Remove-Item -Recurse -Force $stageDir
}
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

New-Item -ItemType Directory -Path $stageDir | Out-Null

Get-ChildItem -LiteralPath $repoRoot -Force | ForEach-Object {
    if ($excludeDirs -contains $_.Name) {
        return
    }

    $destination = Join-Path $stageDir $_.Name

    if ($_.PSIsContainer) {
        Copy-Item -Recurse -Force -LiteralPath $_.FullName -Destination $destination
        return
    }

    foreach ($pattern in $excludeFilePatterns) {
        if ($_.Name -like $pattern) {
            return
        }
    }

    Copy-Item -Force -LiteralPath $_.FullName -Destination $destination
}

# Optional: Copyright-Hinweis fuer Paket erzeugen
$noticePath = Join-Path $stageDir 'RELEASE-HINWEIS.txt'
@(
    'Dieses Paket enthaelt keine urheberrechtlich problematischen Notenbestaende.',
    'PDF-Quellen muessen lokal bereitgestellt und ueber den Blätter-Junction oder pdfBaseDir angebunden werden.',
    'Access-Integration wird separat als Zusatzpaket gepflegt.'
) | Set-Content -LiteralPath $noticePath -Encoding UTF8

Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host 'Release-Paket erstellt:' -ForegroundColor Green
Write-Host $zipPath -ForegroundColor Green
