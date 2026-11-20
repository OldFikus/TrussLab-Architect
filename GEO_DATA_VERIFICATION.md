# GeoPack verification (source: direct user attachment)

- Submitted file: `kerch_geopack(1).json`, unmodified raw payload in `data/kerch_geopack.json`.
- TrussLabGeoPack v1; 512×512; 420 game scene units; 80 m per horizontal unit per original approximate frame.
- OSM-derived land mask: 0.3598747253 fraction land, source `@geo-maps/earth-seas-10m` v0.6.0, archive snapshot circa 2017, © OpenStreetMap contributors, ODbL 1.0.
- Copernicus GLO-30 DSM: int16 LE ×0.1 m, valid all 512×512 samples, approximately −8.1 to 166.8 m. Not underwater bathymetry.
- One WGS84 anchor supplied: lat 45.308440, lon 36.506491; approximate map heading −24°.
- Original approximate bridge axes x−118..118: 0% route over land. Visual coastal endpoint fit using both road/rail: x−160.5..156, both termini on land, 2 crossings per line, total nominal length ≈25.5 km. This is **not** the engineering alignment or actual ~19 km bridge.
- Because 1-point heading is approximate, the package avoids claiming geodetically correct Tuazla island, true span locations, real pier alignments, material specifications or as-built structure.

Related diagnostic visualization: `assets/geopack_10_alignment_preview.png`. Use the original GeoPack unchanged when recalibrating with additional verified control points.
