(() => {
  const dialog=document.getElementById('fidelity-dialog'),section=document.createElement('section');
  section.innerHTML='<h3>Архитектура Керчи</h3><label>Модель в разрезе <select></select></label><p data-description></p><canvas width="640" height="270" style="width:100%;background:#10242b" aria-label="Поворотная модель сооружения в разрезе"></canvas><label>Поворот <input type="range" min="-180" max="180" value="30"></label> <button>Скачать GLB</button><p data-sources></p>';
  dialog.append(section);
  const select=section.querySelector('select'),angle=section.querySelector('input'),canvas=section.querySelector('canvas');
  const models=BUILTIN_GLB_ASSETS.filter(x=>x.basis),ctx=canvas.getContext('2d');
  for(const model of models)select.add(new Option(model.label,model.id));
  function current(){return models[select.selectedIndex];}
  function draw(){
    const m=current(),bin=aDecode64(m.variants.high),view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
    const jsonSize=view.getUint32(12,true),start=28+jsonSize;
    const doc=JSON.parse(new TextDecoder().decode(bin.subarray(20,20+jsonSize)));
    const coords=new Float32Array(bin.buffer,bin.byteOffset+start,doc.accessors[0].count*3);
    const theta=Number(angle.value)*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),faces=[];
    const scale=205/Math.max(m.width,m.depth,m.height);
    for(let i=0;i<coords.length;i+=9){
      const points=[];let depth=0;
      for(let j=0;j<9;j+=3){const x=coords[i+j],y=coords[i+j+1],z=coords[i+j+2],d=x*s+z*c;
        points.push([320+(x*c-z*s)*scale,232-y*scale+d*.26*scale]);depth+=d;}
      faces.push({depth,points});
    }
    ctx.clearRect(0,0,640,270);faces.sort((a,b)=>a.depth-b.depth);
    for(const {depth,points} of faces){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
      ctx.fillStyle='hsl(38 25% '+(64+depth*1.6)+'%)';ctx.fill();ctx.strokeStyle='#746b5b';ctx.lineWidth=.5;ctx.stroke();}
    section.querySelector('[data-description]').textContent=m.basis+' Толщина камня и пропорции отдельных уступов приблизительны.';
    const sources=section.querySelector('[data-sources]');sources.replaceChildren();
    for(const url of [m.source,m.planSource].filter(Boolean)){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=new URL(url).hostname+' ';sources.append(a);}
  }
  select.onchange=draw;angle.oninput=draw;
  section.querySelector('button').onclick=()=>{const m=current(),a=document.createElement('a'),url=URL.createObjectURL(new Blob([aDecode64(m.variants.high)],{type:'model/gltf-binary'}));a.href=url;a.download=m.id+'.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  draw();
})();
