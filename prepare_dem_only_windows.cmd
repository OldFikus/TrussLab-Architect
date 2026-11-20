@echo off
setlocal
cd /d "%~dp0"
where py >NUL 2>&1
if errorlevel 1 (echo Python not found.&pause&exit /b 1)
py -3 -c "import numpy, scipy, rasterio, PIL" >NUL 2>&1
if errorlevel 1 (py -3 -m pip install -r tools\requirements-geo.txt)
echo Downloading ONLY Copernicus GLO-30; skips overloaded Overpass.
py -3 tools\prepare_geodata.py --download --dem-only --output data\kerch_geopack.json
if errorlevel 1 (echo DEM download failed.&pause&exit /b 1)
echo Ready. Import data\kerch_geopack.json into TrussLab.
pause
