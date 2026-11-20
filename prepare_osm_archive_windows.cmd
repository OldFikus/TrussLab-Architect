@echo off
setlocal
cd /d "%~dp0"
echo Downloading OSM-derived coastline archive from npm (no Overpass / no EMODnet).
echo Keeps your existing Copernicus DEM in data\kerch_geopack.json.
echo This OSM snapshot is historical, not a live coastline.
py -3 tools\prepare_osm_archive.py --output data\kerch_geopack.json
if errorlevel 1 (
 echo.
 echo Import failed. Existing DEM was kept. See README_OSM_ARCHIVE_RU.md.
) else (
 echo.
 echo Ready. Re-import data\kerch_geopack.json in TrussLab.
)
pause
