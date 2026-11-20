# TrussLab Architect 10.0 · GeoLight

- Bundled user-supplied GeoPack (512×512) including OSM-derived 2017-era sea polygons and Copernicus GLO-30 DSM, used offline at startup. Data downloaded / prepared on user's machine and uploaded to conversation. Source at `data/kerch_geopack.json`; license OSM ODbL attribution is retained.
- Independently verified coast-based approach fit: x0 = −160.5 and x1 = 156 game units. Both nominal road / rail endpoints on land; total game-axis length ≈25.5 km, **not the real bridge engineering length (≈19 km)**. This shows remaining heading/calibration error. Do not present as 1:1.
- Added continuously variable sunlight with time-of-day control, amber streetlamp contribution in shader at night, illuminated bridge surfaces, starry night sky, distance fog. Physically inspired; *not UE5*.
- Expanded streamed coastal LOD at near distance, added land-only vegetation/settlements and land approach roads/rail with separate two-track railway.
- Existing 2D and 3D editor, thermal modes, bridge calculations, dynamic traffic, terrain streaming, presets, and Electron desktop kept.
- Retained user's GeoPack without editing OSM/DEM.

Safety: engineering FEM, 3D structural shapes and bridge grades remain gameplay / illustrative, not a survey or certified project.
