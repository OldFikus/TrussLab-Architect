from pathlib import Path
import re,base64
p=Path(__file__).parent
html=(p/'index_dev.html').read_text(encoding='utf8')
css=(p/'style.css').read_text(encoding='utf8')
js=[]
for name in ['geo_mask','gshhg_data','georef','geopack','route_geojson','settlement','geocity','region_tiles','region_atlas','geodesy_enu','geo_metric','region3d_geometry','region_quality','region_visibility','glb_loader','bundled_assets','region_assets','webgpu_probe','webgpu_renderer','region3d','bundled_region_demo','bundled_geopack','data','physics','road_grade','rendercore_materials','world3d','app']:
 s=(p/'js'/f'{name}.js').read_text(encoding='utf8')
 s=re.sub(r'^import .*?;\s*$','',s,flags=re.M)
 s=re.sub(r'\bexport (?=(?:async\s+)?(?:class|const|function)\b)','',s)
 js.append(s)
html=html.replace('<link rel="stylesheet" href="style.css">',f'<style>\n{css}\n</style>')
html=html.replace('<script type="module" src="js/app.js"></script>',f'<script>\n'+'\n'.join(js)+'\n</script>')
image=(p/'assets/satellite_reference.jpg')
if image.exists():
 html=html.replace('src="assets/satellite_reference.jpg"',f'src="data:image/jpeg;base64,{base64.b64encode(image.read_bytes()).decode()}"')
for filename in ['TrussLab_Architect_12_0_Standalone.html','index.html']:
 file=p/filename;file.write_text(html,encoding='utf8');print(file,round(len(html)/1024,1),'kB')
