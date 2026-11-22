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
})();