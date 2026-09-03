@echo off
REM Start the headless test server for a person to join, and keep it up.
REM
REM Double-click this, or run it from a terminal. The console window it opens
REM IS the server console: type `stop` there to shut down cleanly. Closing the
REM window kills it without saving, so prefer `stop`.
REM
REM Joining, from this machine or another on the LAN:
REM   Play -> Servers -> Add Server, address 127.0.0.1 (or this machine's LAN
REM   IP), port 19132.
REM
REM Deploy the packs BEFORE starting, and restart after any pack JSON or
REM manifest change - only scripts hot-reload, and `/reload` skips startup:
REM   CUSTOM_DEPLOYMENT_PATH="C:/bds/server" MINECRAFT_PRODUCT="Custom" npx just-scripts local-deploy

set BDS_DIR=C:\bds\server
if not exist "%BDS_DIR%\bedrock_server.exe" (
  echo No server at %BDS_DIR%\bedrock_server.exe
  echo See docs/gametest-structure-results.md for setup.
  pause
  exit /b 2
)

cd /d "%BDS_DIR%"
title QOL Test Server - type "stop" to shut down
echo Starting Bedrock Dedicated Server from %BDS_DIR%
echo Join at 127.0.0.1:19132, or this machine's LAN IP.
echo Type "stop" in this window to shut down cleanly.
echo.
bedrock_server.exe

echo.
echo Server exited. Press any key to close.
pause >nul
