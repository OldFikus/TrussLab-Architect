/* NatureWorld 16.0–16.9 interactive sandbox plugin.
   It never paints invented biodiversity onto the historical Kerch GeoPack. */
(function(){'use strict';
if(typeof document==='undefined'||!globalThis.TrussLabNatureCore||!globalThis.TrussLabWorldVisual||!globalThis.TrussLabWorldVisualCore||typeof region3d==='undefined')return;
const {NatureWorld,BUDGETS,clamp}=globalThis.TrussLabNatureCore;
const terrain=globalThis.TrussLabWorldVisual,vis=globalThis.TrussLabWorldVisualCore,model=new NatureWorld(),editor=globalThis.trusslabEditor;
const $=id=>document.getElementById(id);
if(window.innerWidth<=700)model.setQuality('eco');
const holder=document.createElement('details');holder.id='nw-panel';holder.innerHTML=`<summary>🌲 NatureWorld 16.0–16.9 · ландшафт и погода</summary>
<p class="nw-precise">Биомы и растительность рассчитаны процедурно <b>только для вымышленной карты 12×12 км</b>. Почвы — игровые эвристики, не геологическая съёмка.</p>
<div class="nw-grid">
<label>Сезон<select id="nw-month"><option value="1">❄ Январь</option><option value="4">🌱 Апрель</option><option value="6" selected>🌿 Июнь</option><option value="10">🍂 Октябрь</option></select></label>
<label>Время суток <input id="nw-hour" type="range" min="0" max="23" step="1" value="13"><output id="nw-hour-label">13:00</output></label>
<label>Растительность<select id="nw-quality"><option value="eco">Эко: 70 деревьев</option><option value="balanced" selected>Баланс: 230</option><option value="high">Высоко: 540</option></select></label>
<label>Погодный фронт <select id="nw-weather"><option value="clear">Ясно</option><option value="cloud">Облачно</option><option value="rain" selected>Дождь</option><option value="storm">Гроза</option><option value="snow">Снег (зима)</option></select></label>
</div>
<div class="nw-opts"><label><input type="checkbox" id="nw-vegetation" checked> Деревья и трава</label><label><input type="checkbox" id="nw-particles" checked> Частицы осадков</label></div>
<div class="nw-buttons"><button id="nw-advance">+6 часов</button><button id="nw-forecast">⌁ Фронт на карте</button><button id="nw-eco">🔎 Почва здесь</button></div>
<div class="nw-water"><b>16.6 · Водоёмы отдельным слоем</b><div class="nw-grid"><label>Радиус озера, м<input id="nw-lake-radius" type="number" min="20" max="1000" value="95"></label><label>Ширина реки, м<input id="nw-river-width" type="number" min="5" max="120" value="26"></label></div>
<div class="nw-buttons"><button id="nw-lake">◯ Озеро — 3D</button><button id="nw-river">≈ Река — 2 точки</button><button id="nw-sea">≋ Море — 3D</button><button id="nw-cancel">× Отмена</button></div><button id="nw-clear-water">Очистить учебные водоёмы</button></div>
<div id="nw-hud">Готово к созданию экологических тайлов.</div><div id="nw-note" role="status" aria-live="polite">Выберите вымышленную карту через WorldStream, чтобы включить биомы и растительность.</div>`;
const panel=$('wv-panel');if(!panel)return;panel.insertAdjacentElement('afterend',holder);$('nw-quality').value=model.quality;
const effects=document.createElement('canvas');effects.id='nw-overlay';effects.setAttribute('aria-hidden','true');effects.style.pointerEvents='none';$('region3d-overlay').appendChild(effects);
let vegetationBuffers=[],waterBuffer=null,buildKey='',waterKey='',lastBuildAt=0,lastWeatherAt=0,lastFXAt=0,drawTime=0,pointer=null,tool=null,start=null,lastWeatherMode='rain',lastError=null,infraPreviousWeather=null;
const release=entry=>{if(!entry)return;try{if(region3d.gl&&entry.buffer)region3d.gl.deleteBuffer(entry.buffer);region3d.webgpu?.release?.(entry)}catch(_){}};
function dispose(){for(const t of vegetationBuffers)release(t);vegetationBuffers=[];release(waterBuffer);waterBuffer=null;buildKey='';waterKey='';model.stats.trees=0;model.stats.grass=0;model.stats.bytes=0;}
function pointFromHit(hit){if(!hit)return null;const geo=geographicToMetric(hit.lat,hit.lon);return [geo.x,geo.z];}
function sampleGround(x,z){const g=metricGround(region3d.geoPack,x,z);if(!g||!g.measured)return null;
 if(!editor.terrain.length)return g;
 const geo=metricToGeographic(x,z),loc=editor.local(geo.lat,geo.lon);
 return {...g,height:g.height+editor.terrainOffset(loc[0],loc[1])};}
function builtAtRegion(){const objects=[];
 for(const o of editor.objects){if(o.type!=='building'||!Number.isFinite(o.x)||!Number.isFinite(o.z))continue;
  const geo=editor.geographic(o.x,o.z),metric=geographicToMetric(geo[1],geo[0]);
  if(Math.abs(metric.x-region3d.cam.x)>2000||Math.abs(metric.z-region3d.cam.z)>2000)continue;
  objects.push({wx:metric.x,wz:metric.z,width:o.width||20,length:o.length||15});
 }return objects;
}
function createBatch(){return new vis.MeshBatch(Math.floor(region3d.cam.x/2400)*2400,Math.floor(region3d.cam.z/2400)*2400);}
function flushNature(force=false){
 if(!terrain.region.sandbox){if(vegetationBuffers.length||waterBuffer)dispose();return;}
 const now=performance.now(),cam=region3d.cam,q=BUDGETS[model.quality],key=[Math.floor(cam.x/200),Math.floor(cam.z/200),model.quality,model.season,model.vegetation,editor.revision,terrain.region.preset].join(':');
 if(force||key!==buildKey){
  if(!force&&now-lastBuildAt<230)return;
  const startAt=performance.now();for(const t of vegetationBuffers)release(t);vegetationBuffers=[];
  if(!model.vegetation){model.stats.trees=0;model.stats.grass=0;model.stats.triangles=0;model.stats.bytes=0;}
  if(model.vegetation){const trees=model.vegetationNear(cam.x,cam.z,sampleGround,{limit:q.trees,range:q.range,editorObjects:builtAtRegion()});
   const batch=createBatch();model.geometryFor(trees,{ground:sampleGround,meshBatch:batch,cam:[cam.x,cam.z],budget:q});
   if(batch.data.length)vegetationBuffers.push(region3d.gl?region3d._makeBuffer(batch.finalize('NatureWorld vegetation',2400)):batch.finalize('NatureWorld vegetation',2400));
  }
  buildKey=key;lastBuildAt=now;model.stats.lastVegetationMs=Math.round((now-startAt)*100)/100;
 }
 const bodyKey=[model.waterBodies.map(o=>JSON.stringify(o)).join('|'),terrain.region.preset,editor.revision].join(':');
 if(force||bodyKey!==waterKey){release(waterBuffer);waterBuffer=null;
  if(model.waterBodies.length){const batch=createBatch();model.waterGeometry(batch,sampleGround);
   if(batch.data.length)waterBuffer=region3d.gl?region3d._makeBuffer(batch.finalize('NatureWorld water',2400)):batch.finalize('NatureWorld water',2400);
  }waterKey=bodyKey;
 }
}
const prevStream=region3d._stream.bind(region3d);
region3d._stream=function(){prevStream();
 if(!this.active)return;
 try{flushNature();for(const e of vegetationBuffers)this.visibleModels.push(e);if(waterBuffer)this.visibleModels.push(waterBuffer);
  if(performance.now()-lastWeatherAt>1250){lastWeatherAt=performance.now();showStats();}
 }catch(err){lastError=err.message;const n=$('nw-note');if(n)n.textContent='NatureWorld: '+err.message;}
};
const oldTrafficPlan=vis.vehiclePlan;
vis.vehiclePlan=function(paths,cam,opts={}){const slow=terrain.region.sandbox?model.transportEffects(cam[0],cam[1]).road:1;return oldTrafficPlan(paths,cam,{...opts,slow:(opts.slow??1)*slow});};
function syncLighting(){if(!terrain.region.sandbox)return;region3d.day=model.light().phase;const btn=$('region3d-light');if(btn)btn.textContent=({'day':'Свет: день','night':'Свет: ночь','sunset':'Свет: закат'})[region3d.day]||'Свет: день';}
function syncInfra(){const infra=globalThis.trusslabInfraSim;if(!infra?.setWeather)return;
 if(!terrain.region.sandbox){if(infraPreviousWeather){try{infra.setWeather(infraPreviousWeather)}catch(_){}infraPreviousWeather=null;}return;}
 if(!infraPreviousWeather)infraPreviousWeather={...infra.weather};
 const w=model.weatherAt(region3d.cam.x,region3d.cam.z);try{infra.setWeather({rain:w.precipitation,fog:w.fog,windMps:w.windMps,temperatureC:w.temperatureC,night:w.night});}catch(_){}
}
function showStats(){const status=$('nw-hud');if(!status)return;const cam=region3d.cam,w=model.weatherAt(cam.x,cam.z),q=BUDGETS[model.quality],s=model.stats;
 status.textContent=`🌳 ${s.trees}/${q.trees} деревьев · ${s.grass}/${q.grasses} трав · ~${(s.bytes/1048576).toFixed(2)}/${(q.bytes/1048576).toFixed(1)} МиБ · ${s.triangles} △ · ${s.lastVegetationMs} мс · ${model.season} · ${Math.round(w.windMps)} м/с · дождь ${(w.precipitation*100).toFixed(0)}% · видимость ${w.visibilityM} м`;
}
function note(s){$('nw-note').textContent=s;}
function setWeatherMode(mode){lastWeatherMode=mode;model.weatherMode=mode;const front=model.fronts[0],cam=region3d.cam;front.x=cam.x;front.z=cam.z;front.radius=2500;
 const configs={clear:[0,.10,.2],cloud:[0,.8,.7],rain:[.65,.85,1.1],storm:[.98,1,2.1],snow:[.55,.8,.8]};
 const [rain,cloud,wind]=configs[mode]||configs.clear;
 front.precipitation=rain;front.cloud=cloud;front.windX=wind;front.windZ=wind*.33;
 if(mode==='snow')model.setSeason(1);$('nw-month').value=String(model.month);
 syncLighting();syncInfra();showStats();note('16.3 · Учебный фронт обновлён: '+mode+'. Осадки и видимость зависят от расположения и времени.');
}
function requireSandbox(){if(!terrain.region.sandbox){note('Сперва выберите «Новая карта 12×12 км» в WorldStream. GeoPack Керчи не изменяется.');return false;}return true;}
function cast(e){const r=region3d.canvas.getBoundingClientRect(),hit=globalThis.TrussLabCityWorld?.makeHit?.((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);return pointFromHit(hit);}
region3d.canvas.addEventListener('pointerdown',e=>{if(tool&&region3d.active&&e.button===0)pointer={x:e.clientX,y:e.clientY,id:e.pointerId,moved:false};},true);
region3d.canvas.addEventListener('pointermove',e=>{if(pointer&&pointer.id===e.pointerId&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>7)pointer.moved=true;},true);
region3d.canvas.addEventListener('pointerup',e=>{if(!tool||!pointer||pointer.id!==e.pointerId)return;const click=!pointer.moved;pointer=null;if(!click||!region3d.active||!requireSandbox())return;
 e.stopImmediatePropagation();const point=cast(e);if(!point){note('Наведите камеру на местность, затем нажмите ещё раз.');return;}
 try{if(tool==='lake'||tool==='sea'){if(tool==='lake')model.addLake(point[0],point[1],clamp(Number($('nw-lake-radius').value)||95,20,1000));else model.addSea(point[0],point[1],Math.max(100,clamp(Number($('nw-lake-radius').value)||95,20,1000)*4));tool=null;note('Водоём добавлен отдельным графическим слоем; он не вырезает реальный рельеф.');}
  else if(tool==='river'){if(!start){start=point;note('Начало русла задано. Нажмите второй раз на местность.');return;}model.addRiver([start,point],{width:clamp(Number($('nw-river-width').value)||26,5,120)});tool=null;start=null;note('Создано игровое русло с волнами и отдельным материалом воды.');}
  flushNature(true);
 }catch(err){note(err.message)}},true);
region3d.canvas.addEventListener('pointercancel',()=>pointer=null,true);
holder.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 try{switch(b.id){
 case 'nw-advance':model.advanceHours(6);$('nw-hour').value=Math.floor(model.hour);$('nw-hour-label').value=String(Math.floor(model.hour)).padStart(2,'0')+':00';$('nw-month').value=String(model.month);syncLighting();syncInfra();flushNature(true);showStats();note('Прошло шесть игровых часов.');break;
 case 'nw-forecast':if(!requireSandbox())return;model.addFront(region3d.cam.x+500,region3d.cam.z-260,{radius:1300,precipitation:.65,cloud:.8});syncInfra();note('Фронт добавлен. Направление движения влияет на локальную погоду.');break;
 case 'nw-eco':{if(!requireSandbox())return;const f=region3d.forward(),x=region3d.cam.x+f[0]*250,z=region3d.cam.z+f[2]*250;const site=model.soilAt(x,z,sampleGround);note('16.1 · Грунт: '+site.type+' · биом: '+site.biome+' · уклон: '+(site.slope*100).toFixed(1)+'%. Данные процедурные, НЕ инженерно-геологические.');break;}
 case 'nw-lake':case 'nw-river':case 'nw-sea':if(!requireSandbox())return;tool=b.id==='nw-lake'?'lake':b.id==='nw-sea'?'sea':'river';start=null;globalThis.TrussLabCityWorld?.switchTool?.('camera');$('csp-endline')?.click();note(tool==='lake'?'Нажмите точку в 3D для озера.':tool==='sea'?'Нажмите точку в 3D для условного морского слоя.':'Две точки в 3D зададут игровое русло.');break;
 case 'nw-cancel':tool=null;start=null;note('Инструмент природы отменён.');break;
 case 'nw-clear-water':model.waterBodies=[];flushNature(true);note('Учебные водоёмы очищены.');break;
 }}catch(err){note('NatureWorld: '+err.message)}});
holder.addEventListener('change',e=>{const t=e.target;try{switch(t.id){
 case 'nw-month':model.setSeason(Number(t.value));syncLighting();syncInfra();flushNature(true);break;
 case 'nw-hour':model.setHour(Number(t.value));$('nw-hour-label').value=String(Math.floor(model.hour)).padStart(2,'0')+':00';syncLighting();syncInfra();break;
 case 'nw-quality':model.setQuality(t.value);flushNature(true);break;
 case 'nw-weather':setWeatherMode(t.value);break;
 case 'nw-vegetation':model.vegetation=t.checked;flushNature(true);break;
 case 'nw-particles':model.precipitation=t.checked;break;
 }}catch(err){note(err.message)}showStats();});
holder.addEventListener('input',e=>{if(e.target.id==='nw-hour')$('nw-hour-label').value=String(e.target.value).padStart(2,'0')+':00';});
$('wv-kerch')?.addEventListener('click',()=>{syncInfra();effects.hidden=true;});
$('wv-sandbox')?.addEventListener('click',()=>{syncLighting();syncInfra();});
function drawFX(t){if(t-drawTime<95)return;drawTime=t;
 if(!terrain.region.sandbox||!region3d.active||!model.precipitation){effects.hidden=true;return;}effects.hidden=false;
 const c=region3d.canvas,rect=c.getBoundingClientRect(),dpr=Math.min(1.5,devicePixelRatio||1);
 if(rect.width<2||rect.height<2)return;
 effects.style.left=c.offsetLeft+'px';effects.style.top=c.offsetTop+'px';effects.style.width=rect.width+'px';effects.style.height=rect.height+'px';const W=Math.max(1,Math.round(rect.width*dpr)),H=Math.max(1,Math.round(rect.height*dpr));if(effects.width!==W||effects.height!==H){effects.width=W;effects.height=H;}
 const ctx=effects.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);const w=model.weatherAt(region3d.cam.x,region3d.cam.z);
 if(w.cloud>.35){ctx.fillStyle=`rgba(31,47,58,${(w.cloud-.35)*.17})`;ctx.fillRect(0,0,rect.width,rect.height);}
 if(w.fog>.12){const gradient=ctx.createLinearGradient(0,rect.height*.35,0,rect.height);gradient.addColorStop(0,'rgba(172,185,197,0)');gradient.addColorStop(1,`rgba(172,185,197,${Math.min(.45,w.fog*.38)})`);ctx.fillStyle=gradient;ctx.fillRect(0,0,rect.width,rect.height);}
 const precipitation=w.rain+w.snow;if(precipitation>.03){const count=Math.min(180,Math.floor(precipitation*160)),snow=w.snow>0,offset=t*.055;
  ctx.strokeStyle=snow?'rgba(236,247,255,.65)':'rgba(163,204,239,.35)';ctx.lineWidth=snow?2:1;
  for(let k=0;k<count;k++){const x=(k*97.13+offset*(snow?.2:.7))%(rect.width+28)-14,y=(k*139.71+offset*(snow?.3:1.9))%(rect.height+28)-14;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(snow?1.5:4),y+(snow?2:11));ctx.stroke();}
 }
}
function animate(t){try{drawFX(t)}catch(_){effects.hidden=true}requestAnimationFrame(animate);}requestAnimationFrame(animate);
// Serialization integration is added in the build source itself (CitySim's
// closures call makeProject() directly), not by replacing exported methods.
function reset(){model.import(new NatureWorld().export());dispose();syncLighting();}
function importState(data){const before=model.export();try{if(data)model.import(data);else reset();dispose();syncLighting();syncInfra();$('nw-quality').value=model.quality;$('nw-weather').value=model.weatherMode;$('nw-month').value=String(model.month);$('nw-hour').value=String(Math.floor(model.hour));$('nw-hour-label').value=String(Math.floor(model.hour)).padStart(2,'0')+':00';$('nw-vegetation').checked=model.vegetation;$('nw-particles').checked=model.precipitation;showStats();}catch(err){model.import(before);throw err;}}
function exportState(){return model.export();}
globalThis.TrussLabNature={model,core:globalThis.TrussLabNatureCore,export:exportState,import:importState,reset,flush:flushNature,syncLighting,syncInfra,showStats,dispose};
})();
