(() => {
  const button=document.createElement('button');button.id='fidelity-open';button.textContent='Достоверность';
  document.getElementById('planet-atlas').after(button);
  const dialog=document.createElement('dialog');dialog.id='fidelity-dialog';dialog.setAttribute('aria-label','FidelityLab');
  dialog.style.cssText='width:min(92vw,760px);max-height:87vh;overflow:auto;background:#18313a;color:#eff7f6';
  dialog.innerHTML='<header><h2>FidelityLab</h2><button type="button" data-close>Закрыть</button></header><label>Объекты в видимых тайлах <select data-objects></select></label><dl data-record></dl>';
  document.body.append(dialog);
  const select=dialog.querySelector('[data-objects]'),details=dialog.querySelector('[data-record]');
  let records=[];
  function paint(){
    details.replaceChildren();
    const item=records[select.selectedIndex];
    if(!item){details.textContent='На экране нет объектов с загруженной геометрией.';return;}
    const record=fidelityRecord(item.f,atlas.store.index?.region);
    const fields={'Тайл':item.key,'Тип свидетельства':FIDELITY_KINDS[record.kind],'Оценка':record.quality,'Авторство':record.author,'Права':record.license,'Основание':record.reference||'Нет данных','Дата наблюдения':record.date||'Нет данных'};
    for(const [key,value] of Object.entries(fields)){
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;details.append(dt,dd);
    }
  }
  button.onclick=()=>{
    records=[];select.replaceChildren();
    for(const key of atlas.viewKeys||[]){
      const features=atlas.store.cache.get(key)?.features||[];
      for(let i=0;i<features.length&&records.length<500;i++){
        const f=features[i];records.push({key,f});select.add(new Option(fidelityRecord(f,atlas.store.index?.region).name+' · '+(i+1)));
      }
    }
    paint();dialog.showModal();
  };
  select.onchange=paint;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
})();
