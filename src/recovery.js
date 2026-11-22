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
})();