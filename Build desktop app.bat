@echo off
rem Builds the Windows desktop version of Slipstream Salvager 3D.
rem Result (in the release folder):
rem   Slipstream-Salvager-3D-Setup-<version>.exe     an installer (Start menu + desktop shortcut)
rem   Slipstream-Salvager-3D-Portable-<version>.exe  a single exe that runs without installing
title Build Slipstream Salvager 3D for Windows
cd /d "%~dp0"

set "NODE_DIR=%USERPROFILE%\tools\node-v22.20.0-win-x64"
where node >nul 2>nul
if errorlevel 1 if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist node_modules call npm install

call npm run dist:win
if errorlevel 1 (
  echo The build failed. See the messages above.
  pause
  exit /b 1
)
echo.
echo Done! Your installers are in the "release" folder.
explorer release
pause
