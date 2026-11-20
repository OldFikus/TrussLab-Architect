@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
if not exist "data\geocity_import" (
 echo No input city GeoJSON found. First run prepare_geocity_windows.cmd or supply files manually.
 pause
 exit /b 1
)
py -3 "tools\build_region_tiles.py" --input "data\geocity_import" --output "data\region_tiles" --tile-km 2.048
if errorlevel 1 (
 echo Region tile conversion FAILED. Existing region cache is preserved.
 pause
 exit /b 1
)
echo Open game, choose REGIONS, then choose directory data\region_tiles.
pause
