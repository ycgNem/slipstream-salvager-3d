@echo off
rem Builds a web version of Slipstream Salvager 3D and zips it for itch.io (or any static host).
rem Result: slipstream-salvager-3d-web.zip next to this file, plus the unzipped build in dist\
title Package Slipstream Salvager 3D for the web
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

echo Building...
call npm run build
if errorlevel 1 (
  echo The build failed. See the messages above.
  pause
  exit /b 1
)

echo Zipping dist into slipstream-salvager-3d-web.zip ...
powershell -NoProfile -Command "Compress-Archive -Path 'dist\*' -DestinationPath 'slipstream-salvager-3d-web.zip' -Force"
if errorlevel 1 (
  echo Zipping failed.
  pause
  exit /b 1
)
echo.
echo Done! Upload slipstream-salvager-3d-web.zip to itch.io as an HTML game.
echo Upload it as an HTML game, or unzip it onto any static web host.
pause
