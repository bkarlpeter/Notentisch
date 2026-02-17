@echo off
chcp 65001 >nul
setlocal

REM === Projektpfad ===
set "WEBROOT=%~dp0"

pushd "%WEBROOT%"

echo Starte lokalen Server auf http://localhost:8000 ...
start "" python -m http.server 8000

timeout /t 2 /nobreak
start "" "http://localhost:8000/board.html"

echo.
echo Digitaler Notentisch laeuft!
echo URL: http://localhost:8000/board.html
echo.
pause

popd
