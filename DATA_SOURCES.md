# Data provenance — TrussLab 9.3

**Bundled:** GSHHG medium-resolution coastline (local intermediate dataset; Wessel & Smith LGPL terms) and the user's reference-derived shore mask. Terrain elevation is procedurally synthesized until a real DEM is imported.

**Optional external input (NOT bundled in this release):**

1. OpenStreetMap `natural=coastline` from Overpass API, © OpenStreetMap contributors, Open Database License (ODbL). Details and attribution: https://www.openstreetmap.org/copyright
2. Copernicus DEM GLO-30 Public, public AWS Cloud Optimized GeoTIFF, Copernicus Programme / ESA. Documentation: https://copernicus-dem-30m.s3.amazonaws.com/readme.html

A local tool can fetch, rasterize and load real data. It uses an approximate one-point WGS84-to-game transform and nearest-directed-segment OSM land classification, both **non-surveyed**. Copernicus DEM is a DSM (vegetation and buildings may be present); its grid contains no bathymetry. Full details: README_GEO.md.


## 9.4: Векторные линии дороги и железной дороги (не входят в сборку)

Игра может принять пользовательский WGS84 GeoJSON из QGIS с двумя длинными
`LineString` и `properties.mode = "road" / "rail"`. Для получения
местных данных OSM без Overpass можно запросить региональный или
пользовательский экспорт в https://extract.bbbike.org/ , затем
отфильтровать дорожные и железнодорожные линии и объединить нужные
отрезки в непрерывные оси. Важно не выдавать всю сеть дорог за
трассировку моста. Экспорт одной трассы из самой игры означает
**приблизительную игровую геометрию**, а не оригинальные записи OSM.

Вертикальный датум Copernicus GLO-30: EGM2008 / EPSG:3855; это DSM.
