@echo off
chcp 65001 >nul
setlocal

REM === Projektpfad ===
set "WEBROOT=%~dp0"
set "PORT=9000"
set "ENTRY=board.html"
set "POWER_RESTORE_CMD="

set "SUB_VIDEO=7516b95f-f776-4464-8c53-06167f40cc99"
set "VIDEOIDLE=3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e"
set "SUB_SLEEP=238c9fa8-0aad-41ed-83f4-97be242c8f20"
set "STANDBYIDLE=29f6c1db-86da-48c5-9fdb-f2b67b1f44da"

REM === Python finden (python oder py -3) ===
set "PY_CMD="
set "PY_ARGS="
where python >nul 2>&1
if %errorlevel%==0 (
    python --version >nul 2>&1
    if %errorlevel%==0 set "PY_CMD=python"
)

if not defined PY_CMD (
    where py >nul 2>&1
    if %errorlevel%==0 (
        py -3 --version >nul 2>&1
        if %errorlevel%==0 (
            set "PY_CMD=py"
            set "PY_ARGS=-3"
        )
    )
)

if not defined PY_CMD (
    echo Fehler: Python wurde nicht gefunden.
    echo Bitte Python 3 installieren und "Add Python to PATH" aktivieren.
    echo Download: https://www.python.org/downloads/windows/
    echo.
    exit /b 1
)

pushd "%WEBROOT%"

REM === Aktuelle Energie-Werte merken und Restore-Skript vorbereiten ===
for /f "tokens=3" %%G in ('powercfg /getactivescheme') do set "ACTIVE_SCHEME=%%G"

for /f "delims=" %%V in ('powershell -NoProfile -Command "$line=(powercfg /query \"%ACTIVE_SCHEME%\" \"%SUB_VIDEO%\" \"%VIDEOIDLE%\" ^| Select-String \"Current AC Power Setting Index\" ^| Select-Object -First 1).ToString(); if($line){$line.Split(':')[-1].Trim()}"') do set "VIDEO_AC=%%V"
for /f "delims=" %%V in ('powershell -NoProfile -Command "$line=(powercfg /query \"%ACTIVE_SCHEME%\" \"%SUB_VIDEO%\" \"%VIDEOIDLE%\" ^| Select-String \"Current DC Power Setting Index\" ^| Select-Object -First 1).ToString(); if($line){$line.Split(':')[-1].Trim()}"') do set "VIDEO_DC=%%V"
for /f "delims=" %%V in ('powershell -NoProfile -Command "$line=(powercfg /query \"%ACTIVE_SCHEME%\" \"%SUB_SLEEP%\" \"%STANDBYIDLE%\" ^| Select-String \"Current AC Power Setting Index\" ^| Select-Object -First 1).ToString(); if($line){$line.Split(':')[-1].Trim()}"') do set "STANDBY_AC=%%V"
for /f "delims=" %%V in ('powershell -NoProfile -Command "$line=(powercfg /query \"%ACTIVE_SCHEME%\" \"%SUB_SLEEP%\" \"%STANDBYIDLE%\" ^| Select-String \"Current DC Power Setting Index\" ^| Select-Object -First 1).ToString(); if($line){$line.Split(':')[-1].Trim()}"') do set "STANDBY_DC=%%V"

if defined ACTIVE_SCHEME if defined VIDEO_AC if defined VIDEO_DC if defined STANDBY_AC if defined STANDBY_DC (
    set "POWER_RESTORE_CMD=%TEMP%\notentisch_restore_power_%RANDOM%%RANDOM%.cmd"
    > "%POWER_RESTORE_CMD%" (
        echo @echo off
        echo powercfg /setacvalueindex %ACTIVE_SCHEME% %SUB_VIDEO% %VIDEOIDLE% %VIDEO_AC% ^>nul 2^>^&1
        echo powercfg /setdcvalueindex %ACTIVE_SCHEME% %SUB_VIDEO% %VIDEOIDLE% %VIDEO_DC% ^>nul 2^>^&1
        echo powercfg /setacvalueindex %ACTIVE_SCHEME% %SUB_SLEEP% %STANDBYIDLE% %STANDBY_AC% ^>nul 2^>^&1
        echo powercfg /setdcvalueindex %ACTIVE_SCHEME% %SUB_SLEEP% %STANDBYIDLE% %STANDBY_DC% ^>nul 2^>^&1
        echo powercfg /setactive %ACTIVE_SCHEME% ^>nul 2^>^&1
        echo del "%%~f0" ^>nul 2^>^&1
    )
)

REM === Energiesparen/Bildschirmabschaltung deaktivieren (AC + Akku) ===
powercfg /x monitor-timeout-ac 0 >nul 2>&1
powercfg /x monitor-timeout-dc 0 >nul 2>&1
powercfg /x standby-timeout-ac 0 >nul 2>&1
powercfg /x standby-timeout-dc 0 >nul 2>&1

echo Starte lokalen Server auf http://localhost:%PORT% ...
if defined POWER_RESTORE_CMD (
    start "" cmd /c ""%PY_CMD%" %PY_ARGS% local_server.py %PORT% & call "%POWER_RESTORE_CMD%""
) else (
    start "" cmd /c ""%PY_CMD%" %PY_ARGS% local_server.py %PORT%"
)

timeout /t 2 /nobreak
start "" "http://localhost:%PORT%/%ENTRY%"

echo.
echo Digitaler Notentisch laeuft!
echo URL: http://localhost:%PORT%/%ENTRY%
echo.
popd
