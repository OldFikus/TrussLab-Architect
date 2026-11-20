# Graphics / architecture notes for future UE5 port

`TrussLab 10.0` is still a WebGL1/Electron procedural renderer. Its GPU shader uses per-fragment sun/water/specular lighting, cached directional shadows, local road lamps at night, and tone mapping. These features are not equivalent to UE5 Lumen/Nanite.

A realistic port should separate engine-independent model/simulation data from rendering: WGS84 GeoPack/GeoJSON, streaming tile metadata, traffic schedules, bridge graph (nodes/edges), 2D FEM control, and material IDs. Native route can be Unreal Engine 5 project with World Partition, Landscape Nanite (where supported), Lumen, Virtual Shadow Maps, Hierarchical Instanced Static Meshes, and packed PBR texture sets; copyright/licensing and map data version must be assessed separately. The present project does **not** include or run UE5.

Avoid interpreting this game's vertical exaggeration, arch proportions, pier spacing, or runtime stress simulation as as-built design documentation.

### 10.4 RegionWorld
Основной рендер регионального 3D использует WebGL1. WebGPU только проверяется по наличию адаптера/устройства и компиляции WGSL (не активный 3D-бэкенд). Нет PBR, глобального освещения, UE5 Nanite/Lumen, точной карты всех зданий, физически проверенной тени и фотограмметрии. WebGL тест в контейнере недоступен; программная 2.5D-ветка протестирована.
