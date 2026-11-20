@echo off
setlocal
cd /d "%~dp0"
echo GEO CITY / Overture Maps: building footprints and roads (download by area)
echo External open data, attribution is required. No Google Maps scraping.
echo.
echo Checking/installing Overture Python CLI (first run only)...
py -3 -m pip install "overturemaps>=0.14" || goto fail
echo.
echo Downloading Overture buildings and road segments near Kerch...
py -3 tools\download_geocity.py --area kerch --output data\geocity_import
if errorlevel 1 goto fail
echo.
echo Please import the resulting GeoJSON parts via GEO CITY toolbar in TrussLab 10.2.
pause
exit /b 0
:fail
echo.
echo Download failed; the existing OSM coastline, Copernicus DEM and game are NOT modified.
echo Alternative: https://explore.overturemaps.org/  ^(download visible buildings as GeoJSON^)
pause
exit /b 1
