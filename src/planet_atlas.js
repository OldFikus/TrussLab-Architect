(() => {
  const entries=new Map();
  const button=document.createElement('button');
  button.id='planet-atlas';button.textContent='Глобальный атлас';
  document.getElementById('atlas-files').before(button);
  const retry=document.createElement('button');retry.type='button';retry.id='planet-retry';retry.textContent='Повторить загрузку';
  button.after(retry);retry.onclick=()=>atlas.store.retryMissing();
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Глобальный атлас');
  dialog.style.cssText='width:min(92vw,800px);background:#132c38;color:#e9f8fa;border:1px solid #699190';
  dialog.innerHTML='<h2>Глобальный атлас</h2><canvas aria-label="Покрытие установленных регионов" width="720" height="360" style="width:100%;height:auto"></canvas><label>Регион <select></select></label> <div data-credits></div><button data-open>Открыть регион</button> <button data-close>Закрыть</button>';
  document.body.append(dialog);
  const canvas=dialog.querySelector('canvas'),select=dialog.querySelector('select');
  const demo=null /* {{ PLANET_DEMO }} */;
  const register=(raw,options)=>{
    if(raw.type!=='TrussLabPlanetRegion')return;
    entries.delete(raw.id);entries.set(raw.id,{raw,options});
    if(entries.size>8)entries.delete(entries.keys().next().value);
  };
  register(demo.manifest,{inline:new Map(Object.entries(demo.files)),mode:'Демо'});
  window.addEventListener('planet-region-loaded',e=>register(e.detail.raw,e.detail.options));
  const xy=([lon,lat])=>[(180+lon)*2,(90-lat)*2];
  function paint(){
    const raw=entries.get(select.value)?.raw,credits=dialog.querySelector('[data-credits]');
    credits.replaceChildren();
    if(raw)for(const [label,source] of Object.entries({Пакет:raw.source,Вектор:raw.layers?.vector,Растр:raw.layers?.raster})){
      if(!source)continue;
      const line=document.createElement('p');line.textContent=label+' · '+source.attribution+' · '+source.license+' · '+source.quality;credits.append(line);
    }
    const ctx=canvas.getContext('2d');ctx.fillStyle='#0c2532';ctx.fillRect(0,0,720,360);
    ctx.strokeStyle='#395562';ctx.fillStyle='#aac4c6';ctx.font='12px system-ui';
    for(let lon=-180;lon<180;lon+=30){const x=(lon+180)*2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,360);ctx.stroke();ctx.fillText(lon+'°',x+4,18);}
    for(let lat=-60;lat<=60;lat+=30){const y=(90-lat)*2;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(720,y);ctx.stroke();ctx.fillText(lat+'°',4,y-4);}
    for(const {raw} of entries.values()){
      const [w,s,e,n]=raw.bounds,[x,y]=xy(raw.center),[left,top]=xy([w,n]);
      ctx.fillStyle=raw.id===select.value?'#ffc56b':'#71d7c7';
      ctx.fillRect(left,top,Math.max(2,(e-w)*2),Math.max(2,(n-s)*2));
      ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.fill();
      if(raw.id===select.value)ctx.fillText(raw.name,Math.min(560,x+8),Math.max(30,y-5));
    }
  }
  button.onclick=()=>{
    select.replaceChildren();
    for(const {raw} of entries.values())select.add(new Option(raw.name+' · '+raw.source.quality,raw.id));
    if(atlas.store.index?.region)select.value=atlas.store.index.region.id;
    dialog.showModal();paint();
  };
  select.onchange=paint;
  canvas.onclick=e=>{
    const b=canvas.getBoundingClientRect(),x=(e.clientX-b.left)*720/b.width,y=(e.clientY-b.top)*360/b.height;
    let nearest=15;
    for(const {raw} of entries.values()){const [px,py]=xy(raw.center),distance=Math.hypot(x-px,y-py);
      if(distance<nearest){nearest=distance;select.value=raw.id;}}
    paint();
  };
  dialog.querySelector('[data-open]').onclick=()=>{
    const {raw,options}=entries.get(select.value);
    atlas.store.setManifest(raw,options);atlas.goTo(raw.center[1],raw.center[0],.09);dialog.close();
  };
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
})();
