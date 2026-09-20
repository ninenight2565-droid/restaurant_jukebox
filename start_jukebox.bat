@echo off
title Restaurant Jukebox V2
color 0b
echo =========================================================
echo       RESTAURANT JUKEBOX V2 - AUTO STARTUP
echo =========================================================
echo.
cd /d "%~dp0"

echo [1/3] Freeing port 8888 if occupied...
powershell -NoProfile -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1

echo [2/3] Starting Server...
start "Jukebox Server" cmd /k "node server/server.js"

timeout /t 3 /nobreak >nul

echo [3/3] Launching Jukebox Lobby...
start "" "http://localhost:8888/"

echo.
echo =========================================================
echo  [READY] Multi-Room Jukebox is now running!
echo  - Lobby:  http://localhost:8888/
echo  - Player: http://localhost:8888/main/player
echo  - Admin:  http://localhost:8888/main/admin (PIN: 1234)
echo =========================================================
echo.
pause