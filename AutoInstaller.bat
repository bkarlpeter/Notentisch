@echo off
setlocal

REM --- 1. Setup prüfen ---
if not exist .setup_notentisch_done (
    echo Running initial setup...
    powershell -ExecutionPolicy Bypass -File setup_notentisch.ps1
)

REM --- 2. Cards_Export prüfen ---
if not exist Cards_Export\*.png (
    echo Extracting card images...
    powershell -ExecutionPolicy Bypass -File extract_cards.ps1
)

REM --- 3. Normale App starten ---
call Notentisch.bat

endlocal
