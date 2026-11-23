/* World3D Quality Restoration — explicit AA controls and separate modular effects.
   No DLSS claims; MSAA works only when actual browser context supports it. */
(function(){'use strict';
if(typeof document==='undefined'||typeof world3d==='undefined')return;
const $=id=>document.getElementById(id),p=document.createElement('aside');p.id='quality-lab-panel';p.hidden=true;
p.innerHTML=`<header><strong>✦ GPU CLARITY · NATIVE RESOLUTION / AA</strong><button id="q-close">✕</button></header>
<div><label for="q-aa">Сглаживание</label><select id="q-aa"><option value="native">MSAA холста · без постобработки</option><option value="msaaonly">Native Sharp · MSAA 4× без FXAA/TAA (WebGL2)</option><option value="fxaa">FXAA · постобработка</option><option value="hybrid">MSAA 4× + FXAA (WebGL2)</option><option value="taa">TAA · экспериментальный режим</option><option value="temporal">MSAA 4× + Temporal · для ферм (тест)</option></select>
<div class="q-row"><label><input id="q-shadows" type="checkbox"> Солнечные тени</label><label><input id="q-reflections" type="checkbox"> Отражение воды</label></div>
<div class="q-fidelity">
<label for="q-clarity-preset">Разрешение 3D-рендера (16:9)</label><select id="q-clarity-preset"><option value="auto">Авто · по размеру окна</option><option value="720p">HD · 1280×720</option><option value="900p">HD+ · 1600×900</option><option value="1080p">Full HD · 1920×1080</option><option value="1440p">QHD · 2560×1440</option></select>
<small>Фиксированные режимы показываются без растяжения; на узком окне возможны поля. Для лучшей чёткости откройте 3D на весь экран.</small>
<label for="q-ssaa">Внутренний масштаб (только Авто)</label><select id="q-ssaa"><option value="1">100% · штатный рендер</option><option value="1.25">125% · чётче тонкие конструкции</option><option value="1.5">150% · максимальная чёткость</option></select>
<label for="q-sharp">Резкость (ограниченная)</label><select id="q-sharp"><option value="0">Выкл.</option><option value="0.08">Деликатная</option><option value="0.16">Чёткая</option><option value="0.24">Высокая</option></select>
<label for="q-fxaa-strength">Сила FXAA (в Native Sharp не используется)</label><select id="q-fxaa-strength"><option value="0">Выкл.</option><option value="0.25">Лёгкая · меньше мыла</option><option value="0.55">Средняя</option><option value="1">Полная</option></select>
<label><input id="q-soft-shadow" type="checkbox"> Мягкие тени PCF 3×3 · BALANCED</label>
<label for="q-shadow-detail">Точная теневая карта</label><select id="q-shadow-detail"><option value="standard">Стандарт · радиус 260 м, 1024²</option><option value="fine">Каскады · ближний, средний и дальний</option></select>
<label for="q-reflection-detail">Качество отражений</label><select id="q-reflection-detail"><option value="standard">Стандарт · до 512²</option><option value="high">Повышенное · до 768² + фильтр</option></select>
</div>
<div class="q-status" id="q-report">Статус графики</div><div class="q-row"><button id="q-fullscreen">⛶ На весь экран</button><button id="q-diagnostics">Обновить сведения</button><button id="q-switch">Изменить GPU профиль</button></div>
<small>В браузере — MSAA, FXAA и ограниченное TAA. NVIDIA DLSS SDK здесь недоступен. BALANCED и дополнительные эффекты могут снизить FPS.</small></div>`;
const wrap=document.querySelector('.canvas-wrap');if(!wrap)return;wrap.appendChild(p);
const b=document.createElement('button');b.id='quality-lab-open';b.textContent='✦ Сглаживание';b.title='Настройки GPU и сглаживания';
const nav=document.querySelector('.scene-header .views');(nav||document.querySelector('.scene-header')||document.body).appendChild(b);b.addEventListener('click',()=>{p.hidden=!p.hidden;if(!p.hidden)refresh()});
p.querySelector('#q-close').addEventListener('click',()=>p.hidden=true);
function refresh(){const gl=world3d.gl;
 $('q-aa').value=world3d.aaMode||'native';$('q-clarity-preset').value=world3d.clarityPreset||'auto';$('q-ssaa').value=String(world3d.qualitySsaa||1);$('q-ssaa').disabled=world3d.clarityPreset!=='auto';$('q-sharp').value=String(world3d.qualitySharpness??.16);$('q-fxaa-strength').value=String(world3d.clarityFxaaStrength??.25);$('q-soft-shadow').checked=!!world3d.qualitySoftShadows;$('q-soft-shadow').disabled=!world3d.gpuBalancedMode;$('q-shadow-detail').value=world3d.qualityShadowDetail||'standard';$('q-reflection-detail').value=world3d.qualityReflectionDetail||'standard';$('q-shadow-detail').disabled=!world3d.gpuBalancedMode;$('q-reflection-detail').disabled=!world3d.gpuBalancedMode;$('q-shadows').checked=!!world3d.qualityEffects?.shadows;$('q-reflections').checked=!!world3d.qualityEffects?.reflections;
 for(const id of ['q-shadows','q-reflections'])$(id).disabled=!world3d.gpuBalancedMode;
 const available=!!gl&&!gl.isContextLost(),samples=world3d.post?.msaa?.samples||(available?gl.getParameter(gl.SAMPLES):0),webgl=world3d.renderCoreCaps?.backend||'CPU',label=world3d.shaderProfile||'unknown';
 $('q-report').textContent=`GPU: ${webgl.toUpperCase()} · ${label}\nCanvas MSAA: ${available?String(!!gl.getContextAttributes()?.antialias):'—'} · samples ${samples||0}\nAA: ${world3d.aaMode} · FXAA ${world3d.postQuality} · ${world3d.canvas.width}×${world3d.canvas.height} px\nПресет: ${world3d.clarityPreset||'auto'} · запрошено: ${world3d.clarityRequested?world3d.clarityRequested.join('×'):'от размера окна'}${world3d.clarityLimited?' · ограничено GPU-бюджетом':''} · экран: ${Math.round(world3d.canvas.clientWidth)}×${Math.round(world3d.canvas.clientHeight)} CSS px\nShadow atlas: ${world3d.qualityEffects?.shadows&&world3d.shadowProg?'готов':'откл.'} (${world3d.shadowSize||0}²) · отражения: ${world3d.reflection?.ready?'готовы':'не активны'} (${world3d.reflection?.size||0}²) · TAA история: ${world3d.post?.valid?'есть':'нет'}\nFPS: ${world3d.stats.fps||'—'}`;
 if(!available){
  const attempts=world3d.gpuFailures||[];
  $('q-report').textContent+='\nПрограммная 3D-отрисовка. Попытки запуска WebGL:\n'+attempts.join('\n');
 }
 $('q-switch').textContent=world3d.gpuBalancedMode?'Запустить SAFE':'Попробовать BALANCED';
}
$('q-aa').addEventListener('change',e=>{
 const mode=e.target.value;if(!['native','msaaonly','fxaa','hybrid','taa','temporal'].includes(mode))return;
 if(mode==='msaaonly'&&!(typeof WebGL2RenderingContext!=='undefined'&&world3d.gl instanceof WebGL2RenderingContext)){world3d.aaMode='native';world3d.postQuality='off'}else{world3d.aaMode=mode;world3d.postQuality=mode==='native'?'off':mode==='msaaonly'?'copy':mode==='taa'||mode==='temporal'?'taa':'fxaa';}
 world3d.postFrame=0;
 if(world3d.post)world3d.post.valid=false;
 try{if(world3d.lastState)world3d.render(world3d.lastState,false)}catch(err){console.warn('AA change:',err);world3d.aaMode='native';world3d.postQuality='off'}refresh();
});
$('q-clarity-preset').addEventListener('change',e=>{
 const choice=e.target.value;if(!['auto','720p','900p','1080p','1440p'].includes(choice))return;
 world3d.clarityPreset=choice;
 if(choice!=='auto'){world3d.resolutionScale=1;world3d.qualitySsaa=1;}
 if(world3d.post)world3d.post.valid=false;
 if(world3d.lastState)world3d.render(world3d.lastState,false);refresh();
});
$('q-fxaa-strength').addEventListener('change',e=>{
 const strength=Number(e.target.value);if(![0,.25,.55,1].includes(strength))return;
 world3d.clarityFxaaStrength=strength;refresh();
});
$('q-ssaa').addEventListener('change',e=>{
 const f=Number(e.target.value);if(![1,1.25,1.5].includes(f))return;
 world3d.qualitySsaa=f;
 if(world3d.post)world3d.post.valid=false;
 if(world3d.lastState)world3d.render(world3d.lastState,false);
 refresh();
});
$('q-sharp').addEventListener('change',e=>{const v=Number(e.target.value);if(![0,.08,.16,.24].includes(v))return;world3d.qualitySharpness=v;refresh()});
$('q-soft-shadow').addEventListener('change',e=>{world3d.qualitySoftShadows=e.target.checked;refresh()});
$('q-shadow-detail').addEventListener('change',e=>{world3d.qualityShadowDetail=e.target.value==='fine'?'fine':'standard';world3d.shadowDirty=true;world3d.qualityShadowRadius=0;refresh();});
$('q-reflection-detail').addEventListener('change',e=>{world3d.qualityReflectionDetail=e.target.value==='high'?'high':'standard';if(world3d.reflection)world3d.reflection.ready=false;refresh();});
$('q-shadows').addEventListener('change',e=>{world3d.qualityEffects.shadows=e.target.checked;world3d.shadowsEnabled=e.target.checked;world3d.shadowDirty=true;refresh()});
$('q-reflections').addEventListener('change',e=>{world3d.qualityEffects.reflections=e.target.checked;if(!e.target.checked&&world3d.reflection)world3d.reflection.ready=false;refresh()});
$('q-fullscreen').addEventListener('click',()=>{
 const box=document.querySelector('.canvas-wrap');if(!box)return;
 const request=document.fullscreenElement?document.exitFullscreen?.():box.requestFullscreen?.();
 Promise.resolve(request).then(()=>{if(world3d.lastState)world3d.render(world3d.lastState,false);refresh();}).catch(err=>console.warn('Fullscreen:',err));
});
$('q-diagnostics').addEventListener('click',refresh);
$('q-switch').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('trussBalanced',world3d.gpuBalancedMode?'0':'1');location.assign(url.href)});
globalThis.TrussLabQualityUI={refresh,panel:p};
})();

