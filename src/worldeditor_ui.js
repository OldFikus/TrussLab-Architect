/* WorldEditor 2 browser interface. No external requests. */
(function(){'use strict';
if(typeof document==='undefined'||!globalThis.TrussLabWorldEditorCore)return;
const {WorldEditorCore,CATALOG,ANCHOR}=globalThis.TrussLabWorldEditorCore;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const editor=new WorldEditorCore();globalThis.trusslabEditor=editor;
let visible=false,tool='select',pts=[],selected=null,mode='2d',zoom=1,originX=0,originZ=0,catalog='house',zone='residential',network='water',material='concrete',lastPointer=null,panAnchor=null,dragSelection=null,hover=null,brushRadius=90,brushDelta=2,batchPage=0,batchSelected=new Set(),layerShow={parcel:true,building:true,road:true,sidewalk:true,rail:true,utility:true,terrain:true,interchange:true,switch:true},background=null,importSelected=[],message='';
const DIMS={width:32000,height:25000};
const button=(id,label,title='')=>`<button type="button" id="${id}" title="${esc(title)}">${label}</button>`;
const ui=document.createElement('section');ui.id='we-root';ui.hidden=true;ui.innerHTML=`
<div class="we-head"><div><div class="we-kicker">TRUSSLAB / WORLD EDITOR 2 · WGS84</div><strong>Региональный редактор</strong><small id="we-source-note">Керчь · Тузла · Тамань · цифровая карта с приблизительной привязкой</small></div><div class="we-actions">${button('we-view','◇ 3D-схема')}${button('we-save','↓ JSON')}${button('we-load','↑ JSON')}${button('we-close','✕ Закрыть')}</div></div>
<div class="we-body"><aside class="we-left">
<div class="we-section"><b>01 / ИНСТРУМЕНТЫ</b><div class="we-tools" id="we-tools">
${[['select','⌖ Выбор'],['pan','✥ Панорама'],['parcel','▱ Участок'],['building','▦ Здание'],['road','═ Улица'],['sidewalk','╱ Тротуар'],['interchange','⤳ Развязка'],['rail','≋ Ж/Д'],['switch','⋈ Стрелка'],['utility','⚡ Сеть'],['terrain','⛰ Рельеф']].map(([id,text])=>`<button type="button" data-tool="${id}" class="${id==='select'?'active':''}">${text}</button>`).join('')}
</div></div>
<div class="we-section"><b>02 / ПАРАМЕТРЫ</b><label>Зонирование <select id="we-zone"><option value="residential">Жилая зона</option><option value="commercial">Коммерческая</option><option value="industrial">Промышленная</option><option value="park">Зелёная зона</option></select></label><label>Модель <select id="we-catalog">${CATALOG.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label><small id="we-author">Автор: TrussLab procedural · CC0 / original</small><label>Инженерная сеть <select id="we-network"><option value="water">Водоснабжение</option><option value="power">Электросеть</option><option value="sewage">Канализация</option><option value="telecom">Связь</option></select></label><label>Материал <select id="we-material"><option value="concrete">Бетон</option><option value="steel">Сталь</option><option value="brick">Кирпич</option><option value="glass">Стекло</option><option value="wood">Дерево</option><option value="asphalt">Асфальт</option></select></label><div class="we-2col"><label>Кисть, м<input id="we-brush-radius" type="number" min="5" max="2000" value="90"></label><label>Смещение, м<input id="we-brush-delta" type="number" min="0.1" max="50" value="2" step="0.5"></label></div><div class="we-row">${button('we-terrain-up','↑ Насыпь')}${button('we-terrain-down','↓ Выемка')}</div></div>
<div class="we-section"><b>03 / СЛОИ</b><div class="we-layer-list" id="we-layer-list">${[['parcel','Зоны'],['building','Здания'],['road','Улицы'],['sidewalk','Тротуары'],['rail','Рельсы'],['utility','Коммуникации'],['terrain','Отдельный рельеф'],['interchange','Развязки'],['switch','Стрелки']].map(([id,name])=>`<label><input type="checkbox" data-layer="${id}" checked>${name}</label>`).join('')}</div></div>
</aside>
<div class="we-map-panel"><div class="we-map-tools"><span id="we-mode">РЕЖИМ: ВЫБОР</span><div>${button('we-finish','✓ Завершить', 'Завершить полигон/линию')}${button('we-cancel','× Сброс')}${button('we-undo','↶')}${button('we-redo','↷')}${button('we-zoom-in','+')}${button('we-zoom-out','−')}</div></div><canvas id="we-canvas" tabindex="0" aria-label="Редактор карты в метрах; клик для построения"></canvas><div class="we-map-footer"><span id="we-coord">WGS84 · ENU · метры</span><span id="we-count">0 объектов</span></div><div id="we-message" role="status">Нажимайте точки карты. Колесо/кнопки — масштаб; правая кнопка — панорамирование. Координаты являются приближёнными.</div></div>
<aside class="we-right"><div class="we-section"><b>04 / ОБЪЕКТ</b><div id="we-inspector">Выберите объект на карте</div></div>
<div class="we-section"><b>05 / ВЕРСИИ</b><label>Название снимка<input id="we-snapname" value="Контрольная точка"></label><div class="we-row">${button('we-snapshot','＋ Снимок')}${button('we-restore','↺ Вернуть')}</div><select id="we-snapshot-select"></select><div class="we-row">${button('we-export-geo','↓ GeoJSON')}${button('we-reset','Очистить')}</div></div>
<div class="we-section"><b>06 / GIS-РАССТАНОВКА</b><p>Импорт GeoJSON-полигонов. Каждая точка требует подтверждения перед созданием объектов.</p>${button('we-gis-import','↑ GeoJSON')}${button('we-gis-demo','▤ Пример участка')}<div id="we-batch" class="we-batch">Нет предложений на проверку.</div><div class="we-row">${button('we-approve','✓ Подтвердить')}${button('we-reject','× Отклонить')}</div></div>
<div class="we-section"><b>07 / КОНТРОЛЬ</b>${button('we-geo-check','⌖ Проверить привязку')}${button('we-alignment','↑ Оси GeoJSON')}${button('we-network-check','⚡ Проверить сети')}<div id="we-geo-info" class="we-info">География приблизительная. Нет подтверждённых as-built осей моста и инженерных отметок — точность 1:1 пока не подтверждена.</div></div></aside>
</div><input id="we-file" type="file" accept=".json,.geojson,application/json" hidden>
`;
document.body.appendChild(ui);
const canvas=$('we-canvas'),ctx=canvas.getContext('2d');let dpr=1, cw=900,ch=650;
function note(txt){message=txt;$('we-message').textContent=txt;}
function w2s(x,z){const w=canvas.clientWidth||cw,h=canvas.clientHeight||ch;const scale=Math.min(w/DIMS.width,h/DIMS.height)*zoom;return [w/2+(x-originX)*scale,h/2+(z-originZ)*scale]}
function s2w(sx,sy){const w=canvas.clientWidth||cw,h=canvas.clientHeight||ch;const scale=Math.min(w/DIMS.width,h/DIMS.height)*zoom;return [originX+(sx-w/2)/scale,originZ+(sy-h/2)/scale]}
function bg(){if(background)return background;const out=document.createElement('canvas');out.width=225;out.height=175;const c=out.getContext('2d'),im=c.createImageData(out.width,out.height);const pack=(typeof world3d!=='undefined'&&world3d.geoPack)?world3d.geoPack:null;const coast=(typeof sampleCoast==='function'&&pack)?sampleCoast:null;const dem=(typeof sampleDem==='function'&&pack)?sampleDem:null;
for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){
 const east=(x/out.width-.5)*DIMS.width,north=(y/out.height-.5)*DIMS.height;const sx=east/80,sz=north/80;
 const land=coast?coast(pack,sx,sz):0.3;const elevation=dem?dem(pack,sx,sz):0;
 const shore=land>=.52,noise=((x*31+y*17)%13)/13;
 const color=shore?[80+noise*13,105+Math.max(0,Math.min(25,(elevation||0)*.08)),77+noise*12]:[27+noise*5,77+noise*9,94+noise*9];
 let i=(y*out.width+x)*4;im.data[i]=color[0];im.data[i+1]=color[1];im.data[i+2]=color[2];im.data[i+3]=255;
}c.putImageData(im,0,0);background=out;return out;}
function bridgeAxisAudit(){
 if(typeof world3d==='undefined'||typeof world3d.kerchBounds!=='function')return null;
 const b=world3d.kerchBounds(),tracks={};
 for(const [name,side] of [['road',b.roadSide],['rail',b.railSide]]){
  let total=0,last=null;for(let i=0;i<=300;i++){
   const x=b.x0+(b.x1-b.x0)*i/300,z=world3d.trackCenter(x,side),p=[x,z];
   if(last)total+=Math.hypot(x-last[0],z-last[1])*80;last=p;
  }
  let start=world3d.geoPack?.coast?sampleCoast(world3d.geoPack,b.x0,world3d.trackCenter(b.x0,side)):null;
  let end=world3d.geoPack?.coast?sampleCoast(world3d.geoPack,b.x1,world3d.trackCenter(b.x1,side)):null;
  tracks[name]={lengthMetres:total,km:total/1000,startLand:start===null?null:start>.5,endLand:end===null?null:end>.5,verified:false};
 }
 return tracks;
}
function path(points,close=false){ctx.beginPath();points.forEach(([x,z],i)=>{const [sx,sy]=w2s(x,z);if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy)});if(close)ctx.closePath();}
function draw(){if(!visible)return;dpr=Math.min(devicePixelRatio||1,2);const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;cw=rect.width;ch=rect.height;const rw=Math.round(cw*dpr),rh=Math.round(ch*dpr);if(canvas.width!==rw||canvas.height!==rh){canvas.width=rw;canvas.height=rh;}ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#112934';ctx.fillRect(0,0,cw,ch);
 if(mode==='2d'){
 const [x0,y0]=w2s(-DIMS.width/2,-DIMS.height/2),[x1,y1]=w2s(DIMS.width/2,DIMS.height/2);ctx.imageSmoothingEnabled=true;ctx.drawImage(bg(),x0,y0,x1-x0,y1-y0);
 const major=2000;ctx.lineWidth=1;ctx.strokeStyle='rgba(211,237,239,.12)';for(let x=-16000;x<=16000;x+=major){let a=w2s(x,-13000),b=w2s(x,13000);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke()}for(let z=-12000;z<=12000;z+=major){let a=w2s(-17000,z),b=w2s(17000,z);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke()}
 }else{
 ctx.fillStyle='#173f4a';ctx.fillRect(0,0,cw,ch);
 // Isometric schematic world preview, not a photogrammetric render.
 ctx.save();ctx.translate(cw/2,ch/2);ctx.transform(.78,-.22,.48,.45,0,0);ctx.translate(-cw/2,-ch/2);
 const [x0,y0]=w2s(-DIMS.width/2,-DIMS.height/2),[x1,y1]=w2s(DIMS.width/2,DIMS.height/2);ctx.drawImage(bg(),x0,y0,x1-x0,y1-y0);ctx.restore();
 ctx.fillStyle='rgba(7,23,34,.72)';ctx.fillRect(12,12,Math.min(cw-24,400),38);ctx.fillStyle='#cde2e4';ctx.font='12px system-ui';ctx.fillText('3D-СХЕМА · визуализация объёмов и объектов',20,36);
 }
 if(mode==='3d'){ctx.save();ctx.translate(cw/2,ch/2);ctx.transform(.78,-.22,.48,.45,0,0);ctx.translate(-cw/2,-ch/2);}
 // Baseline from the legacy bridge is shown only as an illustrative sketch.
 // Never label the existing 25km spline as a surveyed 19km alignment.
 if(typeof world3d!=='undefined'&&typeof world3d.kerchBounds==='function'){
  const b=world3d.kerchBounds();for(const [side,color] of [[b.roadSide,'#efbb77'],[b.railSide,'#83ddd4']]){
   ctx.beginPath();for(let i=0;i<=130;i++){const q=b.x0+(b.x1-b.x0)*i/130;
    const [sx,sy]=w2s(q*80,world3d.trackCenter(q,side)*80);
    if(!i)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
   }ctx.save();ctx.setLineDash([8,5]);ctx.lineWidth=2.3;ctx.strokeStyle=color;ctx.globalAlpha=.72;ctx.stroke();ctx.restore();
  }
 }
 for(const axis of editor.alignment){path(axis.points);ctx.lineWidth=4;ctx.strokeStyle=axis.mode==='rail'?'#80f5ef':'#f9d394';ctx.stroke();}
 for(const item of editor.objects){if(layerShow[item.type]===false)continue;const chosen=item.id===selected;
 if(item.type==='parcel'){path(item.points,true);ctx.fillStyle=({residential:'rgba(130,209,159,.19)',industrial:'rgba(242,166,104,.22)',commercial:'rgba(123,177,232,.20)',park:'rgba(85,193,128,.26)'})[item.zoning]||'#88bb9970';ctx.fill();ctx.strokeStyle=chosen?'#fff8cb':'#a7d9af';ctx.lineWidth=chosen?3:1.8;ctx.stroke();}
 else if(item.type==='building'){
 const [sx,sy]=w2s(item.x,item.z),scale=Math.min(cw/DIMS.width,ch/DIMS.height)*zoom,w=Math.max(3,item.width*scale),h=Math.max(3,item.length*scale),height=Math.max(2,item.floors*2.8*scale);
 ctx.fillStyle=editor.effectiveMaterial(item).color||'#a2c8ce';ctx.strokeStyle=chosen?'#ffe39f':'#0d2a32';ctx.lineWidth=chosen?3:1;
 ctx.fillRect(sx-w/2,sy-h/2-height*(mode==='3d'?.5:0),w,h);ctx.strokeRect(sx-w/2,sy-h/2-height*(mode==='3d'?.5:0),w,h);
 if(mode==='3d'){ctx.fillStyle='rgba(205,229,231,.34)';ctx.beginPath();ctx.moveTo(sx+w/2,sy-h/2-height*.5);ctx.lineTo(sx+w/2+height*.43,sy-h/2-height*.85);ctx.lineTo(sx+w/2+height*.43,sy+h/2-height*.85);ctx.lineTo(sx+w/2,sy+h/2-height*.5);ctx.closePath();ctx.fill();}
 if(w>14&&item.facade==='windows'){ctx.fillStyle='#b5e6ed';for(let i=0;i<Math.min(5,item.floors);i++){ctx.fillRect(sx-w/4,sy-h/3-height*(mode==='3d'?.5:0)+i*h/Math.max(5,item.floors),Math.min(4,w*.14),2);}}
 }else if(item.points){path(item.points);const colors={road:'#f1c987',sidewalk:'#e5ebe5',rail:'#b8c9d7',switch:'#c3bbed',interchange:'#e5b580',utility:({water:'#67c9dc',sewage:'#bb9c79',power:'#ffdf8e',telecom:'#ba9ada'})[item.network]||'#b5adfa'};ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=chosen?'#ffe8aa':colors[item.type]||'#999';ctx.lineWidth=Math.min(15,Math.max(2,((item.width||1)*Math.min(cw/DIMS.width,ch/DIMS.height)*zoom)+(chosen?3:1)));ctx.stroke();}
 }
 // Terrain strokes do not replace or edit the original DEM.
 if(layerShow.terrain){for(const b of editor.terrain){let [sx,sy]=w2s(b.x,b.z),r=b.radius*Math.min(cw/DIMS.width,ch/DIMS.height)*zoom;ctx.beginPath();ctx.arc(sx,sy,Math.max(3,r),0,Math.PI*2);ctx.strokeStyle=b.delta>=0?'rgba(247,203,120,.74)':'rgba(101,185,234,.77)';ctx.lineWidth=2;ctx.stroke();}}
 if(mode==='3d')ctx.restore();
 if(pts.length){path(pts,tool==='parcel'&&pts.length>2);ctx.setLineDash([6,5]);ctx.strokeStyle='#fff3af';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);for(const p of pts){let [sx,sy]=w2s(...p);ctx.fillStyle='#fff3af';ctx.fillRect(sx-3,sy-3,6,6)}}
 if(hover&&pts.length){let [a,b]=w2s(...pts[pts.length-1]),[c,d]=w2s(...hover);ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.setLineDash([3,6]);ctx.strokeStyle='#d8e8dc';ctx.stroke();ctx.setLineDash([])}
 $('we-count').textContent=editor.objects.length+' объектов · '+editor.terrain.length+' правок рельефа';
}
function redraw(){requestAnimationFrame(draw)}
function updateUI(){const o=editor.objects.find(x=>x.id===selected);$('we-inspector').innerHTML=o?`<b>${esc(o.id)} · ${esc(o.type)}</b><small>Геопривязка: ${o.x!==undefined?editor.geographic(o.x,o.z).map(v=>v.toFixed(5)).join('°, ')+'°':'полигон / линия'}</small><label>Название<input id="we-label" value="${esc(o.label||o.catalogId||o.type)}"></label>${o.type==='parcel'?`<label>Функция зоны<select id="we-parcel-zone">${['residential','commercial','industrial','park'].map(z=>`<option value="${z}" ${o.zoning===z?'selected':''}>${z}</option>`).join('')}</select></label>`:''}${o.type==='building'?`<label>Этажей<input id="we-floors" type="number" min="1" max="60" value="${o.floors}"></label><label>Фасад<select id="we-facade"><option value="windows" ${o.facade==='windows'?'selected':''}>Окна</option><option value="panels" ${o.facade==='panels'?'selected':''}>Панели</option><option value="glass" ${o.facade==='glass'?'selected':''}>Остекление</option></select></label>`:''}<label>Материал<select id="we-objmat">${Object.entries(editor.materials).map(([k,v])=>`<option value="${k}" ${o.material===k?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label><label>Родитель (наследование)<select id="we-parent"><option value="">Нет связи</option>${editor.objects.filter(x=>x.id!==o.id).slice(0,60).map(x=>`<option value="${x.id}" ${o.parentId===x.id?'selected':''}>${x.id} · ${x.type}</option>`).join('')}</select></label><label><input id="we-inherit" type="checkbox" ${o.inheritMaterial?'checked':''}> Наследовать материал</label><small>Автор: ${esc(o.author||'TrussLab / пользователь')} · ${esc(o.license||'локальный проект')}</small><label>Новый цвет материала<input id="we-variant-color" type="color" value="${esc(editor.effectiveMaterial(o).color||'#adb4b1')}"></label><button id="we-create-variant">＋ Сохранить вариант материала</button><button id="we-delete">Удалить объект</button>`:'Выберите объект на карте. Для рисования линий нажимайте точки, затем «Завершить».';
 $('we-snapshot-select').innerHTML=editor.snapshots.map((s,i)=>`<option value="${i}">${esc(s.label)} · ${i+1}</option>`).join('');
 $('we-batch').innerHTML=editor.pendingBatch.length?`<p>${editor.pendingBatch.length} объектов на проверке; выбрано ${batchSelected.size}. Ничего не строится автоматически.</p><label><input id="we-batch-all" type="checkbox"> Отметить страницу</label><div class="we-batch-list">${editor.pendingBatch.slice(batchPage*80,(batchPage+1)*80).map((p,i)=>`<label><input type="checkbox" data-batch="${batchPage*80+i}" ${batchSelected.has(batchPage*80+i)?'checked':''}> ${esc(p.catalogId)} · ${p.x.toFixed(0)} / ${p.z.toFixed(0)} м</label>`).join('')}</div><div class="we-row"><button id="we-page-prev" ${batchPage<=0?'disabled':''}>←</button><span>${batchPage+1} / ${Math.ceil(editor.pendingBatch.length/80)}</span><button id="we-page-next" ${batchPage+1>=Math.ceil(editor.pendingBatch.length/80)?'disabled':''}>→</button></div>`:'Нет предложений на проверку.';
 redraw();}
function selectTool(t){tool=t;pts=[];selected=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));$('we-mode').textContent='РЕЖИМ: '+t.toUpperCase();updateUI();note(t==='select'?'Нажмите объект для выбора и изменения свойств.':'Выберите точки на карте; для линии/полигона нажмите «Завершить».');}
function finish(){try{if(tool==='parcel'&&pts.length>=3){const o=editor.addParcel(pts,zone);selected=o.id;note('Земельная зона создана · '+o.area.toFixed(0)+' м²');}
 else if(['road','sidewalk','rail','utility','interchange','switch'].includes(tool)&&pts.length>=2){const p=pts.map(x=>editor.snap(x,16));const o=editor.addPath(tool,p,tool==='utility'?{network}:{});selected=o.id;note('Линейный объект построен: '+tool);}else{note('Добавьте ещё точки');return;}pts=[];updateUI();}catch(err){note(err.message)}}
function save(data,name){const a=document.createElement('a'),link=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=link;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(link),1200)}
function exportGeo(){const features=[];for(const o of editor.objects){let geometry;if(o.type==='building'){geometry={type:'Point',coordinates:editor.geographic(o.x,o.z)}}else if(o.points){geometry=o.type==='parcel'?{type:'Polygon',coordinates:[[...o.points.map(p=>editor.geographic(...p)),editor.geographic(...o.points[0])]]}:{type:'LineString',coordinates:o.points.map(p=>editor.geographic(...p))};}if(geometry)features.push({type:'Feature',properties:{id:o.id,kind:o.type,material:o.material||null,author:o.author||'TrussLab / user',license:o.license||'unknown',zone:o.zoning||null},geometry});}
 save({type:'FeatureCollection',name:'TrussLab WorldEditor 2',features},'TrussLab_WorldEditor_GeoJSON.geojson');}
const editorEl=ui;
editorEl.addEventListener('click',e=>{const target=e.target.closest('button');if(!target)return;let id=target.id;
 try{
 if(target.dataset.tool){selectTool(target.dataset.tool);return}
 if(id==='we-close'){ui.hidden=true;visible=false;return}
 if(id==='we-view'){mode=mode==='2d'?'3d':'2d';target.textContent=mode==='2d'?'◇ 3D-схема':'▤ Карта 2D';redraw();return}
 if(id==='we-finish'){finish();return}if(id==='we-cancel'){pts=[];hover=null;redraw();return}
 if(id==='we-undo'){if(!editor.undo())note('Отменять нечего');selected=null;updateUI();return}
 if(id==='we-redo'){if(!editor.redo())note('Повторять нечего');selected=null;updateUI();return}
 if(id==='we-zoom-in'||id==='we-zoom-out'){zoom=Math.max(.55,Math.min(55,zoom*(id==='we-zoom-in'?1.55:1/1.55)));redraw();return}
 if(id==='we-save'){save(editor.export(),'TrussLab_WorldEditor_Project.json');note('Полный проект экспортирован с зонами и снимками');return}
 if(id==='we-load'){const input=$('we-file');input.dataset.use='project';input.click();return}
 if(id==='we-export-geo'){exportGeo();return}
 if(id==='we-terrain-up'||id==='we-terrain-down'){brushDelta=Math.abs(+$('we-brush-delta').value||2)*(id==='we-terrain-down'?-1:1);note((brushDelta<0?'Выемка':'Насыпь')+' · кликните карту');selectTool('terrain');return}
 if(id==='we-snapshot'){editor.saveSnapshot($('we-snapname').value||'Снимок');note('Контрольный снимок сохранён');updateUI();return}
 if(id==='we-restore'){editor.restoreSnapshot(+$('we-snapshot-select').value);selected=null;updateUI();note('Снимок восстановлен');return}
 if(id==='we-delete'&&selected){editor.remove(selected);selected=null;updateUI();return}
 if(id==='we-reset'){if(!confirm('Очистить редактируемые объекты и рельеф? Источник DEM останется прежним.'))return;editor.mutate(()=>{editor.objects=[];editor.terrain=[];editor.pendingBatch=[]});selected=null;updateUI();return}
 if(id==='we-gis-demo'){const ring=[[-800,-250],[800,-250],[800,480],[-800,480],[-800,-250]].map(p=>editor.geographic(...p));editor.collectGIS({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{name:'Учебный квартал'}}]},catalog,80);batchPage=0;batchSelected.clear();updateUI();note('Предложения сгенерированы; отметьте их вручную перед размещением');return}
 if(id==='we-gis-import'){const input=$('we-file');input.dataset.use='gis';input.click();return}
 if(id==='we-page-prev'||id==='we-page-next'){batchPage=Math.max(0,Math.min(Math.ceil(editor.pendingBatch.length/80)-1,batchPage+(id==='we-page-next'?1:-1)));updateUI();return}
 if(id==='we-batch-all'){return}
 if(id==='we-reject'){editor.mutate(()=>{editor.pendingBatch=[]});batchSelected.clear();batchPage=0;updateUI();note('Предложения отклонены');return}
 if(id==='we-approve'){const indices=[...batchSelected];if(!indices.length){note('Сначала отметьте объекты для размещения');return}const n=editor.approveBatch(indices);batchPage=0;batchSelected.clear();updateUI();note('Размещено '+n+' объектов после ручной проверки');return}
 if(id==='we-network-check'){const r=editor.utilityReport();$('we-geo-info').textContent=Object.entries(r).map(([k,v])=>`${k}: ${v.segments} сегм., ${v.components} компонент, ${(v.lengthMetres/1000).toFixed(2)} км`).join(' · ');return}
 if(id==='we-create-variant'&&selected){const o=editor.objects.find(x=>x.id===selected);const base=editor.materials[o.material]?.base||o.material||'concrete';const name='custom_'+(editor.revision+1);editor.setMaterialVariant(name,base,{color:$('we-variant-color').value,name:'Вариант '+(editor.revision+1)});editor.setObject(selected,{material:name});updateUI();note('Материал создан; связь и наследование сохранены');return}
 if(id==='we-geo-check'){let summ=editor.summary(),axes=editor.alignmentAudit(),legacy=bridgeAxisAudit();const legacyText=legacy?'Демонстрационная ось: автомобильная '+legacy.road.km.toFixed(2)+' км, ж/д '+legacy.rail.km.toFixed(2)+' км. Начало/конец: '+(legacy.road.startLand?'суша':'вода')+'/'+(legacy.road.endLand?'суша':'вода')+'. ':'';$('we-geo-info').textContent=`WGS84 ${ANCHOR.lat.toFixed(5)}°, ${ANCHOR.lon.toFixed(5)}°. ${summ.objects} объектов · ${summ.terrainBrushes} правок. ${legacyText}${axes.length?'Импортированные оси: '+axes.map(a=>a.mode+' '+(a.lengthMetres/1000).toFixed(2)+' км, источник: '+a.source).join('; '):'Нет независимо подтверждённых осей.'} До реконструкции 1:1 необходимы проверенные геометрия и отметки. Исторический OSM + Copernicus DSM.`;return}
 if(id==='we-alignment'){const input=$('we-file');input.dataset.use='alignment';input.click();return}
 }catch(err){note('Ошибка: '+err.message)}
});
editorEl.addEventListener('change',e=>{let t=e.target;try{
 if(t.dataset.layer){layerShow[t.dataset.layer]=t.checked;redraw();return}
 if(t.id==='we-zone'){zone=t.value;return}if(t.id==='we-network'){network=t.value;return}
 if(t.id==='we-catalog'){catalog=t.value;const r=CATALOG.find(x=>x.id===catalog);$('we-author').textContent=`Автор: ${r.author} · ${r.license}`;return}
 if(t.id==='we-material'){material=t.value;return}
 if(t.id==='we-brush-radius'){brushRadius=Math.min(2000,Math.max(5,+t.value||90));return}
 if(t.id==='we-brush-delta'){brushDelta=Number(t.value)||2;return}
 if(t.id==='we-batch-all'){editorEl.querySelectorAll('[data-batch]').forEach(x=>{x.checked=t.checked;const i=+x.dataset.batch;if(t.checked)batchSelected.add(i);else batchSelected.delete(i)});updateUI();return}
 if(t.dataset.batch!==undefined){const i=+t.dataset.batch;if(t.checked)batchSelected.add(i);else batchSelected.delete(i);return}
 if(selected&&['we-label','we-floors','we-facade','we-objmat','we-inherit','we-parent','we-parcel-zone'].includes(t.id)){
 if(t.id==='we-parent'){if(t.value)editor.setParent(selected,t.value);else editor.setObject(selected,{parentId:null});}
 else{const attr=({'we-label':'label','we-floors':'floors','we-facade':'facade','we-objmat':'material','we-inherit':'inheritMaterial','we-parcel-zone':'zoning'})[t.id];editor.setObject(selected,{[attr]:t.type==='checkbox'?t.checked:t.type==='number'?+t.value:t.value});}updateUI();}
 }catch(err){note(err.message)}});
$('we-file').addEventListener('change',async e=>{const input=e.target,file=input.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(input.dataset.use==='project'){editor.import(data);selected=null;updateUI();note('Проект загружен');}else if(input.dataset.use==='alignment'){editor.importAlignment(data);let sync='Предпросмотр загружен';try{const out=world3d.loadRouteGeoJSON(data);render();sync='Трасса синхронизирована с 2D/3D';}catch(err){sync='Ось сохранена только в WorldEditor: '+err.message;}updateUI();note(sync+'. Длина проверяется отдельно; источник необходимо подтвердить.');}else{editor.collectGIS(data,catalog,80);batchPage=0;batchSelected.clear();updateUI();note('GeoJSON принят: подтвердите предложения для расстановки');}}catch(err){note('Ошибка импорта: '+err.message)}input.value='';});
function pointOf(e){const b=canvas.getBoundingClientRect();return {sx:e.clientX-b.left,sy:e.clientY-b.top}}
function nearest(point){let closest=null,d=22/zoom*Math.max(DIMS.width,DIMS.height)/1000;for(const o of editor.objects){let p=o.points?o.points.reduce((acc,v)=>dist(v,point)<dist(acc,point)?v:acc,o.points[0]):[o.x,o.z];if(o.type==='parcel'&&editor.fitToParcel(...point).includes(o))p=point;const a=dist(p,point);if(a<d){d=a;closest=o.id}}return closest;}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(mode==='3d'){note('Для редактирования переключитесь на карту 2D. 3D-схема синхронизирует объекты и материалы.');return;}const {sx,sy}=pointOf(e);lastPointer={sx,sy,point:s2w(sx,sy)};canvas.setPointerCapture(e.pointerId);if(e.button===2||e.shiftKey||tool==='pan'){panAnchor={sx,sy,x:originX,z:originZ};return;}
 const p=s2w(sx,sy);try{
 if(tool==='select'){selected=nearest(p);if(selected){const o=editor.objects.find(x=>x.id===selected);dragSelection={id:selected,start:p,original:o.points?o.points.map(q=>[...q]):{x:o.x,z:o.z},moved:false};}updateUI();}
 else if(tool==='building'){const check=editor.validatePlacement(catalog,...p);if(!check.ok)throw Error(check.reason);const o=editor.addModel(catalog,...p,{material,facade:'windows'});selected=o.id;updateUI();}
 else if(tool==='terrain'){editor.paintTerrain(...p,brushRadius,Math.abs(brushDelta),brushDelta<0?'lower':'raise');note('Рельеф изменён только отдельным слоем; DEM сохранён');updateUI();}
 else{pts.push(tool==='parcel'?p:editor.snap(p,Math.min(45,16/zoom)));redraw();}
 }catch(err){note(err.message)}});
canvas.addEventListener('pointermove',e=>{let {sx,sy}=pointOf(e);hover=s2w(sx,sy);const [lon,lat]=editor.geographic(...hover);$('we-coord').textContent=`${lat.toFixed(5)}° N · ${lon.toFixed(5)}° E · ${hover[0].toFixed(0)} / ${hover[1].toFixed(0)} м`;if(panAnchor){let scale=Math.min(cw/DIMS.width,ch/DIMS.height)*zoom;originX=panAnchor.x-(sx-panAnchor.sx)/scale;originZ=panAnchor.z-(sy-panAnchor.sy)/scale;}if(dragSelection&&lastPointer&&Math.hypot(sx-lastPointer.sx,sy-lastPointer.sy)>3){const o=editor.objects.find(x=>x.id===dragSelection.id);if(o){const dx=hover[0]-dragSelection.start[0],dz=hover[1]-dragSelection.start[1];if(Array.isArray(dragSelection.original))o.points=dragSelection.original.map(p=>[p[0]+dx,p[1]+dz]);else{o.x=dragSelection.original.x+dx;o.z=dragSelection.original.z+dz;}dragSelection.moved=true;}}redraw()});
canvas.addEventListener('pointerup',e=>{panAnchor=null;if(dragSelection){if(dragSelection.moved){const o=editor.objects.find(x=>x.id===dragSelection.id);if(o){const patch=Array.isArray(dragSelection.original)?{points:o.points.map(p=>[...p])}:{x:o.x,z:o.z};if(Array.isArray(dragSelection.original))o.points=dragSelection.original;else{o.x=dragSelection.original.x;o.z=dragSelection.original.z;}try{editor.setObject(o.id,patch);note('Объект перемещён. Ctrl+Z — отменить.');}catch(err){note(err.message);}updateUI();}}dragSelection=null;}});canvas.addEventListener('dblclick',e=>{e.preventDefault();if(tool!=='building'&&tool!=='select'&&tool!=='terrain'){if(pts.length>2&&dist(pts.at(-1),pts.at(-2))<50)pts.pop();finish();}});
canvas.addEventListener('wheel',e=>{e.preventDefault();let p=pointOf(e),before=s2w(p.sx,p.sy);zoom=Math.max(.55,Math.min(55,zoom*(e.deltaY<0?1.18:1/1.18)));let after=s2w(p.sx,p.sy);originX+=before[0]-after[0];originZ+=before[1]-after[1];redraw()},{passive:false});
window.addEventListener('keydown',e=>{if(!visible)return;if(e.key==='Escape'){pts=[];hover=null;redraw()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();editor.undo();updateUI()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();editor.redo();updateUI()}});
function open(){visible=true;ui.hidden=false;zoom=1;originX=0;originZ=0;updateUI();setTimeout(redraw,80)}
const openBtn=document.createElement('button');openBtn.id='worldeditor-open';openBtn.type='button';openBtn.title='WorldEditor 2 — геопривязанное строительство';openBtn.textContent='▦ WorldEditor 2';const views=document.querySelector('.scene-header .views');if(views)views.appendChild(openBtn);else document.querySelector('.topbar')?.appendChild(openBtn);openBtn.addEventListener('click',open);
window.addEventListener('resize',redraw);
globalThis.TrussLabWorldEditorUI={open,close:()=>{ui.hidden=true;visible=false},draw,core:editor,selectTool,finish};
})();
