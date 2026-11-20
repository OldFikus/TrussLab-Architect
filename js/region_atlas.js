import {mercatorProject,mercatorUnproject,RegionTileStore} from './region_tiles.js';
import {sceneToGeo,geoToScene} from './georef.js';
/**
 * TrussLab 10.3 — an interactive, streamed, metrically indexed 2D regional atlas.
 * Deliberately separate from the fixed 420-unit bridge WebGL scene.
 * No simulated 'whole world 3D': external source geometry is WGS84, and only
 * loaded viewport tiles are retained; 3D import is limited to the bridge area.
 */


function regChooseTheme(){return document.documentElement.dataset.theme==='light';}
export class RegionAtlas{
 constructor({overlay,canvas,status,geoPack=null,onLocal3D=()=>{}}){
  this.overlay=overlay;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.status=status;
  this.store=new RegionTileStore({limit:96,parallel:3});this.store.onUpdate=()=>this.schedule();
  this.onLocal3D=onLocal3D;this.geoPack=geoPack;this.background=null;this.center=mercatorProject(36.506491,45.308440);
  this.scale=.08;this.mouse=null;this.viewKeys=[];this.active=false;this.frame=0;this.stats={shapes:0,tiles:0};
  this.pointer=null;this.error='';this.mode='geo';this.bind();
 }
 bind(){
  this.canvas.addEventListener('wheel',e=>{
   e.preventDefault();const p=this.mousePoint(e),w=this.screenToWorld(p.x,p.y),factor=e.deltaY<0?1.22:1/1.22;
   this.scale=Math.max(.00035,Math.min(3,this.scale*factor));
   this.center.x=w.x-(p.x-this.canvas.clientWidth*.5)/this.scale;
   this.center.y=w.y+(p.y-this.canvas.clientHeight*.5)/this.scale;
   this.schedule();
  },{passive:false});
  this.canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,cx:this.center.x,cy:this.center.y};
   try{this.canvas.setPointerCapture(e.pointerId)}catch(_){};
  });
  this.canvas.addEventListener('pointermove',e=>{
   if(this.pointer&&this.pointer.id===e.pointerId){
    this.center.x=this.pointer.cx-(e.clientX-this.pointer.x)/this.scale;
    this.center.y=this.pointer.cy+(e.clientY-this.pointer.y)/this.scale;this.schedule();
   }
   const p=this.mousePoint(e),w=this.screenToWorld(p.x,p.y),g=mercatorUnproject(w.x,w.y);
   const el=document.getElementById('atlas-cursor');if(el)el.textContent=`${g.lat.toFixed(5)}° N · ${g.lon.toFixed(5)}° E`;
  });
  this.canvas.addEventListener('pointerup',e=>{if(this.pointer?.id===e.pointerId)this.pointer=null});
  this.canvas.addEventListener('pointercancel',()=>{this.pointer=null});
  document.getElementById('atlas-zoom-in')?.addEventListener('click',()=>{this.scale=Math.min(3,this.scale*1.7);this.schedule()});
  document.getElementById('atlas-zoom-out')?.addEventListener('click',()=>{this.scale=Math.max(.00035,this.scale/1.7);this.schedule()});
  document.getElementById('atlas-kerch')?.addEventListener('click',()=>{this.goTo(45.30844,36.506491,.06)});
  document.getElementById('atlas-crimea')?.addEventListener('click',()=>{this.goTo(45.0,35.3,.0029)});
  document.getElementById('atlas-close')?.addEventListener('click',()=>this.close());
  document.getElementById('atlas-files')?.addEventListener('click',()=>document.getElementById('atlas-file-picker')?.click());
  document.getElementById('atlas-file-picker')?.addEventListener('change',async e=>{
   try{const files=[...(e.target.files||[])];if(!files.length)return;
    const idx=await this.store.openDirectory(files);this.error='';this.schedule();
    this.statusMessage(`Папка подключена: ${idx.tiles.size} тайлов. Загружается только область на экране.`);
   }catch(err){this.error=err.message;this.statusMessage('Ошибка папки: '+err.message)}finally{e.target.value=''}
  });
  document.getElementById('atlas-connect-url')?.addEventListener('click',async()=>{
   const url=document.getElementById('atlas-url')?.value?.trim();if(!url)return;
   try{const index=await this.store.openURL(url);this.error='';this.schedule();this.statusMessage('HTTP-индекс подключён: '+index.tiles.size+' тайлов.');}
   catch(err){this.error=err.message;this.statusMessage('Не удалось подключить URL: '+err.message)}
  });
  document.getElementById('atlas-demo')?.addEventListener('click',()=>{this.setDemo();this.statusMessage('ДЕМО: синтетические здания, не настоящая застройка!')});
  document.getElementById('atlas-3d')?.addEventListener('click',()=>{
   if(!this.store.index){this.statusMessage('Сначала подключи региональные данные.');return}
   const here=mercatorUnproject(this.center.x,this.center.y),bridge=geoToScene(here.lat,here.lon);
   if(Math.max(Math.abs(bridge.x),Math.abs(bridge.z))>185){this.statusMessage('3D в 10.3 доступен только внутри области моста. Для остальных регионов пока используется 2D-атлас.');return}
   const features=this.store.loadedFeatureCollection(this.viewKeys,11000);
   if(!features.features.length){this.statusMessage('Для 3D дождись загрузки региональных тайлов в этой области.');return}
   try{this.onLocal3D(features);this.statusMessage('Локальный фрагмент перенесён в 3D-мост.');this.close()}
   catch(err){this.statusMessage('Перенос в 3D: '+err.message)}
  });
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>this.schedule()).observe(this.canvas);
 }
 open(){this.active=true;this.overlay.hidden=false;this.overlay.style.display='flex';this.schedule()}
 close(){this.active=false;this.overlay.hidden=true;this.overlay.style.display='none'}
 goTo(lat,lon,scale=this.scale){this.center=mercatorProject(lon,lat);this.scale=scale;this.schedule()}
 screenToWorld(x,y){return {x:this.center.x+(x-this.canvas.clientWidth*.5)/this.scale,y:this.center.y-(y-this.canvas.clientHeight*.5)/this.scale}}
 worldToScreen(x,y,w=this.canvas.clientWidth,h=this.canvas.clientHeight){return [w*.5+(x-this.center.x)*this.scale,h*.5-(y-this.center.y)*this.scale]}
 schedule(){if(!this.active||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw()})}
 statusMessage(message){this.error=message;if(this.status)this.status.textContent=message}
 makeCoastBackground(){
  const pack=this.geoPack;if(!pack?.coast)return;
  const n=pack.gridSize,canvas=document.createElement('canvas');canvas.width=n;canvas.height=n;
  const context=canvas.getContext('2d');const img=context.createImageData(n,n);
  for(let i=0;i<n*n;i++){
   const land=pack.coast[i]>127,ix=i*4;
   img.data[ix]=land?118:30;img.data[ix+1]=land?143:94;img.data[ix+2]=land?99:116;img.data[ix+3]=255;
  }
  context.putImageData(img,0,0);this.background=canvas;
 }
 paintCoast(ctx){
  if(!this.geoPack?.coast)return;
  if(!this.background)this.makeCoastBackground();
  const size=this.geoPack.sceneSize,mid=size*.5;
  const A=sceneToGeo(-mid,-mid),B=sceneToGeo(mid,-mid),C=sceneToGeo(-mid,mid);
  const a=mercatorProject(A.lon,A.lat),b=mercatorProject(B.lon,B.lat),c=mercatorProject(C.lon,C.lat);
  const [sx,sy]=this.worldToScreen(a.x,a.y),[bx,by]=this.worldToScreen(b.x,b.y),[cx,cy]=this.worldToScreen(c.x,c.y);
  const n=this.geoPack.gridSize;
  ctx.save();ctx.transform((bx-sx)/n,(by-sy)/n,(cx-sx)/n,(cy-sy)/n,sx,sy);
  ctx.drawImage(this.background,0,0);ctx.strokeStyle='#ffffff88';ctx.lineWidth=2;ctx.strokeRect(0,0,n,n);ctx.restore();
 }
 tileKeysForView(w,h){
  if(!this.store.index)return [];
  const size=this.store.index.size,aw=w/this.scale*.5,bh=h/this.scale*.5;
  const a=Math.floor((this.center.x-aw)/size),b=Math.floor((this.center.x+aw)/size);
  const c=Math.floor((this.center.y-bh)/size),d=Math.floor((this.center.y+bh)/size);
  // Never queue thousands of tiles when looking at continental scale.
  if((b-a+1)*(d-c+1)>128){this.tooFar=true;return []}this.tooFar=false;
  const list=[];for(let x=a;x<=b;x++)for(let y=c;y<=d;y++){
   const key=`${x}:${y}`;if(this.store.index.tiles.has(key))list.push(key)
  }
  list.sort((ka,kb)=>{const [xa,ya]=ka.split(':').map(Number),[xb,yb]=kb.split(':').map(Number);
   return Math.hypot((xa+.5)*size-this.center.x,(ya+.5)*size-this.center.y)-Math.hypot((xb+.5)*size-this.center.x,(yb+.5)*size-this.center.y)});
  return list.slice(0,80);
 }
 _drawGeometry(ctx,geometry,kind){
  if(!geometry||!Array.isArray(geometry.coordinates))return 0;
  const type=geometry.type,coords=geometry.coordinates;
  const road=kind==='road'||kind==='rail';let paths=[];
  if(road){paths=type==='LineString'?[coords]:type==='MultiLineString'?coords:[]}
  else {paths=type==='Polygon'?[coords]:type==='MultiPolygon'?coords:[]}
  if(!paths.length)return 0;
  const W=this.canvas.clientWidth,H=this.canvas.clientHeight,project=(p)=>{
   if(!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1]))return null;
   const m=mercatorProject(p[0],p[1]);return [W*.5+(m.x-this.center.x)*this.scale,H*.5-(m.y-this.center.y)*this.scale]};
  let painted=0;ctx.beginPath();
  if(road){for(const line of paths){if(!Array.isArray(line)||line.length<2)continue;let ok=false;
   for(let k=0;k<line.length&&k<2500;k++){const p=project(line[k]);if(!p)continue;if(!ok)ctx.moveTo(...p);else ctx.lineTo(...p);ok=true}if(ok)painted++}
   if(painted)ctx.stroke();return painted;
  }
  for(const polygon of paths){for(const ring of polygon){if(!Array.isArray(ring)||ring.length<3)continue;let ok=false;
   for(let k=0;k<ring.length&&k<2000;k++){const p=project(ring[k]);if(!p)continue;if(!ok)ctx.moveTo(...p);else ctx.lineTo(...p);ok=true}if(ok){ctx.closePath();painted++}}
  }
  if(painted){ctx.fill('evenodd');if(this.scale>.03)ctx.stroke()};return painted;
 }
 draw(){
  if(!this.active)return;
  const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr)}
  const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);const light=regChooseTheme();
  ctx.fillStyle=light?'#c8dfe0':'#153641';ctx.fillRect(0,0,w,h);
  this.paintCoast(ctx);
  const keys=this.tileKeysForView(w,h);this.viewKeys=keys;this.store.request(keys);
  // EPSG:3857 grid lines, aligned with file indices.
  const tileSize=this.store.index?.size||2048;
  const topLeft=this.screenToWorld(0,0),rightBottom=this.screenToWorld(w,h);
  ctx.lineWidth=1;ctx.strokeStyle=light?'#324f5860':'#cce8e82d';ctx.font='10px system-ui';ctx.fillStyle=light?'#34505a':'#a9c8d0';
  const x0=Math.floor(topLeft.x/tileSize),x1=Math.floor(rightBottom.x/tileSize),y0=Math.floor(rightBottom.y/tileSize),y1=Math.floor(topLeft.y/tileSize);
  if((x1-x0+1)*(y1-y0+1)<600){
   ctx.beginPath();for(let x=x0;x<=x1;x++){const [px]=this.worldToScreen(x*tileSize,0);ctx.moveTo(px,0);ctx.lineTo(px,h)}
   for(let y=y0;y<=y1;y++){const [,py]=this.worldToScreen(0,y*tileSize);ctx.moveTo(0,py);ctx.lineTo(w,py)}ctx.stroke();
  }
  let shapes=0,paintedTiles=0;const maxDraw=24000;
  for(const key of keys){
   const fc=this.store.get(key);if(!fc)continue;
   const [ix,iy]=key.split(':').map(Number);const [xl,yt]=this.worldToScreen(ix*tileSize,(iy+1)*tileSize);
   const [xr,yb]=this.worldToScreen((ix+1)*tileSize,iy*tileSize);
   ctx.save();ctx.beginPath();ctx.rect(xl,yt,xr-xl,yb-yt);ctx.clip();   // Draw transport first, then buildings on top; provenance remains in GeoJSON.
   const groups=[[],[],[]];for(const f of fc.features){
    const p=f.properties||{},t=String(p.trusslab_source_type||p.type||'').toLowerCase();
    const building=!!p.building||t==='building'||t==='building_part';
    const rail=!!p.railway||t==='railway';const group=building?2:rail?1:0;groups[group].push(f);
   }
   for(let k=0;k<3;k++){
    ctx.fillStyle=light?'#b1a28b':'#9a9484';ctx.strokeStyle=k===1?'#d4c0aa':k===0?'#dbbc7d':'#e0d2b6';
    ctx.lineWidth=k===0?Math.max(1,Math.min(9,this.scale*6)):k===1?Math.max(1,Math.min(4,this.scale*3)):.6;
    for(const f of groups[k]){
     if(shapes>=maxDraw)break;
     try{const kind=k===2?'building':k===1?'rail':'road';if(this._drawGeometry(ctx,f.geometry,kind))shapes++}catch(_){}
    }
    if(shapes>=maxDraw)break;
   }
   ctx.restore();paintedTiles++;
   if(shapes>=maxDraw)break;
  }
  this.stats={shapes,tiles:paintedTiles};
  // Anchor marker: not a survey control point.
  const a=mercatorProject(36.506491,45.30844),[ax,ay]=this.worldToScreen(a.x,a.y);
  if(ax>-30&&ax<w+30&&ay>-30&&ay<h+30){ctx.fillStyle='#f5b55b';ctx.beginPath();ctx.arc(ax,ay,4.5,0,Math.PI*2);ctx.fill();ctx.font='12px system-ui';ctx.fillText('≈ Керчь / геореференс',ax+10,ay-12)}
  const stats=this.store.stats(),place=mercatorUnproject(this.center.x,this.center.y);
  const line=`${this.store.mode==='none'?'Нет регионального набора':this.store.mode} · ${stats.cached}/${stats.indexed} в кэше · на экране ${paintedTiles} тайлов, ${shapes} объектов · центр ${place.lat.toFixed(4)}°, ${place.lon.toFixed(4)}°`;
  if(this.status)this.status.textContent=this.tooFar?'Слишком большой обзор для загрузки тайлов: увеличь масштаб. Крым показан только схематично.':this.error&&stats.mode==='none'?this.error:line+(stats.failures?' · ошибок загрузки: '+stats.failures:'');
  const scaleEl=document.getElementById('atlas-scale');if(scaleEl)scaleEl.textContent=`${(120/this.scale/1000).toFixed(2)} км / 120 px (проекционная шкала)`;
 }
 setDemo(){
  const tileSize=2048,center=mercatorProject(36.506491,45.30844),index={type:'TrussLabRegionIndex',version:1,projection:'EPSG:3857',tileSizeMeters:tileSize,tiles:{},metadata:{sources:['SYNTHETIC DEMO — NOT REAL MAP']}};
  const files=new Map(),group=new Map(),lat=45.30844;
  for(let i=0;i<70;i++){
   const lon=36.506491+(.008+(i%14)*.0015),lat0=lat-.009+Math.floor(i/14)*.00135;
   const poly=[[lon,lat0],[lon+.0004,lat0],[lon+.0004,lat0+.00028],[lon,lat0+.00028],[lon,lat0]];
   const m=mercatorProject(lon,lat0),key=`${Math.floor(m.x/tileSize)}:${Math.floor(m.y/tileSize)}`;
   if(!group.has(key))group.set(key,[]);
   group.get(key).push({type:'Feature',properties:{building:'yes','building:levels':1+i%5,trusslab_source_type:'synthetic demo'},geometry:{type:'Polygon',coordinates:[poly]}});
  }
  for(const [key,features] of group){const [x,y]=key.split(':');const path=`tiles/${x}_${y}.geojson`;
   index.tiles[key]={path,features:features.length};files.set(path,{type:'FeatureCollection',features});
  }
  this.store.setManifest(index,{inline:files,mode:'DEMO — синтетические объекты'});this.goTo(lat,36.517,.09);
 }
}
