@echo off
chcp 65001 >nul
setlocal

REM === Erst als Administrator starten! ===
REM Erstellt eine Junction: Projekt\myMusic -> OneDrive\myMusic

set "PROJECT=C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch"
set "TARGET=C:\Users\User\OneDrive\myMusic"

if not exist "%TARGET%" (
  echo Fehler: Zielordner nicht gefunden: %TARGET%
  pause
  exit /b 1
)

if exist "%PROJECT%\myMusic" (
  echo Hinweis: %PROJECT%\myMusic existiert bereits.
  pause
  exit /b 0
)

mklink /J "%PROJECT%\myMusic" "%TARGET%"

if errorlevel 1 (
  echo Fehler: Junction konnte nicht erstellt werden.
  echo Tipp: Bitte als Administrator starten.
  pause
  exit /b 1
)

echo Junction erstellt: %PROJECT%\myMusic -> %TARGET%
pause
