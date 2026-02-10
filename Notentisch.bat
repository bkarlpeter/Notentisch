@echo off
chcp 65001 >nul
setlocal

REM === Pfad zum HTML-Projekt ===
set "WEBROOT=C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\Projekt_Notentisch"

REM === In das Webverzeichnis wechseln ===
cd /d "%WEBROOT%"

REM === Prüfen ob Python installiert ist ===
python --version >nul 2>&1
if errorlevel 1 (
    echo Fehler: Python ist nicht installiert oder nicht im PATH.
    pause
    exit /b 1
)

REM === Webserver starten ===
echo Starte lokalen Server auf http://localhost:8000 ...
start "" python -m http.server 8000

REM === Browser öffnen ===
echo Öffne Notentisch im Browser...
start "" "http://localhost:8000/board.html"

echo.
echo ========================================
echo Digitaler Notentisch läuft!
echo ========================================
echo Server-Verzeichnis: %WEBROOT%
echo URL: http://localhost:8000/board.html
echo.
pause
