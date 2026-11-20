@echo off
setlocal
cd /d "%~dp0"
set PORT=8877
where py >nul 2>nul
if errorlevel 1 (
 echo Python 3 launcher not available; install Python 3 and add py launcher.
 pause
 exit /b 1
)
echo Local-only server 127.0.0.1:%PORT% (not exposed to the Internet).
start "TrussLab 10.3 Region Server" cmd /k "cd /d ""%~dp0"" && py -3 -m http.server %PORT% --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/index.html"
echo To load region tiles via URL, use: http://127.0.0.1:%PORT%/data/region_tiles/index.json
