@echo off
setlocal

cd /d "%~dp0"

if "%PORT%"=="" set "PORT=3000"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://localhost:%PORT%/health' | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "fridge-ingredients-server" /min cmd /c "cd /d ""%~dp0"" && set PORT=%PORT% && node server.js"
  timeout /t 2 /nobreak >nul
)

start "" "http://localhost:%PORT%"
exit /b 0

