@echo off
title Restaurant Jukebox Host
color 0b
echo =========================================================
echo       RESTAURANT JUKEBOX - HOST LAUNCHER
echo =========================================================
echo.
cd /d "%~dp0"

echo [1/3] Freeing port 8888 if occupied...
powershell -NoProfile -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1

echo [2/3] Starting Jukebox Server in Background...
start "Jukebox Server" /min cmd /c "node server/server.js"

timeout /t 2 /nobreak >nul

echo [3/3] Opening Web Browser...
start "" "http://localhost:8888/"

echo.
echo =========================================================
echo  [SUCCESS] Jukebox Host is now active!
echo  - Web Page : http://localhost:8888/
echo =========================================================
echo.
echo (Do not close this window while serving music)
echo Press any key to stop Jukebox...
pause >nul

echo.
echo Stopping Jukebox Server...
powershell -NoProfile -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1
echo Goodbye!
timeout /t 1 /nobreak >nul