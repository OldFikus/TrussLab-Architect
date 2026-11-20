import {Region3D} from './region3d.js';
import {BUNDLED_REGION_DEMO} from './bundled_region_demo.js';
import {RegionAtlas} from './region_atlas.js';
import {mercatorUnproject} from './region_tiles.js';
import {formatLocation,sceneToGeo,geoToScene} from './georef.js';
import {World3D} from './world3d.js';
import {SETTLEMENT_TYPES,checkSettlementPlacement,settlementExtent} from './settlement.js';
import {BUILTIN_GEOPACK} from './bundled_geopack.js';
import {MAT,SOILS,FOUND,BRIDGES,FOUNDATION_LEVELS,makeBridge} from './data.js';
import {solveBridge,solveFoundation} from './physics.js';
const root=document.getElementById('app'),canvas=document.getElementById('stage'),g=canvas.getContext('2d');
const world3d=new World3D(document.getElementById('stage-3d'));
let theme='dark';try{theme=localStorage.getItem('trusslab-theme-v8')==='light'?'light':'dark'}catch(err){}document.documentElement.dataset.theme=theme;world3d.theme=theme;world3d.quality='ultra';
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),round=(n,d=1)=>Number(n).toFixed(d),money=n=>Math.round(n).toLocaleString('ru-RU'),escape=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const satelliteRefImg=()=>document.querySelector('#satellite-overlay img');
let st={track:'bridge',idx:1,view:'3d',planMode:'section',tool:'select',material:'steel',loadCase:'traffic',factor:1,model:null,foundation:null,analysis:null,selected:null,pending:null,zoom:1,panX:0,panY:0,yaw:-.48,pitch:.4,hist:[],future:[],records:{},tip:'',showFormulas:false,anim:0};
let initialGeoLoaded=false;
let buildingMode='off',buildingFloors=3,buildingYaw=0,buildingCursor=null,buildingDrag=null;
let pointerDown=null,mouse={x:0,y:0},dragging=false,saveTimer=null;let routeEdit=false,routeDragging=null,routeDiagnosticVisible=false,coastFitPreview=null;
try{st.records=JSON.parse(localStorage.getItem('trusslab-studio-records')||'{}')}catch(e){}
function scenario(){return st.track==='bridge'?BRIDGES[st.idx]:FOUNDATION_LEVELS[st.idx]}
function resetCamera(){st.zoom=1;st.panX=0;st.panY=0;st.yaw=-.52;st.pitch=.45}
function newFoundation(level){let L=FOUNDATION_LEVELS[level];return {soil:L.soil,type:'strip',length:L.length,width:L.width,floors:L.floors,load:Math.round(L.length*L.width*L.floors*8.5),depth:1.2,stripWidth:1.2,water:SOILS[L.soil].water,pileCount:12,pileLength:13}}
function crossingSettings(){return {roadRamp:world3d.roadRamp,railRamp:world3d.railRamp,archDeckLevel:world3d.archDeckLevel,routeOffsets:[...world3d.routeOffsets],routeExtents:{...world3d.routeExtents}}}
function applyCrossingSettings(v){if(!v||typeof v!=='object')return;const n=(value,lo,hi,def)=>Number.isFinite(Number(value))?clamp(Number(value),lo,hi):def;
 world3d.roadRamp=n(v.roadRamp,12,52,22);world3d.railRamp=n(v.railRamp,32,90,58);world3d.archDeckLevel=n(v.archDeckLevel,6,9.5,7.35);world3d.invalidateTerrain();if(v.routeExtents)world3d.setRouteExtents(v.routeExtents);else world3d.resetRouteExtents();if(v.routeOffsets)world3d.setRouteOffsets(v.routeOffsets);else world3d.resetRoute();}

const settlementActive=()=>st.track==='bridge'&&scenario()?.id==='kerch';
function settlementEnabled(){return settlementActive()&&(st.view==='3d'||st.view==='2d'&&st.planMode==='map')}
function selectBuildingTool(mode){
 if(mode!=='off'&&mode!=='select'&&mode!=='erase'&&!SETTLEMENT_TYPES[mode])return;
 buildingMode=mode;world3d.placeMode=settlementEnabled()&&mode!=='off';
 if(mode!=='off'){routeEdit=false;world3d.editBridge=false;world3d.brush='orbit';}
 $('settlement-toolbar')?.querySelectorAll('[data-building]')?.forEach(b=>b.classList.toggle('selected',b.dataset.building===mode));
}
function settlementAt(x,z){
 if(!settlementEnabled()||buildingMode==='off')return false;
 const near=world3d.settlement.nearest(x,z,buildingMode==='erase'?4.5:6);
 if(buildingMode==='select'){
  world3d.settlementSelectedId=near?.id??null;
  note(near?`Выбран объект №${near.id}: ${SETTLEMENT_TYPES[near.type].label}, ${near.floors} эт. · GPS≈ ${formatLocation(x,z)}`:'Объект не найден. Выберите другой инструмент застройки.',near?'good':null);
  renderInspector();draw();return true;
 }
 if(buildingMode==='erase'){
  if(!near){note('Рядом нет построек для удаления.');return true;}
  editMark();world3d.settlement.remove(near.id);world3d.settlementSelectedId=null;world3d.settlementChanged();note(`Объект №${near.id} удалён; Ctrl+Z — отмена.`,'good');render();return true;
 }
 if(SETTLEMENT_TYPES[buildingMode]){
  const req={type:buildingMode,x,z,floors:buildingFloors,yaw:buildingYaw};
  const chk=checkSettlementPlacement(world3d,world3d.settlement.items,req);
  if(!chk.ok){note('Нельзя построить: '+chk.reason,'bad');return true;}
  editMark();const result=world3d.settlement.add(world3d,req);
  if(!result.ok){note(result.reason,'bad');return true;}
  world3d.settlementSelectedId=result.item.id;world3d.settlementChanged();
  note(`${SETTLEMENT_TYPES[buildingMode].label} №${result.item.id} построен · суша/соседи/дорога проверены · ${formatLocation(x,z)} (≈).`,'good');render();return true;
 }
 return false;
}
function seedSettlement(){
 editMark();let n=0;
 // Deterministic placement: not a reproduction of existing villages, no imported building footprints.
 for(const side of [-1,1])for(let row=0;row<13;row++)for(let col=0;col<7;col++){
  const x=side*(142+col*7.8),z=-105+row*16.7+(col%2)*3.5;
  const kind=(row*3+col*7)%13===0?'apartment':(row+col)%7===0?'warehouse':(row+2*col)%6===0?'tree':'house';
  const res=world3d.settlement.add(world3d,{type:kind,x,z,floors:kind==='apartment'?4+row%3:2,yaw:(col%4)*90});
  if(res.ok)n++;
 }
 world3d.settlementChanged();note(`Построено ${n} объектов по условным кварталам на суше. Это тестовые посёлки, не реальные дома из OSM.`,n?'good':'bad');render();
}
function drawSettlementOnMap(xy){
 for(const o of world3d.settlement.items){
  const p=xy(o.x,o.z),ext=settlementExtent(o),scaleX=canvas.clientWidth/world3d.worldSize,scaleY=canvas.clientHeight/world3d.worldSize;
  g.save();g.translate(p.x,p.y);g.strokeStyle=o.id===world3d.settlementSelectedId?'#ffdf8b':'#0b313c';g.lineWidth=o.id===world3d.settlementSelectedId?2.5:.9;
  if(o.type==='tree'||o.type==='lamp'){g.beginPath();g.arc(0,0,Math.max(2.5,ext.width*.5*scaleX),0,7);g.fillStyle=o.type==='tree'?'#3b9c58':'#e5bc6d';g.fill();g.stroke();}
  else {g.rotate(o.yaw*Math.PI/180);g.fillStyle=o.type==='house'?'#efc7a2':o.type==='apartment'?'#b6c7d2':'#b9c8c7';g.fillRect(-SETTLEMENT_TYPES[o.type].w*scaleX/2,-SETTLEMENT_TYPES[o.type].d*scaleY/2,SETTLEMENT_TYPES[o.type].w*scaleX,SETTLEMENT_TYPES[o.type].d*scaleY);g.strokeRect(-SETTLEMENT_TYPES[o.type].w*scaleX/2,-SETTLEMENT_TYPES[o.type].d*scaleY/2,SETTLEMENT_TYPES[o.type].w*scaleX,SETTLEMENT_TYPES[o.type].d*scaleY);}
  g.restore();
 }
 if(settlementEnabled()&&buildingCursor&&SETTLEMENT_TYPES[buildingMode]){
  const p=xy(buildingCursor.x,buildingCursor.z);g.save();g.beginPath();g.arc(p.x,p.y,8,0,7);g.lineWidth=2;g.strokeStyle='#ffda89';g.stroke();g.restore();
 }
}
function syncCityToolbar(){
 const el=$('geocity-toolbar');if(!el)return;
 el.style.display=settlementEnabled()?'flex':'none';
 const info=world3d.cityData?.report;
 $('city-count').textContent=info?`GIS: ${info.buildings.toLocaleString('ru-RU')} зданий · ${info.roads.toLocaleString('ru-RU')} дорог · ${info.rails.toLocaleString('ru-RU')} ж/д`:'GIS: нет импортированных объектов';
 $('city-toggle').textContent=world3d.cityEnabled?'◉ GIS: ВКЛ':'○ GIS: СКРЫТ';
}
function syncSettlementToolbar(){
 const el=$('settlement-toolbar');if(!el)return;
 el.style.display=settlementEnabled()?'flex':'none';
 $('building-count').textContent=world3d.settlement.items.length+' / 240';
 $('building-floors').value=String(buildingFloors);$('building-floors-output').textContent=String(buildingFloors);
 $('building-rotation').textContent=buildingYaw+'°';
 world3d.placeMode=settlementEnabled()&&buildingMode!=='off';
 el.querySelectorAll('[data-building]').forEach(b=>b.classList.toggle('selected',b.dataset.building===buildingMode));
}
function drawProfile(){
 const c=$('profile-canvas');if(!c||$('crossing-profile').hidden)return;
 const layoutW=Math.max(320,Math.round(c.clientWidth||960));if(c.width!==layoutW)c.width=layoutW;
 const ctx=c.getContext('2d'),w=c.width,h=c.height,b=world3d.kerchBounds();
 const xmin=-207,xmax=207,X=x=>42+(x-xmin)/(xmax-xmin)*(w-84),Y=y=>h-23-(y+1)/19*(h-36);
 ctx.clearRect(0,0,w,h);ctx.fillStyle=theme==='dark'?'#112c38':'#ecf3f1';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle=theme==='dark'?'#52717a50':'#89a9a160';ctx.lineWidth=1;
 for(let j=0;j<=5;j++){let yy=15+j*14;ctx.beginPath();ctx.moveTo(36,yy);ctx.lineTo(w-22,yy);ctx.stroke()}
 ctx.fillStyle='#d7b57922';ctx.fillRect(X(b.archA),9,X(b.archB)-X(b.archA),h-31);
 ctx.fillStyle=theme==='dark'?'#b1ced2':'#476169';ctx.font='11px system-ui';
 ctx.fillText('КЕРЧЬ',42,h-7);ctx.fillText('АРКИ',X((b.archA+b.archB)/2)-14,30);ctx.fillText('ТАМАНЬ',w-95,h-7);
 for(const [side,color,name] of [[b.roadSide,'#e7b979','АВТО'],[b.railSide,'#68d6c9','Ж/Д × 2']]){
  ctx.beginPath();for(let i=0;i<=170;i++){
   const x=xmin+(xmax-xmin)*i/170,z=world3d.trackCenter(x,side),gy=world3d.mapHeightBase(x,z);
   if(i===0)ctx.moveTo(X(x),Y(gy));else ctx.lineTo(X(x),Y(gy));
  }ctx.strokeStyle=theme==='dark'?'#a4ad9a42':'#697c6860';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();for(let i=0;i<=280;i++){
   const x=xmin+(xmax-xmin)*i/280,y=world3d.landApproachElevation(x,side);
   if(i===0)ctx.moveTo(X(x),Y(y));else ctx.lineTo(X(x),Y(y));
  }ctx.strokeStyle=color;ctx.lineWidth=2.8;ctx.stroke();ctx.font='bold 11px system-ui';ctx.fillStyle=color;
  ctx.fillText(name,side<0?X(-145):X(-145)+72,14);
 }
 ctx.font='10px system-ui';ctx.fillStyle=theme==='dark'?'#91adab':'#66807b';
 if(w>660)ctx.fillText('Тонкая: DEM  ·  цветные: инженерный профиль',w*.34,h-5);
}
function syncGradeControls(){const visible=st.track==='bridge'&&scenario().id==='kerch';$('crossing-profile').hidden=!visible;if(!visible)return;for(const [id,value] of [['road-ramp',world3d.roadRamp],['rail-ramp',world3d.railRamp],['arch-level',world3d.archDeckLevel]])$(id).value=String(value);$('road-ramp-value').textContent=world3d.roadRamp.toFixed(0)+' ед.';$('rail-ramp-value').textContent=world3d.railRamp.toFixed(0)+' ед.';$('arch-level-value').textContent=world3d.archDeckLevel.toFixed(1)+' ед.';drawProfile()}
function setScenario(i){st.idx=i;st.model=makeBridge(BRIDGES[i]||BRIDGES[0]);st.foundation=newFoundation(Math.min(i,FOUNDATION_LEVELS.length-1));st.analysis=null;st.selected=null;st.pending=null;st.hist=[];st.future=[];st.anim=0;st.loadCase='traffic';st.factor=1;resetCamera();world3d.editBridge=false;world3d.start(worldPayload());
 if(world3d.map&&!initialGeoLoaded){
  initialGeoLoaded=true;
  try{world3d.loadGeoPack(BUILTIN_GEOPACK);world3d.setRouteExtents({x0:-160.5,x1:156});world3d.setCoastMode('osm');}
  catch(err){console.warn('Bundled GeoPack failed; external import is available',err)}
 }
 note(st.track==='bridge'?'Сценарий моста загружен. OSM + Copernicus из твоего GeoPack · калибровка берегов предварительная.':'Сценарий основания загружен.',null);render()}
function note(s,status=null){st.tip=s;let el=$('status');el.textContent=s;el.className='notice'+(status?' '+status:'')}
function snapshot(){return JSON.stringify({buildings:world3d.settlement.toJSON(),item:st.track==='bridge'?st.model:st.foundation,terrain:Array.from(world3d.terrain),paint:Array.from(world3d.paintLayer),mapEdit:Array.from(world3d.mapEdit),crossing:crossingSettings()})}
function editMark(){world3d.sceneDirty=true;st.hist.push(snapshot());if(st.hist.length>80)st.hist.shift();st.future=[];st.analysis=null;st.anim=0}
function undo(){if(!st.hist.length)return;coastFitPreview=null;world3d.sceneDirty=true;st.future.push(snapshot());let o=JSON.parse(st.hist.pop());if(st.track==='bridge')st.model=o.item;else st.foundation=o.item;world3d.terrain.set(o.terrain);world3d.paintLayer.set(o.paint);if(o.mapEdit)world3d.mapEdit.set(o.mapEdit);if(o.buildings){world3d.settlement.restore(o.buildings);world3d.settlementChanged()}applyCrossingSettings(o.crossing);world3d.invalidateTerrain();st.analysis=null;world3d.sceneDirty=true;st.pending=null;render()}
function redo(){if(!st.future.length)return;coastFitPreview=null;world3d.sceneDirty=true;st.hist.push(snapshot());let o=JSON.parse(st.future.pop());if(st.track==='bridge')st.model=o.item;else st.foundation=o.item;world3d.terrain.set(o.terrain);world3d.paintLayer.set(o.paint);if(o.mapEdit)world3d.mapEdit.set(o.mapEdit);if(o.buildings){world3d.settlement.restore(o.buildings);world3d.settlementChanged()}applyCrossingSettings(o.crossing);world3d.invalidateTerrain();st.analysis=null;world3d.sceneDirty=true;st.pending=null;render()}
function run(){
 st.analysis=st.track==='bridge'?solveBridge(st.model,st.loadCase,st.factor):solveFoundation(st.foundation);
 let a=st.analysis;
 if(a.error){note('Не удалось рассчитать: '+a.error,'bad');render();return}
 let passed=st.track==='bridge'?a.ok:(a.stable&&(a.cost<=scenario().budget));
 st.anim=performance.now();
 if(passed){let budget=st.track==='bridge'?st.model.meta.budget:scenario().budget;
 let stars=a.cost/budget<.7?3:a.cost/budget<.9?2:1;
 let key=st.track+'_'+scenario().id;st.records[key]=Math.max(st.records[key]||0,stars);
 try{localStorage.setItem('trusslab-studio-records',JSON.stringify(st.records))}catch(e){}
 note('✓ Испытание пройдено · '+('★'.repeat(stars))+' · '+(st.track==='bridge'?'макс. прогиб '+round(a.def*1000)+' мм':'расчётная осадка '+round(a.settlement*1000)+' мм'),'good')
 }else{
 let msgs=st.track==='bridge'?[
 a.util>1?'напряжение / устойчивость '+round(a.util*100)+'%':null,
 a.def>st.model.meta.limit?'прогиб '+round(a.def*1000)+' мм':null,
 a.cost>st.model.meta.budget?'бюджет превышен':null
 ]:[a.ratio>1?'несущая способность грунта недостаточна':null,a.settlement>.05?'осадка более 50 мм':null,a.cost>scenario().budget?'бюджет превышен':null];
 note('✕ Испытание не пройдено: '+msgs.filter(Boolean).join('; '),'bad')
 }
 render()
}
function worldPayload(){const sc=scenario();return {track:st.track,id:sc?.id||'academy',span:sc?.span||30,kind:sc?.kind||'truss',soil:st.track==='bridge'?(sc?.soil||'sand'):(st.foundation?.soil||'sand'),foundation:st.foundation,model:st.model}}
function syncWorld(force=false){world3d.theme=theme;if(st.view==='3d'&&world3d.ready)world3d.render(worldPayload(),force||world3d.sceneDirty);}
function currentCost(){if(st.track==='foundation')return solveFoundation(st.foundation).cost;return st.model.edges.reduce((sum,e)=>{let a=st.model.nodes.find(n=>n.id===e.a),b=st.model.nodes.find(n=>n.id===e.b),m=MAT[e.m]||MAT.steel;return sum+(a&&b?Math.hypot(a.x-b.x,a.y-b.y)*m.price*(e.size||1):0)},0)}
function renderScenarios(){let list=st.track==='bridge'?BRIDGES:FOUNDATION_LEVELS;
 $('scenario-list').innerHTML=list.map((v,i)=>`<button class="scenario ${i===st.idx?'selected':''}" data-scenario="${i}"><span class="no">${String(i+1).padStart(2,'0')}</span><span><span class="name">${escape(v.name)}</span><span class="country">${escape(v.place||SOILS[v.soil].name)}</span></span><span class="star">${'★'.repeat(st.records[st.track+'_'+v.id]||0)}</span></button>`).join('')}
function render(){
 renderScenarios();const sc=scenario();
 $('mission-title').textContent=sc.name;$('mission-place').textContent=sc.place||SOILS[sc.soil].name;$('mission-desc').textContent=sc.description||sc.desc;
 $('mission-fact').textContent=sc.info||'Грунт: '+SOILS[sc.soil].name+'. Параметры заданы только как игровые типовые значения.';
 $('scene-label').textContent=st.track==='bridge'?'МОСТОСТРОЕНИЕ':'ГЕОТЕХНИКА';
 $('scene-title').textContent=st.track==='bridge'?'Конструктивная схема моста':'Основания и фундаменты';
 $('bridge-toolbar').style.display=st.track==='bridge'&&st.view==='2d'&&st.planMode==='section'?'flex':'none';
 $('stage').style.display=st.view==='2d'?'block':'none';$('stage-3d').style.display=st.view==='3d'?'block':'none';
 $('terrain-toolbar').style.display=st.view==='3d'?'flex':'none';$('camera-toolbar').style.display=st.view==='3d'?'flex':'none';$('camera-hud').style.display=st.view==='3d'?'block':'none';$('minimap').style.display=st.view==='3d'&&st.track==='bridge'&&sc.id==='kerch'?'block':'none';
 $('map-legend').style.display=st.view==='3d'&&st.track==='bridge'&&sc.id==='kerch'?'flex':'none';
 $('plan-toggle').style.display=st.track==='bridge'&&sc.id==='kerch'&&st.view==='2d'?'inline-flex':'none';
 $('plan-toggle').textContent=st.planMode==='section'?'▣ План местности':'╱ Конструкция';
 $('route-edit').style.display=st.track==='bridge'&&sc.id==='kerch'&&st.view==='2d'&&st.planMode==='map'?'inline-flex':'none';
 $('route-edit').classList.toggle('selected',routeEdit);syncSettlementToolbar();syncCityToolbar();
 $('route-reset').style.display=st.track==='bridge'&&sc.id==='kerch'&&st.view==='2d'&&st.planMode==='map'&&routeEdit?'inline-flex':'none';
 const showFit=!!coastFitPreview?.ok&&st.track==='bridge'&&sc.id==='kerch'&&st.view==='2d'&&st.planMode==='map';
 $('route-fit-confirm').style.display=showFit?'inline-flex':'none';
 $('route-fit-cancel').style.display=showFit?'inline-flex':'none';
 $('route-fit-confirm-bottom').style.display=showFit?'inline-flex':'none';
 $('route-fit-cancel-bottom').style.display=showFit?'inline-flex':'none';
 $('bridge-3d-edit').style.display=st.track==='bridge'&&sc.id==='kerch'&&st.view==='3d'?'inline-flex':'none';
 $('bridge-3d-edit').classList.toggle('selected',world3d.editBridge);
 $('terrain-toolbar').querySelectorAll('[data-brush]').forEach(b=>b.classList.toggle('selected',b.dataset.brush===world3d.brush));
 if(st.view==='3d'){if(st.track==='bridge'&&sc.id==='kerch')$('terrain-toolbar').dataset.map='1';else $('terrain-toolbar').dataset.map='0';} 
 $('sample').textContent=st.track==='bridge'?'↶ Восстановить пример':'↶ Исходные параметры';
 $('test').textContent=st.track==='bridge'?'▶ Испытать мост':'▶ Проверить фундамент';
 $('canvas-top').textContent=st.view==='2d'?'⌖ РАЗРЕЗ / МЕТРЫ':world3d.software?'⬡ ПРОГРАММНАЯ 3D-ОТРИСОВКА':'⬡ WEBGL / ПРОЦЕДУРНЫЕ МАТЕРИАЛЫ / FREECAM';
 $('canvas-bottom').textContent=st.view==='2d'&&st.planMode==='map'&&st.track==='bridge'?'Карта · приблизительная WGS84-привязка, не геодезические данные':st.view==='3d'?(world3d.editBridge?'3D-редактор · тяните узлы вверх/вниз · Shift — перемещение вдоль пролёта':st.track==='bridge'&&sc.id==='kerch'?'FreeCam: WASD · QE · Shift · ЛКМ':'FreeCam: WASD / QE · ЛКМ — осмотр'):'ЛКМ — конструктор · Shift+drag — панорама · колесо — масштаб';
 root.querySelectorAll('[data-track]').forEach(b=>b.classList.toggle('selected',b.dataset.track===st.track));
 root.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===st.view));
 root.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool===st.tool));
 $('undo').disabled=!st.hist.length;$('redo').disabled=!st.future.length;
 renderInspector();renderFormulas();syncGradeControls();draw()
}
function fSelect(name,list,selected){return `<select data-field="${name}">${list.map(([id,title])=>`<option value="${escape(id)}" ${selected===id?'selected':''}>${escape(title)}</option>`).join('')}</select>`}
function numInput(field,label,value,min,max,step,unit=''){return `<div class="input-group"><label>${label} <output>${escape(value)} ${unit}</output></label><input type="range" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`}
function stat(k,val,cls=''){return `<div class="metric"><div class="key">${k}</div><strong class="${cls}">${val}</strong></div>`}
function budgetHtml(cost,budget){let r=cost/budget;return `<div class="budget"><span>Смета</span><b>${money(cost)} / ${budget>=1e9?'∞':money(budget)} кр.</b></div><div class="bar"><span style="width:${clamp(r*100,1,100)}%;background:${r>1?'#c46b5c':'#ba945e'}"></span></div>`}
function renderInspector(){
 let html='';if(st.track==='bridge'){
 let a=st.analysis,model=st.model,edge=model.edges.find(e=>e.id===st.selected?.id),mat=edge?.m||st.material;
 html=`<h3>Параметры моста</h3><div class="field-title">МАТЕРИАЛ ${edge?'ВЫБРАННОГО ЭЛЕМЕНТА':'НОВЫХ ЭЛЕМЕНТОВ'}</div><div class="material-grid">${Object.entries(MAT).map(([id,m])=>`<button data-mat="${id}" class="${mat===id?'selected':''}"><i class="swatch" style="background:${m.color}"></i>${escape(m.name)}</button>`).join('')}</div><p class="mini-note">Для тросов назначьте материал «Высокопрочный трос». Сжатие троса отмечается как нарушение.</p>`;
 if(edge)html+=`<div class="input-group"><label>Тип выбранного элемента</label>${fSelect('edge-type',[['rod','Стержень — осевые усилия'],['frame','Балка — изгиб + ось'],['cable','Трос — условная ось']],edge.type)}</div>${numInput('edge-size','Коэффициент сечения',edge.size||1,.4,5,.2,'×')}`;
 html+=`<div class="field-title">ВОЗДЕЙСТВИЯ</div><div class="input-group"><label>Расчётный случай</label>${fSelect('case',[['traffic','Транспорт'],['snow','Снег'],['wind','Ветер'],['earthquake','Сейсмика (упрощённо)']],st.loadCase)}</div>${numInput('loadFactor','Множитель нагрузки',st.factor,.5,3,.1,'×')}`;
 html+=`<div class="field-title">РЕЗУЛЬТАТЫ</div><div class="metrics">${stat('Узлы / элементы',model.nodes.length+' / '+model.edges.length)}${stat('Прогиб',a&&!a.error?round(a.def*1000)+' мм':'—',a&&a.def>model.meta.limit?'bad':'')}${stat('Использование',a&&!a.error?round(a.util*100)+' %':'—',a&&a.util>1?'bad':'')}${stat('Лимит прогиба',round(model.meta.limit*1000)+' мм')}${stat('Макс. момент',a&&!a.error?round(a.maxBend)+' кН·м':'—')}${stat('Случай',st.loadCase)}</div>${budgetHtml(currentCost(),model.meta.budget)}`;
 if(edge&&a&&!a.error){let f=a.forces.find(f=>f.id===edge.id);if(f)html+=`<p class="mini-note"><b>Выбранный элемент:</b> N = ${round(f.axial,2)} кН; M = ${round(f.moment,2)} кН·м; η = ${round(f.ratio*100)}%.</p>`}
 }else{
 let p=st.foundation,a=st.analysis||solveFoundation(p),soil=SOILS[p.soil];
 html=`<h3>Геологическая модель</h3><div class="input-group"><label>Грунт основания</label>${fSelect('soil',Object.entries(SOILS).map(([id,s])=>[id,s.name]),p.soil)}</div><p class="mini-note">${soil.description}</p><div class="field-title">ТИП ФУНДАМЕНТА</div><div class="material-grid">${Object.entries(FOUND).map(([id,v])=>`<button data-found="${id}" class="${p.type===id?'selected':''}"><span>${v.icon}</span>${v.name}</button>`).join('')}</div>`;
 html+=`<div class="field-title">РАЗМЕРЫ И НАГРУЗКИ</div><div class="two-cols"><div class="input-group"><label>Ширина, м</label><input data-number="width" type="number" min="4" max="30" step="1" value="${p.width}"></div><div class="input-group"><label>Длина, м</label><input data-number="length" type="number" min="4" max="35" step="1" value="${p.length}"></div></div>`;
 html+=numInput('load','Нагрузка здания',p.load,100,7000,50,'кН')+numInput('depth','Глубина заложения',p.depth,.5,4,.1,'м');
 if(p.type==='strip')html+=numInput('stripWidth','Ширина ленты',p.stripWidth,.5,3,.1,'м');
 if(['piles','screw'].includes(p.type))html+=numInput('pileCount','Количество свай',p.pileCount,4,60,1,'шт')+numInput('pileLength','Длина свай',p.pileLength,3,25,1,'м');
 html+=`<label class="toggle-row"><input type="checkbox" data-check="water" ${p.water?'checked':''}> Высокий уровень грунтовых вод</label>`;
 html+=`<div class="field-title">ГЕОТЕХНИЧЕСКАЯ ПРОВЕРКА</div><div class="metrics">${stat('Условная нагрузка',round(a.load)+' кН')}${stat('Сопротивление',round(a.capacity)+' кН',a.ratio>1?'bad':'')}${stat('Использование',round(a.ratio*100)+' %',a.ratio>1?'bad':'good')}${stat('Осадка',round(a.settlement*1000)+' мм',a.settlement>.05?'bad':'good')}${stat('φ / сцепление',soil.phi+'° / '+soil.c+' кПа')}${stat('E грунта',money(soil.Es)+' кПа')}</div>${budgetHtml(a.cost,scenario().budget)}`
 }
 if(settlementActive()){
 const picked=world3d.settlement.items.find(b=>b.id===world3d.settlementSelectedId);
 html+='<div class="field-title">🏘 TERRABUILD · ПОСТРОЙКИ</div>';
 html+='<div class="metrics">'+stat('Объекты',world3d.settlement.items.length+' / 240')+stat('GPU-вершины',world3d.buildingCount||0)+'</div>';
 if(picked)html+=`<p class="mini-note"><b>№${picked.id} · ${escape(SETTLEMENT_TYPES[picked.type].label)}</b><br> ${picked.floors} эт. · поворот ${picked.yaw}°<br>${formatLocation(picked.x,picked.z)} (≈)</p><button id="building-delete-selected">⌫ Удалить выбранное</button>`;
 else html+='<p class="mini-note">2D → План местности: выбери тип дома и нажми на участок суши. В 3D также можно строить кликом по грунту. Shift+ЛКМ — вращение камеры.</p>';
 }
 $('inspector-content').innerHTML=html;
}
function renderFormulas(){let panel=$('formula-panel');panel.classList.toggle('hidden',!st.showFormulas);if(!st.showFormulas)return;
 let a=st.analysis|| (st.track==='foundation'?solveFoundation(st.foundation):null),f='';
 if(st.track==='bridge'){
 f=`<p>Смешанная **линейная плоская рамно-стержневая** модель. Узлы имеют степени свободы ux, uy и поворот θ. Стержни и тросы в этой версии учитывают только продольную деформацию, балки — также изгиб. Тросы линейно аппроксимированы: итеративного поиска их провисания и предварительного натяжения нет.</p>`;
 f+=formula('[K] {u} = {F}','Уравнение равновесия; закреплённые степени свободы исключаются.');
 f+=formula('kₐ = EA/L','Продольная жёсткость элемента, кН/м.');
 f+=formula('kᵦ = 12EI/L³','Составляющая изгибной жёсткости рамного элемента.');
 f+=formula('N = EA/L · ΔL','Продольное усилие N, кН.');
 f+=formula('Ncr = π²EI/L²','Критическая эйлерова сила потери устойчивости — идеализированная колонна.');
 f+=formula('η ≈ |N|/Nallow + |M|/(f·W)','Упрощённая проверка совместного осевого усилия и изгиба.');
 f+=formula('δmax = max √(ux²+uy²)','Максимальное перемещение узлов.');
 if(a&&!a.error)f+=formula('Текущий расчёт: δ = '+round(a.def*1000,2)+' мм, η = '+round(a.util*100,1)+' %','Значения относятся только к игровой уменьшенной модели.')
 }else{
 f=`<p>Типовые параметры грунта — <b>игровые допущения</b>, не результаты инженерно-геологических изысканий. Несущая способность проверяется по упрощённой формуле Терцаги с приближёнными коэффициентами и запасом 3. Осадка — по упругой оценке, а для свай используется условная пружинная аппроксимация.</p>`;
 f+=formula('Nq = e^(π tanφ) · tan²(45° + φ/2)','Коэффициент несущей способности.');
 f+=formula('Nc = (Nq−1)/tanφ; Nγ ≈ 2(Nq+1)tanφ','Для φ=0 применяется Nc=5.7. Nγ — приближённая оценка по Везичу.');
 f+=formula('qult ≈ cNc + γDfNq + ½γBNγ','Упрощённая формула предельного давления под подошвой.');
 f+=formula('qallow = qult/3; q = P/A','Допускаемое давление и фактическая нагрузка; коэффициент формы учитывается приближённо.');
 f+=formula('s ≈ q B (1−ν²) / Es · 1.05','Упругая осадка мелкого фундамента, без консолидации.');
 f+=formula('Qсваи ≈ [Ab·qb + πdL·fs]/3','Сумма условного сопротивления под пятой и по боковой поверхности сваи.');
 if(a)f+=formula('Текущий расчёт: Q = '+round(a.capacity)+' кН, s = '+round(a.settlement*1000,1)+' мм','Сваи и глубокие слои грунта здесь моделируются очень грубо.')
 }
 $('formula-content').innerHTML=f+'<p class="mini-note">Не реализованы: фактические нормы СП/Eurocode/AASHTO, комбинации предельных состояний, нелинейность, усталость, динамика ветра, геологические слои, консолидация и достоверные 3D напряжения.</p>'
}
function formula(x,desc){return `<div class="formula-row"><code>${x}</code><span>${desc}</span></div>`}
// ---- CAD canvas and scene graphics ----
const palette={bridge:'#4a7f90',beam:'#526c73',node:'#f9f9f1',anchor:'#b28b5c',water:'#8caeb2',soil:'#b9a27c'};
const line=(a,b,color='#486c71',width=2,dash=[])=>{g.beginPath();g.setLineDash(dash);g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.lineWidth=width;g.strokeStyle=color;g.stroke();g.setLineDash([])};
function poly(pts,fill,stroke=null,width=1){if(!pts.length)return;g.beginPath();g.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>g.lineTo(p.x,p.y));g.closePath();if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke()}}
function text(t,x,y,size=11,color='#486167',weight='500',align='left'){g.font=`${weight} ${size}px system-ui,Arial`;g.textAlign=align;g.fillStyle=color;g.fillText(String(t),x,y);g.textAlign='left'}
function circle(p,r,fill,stroke=null){g.beginPath();g.arc(p.x,p.y,r,0,7);g.fillStyle=fill;g.fill();if(stroke){g.lineWidth=1.5;g.strokeStyle=stroke;g.stroke()}}
function fit(){const w=canvas.clientWidth||800,h=canvas.clientHeight||470,span=st.track==='bridge'?scenario().span:Math.max(st.foundation.length,st.foundation.width)+7;const height=st.track==='bridge'?scenario().h+14:15;return {w,h,span,s:clamp(Math.min((w-70)/(span+6),(h-50)/height),9,29)*st.zoom}}
function bp(x,y){let z=fit();return {x:z.w/2+(x-z.span/2)*z.s+st.panX,y:z.h*.81-(y+1)*z.s+st.panY}}
function bi(p){let z=fit();return {x:(p.x-z.w/2-st.panX)/z.s+z.span/2,y:(z.h*.81+st.panY-p.y)/z.s-1}}
function proj(x,y,zv=0){let f=fit(),yaw=st.yaw,pitch=st.pitch,mid=f.span/2;let X=(x-mid)*Math.cos(yaw)+zv*Math.sin(yaw),D=-(x-mid)*Math.sin(yaw)+zv*Math.cos(yaw);return {x:f.w/2+X*f.s+st.panX,y:f.h*.72-(y-2)*Math.cos(pitch)*f.s+D*Math.sin(pitch)*f.s+st.panY,depth:D}}
function draw(){if(st.view==='3d'){syncWorld();return}let w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);if(st.track==='bridge'){if(st.view==='2d'&&st.planMode==='map'&&scenario().id==='kerch')drawMap2D();else if(st.view==='2d')drawBridge2D();else drawBridge3D()}else{if(st.view==='2d')drawFoundation2D();else drawFoundation3D()}}
function bgGrid(){let f=fit(),w=f.w,h=f.h;g.strokeStyle='#a3b9b626';g.lineWidth=1;for(let x=-8;x<60;x++){let p=bp(x,0);if(p.x>=0&&p.x<=w)line({x:p.x,y:0},{x:p.x,y:h},x%5===0?'#718a8a37':'#718a8a1c')}for(let y=-2;y<45;y++){let p=bp(0,y);if(p.y>=0&&p.y<=h)line({x:0,y:p.y},{x:w,y:p.y},y%5===0?'#718a8a37':'#718a8a1c')}}
function bridgePosition(n){let a=st.analysis&&st.analysis.displacements?.find(d=>d.id===n.id);let anim=a?clamp((performance.now()-st.anim)/450,0,1):0;let scale=st.analysis&&!st.analysis.error&&st.analysis.def>0?Math.min(70,1/st.analysis.def)*.5*anim:0;return {x:n.x+(a?.dx||0)*scale,y:n.y+(a?.dy||0)*scale}}
function drawWater2D(){let f=fit(),surface=bp(0,0).y;g.fillStyle='#aac5c3b8';g.fillRect(0,surface,f.w,f.h-surface);for(let k=0;k<7;k++){let y=surface+9+k*12;line({x:0,y},{x:f.w,y:y+Math.sin(k*1.9)*2},'#effaf499',1)}}
function bridgeColor(e){let r=st.analysis?.forces?.find(r=>r.id===e.id);if(r){if(r.ratio>1)return '#c6564d';if(r.type==='cable')return '#ca9453';return r.axial>0?'#279188':'#b8814a'}return MAT[e.m]?.color||'#53767d'}
function mapPoint(x,z){let w=canvas.clientWidth,h=canvas.clientHeight,S=world3d.worldSize||420;return {x:(x/S+.5)*w,y:(z/S+.5)*h}}
function mapHandleAt(pos){
 if(!routeEdit||st.view!=='2d'||st.planMode!=='map'||st.track!=='bridge'||scenario().id!=='kerch')return null;
 let best=-1,d=13;
 const handles=world3d.getRouteControls();
 for(let i=0;i<handles.length;i++){const c=mapPoint(handles[i].x,handles[i].z),dist=Math.hypot(pos.x-c.x,pos.y-c.y);if(dist<d){best=i;d=dist}}
 return best<0?null:best;
}
function drawCityOnMap(xy){
 if(!world3d.cityData||!world3d.cityEnabled)return;
 const records=world3d.cityData.items,limit=12000,skip=Math.max(1,Math.ceil(records.length/limit));
 g.save();
 for(let i=0;i<records.length;i+=skip){const obj=records[i];
  if(obj.kind==='building'){
   g.beginPath();obj.points.forEach(([x,z],k)=>{const p=xy(x,z);if(k===0)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y)});g.closePath();
   g.fillStyle='#cebbaaad';g.fill();g.strokeStyle='#6a6d5b';g.lineWidth=.55;g.stroke();
  }else{
   const a=xy(...obj.points[0]),b=xy(...obj.points[1]);g.strokeStyle=obj.kind==='rail'?'#b5dce0':'#87949a';g.lineWidth=obj.kind==='rail'?1.1:1.8;
   g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();
  }
 }
 g.restore();
}
function drawMap2D(){
 const w=canvas.clientWidth,h=canvas.clientHeight,S=world3d.worldSize||220,half=S/2;
 const xy=(x,z)=>({x:(x+half)/S*w,y:(z+half)/S*h});
 g.fillStyle='#1b4f63';g.fillRect(0,0,w,h);
 const bg=g.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#23566a');bg.addColorStop(.6,'#287a83');bg.addColorStop(1,'#153e58');g.fillStyle=bg;g.fillRect(0,0,w,h);
 const cols=110,rows=76;
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  let x=-half+S*(i+.5)/cols,z=-half+S*(j+.5)/rows,hh=world3d.mapHeight(x,z);
  if(hh<=-1.49)continue;
  let fill=hh<-.35?'rgba(215,202,149,.72)':hh<.7?'rgba(136,161,112,.80)':hh<1.7?'rgba(130,150,94,.88)':((Math.sin(x*.17)+Math.cos(z*.24))>0?'rgba(129,147,88,.90)':'rgba(152,147,110,.88)');
  g.fillStyle=fill;g.fillRect(i*w/cols,j*h/rows,w/cols+1,h/rows+1);
 }
 const bounds=world3d.kerchBounds(),N=260;
 drawCityOnMap(xy);drawSettlementOnMap(xy);
 // route centerlines
 for(let lineidx=0;lineidx<2;lineidx++){
  let off=lineidx===0?bounds.roadSide:bounds.railSide;
  g.beginPath();for(let i=0;i<=N;i++){let x=bounds.x0+(bounds.x1-bounds.x0)*i/N,z=world3d.trackCenter(x,off),p=xy(x,z);if(i===0)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y)}
  g.strokeStyle=lineidx===0?'rgba(20,31,38,.88)':'rgba(18,39,43,.92)';g.lineWidth=lineidx===0?10:6;g.stroke();
  g.strokeStyle=lineidx===0?'#f0cf8a':'#d9ece7';g.lineWidth=lineidx===0?3.5:2.4;g.stroke();
 }
 // traffic markers (2D sync with 3D animation)
 const tt=performance.now()*.001;
 for(let i=0;i<14;i++){let dir=i%2===0?1:-1,span=bounds.x1-bounds.x0-14,base=dir>0?bounds.x0+7:bounds.x1-7,dist=((tt*(dir>0?10.5:8.8)+i*14.7)%span),x=dir>0?base+dist:base-dist,p=xy(x,world3d.trackCenter(x,bounds.roadSide)+(i%4<2?-.95:.95));g.fillStyle=['#ffffff','#e4af66','#b2d6df','#d06a55'][i%4];g.fillRect(p.x-3,p.y-1.5,6,3)}
 const a=xy(bounds.archA,world3d.kerchCenter(bounds.archA)),b=xy(bounds.archB,world3d.kerchCenter(bounds.archB));
 g.strokeStyle='#f6f1d9';g.lineWidth=2;g.strokeRect(a.x-3,a.y-14,Math.max(5,b.x-a.x+6),28);
 // Geographic shoreline intersections are observations from the imported OSM raster,
 // never assumed support/pier coordinates or a claim of surveying accuracy.
 if(world3d.geoPack?.coast && routeDiagnosticVisible){
  const diag=world3d.routeCoastDiagnostics();
  for(const [name,stats] of Object.entries(diag.tracks)){
   for(const station of stats.samples){
    const p=xy(station.x,station.z);
    g.beginPath();g.arc(p.x,p.y,3.6,0,Math.PI*2);
    g.fillStyle=station.land===null?'#8596ad':station.land?'#64d79b':'#f27866';g.fill();
    g.strokeStyle='#102a36';g.lineWidth=.8;g.stroke();
   }
   for(const [pt,tag] of [[stats.start,'КЕРЧЬ'],[stats.end,'ТАМАНЬ']]){
    const p=xy(pt.x,pt.z);
    g.beginPath();g.arc(p.x,p.y,5.7,0,Math.PI*2);g.fillStyle=pt.land?'#70e4a0':'#ff755d';g.fill();
    g.strokeStyle='#fff';g.lineWidth=1.3;g.stroke();
   }
  }
  g.fillStyle='rgba(9,39,48,.88)';g.fillRect(12,51,306,38);
  g.font='600 11px system-ui';g.fillStyle='#e8f2ef';g.fillText('СВЕРКА С OSM:   🟢 суша     🔴 вода',20,67);
  g.font='10px system-ui';g.fillStyle='#c2d7db';g.fillText('Цветные точки — классификация осей в GeoPack',20,81);
  g.font='600 10px system-ui';
  for(const v of diag.crossings.slice(0,20)){
   const p=xy(v.x,v.z);g.beginPath();g.arc(p.x,p.y,5,0,Math.PI*2);
   g.fillStyle='#ffe39b';g.fill();g.strokeStyle='#12313e';g.lineWidth=1.5;g.stroke();
  }
 }

 if(coastFitPreview?.ok){
  const b=world3d.kerchBounds();
  for(const item of [{a:coastFitPreview.x0,b:b.x0},{a:b.x1,b:coastFitPreview.x1}]){
   for(const side of [b.roadSide,b.railSide]){
    g.beginPath();g.setLineDash([7,5]);
    for(let i=0;i<=32;i++){
     const x=item.a+(item.b-item.a)*i/32,p=xy(x,world3d.trackCenter(x,side));
     if(i===0)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);
    }
    g.lineWidth=4;g.strokeStyle='#ffd47c';g.stroke();g.setLineDash([]);
   }
   const pt=xy(item.a,world3d.trackCenter(item.a,b.roadSide));
   g.beginPath();g.arc(pt.x,pt.y,6,0,Math.PI*2);g.fillStyle='#f6ce79';g.fill();
  }
  g.fillStyle='rgba(15,46,52,.94)';g.fillRect(10,95,365,33);
  g.font='600 11px system-ui';g.fillStyle='#ffdf97';g.fillText('ПРЕДПРОСМОТР подходов — ✓ Применить',18,115);
 }
 if(routeEdit){
  const handles=world3d.getRouteControls();
  g.font='600 10px system-ui';
  handles.forEach((v,i)=>{
   const point=mapPoint(v.x,v.z);
   if(v.locked)return;
   g.beginPath();g.arc(point.x,point.y,9,0,Math.PI*2);g.fillStyle=i===routeDragging?.index?'#f6c77e':'#ffaf57';g.fill();
   g.lineWidth=2;g.strokeStyle='#122d39';g.stroke();
   g.fillStyle='#132a35';g.textAlign='center';g.fillText(String(i),point.x,point.y+3.5);
  });
  g.textAlign='left';g.fillStyle='#fff4ce';g.fillText('✥ Можно двигать и крайние точки. Ось не является геодезической съёмкой. Ctrl+Z — отмена.',16,43);
 }
 const labels=[['КЕРЧЬ',-175,-12],['КОСА ЧУШКА',37,-11],['ТАМАНЬ',158,8],['ТУЗЛА',-25,-10],['АЗОВСКОЕ МОРЕ',0,-158],['ЧЁРНОЕ МОРЕ',10,158],['ТАМАНСКИЙ ЗАЛИВ',168,-78]];
 g.font='700 12px system-ui';for(let [t,x,z] of labels){let p=xy(x,z);g.fillStyle='rgba(247,244,231,.95)';g.fillText(t,p.x,p.y)}
 g.fillStyle='rgba(235,241,236,.95)';g.font='10px system-ui';g.fillText('ПЛАН · WGS84≈'+(world3d.demEnabled?' · импорт DSM/DEM':' · без DEM')+' · '+(world3d.gisMask?'импорт GeoJSON':world3d.coastMode==='osm'?'OpenStreetMap coastline (импорт)':world3d.coastMode==='gshhg'?'GSHHG (региональная береговая линия)':'контур по референсу пользователя'),16,21);
 g.fillText('Ось: '+(world3d.geoRoute?'импорт GeoJSON WGS84':'условная')+' · Берега и 2D/3D синхронизированы · '+(world3d.demEnabled?'импортированная DSM/DEM с преувеличением высот':'высоты процедурные')+' · GPS≈.',16,h-15);
}
function drawBridge2D(){let f=fit();bgGrid();drawWater2D();let map=new Map(st.model.nodes.map(n=>[n.id,n]));
 for(const n of st.model.nodes)if(n.support){let p=bp(bridgePosition(n).x,bridgePosition(n).y);let base=bp(n.x,.1);poly([{x:p.x-12,y:p.y+8},{x:p.x+12,y:p.y+8},{x:p.x,y:p.y+1}],'#bd945e','#aa7e4e');g.fillStyle='#a7a9a0';g.fillRect(p.x-11,p.y+10,22,7);if(n.support===2){circle({x:p.x-5,y:p.y+19},3,'#f7f8f3','#697b79');circle({x:p.x+5,y:p.y+19},3,'#f7f8f3','#697b79')}line({x:p.x,y:p.y+19},{x:base.x,y:base.y},'#a1a8a0',3)}
 for(const e of st.model.edges){let a=map.get(e.a),b=map.get(e.b);if(!a||!b)continue;let p=bridgePosition(a),r=bridgePosition(b),x=bp(p.x,p.y),y=bp(r.x,r.y);line(x,y,'#ffffffde',e.type==='frame'?11:8);line(x,y,bridgeColor(e),e.type==='frame'?7:e.type==='cable'?2.6:4.3);if(st.selected?.kind==='edge'&&st.selected.id===e.id)line(x,y,'#f0ba62',2)}
 if(st.pending){let n=map.get(st.pending);if(n){let x=bp(n.x,n.y);line(x,mouse,'#b67e3b',2,[4,4])}}
 for(const n of st.model.nodes){let p=bridgePosition(n),q=bp(p.x,p.y);if(n.fy){line({x:q.x,y:q.y-43},{x:q.x,y:q.y-12},'#bc6654',2.5);poly([{x:q.x,y:q.y-8},{x:q.x-5,y:q.y-17},{x:q.x+5,y:q.y-17}],'#bc6654');text(Math.abs(n.fy)+' кН',q.x,q.y-51,10,'#a85e4f','650','center')}
 circle(q,5.5,'#fffef9','#456c72');if(st.selected?.kind==='node'&&st.selected.id===n.id)circle(q,2.6,'#d29648');}
 let left=bp(0,-.6),right=bp(scenario().span,-.6);line(left,right,'#607c82',1,[6,4]);text(scenario().span+' м · учебный пролёт',f.w/2,Math.min(f.h-18,left.y+18),11,'#47666e','600','center');text('ГОЛУБОЙ — РАСТЯЖЕНИЕ   /   ОХРА — СЖАТИЕ',17,f.h-15,9,'#506a6f')
}
function drawBridge3D(){let f=fit(),w=f.w,h=f.h,L=scenario().span;g.fillStyle='#e7efec';g.fillRect(0,0,w,h);
 let ground=[proj(-8,0,-12),proj(L+8,0,-12),proj(L+8,0,12),proj(-8,0,12)];poly(ground,'#bbd1cb','#96b2b0');
 for(let i=0;i<12;i++){let x=i*(L+14)/12-7;line(proj(x,.03,-12),proj(x,.03,12),'#eff6f263',1)}
 let map=new Map(st.model.nodes.map(n=>[n.id,n])),depth=4.6;
 // Far-side longitudinal members then transverse ties, near-side members.
 for(let side of [-1,1]){
 for(const e of st.model.edges){let a=map.get(e.a),b=map.get(e.b);if(!a||!b)continue;let ap=bridgePosition(a),bp2=bridgePosition(b);let A=proj(ap.x,ap.y,depth/2*side),B=proj(bp2.x,bp2.y,depth/2*side);line(A,B,'#ffffff90',e.type==='frame'?9:6);line(A,B,bridgeColor(e),e.type==='frame'?6:e.type==='cable'?2:3.2)}
 if(side===-1)for(let n of st.model.nodes){let p=bridgePosition(n);line(proj(p.x,p.y,-depth/2),proj(p.x,p.y,depth/2),'#789b99',2)}
 }
 let deckY=3;for(let i=0;i<L;i+=L/Math.max(6,scenario().n)){let x1=i,x2=Math.min(L,i+L/Math.max(6,scenario().n));poly([proj(x1,deckY+.13,-depth/2),proj(x2,deckY+.13,-depth/2),proj(x2,deckY+.13,depth/2),proj(x1,deckY+.13,depth/2)],'#d8d4c8b6','#677b7c55')}
 for(const n of st.model.nodes)if(n.support){let p=bridgePosition(n);for(let z of [-depth/2,depth/2]){line(proj(n.x,0,z),proj(p.x,p.y,z),'#b7aa8e',8);circle(proj(n.x,.1,z),4,'#bd9360')}}
 text('3D · геометрия и объёмная визуализация',17,h-38,12,'#335e65','700');text('Расчёт выполняется в плоскости 2D · внеплоскостная устойчивость не проверяется',17,h-20,10,'#5b7677')
}
function drawFoundation2D(){let f=fit(),w=f.w,h=f.h,p=st.foundation,s=SOILS[p.soil],y=h*.47;
 bgGrid();g.fillStyle=s.color;g.fillRect(0,y,w,h-y);
 for(let i=0;i<105;i++){let x=(i*67.3)%w,yy=y+((i*37.9)%(h-y));g.fillStyle=i%5?'#55473b18':'#fff9e728';g.beginPath();g.ellipse(x,yy,2+i%3,1+i%2,0,0,7);g.fill()}
 line({x:0,y},{x:w,y},'#8f9685',2);
 if(p.water){let wy=y+52;line({x:0,y:wy},{x:w,y:wy},'#4b9eb1',2,[8,4]);text('УРОВЕНЬ ВОДЫ',w-122,wy-7,10,'#2b8096','700')}
 let left=w*.27,right=w*.73,bottom=y-3,top=y-132;
 g.fillStyle='#fbfcf8';g.fillRect(left,top,right-left,bottom-top);g.strokeStyle='#6c898c';g.lineWidth=2;g.strokeRect(left,top,right-left,bottom-top);
 for(let i=1;i<p.floors;i++){let py=bottom-(bottom-top)*(i/p.floors);line({x:left,y:py},{x:right,y:py},'#c1d0cd',2)}
 poly([{x:left-18,y:top},{x:(left+right)/2,y:top-54},{x:right+18,y:top}],'#477c82','#355f69',2);
 for(let i=0;i<4;i++){let x=left+22+i*(right-left-48)/3;g.strokeStyle='#9db8b7';g.strokeRect(x,top+24,27,33)}
 let d=p.depth*22,th=17;
 if(p.type==='raft'){g.fillStyle='#7e9695';g.fillRect(left-14,y+17,right-left+28,th);line({x:left-14,y:y+17},{x:right+14,y:y+17},'#d4dcd9',2)}
 if(p.type==='strip'){g.fillStyle='#7e9695';g.fillRect(left-21,y+16,44,th+d*.26);g.fillRect(right-23,y+16,44,th+d*.26);g.fillRect(left,y+13,right-left,8)}
 if(p.type==='pad'){for(let x of [left+13,left+(right-left)/3,left+(right-left)*2/3,right-13]){g.fillStyle='#879d9b';g.fillRect(x-23,y+27,46,17);g.fillRect(x-6,y+4,12,23)}}
 if(['piles','screw'].includes(p.type)){
 g.fillStyle='#849ba0';g.fillRect(left-5,y+8,right-left+10,15);
 let count=clamp(Math.round(p.pileCount/3),4,15);
 for(let i=0;i<count;i++){let x=left+9+i*(right-left-18)/(count-1),len=clamp(p.pileLength*11,42,h-y-29);g.fillStyle=p.type==='piles'?'#789da7':'#637e90';g.fillRect(x-4,y+23,8,len);if(p.type==='screw')for(let j=0;j<3;j++)line({x:x-9,y:y+34+j*24},{x:x+9,y:y+39+j*24},'#d0d6d1',2)}
 }
 text(s.name+' · Eₛ = '+money(s.Es)+' кПа',18,h-31,11,'#302f2a','700');text('УСЛОВНЫЙ ГЕОЛОГИЧЕСКИЙ РАЗРЕЗ',18,h-14,9,'#5b5147')
}
function drawFoundation3D(){let f=fit(),w=f.w,h=f.h,p=st.foundation,s=SOILS[p.soil],W=p.width,L=p.length,cx=fit().span/2;
 function v(x,y,z){return proj(x+(cx-L/2),y,z)}
 // ground block
 let low=[v(0,-3,-W/2-2),v(L,-3,-W/2-2),v(L,-3,W/2+2),v(0,-3,W/2+2)];let high=low.map((_,i)=>[v(0,0,-W/2-2),v(L,0,-W/2-2),v(L,0,W/2+2),v(0,0,W/2+2)][i]);
 poly([low[0],low[1],high[1],high[0]],s.color);poly([low[1],low[2],high[2],high[1]],'#95826e');poly(high,'#c1b69d','#879b92',2);
 if(p.water){poly([v(0,-1,-W/2-2),v(L,-1,-W/2-2),v(L,-1,W/2+2),v(0,-1,W/2+2)],'#60a5ba4a','#4b91a6')}
 let corners=[[0,0,-W/2],[L,0,-W/2],[L,0,W/2],[0,0,W/2]];
 if(['piles','screw'].includes(p.type)){for(let i=0;i<=Math.min(5,p.pileCount/2);i++)for(let j of [-1,1]){let x=L*(i+.5)/(Math.min(5,p.pileCount/2)+1),z=j*(W/2-1);line(v(x,-Math.min(p.pileLength/5,3.2),z),v(x,.3,z),p.type==='screw'?'#456f88':'#76908d',7)}}
 if(p.type==='raft')poly(corners.map(c=>v(c[0],.3,c[2])),'#819696','#526e72');
 for(let i=0;i<4;i++){let a=corners[i],b=corners[(i+1)%4];line(v(a[0],0,a[2]),v(b[0],0,b[2]),'#647e80',p.type==='strip'?13:5)}
 let upper=corners.map(c=>v(c[0],4,c[2])),lower=corners.map(c=>v(c[0],.3,c[2]));poly([lower[0],lower[1],upper[1],upper[0]],'#d5dfd6','#96a9a6');poly([lower[1],lower[2],upper[2],upper[1]],'#e8eee5','#96a9a6');poly([lower[2],lower[3],upper[3],upper[2]],'#e5eae3','#96a9a6');
 for(let i=0;i<4;i++)line(lower[i],upper[i],'#72918d',1.7);
 poly([upper[0],upper[1],v(L/2,6,-W/2),v(L/2,6,W/2),upper[3]],'#5f7773','#42605f');poly([upper[1],upper[2],v(L/2,6,W/2),v(L/2,6,-W/2)],'#78908a','#42605f');
 text('3D · условная пространственная схема',17,h-31,12,'#345d64','700');text('Геотехнические проверки — скалярная учебная модель, не 3D FEM',17,h-14,10,'#567479');
}
function hitNode(pos){let best=null,d=14;for(const n of st.model.nodes){let p=bp(n.x,n.y),dd=Math.hypot(p.x-pos.x,p.y-pos.y);if(dd<d){best={kind:'node',id:n.id};d=dd}}return best}
function hitAny(pos){let n=hitNode(pos);if(n)return n;let map=new Map(st.model.nodes.map(v=>[v.id,v]));let best=null,limit=9;for(const e of st.model.edges){let a=map.get(e.a),b=map.get(e.b);if(!a||!b)continue;let p=bp(a.x,a.y),q=bp(b.x,b.y),dx=q.x-p.x,dy=q.y-p.y,v=clamp(((pos.x-p.x)*dx+(pos.y-p.y)*dy)/(dx*dx+dy*dy||1),0,1),d=Math.hypot(pos.x-(p.x+v*dx),pos.y-(p.y+v*dy));if(d<limit){best={kind:'edge',id:e.id};limit=d}}return best}
function addNode(pos){let w=bi(pos),x=Math.round(w.x*2)/2,y=Math.round(w.y*2)/2;if(x<-.5||x>scenario().span+.5||y<-2||y>26)return null;let n={id:st.model.nextId++,x,y,support:0,fx:0,fy:0};st.model.nodes.push(n);return n}
function interact(pos){if(st.track!=='bridge'||st.view!=='2d'||st.planMode==='map')return;let item=hitAny(pos);st.selected=item;
 if(st.tool==='select'){render();return}
 if(st.tool==='erase'){if(!item)return;editMark();if(item.kind==='node'){st.model.nodes=st.model.nodes.filter(n=>n.id!==item.id);st.model.edges=st.model.edges.filter(e=>e.a!==item.id&&e.b!==item.id)}else st.model.edges=st.model.edges.filter(e=>e.id!==item.id);st.pending=null;note('Элемент удалён.');render();return}
 if(st.tool==='support'||st.tool==='load'){if(item?.kind!=='node')return;let n=st.model.nodes.find(n=>n.id===item.id);editMark();if(st.tool==='support')n.support=(n.support+1)%4;else n.fy=n.fy===0?-25:n.fy===-25?-50:n.fy===-50?-100:0;note('Параметр узла изменён.');render();return}
 if(st.tool==='node'){if(item?.kind==='node')return;editMark();let n=addNode(pos);if(!n){st.hist.pop();return}st.selected={kind:'node',id:n.id};render();return}
 const kind=st.tool;
 if(['rod','frame','cable'].includes(kind)){
 let n=item?.kind==='node'?st.model.nodes.find(n=>n.id===item.id):null;
 if(!n){editMark();n=addNode(pos);if(!n){st.hist.pop();return}}
 if(!st.pending){st.pending=n.id;note('Выберите второй узел для соединения.');render();return}
 if(st.pending===n.id){st.pending=null;render();return}
 if(item?.kind==='node')editMark();if(!st.model.edges.some(e=>(e.a===st.pending&&e.b===n.id)||(e.b===st.pending&&e.a===n.id))){let e={id:st.model.nextId++,a:st.pending,b:n.id,type:kind,m:kind==='cable'?'cable':st.material,size:1};st.model.edges.push(e);st.selected={kind:'edge',id:e.id}}
 st.pending=n.id;note('Элемент добавлен. Выберите следующий узел или Esc.');render()
 }
}
function point(e){let r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
canvas.addEventListener('pointerdown',e=>{if(st.planMode==='map'&&st.track==='bridge'&&buildingMode!=='off'){
  if(e.button!==0)return;const p=point(e),S=world3d.worldSize||420;buildingCursor={x:(p.x/canvas.clientWidth-.5)*S,z:(p.y/canvas.clientHeight-.5)*S};
  if(buildingMode==='select'){const candidate=world3d.settlement.nearest(buildingCursor.x,buildingCursor.z,5);if(candidate){world3d.settlementSelectedId=candidate.id;buildingDrag={id:candidate.id,saved:false};try{canvas.setPointerCapture(e.pointerId)}catch(_){}}}
  return;
 }if(st.planMode==='map'&&st.track==='bridge'){
  const i=mapHandleAt(point(e));if(i!==null){routeDragging={index:i,startY:point(e).y,startOffset:world3d.routeOffsets[i],saved:false};try{canvas.setPointerCapture(e.pointerId)}catch(_){} }
  return;
 }if(e.button===2)return;mouse=point(e);dragging=false;pointerDown={id:e.pointerId,p:mouse,last:mouse,shift:e.shiftKey||e.button===1, node:null,saved:false};if(st.track==='bridge'&&st.view==='2d'&&st.tool==='select'&&!e.shiftKey){let n=hitNode(mouse);if(n)pointerDown.node=n.id}try{canvas.setPointerCapture(e.pointerId)}catch(err){}});
canvas.addEventListener('pointermove',e=>{if(st.planMode==='map'&&st.track==='bridge'&&buildingMode!=='off'){
  const p=point(e),S=world3d.worldSize||420;buildingCursor={x:(p.x/canvas.clientWidth-.5)*S,z:(p.y/canvas.clientHeight-.5)*S};
  if(buildingDrag){const item=world3d.settlement.items.find(x=>x.id===buildingDrag.id);
   if(item){const validation=checkSettlementPlacement(world3d,world3d.settlement.items,{...item,x:buildingCursor.x,z:buildingCursor.z},{ignoreId:item.id});
    if(validation.ok){if(!buildingDrag.saved){editMark();buildingDrag.saved=true}item.x=validation.item.x;item.z=validation.item.z;world3d.settlementChanged();}
   }
  }draw();return;
 }if(st.planMode==='map'&&st.track==='bridge'){
  if(routeDragging){let current=point(e),S=world3d.worldSize||420,
     delta=(current.y-routeDragging.startY)/canvas.clientHeight*S,
     desired=clamp(Math.round((routeDragging.startOffset+delta)*10)/10,-80,80);
   if(desired!==world3d.routeOffsets[routeDragging.index]){
    if(!routeDragging.saved){editMark();routeDragging.saved=true;}
    world3d.setRouteOffset(routeDragging.index,desired);coastFitPreview=null;
    st.analysis=null;
   }
   draw();
  }
  return;
 }let p=point(e);mouse=p;if(pointerDown&&e.pointerId===pointerDown.id){let dx=p.x-pointerDown.last.x,dy=p.y-pointerDown.last.y;if(Math.hypot(p.x-pointerDown.p.x,p.y-pointerDown.p.y)>5)dragging=true;if(dragging){if(st.view==='3d'){st.yaw+=dx*.012;st.pitch=clamp(st.pitch+dy*.009,-.15,1.3)}else if(pointerDown.shift||st.track==='foundation'){st.panX+=dx;st.panY+=dy}else if(pointerDown.node){let n=st.model.nodes.find(n=>n.id===pointerDown.node);let pt=bi(p),x=Math.round(pt.x*2)/2,y=Math.round(pt.y*2)/2;if(n&&x>=0&&x<=scenario().span&&y>=-1&&y<=25){if(!pointerDown.saved){editMark();pointerDown.saved=true}n.x=x;n.y=y}}}pointerDown.last=p}draw()});
canvas.addEventListener('pointerup',e=>{if(st.planMode==='map'&&st.track==='bridge'&&buildingMode!=='off'){
   const p=point(e),S=world3d.worldSize||420,x=(p.x/canvas.clientWidth-.5)*S,z=(p.y/canvas.clientHeight-.5)*S;
   const wasDrag=!!buildingDrag?.saved;buildingDrag=null;if(!wasDrag)settlementAt(x,z);else{note('Постройка перемещена. Ctrl+Z — отмена.','good');render();}return;
 }if(st.planMode==='map'&&st.track==='bridge'){
  if(routeDragging){const changed=routeDragging.saved;routeDragging=null;if(changed){note('Маршрут изменён в обеих проекциях · расчётная длина ≈ '+world3d.routeLengthKm().toFixed(2)+' км.', 'good');render()}else draw();}
  return;
 }if(!pointerDown||e.pointerId!==pointerDown.id)return;if(!dragging&&!pointerDown.shift&&e.button!==1)interact(point(e));else if(pointerDown.saved)render();pointerDown=null});
canvas.addEventListener('pointercancel',()=>{pointerDown=null;routeDragging=null;buildingDrag=null});canvas.addEventListener('contextmenu',e=>{e.preventDefault();st.pending=null});canvas.addEventListener('wheel',e=>{e.preventDefault();st.zoom=clamp(st.zoom*(e.deltaY<0?1.08:.92),.5,3);draw()},{passive:false});
root.addEventListener('click',e=>{let el=e.target.closest('button');if(!el)return;
 if(el.dataset.building){selectBuildingTool(el.dataset.building);note(el.dataset.building==='off'?'Редактор застройки отключён.':'Режим TerraBuild: '+el.textContent.trim()+'. ЛКМ по суше · Shift+ЛКМ вращает 3D.');render();return;}
 if(el.id==='building-rotate'){buildingYaw=(buildingYaw+90)%360;const item=world3d.settlement.items.find(b=>b.id===world3d.settlementSelectedId);if(item){const planned={...item,yaw:(item.yaw+90)%360},check=checkSettlementPlacement(world3d,world3d.settlement.items,planned,{ignoreId:item.id});if(!check.ok){note('Поворот невозможен: '+check.reason,'bad');return;}editMark();item.yaw=planned.yaw;world3d.settlementChanged()}render();return;}
 if(el.id==='building-delete-selected'){const id=world3d.settlementSelectedId;if(id!==null){editMark();world3d.settlement.remove(id);world3d.settlementSelectedId=null;world3d.settlementChanged();render()}return;}
 if(el.id==='city-import'){$('city-import-file').click();return;}
 if(el.id==='city-toggle'){world3d.cityEnabled=!world3d.cityEnabled;if(!world3d.cityEnabled)world3d.cityVisible=[];world3d.shadowDirty=true;render();note(world3d.cityEnabled?'Городской GIS-слой включён.':'Городской GIS-слой скрыт.','good');return;}
 if(el.id==='city-clear'){world3d.clearCityData();render();note('Импортированный GIS-слой очищен; GeoPack и пользовательские постройки сохранены.','good');return;}
 if(el.id==='building-seed'){seedSettlement();return;}
 if(el.id==='building-clear'){if(world3d.settlement.items.length){editMark();world3d.settlement.clear();world3d.settlementSelectedId=null;world3d.settlementChanged();note('Постройки очищены, земля и мост не изменены. Ctrl+Z — отмена.','good');render()}return;}
 if(el.id==='building-export'){const blob=new Blob([JSON.stringify(world3d.settlement.toGeoJSON(),null,2)],{type:'application/geo+json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='TrussLab_TerraBuild_WGS84_approx.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);note('Экспорт GeoJSON создан; GPS-позиции приблизительны.','good');return;}
 if(el.id==='building-import'){$('building-import-file').click();return;}
 if(el.id==='plan-toggle'){st.planMode=st.planMode==='map'?'section':'map';render();return}
 if(el.id==='route-edit'){selectBuildingTool('off');routeEdit=!routeEdit;note(routeEdit?'Режим трассы: перетаскивайте оранжевые точки, включая КРАЙНИЕ. Проверяйте OSM-покрытие цветными маркерами.':'Редактирование трассы завершено.');render();return}
 if(el.id==='route-reset'){editMark();world3d.resetRoute();world3d.resetRouteExtents();coastFitPreview=null;note('Ось и длина игровых подходов восстановлены к исходной форме.','good');render();return}

 if(el.id==='bridge-3d-edit'){selectBuildingTool('off');world3d.editBridge=!world3d.editBridge;world3d.brush='orbit';world3d.sceneDirty=true;note(world3d.editBridge?'Редактор 3D: перетаскивайте оранжевые узлы. Shift — изменение X, обычный drag — высота.':'Редактирование 3D выключено.');render();return}
 if(el.id==='coast-source'){
  const modes=world3d.geoPack?.coast?['reference','gshhg','osm']:['reference','gshhg'];
  world3d.setCoastMode(modes[(modes.indexOf(world3d.coastMode)+1)%modes.length]);
  syncGeoControls();world3d.render(worldPayload(),true);draw();
  note(world3d.coastMode==='osm'?'Включена OSM coastline-маска, построенная локально из настоящих OSM ways.':'Источник берегов: '+world3d.coastMode+'.', 'good');return}
 
 if(el.dataset.camera){world3d.setPresetCamera(el.dataset.camera);world3d.render(worldPayload(),false);note('Режим камеры: '+el.textContent+'.');return}
 if(el.dataset.track){st.track=el.dataset.track;setScenario(0);return}
 if(el.dataset.scenario!==undefined){setScenario(Number(el.dataset.scenario));return}
 if(el.dataset.view){st.view=el.dataset.view;world3d.sceneDirty=true;st.pending=null;if(st.view==='3d'&&!world3d.ready)note('WebGL недоступен: попробуйте Chromium или Firefox.','bad');render();return}
 if(el.dataset.brush){selectBuildingTool('off');world3d.editBridge=false;world3d.brush=el.dataset.brush;note(world3d.brush==='orbit'?'FreeCam: ЛКМ — осмотр, WASD / QE — перемещение.':'Редактор рельефа: ведите курсором по поверхности.');render();return}
 if(el.dataset.tool){st.tool=el.dataset.tool;st.pending=null;note('Инструмент: '+el.textContent);render();return}
 if(el.dataset.mat){let edge=st.model.edges.find(e=>e.id===st.selected?.id);if(edge){editMark();edge.m=el.dataset.mat}else st.material=el.dataset.mat;render();return}
 if(el.dataset.found){editMark();st.foundation.type=el.dataset.found;render();return}
 switch(el.id){case'sample':if(st.track==='bridge'){editMark();st.model=makeBridge(scenario())}else{editMark();st.foundation=newFoundation(st.idx)}st.analysis=null;st.selected=null;st.pending=null;note('Исходная конструкция восстановлена.');render();break;
 case'undo':undo();break;case'redo':redo();break;case'test':run();break;case'formulas':st.showFormulas=!st.showFormulas;render();break;case'close-formulas':st.showFormulas=false;render();break;
 case'zoom-in':if(st.view==='3d'){const f=world3d.cameraBasis().forward;world3d.camPos=world3d.camPos.map((v,i)=>v+f[i]*2)}else st.zoom=clamp(st.zoom*1.16,.5,3);draw();break;case'zoom-out':if(st.view==='3d'){const f=world3d.cameraBasis().forward;world3d.camPos=world3d.camPos.map((v,i)=>v-f[i]*2)}else st.zoom=clamp(st.zoom*.86,.5,3);draw();break;case'zoom-reset':if(st.view==='3d'){world3d.setPresetCamera(st.track==='bridge'&&scenario().id==='kerch'?'kerch':st.track==='foundation'?'foundation':'bridge')}else resetCamera();draw();break;
 case'theme-toggle':theme=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;world3d.theme=theme;try{localStorage.setItem('trusslab-theme-v8',theme)}catch(_){}el.textContent=theme==='dark'?'☾ Тёмная':'☼ Светлая';draw();break;
 case'terrain-reset':editMark();world3d.initTerrain(st.foundation?.soil||'sand');world3d.mapEdit.fill(0);world3d.sceneDirty=true;note('Рельеф сброшен к исходному состоянию');draw();break;
 case'terrain-top':world3d.setPresetCamera('map');draw();break;
 case'fullscreen':{const el=document.querySelector('.canvas-wrap');if(document.fullscreenElement){document.exitFullscreen?.()}else{el.requestFullscreen?.().catch(err=>note('Не удалось открыть полный экран: '+err.message,'bad'))}break;}
 case'save-frame':{try{const c=world3d.canvas;if(!c.width)throw Error('нет кадра');const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='TrussLab_Architect_10_2.png';a.click();note('PNG-снимок готов.','good')}catch(err){note('Снимок недоступен: '+err.message,'bad')}break}
 case'load-local':try{let v=JSON.parse(localStorage.getItem('trusslab-studio-project')||'null');if(!v||![2,3,4,5,6,7,8,9].includes(v.version)){note('Сохранённый проект не найден','bad');break}st.track=v.track==='foundation'?'foundation':'bridge';st.idx=clamp(Number(v.idx)||0,0,(st.track==='bridge'?BRIDGES:FOUNDATION_LEVELS).length-1);st.model=v.model;st.foundation=v.foundation;st.hist=[];st.future=[];st.analysis=null;world3d.start(worldPayload());if(v.terrain?.length===4225)world3d.terrain.set(v.terrain);if(v.paint?.length===4225)world3d.paintLayer.set(v.paint);if(v.mapEdit?.length===4225)world3d.mapEdit.set(v.mapEdit);applyCrossingSettings(v.crossing);if(v.geoPack)world3d.loadGeoPack(v.geoPack);if(v.geoRoute)world3d.loadRouteGeoJSON(v.geoRoute);else world3d.clearRouteGeoJSON();if(v.coastMode)world3d.setCoastMode(v.coastMode);if(Array.isArray(v.buildings)){world3d.settlement.restore(v.buildings);world3d.settlementChanged();}if(v.cityGeoJSON){world3d.loadCityGeoJSON(v.cityGeoJSON);}else world3d.clearCityData();if(typeof v.cityEnabled==='boolean')world3d.cityEnabled=v.cityEnabled;if(typeof v.demEnabled==='boolean')world3d.setDEMEnabled(v.demEnabled);syncGeoControls();world3d.invalidateTerrain();note('Сохранённый проект загружен','good');render()}catch(err){note('Не удалось загрузить: '+err.message,'bad')}break;
 case'save':try{localStorage.setItem('trusslab-studio-project',JSON.stringify({version:9,crossing:crossingSettings(),coastMode:world3d.coastMode,buildings:world3d.settlement.toJSON(),cityGeoJSON:world3d.cityData?.sourceGeoJSON||null,cityEnabled:world3d.cityEnabled,geoPack:world3d.geoPackSource,geoRoute:world3d.geoRouteSource,demEnabled:world3d.demEnabled,track:st.track,idx:st.idx,model:st.model,foundation:st.foundation,terrain:[...world3d.terrain],paint:[...world3d.paintLayer],mapEdit:[...world3d.mapEdit]}));note('Проект сохранён в браузере. Для обмена файлом используйте кнопку «Проект».','good')}catch(err){note('Хранилище браузера недоступно. Скачайте JSON.','bad')}break;
 case'import':$('import-file').click();break;
 case'download':{let pack={version:9,crossing:crossingSettings(),coastMode:world3d.coastMode,buildings:world3d.settlement.toJSON(),cityGeoJSON:world3d.cityData?.sourceGeoJSON||null,cityEnabled:world3d.cityEnabled,geoPack:world3d.geoPackSource,geoRoute:world3d.geoRouteSource,demEnabled:world3d.demEnabled,track:st.track,idx:st.idx,model:st.model,foundation:st.foundation,terrain:[...world3d.terrain],paint:[...world3d.paintLayer],mapEdit:[...world3d.mapEdit]};let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));a.download='TrussLab_Project_v10_2_GeoCity.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);note('JSON проекта экспортирован.');break}
 }
});
root.addEventListener('change',e=>{let el=e.target;
 if(el.dataset.field==='case'){st.loadCase=el.value;st.analysis=null;render();return}
 if(el.dataset.field==='edge-type'){let edge=st.model.edges.find(e=>e.id===st.selected?.id);if(edge){editMark();edge.type=el.value;st.analysis=null;render()}return}
 if(el.dataset.field==='soil'){editMark();st.foundation.soil=el.value;st.analysis=null;render();return}
 if(el.dataset.number){let field=el.dataset.number,v=clamp(Number(el.value),4,35);editMark();st.foundation[field]=v;st.analysis=null;render();return}
 if(el.dataset.check){editMark();st.foundation[el.dataset.check]=el.checked;st.analysis=null;render()}
});
root.addEventListener('input',e=>{let el=e.target;if(!el.dataset.field||el.tagName!=='INPUT')return;let key=el.dataset.field,v=Number(el.value);if(!Number.isFinite(v))return;if(!el.dataset.dragstarted){editMark();el.dataset.dragstarted='1'}
 if(st.track==='bridge'){if(key==='loadFactor')st.factor=v;else if(key==='edge-size'){let edge=st.model.edges.find(e=>e.id===st.selected?.id);if(edge)edge.size=v}}else st.foundation[key]=v;
 st.analysis=null;let output=el.closest('.input-group')?.querySelector('output');if(output)output.textContent=v+(key==='load'?' кН':key==='depth'||key==='pileLength'||key==='stripWidth'?' м':key==='pileCount'?' шт':' ×');draw();
});
root.addEventListener('change',e=>{if(e.target.dataset.dragstarted){delete e.target.dataset.dragstarted;render()}});
$('import-file').addEventListener('change',async e=>{
 try{const file=e.target.files?.[0];if(!file)return;if(file.size>5_000_000)throw Error('слишком большой файл');
 let v=JSON.parse(await file.text());if(![2,3,4,5,6,7,8,9].includes(v.version)||!Array.isArray(v.model?.nodes)||!Array.isArray(v.model?.edges)||!v.foundation?.soil||!SOILS[v.foundation.soil])throw Error('неизвестный формат проекта');
 if(v.model.nodes.length>180||v.model.edges.length>400)throw Error('слишком много элементов');
 st.track=v.track==='foundation'?'foundation':'bridge';st.idx=clamp(Number(v.idx)||0,0,(st.track==='bridge'?BRIDGES:FOUNDATION_LEVELS).length-1);st.model=v.model;st.foundation=v.foundation;st.analysis=null;st.hist=[];st.future=[];st.pending=null;st.selected=null;world3d.start(worldPayload());if(v.terrain?.length===4225&&v.paint?.length===4225){world3d.terrain.set(v.terrain.map(n=>Number.isFinite(n)?clamp(n,-3,7):0));world3d.paintLayer.set(v.paint.map(n=>clamp(Number(n)||0,0,5)))}if(v.mapEdit?.length===4225)world3d.mapEdit.set(v.mapEdit.map(n=>Number.isFinite(n)?clamp(n,-3,7):0));applyCrossingSettings(v.crossing);if(v.geoPack)world3d.loadGeoPack(v.geoPack);if(v.geoRoute)world3d.loadRouteGeoJSON(v.geoRoute);else world3d.clearRouteGeoJSON();if(v.coastMode)world3d.setCoastMode(v.coastMode);if(Array.isArray(v.buildings)){world3d.settlement.restore(v.buildings);world3d.settlementChanged();}if(v.cityGeoJSON){world3d.loadCityGeoJSON(v.cityGeoJSON);}else world3d.clearCityData();if(typeof v.cityEnabled==='boolean')world3d.cityEnabled=v.cityEnabled;if(typeof v.demEnabled==='boolean')world3d.setDEMEnabled(v.demEnabled);syncGeoControls();world3d.invalidateTerrain();note('JSON проекта успешно импортирован.','good');render()
 }catch(err){note('Ошибка импорта: '+err.message,'bad')}finally{e.target.value=''}
});
$('brush-radius').addEventListener('input',e=>world3d.radius=Number(e.target.value));
$('building-floors').addEventListener('input',e=>{buildingFloors=Number(e.target.value);$('building-floors-output').textContent=String(buildingFloors);const picked=world3d.settlement.items.find(b=>b.id===world3d.settlementSelectedId);if(picked&&['house','apartment'].includes(picked.type)){$('building-floor-hint').textContent='Для изменения этажности выбранного дома нажми «Применить этажи».';}});
$('building-apply-floors').addEventListener('click',()=>{const item=world3d.settlement.items.find(b=>b.id===world3d.settlementSelectedId);if(!item||!['house','apartment'].includes(item.type))return;editMark();item.floors=item.type==='house'?clamp(buildingFloors,1,3):clamp(buildingFloors,2,10);world3d.settlementChanged();render();note('Этажность выбранной постройки изменена.','good');});
$('city-import-file').addEventListener('change',async e=>{
 try{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>25_000_000)throw Error('GeoJSON более 25 МБ: разбейте данные на небольшие сектора (см. GEO_CITY_GUIDE.md)');
  const raw=JSON.parse(await file.text());
  const report=world3d.loadCityGeoJSON(raw,{append:!!world3d.cityData});
  if(!report.buildings&&!report.roads&&!report.rails)note('Файл загружен, но в текущей области не найдены объекты. Проверьте WGS84/CRS и район.','bad');
  else note(`GeoCity: ${report.buildings} зданий, ${report.roads} сегментов дорог, ${report.rails} рельсовых сегментов. ${report.estimatedHeights} высот оценены. Источник: ${report.source}.`, 'good');
  render();
 }catch(err){note('Импорт GeoCity: '+err.message,'bad')}
 finally{e.target.value=''}
});
$('building-import-file').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>1_500_000)throw Error('GeoJSON больше 1.5 МБ');const geo=JSON.parse(await file.text());editMark();const res=world3d.settlement.importGeoJSON(world3d,geo);world3d.settlementChanged();render();note(`Импорт объектов: ${res.added} добавлено, ${res.rejected} пропущено.`,res.added?'good':'bad');}catch(err){note('Ошибка импорта домов: '+err.message,'bad')}finally{e.target.value=''}});
world3d.onSettlementClick=(x,z)=>settlementAt(x,z);

world3d.onEditStart=()=>editMark();world3d.onEditEnd=()=>{st.analysis=null;render()};world3d.onBridgeSelect=id=>{st.selected={kind:'node',id};renderInspector()};
$('theme-toggle').textContent=theme==='dark'?'☾ Тёмная':'☼ Светлая';
root.addEventListener('keydown',e=>{if(e.key==='Escape'){st.pending=null;st.selected=null;render()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}});
if(typeof ResizeObserver!=='undefined'){new ResizeObserver(draw).observe(canvas);new ResizeObserver(()=>world3d.render(worldPayload(),false)).observe(world3d.canvas)}
// 10.3 regional atlas is independent of fixed-size 3D bridge and project JSON.
// Large GIS databases remain in the selected external tiles directory.
const atlas=new RegionAtlas({overlay:$('atlas-overlay'),canvas:$('atlas-stage'),status:$('atlas-status'),
 geoPack:world3d.geoPack,onLocal3D:(fc)=>{
  if(fc.features.length>12000)throw Error('Слишком много объектов для локального 3D (макс. 12 000)');
  const result=world3d.loadCityGeoJSON(fc);
  world3d.cityEnabled=true;st.track='bridge';st.idx=BRIDGES.findIndex(b=>b.id==='kerch');
  st.model=makeBridge(BRIDGES[st.idx]);world3d.start(worldPayload());
  st.view='3d';world3d.sceneDirty=true;world3d.cityEnabled=true;render();
  note(`RegionStream: в 3D передано ${result.buildings} зданий и ${result.roads+result.rails} сегментов. Геометрия остального региона остаётся в 2D.`, 'good');
 }});
// 10.4: HTML has local GIS demo tiles; no Python, external file or network needed.
const regionDemoFiles=new Map(Object.entries(BUNDLED_REGION_DEMO.tiles));
atlas.store.setManifest(BUNDLED_REGION_DEMO.index,{inline:regionDemoFiles,mode:'Встроенное ДЕМО (синтетические здания и дороги)'});
const region3d=new Region3D({overlay:$('region3d-overlay'),canvas:$('region3d-stage'),status:$('region3d-status'),store:atlas.store,geoPack:world3d.geoPack,backToAtlas:()=>{atlas.open()}});
$('atlas-open').addEventListener('click',()=>{region3d.close();atlas.geoPack=world3d.geoPack;atlas.background=null;atlas.open()});
$('region3d-open').addEventListener('click',()=>{atlas.close();region3d.geoPack=world3d.geoPack;region3d.open()});
$('atlas-region3d').addEventListener('click',()=>{const g=mercatorUnproject(atlas.center.x,atlas.center.y);atlas.close();region3d.geoPack=world3d.geoPack;region3d.open(g.lat,g.lon)});
$('region3d-overlay').querySelectorAll('[data-region-move]').forEach(b=>{
 const code=b.dataset.regionMove;
 b.addEventListener('pointerdown',e=>{e.preventDefault();region3d.keys[code]=true;b.setPointerCapture?.(e.pointerId)});
 for(const type of ['pointerup','pointercancel','lostpointercapture','pointerleave'])b.addEventListener(type,()=>{region3d.keys[code]=false});
});
const gpuLabel=$('atlas-capabilities');gpuLabel.textContent=(typeof navigator!=='undefined'&&navigator.gpu?'WebGPU обнаружен, но пока не используется':'WebGPU недоступен / не подключён')+' · действующий 3D — WebGL';

// Animation is only a visual magnification of the static linear solution; not time integration.
let last=0;function tick(t){if(atlas.active||region3d.active){requestAnimationFrame(tick);return;}if(st.view==='3d'){
 world3d.tick(t);
 if(t-last>120){let P=world3d.camPos,elem=$('camera-hud');if(elem)elem.textContent='FREECAM · GPS≈ '+formatLocation(P[0],P[2])+' · '+world3d.getRegionName(P[0])+' · выс. '+P[1].toFixed(1)+' · '+(world3d.stats.fps||'—')+' FPS · '+Math.round((world3d.stats.triangles||0)/1000)+'K △ · ТАЙЛЫ '+world3d.chunksVisible+'/'+world3d.chunkCache.size+' · ТРАФИК '+world3d.trafficUpdates+(world3d.software?' · CPU':world3d.shadowsEnabled?' · ТЕНИ':' · БЕЗ ТЕНЕЙ');drawMinimap();last=t}
 }else if(st.analysis&&st.track==='bridge'&&t-last>80){draw();last=t}
 requestAnimationFrame(tick)}requestAnimationFrame(tick);
function drawMinimap(){let c=$('minimap');if(!c||st.view!=='3d'||!world3d.map)return;let g=c.getContext('2d'),W=c.width,H=c.height,S=world3d.worldSize||220,half=S/2,bounds=world3d.kerchBounds?world3d.kerchBounds():{x0:-102,x1:102};let bg=g.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#214f66');bg.addColorStop(1,'#2d7488');g.fillStyle=bg;g.fillRect(0,0,W,H);
 for(let iy=0;iy<32;iy++)for(let ix=0;ix<64;ix++){let x=-half+S*ix/64,z=-half+S*iy/32;let v=world3d.mapHeight(x,z);if(v>-1.49){g.fillStyle=v>.3?'#77976c':'#bbab7d';g.fillRect(ix*W/64,iy*H/32,W/64+1,H/32+1)}}
 g.strokeStyle='#e6c891';g.lineWidth=1.8;g.beginPath();for(let i=0;i<=120;i++){let x=bounds.x0+i*(bounds.x1-bounds.x0)/120,z=world3d.trackCenter(x,bounds.roadSide);let X=(x+half)/S*W,Y=(z+half)/S*H;if(i===0)g.moveTo(X,Y);else g.lineTo(X,Y)}g.stroke();
 g.strokeStyle='#b3dce5';g.lineWidth=1.2;g.beginPath();for(let i=0;i<=120;i++){let x=bounds.x0+i*(bounds.x1-bounds.x0)/120,z=world3d.trackCenter(x,bounds.railSide);let X=(x+half)/S*W,Y=(z+half)/S*H;if(i===0)g.moveTo(X,Y);else g.lineTo(X,Y)}g.stroke();let tt=performance.now()*.001;for(let i=0;i<8;i++){let xf=bounds.x0+10+((tt*10.5+i*18)%(bounds.x1-bounds.x0-20)),zf=world3d.kerchCenter(xf)+bounds.roadSide+(i%2?1.2:-1.2),px=(xf+half)/S*W,py=(zf+half)/S*H;g.fillStyle=i%2?'#ffcf89':'#e8f2f6';g.fillRect(px-1.5,py-1.5,3,3)}let X=(world3d.camPos[0]+half)/S*W,Y=(world3d.camPos[2]+half)/S*H;g.fillStyle='#ffbc6e';g.beginPath();g.arc(X,Y,4.5,0,7);g.fill();g.strokeStyle='#fff';g.stroke();
 g.font='10px system-ui';g.fillStyle='#eaf7ef';g.fillText('КЕРЧЬ',7,11);g.fillText('ТУЗЛА',W/2-18,11);g.fillText('ТАМАНЬ',W-58,11);
}
$('lighting').addEventListener('change',e=>{
 const hours={day:13,sunset:18.3,night:22};world3d.setSunHour(hours[e.target.value]??13);
 $('sun-hour').value=String(world3d.sunHour);$('sun-hour-value').textContent=world3d.sunHour.toFixed(1)+' ч';
 world3d.render(worldPayload(),false);
});
$('sun-hour').addEventListener('input',e=>{
 world3d.setSunHour(Number(e.target.value));$('lighting').value=world3d.daylight;
 $('sun-hour-value').textContent=world3d.sunHour.toFixed(1)+' ч';world3d.render(worldPayload(),false);
});
$('shadows-toggle').addEventListener('click',e=>{
 world3d.shadowsEnabled=!world3d.shadowsEnabled;world3d.shadowDirty=true;
 e.target.textContent='◐ Тени: '+(world3d.shadowsEnabled?'ВКЛ':'ВЫКЛ');world3d.render(worldPayload(),false);
});
$('exposure').addEventListener('input',e=>{
 world3d.exposure=Number(e.target.value)/100;
 $('exposure-value').textContent=e.target.value+'%';world3d.render(worldPayload(),false);
});
$('lamps-toggle').addEventListener('click',e=>{
 world3d.lampsEnabled=!world3d.lampsEnabled;e.target.textContent='◉ Фонари: '+(world3d.lampsEnabled?'ВКЛ':'ВЫКЛ');world3d.render(worldPayload(),false);
});
$('traffic-toggle').textContent=world3d.trafficEnabled?'🚦 Трафик: ВКЛ':'⏸ Трафик: ПАУЗА';$('traffic-toggle').setAttribute('aria-pressed',String(world3d.trafficEnabled));
$('traffic-toggle').addEventListener('click',()=>{world3d.setTrafficEnabled(!world3d.trafficEnabled);$('traffic-toggle').textContent=world3d.trafficEnabled?'🚦 Трафик: ВКЛ':'⏸ Трафик: ПАУЗА';$('traffic-toggle').setAttribute('aria-pressed',String(world3d.trafficEnabled));note(world3d.trafficEnabled?'Динамический трафик включён (отдельный GPU-буфер).':'Трафик полностью остановлен; декоративных неподвижных моделей нет.','good')});
$('graphics-quality').addEventListener('change',e=>{world3d.quality=e.target.value;world3d.sceneDirty=true;world3d.coastDirty=true;world3d.render(worldPayload(),true);try{localStorage.setItem('trusslab-quality-v8',world3d.quality)}catch(_){}note('Графика: '+world3d.quality.toUpperCase()+' — переключение профиля выполнено.','good')});
$('render-scale').addEventListener('input',e=>{world3d.resolutionScale=Number(e.target.value)/100;$('render-scale-value').textContent=e.target.value+'%';world3d.render(worldPayload(),false)});
$('satellite-toggle').addEventListener('click',()=>{$('satellite-overlay').hidden=!$('satellite-overlay').hidden});

function syncGeoControls(){
 const mode=world3d.coastMode;
 $('route-geo-fit').disabled=!world3d.geoPack?.coast||!world3d.map||!!world3d.geoRoute;
 $('route-geo-fit').textContent=coastFitPreview?.ok?'✓ Применить подходы':'⇤⇥ Подходы к берегам';
 $('coast-source').textContent=mode==='osm'?'◉ Берег: OSM':mode==='gshhg'?'◉ Берег: GSHHG':'◉ Берег: снимки';
 $('dem-toggle').disabled=!world3d.geoPack?.dem;
 $('dem-toggle').textContent=world3d.demEnabled?'⛰ DEM: вкл':world3d.geoPack?.dem?'⛰ DEM: выкл':'⛰ DEM: нет';
 $('geopack-clear').style.display=world3d.geoPack?'':'none';
 $('route-geo-clear').style.display=world3d.geoRoute?'':'none';
 $('route-geo-import').disabled=!world3d.map;
 const mapInfo=$('map-legend')?.querySelector('small');if(mapInfo)mapInfo.textContent=(world3d.geoPack?.coast?'OSM coast / ':'условный берег / ')+(world3d.demEnabled?'GLO-30 DSM / ':'высоты условные / ')+(world3d.geoRoute?'WGS84 ось загружена':'ось условная')+' · WGS84≈';
}
$('geopack-import').addEventListener('click',()=>$('geopack-file').click());
$('geopack-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>5*1024*1024)throw Error('GeoPack больше 5 МБ: используйте размер сетки 512 из утилиты подготовки.');
  const value=JSON.parse(await file.text());
  const result=world3d.loadGeoPack(value);coastFitPreview=null;syncGeoControls();world3d.render(worldPayload(),true);draw();
  note(`Геоданные приняты: ${result.grid}×${result.grid}; OSM ${result.osm?'да':'нет'}; DEM ${result.dem?'да':'нет'}. Данные используют приблизительную калибровку WGS84.`, 'good');
 }catch(err){note('Ошибка GeoPack: '+err.message,'bad')}
 finally{e.target.value=''}
});
$('dem-toggle').addEventListener('click',()=>{
 if(!world3d.setDEMEnabled(!world3d.demEnabled))return;
 syncGeoControls();world3d.render(worldPayload(),true);draw();
 note(world3d.demEnabled?'Включены импортированные высоты DSM/DEM (показаны с вертикальным преувеличением).' :'Реальные высоты выключены; снова используется процедурная поверхность.','good');
});
$('geopack-clear').addEventListener('click',()=>{
 world3d.clearGeoPack();coastFitPreview=null;syncGeoControls();world3d.render(worldPayload(),true);draw();
 note('Внешние геоданные удалены из текущей сцены.','good');
});
syncGeoControls();
$('route-geo-import').addEventListener('click',()=>$('route-geo-file').click());
$('route-geo-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>2*1024*1024)throw Error('Файл GeoJSON маршрута больше 2 МБ. Выделите только мостовые линии.');
  const data=JSON.parse(await file.text()),info=world3d.loadRouteGeoJSON(data);coastFitPreview=null;
  syncGeoControls();world3d.render(worldPayload(),true);draw();
  note(`Привязка оси: ${info.roles.join(' + ')}, покрытие ≈${(info.width/1000).toFixed(1)} км. Координаты WGS84, но калибровка сцены предварительная.`, 'good');
 }catch(err){note('Маршрут GeoJSON: '+err.message,'bad')}finally{e.target.value=''}
});
$('route-geo-clear').addEventListener('click',()=>{
 world3d.clearRouteGeoJSON();coastFitPreview=null;syncGeoControls();world3d.render(worldPayload(),true);draw();
 note('Внешние оси дороги/жд отключены, восстановлена условная трасса.','good');
});
$('route-fit-confirm').addEventListener('click',()=>{ $('route-geo-fit').click(); });
$('route-fit-confirm-bottom').addEventListener('click',()=>{ $('route-geo-fit').click(); });
$('route-fit-cancel').addEventListener('click',()=>{coastFitPreview=null;syncGeoControls();render();note('Подгонка отменена — мост и GeoPack не изменены.');});
$('route-fit-cancel-bottom').addEventListener('click',()=>{ $('route-fit-cancel').click(); });
$('route-geo-fit').addEventListener('click',()=>{
 if(coastFitPreview?.ok){
  const before=world3d.kerchBounds(),saved={...coastFitPreview};
  // Validate BEFORE snapshot so a failed confirmation doesn't pollute undo.
  const current=world3d.proposeCoastalExtensions();
  if(!current.ok||Math.abs(current.x0-saved.x0)>.51||Math.abs(current.x1-saved.x1)>.51){
   coastFitPreview=null;syncGeoControls();note('Геоданные или ось изменились: создайте новый предпросмотр.','bad');return;
  }
  editMark();
  if(!world3d.applyCoastalExtensions(saved)){
   st.hist.pop();coastFitPreview=null;syncGeoControls();note('Не удалось применить подгонку.','bad');return;
  }
  coastFitPreview=null;routeDiagnosticVisible=true;syncGeoControls();
  st.view='2d';st.planMode='map';render();
  const after=world3d.kerchBounds(),diag=world3d.routeCoastDiagnostics();
  const land=Object.values(diag.tracks).every(v=>v.startLand&&v.endLand);
  note(`Подходы продлены по GeoPack: Керчь ${((before.x0-after.x0)*.08).toFixed(2)} км; Тамань ${((after.x1-before.x1)*.08).toFixed(2)} км. Условная ось ≈${world3d.routeLengthKm().toFixed(2)} км. Концы на суше: ${land?'ДА':'требуется проверка'}. Отмена: Ctrl+Z. Это игровая подгонка, НЕ геодезическая съёмка.`,land?'good':'bad');return;
 }
 const proposal=world3d.proposeCoastalExtensions();
 if(!proposal.ok){note('Предпросмотр: '+proposal.reason,'bad');return;}
 coastFitPreview=proposal;routeDiagnosticVisible=true;syncGeoControls();
 st.view='2d';st.planMode='map';render();
 note(`ПРЕДПРОСМОТР: продлить крымский подход на ${proposal.left.extensionKm.toFixed(2)} км, таманский на ${proposal.right.extensionKm.toFixed(2)} км. Жёлтые штрихи показаны на карте. Нажмите «✓ Применить подходы» повторно. Это не геодезическая калибровка.`);
});
$('route-geo-check').addEventListener('click',()=>{
 const result=world3d.routeCoastDiagnostics({detail:true});if(!result.ok){note(result.reason,'bad');return;}
 routeDiagnosticVisible=true;
 const a=result.tracks.road,b=result.tracks.rail;
 const explain=s=>s.validSamples===0?'вне карты':s.landSamples===0?'ВСЯ ОСЬ В ВОДЕ':s.waterSamples===0?'вся ось на суше':`${s.landPercent}% по суше, ${s.shoreCrossings} пересеч.`;
 const nearest=s=>{
  const places=[];
  if(s.nearestLandStart)places.push(`от начала до суши ≈${s.nearestLandStart.km} км`);
  if(s.nearestLandEnd)places.push(`от конца до суши ≈${s.nearestLandEnd.km} км`);
  return places.length?' ('+places.join('; ')+')':'';
 };
 const issue=a.landSamples===0||b.landSamples===0||a.outsideSamples>0||b.outsideSamples>0;
 st.view='2d';st.planMode='map';
 render();
 note(`ПЛАН ОТКРЫТ: по всему GeoPack суша ${result.globalLandPercent}%. Авто: ${explain(a)}${nearest(a)}. Ж/д: ${explain(b)}${nearest(b)}. ${world3d.geoRoute?'Проверяется импортированная ось GeoJSON.':'Ось моста пока УСЛОВНАЯ и не совмещена с OSM. Перетащи крайние точки в режиме «Править трассу» или импортируй оси GeoJSON.'} Это не геодезическая проверка.`,issue?'bad':'good');
});
$('route-geo-export').addEventListener('click',()=>{
 const data=world3d.exportRouteGeoJSON(),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='TrussLab_Route_Approximate_9_4.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 note('Оси сохранены как GeoJSON WGS84. Привязка предварительная, не съёмка.','good');
});
$('gis-import').addEventListener('click',()=>$('gis-file').click());
$('gis-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>6*1024*1024)throw Error('Файл больше 6 МБ — сначала упростите геометрию в QGIS');
  const value=JSON.parse(await file.text());
  const result=world3d.loadGeoJSON(value);
  world3d.render(worldPayload(),true);
  note(`GIS: загружено ${result.polygons} полигонов / ${result.points} точек. Геометрия WGS84 применена к 2D и 3D.`, 'good');
 }catch(err){note('Ошибка GIS-импорта: '+err.message,'bad')}
 finally{e.target.value=''}
});
$('close-satellite').addEventListener('click',()=>{$('satellite-overlay').hidden=true});
try{let savedQuality=localStorage.getItem('trusslab-quality-v8');if(['ultra','high','medium','low'].includes(savedQuality)){world3d.quality=savedQuality;$('graphics-quality').value=savedQuality;world3d.sceneDirty=true;world3d.render(worldPayload(),true)}}catch(_){};


for(const [id,key] of [['road-ramp','roadRamp'],['rail-ramp','railRamp'],['arch-level','archDeckLevel']]){
 const el=$(id);el.addEventListener('pointerdown',()=>editMark());
 el.addEventListener('input',()=>{world3d[key]=Number(el.value);world3d.invalidateTerrain();syncGradeControls();if(st.view==='3d')syncWorld(true);else draw();});
 el.addEventListener('change',()=>{note('Продольный профиль обновлён в 2D и 3D. Параметры условные, не проектные.','good');});
}
$('reset-crossing-grade').addEventListener('click',()=>{editMark();applyCrossingSettings({roadRamp:22,railRamp:58,archDeckLevel:7.35});render();note('Исходный профиль подходов восстановлен.');});
setScenario(1);
try{let saved=JSON.parse(localStorage.getItem('trusslab-studio-project'));if(saved?.version===2&&saved.model?.nodes&&saved.foundation?.soil){st.track=saved.track==='foundation'?'foundation':'bridge';st.idx=Math.max(0,Math.min((st.track==='bridge'?BRIDGES:FOUNDATION_LEVELS).length-1,Number(saved.idx)||0));st.model=saved.model;st.foundation=saved.foundation;note('Сохранённый проект из браузера загружен.');render()}}catch(err){}
