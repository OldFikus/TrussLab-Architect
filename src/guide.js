(() => {
  const open=document.createElement('button');open.textContent='Руководство';open.id='rc-guide';
  document.getElementById('atlas-open').after(open);
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Руководство редактора');
  dialog.style.cssText='width:min(90vw,700px);max-height:82vh;overflow:auto';
  const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>dialog.close();dialog.append(close);
  const guide=null /* {{ EDITOR_GUIDE }} */;
  for(const line of guide.split('\n').filter(Boolean)){
    const tag=line.startsWith('## ')?'h3':line.startsWith('# ')?'h2':'p';
    const el=document.createElement(tag);el.textContent=line.replace(/^#{1,2} /,'');dialog.append(el);
  }
  document.body.append(dialog);open.onclick=()=>dialog.showModal();
})();(() => {
  const area=document.getElementById('atlas-stage');area.tabIndex=0;
  area.setAttribute('aria-label','Карта региона. Стрелки перемещают карту. Плюс и минус меняют масштаб.');
  area.addEventListener('keydown',e=>{
    const actions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]},delta=actions[e.key];
    if(delta){const distance=(e.shiftKey?160:48)/atlas.scale;atlas.center.x+=delta[0]*distance;atlas.center.y+=delta[1]*distance;}
    else if(['+','=','-'].includes(e.key))atlas.scale=Math.min(3,Math.max(.00035,atlas.scale*(e.key==='-'?1/1.25:1.25)));
    else return;
    e.preventDefault();e.stopPropagation();atlas.schedule();
  });
  const guide=document.getElementById('rc-guide'),dialog=document.querySelector('dialog[aria-label="Руководство редактора"]');
  const box=document.createElement('fieldset');box.innerHTML='<legend>Горячая клавиша руководства</legend><label>Сочетание <select><option value="F1">F1</option><option value="Alt+H">Alt+H (физическая клавиша)</option><option value="off">Выключено</option></select></label>';
  dialog.append(box);const select=box.querySelector('select'),key='trusslab-guide-shortcut';
  try{const choice=localStorage.getItem(key);if(['F1','Alt+H','off'].includes(choice))select.value=choice;}catch(_){}
  select.onchange=()=>{try{localStorage.setItem(key,select.value);}catch(_){}};
  document.addEventListener('keydown',e=>{
    if(e.target.closest?.('input,textarea,select,[contenteditable=true]')||e.ctrlKey||e.metaKey||e.repeat)return;
    if(!(select.value==='F1'&&e.key==='F1'||select.value==='Alt+H'&&e.altKey&&e.code==='KeyH'))return;
    if(document.querySelector('dialog[open]')&&!dialog.open)return;
    e.preventDefault();if(dialog.open)dialog.close();else guide.click();
  });
  const style=document.createElement('style');style.textContent='button:focus-visible,select:focus-visible,input:focus-visible,canvas:focus-visible,summary:focus-visible{outline:3px solid #ffb94e;outline-offset:2px}dialog a{color:inherit;text-decoration:underline}';
  document.head.append(style);
})();