#!/usr/bin/env powershell
<#
.SYNOPSIS
    Build standalone Notentisch package with EXE and web assets

.PARAMETER Version
    Package version (default: v2026.07.09)

.PARAMETER OutputDir
    Output directory for package (default: release)
#>

param(
    [string]$Version = "v2026.07.09",
    [string]$OutputDir = "dist/access",
    [int]$SamplePdfCount = 0,
    [int]$SeparateSamplePdfCount = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$releaseDir = Join-Path $repoRoot $OutputDir
$packageName = "Notentisch-Complete-$Version"
$packageDir = Join-Path $releaseDir $packageName
$zipPath = Join-Path $releaseDir "$packageName.zip"
$samplePdfPackageName = "Notentisch-Beispiel-PDFs-$Version"
$samplePdfPackageDir = Join-Path $releaseDir $samplePdfPackageName
$samplePdfZipPath = Join-Path $releaseDir "$samplePdfPackageName.zip"
$samplePdfFolderName = 'Bl' + [char]0x00E4 + 'tter'

Write-Host "=== Building Notentisch Standalone Package ===" -ForegroundColor Green
Write-Host "Version: $Version`n" -ForegroundColor Cyan

# Clean old builds
if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
}
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
if (Test-Path $samplePdfPackageDir) {
    Remove-Item -Recurse -Force $samplePdfPackageDir
}
if (Test-Path $samplePdfZipPath) {
    Remove-Item -Force $samplePdfZipPath
}

New-Item -ItemType Directory -Path $packageDir | Out-Null

# ============================================
# 1. Build Standalone EXE
# ============================================
Write-Host "`n[1/4] Building Standalone EXE..." -ForegroundColor Yellow

# Install PyInstaller if needed
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    & $venvPython -m pip install -q pyinstaller
} else {
    py -3 -m pip install -q pyinstaller
}

# Build executable
Push-Location $repoRoot

$pyDistDir = Join-Path $repoRoot "dist\pyinstaller"
$pyWorkDir = Join-Path $repoRoot "build\pyinstaller"
$pySpecPath = Join-Path $repoRoot "build\pyinstaller"
$pySpecFile = Join-Path $pySpecPath "Notentisch.spec"

Remove-Item -Path $pyWorkDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $pyDistDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $pySpecFile -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $pyDistDir -Force | Out-Null
New-Item -ItemType Directory -Path $pyWorkDir -Force | Out-Null
New-Item -ItemType Directory -Path $pySpecPath -Force | Out-Null

$pyiCmd = if (Test-Path $venvPython) { @($venvPython, '-m', 'PyInstaller') } else { @('py', '-3', '-m', 'PyInstaller') }
& $pyiCmd[0] $pyiCmd[1] $pyiCmd[2] --onefile `
    --distpath "$pyDistDir" `
    --workpath "$pyWorkDir" `
    --specpath "$pySpecPath" `
    --name "Notentisch" `
    local_server.py

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed with exit code $LASTEXITCODE"
}

# Copy EXE to package
Copy-Item (Join-Path $pyDistDir "Notentisch.exe") "$packageDir\" -Force
# Copy all application files from dist/ (EXE and launcher are generated separately)
Get-ChildItem -Path (Join-Path $repoRoot 'dist') -File |
    Where-Object { $_.Extension -ne '.exe' -and $_.Name -ne 'Start-Notentisch.bat' -and $_.Name -ne 'README.txt' } |
    Copy-Item -Destination "$packageDir\" -Force

# Copy VBS wrapper (alternative starter)
$vbsPath = Join-Path $repoRoot 'Notentisch.vbs'
if (Test-Path $vbsPath) {
    Copy-Item $vbsPath "$packageDir\" -Force
}

$samplePdfSourceDir = Join-Path $repoRoot $samplePdfFolderName
$samplePdfs = @()
if ($SamplePdfCount -gt 0) {
    $samplePdfs = @(
        Get-ChildItem -LiteralPath $samplePdfSourceDir -File -Filter "*.pdf" |
            Sort-Object Name |
            Select-Object -First $SamplePdfCount
    )
    if ($samplePdfs.Count -lt $SamplePdfCount) {
        throw "Only $($samplePdfs.Count) of $SamplePdfCount requested embedded PDFs found in $samplePdfSourceDir"
    }
    $samplePdfTargetDir = Join-Path $packageDir $samplePdfFolderName
    New-Item -ItemType Directory -Path $samplePdfTargetDir -Force | Out-Null
    $samplePdfs | Copy-Item -Destination $samplePdfTargetDir -Force
}

Pop-Location

Write-Host "  [OK] Standalone EXE and $($samplePdfs.Count) sample PDFs created" -ForegroundColor Green

# ============================================
# 2. Create batch launcher script
# ============================================
Write-Host "[2/4] Creating launcher script..." -ForegroundColor Yellow

# Main launcher
$launcherContent = @"
@echo off
REM Notentisch Complete Package Launcher
REM ===========================================

cd /d "%~dp0"

REM Start Notentisch server in background (no extra window)
start /B Notentisch.exe >nul 2>&1

REM Wait until the one-file EXE has unpacked and the server is reachable.
for /L %%I in (1,1,20) do (
    powershell -NoProfile -Command "try { `$r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8000/board.html; if (`$r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
    if not errorlevel 1 goto server_ready
    timeout /t 1 /nobreak >nul
)

echo Notentisch server did not start on port 8000.
pause
exit /b 1

:server_ready
start "" "http://127.0.0.1:8000/board.html"
"@

[System.IO.File]::WriteAllText("$packageDir\Start-Notentisch.bat", $launcherContent, [System.Text.Encoding]::ASCII)

Write-Host "  [OK] Launcher script created" -ForegroundColor Green

# ============================================
# 3. Create installation/setup document
# ============================================
Write-Host "[3/4] Creating installation guide..." -ForegroundColor Yellow

$readmeContent = @"
# Notentisch Complete Package - Installation Guide

## What's included
- **Notentisch.exe**: Standalone note viewer (board.html)
- **Web assets**: HTML/CSS/JS for board/config views
- **Sample PDFs**: $($samplePdfs.Count) example scores (available separately when not included)
- **Launcher script**: Quick start batch file

## Requirements
- Windows 7 or later

## Installation

1. Extract all files to a folder (e.g., C:\Notentisch)

2. Double-click **Start-Notentisch.bat**

## First Use

### For Note Viewing:
1. Run Start-Notentisch.bat
2. Browser opens automatically to http://127.0.0.1:8000/board.html
3. Displays the note board interface

## Troubleshooting

**"Notentisch.exe won't start"**
-> Check Windows Defender, may need to allow through firewall

**"Browser opens but page does not load"**
-> Ensure port 8000 is free and not blocked by another app.

## Support
For issues or questions, check the project repository.

---
Version: $Version
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@

$readmeContent | Set-Content "$packageDir\INSTALLATION.md" -Encoding UTF8

Write-Host "  [OK] Installation guide created" -ForegroundColor Green

# ============================================
# 4. Add quick reference
# ============================================
Write-Host "[4/4] Creating quick reference..." -ForegroundColor Yellow

$quickRefContent = @"
=============================================
    NOTENTISCH - QUICK START
=============================================

    View Notes:
        Double-click: Start-Notentisch.bat

    Access from browser:
        http://127.0.0.1:8000/board.html
"@

$quickRefContent | Set-Content "$packageDir\QUICK-START.txt" -Encoding UTF8

Write-Host "  [OK] Quick reference created" -ForegroundColor Green

# ============================================
# 6. Copy additional documentation
# ============================================
Write-Host "`n[BONUS] Copying documentation..." -ForegroundColor Yellow

$docsToCopy = @("README.md", "changelog.md", "LICENSE.txt", "INSTALL.md")
foreach ($doc in $docsToCopy) {
    $docPath = Join-Path $repoRoot $doc
    if (Test-Path $docPath) {
        Copy-Item $docPath "$packageDir\" -Force 2>$null
    }
}

Write-Host "  [OK] Documentation copied" -ForegroundColor Green

# ============================================
# 7. Create ZIP package
# ============================================
Write-Host "`n[COMPRESS] Creating ZIP archive..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $packageDir,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false,
    [System.Text.Encoding]::UTF8
)

Write-Host "  [OK] ZIP created" -ForegroundColor Green

if ($SeparateSamplePdfCount -gt 0) {
    $separateSamplePdfs = @(
        Get-ChildItem -LiteralPath $samplePdfSourceDir -File -Filter "*.pdf" |
            Sort-Object Name |
            Select-Object -First $SeparateSamplePdfCount
    )
    if ($separateSamplePdfs.Count -lt $SeparateSamplePdfCount) {
        throw "Only $($separateSamplePdfs.Count) of $SeparateSamplePdfCount requested separate sample PDFs found in $samplePdfSourceDir"
    }

    $separatePdfTargetDir = Join-Path $samplePdfPackageDir $samplePdfFolderName
    New-Item -ItemType Directory -Path $separatePdfTargetDir -Force | Out-Null
    $separateSamplePdfs | Copy-Item -Destination $separatePdfTargetDir -Force
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $samplePdfPackageDir,
        $samplePdfZipPath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false,
        [System.Text.Encoding]::UTF8
    )
    Remove-Item -Recurse -Force $samplePdfPackageDir
    Write-Host "  [OK] Separate sample PDF ZIP created" -ForegroundColor Green
}

# ============================================
# Summary
# ============================================
Write-Host "`n" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PACKAGE READY FOR DISTRIBUTION" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nLocation: $zipPath" -ForegroundColor Cyan
Write-Host "Size: $([math]::Round((Get-Item $zipPath).Length / 1MB, 2)) MB`n" -ForegroundColor Cyan
if (Test-Path $samplePdfZipPath) {
    Write-Host "Sample PDFs: $samplePdfZipPath" -ForegroundColor Cyan
    Write-Host "Sample size: $([math]::Round((Get-Item $samplePdfZipPath).Length / 1MB, 2)) MB`n" -ForegroundColor Cyan
}

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Share the ZIP file with recipient"
Write-Host "2. Recipient extracts it to a folder"
Write-Host "3. Recipient runs Start-Notentisch.bat"
Write-Host "`n"

Write-Host "[OK] Build complete!" -ForegroundColor Green
