/* Offline regional mesh and imagery preview. GPU objects belong to one open dialog. */
(() => {
  const button=document.createElement('button');
  button.textContent='Пакет в 3D';
  button.id='planet-3d';
  document.getElementById('atlas-demo').after(button);
  const dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label','3D региона');
  dialog.style.cssText='width:min(94vw,1000px);padding:12px;background:#142731;color:#eef5f8';
  dialog.innerHTML='<header><strong>Регион в 3D</strong> <button type="button" autofocus>Закрыть</button></header><canvas tabindex="0" aria-label="Регион. Стрелки перемещают камеру, плюс и минус изменяют масштаб." style="width:100%;height:58vh;display:block;touch-action:none"></canvas><output aria-live="polite"></output>';
  document.body.append(dialog);
  const close=dialog.querySelector('button'),canvas=dialog.querySelector('canvas'),status=dialog.querySelector('output');
  const budget=24*1024*1024, cache=new Map();
  let gl,program,vertex,origin,scale,frame=0,bytes=0,loads=0,lastEpoch,drag=null;
  function dispose(key){
    const entry=cache.get(key);
    gl.deleteBuffer(entry.buffer);gl.deleteTexture(entry.texture);bytes-=entry.bytes;cache.delete(key);
  }
  function clear(){for(const key of cache.keys())dispose(key);}
  function shader(type,code){
    const item=gl.createShader(type);gl.shaderSource(item,code);gl.compileShader(item);
    if(!gl.getShaderParameter(item,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(item));
    return item;
  }
  function init(){
    gl=canvas.getContext('webgl',{antialias:true,alpha:false});
    if(!gl)throw Error('WebGL недоступен');
    program=gl.createProgram();
    const vs=shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec2 uv;uniform vec3 offset;uniform mat3 rotation;uniform vec2 pixel;varying vec2 tex;varying float height;void main(){vec3 q=rotation*p+offset;gl_Position=vec4(q.x*pixel.x,(q.y*.66+q.z*.8)*pixel.y,clamp((q.y*.75-q.z)*pixel.y*.05,-.98,.98),1.);tex=uv;height=p.z;}');
    const fs=shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D image;uniform bool ground;uniform bool raster;varying vec2 tex;varying float height;void main(){vec4 c=ground?(raster?texture2D(image,tex):vec4(.21,.34,.33,1.)):vec4(.64+min(height*.006,.25),.66,.58,1.);if(c.a<.01)discard;gl_FragColor=c;}');
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    vertex={p:gl.getAttribLocation(program,'p'),uv:gl.getAttribLocation(program,'uv')};
    for(const name of ['offset','rotation','pixel','ground','raster'])vertex[name]=gl.getUniformLocation(program,name);
  }
  function mesh(key,fc,span){
    const [tx,ty]=key.split(':').map(Number),x=tx*span,y=ty*span;
    const site=mercatorUnproject(x,y),tileFrame=planetFrame(site.lat,site.lon);
    const local=(lon,lat)=>{const p=geoToENU(lat,lon,0,tileFrame.anchor);return [p.east,p.north];};
    const data=[];
    const add=(a,b,h,u=0,v=0)=>data.push(a,b,h,u,v);
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){const g=mercatorUnproject(x+u*span,y+v*span);add(...local(g.lon,g.lat),0,u,1-v);}
    const project=coord=>local(coord[0],coord[1]);
    for(const f of fc.features){
      const g=f.geometry;if(!g)continue;
      if(data.length>160000)break;
      const polygons=g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[];
      for(const polygon of polygons){
        if(polygon.length!==1 || polygon[0].length>512)continue;
        const ring=polygon[0].slice(0,-1).map(project);
        if(ring.length<3)continue;
        const height=Math.max(1,Math.min(300,Number(f.properties?.height)||9));
        if(cityPolygonArea(ring)<0)ring.reverse();
        const roof=triangulateRing(ring);
        for(const triangle of roof)for(const point of triangle)add(...point,height);
        for(let i=0;i<ring.length;i++){
          const a=ring[i],b=ring[(i+1)%ring.length];
          add(...a,0);add(...b,0);add(...a,height);add(...b,0);add(...b,height);add(...a,height);
        }
      }
      const lines=g.type==='MultiLineString'?g.coordinates:g.type==='LineString'?[g.coordinates]:[];
      for(const line of lines){for(let i=1;i<line.length&&data.length<160000;i++){
        const a=project(line[i-1]),b=project(line[i]),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
        if(!length)continue;const nx=-dy/length*3,ny=dx/length*3;
        for(const [p,k] of [[a,-1],[b,-1],[a,1],[b,-1],[b,1],[a,1]])add(p[0]+k*nx,p[1]+k*ny,1);
      }}
    }
    const array=new Float32Array(data);
    const size=array.byteLength+(fc.raster?256*256*4:4);
    while(bytes+size>budget&&cache.size)dispose(cache.keys().next().value);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(fc.raster)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,fc.raster);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([60,90,88,255]));
    const entry={tileFrame,buffer,texture,count:array.length/5,bytes:size,raster:!!fc.raster};
    bytes+=size;loads++;cache.set(key,entry);return entry;
  }
  function render(){
    frame=0;if(!dialog.open||gl.isContextLost())return;
    if(lastEpoch!==atlas.store.epoch){clear();lastEpoch=atlas.store.epoch;}
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
    if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
    gl.viewport(0,0,w,h);gl.clearColor(.08,.15,.2,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.useProgram(program);
    gl.uniform2f(vertex.pixel,scale*2/w,scale*2/h);
    const index=atlas.store.index;if(!index)return;
    const geo=mercatorUnproject(origin.x,origin.y),camera=planetFrame(geo.lat,geo.lon);
    const latitudeScale=Math.max(.08,Math.cos(geo.lat*Math.PI/180));
    const span=index.size,cx=Math.floor(origin.x/span),cy=Math.floor(origin.y/span);
    const rx=Math.min(4,Math.ceil(w/(2*scale*span*latitudeScale))+1),ry=Math.min(4,Math.ceil(h/(scale*span*latitudeScale))+1);
    const keys=[];
    for(let dx=-rx;dx<=rx;dx++)for(let dy=-ry;dy<=ry;dy++){
      const key=(cx+dx)+':'+(cy+dy);if(index.tiles.has(key))keys.push(key);
    }
    keys.sort((a,b)=>{const dist=k=>{const [x,y]=k.split(':').map(Number);return (x-cx)**2+(y-cy)**2};return dist(a)-dist(b);});
    atlas.store.request(keys);let uploaded=0,triangles=0;
    for(const key of keys){
      let entry=cache.get(key);
      if(!entry && uploaded<2){const fc=atlas.store.get(key);if(fc){entry=mesh(key,fc,span);uploaded++;}}
      if(!entry)continue;
      cache.delete(key);cache.set(key,entry);
      gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
      for(const [loc,n,offset] of [[vertex.p,3,0],[vertex.uv,2,12]]){
        gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,20,offset);
      }
      const site=entry.tileFrame.anchor,offset=geoToENU(site.lat,site.lon,0,camera.anchor);
      gl.uniform3f(vertex.offset,offset.east,offset.north,offset.up);
      gl.uniformMatrix3fv(vertex.rotation,false,planetRotation(entry.tileFrame,camera));
      gl.uniform1i(vertex.raster,entry.raster);gl.uniform1i(vertex.ground,1);gl.drawArrays(gl.TRIANGLES,0,6);
      gl.uniform1i(vertex.ground,0);gl.drawArrays(gl.TRIANGLES,6,entry.count-6);triangles+=entry.count/3;
    }
    status.textContent=triangles+' △ · '+(bytes/1048576).toFixed(2)+' / 24 МиБ мешей и текстур · '+'загрузок '+loads+' · ошибок '+atlas.store.failures+' · '+(atlas.store.index?.metadata?.sources||[]).join(' / ');
    if(uploaded||atlas.store.pending.size||atlas.store.queue.length)queue();
  }
  function queue(){if(!frame)frame=requestAnimationFrame(render);}
  function move(dx,dy){
    const lat=mercatorUnproject(origin.x,origin.y).lat, factor=Math.max(.08,Math.cos(lat*Math.PI/180));
    const half=20037508.342789244;
    origin.x=((origin.x-dx/(scale*factor)+half)%(2*half)+2*half)%(2*half)-half;
    origin.y=Math.max(-half,Math.min(half,origin.y+dy/(scale*.66*factor)));queue();
  }
  function zoom(step){scale=Math.min(4,Math.max(.015,scale*step));queue();}
  button.onclick=()=>{
    if(!atlas.store.index){atlas.statusMessage('Сначала откройте пакет или деморегион');return;}
    dialog.showModal();origin={...atlas.center};scale=.15;loads=0;
    try{if(!program)init();queue();}catch(error){status.textContent=error.message;}
  };
  close.onclick=()=>dialog.close();
  dialog.onclose=()=>{cancelAnimationFrame(frame);frame=0;if(gl)clear();atlas.schedule();};
  canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(drag){move(e.clientX-drag[0],e.clientY-drag[1]);drag=[e.clientX,e.clientY];}};
  canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
  canvas.onwheel=e=>{e.preventDefault();zoom(e.deltaY<0?1.2:1/1.2);};
  canvas.onkeydown=e=>{const delta={ArrowLeft:[50,0],ArrowRight:[-50,0],ArrowUp:[0,50],ArrowDown:[0,-50]}[e.key];
    if(delta){e.preventDefault();move(...delta);}else if(e.key==='+'||e.key==='=')zoom(1.2);else if(e.key==='-')zoom(1/1.2);};
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cache.clear();bytes=0;program=null;status.textContent='Контекст потерян';});
  canvas.addEventListener('webglcontextrestored',()=>{init();queue();});
  new ResizeObserver(()=>{if(program&&dialog.open)queue();}).observe(canvas);
})();
