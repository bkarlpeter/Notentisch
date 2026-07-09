#!/usr/bin/env powershell
# Build Notentisch standalone package

$ErrorActionPreference = "Stop"

Write-Host "=== Building Notentisch Standalone Package ===" -ForegroundColor Green

# 1. Install PyInstaller
Write-Host "`nInstalling PyInstaller..." -ForegroundColor Yellow
pip install -q pyinstaller

# 2. Clean old builds
Write-Host "Cleaning old builds..." -ForegroundColor Yellow
Remove-Item -Path "build", "dist", "*.spec" -Recurse -Force -ErrorAction SilentlyContinue

# 3. Build executable
Write-Host "Building executable..." -ForegroundColor Yellow
pyinstaller --onefile `
    --distpath .\dist `
    --workpath .\build `
    --specpath . `
    --name "Notentisch" `
    --add-data "board.html:." `
    --add-data "config.html:." `
    --add-data "advanced_config.html:." `
    --add-data "presets.html:." `
    --add-data "board-presets.css:." `
    --add-data "board-presets.js:." `
    local_server.py

# 4. Copy additional files
Write-Host "Copying additional files..." -ForegroundColor Yellow
$pkgDir = "dist"
Copy-Item "*.js" "$pkgDir" -Exclude "*.spec" -Force 2>$null
Copy-Item "*.css" "$pkgDir" -Force 2>$null

# 5. Create launch batch
Write-Host "Creating launch script..." -ForegroundColor Yellow
$batchContent = "@echo off`r`nREM Notentisch Standalone Launcher`r`ncd /d `"%~dp0`"`r`nstart http://127.0.0.1:8000`r`nNotentisch.exe`r`n"
[System.IO.File]::WriteAllText("$pkgDir\Start-Notentisch.bat", $batchContent, [System.Text.Encoding]::ASCII)

# 6. Create README
Write-Host "Creating README..." -ForegroundColor Yellow
$readmeContent = @"
Notentisch - Standalone Package

Installation:
1. Extract all files to a folder
2. Double-click Start-Notentisch.bat
3. Browser opens automatically at http://127.0.0.1:8000

Shutdown:
Close the command window or press Ctrl+C

System Requirements:
- Windows 7 or later
- No Python or other software needed!

This folder is portable - copy to any Windows computer.
"@
[System.IO.File]::WriteAllText("$pkgDir\README.txt", $readmeContent, [System.Text.Encoding]::UTF8)

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "Package: $(Get-Item $pkgDir | Select-Object -ExpandProperty FullName)" -ForegroundColor Cyan
