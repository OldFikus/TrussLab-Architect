@echo off
setlocal
cd /d "%~dp0"
where py >NUL 2>&1
if errorlevel 1 (
  echo Python 3.11+ not found. Install Python for Windows first.
  pause
  exit /b 1
)
py -3 -c "import numpy, scipy, rasterio, PIL" >NUL 2>&1
if errorlevel 1 (
  echo Installing local GIS conversion dependencies...
  py -3 -m pip install -r tools\requirements-geo.txt
  if errorlevel 1 (echo Dependency installation failed.&pause&exit /b 1)
)
echo Preparing OSM coastlines and Copernicus GLO-30...
echo If Overpass times out, the tool WILL continue with DEM.
py -3 tools\prepare_geodata.py --download --osm-timeout 25 --output data\kerch_geopack.json
if errorlevel 1 (echo No new data obtained. See README_GEO.md.&pause&exit /b 1)
echo Done. Check the line [Layers of package] above.
echo In TrussLab select OSM + DEM and choose data\kerch_geopack.json
pause
