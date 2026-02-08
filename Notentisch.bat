REM filepath: c:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\Notentisch.bat
@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM Definiere den Projekt-Pfad
set "PROJECTDIR=%~dp0"

REM Wechsle zum OneDrive-Root damit Server auf alle Dateien zugreifen kann
cd /d "C:\Users\User\OneDrive"

REM Prüfe ob Python installiert ist
python --version >nul 2>&1
if errorlevel 1 (
    echo Fehler: Python nicht installiert oder nicht im PATH!
    echo Bitte Python von python.org installieren.
    pause
    exit /b 1
)

REM Starte lokalen Server mit Python
echo Starte lokalen Server auf http://localhost:8000...
start "" python -m http.server 8000
timeout /t 2

REM Öffne die Anwendung im Standard-Browser
echo Öffne Notentisch im Browser...
start http://localhost:8000/lapdaten%%20%%28E%%29/Daten/Projekt%%20notentisch/board.html

echo.
echo ========================================
echo Digitaler Notentisch läuft!
echo ========================================
echo.
echo URL: http://localhost:8000/lapdaten%%20%%28E%%29/Daten/Projekt%%20notentisch/board.html
echo Projekt-Pfad: !PROJECTDIR!
echo.
echo Server läuft im Hintergrund.
echo Zum Beenden: Im Server-Fenster Ctrl+C drücken.
echo.
pause