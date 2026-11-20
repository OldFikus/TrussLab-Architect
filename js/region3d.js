import {geographicToMetric,metricToGeographic,mercatorToMetric,metricToMercator,metricGround,reprojectMercatorMesh,migrateRegionCamera,exportMetricCamera,importMetricCamera,GEOCORE_METRIC_STEP} from "./geo_metric.js";
import {mercatorProject,mercatorUnproject,regionTileKey} from './region_tiles.js';
import {buildRegionTerrain,buildRegionCityTile,regionCityDetail,visibleTerrainPlan,sampleRegionGround,floatingOrigin,REGION_TERRAIN_SPAN,REGION_GROUND_SCALE} from './region3d_geometry.js';
import {probeWebGPU} from './webgpu_probe.js';
import {RegionWebGPU,webgpuProjection} from './webgpu_renderer.js';
import {REGION_QUALITY_PROFILES,RegionQualityGovernor,meshCpuBytes,evictMeshBytes} from './region_quality.js';
import {visibleRegionMeshes,tileInHorizontalView} from './region_visibility.js';
import {RegionAssetStream,regionAssetRaycast} from './region_assets.js';
/** RegionStream 10.4: real 3D regional terrain from local Copernicus GeoPack,
 * geographic building footprints from streamed RegionTileStore, floating origin.
 * IMPORTANT: 3D regional explorer is a separate engine from the fixed-scale bridge.
 * No remote requests happen unless the user explicitly connects a tile URL.
 */








const Rclamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const Rrad=Math.PI/180;
const Rvec=(x,y,z)=>[x,y,z];
const Rsub=(a,b)=>a.map((v,i)=>v-b[i]);
const Radd=(a,b)=>a.map((v,i)=>v+b[i]);
const Rmul=(a,s)=>a.map(v=>v*s);
const Rdot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const Rcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const Rnorm=a=>Rmul(a,1/(Math.hypot(...a)||1));
function Rperspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];}
function RlookAt(e,c){const z=Rnorm(Rsub(e,c)),x=Rnorm(Rcross([0,1,0],z)),y=Rcross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-Rdot(x,e),-Rdot(y,e),-Rdot(z,e),1];}
function Rmatmul(a,b){const out=[];for(let col=0;col<4;col++)for(let row=0;row<4;row++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+row]*b[col*4+k];out[col*4+row]=v;}return out;}
const REGIONAL_VERTEX=`attribute vec3 p;attribute vec3 n;attribute float material;
uniform mat4 viewProjection;uniform vec3 tileOffset;
varying vec3 vNormal;varying float vMaterial;varying vec3 vWorld;
void main(){vWorld=p+tileOffset;vNormal=n;vMaterial=material;gl_Position=viewProjection*vec4(vWorld,1.0);}`;
const REGIONAL_FRAGMENT=`precision highp float;
varying vec3 vNormal;varying float vMaterial;varying vec3 vWorld;
uniform vec3 sunDir;uniform vec3 cameraOffset;uniform float night;uniform float sunset;uniform float seconds;uniform float fogDistance;uniform float exposure;uniform float materialStyle;
vec3 materialColor(float mat,vec3 p){
 if(mat<.5){float r=sin(p.x*.05)*sin(p.z*.13);return mix(vec3(.27,.39,.23),vec3(.40,.49,.28),r*.5+.5);}
 if(mat<1.5)return vec3(.7,.64,.46);
 if(mat<2.5)return vec3(.45,.41,.33);
 if(mat<3.5)return vec3(.06,.36,.48);
 if(mat<4.5){float c=mod(floor(p.x/24.)+floor(p.z/24.),2.);return mix(vec3(.17,.24,.29),vec3(.20,.28,.34),c);}
 if(mat<5.5){float bands=step(.83,fract(p.y/3.15));return vec3(.58,.62,.63)*(1.-bands*.13);}
 if(mat<6.5)return vec3(.48,.31,.25);
 if(mat<7.5)return vec3(.15,.18,.20);
 if(mat<8.5)return vec3(.43,.48,.49);
 if(mat<9.5)return vec3(.62,.56,.48);
 if(mat<10.5)return vec3(.10,.17,.23);
 return vec3(.55,.62,.64);
}
void main(){
 float mat=floor(vMaterial+.5);vec3 n=normalize(vNormal),sun=normalize(sunDir);
 float d=max(0.0,dot(n,sun));if(n.y<-.1)d=max(d*.6,.19);
 float a=night>.5?.23:sunset>.5?.46:.57;
 vec3 c=materialColor(mat,vWorld)*(a+d*(night>.5?.19:sunset>.5?.64:.87));
 if(mat>2.5&&mat<3.5){float wave=sin(vWorld.x*.055+seconds*1.6)*sin(vWorld.z*.08-seconds*.55);c+=vec3(.04,.08,.1)*wave;}
 if(mat>4.5&&mat<5.5){float win=step(.28,fract(vWorld.x*.23))*step(.2,fract(vWorld.y*.30))*step(.25,fract(vWorld.z*.21));c+=vec3(.05,.07,.065)*win;}
 if(night>.5&&mat>4.5&&mat<5.5){float win=step(.66,fract(vWorld.x*.3))*step(.58,fract(vWorld.y*.30))*step(.4,fract(vWorld.z*.31));c+=vec3(.45,.36,.12)*win;}
 if(night>.5&&mat>9.5&&mat<10.5){float lit=step(.48,fract(vWorld.x*.19+vWorld.y*.33+vWorld.z*.12));c+=vec3(.45,.31,.12)*lit;}
 float dist=distance(vWorld,cameraOffset);float fog=clamp((dist-fogDistance*.45)/(fogDistance*.85),0.,1.);
 vec3 sky=night>.5?vec3(.045,.064,.105):sunset>.5?vec3(.68,.53,.42):vec3(.55,.72,.82);
 vec3 rgb=mix(c,sky,fog*.77);
 float g=dot(rgb,vec3(.2126,.7152,.0722));
 if(materialStyle>1.5)rgb=mix(vec3(g),rgb,.82);
 else if(materialStyle>.5)rgb=mix(vec3(g),rgb,1.16);
 rgb=max(vec3(0.),rgb)*exposure;
 gl_FragColor=vec4(rgb/(rgb+vec3(.25))*.95,1.0);
}`;
function compileRShader(gl,t,code){const sh=gl.createShader(t);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
export class Region3D{
 constructor({overlay,canvas,status,store,geoPack,backToAtlas=()=>{}}){
  this.overlay=overlay;this.canvas=canvas;this.status=status;this.store=store;this.geoPack=geoPack;this.backToAtlas=backToAtlas;
  this.active=false;this.keys={};this.quality='auto';this.governor=new RegionQualityGovernor();this.materialStyle=0;this.culling=true;this.day='day';this.showCity=true;this.stats={frames:0,fps:0,triangles:0,terrainBuilt:0,cityBuilt:0,uploads:0,rebases:0,drawCalls:0};
  const a=geographicToMetric(45.32503,36.4702);this.cam={x:a.x,y:190,z:a.z};this.yaw=.94;this.pitch=-.47;
  this.origin=floatingOrigin(this.cam.x,this.cam.z);this.terrainCache=new Map();this.cityCache=new Map();this.visibleTerrain=[];this.visibleCity=[];
  this.assets=new RegionAssetStream(geoPack);this.showAssets=true;this.assetEditMode=false;this.modelCache=new Map();this.visibleModels=[];
  this.lastStatus=0;this.lastFrame=0;this.frame=0;this.lastGpuProbe=null;this.storeEpoch=store.epoch||0;this.gl=null;this.ctx=null;this.webgpu=null;this.webgpuPending=null;this.webgpuError="";
  this._initGPU();this._bind();
  // Prefer WebGPU when the browser exposes it. The existing WebGL canvas is the fallback.
  if(typeof navigator!=="undefined"&&navigator.gpu)this.enableWebGPU(true);
 }
 _initGPU(){
  let gl=null;try{gl=this.canvas.getContext('webgl',{antialias:true,alpha:false,depth:true,preserveDrawingBuffer:false})}catch(_){/* canvas fallback */}
  if(!gl){this.ctx=this.canvas.getContext('2d');this.software=true;this.statusMessage('WebGL недоступен — включён резервный 2.5D-просмотр. Для полноценного 3D нужен WebGL.');return;}
  try{
   const prog=gl.createProgram();gl.attachShader(prog,compileRShader(gl,gl.VERTEX_SHADER,REGIONAL_VERTEX));gl.attachShader(prog,compileRShader(gl,gl.FRAGMENT_SHADER,REGIONAL_FRAGMENT));gl.linkProgram(prog);
   if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
   this.gl=gl;this.prog=prog;this.ap=gl.getAttribLocation(prog,'p');this.an=gl.getAttribLocation(prog,'n');this.am=gl.getAttribLocation(prog,'material');
   this.uvp=gl.getUniformLocation(prog,'viewProjection');this.uoffset=gl.getUniformLocation(prog,'tileOffset');this.usun=gl.getUniformLocation(prog,'sunDir');this.ucam=gl.getUniformLocation(prog,'cameraOffset');this.unight=gl.getUniformLocation(prog,'night');this.usunset=gl.getUniformLocation(prog,'sunset');this.utime=gl.getUniformLocation(prog,'seconds');this.ufog=gl.getUniformLocation(prog,'fogDistance');this.uexposure=gl.getUniformLocation(prog,'exposure');this.ustyle=gl.getUniformLocation(prog,'materialStyle');
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  }catch(err){
   console.warn('Region3D GPU initialization failed',err);
   // A canvas that acquired WebGL cannot then acquire a 2D context; swap the element.
   const old=this.canvas,replacement=old.cloneNode(false);old.replaceWith(replacement);this.canvas=replacement;
   this.gl=null;this.software=true;this.ctx=replacement.getContext('2d');
   this.statusMessage('WebGL-шейдеры: '+err.message+' · включена обзорная 2.5D-карта');
  }
 }
 _bind(){
  const c=this.canvas;this.pointer=null;
  c.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0};try{c.setPointerCapture(e.pointerId)}catch(_){}});
  c.addEventListener('pointermove',e=>{if(!this.active||!this.pointer||e.pointerId!==this.pointer.id)return;
   const dx=e.clientX-this.pointer.x,dy=e.clientY-this.pointer.y;this.pointer.moved+=Math.hypot(dx,dy);this.pointer.x=e.clientX;this.pointer.y=e.clientY;
   this.yaw+=dx*.004;this.pitch=Rclamp(this.pitch-dy*.0034,-1.48,1.15);
  });
  c.addEventListener('pointerup',e=>{if(this.pointer?.id===e.pointerId){if(this.active&&this.assetEditMode&&this.pointer.moved<7)this._placeAtPointer(e);this.pointer=null}});c.addEventListener('pointercancel',()=>{this.pointer=null});
  c.addEventListener('wheel',e=>{if(!this.active)return;e.preventDefault();const s=e.deltaY<0?1:-1;const f=this.forward();this.cam.x+=f[0]*s*22;this.cam.y+=f[1]*s*22;this.cam.z+=f[2]*s*22;},{passive:false});
  const useKey=e=>{
   if(!this.active||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;
   const code=e.code;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','Space'].includes(code)){e.preventDefault();this.keys[code]=e.type==='keydown';}
   if(e.type==='keydown'&&code==='Escape')this.close();
  };
  window.addEventListener('keydown',useKey);window.addEventListener('keyup',useKey);window.addEventListener('blur',()=>{this.keys={}});
  document.getElementById('region3d-close')?.addEventListener('click',()=>this.close());
  document.getElementById('region3d-location-save')?.addEventListener('click',()=>{try{this.savedCamera=exportMetricCamera(this.cam);let persistent=true;try{localStorage.setItem('trusslab_geocore_camera_110',JSON.stringify(this.savedCamera));}catch(_){persistent=false;}this.statusMessage('Камера WGS84 сохранена '+(persistent?'локально':'до закрытия страницы')+' (высота DSM)');}catch(err){this.statusMessage('Камера: '+err.message)}});
  document.getElementById('region3d-location-load')?.addEventListener('click',()=>{try{let saved=this.savedCamera;if(!saved){try{saved=JSON.parse(localStorage.getItem('trusslab_geocore_camera_110')||'null')}catch(_){}}if(!saved)throw Error('Нет сохранённой камеры');this.cam=importMetricCamera(saved);this._step(0);this.statusMessage('Восстановлена камера WGS84 / ENU')}catch(err){this.statusMessage('Камера: '+err.message)}});
  document.getElementById('region3d-atlas')?.addEventListener('click',()=>{this.close();this.backToAtlas()});
  document.getElementById('region3d-kerch')?.addEventListener('click',()=>this.goTo(45.32503,36.4702));
  document.getElementById('region3d-tuzla')?.addEventListener('click',()=>this.goTo(45.24544,36.59162));
  document.getElementById('region3d-crimea')?.addEventListener('click',()=>this.goTo(45.03,35.45));
  document.getElementById('region3d-quality')?.addEventListener('click',()=>{
   const modes=['auto','low','medium','high','ultra'];this.quality=modes[(modes.indexOf(this.quality)+1)%modes.length];
   document.getElementById('region3d-quality').textContent='Детали: '+this.quality;
  });
  document.getElementById('region3d-light')?.addEventListener('click',()=>{
   const modes=['day','sunset','night'];this.day=modes[(modes.indexOf(this.day)+1)%modes.length];
   document.getElementById('region3d-light').textContent={'day':'☀ День','sunset':'◐ Закат','night':'☾ Ночь'}[this.day];
  });
  document.getElementById('region3d-city')?.addEventListener('click',()=>{this.showCity=!this.showCity;document.getElementById('region3d-city').textContent=this.showCity?'Город: вкл':'Город: выкл'});
  document.getElementById('region3d-culling')?.addEventListener('click',()=>{
   this.culling=!this.culling;
   document.getElementById('region3d-culling').textContent=this.culling?'Отсечение: вкл':'Отсечение: выкл';
  });
  document.getElementById('region3d-material')?.addEventListener('click',()=>{
   this.materialStyle=(this.materialStyle+1)%3;
   document.getElementById('region3d-material').textContent=['Материалы: натуральные','Материалы: кино','Материалы: мягкие'][this.materialStyle];
  });
  document.getElementById('region3d-models')?.addEventListener('click',()=>{
   this.showAssets=!this.showAssets;const b=document.getElementById('region3d-models');if(b)b.textContent='GLB модели: '+(this.showAssets?'вкл':'выкл');
  });
  document.getElementById('region3d-model-focus')?.addEventListener('click',()=>{
   const p=this.assets.instances[0];if(!p){this.statusMessage('Нет размещённых GLB-моделей');return;}
   this.goTo(p.lat+.00055,p.lon-.0011);this.cam.y=Math.max(90,this.cam.y-35);this.pitch=-.35;this.yaw=1.14;this.statusMessage('Демо-модели оригинальные; это не реальные сооружения');
  });
  document.getElementById('region3d-asset-place')?.addEventListener('click',()=>{this.assetEditMode=!this.assetEditMode;
   document.getElementById('region3d-asset-place').textContent=this.assetEditMode?'✓ Клик по суше':'＋ Ставить';
   this.statusMessage(this.assetEditMode?'Режим строительства: выберите модель и щёлкните по видимой суше. Перетаскивание по-прежнему вращает камеру.':'Размещение отключено.');
  });
  document.getElementById('region3d-asset-remove')?.addEventListener('click',()=>{const last=this.assets.instances.at(-1);if(!last){this.statusMessage('Нет объектов для удаления');return;}
   this.assets.remove(last.id);this._clearAssetBuffers();this._saveAssetScene();this.statusMessage('Удалено: '+last.id+' · объектов осталось '+this.assets.instances.length);
  });
  document.getElementById('region3d-asset-save')?.addEventListener('click',()=>this._downloadAssetScene());
  document.getElementById('region3d-asset-load')?.addEventListener('click',()=>document.getElementById('region3d-asset-file')?.click());
  document.getElementById('region3d-asset-file')?.addEventListener('change',async e=>{
   try{const file=e.target.files?.[0];if(!file)return;if(file.size>12_000_000)throw Error('Файл сцены слишком большой');
    const count=this.assets.importPlacements(JSON.parse(await file.text()));this._clearAssetBuffers();this._refreshAssetChoices();this._saveAssetScene();
    this.statusMessage('Сцена восстановлена: '+count+' объектов. Сохранены исходные координаты WGS84.');
   }catch(err){this.statusMessage('Импорт сцены: '+String(err?.message||err));}e.target.value='';
  });
  document.getElementById('region3d-model-import')?.addEventListener('click',()=>document.getElementById('region3d-model-file')?.click());
  document.getElementById('region3d-model-file')?.addEventListener('change',async e=>{
   const file=e.target.files?.[0];if(!file)return;
   try{if(file.size>16_000_000)throw Error('GLB должен быть меньше 16 МБ');
    const id='custom_'+Date.now();const model=this.assets.registerGLB(id,new Uint8Array(await file.arrayBuffer()),{label:file.name});
    const here=metricToGeographic(this.cam.x,this.cam.z);this.assets.add({assetId:id,lon:here.lon,lat:here.lat,source:'Imported user GLB'});
    this._clearAssetBuffers();this._refreshAssetChoices();this._saveAssetScene();this.showAssets=true;this.statusMessage('Загружена модель '+file.name+': '+model.triangles+' △. Размещена на текущем участке суши.');
   }catch(err){this.statusMessage('GLB: '+String(err?.message||err));}
   e.target.value='';
  });
  document.getElementById('region3d-gpu-probe')?.addEventListener('click',async()=>{
   const b=document.getElementById('region3d-gpu-probe');
   if(this.webgpu){this.disableWebGPU();return;}
   b.disabled=true;b.textContent='WebGPU: запуск…';
   await this.enableWebGPU(false);
   b.disabled=false;b.textContent=this.webgpu?'WebGPU: вкл (выкл)':'WebGPU: недоступен';
  });
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{this.resizeDirty=true}).observe(c);
 }
 async enableWebGPU(silent=false){
  if(this.webgpu)return true;
  if(this.webgpuPending)return this.webgpuPending;
  const run=async()=>{
   const backend=new RegionWebGPU();
   try{
    await backend.initialize(this.canvas,{onDeviceLost:reason=>{
     this.webgpuError=reason;
     if(this.webgpu===backend)this.disableWebGPU();
     this.statusMessage('WebGPU: потеря устройства; продолжение в WebGL. '+reason);
    }});
    this.webgpu=backend;this.webgpuError='';
    const b=document.getElementById('region3d-gpu-probe');if(b)b.textContent='WebGPU: вкл (выкл)';
    if(!silent)this.statusMessage('WebGPU-рендерер активен: региональные GPU-тайлы, глубина, WGSL материалы.');
    return true;
   }catch(error){backend.dispose();this.webgpuError=String(error?.message||error);
    if(!silent)this.statusMessage('WebGPU не запущен: '+this.webgpuError+'. Используется WebGL/2.5D.');
    return false;
   }
  };
  this.webgpuPending=run();try{return await this.webgpuPending}finally{this.webgpuPending=null}
 }
 disableWebGPU(){if(!this.webgpu)return;this.webgpu.dispose();this.webgpu=null;const b=document.getElementById('region3d-gpu-probe');if(b)b.textContent='Включить WebGPU';}
 _clearAssetBuffers(){for(const entry of this.modelCache.values()){if(this.gl&&entry.buffer)this.gl.deleteBuffer(entry.buffer);this.webgpu?.release(entry)}this.modelCache.clear();this.visibleModels=[];}
 _refreshAssetChoices(){const select=document.getElementById('region3d-asset-choice');if(!select)return;const old=select.value;select.replaceChildren();
  for(const asset of this.assets.catalog.values()){const option=document.createElement('option');option.value=asset.id;option.textContent=asset.label;select.appendChild(option)}
  if(this.assets.catalog.has(old))select.value=old;
 }
 _placeAtPointer(e){const rect=this.canvas.getBoundingClientRect();const hit=regionAssetRaycast(this.geoPack,this.cam,this.forward(),{screenX:(e.clientX-rect.left)/rect.width,screenY:(e.clientY-rect.top)/rect.height,aspect:rect.width/rect.height,coordinateMode:'ENU'});
  if(!hit){this.statusMessage('Модель не установлена: нет пересечения луча с известной сушей. Опустите взгляд или сместите камеру.');return;}
  const id=document.getElementById('region3d-asset-choice')?.value||'warehouse';
  try{this.assets.add({assetId:id,lat:hit.lat,lon:hit.lon,source:'manual WGS84 asset placement',estimated:false});this._clearAssetBuffers();this._saveAssetScene();this.showAssets=true;
   this.statusMessage('Поставлен объект «'+this.assets.catalog.get(id)?.label+'» · GPS '+hit.lat.toFixed(5)+', '+hit.lon.toFixed(5)+' · расстояние '+Math.round(hit.distance)+' м');
  }catch(err){this.statusMessage('Размещение: '+String(err?.message||err));}
 }
 _saveAssetScene(){try{const s=JSON.stringify(this.assets.exportPlacements());if(s.length<3_500_000)localStorage.setItem('trusslab_asset_scene_109',s);}catch(_){} }
 _restoreAssetScene(){try{const s=localStorage.getItem('trusslab_asset_scene_109');if(s){const count=this.assets.importPlacements(JSON.parse(s));if(count)this.statusMessage('Восстановлено '+count+' моделей из локального сохранения');}}catch(_){}this._refreshAssetChoices();}
 _downloadAssetScene(){try{const scene=this.assets.exportPlacements();const text=JSON.stringify(scene,null,2),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='trusslab_asset_scene_10_9.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);this._saveAssetScene();
  this.statusMessage('Сцена экспортирована: '+scene.assets.length+' экземпляров, '+scene.models.length+' пользовательских GLB (дополнительные файлы не нужны).');
 }catch(err){this.statusMessage('Экспорт: '+String(err?.message||err));}}
 _effectiveQuality(){return this.quality==='auto'?this.governor.level:this.quality}
 _profile(){return REGION_QUALITY_PROFILES[this._effectiveQuality()]}
 forward(){const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch);return Rnorm([sy*cp,Math.sin(this.pitch),cy*cp])}
 goTo(lat,lon){const p=geographicToMetric(lat,lon);this.cam.x=p.x;this.cam.z=p.z;const h=metricGround(this.geoPack,p.x,p.z);this.cam.y=Math.max(145,h.measured?h.height+130:165);this.yaw=1.12;this.pitch=-.42;}
 open(lat=null,lon=null){if(this.assets.pack!==this.geoPack){for(const obj of this.modelCache.values()){if(this.gl&&obj.buffer)this.gl.deleteBuffer(obj.buffer);this.webgpu?.release(obj)}this.modelCache.clear();this.assets=new RegionAssetStream(this.geoPack);this._restoreAssetScene();}this._refreshAssetChoices();if(Number.isFinite(lat)&&Number.isFinite(lon))this.goTo(lat,lon);this.active=true;this.overlay.hidden=false;this.overlay.style.display='flex';this.lastFrame=0;this.keys={};this.canvas.focus?.();this._loop(performance.now())}
 close(){this.active=false;this.overlay.hidden=true;this.overlay.style.display='none';this.keys={};if(this.frame){cancelAnimationFrame(this.frame);this.frame=0}}
 statusMessage(s){if(this.status)this.status.textContent=s}
 _step(dt){const f=this.forward(),right=Rnorm(Rcross(f,[0,1,0])),flat=Rnorm([f[0],0,f[2]]);
  let v=[0,0,0];if(this.keys.KeyW)v=Radd(v,flat);if(this.keys.KeyS)v=Rsub(v,flat);if(this.keys.KeyA)v=Rsub(v,right);if(this.keys.KeyD)v=Radd(v,right);if(this.keys.KeyQ)v[1]-=1;if(this.keys.KeyE||this.keys.Space)v[1]+=1;
  if(Math.hypot(...v)>.01){const speed=(this.keys.ShiftLeft||this.keys.ShiftRight?550:105)*(dt/1000);v=Rmul(Rnorm(v),speed);this.cam.x+=v[0];this.cam.y+=v[1];this.cam.z+=v[2];}
  const floor=metricGround(this.geoPack,this.cam.x,this.cam.z);
  this.cam.y=Math.max(this.cam.y,(floor.measured?floor.height:0)+2.8);
  this.cam.y=Math.min(3500,this.cam.y);
  const next=floatingOrigin(this.cam.x,this.cam.z);
  if(next.x!==this.origin.x||next.z!==this.origin.z){this.origin=next;this.stats.rebases++}
 }
 _makeBuffer(obj){if(!obj)return null;if(!obj.count)return {...obj,buffer:null,array:null};const gl=this.gl;const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,obj.array,gl.STATIC_DRAW);this.stats.uploads++;return {...obj,buffer,array:obj.array};}
 _evict(map,maxEntries,keep){if(map.size<=maxEntries)return;
  for(const [key,value] of map){if(map.size<=maxEntries)break;if(keep.has(key))continue;if(this.gl&&value.buffer)this.gl.deleteBuffer(value.buffer);this.webgpu?.release(value);map.delete(key);}
 }
 _stream(){
  if((this.store.epoch||0)!==this.storeEpoch){for(const item of this.cityCache.values())if(this.gl&&item?.buffer)this.gl.deleteBuffer(item.buffer);this.webgpu?.release(item);this.cityCache.clear();this.storeEpoch=this.store.epoch||0;}
  const terrainQuality=this._effectiveQuality(),range=this._profile().terrainRange;
  const plan=visibleTerrainPlan(this.cam.x,this.cam.z,{quality:terrainQuality,range});
  // Prioritize visible tiles during the first seconds of exploration; remaining
  // sectors are opportunistically prefetched to make camera turns seamless.
  if(this.culling){const visible=p=>tileInHorizontalView({originX:p.tileX,originZ:p.tileZ,tileSpan:REGION_TERRAIN_SPAN},this.cam,this.yaw,{aspect:Math.max(1,this.canvas.clientWidth)/Math.max(1,this.canvas.clientHeight),groundScale:1});
   plan.sort((a,b)=>(Number(!visible(a))-Number(!visible(b)))||a.dist-b.dist);
  }
  const want=new Set(plan.map(p=>`${p.tx}:${p.ty}:${p.step}`));
  let made=0;this.visibleTerrain=[];
  for(const p of plan){const key=`${p.tx}:${p.ty}:${p.step}`;let entry=this.terrainCache.get(key);
   if(!entry&&made<3){const cpu=buildRegionTerrain(this.geoPack,p,{metric:true});entry=this.gl?this._makeBuffer(cpu):{...cpu};this.terrainCache.set(key,entry);made++;this.stats.terrainBuilt++;}
   if(entry){this.terrainCache.delete(key);this.terrainCache.set(key,entry);this.visibleTerrain.push(entry);}
  }
  this._evict(this.terrainCache,this._profile().terrainLimit,want);
  const cityIndex=this.store.index;this.visibleCity=[];
  if(cityIndex){const span=cityIndex.size,camMerc=metricToMercator(this.cam.x,this.cam.z),cx=Math.floor(camMerc.x/span),cy=Math.floor(camMerc.y/span),needed=[];
   const radius=Math.min(6,Math.ceil((range/REGION_GROUND_SCALE+span*.35)/span));
   for(let tx=cx-radius;tx<=cx+radius;tx++)for(let ty=cy-radius;ty<=cy+radius;ty++){
    const key=regionTileKey((tx+.5)*span,(ty+.5)*span,span);
    if(cityIndex.tiles.has(key)){const geo=mercatorUnproject((tx+.5)*span,(ty+.5)*span),site=geographicToMetric(geo.lat,geo.lon);needed.push({key,tx,ty,dist:Math.hypot(site.x-this.cam.x,site.z-this.cam.z)});}
   }
   needed.sort((a,b)=>a.dist-b.dist);this.store.request(needed.map(v=>v.key));let cityMade=0;
   const keepCity=new Set();
   for(const t of needed){
    const detail=regionCityDetail(t.dist,terrainQuality),cacheKey=t.key+'|'+detail;
    keepCity.add(cacheKey);
    let entry=this.cityCache.get(cacheKey);
    if(!entry&&cityMade<2){const fc=this.store.get(t.key);if(fc){const mercatorMesh=buildRegionCityTile(this.geoPack,fc,{tx:t.tx,ty:t.ty,tileSizeMeters:span,detail});const obj=reprojectMercatorMesh(mercatorMesh,REGION_GROUND_SCALE);entry=this.gl?this._makeBuffer(obj):{...obj};this.cityCache.set(cacheKey,entry);cityMade++;this.stats.cityBuilt++;}}
    if(entry){this.cityCache.delete(cacheKey);this.cityCache.set(cacheKey,entry);this.visibleCity.push(entry)}
   }
   this._evict(this.cityCache,this._profile().cityLimit,keepCity);
  }
  this.visibleModels=[];let modelMade=0;const keepModels=new Set();
  if(this.showAssets){
   const merc=metricToMercator(this.cam.x,this.cam.z);
   for(const c of this.assets.cellsNear(merc.x,merc.y,range/REGION_GROUND_SCALE+420)){
    const detail=c.dist<820&&terrainQuality!=='low'?'high':'low',key=c.key+'|'+detail+'|'+this.assets.revision;
    keepModels.add(key);let item=this.modelCache.get(key);
    if(!item&&modelMade<2){const legacy=this.assets.buildCell(c.tx,c.ty,{detail});if(legacy){const cpu=reprojectMercatorMesh(legacy,REGION_GROUND_SCALE);item=this.gl?this._makeBuffer(cpu):cpu;this.modelCache.set(key,item);modelMade++;}}
    if(item){this.modelCache.delete(key);this.modelCache.set(key,item);this.visibleModels.push(item);}
   }
  }
  this._evict(this.modelCache,30,keepModels);
  const keep=new Set([...want,...keepModels]);
  if(this.store.index){const span=this.store.index.size;for(const v of this.visibleCity){const site=metricToMercator(v.originX+v.tileSpan*.5,v.originZ-v.tileSpan*.5);const key=regionTileKey(site.x,site.y,span);keep.add(key+'|'+v.detail);}}
  const b=evictMeshBytes([this.terrainCache,this.cityCache,this.modelCache],{limitBytes:this._profile().cpuBudgetMB*1048576,keep,dispose:e=>{if(this.gl&&e.buffer)this.gl.deleteBuffer(e.buffer);this.webgpu?.release(e);}});
  this.stats.cpuMB=+(b.bytes/1048576).toFixed(1);
 }
 _render(){const c=this.canvas,w=c.clientWidth,h=c.clientHeight;if(w<2||h<2)return;
  const dpr=Math.min(this._profile().dprCap,window.devicePixelRatio||1),W=Math.max(1,Math.round(w*dpr)),H=Math.max(1,Math.round(h*dpr));
  if(c.width!==W||c.height!==H){c.width=W;c.height=H}
  const allEntries=[...this.visibleTerrain,...(this.showCity?this.visibleCity:[]),...(this.showAssets?this.visibleModels:[])];
  const filtered=this.culling?visibleRegionMeshes(allEntries,this.cam,this.yaw,{aspect:w/h,groundScale:1}):{visible:allEntries,culled:0,trianglesCulled:0};
  this.stats.culled=filtered.culled;this.stats.trianglesCulled=filtered.trianglesCulled;
  this.stats.triangles=filtered.visible.reduce((n,e)=>n+(e.triangles||0),0);
  if(this.webgpu?.ready){
   const eye=[(this.cam.x-this.origin.x),this.cam.y,(this.cam.z-this.origin.z)];
   const target=Radd(eye,this.forward());
   const vp=Rmatmul(webgpuProjection(Math.PI*.32,w/h,.25,7500),RlookAt(eye,target));
   const sun=this.day==='night'?[-.2,.25,.3]:[.55,.85,.3];
   const sky=this.day==='night'?[.035,.065,.105,1]:this.day==='sunset'?[.68,.51,.40,1]:[.48,.68,.81,1];
   try{
    this.webgpu.render(filtered.visible,{width:W,height:H,vp,origin:this.origin,camera:eye,sun,night:this.day==='night'?1:0,sunset:this.day==='sunset'?1:0,time:performance.now()*.001,fog:this._profile().fog,groundScale:1,exposure:this.materialStyle===1?1.10:this.materialStyle===2?.90:1,style:this.materialStyle,sky});
    this.stats.drawCalls=this.webgpu.drawCalls;return;
   }catch(error){this.webgpuError=String(error?.message||error);console.warn('WebGPU fallback',error);this.disableWebGPU();}
  }
  if(!this.gl){this._renderFallback(w,h);return;}
  const gl=this.gl;gl.viewport(0,0,W,H);
  const colors=this.day==='night'?[.035,.065,.105,1]:this.day==='sunset'?[.68,.51,.40,1]:[.48,.68,.81,1];gl.clearColor(...colors);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.prog);
  const eye=[(this.cam.x-this.origin.x),this.cam.y,(this.cam.z-this.origin.z)],target=Radd(eye,this.forward());
  const vp=Rmatmul(Rperspective(Math.PI*.32,w/h,.25,7500),RlookAt(eye,target));
  gl.uniformMatrix4fv(this.uvp,false,new Float32Array(vp));
  gl.uniform3f(this.ucam,...eye);gl.uniform3f(this.usun,this.day==='night'?-.2:.55,this.day==='night'?.25:.85,.3);
  gl.uniform1f(this.unight,this.day==='night'?1:0);gl.uniform1f(this.usunset,this.day==='sunset'?1:0);gl.uniform1f(this.utime,performance.now()*.001);
  gl.uniform1f(this.ufog,this._profile().fog);gl.uniform1f(this.uexposure,this.materialStyle===1?1.10:this.materialStyle===2?.90:1);gl.uniform1f(this.ustyle,this.materialStyle);
  for(const [loc,size,offset] of [[this.ap,3,0],[this.an,3,12],[this.am,1,24]])gl.enableVertexAttribArray(loc);
  let drawn=0;
  const draw=entry=>{if(!entry?.count)return;
   if(!entry.buffer&&entry.array){const newBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,newBuffer);gl.bufferData(gl.ARRAY_BUFFER,entry.array,gl.STATIC_DRAW);entry.buffer=newBuffer;}
   if(!entry.buffer)return;
   gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);
   gl.vertexAttribPointer(this.ap,3,gl.FLOAT,false,28,0);gl.vertexAttribPointer(this.an,3,gl.FLOAT,false,28,12);gl.vertexAttribPointer(this.am,1,gl.FLOAT,false,28,24);
   gl.uniform3f(this.uoffset,(entry.originX-this.origin.x),0,(entry.originZ-this.origin.z));
   gl.drawArrays(gl.TRIANGLES,0,entry.count);drawn++;
  };
  for(const t of filtered.visible)draw(t);
  this.stats.drawCalls=drawn;
 }
 _renderFallback(w,h){
  if(!this.ctx)return;
  const ctx=this.ctx,dpr=this.canvas.width/w;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const grad=ctx.createLinearGradient(0,0,0,h);
  if(this.day==='night'){grad.addColorStop(0,'#102037');grad.addColorStop(1,'#37566a')}
  else if(this.day==='sunset'){grad.addColorStop(0,'#b77c69');grad.addColorStop(1,'#dbbc93')}
  else{grad.addColorStop(0,'#639aba');grad.addColorStop(1,'#a7c5c6')}
  ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  const f=this.forward(),right=Rnorm(Rcross(f,[0,1,0])),up=Rcross(right,f),focal=h/(2*Math.tan(Math.PI*.16));
  const project=(px,py,pz)=>{
   const v=[(px-this.cam.x),py-this.cam.y,(pz-this.cam.z)],depth=Rdot(v,f);
   if(depth<2.0)return null;
   const x=w/2+Rdot(v,right)*focal/depth,y=h/2-Rdot(v,up)*focal/depth;
   if(!Number.isFinite(x)||!Number.isFinite(y))return null;
   return {x,y,depth};
  };
  const size=36,step=this.cam.y>800?135:this.cam.y>350?88:57;
  const cx=Math.floor((this.cam.x+f[0]*540)/step)*step,cz=Math.floor((this.cam.z+f[2]*540)/step)*step;
  const half=size/2,grid=new Array((size+1)*(size+1));
  for(let j=0;j<=size;j++)for(let i=0;i<=size;i++){
   const x=cx+(i-half)*step,z=cz+(j-half)*step,geo=metricGround(this.geoPack,x,z);
   grid[j*(size+1)+i]={p:project(x,geo.height,z),land:geo.land,measured:geo.measured,h:geo.height};
  }
  const polys=[];
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
   const a=grid[j*(size+1)+i],b=grid[j*(size+1)+i+1],c=grid[(j+1)*(size+1)+i+1],d=grid[(j+1)*(size+1)+i];
   if(!a.p||!b.p||!c.p||!d.p)continue;
   const corners=[a.p,b.p,c.p,d.p],depth=(a.p.depth+b.p.depth+c.p.depth+d.p.depth)/4;
   if(corners.every(p=>p.x<0||p.x>w+40)||corners.every(p=>p.y<0||p.y>h+40))continue;
   const measured=a.measured&&b.measured&&c.measured&&d.measured;
   const land=measured&&a.land&&b.land&&c.land;
   const high=(a.h+b.h+c.h+d.h)/4;
   polys.push({corners,depth,kind:!measured?4:land?high>40?2:0:3,high});
  }
  polys.sort((a,b)=>b.depth-a.depth);
  ctx.lineWidth=.45;
  for(const q of polys){
   const fog=Rclamp((q.depth-900)/2600,0,.55),lit=this.day==='night'?.35:this.day==='sunset'?.75:1;
   const colors=q.kind===4?[74,95,108]:q.kind===3?[36,108,135]:q.kind===2?[109,111,86]:[86,125,78];
   const shade=.80+Math.min(.25,Math.abs(q.high)/240),water=q.kind===3?1:shade;
   const base=colors.map((v,k)=>Math.round((v*water*lit)*(1-fog)+[100,143,167][k]*fog));
   ctx.fillStyle='rgb('+base.join(',')+')';
   ctx.beginPath();ctx.moveTo(q.corners[0].x,q.corners[0].y);for(let k=1;k<4;k++)ctx.lineTo(q.corners[k].x,q.corners[k].y);ctx.closePath();ctx.fill();
   if(q.kind===4){ctx.strokeStyle='#9ab4c125';ctx.stroke()}
  }
  if(this.showAssets){
   const markers=[];for(const p of this.assets.instances){const m=geographicToMetric(p.lat,p.lon),g=metricGround(this.geoPack,m.x,m.z);
    const base=project(m.x,g.height,m.z),top=project(m.x,g.height+(p.assetId==='crane'?44:p.assetId==='lighthouse'?35:12)*p.scale,m.z);
    if(base&&top&&base.depth<1800)markers.push({base,top});
   }
   markers.sort((a,b)=>b.base.depth-a.base.depth);ctx.strokeStyle='#f4d493';ctx.lineWidth=3;
   for(const o of markers){ctx.beginPath();ctx.moveTo(o.base.x,o.base.y);ctx.lineTo(o.top.x,o.top.y);ctx.stroke();}
  }
  // Only visualize footprints explicitly present in the bundled/loaded regional tiles.
  if(this.showCity&&this.store?.index){
   const glyphs=[];for(const tile of this.visibleCity){
    const key=regionTileKey(tile.originX+this.store.index.size*.5,-tile.originZ+this.store.index.size*.5,this.store.index.size);
    const fc=this.store.get(key);if(!fc)continue;
    for(const feature of fc.features.slice(0,160)){
     if(!feature.geometry||!(feature.properties?.building||/building/.test(String(feature.properties?.type||''))))continue;
     const ring=feature.geometry.type==='Polygon'?feature.geometry.coordinates?.[0]:null;
     if(!Array.isArray(ring)||ring.length<4)continue;
     const point=ring[0],site=geographicToMetric(point[1],point[0]);
     const ground=metricGround(this.geoPack,site.x,site.z),floors=Number(feature.properties?.['building:levels']||2),height=Rclamp(floors*3.2,4,80);
     const a=project(site.x,ground.measured?ground.height:0,site.z),b=project(site.x,(ground.measured?ground.height:0)+height,site.z);
     if(a&&b&&a.depth<1300)glyphs.push({a,b,depth:a.depth});
    }
   }
   glyphs.sort((a,b)=>b.depth-a.depth);ctx.strokeStyle=this.day==='night'?'#ffcf85':'#f0d5ad';ctx.lineWidth=2;
   for(const o of glyphs){ctx.beginPath();ctx.moveTo(o.a.x,o.a.y);ctx.lineTo(o.b.x,o.b.y);ctx.stroke()}
  }
  ctx.fillStyle='#e4f5f0';ctx.font='bold 13px system-ui';ctx.fillText('Резервный 2.5D-просмотр: WebGL недоступен',15,28);
  ctx.font='11px system-ui';ctx.fillText('Рельеф из GeoPack, неизвестные участки показаны серой сеткой',15,46);
 }

 _hud(t){if(t-this.lastStatus<550)return;this.lastStatus=t;
  const g=metricToGeographic(this.cam.x,this.cam.z),ground=metricGround(this.geoPack,this.cam.x,this.cam.z),s=this.stats,st=this.store.stats();
  const text=`GeoCore ENU ${this.cam.x.toFixed(0)} E / ${(-this.cam.z).toFixed(0)} N м · GPS ${g.lat.toFixed(5)}°, ${g.lon.toFixed(5)}° · камера ${this.cam.y.toFixed(0)} м · DEM: ${ground.measured?(ground.land?'суша':'вода'):'НЕТ ДАННЫХ'} · секторы ${this.visibleTerrain.length}/${this.terrainCache.size} · GIS ${this.visibleCity.length}/${st.indexed} · ${s.triangles.toLocaleString('ru-RU')} △ · ${s.fps||'—'} FPS · LOD ${this._effectiveQuality()} · CPU ${s.cpuMB||0} МБ · скрыто ${s.culled||0} · GLB ${this.showAssets?this.visibleModels.length:0} тайл. / ${this.assets.instances.length} объектов · сдвигов ${s.rebases}`;
  const hud=document.getElementById('region3d-hud');if(hud)hud.textContent=text;
  const gpu=document.getElementById('region3d-engine');if(gpu)gpu.textContent=this.webgpu?'WebGPU · ENU / Float64':' '+(this.gl?'WebGL1 · ENU / Floating Origin':'2.5D резерв · ENU');
 }
 _loop(t){if(!this.active)return;
  const dt=this.lastFrame?Math.min(60,t-this.lastFrame):16;this.lastFrame=t;
  this._step(dt);let rendered=false;if(!this.software||t-(this.lastSoftFrame||0)>65){this._stream();this._render();this._hud(t);this.lastSoftFrame=t;rendered=true;}
  if(rendered)this.stats.frames++;if(!this.stats.lastFps)this.stats.lastFps=t;
  if(t-this.stats.lastFps>=950){this.stats.fps=Math.round(this.stats.frames*1000/(t-this.stats.lastFps));this.stats.frames=0;this.stats.lastFps=t;this.governor.observe(this.stats.fps,t,this.quality==='auto');}
  this.frame=requestAnimationFrame(tt=>this._loop(tt));
 }
}
