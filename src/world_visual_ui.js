/* TrussLab 15.10: visual city expansion and a clearly synthetic, separate
 * sandbox map. The original Kerch GeoPack remains immutable and distinct. */
(function(){'use strict';
if(typeof document==='undefined'||typeof region3d==='undefined'||!globalThis.TrussLabWorldVisualCore||!globalThis.trusslabEditor)return;
const C=globalThis.TrussLabWorldVisualCore,editor=globalThis.trusslabEditor,$=id=>document.getElementById(id);
const map={sandbox:false,preset:'hills',traffic:'medium',details:true,camKerch:null,objectsBuilt:0,vehiclesShown:0,facadeWindows:0,meshBytes:0,lastTrafficBuild:-1,lastRev:-1,lastCam:[Infinity,Infinity],paths:[],facadeBuffers:[],vehicleBuffer:null,lastDecorRev:-1};
const oldGround=metricGround;
metricGround=function(pack,x,z){if(map.sandbox){const result=C.syntheticGround(x,z,map.preset);if(result)return result;}
 return oldGround(pack,x,z);
};
const panel=$('citysim-controls');if(!panel)return;
const holder=document.createElement('details');holder.id='wv-panel';holder.open=false;
holder.innerHTML=`<summary>🌐 WorldStream 15.10 · карта и графика</summary>
<div class="wv-region-toggle"><button id="wv-kerch" class="wv-active">Керчь · GeoPack</button><button id="wv-sandbox">Новая карта · 12×12 км</button></div>
<div id="wv-region-info">Реальный регион основан на историческом GeoPack. Оси моста остаются приближёнными.</div>
<div class="wv-selects"><label>Ландшафт песочницы<select id="wv-landscape"><option value="hills">Холмы</option><option value="plains">Равнина</option><option value="coast">Условный берег</option></select></label>
<label>Движение на 3D-дорогах<select id="wv-traffic"><option value="off">Выкл.</option><option value="low">Редкое</option><option value="medium" selected>Обычное</option><option value="high">Плотное</option></select></label></div>
<label class="wv-check"><input id="wv-facades" type="checkbox" checked> Фасадные окна, крыши и архитектурные детали</label>
<div class="wv-buttons"><button id="wv-demo">＋ Пример застройки</button><button id="wv-refresh">↻ Обновить вид</button></div>
<div id="wv-hud">Видимых машин: 0 · Деталей: 0</div>
<p class="wv-disclaimer">Новая карта — **вымышленный процедурный ландшафт** без геодезической привязки к территории. Строительство и CitySim используют тот же WorldEditor; исходный DEM не изменён.</p>`;
$('cs-body')?.prepend(holder);
function dispose(entry){if(!entry)return;if(region3d.gl&&entry.buffer)region3d.gl.deleteBuffer(entry.buffer);region3d.webgpu?.release?.(entry);}
function disposeAll(){for(const e of map.facadeBuffers)dispose(e);map.facadeBuffers=[];dispose(map.vehicleBuffer);map.vehicleBuffer=null;map.lastTrafficBuild=-1;map.lastDecorRev=-1;}
function regenerateTerrain(){for(const t of region3d.terrainCache?.values()||[])dispose(t);region3d.terrainCache?.clear();for(const t of region3d.worldEditorBuffers||[])dispose(t);region3d.worldEditorBuffers=[];region3d.worldEditorRevision=-1;disposeAll();region3d.statusMessage('WorldStream: переключение региона · новый рельеф формируется из своего слоя');}
function setRegion(sandbox,preset=map.preset,{fromImport=false}={}){
 if(sandbox===map.sandbox&&preset===map.preset&&!fromImport)return;
 if(sandbox&&!map.sandbox)map.camKerch={cam:{...region3d.cam},yaw:region3d.yaw,pitch:region3d.pitch};
 map.sandbox=!!sandbox;map.preset=['plains','hills','coast'].includes(preset)?preset:'hills';
 regenerateTerrain();
 if(map.sandbox){region3d.cam={x:C.CENTER,y:235,z:C.CENTER-390};region3d.yaw=0;region3d.pitch=-.43;
 }else if(map.camKerch){region3d.cam={...map.camKerch.cam};region3d.yaw=map.camKerch.yaw;region3d.pitch=map.camKerch.pitch;}
 $('wv-kerch').classList.toggle('wv-active',!map.sandbox);$('wv-sandbox').classList.toggle('wv-active',map.sandbox);
 $('wv-landscape').value=map.preset;
 $('wv-region-info').textContent=map.sandbox?'УЧЕБНАЯ КАРТА · 12×12 км · процедурный ландшафт, НЕ OSM/Copernicus.':
   'Керчь / Тузла / Тамань · встроенный исторический GeoPack, нет точного моста 1:1.';
 if(!fromImport)region3d.statusMessage(map.sandbox?'WorldStream: вымышленная карта, метрическая система ENU':'WorldStream: GeoPack без изменений');
 }
function converted(p){const g=editor.geographic(...p),m=geographicToMetric(g[1],g[0]);return [m.x,m.z];}
// The editor stores WGS84 local coordinates; the visualizer reuses its own
// roundtrip so no invented Mercator/scaling appears in road or facade geometry.
function terrainY(x,z){const g=metricGround(region3d.geoPack,x,z);
 if(!g.measured||!g.land)return null;
 const g2=metricToGeographic(x,z);const local=editor.local(g2.lat,g2.lon);
 return g.height+editor.terrainOffset(local[0],local[1]);
}
function buildPaths(){map.paths=C.roadsFromEditor(editor.objects,converted);map.lastRev=editor.revision;}
function decoration(){if(!map.details){disposeAll();map.lastDecorRev=editor.revision;map.lastCam=[region3d.cam.x,region3d.cam.z];return;}
 const cx=region3d.cam.x,cz=region3d.cam.z,dist=Math.hypot(cx-map.lastCam[0],cz-map.lastCam[1]);
 if(map.lastDecorRev===editor.revision&&dist<450&&map.facadeBuffers.length)return;
 for(const e of map.facadeBuffers)dispose(e);map.facadeBuffers=[];
 const size=2400,offsetX=Math.floor(cx/size)*size,offsetZ=Math.floor(cz/size)*size;
 const batch=new C.MeshBatch(offsetX,offsetZ);let detail=0,count=0;
 const buildings=[];
 for(const o of editor.objects){if(o.type!=='building'||['bus-stop','tram-stop','park'].includes(o.catalogId))continue;
  const [x,z]=converted([o.x,o.z]);if(Math.abs(x-cx)>1500||Math.abs(z-cz)>1500)continue;
  buildings.push({o,x,z,d:Math.hypot(x-cx,z-cz)});
 }
 buildings.sort((a,b)=>a.d-b.d);
 for(const {o,x,z} of buildings){if(count>=170||detail>11000)break;const y=terrainY(x,z);if(y===null)continue;
  const w=Math.min(90,Math.max(3,Number(o.width)||20)),l=Math.min(90,Math.max(3,Number(o.length)||15)),floors=Math.min(42,Math.max(1,Number(o.floors)||2));
  detail+=batch.buildingWindows(x,z,y,w,l,floors,o.facade,Math.min(110,12000-detail));
  // Smaller rooftop service structures and setbacks give silhouettes variety.
  if(floors>=3&&['apartment','office','hospital','big-store'].includes(o.catalogId)){
   const rx=x+(w*.22),rz=z-l*.18;
   batch.car(rx,y+floors*3.1,rz,1,0,Math.min(7,w*.32),Math.min(5,l*.4),1.4,8);
  }
  count++;
 }
 if(batch.data.length){const result=batch.finalize('WorldVisual facades',size);map.facadeBuffers=[region3d.gl?region3d._makeBuffer(result):result];}
 map.lastDecorRev=editor.revision;map.lastCam=[cx,cz];map.facadeWindows=detail;map.objectsBuilt=count;
}
function buildTraffic(now){const speed=Number.isFinite(now)?now/1000:performance.now()/1000;
 const density=({off:0,low:.25,medium:.7,high:1.25})[map.traffic]||0;
 dispose(map.vehicleBuffer);map.vehicleBuffer=null;
 if(!density){map.vehiclesShown=0;return;}
 if(map.lastRev!==editor.revision)buildPaths();
 if(!map.lastReportAt||performance.now()-map.lastReportAt>3200){map.lastReportAt=performance.now();map.cachedCongestion=globalThis.trusslabCitySystems?.report?.().congestion||0;}
 const congestion=map.cachedCongestion||0;
 const slowing=Math.max(.24,1-congestion*.65);
 const cap=map.traffic==='high'?72:map.traffic==='medium'?45:23;
 const cars=C.vehiclePlan(map.paths,[region3d.cam.x,region3d.cam.z],{density,maxAgents:cap,clock:speed,slow:slowing});
 const batch=new C.MeshBatch(Math.floor(region3d.cam.x/2400)*2400,Math.floor(region3d.cam.z/2400)*2400);
 for(const car of cars){const y=terrainY(car.x,car.z);if(y===null)continue;
  const width=car.type==='train'?2.8:car.type==='bus'?2.5:car.type==='truck'?2.35:1.85;
  const length=car.type==='train'?15.8:car.type==='bus'?9.4:car.type==='truck'?7.8:4.5;
  const h=car.type==='train'?3.1:car.type==='bus'?2.9:car.type==='truck'?2.6:1.45;
  // Place a vehicle in a single lane: no physics or full driver AI claimed.
  const lateral=(car.seed%2?1:-1)*(Math.max(1,car.width*.18));
  const x=car.x+car.dirZ*lateral,z=car.z-car.dirX*lateral;
  batch.car(x,y+.35,z,car.dirX,car.dirZ,length,width,h,car.type==='bus'?6:car.type==='truck'?9:8);
  if(car.type==='train')batch.car(x-car.dirX*12.5,y+.35,z-car.dirZ*12.5,car.dirX,car.dirZ,11,2.7,3,8);
 }
 if(batch.data.length){const result=batch.finalize('WorldVisual vehicle animation',2400);map.vehicleBuffer=region3d.gl?region3d._makeBuffer(result):result;}
 map.vehiclesShown=cars.length;
}
const oldStream=region3d._stream.bind(region3d);
region3d._stream=function(){oldStream();
 // New 3D assets can be turned off without modifying the original scene.
 if(!this.active||!this.gl&&!this.webgpu?.ready)return;
 const now=performance.now();
 if(map.details)decoration();else if(map.facadeBuffers.length)disposeAll();
 for(const e of map.facadeBuffers)this.visibleModels.push(e);
 if(now-map.lastTrafficBuild>260||map.lastTrafficBuild<0){buildTraffic(now);map.lastTrafficBuild=now;}
 if(map.vehicleBuffer)this.visibleModels.push(map.vehicleBuffer);
 if(now-(map.lastHUD||0)>1100){map.lastHUD=now;const status=$('wv-hud');if(status)status.textContent=`Объектов с фасадами: ${map.objectsBuilt} · окон: ${map.facadeWindows} · машин и поездов: ${map.vehiclesShown}`;}
};
function addDemo(){if(!map.sandbox)setRegion(true);
 if(editor.objects.some(o=>o.label==='VISUAL WORLD 15.10 · DEMO'))return;
 const positions=[['apartment',-150,50,7],['apartment',-75,50,10],['house',40,90,2],['house',95,105,2],['office',160,50,13],['factory',210,170,2],['shop',-210,-35,2],['school',-75,-110,3],['hospital',80,-110,4]];
 const gpos=(x,z)=>{const m=metricToGeographic(C.CENTER+x,C.CENTER+z);return editor.local(m.lat,m.lon)};
 for(const [id,x,z,floors] of positions){const m=gpos(x,z);const point=metricGround(region3d.geoPack,C.CENTER+x,C.CENTER+z);if(point.land)editor.addModel(id,...m,{floors,label:id==='apartment'&&x===-150?'VISUAL WORLD 15.10 · DEMO':id,facade:id==='office'?'glass':'windows'});}
 for(const path of [[[-340,0],[370,0]],[[-200,-230],[-200,260]],[[50,-200],[50,250]]]){
  editor.addPath('road',path.map(p=>gpos(...p)),{width:10,speedKph:45,label:'Демонстрационная улица'});
 }
 region3d.statusMessage('Добавлен вымышленный район: здания, улицы, визуальный транспорт и CitySim.');
}
$('wv-sandbox').addEventListener('click',()=>setRegion(true));$('wv-kerch').addEventListener('click',()=>setRegion(false));
$('wv-landscape').addEventListener('change',e=>{if(map.sandbox)setRegion(true,e.target.value);else map.preset=e.target.value;});
$('wv-traffic').addEventListener('change',e=>{map.traffic=e.target.value;map.lastTrafficBuild=-1;});
$('wv-facades').addEventListener('change',e=>{map.details=e.target.checked;map.lastDecorRev=-1;if(!map.details)disposeAll();});
$('wv-demo').addEventListener('click',()=>addDemo());$('wv-refresh').addEventListener('click',()=>{regenerateTerrain();region3d._stream();});
function exportPrefs(){return {version:1,fictionalSandbox:map.sandbox,preset:map.preset,traffic:map.traffic,details:map.details};}
function importPrefs(data){if(!data)return;if(data.version!==1)throw Error('Несовместимый формат визуального режима');
 map.traffic=['off','low','medium','high'].includes(data.traffic)?data.traffic:'medium';
 map.details=data.details!==false;$('wv-traffic').value=map.traffic;$('wv-facades').checked=map.details;
 setRegion(!!data.fictionalSandbox,data.preset,{fromImport:true});
}
globalThis.TrussLabWorldVisual={region:map,core:C,setRegion,addDemo,export:exportPrefs,import:importPrefs,buildPaths,buildTraffic,decoration,regenerateTerrain};
})();
