/* CitySim 15.2–15.9 UI: an in-world overlay, 3D route/incident markers,
 * large project persistence. Uses the existing WorldMap 3D and WorldEditor,
 * never a separate artificial 2D mini-game. */
(function(){'use strict';
if(typeof document==='undefined'||!globalThis.TrussLabCitySystems||!globalThis.TrussLabCityWorld||typeof region3d==='undefined')return;
const world=globalThis.TrussLabCityWorld,editor=world.editor,base=world.core,$=id=>document.getElementById(id);
const systems=new globalThis.TrussLabCitySystems(editor,base);
globalThis.trusslabCitySystems=systems;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:1});
const percent=n=>Math.round((Number(n)||0)*100)+'%';
const panel=$('citysim-controls');if(!panel)return;
const body=$('cs-body');if(!body)return;
const plus=document.createElement('details');plus.id='csplus';plus.open=window.innerWidth>700;
plus.innerHTML=`
 <summary>15.2–15.9 · Городские системы <span id="csplus-alert">◉</span></summary>
 <div id="csplus-content">
  <div class="csp-tabs" role="tablist" aria-label="Городские системы">
   <button data-csp-tab="economy" class="csp-current">Экономика</button><button data-csp-tab="services">Службы</button><button data-csp-tab="transit">Транспорт</button><button data-csp-tab="events">События</button><button data-csp-tab="saves">Проект</button>
  </div>
  <section class="csp-page" id="csp-economy"><div class="csp-kpi">
   <div><b id="csp-people">0</b><small>жителей / 15.1</small></div><div><b id="csp-demand">0</b><small>спрос на жильё</small></div>
   <div><b id="csp-industry">0</b><small>промышленность</small></div><div><b id="csp-goods">0</b><small>нехватка товаров</small></div>
   <div><b id="csp-job">0</b><small>рабочих мест</small></div><div><b id="csp-comfort">0%</b><small>привлекательность</small></div>
  </div>
  <div class="csp-sublabel">Строительство в региональном 3D</div>
  <div class="csp-tools" id="csp-build-tools">
   <button data-cs-tool="factory">⚙ Завод</button><button data-cs-tool="big-store">▣ ТЦ</button><button data-cs-tool="hospital">✚ Больница</button><button data-cs-tool="park">♣ Парк</button>
   <button data-cs-tool="fire-station">🚒 Пожарная</button><button data-cs-tool="police-station">✦ Полиция</button>
  </div>
  <div class="csp-sublabel">Налоговая политика</div><div class="csp-rates">
   <label>Жильё <input data-tax="residential" type="range" min="0" max="30" value="12"><span id="csp-tax-residential">12%</span></label>
   <label>Коммерция <input data-tax="commercial" type="range" min="0" max="30" value="14"><span id="csp-tax-commercial">14%</span></label>
   <label>Производство <input data-tax="industrial" type="range" min="0" max="30" value="10"><span id="csp-tax-industrial">10%</span></label>
  </div>
  <div id="csp-budget-line" class="csp-note">Бюджет рассчитывается на основании застройки и услуг.</div>
  </section>
  <section class="csp-page" id="csp-services" hidden>
   <div class="csp-kpi"><div><b id="csp-electricity">0%</b><small>электричество</small></div><div><b id="csp-water">0%</b><small>вода</small></div>
    <div><b id="csp-sewage">0%</b><small>канализация</small></div><div><b id="csp-schools">0%</b><small>школы</small></div>
    <div><b id="csp-health">0%</b><small>медицина</small></div><div><b id="csp-safety">0%</b><small>пожарные</small></div></div>
   <div class="csp-tools"><button data-cs-tool="power-plant">⚡ Станция</button><button data-cs-tool="substation">⚡ Подстанция</button><button data-cs-tool="water-pump">◉ Водозабор</button><button data-cs-tool="sewage-plant">≈ Очистка</button></div>
   <label>Тип инженерного кабеля/трубы <select id="csp-network"><option value="power">Электросеть</option><option value="water">Водопровод</option><option value="sewage">Канализация</option></select></label>
   <div class="csp-actions"><button data-csp-tool="utility">⌁ Проложить в 3D</button><button id="csp-endline">✓ Завершить линию</button></div>
   <div id="csp-grid-description" class="csp-note">Подключение зависит от линии и источника питания/воды.</div>
  </section>
  <section class="csp-page" id="csp-transit" hidden>
   <div class="csp-kpi"><div><b id="csp-bus-count">0</b><small>маршрутов</small></div><div><b id="csp-passengers">0</b><small>пасс./день</small></div>
    <div><b id="csp-traffic">0%</b><small>заторы</small></div><div><b id="csp-cartrips">0</b><small>поездок/день</small></div></div>
   <div class="csp-tools"><button data-cs-tool="bus-stop">▣ Автобусная</button><button data-cs-tool="tram-stop">▣ Трамвайная</button></div>
   <div class="csp-sublabel">Выбери минимум две остановки в порядке следования</div>
   <div id="csp-stops" class="csp-scroll"></div>
   <div class="csp-settings"><label>Тип <select id="csp-mode"><option value="bus">Автобус</option><option value="tram">Трамвай</option></select></label><label>Машин <input id="csp-vehicles" type="number" value="3" min="1" max="24"></label><label>Интервал, мин <input id="csp-headway" type="number" value="12" min="2" max="180"></label></div>
   <div class="csp-actions"><button id="csp-create-line">＋ Маршрут</button><button id="csp-remove-line">× Последний</button></div>
   <div id="csp-lines" class="csp-note">Пока нет автобусных/трамвайных маршрутов.</div>
  </section>
  <section class="csp-page" id="csp-events" hidden>
   <div class="csp-kpi"><div><b id="csp-event-count">0</b><small>активных событий</small></div><div><b id="csp-service-police">0%</b><small>полицейское покрытие</small></div></div>
   <div class="csp-tools"><button data-csp-tool="fire">🔥 Пожар</button><button data-csp-tool="accident">⚠ ДТП</button><button data-csp-tool="roadworks">🚧 Ремонт дороги</button></div>
   <div id="csp-incidents" class="csp-note">Для происшествия выбери инструмент и отметь место в 3D.</div>
  </section>
  <section class="csp-page" id="csp-saves" hidden>
   <div class="csp-actions"><button id="csp-step">▶ +30 дней</button><button id="csp-recalc">↻ Пересчитать</button></div>
   <canvas id="csp-sparkline" width="310" height="100" aria-label="Изменение населения и бюджета"></canvas>
   <label>Название сценария <input id="csp-scenario-name" value="Сценарий города" maxlength="80"></label>
   <div class="csp-actions"><button id="csp-snapshot">＋ Сценарий</button><button id="csp-compare">⇄ Сравнить</button></div>
   <div id="csp-scenario-list" class="csp-scroll"></div>
   <div id="csp-comparison" class="csp-note"></div>
   <div class="csp-actions"><button id="csp-export">↓ Полный JSON</button><button id="csp-export-gzip">↓ GZIP</button><button id="csp-open">↑ Импорт</button></div>
   <div class="csp-actions"><button id="csp-store">▣ Локальный снимок</button><button id="csp-loadstore">↺ Восстановить</button></div>
   <div id="csp-performance" class="csp-note">Профилирование появится после пересчёта.</div>
  </section>
  <div id="csp-status" role="status" aria-live="polite">Строительство и статистика используют те же объекты, что и 3D-карта.</div>
 </div>`;
body.appendChild(plus);
const view=document.createElement('canvas');view.id='csp-world-overlay';view.setAttribute('aria-hidden','true');
$('region3d-overlay').appendChild(view);
const notify=msg=>{const o=$('csp-status');if(o)o.textContent=msg;};
let activeTab='economy',specialTool=null,firstPoint=null,zonePoints=[],clickStart=null,checkedStops=[],drawTime=0;
const baseStep=base.step.bind(base),baseExport=base.export.bind(base),baseImport=base.import.bind(base);
base.step=function(days=1){if(!Number.isFinite(days)||days<0||days>365)throw Error('Неверный шаг');const count=Math.floor(days);for(let i=0;i<count;i++){baseStep(1);systems.advanceAfterBase(1);}render();return base.report();};
base.export=function(){const data=baseExport();data.citySystems=systems.export();return data;};
base.import=function(data){if(data.citySystems){const backup=systems.export();try{systems.import(data.citySystems)}catch(err){systems.import(backup);throw err;}}else systems.import(null);const r=baseImport(data);render();return r;};
function setTab(t){activeTab=t;plus.querySelectorAll('[data-csp-tab]').forEach(b=>b.classList.toggle('csp-current',b.dataset.cspTab===t));plus.querySelectorAll('.csp-page').forEach(section=>section.hidden=section.id!=='csp-'+t);render();}
function pickTool(t){specialTool=t;firstPoint=null;zonePoints=[];world.switchTool('camera');plus.querySelectorAll('[data-csp-tool]').forEach(x=>x.classList.toggle('csp-active',x.dataset.cspTool===t));notify(t==='utility'?'Нажмите две точки в 3D, чтобы проложить коммуникацию.':t==='zone'?'Отметьте минимум три вершины границы, затем нажмите «✓ Завершить».':'Отметьте событие щелчком на местности в 3D.');}
function tableDisplay(data){return Object.entries(data).map(([name,value])=>`${name}: ${fmt(value)}`).join(' · ');}
function render(){let r;try{r=systems.report()}catch(err){notify('Ошибка вычисления: '+err.message);return;}
 const values={people:r.population,demand:r.housingDemand,industry:r.industrialOutput,goods:r.goodsDeficit,job:r.jobs,comfort:percent(r.desirability),electricity:percent(r.power.coverage),water:percent(r.water.coverage),sewage:percent(r.sewage.coverage),schools:percent(r.service.school),health:percent(r.service.health),safety:percent(r.service.fire),'bus-count':`${r.transit.active}/${r.transit.lines}`,passengers:r.transit.passengersPerDay,traffic:percent(r.congestion),cartrips:r.vehicleTripsPerDay,'event-count':r.incidents.length,'service-police':percent(r.service.police)};
 for(const [id,value] of Object.entries(values)){const elem=$('csp-'+id);if(elem)elem.textContent=typeof value==='string'?value:fmt(value);}
 $('csp-budget-line').textContent=`₮ ${fmt(r.treasury)} · Доходы ${fmt(r.lastFinance.revenue)} · Расходы ${fmt(r.lastFinance.cost)} / день · ${r.factories} производств, ${r.retail} магазинов`;
 $('csp-grid-description').textContent=`Электричество: ${fmt(r.power.capacity)} / ${fmt(r.power.demand)} кВт (учебн.); вода: ${fmt(r.water.capacity)} / ${fmt(r.water.demand)} м³/сут; подключено к сети: ${fmt(r.power.connected)} условных потребителей.`;
 $('csp-lines').textContent=`Активных маршрутов: ${r.transit.active}. Без непрерывной дорожной/рельсовой сети маршруты отмечаются как неработающие (${r.transit.broken}).`;
 $('csp-incidents').textContent=r.incidents.length?r.incidents.map(x=>`${{fire:'Пожар',accident:'ДТП',roadworks:'Ремонт'}[x.kind]} · ещё ${x.remainingDays} дн.`).join(' • '):'Происшествий нет. Поставьте их инструментом на 3D-карте.';
 $('csp-performance').textContent=`Модель: ${r.performance.knownObjects} зданий · ${fmt(r.performance.reportMs)} мс/отчёт · ${fmt(r.performance.stepMs)} мс/шаг · ${r.roadNetwork} дорог · ${r.historyCount} исторических записей. Жители рассчитываются агрегированно, без отдельного агента на каждого.`;
 for(const [kind,tax] of Object.entries(systems.tax)){$('csp-tax-'+kind).textContent=Math.round(tax*100)+'%';const slider=plus.querySelector('[data-tax="'+kind+'"]');if(slider&&document.activeElement!==slider)slider.value=Math.round(tax*100);}
 const stopDiv=$('csp-stops');const stops=editor.objects.filter(o=>['bus-stop','tram-stop'].includes(o.catalogId));const checked=new Set(checkedStops);stopDiv.innerHTML=stops.length?stops.slice(0,70).map((o,i)=>`<label><input type="checkbox" data-stop="${esc(o.id)}" ${checked.has(o.id)?'checked':''}>${i+1}. ${o.catalogId==='tram-stop'?'Трамвай':'Автобус'} · ${fmt(o.x)}, ${fmt(o.z)} м</label>`).join(''):'Сначала разместите остановки в 3D.';
 const scenarios=$('csp-scenario-list');scenarios.innerHTML=systems.scenarios.length?systems.scenarios.map(o=>`<label><input type="checkbox" data-scenario="${esc(o.id)}">${esc(o.name)} · день ${o.timestampDay}</label>`).join(''):'Снимков пока нет.';
 $('cs-pop').textContent=fmt(r.population);$('cs-jobs').textContent=fmt(r.jobs);$('cs-home').textContent=fmt(r.housingCapacity);$('cs-budget').textContent=fmt(r.treasury);
 drawChart();return r;}
function drawChart(){const c=$('csp-sparkline'),ctx=c.getContext('2d');if(!ctx)return;const w=c.width,h=c.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#142e3c';ctx.fillRect(0,0,w,h);ctx.font='10px sans-serif';ctx.fillStyle='#9bc5cf';ctx.fillText('Население / динамика, недельные записи',8,13);
 const points=systems.daily;if(points.length<2)return;const max=Math.max(1,...points.map(p=>p.population));ctx.strokeStyle='#e9bc79';ctx.lineWidth=2;ctx.beginPath();points.forEach((p,i)=>{const x=8+i*(w-16)/(points.length-1),y=h-11-(p.population/max)*(h-35);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();}
// In-engine 3D screen-space projection. No surrogate 2D game world.
function projectPoint(x,z,height=4){if(!region3d.active||!region3d.cam)return null;const coords=editor.geographic(x,z);const metric=geographicToMetric(coords[1],coords[0]);const g=metricGround(region3d.geoPack,metric.x,metric.z);if(!g.measured)return null;
 const cam=region3d.cam,forward=region3d.forward(),fx=forward[0],fz=forward[2],horizontal=Math.hypot(fx,fz)||1;
 const right=[-fz/horizontal,0,fx/horizontal],up=[-forward[1]*right[2],horizontal,forward[1]*right[0]],worldVec=[metric.x-cam.x,g.height+height+editor.terrainOffset(x,z)-cam.y,metric.z-cam.z];
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];const distance=dot(worldVec,forward);if(distance<2)return null;
 const w=view._cssW||view.clientWidth,h=view._cssH||view.clientHeight,focal=h/(2*Math.tan(Math.PI*.16));return {x:w/2+dot(worldVec,right)*focal/distance,y:h/2-dot(worldVec,up)*focal/distance,depth:distance};}
function drawWorld(){if(!region3d.active||!$('citysim-controls')||$('citysim-controls').hidden){view.hidden=true;return}view.hidden=false;
 const rect=region3d.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);if(!rect.width||!rect.height)return;
 view.style.left=region3d.canvas.offsetLeft+'px';view.style.top=region3d.canvas.offsetTop+'px';view.style.width=rect.width+'px';view.style.height=rect.height+'px';const W=Math.floor(rect.width*dpr),H=Math.floor(rect.height*dpr);if(view.width!==W||view.height!==H){view.width=W;view.height=H;}
 view._cssW=rect.width;view._cssH=rect.height;const ctx=view.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
 const color={bus:'#f5d18d',tram:'#80dfe2'};
 // Zoning outlines are projected into the same 3D viewport. They remain
 // editable WGS84/ENU WorldEditor polygons rather than a separate 2D plan.
 const zoneColors={residential:'#8dd4aa',commercial:'#9fcef9',industrial:'#f8c28e',park:'#73e0a5'};
 for(const parcel of editor.objects.filter(o=>o.type==='parcel').slice(-80)){
  const projected=parcel.points?.map(p=>projectPoint(p[0],p[1],3));if(!projected?.length||projected.some(p=>!p))continue;
  const color=zoneColors[parcel.zoning]||'#d8d2b0';ctx.beginPath();projected.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
 }
 if(zonePoints.length){const projected=zonePoints.map(p=>projectPoint(p[0],p[1],4));ctx.beginPath();projected.forEach((p,i)=>{if(!p)return;i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.strokeStyle='#ffe6b4';ctx.lineWidth=2;ctx.stroke();}
 const byId=new Map(editor.objects.filter(o=>o.type==='building').map(o=>[o.id,o]));
 for(const line of systems.lines){let prev=null;ctx.lineWidth=2.5;ctx.strokeStyle=color[line.mode]||'#f5d18d';ctx.setLineDash(line.mode==='tram'?[]:[5,5]);ctx.beginPath();let has=false;const routePoints=[];
   for(const id of line.stops){const o=byId.get(id);if(!o)continue;const p=projectPoint(o.x,o.z,4);routePoints.push({x:o.x,z:o.z});if(!p||p.x<-80||p.x>rect.width+80||p.y<-80||p.y>rect.height+80){prev=null;continue;}if(!prev)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);prev=p;has=true;}
   if(has)ctx.stroke();ctx.setLineDash([]);
   // An intentionally lightweight screen-space traffic indicator, *not* a
   // high-poly bus mesh. The network graph still validates route connectivity.
   if(routePoints.length>=2){const t=performance.now()*.000022/(line.mode==='tram'?.75:1);const k=t%1*(routePoints.length-1),i=Math.min(routePoints.length-2,Math.floor(k)),f=k-i;
     const a=routePoints[i],b=routePoints[i+1],p=projectPoint(a.x+(b.x-a.x)*f,a.z+(b.z-a.z)*f,7);
     if(p&&p.x>0&&p.x<rect.width&&p.y>0&&p.y<rect.height){ctx.fillStyle=color[line.mode];ctx.strokeStyle='#132b39';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(p.x-7,p.y-5,14,10,3);ctx.fill();ctx.stroke();}
   }
 }
 // Geographic 3D markers for utilities / essential services. They are drawn
 // on the scene overlay, using the same ENU coordinates as built 3D objects.
 let shown=0;for(const o of byId.values()){
   const symbol=({'power-plant':'⚡','substation':'⚡','water-pump':'💧','sewage-plant':'≈','fire-station':'🚒','hospital':'✚','police-station':'✦'})[o.catalogId];
   if(!symbol||++shown>35)continue;const p=projectPoint(o.x,o.z,(o.floors||1)*3+4);if(!p||p.x<0||p.x>rect.width||p.y<0||p.y>rect.height)continue;
   ctx.fillStyle='#102b39c9';ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f4d4a0';ctx.font='14px system-ui';ctx.fillText(symbol,p.x-7,p.y+5);
 }
 for(const ev of systems.incidents){const p=projectPoint(ev.x,ev.z,8);if(!p||p.x<0||p.x>rect.width||p.y<0||p.y>rect.height)continue;ctx.fillStyle='rgba(15,29,35,.86)';ctx.strokeStyle=ev.kind==='fire'?'#ff9c6b':ev.kind==='accident'?'#fad78d':'#8ed9fc';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font='16px system-ui';ctx.fillStyle='#fff';ctx.fillText(ev.kind==='fire'?'🔥':ev.kind==='accident'?'⚠':'🚧',p.x-9,p.y+6);}
}
function frame(t){if(t-drawTime>170){drawTime=t;try{drawWorld()}catch(e){/* RenderCore may be changing backend; don't crash gameplay */}}requestAnimationFrame(frame);}
requestAnimationFrame(frame);
function makeProject(){return {format:'TrussLab-CityWorld',version:1,editor:editor.export(),citysim:base.export(),metadata:{release:'15.9',savedAt:new Date().toISOString(),originalDEM:'unchanged'},worldVisual:globalThis.TrussLabWorldVisual?.export?.()||null,natureWorld:globalThis.TrussLabNature?.export?.()||null};}
function applyProject(pack){if(!pack||pack.format!=='TrussLab-CityWorld'||pack.version!==1||!pack.editor||!pack.citysim)throw Error('Неподдерживаемый файл проекта');
 const raw=JSON.stringify(pack);if(raw.length>50_000_000)throw Error('Превышен предел 50 МБ');
 // Defensive rollback when any component rejects imported data.
 const previous=makeProject();try{editor.import(pack.editor);base.import(pack.citysim);globalThis.TrussLabWorldVisual?.import?.(pack.worldVisual);if(globalThis.TrussLabNature){globalThis.TrussLabNature.import(pack.natureWorld||null);}}catch(err){editor.import(previous.editor);base.import(previous.citysim);globalThis.TrussLabWorldVisual?.import?.(previous.worldVisual);globalThis.TrussLabNature?.import?.(previous.natureWorld||null);throw err;}render();notify('Загружена городская симуляция, здания, участки, дороги и слои рельефа.');}
async function downloadProject(compress=false){const raw=JSON.stringify(makeProject());if(raw.length>50_000_000)throw Error('Проект больше 50 МБ');let blob=new Blob([raw],{type:'application/json'}),ext='.json';if(compress){if(typeof CompressionStream==='undefined')throw Error('GZIP не поддерживается. Используйте JSON.');blob=await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();ext='.json.gz';}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='TrussLab_CityWorld_15_10'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);notify('Проект сохранён: '+(blob.size/1024).toFixed(0)+' КиБ.');}
async function loadProject(file){if(!file||file.size>50_000_000)throw Error('Файл слишком большой');let input=file;if(file.name.endsWith('.gz')){if(typeof DecompressionStream==='undefined')throw Error('GZIP не поддерживается');input=new Response(file.stream().pipeThrough(new DecompressionStream('gzip')));}
 const text=await input.text();if(text.length>50_000_000)throw Error('Данные превышают 50 МБ');applyProject(JSON.parse(text));}
const store={memory:null,async db(){if(typeof indexedDB==='undefined')throw Error('IndexedDB недоступен');return await new Promise((ok,bad)=>{let req=indexedDB.open('trusslab_citysim15',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('worlds'))req.result.createObjectStore('worlds')};req.onsuccess=()=>ok(req.result);req.onerror=()=>bad(req.error);});},
 async save(){const data=makeProject();this.memory=data;try{const db=await this.db();await new Promise((ok,bad)=>{const tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').put(data,'latest');tx.oncomplete=ok;tx.onerror=()=>bad(tx.error)});db.close();return 'Снимок сохранён в IndexedDB.';}catch(_){return 'Снимок в памяти вкладки (IndexedDB недоступен). Экспортируйте JSON для надёжного хранения.';}},
 async load(){let data=null;try{const db=await this.db();data=await new Promise((ok,bad)=>{const tx=db.transaction('worlds');const req=tx.objectStore('worlds').get('latest');req.onsuccess=()=>ok(req.result||null);req.onerror=()=>bad(req.error)});db.close();}catch(_){data=this.memory;}if(!data)throw Error('Локальный снимок не найден');applyProject(data);return 'Снимок успешно загружен.';}};
const input=document.createElement('input');input.type='file';input.accept='.json,.gz,.json.gz';input.hidden=true;input.id='csp-input';plus.appendChild(input);
input.addEventListener('change',async e=>{try{await loadProject(e.target.files?.[0])}catch(err){notify('Ошибка импорта: '+err.message)}e.target.value='';});
plus.addEventListener('input',e=>{if(e.target.dataset.tax){try{systems.setTax(e.target.dataset.tax,Number(e.target.value)/100);render()}catch(err){notify(err.message)}}});
plus.addEventListener('change',e=>{if(e.target.dataset.stop){if(e.target.checked){if(!checkedStops.includes(e.target.dataset.stop))checkedStops.push(e.target.dataset.stop);}else checkedStops=checkedStops.filter(x=>x!==e.target.dataset.stop);}});
plus.addEventListener('click',async e=>{const btn=e.target.closest('button');if(!btn)return;try{
 if(btn.dataset.cspTab){setTab(btn.dataset.cspTab);return;}
 if(btn.dataset.cspTool){pickTool(btn.dataset.cspTool);return;}
 // Built-in building placement already uses the 15.1 raycaster and editor.
 if(btn.dataset.csTool){specialTool=null;firstPoint=null;return;}
 switch(btn.id){
 case 'csp-endline':specialTool=null;firstPoint=null;zonePoints=[];notify('Прокладка завершена.');break;
 case 'csp-finish-zone':{if(zonePoints.length<3)throw Error('Нужно минимум три точки границы');const parcel=editor.addParcel(zonePoints,$('csp-zone').value,'CitySim 15.9 · 3D-зона');zonePoints=[];specialTool=null;render();notify('Зона '+parcel.zoning+' создана на региональной карте.');break;}
 case 'csp-recalc':render();notify('Данные актуализированы по объектам региональной карты.');break;
 case 'csp-step':base.step(30);render();notify('Прошло 30 дней агрегированной симуляции.');break;
 case 'csp-create-line':{const mode=$('csp-mode').value,vehicles=Number($('csp-vehicles').value),headwayMinutes=Number($('csp-headway').value);const line=systems.addTransitLine(checkedStops,{mode,vehicles,headwayMinutes});checkedStops=[];render();notify('Маршрут '+line.id+' создан. Для работы нужны связанные '+(mode==='bus'?'дороги.':'рельсы.'));break;}
 case 'csp-remove-line':{const last=systems.lines.at(-1);if(last){systems.removeTransitLine(last.id);render();}break;}
 case 'csp-snapshot':systems.recordScenario($('csp-scenario-name').value);render();notify('Сценарий сохранён для сравнения.');break;
 case 'csp-compare':{const ids=[...plus.querySelectorAll('[data-scenario]:checked')].map(x=>x.dataset.scenario);if(ids.length!==2)throw Error('Выберите ровно два сценария');const comparison=systems.compareScenarios(...ids);$('csp-comparison').textContent=`${comparison.a} ↔ ${comparison.b} · Δ население: ${fmt(comparison.delta.population.delta)} · Δ бюджет: ${fmt(comparison.delta.treasury.delta)} · Δ заторы: ${percent(comparison.delta.congestion.delta)}`;break;}
 case 'csp-export':await downloadProject(false);break;
 case 'csp-export-gzip':await downloadProject(true);break;
 case 'csp-open':input.click();break;
 case 'csp-store':notify(await store.save());break;
 case 'csp-loadstore':notify(await store.load());break;
 }
 }catch(err){notify('Ошибка: '+err.message)}});
// Intercept old Save/Import controls to remove the former 6 MB limit and keep
// old v1 JSON file compatibility. Preserve old saved projects unchanged.
panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='cs-save'){e.stopImmediatePropagation();downloadProject().catch(err=>notify(err.message))}else if(b.id==='cs-import'){e.stopImmediatePropagation();input.click()}},true);
// New utility networks and incidents are placed with the actual 3D raycaster;
// camera drag is still handled by Region3D, and does NOT build anything.
region3d.canvas.addEventListener('pointerdown',e=>{if(specialTool&&e.button===0)clickStart={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false}},true);
region3d.canvas.addEventListener('pointermove',e=>{if(clickStart&&clickStart.id===e.pointerId&&Math.hypot(e.clientX-clickStart.x,e.clientY-clickStart.y)>7)clickStart.moved=true},true);
region3d.canvas.addEventListener('pointerup',e=>{if(!specialTool||!clickStart||clickStart.id!==e.pointerId)return;const click=!clickStart.moved;clickStart=null;if(!click||!region3d.active)return;
 e.stopImmediatePropagation();const rect=region3d.canvas.getBoundingClientRect();const hit=world.makeHit((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height);if(!hit){notify('Нужна точка на известной суше.');return;}
 try{if(specialTool==='zone'){zonePoints.push([hit.x,hit.z]);notify('Граница: '+zonePoints.length+' точек. Завершите полигон кнопкой в панели.');return;}if(specialTool==='utility'){
   if(!firstPoint){firstPoint=[hit.x,hit.z];notify('Начало сети задано. Нажмите вторую точку.');return;}
   if(d2Local(firstPoint,[hit.x,hit.z])<2)throw Error('Точки слишком близко');const network=$('csp-network').value;editor.addPath('utility',[firstPoint,[hit.x,hit.z]],{network,width:1.3,label:'CitySim '+network});firstPoint=[hit.x,hit.z];notify('Линия '+network+' добавлена в региональный 3D. Продолжайте или завершите.');
 }else systems.addIncident(specialTool,{x:hit.x,z:hit.z,durationDays:specialTool==='roadworks'?10:4});render();}
 catch(err){notify('Ошибка: '+err.message)}},true);
region3d.canvas.addEventListener('pointercancel',()=>clickStart=null,true);
const d2Local=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const oldOpen=world.open;world.open=function(...args){const r=oldOpen(...args);render();return r;};
region3d.canvas.addEventListener('pointerup',()=>{setTimeout(render,80)},false);
render();globalThis.TrussLabCityPlusUI={systems,render,makeProject,applyProject,downloadProject,loadProject,setTab,store};
})();
