# TrussLab Architect 11.1 — GeoGrade
Released: 20 November 2026.
- Road and two-track railway shore approaches now follow grade- and curvature-limited smoothed profiles from the built-in Copernicus DEM.
- Four independently cached curves: Crimea road/rail and Taman road/rail.
- Terrain around each approach uses reversible in-memory cuts and fills while the original DEM data remains unchanged.
- Over-water approaches use supports; bridge deck, traffic buffers and edit operations remain separate.
- 2D height chart shows original DSM versus engineered alignments, responsive on mobile.
- Grades are illustrative under the scene's approximate 80 horizontal metres / 8 vertical metres per game unit. Not surveyed / engineering construction specifications.
- All earlier Node regressions and the 11.1 browser smoke test passed in the development environment.
