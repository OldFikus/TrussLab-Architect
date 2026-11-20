from pathlib import Path
p=Path(__file__).resolve().parents[1];f=p/'js/region3d.js';s=f.read_text()
s=s.replace("import {visibleRegionMeshes,tileInHorizontalView} from './region_visibility.js';", "import {visibleRegionMeshes,tileInHorizontalView} from './region_visibility.js';\nimport {RegionAssetStream} from './region_assets.js';")
s=s.replace("this.lastStatus=0;this.lastFrame=0;", "this.assets=new RegionAssetStream(geoPack);this.showAssets=true;this.modelCache=new Map();this.visibleModels=[];\n  this.lastStatus=0;this.lastFrame=0;")
needle="  document.getElementById('region3d-gpu-probe')?.addEventListener('click',async()=>{"
insert="""  document.getElementById('region3d-models')?.addEventListener('click',()=>{
   this.showAssets=!this.showAssets;const b=document.getElementById('region3d-models');if(b)b.textContent='GLB модели: '+(this.showAssets?'вкл':'выкл');
  });
  document.getElementById('region3d-model-focus')?.addEventListener('click',()=>{
   const p=this.assets.instances[0];if(!p){this.statusMessage('Нет размещённых GLB-моделей');return;}
   this.goTo(p.lat+.00055,p.lon-.0011);this.cam.y=Math.max(90,this.cam.y-35);this.pitch=-.35;this.yaw=1.14;this.statusMessage('Демо-модели оригинальные; это не реальные сооружения');
  });
  document.getElementById('region3d-model-import')?.addEventListener('click',()=>document.getElementById('region3d-model-file')?.click());
  document.getElementById('region3d-model-file')?.addEventListener('change',async e=>{
   const file=e.target.files?.[0];if(!file)return;
   try{if(file.size>16_000_000)throw Error('GLB должен быть меньше 16 МБ');
    const id='custom_'+Date.now();const model=this.assets.registerGLB(id,new Uint8Array(await file.arrayBuffer()),{label:file.name});
    const here=mercatorUnproject(this.cam.x,-this.cam.z);this.assets.add({assetId:id,lon:here.lon,lat:here.lat,source:'Imported user GLB'});
    this.modelCache.clear();this.showAssets=true;this.statusMessage('Загружена модель '+file.name+': '+model.triangles+' △. Размещена на текущем участке суши.');
   }catch(err){this.statusMessage('GLB: '+String(err?.message||err));}
   e.target.value='';
  });
"""
assert needle in s;s=s.replace(needle,insert+needle)
s=s.replace('  const keep=new Set([...want]);', '''  this.visibleModels=[];let modelMade=0;const keepModels=new Set();
  if(this.showAssets){
   for(const c of this.assets.cellsNear(this.cam.x,-this.cam.z,range+420)){
    const detail=c.dist<820&&terrainQuality!=='low'?'high':'low',key=c.key+'|'+detail+'|'+this.assets.revision;
    keepModels.add(key);let item=this.modelCache.get(key);
    if(!item&&modelMade<2){const cpu=this.assets.buildCell(c.tx,c.ty,{detail});if(cpu){item=this.gl?this._makeBuffer(cpu):cpu;this.modelCache.set(key,item);modelMade++;}}
    if(item){this.modelCache.delete(key);this.modelCache.set(key,item);this.visibleModels.push(item);}
   }
  }
  this._evict(this.modelCache,30,keepModels);
  const keep=new Set([...want,...keepModels]);''')
s=s.replace('[this.terrainCache,this.cityCache],{limitBytes','[this.terrainCache,this.cityCache,this.modelCache],{limitBytes')
s=s.replace('  const allEntries=[...this.visibleTerrain,...(this.showCity?this.visibleCity:[])];','  const allEntries=[...this.visibleTerrain,...(this.showCity?this.visibleCity:[]),...(this.showAssets?this.visibleModels:[])];')
s=s.replace('  // Only visualize footprints explicitly present in the bundled/loaded regional tiles.', '''  if(this.showAssets){
   const markers=[];for(const p of this.assets.instances){const m=mercatorProject(p.lon,p.lat),g=sampleRegionGround(this.geoPack,m.x,m.y);
    const base=project(m.x,g.height,-m.y),top=project(m.x,g.height+(p.assetId==='crane'?44:p.assetId==='lighthouse'?35:12)*p.scale,-m.y);
    if(base&&top&&base.depth<1800)markers.push({base,top});
   }
   markers.sort((a,b)=>b.base.depth-a.base.depth);ctx.strokeStyle='#f4d493';ctx.lineWidth=3;
   for(const o of markers){ctx.beginPath();ctx.moveTo(o.base.x,o.base.y);ctx.lineTo(o.top.x,o.top.y);ctx.stroke();}
  }
  // Only visualize footprints explicitly present in the bundled/loaded regional tiles.''')
s=s.replace(' · сдвигов ${s.rebases}`;'," · GLB ${this.showAssets?this.visibleModels.length:0} тайл. / ${this.assets.instances.length} объектов · сдвигов ${s.rebases}`;")
# ensure model buffers freed on epoch pack transition
s=s.replace("  const terrainQuality=this._effectiveQuality()", "  const terrainQuality=this._effectiveQuality()")
f.write_text(s)
idx=p/'index_dev.html';html=idx.read_text()
needle='<button id="region3d-gpu-probe"'
assert needle in html
html=html.replace(needle,'''<button id="region3d-models" title="Встроенные оригинальные GLB 2.0 модели, с отдельным потоковым GPU-кэшем">GLB модели: вкл</button><button id="region3d-model-focus" title="Перелететь к демонстрационному портовому кварталу">◉ Модели</button><button id="region3d-model-import" title="Открыть GLB со своего компьютера, необязательно">Импорт GLB</button><input type="file" id="region3d-model-file" accept=".glb,model/gltf-binary" hidden>\n  <button id="region3d-gpu-probe"''')
html=html.replace('REGIONWORLD 10.7','REGIONWORLD 10.8')
html=html.replace('<title>TrussLab Architect 10.4 — RegionWorld</title>','<title>TrussLab Architect 10.8 — AssetStream</title>')
idx.write_text(html)

build=p/'build.py';s=build.read_text();s=s.replace("'region_visibility','webgpu_probe'", "'region_visibility','glb_loader','bundled_assets','region_assets','webgpu_probe'")
s=s.replace("'TrussLab_Architect_10_7_Standalone.html'", "'TrussLab_Architect_10_8_Standalone.html'")
build.write_text(s)

pkg=p/'package.json';s=pkg.read_text();s=s.replace('"version": "10.4.0"','"version": "10.8.0"');pkg.write_text(s)
