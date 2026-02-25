@echo off
chcp 65001 >nul
setlocal

REM === Projektpfad ===
set "WEBROOT=%~dp0"
set "PORT=8000"
set "ENTRY=board.html"

REM === Python finden (python oder py -3) ===
set "PY_CMD="
where python >nul 2>&1
if %errorlevel%==0 set "PY_CMD=python"

if not defined PY_CMD (
    where py >nul 2>&1
    if %errorlevel%==0 set "PY_CMD=py -3"
)

if not defined PY_CMD (
    echo Fehler: Python wurde nicht gefunden.
    echo Bitte Python 3 installieren und "Add Python to PATH" aktivieren.
    echo Download: https://www.python.org/downloads/windows/
    echo.
    pause
    exit /b 1
)

pushd "%WEBROOT%"

echo Starte lokalen Server auf http://localhost:%PORT% ...
start "" cmd /c %PY_CMD% -m http.server %PORT%

timeout /t 2 /nobreak
start "" "http://localhost:%PORT%/%ENTRY%"

echo.
echo Digitaler Notentisch laeuft!
echo URL: http://localhost:%PORT%/%ENTRY%
echo.
pause

popd
