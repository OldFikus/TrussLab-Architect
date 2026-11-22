/* Recover all edited worlds together in a single IndexedDB transaction. */
(() => {
  const ui=globalThis.TrussLabCityPlusUI, panel=globalThis.TrussLabQualityUI.panel;
  const line=document.createElement('div');line.innerHTML='<button id="rc-recover">Восстановить автосохранение</button> <output role="status"></output>';panel.append(line);
  const out=line.querySelector('output'),key='release-recovery-v1';
  let timer,sequence=0,queue=Promise.resolve(),lost=null;
  async function write(){
    const data={version:1,studio:studioSnapshot(),city:ui.makeProject(),infra:globalThis.trusslabInfraSim.export(),created:new Date().toISOString()};
    const db=await ui.store.db();
    try{await new Promise((ok,bad)=>{const tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').put(data,key);tx.oncomplete=ok;tx.onabort=tx.onerror=()=>bad(tx.error);});}
    finally{db.close();}
    out.textContent='Сохранено '+data.created;
  }
  function checkpoint(){const next=queue.then(write);queue=next.catch(e=>{out.textContent='Автосохранение недоступно: '+e.message;});return next;}
  async function restore(){
    await queue;
    const db=await ui.store.db();
    let data;try{data=await new Promise((ok,bad)=>{const req=db.transaction('worlds').objectStore('worlds').get(key);req.onsuccess=()=>ok(req.result);req.onerror=()=>bad(req.error);});}finally{db.close();}
    if(data?.version!==1||!data.studio||!data.city||!data.infra)throw Error('Нет совместимого снимка');
    restoreStudioSnapshot(data.studio);ui.applyProject(data.city);globalThis.trusslabInfraSim.import(data.infra);
    out.textContent='Восстановлено '+data.created;
  }
  function dirty(e){if(line.contains(e.target))return;sequence++;clearTimeout(timer);timer=setTimeout(()=>{checkpoint().catch(()=>{});},1800);}
  for(const event of ['change','pointerup','keyup'])document.addEventListener(event,dirty,true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&sequence){clearTimeout(timer);checkpoint().catch(()=>{});}});
  line.querySelector('button').onclick=()=>restore().catch(e=>{out.textContent=e.message;});
  document.addEventListener('webglcontextlost',e=>{
    if(e.target!==world3d.canvas && e.target!==region3d.canvas)return;
    e.preventDefault();clearTimeout(timer);lost=checkpoint();lost.catch(()=>{});
  },true);
  document.addEventListener('webglcontextrestored',async e=>{
    if(!lost||(e.target!==world3d.canvas && e.target!==region3d.canvas))return;
    try{await lost;sessionStorage.setItem(key,e.target===world3d.canvas?'studio':'region');location.reload();}
    catch(error){out.textContent=error.message;}
  },true);
  try{const view=sessionStorage.getItem(key);if(view){sessionStorage.removeItem(key);restore().then(()=>{
    if(view==='region')region3d.open();else document.querySelector('.scene-header .views [data-view="3d"]').click();
  }).catch(e=>{out.textContent=e.message;});}}catch(_){}
  globalThis.TrussLabRecovery={checkpoint,restore};
})();(() => {
  const panel=TrussLabQualityUI.panel,section=document.createElement('details');
  section.innerHTML='<summary>Телеметрия за 5 секунд</summary><button type="button" id="rc-profile">Измерить</button> <output role="status"></output>';
  panel.append(section);
  const button=section.querySelector('button'),out=section.querySelector('output');
  button.onclick=()=>{
    button.disabled=true;out.textContent='Измерение…';
    const start=performance.now(),intervals=[];let last=start;
    function sample(time){
      intervals.push(time-last);last=time;
      if(time-start<5000){requestAnimationFrame(sample);return;}
      intervals.sort((a,b)=>a-b);
      const mem=world3d.estimateGPUMemory(),stats=world3d.stats||{};
      const record={fps:+(intervals.length*1000/(time-start)).toFixed(1),p95Ms:+intervals[Math.floor(intervals.length*.95)].toFixed(1),
        maxMs:+intervals.at(-1).toFixed(1),slowFrames:intervals.filter(ms=>ms>50).length,
        estimatedResourcesMiB:+(mem.ownedBytes/1048576).toFixed(2),drawCalls:stats.drawCalls??null,
        jsHeapMiB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null};
      out.textContent=record.fps+' кадров/с · p95 '+record.p95Ms+' мс · максимум '+record.maxMs+' мс · кадров >50 мс: '+record.slowFrames+' · draw calls '+(record.drawCalls??'нет данных')+' · оценка ресурсов GPU '+record.estimatedResourcesMiB+' МиБ · JS-куча '+(record.jsHeapMiB??'нет данных');
      button.disabled=false;section.dataset.report=JSON.stringify(record);
    }
    requestAnimationFrame(sample);
  };
})();