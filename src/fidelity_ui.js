(() => {
  const button=document.createElement('button');button.id='fidelity-open';button.textContent='Достоверность';
  document.getElementById('planet-atlas').after(button);
  const dialog=document.createElement('dialog');dialog.id='fidelity-dialog';dialog.setAttribute('aria-label','FidelityLab');
  dialog.style.cssText='width:min(92vw,760px);max-height:87vh;overflow:auto;background:#18313a;color:#eff7f6';
  dialog.innerHTML='<header><h2>FidelityLab</h2><button type="button" data-close>Закрыть</button></header><label>Объекты в видимых тайлах <select data-objects></select></label><label>Состояние на дату <input type="date" data-asof></label><dl data-record></dl>';
  document.body.append(dialog);
  const select=dialog.querySelector('[data-objects]'),details=dialog.querySelector('[data-record]');
  let records=[];
  const journal=document.createElement('fieldset');
  journal.innerHTML='<legend>Журнал расхождений</legend><label>Расхождение <input data-reason maxlength="240"></label><label>Исправленное состояние <input data-correction maxlength="240"></label><button data-apply>Применить исправление</button><ol data-history></ol><output role="status"></output>';
  details.after(journal);
  const key='trusslab-fidelity-journal-v1';
  function history(){const list=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(list))throw Error('Повреждён журнал');return list;}
  function identity(item){return JSON.stringify([atlas.store.index?.region?.id||atlas.store.index?.metadata?.sources||'',item.key,item.f.id??null,item.f.geometry]);}
  function changes(item){const target=identity(item);return history().filter(row=>row.target===target);}
  journal.querySelector('[data-apply]').onclick=()=>{
    const item=records[select.selectedIndex],reason=journal.querySelector('[data-reason]'),state=journal.querySelector('[data-correction]'),status=journal.querySelector('output');
    if(!item||!reason.value.trim()||!state.value.trim()){status.textContent='Выберите объект и заполните оба поля.';return;}
    try{
      const rows=history();rows.push({target:identity(item),reason:reason.value.trim(),state:state.value.trim(),date:new Date().toISOString()});
      localStorage.setItem(key,JSON.stringify(rows));reason.value='';state.value='';paint();status.textContent='Исправление сохранено.';
    }catch(error){status.textContent='Запись не сохранена: '+error.message;}
  };
  function paint(){
    details.replaceChildren();const list=journal.querySelector('[data-history]');list.replaceChildren();
    const item=records[select.selectedIndex];
    if(!item){details.textContent='На экране нет объектов с загруженной геометрией.';return;}
    const record=fidelityRecord(item.f,atlas.store.index?.region,dialog.querySelector('[data-asof]').value);
    try{const cutoff=dialog.querySelector('[data-asof]').value;
      for(const row of changes(item)){const li=document.createElement('li');li.textContent=row.date.slice(0,10)+' · '+row.reason+' → '+row.state;list.append(li);if(!cutoff||row.date.slice(0,10)<=cutoff)record.state=row.state;}
    }catch(error){journal.querySelector('output').textContent=error.message;}
    const fields={'Тайл':item.key,'Тип свидетельства':FIDELITY_KINDS[record.kind],'Оценка':record.quality,'Авторство':record.author,'Права':record.license,'Основание':record.reference||'Нет данных','Дата наблюдения':record.date||'Нет данных','Состояние':record.state};
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
  const neutral=document.createElement('button');neutral.textContent='Скачать нейтральные контуры';details.after(neutral);
  neutral.onclick=()=>{
    const collection=neutralFootprints(records);collection.metadata={sources:atlas.store.index?.metadata?.sources||[],scope:'visible selection; geometry only'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(collection)],{type:'application/geo+json'}));
    const a=document.createElement('a');a.href=url;a.download='footprints.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  select.onchange=paint;dialog.querySelector('[data-asof]').onchange=paint;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
})();

(() => {
  const section=document.createElement('section');section.innerHTML='<h3>Транспорт проекта</h3><button>Проверить дороги и пути</button><p role="status"></p>';
  document.getElementById('fidelity-dialog').append(section);
  section.querySelector('button').onclick=()=>{
    const sim=globalThis.trusslabInfraSim,out=section.querySelector('p');
    try{
      sim.rebuild();
      out.textContent=[['Автодороги',sim.road],['Железная дорога',sim.rail]].map(([label,graph])=>{
        const r=inspectTransport(graph);return label+' — '+(r.edges?r.edges+' участков, '+r.length.toFixed(0)+' м, связных групп '+r.components+', дубликатов '+r.duplicates+', некорректных рёбер '+r.invalid:'нет данных');
      }).join(' | ');
    }catch(error){out.textContent=error.message;}
  };
})();

(() => {
  const details=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent='Права и источники встроенных материалов';details.append(summary);
  const sources=[["Береговая линия GeoPack","© OpenStreetMap contributors · geo-maps / Simone Primarosa","ODbL 1.0 (производный растр)","https://www.openstreetmap.org/copyright"],["Региональная береговая линия","GSHHG · Paul Wessel, Walter H. F. Smith","GNU LGPL · исходная база","https://www.soest.hawaii.edu/pwessel/gshhg/"],["Высоты DSM","Copernicus WorldDEM-30","Данные GLO-30, производная сетка","https://doi.org/10.5270/esa-c5d3d65"],["Демонстрационные GLB и учебная гавань","TrussLab","CC0-1.0 · авторская геометрия","https://creativecommons.org/publicdomain/zero/1.0/"],["Камеры курганов и текстуры кладки","TrussLab · геометрия по опубликованным размерам","CC0-1.0 · оригинальная реконструкция","https://archaeolog.ru/media/periodicals/agis/AGIS-4/Presentations/Smekalov/mondeskr/tsarkurg.htm"],["Фотография Царского кургана (внешняя ссылка)","Anatoly Shcherbak","CC BY-SA 3.0","https://commons.wikimedia.org/wiki/File:Царський_курган_007.jpg"]];
  for(const [asset,author,license,url] of sources){
    const p=document.createElement('p'),a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=asset;
    p.append(a,document.createTextNode(' · '+author+' · '+license));details.append(p);
  }
  const notice=document.createElement('p');
  notice.textContent='Произведено с использованием Copernicus WorldDEM-30 © DLR e.V. 2010–2014 и © Airbus Defence and Space GmbH 2014–2018, предоставленного в рамках COPERNICUS Европейским союзом и ESA. Все права защищены. Организации, отвечающие за программу Copernicus по закону или делегированию, не несут ответственности за использование Copernicus WorldDEM-30.';
  details.append(notice);document.getElementById('fidelity-dialog').append(details);
})();