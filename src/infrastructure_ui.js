/* InfrastructureSim 14.1–14.9: actual editor graph + deterministic simulation.
   Designed for autonomous offline HTML, including narrow mobile screens. */
(function(){'use strict';
if(typeof document==='undefined'||!globalThis.TrussLabInfrastructureSim||!globalThis.trusslabEditor)return;
const editor=globalThis.trusslabEditor,Sim=globalThis.TrussLabInfrastructureSim,sim=new Sim(editor,{agentCap:56});globalThis.trusslabInfraSim=sim;
const esc=v=>String(v).replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
const $=id=>document.getElementById(id);
const root=document.createElement('section');root.id='infra-root';root.hidden=true;root.innerHTML=`
 <header class="infra-head"><div><small>TRUSSLAB 14.1–14.9 · INFRASTRUCTURE SIM</small><h2>Инфраструктура и транспорт</h2><span>Игровая симуляция ENU, метры · НЕ расчёт безопасности реального моста</span></div>
 <div class="infra-actions"><button id="is-pause">⏸ Пауза</button><button id="is-demo">＋ Демо-сеть</button><button id="is-back">▦ WorldEditor</button><button id="is-close">✕ Закрыть</button></div></header>
 <div class="infra-columns"><main class="infra-scene">
 <div class="infra-toolbar"><b>Карта сети 2D</b><div><button id="is-sync">↻ Синхронизировать</button><button id="is-route">⌁ Маршрут</button><button id="is-fit">⊞ Обзор</button></div></div>
 <canvas id="is-canvas" aria-label="Карта автомобильных, железнодорожных и судоходных маршрутов"></canvas>
 <div class="infra-overlay" id="is-overlay">Выберите «Демо-сеть» или создайте дороги и пути в WorldEditor.</div>
 <div class="infra-map-legend"><span><i style="background:#e3bd83"></i>Автодороги</span><span><i style="background:#66d9d0"></i>Ж/Д × 2</span><span><i style="background:#7bcafa"></i>Судоходство</span><span><i style="background:#cba5f1"></i>Маршрут</span></div>
 <div class="infra-bottom" id="is-live">Нажмите «Демо-сеть» для первого запуска.</div>
 <div class="infra-chartbox"><b>Расчётная эпюра пролёта · учебная балка</b><canvas id="is-beam" width="640" height="140"></canvas></div>
 </main><aside class="infra-sidebar">
 <section><h3>14.1–14.2 · Сети</h3><p>Автомобильный граф, двухпутная железная дорога, стрелки и занятость участков.</p><button id="is-signal">＋ Сигнал</button><div class="infra-mini" id="is-graphs">Граф пока не построен</div></section>
 <section><h3>14.3 · Автомобили</h3><label>Максимум агентов <input id="is-agent-cap" type="number" min="1" max="250" value="56"></label><label>Поток, авто/мин <input id="is-traffic-rate" type="number" min="0" max="120" value="12"></label><label><input id="is-auto-traffic" type="checkbox" checked> Автоматическое появление автомобилей</label><div class="infra-row"><button id="is-car-one">＋ 1 авто</button><button id="is-car-ten">＋ 12 авто</button></div><p>Агенты движутся по маршрутам графа с ограничением скорости и количества.</p></section>
 <section><h3>14.4 · Диспетчер поездов</h3><label>Интервал расписания (с)<input type="number" id="is-train-repeat" min="0" max="3600" value="75"></label><button id="is-train">＋ Поезд по расписанию</button><div class="infra-mini" id="is-train-status">Пока нет поездов</div></section>
 <section><h3>14.5 · Пролив и судоходство</h3><label>Условный габарит под мостом (м)<input id="is-nav-height" type="number" min="0" max="180" value="28"></label><label>Надводная высота судна (м)<input id="is-air-draft" type="number" min="1" max="120" value="19"></label><button id="is-ship">＋ Судно</button><small>Батиметрии нет. Проверяется только заданный воздушный габарит, не реальная глубина.</small><div class="infra-mini" id="is-ship-status"></div></section>
 <section><h3>14.6 · Визуальные нагрузки</h3><div class="infra-row"><label>Пролёт (м)<input type="number" id="is-span" min="5" max="2000" value="220"></label><label>Точечная масса (т)<input type="number" id="is-mass" min="0" max="300" value="45"></label></div><label>Условная жёсткость E·I, ×10¹² Н·м² <input type="number" id="is-ei" min="0.01" max="100" step="0.1" value="2.8"></label><button id="is-load">∑ Рассчитать реакции</button><div class="infra-mini" id="is-load-results">Учебная однопролётная балка; не оценка реального сооружения.</div></section>
 <section><h3>14.7 · Фундаменты и грунты</h3><label>Тип грунта<select id="is-soil"><option value="sand">Песок</option><option value="clay">Глина</option><option value="silt">Ил</option><option value="peat">Болото / торф</option><option value="rock">Скала</option></select></label><label>Фундамент<select id="is-foot-kind"><option value="shallow">Плитный мелкого заложения</option><option value="strip">Ленточный</option><option value="raft">Ростверк-плита</option><option value="piles">Сваи (условно)</option></select></label><label>Вертикальная нагрузка (кН)<input id="is-foot-load" type="number" min="10" max="200000" value="2000"></label><button id="is-foundation">＋ Рассчитать основание</button><div class="infra-mini" id="is-foot-results"></div></section>
 <section><h3>14.8 · Погода и время</h3><label>Дождь <input id="is-rain" type="range" min="0" max="100" value="0"></label><label>Туман <input id="is-fog" type="range" min="0" max="100" value="0"></label><label>Ветер, м/с <input id="is-wind" type="range" min="0" max="40" value="3"></label><label><input id="is-night" type="checkbox"> Ночная смена</label><p>Влияние на скорость авто, поездов и судов.</p></section>
 <section><h3>14.9 · Сравнение сценариев</h3><div class="infra-row"><button id="is-snapshot">◌ Снимок</button><button id="is-compare">≠ Сравнить</button></div><div class="infra-row"><button id="is-export">↓ JSON</button><button id="is-import">↑ JSON</button></div><input type="file" id="is-file" hidden accept="application/json,.json"><div class="infra-mini" id="is-comparison">Запишите два сценария для сравнения.</div></section>
 </aside></div><div class="infra-footer" role="status" id="is-status">Сети редактируются в WorldEditor 2. Изменения немедленно учитываются при синхронизации.</div>
`;
document.body.appendChild(root);
const b=document.createElement('button');b.id='infra-open';b.type='button';b.title='InfrastructureSim 14.1–14.9';b.textContent='🚦 InfrastructureSim';document.querySelector('.scene-header .views')?.appendChild(b);
const wb=document.createElement('button');wb.id='we-infra-open';wb.textContent='🚦 InfrastructureSim';document.querySelector('#we-root .we-actions')?.prepend(wb);
const c=$('is-canvas'),ctx=c.getContext('2d',{alpha:false}),beam=$('is-beam'),bctx=beam.getContext('2d');let visible=false,playing=true,last=0,origin=[0,0],scale=1,pan=null,lastStatus='',routePath=null,lastReport=null,RAF=0,dpr=1;
const number=(id,def,min,max)=>{const v=+$((id))?.value;return Number.isFinite(v)?Math.max(min,Math.min(max,v)):def};
function status(t){lastStatus=t;$('is-status').textContent=t;}
function open(){root.hidden=false;visible=true;document.getElementById('we-root').hidden=true;const sc=root.querySelector('.infra-columns');if(sc)sc.scrollTop=0;fit();refresh();last=performance.now();RAF=requestAnimationFrame(frame);}
function close(back=false){root.hidden=true;visible=false;if(RAF)cancelAnimationFrame(RAF);RAF=0;if(back)document.getElementById('we-root').hidden=false;}
b.addEventListener('click',open);wb.addEventListener('click',open);$('is-back').addEventListener('click',()=>close(true));$('is-close').addEventListener('click',()=>close(false));
function fit(){const all=[...sim.road.nodes,...sim.rail.nodes,...sim.shipLanes.flatMap(o=>o.points.map(p=>({x:p[0],z:p[1]})))];let xs=all.map(p=>p.x),zs=all.map(p=>p.z);origin=[xs.length?(Math.min(...xs)+Math.max(...xs))/2:0,zs.length?(Math.min(...zs)+Math.max(...zs))/2:0];let w=Math.max(1500,...xs.map(x=>Math.abs(x-origin[0])*2)),h=Math.max(1000,...zs.map(z=>Math.abs(z-origin[1])*2));scale=Math.min((c.clientWidth||700)*.88/w,(c.clientHeight||600)*.85/h);}
function P(x,z){return [c.clientWidth/2+(x-origin[0])*scale,c.clientHeight/2+(z-origin[1])*scale]}
function unP(x,y){return [(x-c.clientWidth/2)/scale+origin[0],(y-c.clientHeight/2)/scale+origin[1]]}
function line(points,color,width=2){if(!points?.length)return;ctx.beginPath();points.forEach((p,i)=>{const q=P(p[0],p[1]);if(i)ctx.lineTo(...q);else ctx.moveTo(...q)});ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();}
function circle(x,z,r,color){const p=P(x,z);ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
function draw(){const box=c.getBoundingClientRect();if(!box.width||!box.height)return;
 dpr=Math.min(2,devicePixelRatio||1);const w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#102f40';ctx.fillRect(0,0,box.width,box.height);
 // lightweight grid in world metres, no expensive GIS raster re-render per frame
 let tick=Math.pow(10,Math.ceil(Math.log10(90/scale)));if(!Number.isFinite(tick))tick=1000;
 const [minx,minz]=unP(0,0),[maxx,maxz]=unP(box.width,box.height);
 ctx.lineWidth=.8;ctx.strokeStyle='rgba(134,174,173,.14)';for(let x=Math.floor(minx/tick)*tick;x<maxx;x+=tick){let a=P(x,minz),b=P(x,maxz);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke()}for(let z=Math.floor(minz/tick)*tick;z<maxz;z+=tick){let a=P(minx,z),b=P(maxx,z);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke()}
 for(const e of sim.road.edges){const a=sim.road.nodes[e.from],b=sim.road.nodes[e.to];line([[a.x,a.z],[b.x,b.z]],'#e3bd83',Math.max(1.8,Math.min(6,4*scale*15)))}
 for(const e of sim.rail.edges){const a=sim.rail.nodes[e.from],b=sim.rail.nodes[e.to];line([[a.x,a.z],[b.x,b.z]],e.switch?'#f5a875':'#66d9d0',e.switch?3:2)}
 for(const s of sim.signals){const e=sim.rail.edges[s.edgeId];if(!e)continue;const a=sim.rail.nodes[e.from],b=sim.rail.nodes[e.to];const p=along2(a,b,s.offset);circle(p.x,p.z,4,s.aspect==='red'?'#ff736a':'#98e0a1')}
 for(const lane of sim.shipLanes){line(lane.points,'#7bcafa',3);for(const p of lane.points)circle(p[0],p[1],2,'#b4e4f6')}
 if(routePath){const route=routePath;for(const x of route.steps){const e=sim.road.edges[x.id];if(!e)continue;let a=sim.road.nodes[x.from],b=sim.road.nodes[x.to];line([[a.x,a.z],[b.x,b.z]],'#cba5f1',4)}}
 for(const a of sim.carAgents)circle(a.x,a.z,3.7,'#ffdf95');for(const t of sim.trains)circle(t.x,t.z,6,t.blocked?'#f5706b':'#ecb46c');for(const s of sim.ships)circle(s.x,s.z,6,s.blocked?'#f5706b':'#d4f9ff');
 // Display weather/night visually without distorting the ENU road geometry.
 if(sim.weather.rain>.05){ctx.strokeStyle=`rgba(115,191,229,${Math.min(.4,.06+sim.weather.rain*.25)})`;ctx.lineWidth=1;for(let k=0;k<70*sim.weather.rain;k++){const x=(k*197+sim.clock*7)%(box.width+30)-10,y=(k*131+sim.clock*21)%(box.height+30)-10;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3-sim.weather.windMps*.18,y+11);ctx.stroke()}}
 if(sim.weather.night){ctx.fillStyle='rgba(0,0,17,.18)';ctx.fillRect(0,0,box.width,box.height)}
 ctx.fillStyle='#b5d0d4';ctx.font='11px system-ui';ctx.fillText('ENU / '+Math.round(tick)+' м на клетку',12,20);
}
function along2(a,b,t){return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}}
function drawBeam(report){const w=beam.width,h=beam.height;bctx.clearRect(0,0,w,h);bctx.fillStyle='#102837';bctx.fillRect(0,0,w,h);bctx.strokeStyle='#638996';bctx.beginPath();bctx.moveTo(30,30);bctx.lineTo(w-25,30);bctx.stroke();bctx.fillStyle='#ddb57e';bctx.fillText('Rₐ',25,16);bctx.fillText('Rᵦ',w-35,16);
 const pts=report.points,peak=Math.max(1,...pts.map(p=>Math.abs(p.momentNm)));bctx.beginPath();for(let i=0;i<pts.length;i++){let x=30+(w-55)*i/(pts.length-1),y=30+Math.max(-86,Math.min(86,pts[i].momentNm/peak*83));if(i)bctx.lineTo(x,y);else bctx.moveTo(x,y)}bctx.strokeStyle='#e8bb81';bctx.lineWidth=2;bctx.stroke();bctx.font='12px system-ui';bctx.fillStyle='#aed2d1';bctx.fillText('Моментная эпюра, масштаб нормирован по максимуму',38,h-7);}
function refresh(){sim.rebuild();const report=sim.report(),bridge=sim.calculateBridge();draw();drawBeam(bridge);const fmt=n=>Number(n).toFixed(1);
 $('is-graphs').textContent=`Авто: ${report.road.nodes} узлов, ${report.road.edges} рёбер, ${report.road.components} компонента. Ж/Д: ${report.rail.nodes} узлов, ${report.rail.edges} рёбер (две колеи), ${report.rail.components} компонента.`;
 $('is-live').textContent=`Время ${fmt(report.clockSeconds)} с · Авто ${report.cars}/${sim.agentCap} · Поезда ${report.trains} (${report.trainArrivals} прибыли) · Суда ${report.ships} · Скорость ×${fmt(report.roadSpeedFactor)} · Сценариев ${sim.scenarios.length}`;
 $('is-train-status').textContent=`Расписаний ${sim.trainSchedules.length}, поездов ${sim.trains.length}, ожидание ${fmt(report.trainWaitingSeconds)} с.`;
 $('is-ship-status').textContent=`Коридоров ${report.navLaneCount}, судов ${report.ships}, отклонено по габариту ${report.shipBlocked}. Глубины НЕ известны.`;
 $('is-overlay').hidden=report.road.edges>0||report.rail.edges>0;
 return report;
}
function demo(){const find=o=>editor.objects.some(x=>x.label===o);if(find('INFRA-DEMO-ROAD')){status('Демонстрационная сеть уже существует.');return;}
 editor.addPath('road',[[-700,-300],[-350,-260],[0,-100],[400,0],[720,220]],{label:'INFRA-DEMO-ROAD',speedKph:65});
 editor.addPath('road',[[0,-650],[0,-100],[0,650]],{label:'Поперечная магистраль',speedKph:50});
 editor.addPath('road',[[-700,120],[-350,40],[0,-100]],{label:'Городская улица',speedKph:40});
 editor.addPath('rail',[[-700,300],[-350,260],[0,220],[350,250],[700,320]],{label:'Двухпутная линия',tracks:2,speedKph:90});
 editor.addPath('switch',[[0,220],[15,220]],{label:'Учебная стрелка'});
 editor.addModel('bridge-pier',-50,50,{label:'Учебная опора'});
 sim.rebuild(true);sim.addShippingLane([[-130,-690],[-90,-340],[-10,0],[100,520],[140,700]],{clearanceM:number('is-nav-height',28,0,180)});
 sim.addSignal(0,.5);fit();status('Учебная магистраль, двухпутная железная дорога, стрелка, сигналы и судоходный коридор добавлены в WorldEditor.');refresh();}
function queryRoute(){sim.rebuild();const g=sim.road;if(g.nodes.length<2)throw Error('Сначала создайте автомобильные дороги');const a=g.nodes[0],b=g.nodes.at(-1);routePath=g.route(a.id,b.id);if(!routePath)throw Error('Нет связанного дорожного маршрута');status(`14.1 · Длина маршрута ${routePath.lengthM.toFixed(0)} м, расчётное время ${(routePath.travelSeconds/60).toFixed(1)} мин; условная сеть.`);}
function addCars(n){sim.rebuild();if(sim.road.nodes.length<2)throw Error('Дорожная сеть ещё не связана');let total=0;for(let i=0;i<n;i++){const g=sim.road;let a=g.nodes[i%g.nodes.length]?.id,b=g.nodes[(g.nodes.length-1-i+g.nodes.length)%g.nodes.length]?.id;if(sim.spawnCar({from:a,to:b}))total++;}status(`14.3 · Добавлено ${total} авто; действующий лимит ${sim.agentCap}`);refresh();}
function createTrain(){const g=sim.rail;if(g.nodes.length<2)throw Error('Сначала создайте двухпутную железную дорогу');let start=g.nodes.find(n=>n.track===0),last=g.nodes.slice().reverse().find(n=>n.track===0);if(!start||!last)throw Error('Не найдены конечные пункты');const repeat=number('is-train-repeat',75,0,3600);
 sim.scheduleTrain({from:start.id,to:last.id,departSeconds:sim.clock,speedKph:85,repeatSeconds:repeat,label:'Электропоезд'});sim.step(.1);status('14.4 · Состав добавлен в расписание, диспетчер учитывает занятость участков');refresh();}
function createShip(){if(!sim.shipLanes.length)throw Error('Сначала добавьте судоходный маршрут через демо-сеть');const lane=sim.shipLanes[0];lane.clearanceM=number('is-nav-height',28,0,180);const ship=sim.launchShip({laneId:lane.id,airDraftM:number('is-air-draft',19,1,120),speedKnots:10});const check=sim.clearance(ship,lane);status('14.5 · '+(check.passable?'Судно допущено по условному воздушному габариту':'Судно не проходит по условному габариту')+'; глубины не проверены.');refresh();}
function loads(){const L=number('is-span',220,5,2000),mass=number('is-mass',45,0,300),q=sim.bridge.uniformLoadNPerM;sim.bridge.spanM=L;sim.bridge.EI_Nm2=number('is-ei',2.8,.01,100)*1e12;const r=sim.calculateBridge({spanM:L,pointLoads:[{x:L/2,forceN:mass*1000*9.81}],uniformLoadNPerM:q});
 $('is-load-results').textContent=`Опоры: Rₐ ${(r.supports.leftN/1000).toFixed(1)} кН, Rᵦ ${(r.supports.rightN/1000).toFixed(1)} кН; изгиб ${(r.maxMomentNm/1e6).toFixed(2)} МН·м; прогиб ${(r.maxDeflectionM*1000).toFixed(2)} мм. Условная балка, E·I задано, без инженерной верификации.`;drawBeam(r);status('14.6 · Равновесие и формула прогиба проверяются автоматическими тестами');}
function foundation(){const f=sim.setFoundation(editor.objects.find(x=>x.catalogId==='bridge-pier')?.id||null,{kind:$('is-foot-kind').value,soil:$('is-soil').value,widthM:6,lengthM:6,loadKN:number('is-foot-load',2000,10,200000)});const r=sim.foundationReport(f);
 $('is-foot-results').textContent=`Давление ${r.pressureKpa.toFixed(1)} кПа / допустимое ${r.capacityKpa.toFixed(1)} кПа · осадка (условная) ${(r.settlementM*1000).toFixed(1)} мм · загрузка ${(r.utilization*100).toFixed(0)}% · ${r.pass?'проверка игровых порогов пройдена':'превышен игровой порог'}. Требуется геотехника для реального проекта.`;
 status('14.7 · Расчётное основание сохранено в модели и доступно в JSON');}
function updateWeather(){sim.setWeather({rain:number('is-rain',0,0,100)/100,fog:number('is-fog',0,0,100)/100,windMps:number('is-wind',3,0,40),night:$('is-night').checked});refresh();status(`14.8 · Коэффициент скорости авто ${sim.speedFactor('road').toFixed(2)}, Ж/Д ${sim.speedFactor('rail').toFixed(2)}, судов ${sim.speedFactor('ship').toFixed(2)}`);}
function snapshot(){const s=sim.captureScenario('Сценарий '+(sim.scenarios.length+1));status('14.9 · Снимок '+s.name+' сохранён');refresh();}
function compare(){if(sim.scenarios.length<2)throw Error('Нужно минимум два снимка');const r=sim.compareScenarios(sim.scenarios.at(-2),sim.scenarios.at(-1));$('is-comparison').textContent=`${r.baseline} → ${r.alternative}: Δ авто ${r.delta.carsCompleted}, Δ прибывших поездов ${r.delta.trainArrivals}; Δ скорости авто ${r.delta.roadSpeedFactor.toFixed(2)}; Δ прогиба ${(r.delta.maxDeflectionM*1000).toFixed(2)} мм. Устойчивость по игровым порогам: балка ${r.alternativeStability.beamWithinDemoLimit?'✓':'!'}, основания ${r.alternativeStability.footingsWithinDemoLimit?'✓':'!'}, габарит судов ${r.alternativeStability.navigationAirClearancePass?'✓':'!'}. Верификация реального проекта отсутствует.`;status('14.9 · Два сценария сравнены, исходные данные не изменены');}
function download(){const blob=new Blob([JSON.stringify({format:'TrussLab-InfrastructureBundle',version:1,editor:editor.export(),sim:sim.export()},null,2)],{type:'application/json'}),u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='TrussLab_InfrastructureSim_Project.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);status('Проект WorldEditor + InfrastructureSim экспортирован в JSON');}
function restore(data){if(data?.format!=='TrussLab-InfrastructureBundle'||data.version!==1)throw Error('Ожидался проект InfrastructureBundle');editor.import(data.editor);sim.import(data.sim);fit();refresh();status('Редактор и транспортная модель восстановлены из JSON');}
const actions={'is-demo':demo,'is-sync':()=>{sim.rebuild(true);fit();refresh();status('Граф обновлён из объектов WorldEditor')},'is-route':queryRoute,'is-fit':fit,'is-signal':()=>{if(!sim.rail.edges.length)throw Error('Нет железной дороги');sim.addSignal(Math.floor(sim.rail.edges.length/2));status('Сигнал установлен на участке Ж/Д');refresh()},'is-car-one':()=>addCars(1),'is-car-ten':()=>addCars(12),'is-train':createTrain,'is-ship':createShip,'is-load':loads,'is-foundation':foundation,'is-snapshot':snapshot,'is-compare':compare,'is-export':download,'is-import':()=>$('is-file').click()};
root.addEventListener('click',e=>{const t=e.target.closest('button');if(!t||!(t.id in actions))return;try{actions[t.id]()}catch(err){status('Ошибка: '+err.message)}});
$('is-pause').addEventListener('click',()=>{playing=!playing;$('is-pause').textContent=playing?'⏸ Пауза':'▶ Пуск';status(playing?'Симуляция запущена':'Симуляция приостановлена')});
$('is-agent-cap').addEventListener('change',()=>{sim.agentCap=number('is-agent-cap',56,1,250);status('Ограничение агентов: '+sim.agentCap);refresh()});
$('is-traffic-rate').addEventListener('change',()=>{sim.trafficFlowCarsPerMinute=number('is-traffic-rate',12,0,120);status('Поток авто: '+sim.trafficFlowCarsPerMinute+'/мин')});
$('is-auto-traffic').addEventListener('change',e=>{sim.autoTraffic=e.target.checked;status(sim.autoTraffic?'Автоматический поток включён':'Автоматический поток отключён')});
for(const id of ['is-rain','is-fog','is-wind','is-night'])$(id).addEventListener('input',updateWeather);
$('is-file').addEventListener('change',async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>8_000_000)throw Error('Файл проекта слишком большой');restore(JSON.parse(await f.text()))}catch(err){status('Импорт не удался: '+err.message)}e.target.value='';});
c.addEventListener('pointerdown',e=>{pan={x:e.clientX,y:e.clientY,origin:[...origin]};c.setPointerCapture(e.pointerId)});c.addEventListener('pointermove',e=>{if(!pan)return;origin[0]=pan.origin[0]-(e.clientX-pan.x)/scale;origin[1]=pan.origin[1]-(e.clientY-pan.y)/scale;draw()});c.addEventListener('pointerup',()=>pan=null);c.addEventListener('pointercancel',()=>pan=null);
c.addEventListener('wheel',e=>{e.preventDefault();const prev=scale;scale=clamp(scale*(e.deltaY<0?1.12:1/1.12),.035,3);const r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;origin[0]+=(x-r.width/2)*(1/prev-1/scale);origin[1]+=(y-r.height/2)*(1/prev-1/scale);draw()},{passive:false});
function frame(now){if(!visible)return;const dt=Math.min(.12,Math.max(0,(now-last)/1000));last=now;try{if(playing&&dt>0)sim.step(dt*36);draw();if(now-lastReport>350){refresh();lastReport=now}}catch(err){status('Симуляция: '+err.message);playing=false;}RAF=requestAnimationFrame(frame)}
window.addEventListener('resize',()=>visible&&fit());
})();

/* CitySim 15.1 preview — aggregated, deterministic city services.
   Populations/jobs are game abstractions; no claim of census-level modelling. */
(function(root){'use strict';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const finite=x=>Number.isFinite(x);
function nearestDistance(o,roads){let best=Infinity;
 for(const road of roads){for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz;
  const t=den?clamp(((o.x-a[0])*dx+(o.z-a[1])*dz)/den,0,1):0;
  best=Math.min(best,Math.hypot(o.x-a[0]-dx*t,o.z-a[1]-dz*t));
 }}return best;
}
class CitySimCore{
 constructor(editor){if(!editor||!Array.isArray(editor.objects))throw Error('Editor required');this.editor=editor;this.day=0;this.population=0;this.treasury=250000;this.lastRevenue=0;this.lastExpenses=0;this.lastDay=0;this.baseTax=.12;this.cachedRevision=-1;this._plan=null;}
 plan(){const e=this.editor; if(this.cachedRevision===e.revision&&this._plan)return this._plan;
  const buildings=e.objects.filter(o=>o.type==='building'), roads=e.objects.filter(o=>o.type==='road'&&o.points?.length>1);
  const homes=[],jobs=[],schools=[],clinics=[],shops=[],utilities=[];
  let housing=0,jobSlots=0,schoolSeats=0,clinicSlots=0;
  for(const o of buildings){const floors=clamp(Math.round(+o.floors||1),1,80),roadDistance=nearestDistance(o,roads);
   const access=roads.length?clamp(1-Math.max(0,roadDistance-65)/450,.25,1):.55;
   const b={id:o.id,x:+o.x,z:+o.z,roadDistance,access,kind:o.catalogId||'house'};
   switch(o.catalogId){
    case 'house':b.units=1;housing+=3*access;homes.push(b);break;
    case 'apartment':b.units=floors*6;housing+=b.units*2.2*access;homes.push(b);break;
    case 'office':b.jobs=floors*14;jobSlots+=b.jobs*access;jobs.push(b);break;
    case 'warehouse':b.jobs=Math.max(6,Math.round(o.width*o.length/65));jobSlots+=b.jobs*access;jobs.push(b);break;
    case 'shop':b.jobs=8*floors;jobSlots+=b.jobs*access;jobs.push(b);shops.push(b);break;
    case 'school':b.seats=125*floors;schoolSeats+=b.seats;schools.push(b);break;
    case 'clinic':b.slots=130*floors;clinicSlots+=b.slots;clinics.push(b);break;
    case 'substation':case 'water-pump': utilities.push(b);break;
   }
  }
  const proximity=(builds,radius)=>{if(!homes.length||!builds.length)return 0;let total=0,covered=0;
   for(const h of homes){let count=h.units||1;total+=count;
    if(builds.some(s=>Math.hypot(h.x-s.x,h.z-s.z)<=radius))covered+=count;
   }return total?covered/total:0;
  };
  const out={housingCapacity:Math.floor(housing),jobCapacity:Math.floor(jobSlots),schoolSeats,clinicSlots,homeCount:homes.length,commercialCount:shops.length,workplaces:jobs.length,roads:roads.length,roadKm:roads.reduce((s,o)=>s+o.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-o.points[i][0],p[1]-o.points[i][1]),0)/1000,0),schoolCoverage:proximity(schools,900),healthCoverage:proximity(clinics,1400),schools:schools.length,clinics:clinics.length, utilities:utilities.length};
  this._plan=out;this.cachedRevision=e.revision;return out;
 }
 step(days=1){if(!finite(days)||days<0||days>365)throw Error('Invalid duration');
  const p=this.plan();for(let k=0;k<Math.floor(days);k++){
   const target=Math.min(p.housingCapacity,Math.round(p.jobCapacity/.43 + p.housingCapacity*.12));
   const inward=target>this.population?clamp((target-this.population)*.055+1,0,Math.max(1,target-this.population)): -Math.min(this.population-target,(this.population-target)*.03+1);
   this.population=Math.round(clamp(this.population+inward,0,p.housingCapacity));
   const employed=Math.min(Math.round(this.population*.47),p.jobCapacity);
   this.lastRevenue=Math.round(this.population*.8*this.baseTax*15+employed*.45);
   this.lastExpenses=Math.round((p.roadKm*6)+(p.schools*110)+(p.clinics*140)+this.population*.018);
   this.treasury+=this.lastRevenue-this.lastExpenses;this.day++;
  }this.lastDay=this.day;return this.report();
 }
 report(){const p=this.plan(),employed=Math.min(Math.round(this.population*.47),p.jobCapacity);
  return {...p,day:this.day,population:this.population,households:Math.round(this.population/2.35),employed,unemployed:Math.max(0,Math.round(this.population*.47)-employed),housingDemand:Math.max(0,Math.round((p.jobCapacity/.47)-p.housingCapacity)),treasury:Math.round(this.treasury),revenue:this.lastRevenue,expenses:this.lastExpenses,schoolCoverage:p.schoolCoverage,healthCoverage:p.healthCoverage};
 }
 export(){return {format:'TrussLab-CitySim',version:1,day:this.day,population:this.population,treasury:this.treasury,lastRevenue:this.lastRevenue,lastExpenses:this.lastExpenses,baseTax:this.baseTax};}
 import(d){if(!d||d.format!=='TrussLab-CitySim'||d.version!==1||![d.day,d.population,d.treasury,d.lastRevenue,d.lastExpenses,d.baseTax].every(finite)||d.day<0||d.day>1e7||d.population<0||d.population>1e8||d.baseTax<0||d.baseTax>1)throw Error('Unsupported CitySim file');
  this.day=d.day;this.population=d.population;this.treasury=d.treasury;this.lastRevenue=d.lastRevenue;this.lastExpenses=d.lastExpenses;this.baseTax=d.baseTax;this._plan=null;return this.report();}
}
root.TrussLabCitySimCore=CitySimCore;
})(typeof globalThis!=='undefined'?globalThis:this);

/* TrussLab 15.1 — editable region in the real 3D viewport; CitySim dashboard.
   Build operations use original georeferenced WorldEditor objects. No network. */
(function(){'use strict';
if(typeof document==='undefined'||typeof region3d==='undefined'||!globalThis.trusslabEditor||!globalThis.TrussLabCitySimCore)return;
const editor=globalThis.trusslabEditor,sim=new globalThis.TrussLabCitySimCore(editor);
globalThis.trusslabCitySim=sim;
const $=id=>document.getElementById(id),ui=document.createElement('section');
let active=false,tool='camera',lineStart=null,pointer=null,model='house',autosaveTime=0;
ui.id='citysim-controls';ui.hidden=true;ui.innerHTML=`
<div class="cs-header"><strong>🏙️ WORLDMAP · <span id="cs-tool-name">ОБЗОР</span></strong><button id="cs-hide" title="Свернуть панель">▾</button></div>
<div id="cs-body">
<div class="cs-info">Редактируйте непосредственно 3D-рельеф. Метры ENU, координаты приблизительные; исходный DEM не изменяется.</div>
<div class="cs-tools">
 <button data-cs-tool="camera" class="selected">✥ Обзор</button><button data-cs-tool="house">⌂ Дом</button><button data-cs-tool="apartment">▥ Жилой дом</button><button data-cs-tool="office">▣ Офис</button>
 <button data-cs-tool="shop">▤ Магазин</button><button data-cs-tool="school">▦ Школа</button><button data-cs-tool="clinic">✚ Клиника</button><button data-cs-tool="road">═ Дорога</button><button data-cs-tool="rail">≋ Рельсы</button>
 <button data-cs-tool="raise">⛰ Поднять</button><button data-cs-tool="lower">⛏ Опустить</button>
</div>
<div class="cs-settings"><label>Радиус <input id="cs-radius" type="number" min="10" max="450" value="65" step="5"> м</label><label>Высота <input id="cs-height" type="number" min="0.2" max="15" value="3" step="0.5"> м</label></div>
<div class="cs-actions"><button id="cs-finish">✓ Линия</button><button id="cs-cancel">× Отмена линии</button><button id="cs-undo">↶ Правка</button><button id="cs-redo">↷ Правка</button><button id="cs-2d">▦ 2D редактор</button></div>
<div class="cs-metrics"><b>15.1 / АГРЕГИРОВАННЫЙ ГОРОД</b><div class="cs-numbers"><div><strong id="cs-pop">0</strong><small>жителей</small></div><div><strong id="cs-jobs">0</strong><small>рабочих мест</small></div><div><strong id="cs-home">0</strong><small>вместимость жилья</small></div><div><strong id="cs-budget">250 000</strong><small>бюджет, ₮</small></div></div><div id="cs-services">Школы 0% · Медицина 0%</div></div>
<div class="cs-actions"><button id="cs-day">▶ +30 дней</button><button id="cs-save">↓ Сохранить</button><button id="cs-import">↑ Загрузить</button><button id="cs-demo">＋ Демо-квартал</button></div>
<div class="cs-status" id="cs-status" role="status">Выбери инструмент. В 3D нажми на сушу для строительства. Перетаскивание — камера.</div>
</div><input id="cs-file" type="file" accept=".json,application/json" hidden>
`;
$('region3d-overlay').appendChild(ui);
const launch=document.createElement('button');launch.id='citysim-launch';launch.type='button';launch.textContent='🏙️ WorldMap 3D';launch.title='Строить города прямо на метрической 3D-карте';
const nav=document.querySelector('.scene-header .views');(nav||document.querySelector('.topbar')||document.body).appendChild(launch);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const note=s=>{const e=$('cs-status');if(e)e.textContent=s;};
function refresh(){const r=sim.report();$('cs-pop').textContent=r.population.toLocaleString('ru-RU');$('cs-jobs').textContent=r.jobCapacity.toLocaleString('ru-RU');$('cs-home').textContent=r.housingCapacity.toLocaleString('ru-RU');$('cs-budget').textContent=r.treasury.toLocaleString('ru-RU');$('cs-services').textContent=`Школы ${(r.schoolCoverage*100).toFixed(0)}% · Медицина ${(r.healthCoverage*100).toFixed(0)}% · Дороги ${r.roadKm.toFixed(1)} км · День ${r.day}`;}
function switchTool(t){tool=t;lineStart=null;ui.querySelectorAll('[data-cs-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.csTool===t));$('cs-tool-name').textContent=({'camera':'ОБЗОР','house':'ДОМ','apartment':'ЖИЛОЙ ДОМ','office':'ОФИС','shop':'МАГАЗИН','school':'ШКОЛА','clinic':'КЛИНИКА','road':'ДОРОГА','rail':'Ж/Д','raise':'ПОДЪЁМ','lower':'ВЫЕМКА'})[t]||t;region3d.assetEditMode=false; if(t!=='camera'&&window.innerWidth<=700){ui.classList.add('collapsed');$('cs-hide').textContent='▴';}note(t==='camera'?'Перетаскивание вращает FreeCam; колесо — пролёт.':t==='road'||t==='rail'?'Поставь первую точку на суше, затем вторую. Далее продолжай маршрут.':'Нажми на сушу в 3D. Для вращения камеры перетаскивай.');}
function setVisible(yes){active=yes;ui.hidden=!yes;if(yes){refresh();switchTool('camera');}else{lineStart=null;}}
function open(){if(globalThis.TrussLabWorldEditorUI)globalThis.TrussLabWorldEditorUI.close();if(globalThis.TrussLabInfrastructureUI?.close)globalThis.TrussLabInfrastructureUI.close();
 region3d.geoPack=world3d.geoPack;region3d.open(45.32503,36.47020);
 // Start in an elevated construction view; this remains an existing geographic area.
 region3d.pitch=-.96;region3d.cam.y=Math.max(region3d.cam.y,190);region3d.assetEditMode=false;setVisible(true);
}
function makeHit(sx=.5,sy=.5){const rect=region3d.canvas.getBoundingClientRect();const hit=regionAssetRaycast(region3d.geoPack,region3d.cam,region3d.forward(),{screenX:sx,screenY:sy,aspect:rect.width/rect.height,coordinateMode:'ENU',maxDistance:6000});
 if(!hit||!Number.isFinite(hit.lat)||!Number.isFinite(hit.lon))return null;
 const loc=editor.local(hit.lat,hit.lon);if(!loc.every(Number.isFinite))return null;return {x:loc[0],z:loc[1],lat:hit.lat,lon:hit.lon,height:hit.height};}
function apply(hit){if(!hit){note('Нет точки на известной суше. Направь камеру вниз или выбери «Керчь». На воде строительство не разрешено.');return;}
 const {x,z}=hit;
 if(tool==='camera')return;
 if(tool==='raise'||tool==='lower'){
  const radius=clamp(Number($('cs-radius').value)||65,10,450),amount=clamp(Number($('cs-height').value)||3,.2,15);
  editor.paintTerrain(x,z,radius,amount,tool==='raise'?'raise':'lower');note(`${tool==='raise'?'Рельеф поднят':'Рельеф понижен'} на ${amount} м в центре кисти ${radius} м. Исходный DSM сохранён.`);
 }else if(tool==='road'||tool==='rail'){
  if(!lineStart){lineStart=[x,z];note('Начало линии установлено. Нажми вторую точку в 3D.');return;}
  if(Math.hypot(x-lineStart[0],z-lineStart[1])<3){note('Точки дороги слишком близко.');return;}
  editor.addPath(tool,[lineStart,[x,z]],tool==='road'?{width:9,label:'Новая улица',speedKph:50}:{width:4,label:'Двухпутный участок',tracks:2});lineStart=[x,z];note('Сегмент создан. Следующий клик продолжит маршрут, «× Отмена линии» закончит.');
 }else{
  const validation=editor.validatePlacement(tool,x,z);if(!validation.ok)throw Error(validation.reason);
  const o=editor.addModel(tool,x,z,{label:editor.catalog.find(e=>e.id===tool)?.name||tool});
  note(`Объект ${o.label} построен · ${hit.lat.toFixed(5)}°N ${hit.lon.toFixed(5)}°E · сохранён в WorldEditor`);
 }
 refresh();autoSave();
}
function screenHit(e){const r=region3d.canvas.getBoundingClientRect();return makeHit((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);}
region3d.canvas.addEventListener('pointerdown',e=>{if(!active||!region3d.active||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0};});
region3d.canvas.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;pointer.moved+=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y);pointer.x=e.clientX;pointer.y=e.clientY;});
region3d.canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const click=pointer.moved<7;pointer=null;if(!active||!region3d.active||!click||tool==='camera')return;
 try{apply(screenHit(e));}catch(err){note('Ошибка: '+err.message);}});
region3d.canvas.addEventListener('pointercancel',()=>pointer=null);
function save(){const data={format:'TrussLab-CityWorld',version:1,editor:editor.export(),citysim:sim.export()};const str=JSON.stringify(data);const blob=new Blob([str],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='trusslab_cityworld_15_1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);note('Проект сохранён в JSON. Исходный DEM не меняется.');}
function autoSave(){try{const s=JSON.stringify({format:'TrussLab-CityWorld',version:1,editor:editor.export(),citysim:sim.export()});if(s.length<2_200_000)localStorage.setItem('trusslab_cityworld_preview',s);}catch(_){}}
function restore(data){if(!data||data.format!=='TrussLab-CityWorld'||data.version!==1)throw Error('Нужен проект TrussLab-CityWorld');if(JSON.stringify(data).length>6_000_000)throw Error('Файл слишком большой');editor.import(data.editor);sim.import(data.citysim);lineStart=null;refresh();autoSave();note('Сохранённые здания, дороги, рельеф и городская статистика восстановлены.');}
function demo(){// Place a small, fictional quarter near a DEM-verified land point.
 const base=makeHit(.5,.58)||makeHit(.5,.7);
 if(!base){note('Для демо посмотри вниз на сушу, затем повтори.');return;}
 const {x,z}=base;if(editor.objects.some(o=>o.label==='CITYSIM 15.1 DEMO')){note('Демо-квартал уже построен, используй кисть или другие инструменты.');return;}
 const onGround=(a,b)=>{const g=metricGround(region3d.geoPack,a,b);return g.measured&&g.land};
 const layout=[['apartment',-85,-35],['house',-55,35],['house',-15,40],['office',85,-40],['shop',45,38],['school',120,55],['clinic',150,110]];
 let count=0;for(const [id,dx,dz] of layout){if(!onGround(x+dx,z+dz))continue;const o=editor.addModel(id,x+dx,z+dz,{label:count===0?'CITYSIM 15.1 DEMO':id});count++;}
 if(onGround(x-100,z)&&onGround(x+140,z))editor.addPath('road',[[x-100,z],[x+140,z]],{width:9,label:'Учебная улица',speedKph:45});
 sim.step(30);refresh();autoSave();note(`Демо-квартал: ${count} построек; прошло 30 игровых дней. География региона остаётся исходной.`);
}
ui.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;
 try{const t=button.dataset.csTool;if(t){switchTool(t);return;}
 switch(button.id){
  case 'cs-hide':ui.classList.toggle('collapsed');button.textContent=ui.classList.contains('collapsed')?'▴':'▾';break;
  case 'cs-finish':lineStart=null;note('Текущая линия завершена.');break;
  case 'cs-cancel':lineStart=null;note('Продолжение линии отменено. Созданные сегменты сохранены.');break;
  case 'cs-undo':editor.undo();lineStart=null;refresh();autoSave();note('Последняя правка отменена.');break;
  case 'cs-redo':editor.redo();refresh();autoSave();note('Правка восстановлена.');break;
  case 'cs-2d':region3d.close();setVisible(false);globalThis.TrussLabWorldEditorUI.open();break;
  case 'cs-day':sim.step(30);refresh();autoSave();note('Симуляция продвинута на 30 суток. Это игровая агрегированная модель.');break;
  case 'cs-save':save();break;
  case 'cs-import':$('cs-file').click();break;
  case 'cs-demo':demo();break;
 }
 }catch(err){note('Ошибка: '+err.message);}
});
$('cs-file').addEventListener('change',async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>6_000_000)throw Error('Файл слишком большой');restore(JSON.parse(await f.text()));}catch(err){note('Ошибка импорта: '+err.message);}e.target.value='';});
launch.addEventListener('click',open);
// Keep panel state consistent if the Region3D close button is used directly.
const previousClose=region3d.close.bind(region3d);region3d.close=function(...args){setVisible(false);return previousClose(...args);};
try{const saved=localStorage.getItem('trusslab_cityworld_preview');if(saved&&saved.length<2_200_000)restore(JSON.parse(saved));}catch(_){/* private mode */}
refresh();
globalThis.TrussLabCityWorld={open,apply,makeHit,save,restore,demo,core:sim,editor,switchTool};
})();
