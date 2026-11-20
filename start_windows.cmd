@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing the Electron development runtime...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Electron installation failed. Check network and run again.
    pause
    exit /b 1
  )
)
call npm run desktop
if errorlevel 1 pause
endlocal
