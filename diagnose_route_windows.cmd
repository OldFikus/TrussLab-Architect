@echo off
setlocal
cd /d "%~dp0"
set "GEOPACK=data\kerch_geopack.json"
if not "%~1"=="" set "GEOPACK=%~1"
if not exist "%GEOPACK%" if exist "..\TrussLab_Architect_9_3\data\kerch_geopack.json" set "GEOPACK=..\TrussLab_Architect_9_3\data\kerch_geopack.json"
if not exist "%GEOPACK%" (
 echo GeoPack not found. Drag your kerch_geopack.json onto this CMD,
 echo or run: py -3 tools\diagnose_route_geopack.py --geopack "E:\TrussLab_Architect_9_3\data\kerch_geopack.json"
 pause
 exit /b 1
)
echo Analyze existing GeoPack; no downloads and no changes to DEM.
py -3 tools\diagnose_route_geopack.py --geopack "%GEOPACK%"
if errorlevel 1 (
 echo Diagnostic failed. The source GeoPack was not modified.
) else (
 echo View kerch_route_alignment.png next to GeoPack and share it for accurate route alignment.
)
pause
