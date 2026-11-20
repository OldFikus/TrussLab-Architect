from pathlib import Path
p=Path(__file__).resolve().parents[1]
html=(p/'index_dev.html').read_text('utf8')
html=html.replace('TrussLab Architect 10.2 — GeoCity','TrussLab Architect 10.3 — RegionStream').replace('v10.2</b>','v10.3</b>')
html=html.replace('<button id="plan-toggle"','<button id="atlas-open" title="Масштабируемый потоковый атлас с региональными тайлами">🌐 Регионы</button><button id="plan-toggle"',1)
body='''
<!-- Regional Atlas is a separately streamed 2D world, not a fake infinite WebGL terrain. -->
<section id="atlas-overlay" hidden class="atlas-overlay" aria-label="TrussLab RegionStream — региональный атлас">
 <header class="atlas-head"><div><strong>🌐 REGIONSTREAM 10.3</strong><small>WGS84 / EPSG:3857 · тайловый региональный атлас · текущий 3D-мост: локальная сцена</small></div><button id="atlas-close" title="Закрыть региональную карту">✕ Закрыть</button></header>
 <nav class="atlas-controls">
  <button id="atlas-files" title="Выбрать папку с index.json и tiles">📁 Папка тайлов</button>
  <input hidden id="atlas-file-picker" type="file" webkitdirectory directory multiple>
  <button id="atlas-demo" title="Синтетический демонстрационный набор, НЕ реальные здания">▦ Демо</button>
  <button id="atlas-kerch">◉ Керчь</button><button id="atlas-crimea">◉ Крым</button>
  <button id="atlas-zoom-in">＋</button><button id="atlas-zoom-out">−</button>
  <button id="atlas-3d" title="Передаёт загруженные видимые GIS-объекты только в пределах текущей сцены Керченского моста">⬡ В локальный 3D</button>
 </nav>
 <div class="atlas-urlbar"><span>HTTP-индекс (при собственном локальном сервере):</span><input id="atlas-url" placeholder="http://localhost:8000/data/region_tiles/index.json" aria-label="URL регионального индекса"><button id="atlas-connect-url">Подключить</button><small id="atlas-capabilities">WebGL · WebGPU не активирован</small></div>
 <div class="atlas-stage-wrap"><canvas id="atlas-stage" aria-label="2D региональная карта; перетаскивание и масштаб колесом мыши"></canvas><div class="atlas-note">РЕГИОНАЛЬНЫЙ АТЛАС · исходные здания только после импорта GIS · демонстрационные объекты не являются реальными</div></div>
 <footer class="atlas-foot"><span id="atlas-status">Подключи подготовленную папку с географическими тайлами. GeoPack моста показывается как ограниченный фрагмент.</span><span id="atlas-scale"></span><span id="atlas-cursor">45.30844° N · 36.50649° E</span></footer>
</section>
'''
html=html.replace('</body>',body+'</body>')
html=html.replace('TRUSSLAB ARCHITECT 10.2 / GEO CITY','TRUSSLAB ARCHITECT 10.3 / REGIONSTREAM')
(p/'index_dev.html').write_text(html,'utf8')
css=(p/'style.css').read_text('utf8')
css+='''
/* 10.3 RegionStream: independent regional atlas, no whole-map 3D preallocation. */
.atlas-overlay{position:fixed;inset:12px;z-index:500;display:flex;flex-direction:column;background:#0e252c;color:#dbe9e8;border:1px solid #6a9699;border-radius:13px;box-shadow:0 14px 65px #0009;overflow:hidden;font:13px system-ui,sans-serif;min-height:0}
.atlas-overlay[hidden]{display:none!important}
.atlas-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;background:#152d35}
.atlas-head strong{font-size:15px;letter-spacing:.045em}.atlas-head small{display:block;color:#9bb6b8;margin-top:3px}
.atlas-overlay button{font:inherit;color:#dfece9;background:#25434d;border:1px solid #43636a;border-radius:7px;padding:7px 10px;cursor:pointer;white-space:nowrap}
.atlas-overlay button:hover{background:#3e626e}
.atlas-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;background:#18333b;border-bottom:1px solid #31545e}
.atlas-urlbar{display:flex;align-items:center;gap:8px;padding:7px 12px;background:#1b3037;flex-wrap:wrap}
.atlas-urlbar input{background:#0d252c;border:1px solid #50717a;border-radius:7px;color:#e6f2f0;padding:7px;flex:1;min-width:230px}
.atlas-urlbar small{color:#7cc7be}.atlas-urlbar span{white-space:nowrap;color:#abbfc0}
.atlas-stage-wrap{flex:1;min-height:200px;position:relative;background:#16353f}
#atlas-stage{display:block;width:100%;height:100%;cursor:grab;touch-action:none}#atlas-stage:active{cursor:grabbing}
.atlas-note{position:absolute;left:12px;bottom:12px;font-size:10px;color:#e6eded;pointer-events:none;background:#142a32c9;padding:5px 8px;border-radius:5px}
.atlas-foot{display:flex;align-items:center;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:10px 12px;background:#10262e;color:#c7d6d8}
#atlas-status{flex:1;min-width:230px}#atlas-scale{font-weight:600}#atlas-cursor{font-variant-numeric:tabular-nums}
@media(max-width:700px){.atlas-overlay{inset:0;border-radius:0}.atlas-head{padding:8px}.atlas-urlbar span{display:none}.atlas-head small{font-size:10px}}
'''
(p/'style.css').write_text(css,'utf8')
app=(p/'js/app.js').read_text('utf8')
app="import {RegionAtlas} from './region_atlas.js';\n"+app
anchor="if(typeof ResizeObserver!=='undefined'){new ResizeObserver(draw).observe(canvas);new ResizeObserver(()=>world3d.render(worldPayload(),false)).observe(world3d.canvas)}"
assert anchor in app
addon='''
// 10.3 regional atlas is independent of fixed-size 3D bridge and project JSON.
// Large GIS databases remain in the selected external tiles directory.
const atlas=new RegionAtlas({overlay:$('atlas-overlay'),canvas:$('atlas-stage'),status:$('atlas-status'),
 geoPack:world3d.geoPack,onLocal3D:(fc)=>{
  if(fc.features.length>12000)throw Error('Слишком много объектов для локального 3D (макс. 12 000)');
  const result=world3d.loadCityGeoJSON(fc);
  world3d.cityEnabled=true;st.track='bridge';st.idx=BRIDGES.findIndex(b=>b.id==='kerch');
  st.view='3d';world3d.sceneDirty=true;world3d.cityEnabled=true;render();
  note(`RegionStream: в 3D передано ${result.buildings} зданий и ${result.roads+result.rails} сегментов. Геометрия остального региона остаётся в 2D.`, 'good');
 }});
$('atlas-open').addEventListener('click',()=>{atlas.geoPack=world3d.geoPack;atlas.background=null;atlas.open()});
const gpuLabel=$('atlas-capabilities');gpuLabel.textContent=(typeof navigator!=='undefined'&&navigator.gpu?'WebGPU обнаружен, но пока не используется':'WebGPU недоступен / не подключён')+' · действующий 3D — WebGL';
'''
app=app.replace(anchor,anchor+addon)
(p/'js/app.js').write_text(app,'utf8')
build=(p/'build.py').read_text('utf8')
build=build.replace("'settlement','geocity','bundled_geopack'","'settlement','geocity','region_tiles','region_atlas','bundled_geopack'")
build=build.replace("['TrussLab_Architect_10_2_Standalone.html','index.html']","['TrussLab_Architect_10_3_Standalone.html','index.html']")
(p/'build.py').write_text(build,'utf8')
import json
pack=json.loads((p/'package.json').read_text('utf8'));pack['version']='10.3.0';pack['description']='TrussLab 10.3 RegionStream: external regional vector tiles, WGS84/EPSG:3857 2D atlas, isolated local WebGL bridge renderer';pack['scripts']['test'] += ' && node tests/test_v103.mjs'
(p/'package.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n','utf8')
