import {geographicToMetric,metricToGeographic,metricGround} from "./geo_metric.js";
import {mercatorProject,mercatorUnproject} from './region_tiles.js';
import {sampleRegionGround,REGION_GROUND_SCALE,REGION_TERRAIN_SPAN} from './region3d_geometry.js';
import {decodeGLB,buildGLBInstance} from './glb_loader.js';
import {BUILTIN_GLB_ASSETS} from './bundled_assets.js';
/** TrussLab AssetStream 10.8/10.9 — independently cached, locally-instanced GLB meshes.
 * Data sources carry their own accuracy metadata. Original demo assets are illustrative.
 */





const A_LIMIT=1600,A_TILE=REGION_TERRAIN_SPAN;
function aDecode64(s){if(s.length>4_000_000)throw Error('Слишком большой GLB base64');if(typeof atob==='function'){const v=atob(s),b=new Uint8Array(v.length);for(let i=0;i<v.length;i++)b[i]=v.charCodeAt(i);return b}return Uint8Array.from(Buffer.from(s,'base64'))}
function aEncode64(b){if(b.length>4_000_000)throw Error('GLB превышает лимит экспорта');if(typeof btoa==='function'){let out='';for(let i=0;i<b.length;i+=16383)out+=btoa(String.fromCharCode(...b.subarray(i,i+16383)));return out}return Buffer.from(b).toString('base64')}
function aKey(mx,my,span=A_TILE){return Math.floor(mx/span)+':'+Math.floor(my/span)}
export class RegionAssetStream{
 constructor(geoPack,{seedDemo=true}={}){this.pack=geoPack;this.catalog=new Map();this.instances=[];this.cellIndex=new Map();this.revision=1;this.serial=0;this.lastError='';
  for(const asset of BUILTIN_GLB_ASSETS){this.catalog.set(asset.id,{id:asset.id,label:asset.label,license:asset.license,variants:{high:decodeGLB(aDecode64(asset.variants.high)),low:decodeGLB(aDecode64(asset.variants.low))},source:'built-in original GLB'});}
  if(seedDemo)this.seed();
 }
 registerGLB(id,bytes,{label=id,license='Импорт пользователя / лицензия не указана'}={}){
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(id))throw Error('Недопустимое имя модели');if(this.catalog.size>=32)throw Error('Лимит: 32 модели');
  const high=decodeGLB(bytes);this.catalog.set(id,{id,label:String(label).slice(0,80),license,source:'user-imported GLB',binary:new Uint8Array(bytes),variants:{high,low:high}});this.revision++;return high;
 }
 _reindex(){this.cellIndex.clear();for(const p of this.instances){const proj=mercatorProject(p.lon,p.lat),key=aKey(proj.x,proj.y);if(!this.cellIndex.has(key))this.cellIndex.set(key,[]);this.cellIndex.get(key).push({...p,mx:proj.x,my:proj.y})}this.revision++;}
 add({assetId,lon,lat,rotation=0,scale=1,estimated=false,source='placed by user',strictGround=true}={}){
  if(!this.catalog.has(assetId))throw Error('Неизвестная модель');if(this.instances.length>=A_LIMIT)throw Error('Лимит объектов: '+A_LIMIT);
  const m=mercatorProject(lon,lat),ground=sampleRegionGround(this.pack,m.x,m.y);
  if(strictGround&&(!ground.measured||!ground.land))throw Error('Ставить модель можно только на известную сушу GeoPack');
  if(!Number.isFinite(rotation)||!Number.isFinite(scale)||scale<.1||scale>20)throw Error('Неверный масштаб или поворот');
  const p={id:'asset-'+(++this.serial),assetId,lon,lat,rotation,scale,estimated:Boolean(estimated),source:String(source).slice(0,100)};
  this.instances.push(p);this._reindex();return p;
 }
 remove(id){const i=this.instances.findIndex(p=>p.id===id);if(i<0)return false;this.instances.splice(i,1);this._reindex();return true;}
 clear(){this.instances=[];this._reindex();}
 /** Deterministic demo, only on terrain that the bundled GeoPack classifies as land. */
 seed(){if(!this.pack?.coast)return 0;const spots=[[36.4702,45.32503],[36.5008,45.3131],[36.633,45.2445]];let placed=0;
  for(let anchor=0;anchor<spots.length;anchor++){
   const origin=mercatorProject(...spots[anchor]);let search=0;
   for(let j=0;j<4;j++){
    let candidate=null;
    for(let a=0;a<160;a++){
     const angle=(a*2.39996+j*.71+anchor*.33),rad=100+(a%12)*84;
     const mx=origin.x+Math.cos(angle)*rad,my=origin.y+Math.sin(angle)*rad;
     const ground=sampleRegionGround(this.pack,mx,my);
     if(ground.measured&&ground.land&&ground.height<100){candidate=mercatorUnproject(mx,my);break;}
    }
    if(candidate){this.add({assetId:['warehouse','crane','lighthouse','warehouse'][(j+anchor)%4],...candidate,rotation:j*.9,source:'synthetic TrussLab demo / not real buildings'});placed++;}
    search++;
   }
  }
  return placed;
 }
 cellsNear(camX,camY,radius=2200){const r=Math.ceil(radius/A_TILE),cx=Math.floor(camX/A_TILE),cy=Math.floor(camY/A_TILE),out=[];
  for(let tx=cx-r;tx<=cx+r;tx++)for(let ty=cy-r;ty<=cy+r;ty++){
   const key=tx+':'+ty,arr=this.cellIndex.get(key);if(!arr?.length)continue;
   const d=Math.hypot((tx+.5)*A_TILE-camX,(ty+.5)*A_TILE-camY)*REGION_GROUND_SCALE;
   if(d<radius+400)out.push({tx,ty,key,dist:d,instances:arr});
  }
  return out.sort((a,b)=>a.dist-b.dist);
 }
 buildCell(tx,ty,{detail='high',maxTriangles=120_000}={}){
  const arr=this.cellIndex.get(tx+':'+ty)||[],x0=tx*A_TILE,y0=ty*A_TILE,parts=[];let triangles=0,used=0;
  for(const p of arr){const model=this.catalog.get(p.assetId)?.variants?.[detail]||this.catalog.get(p.assetId)?.variants?.high;if(!model)continue;
   if(triangles+model.triangles>maxTriangles)break;
   const g=sampleRegionGround(this.pack,p.mx,p.my);if(!g.measured||!g.land)continue;
   const ob=buildGLBInstance(model,{x:(p.mx-x0)*REGION_GROUND_SCALE,y:g.height,z:-(p.my-y0)*REGION_GROUND_SCALE,yaw:p.rotation,scale:p.scale});
   parts.push(ob.array);triangles+=ob.triangles;used++;
  }
  if(!parts.length)return null;const array=new Float32Array(parts.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of parts){array.set(a,offset);offset+=a.length;}
  return {array,count:array.length/7,triangles,originX:x0,originZ:-y0,tileSpan:A_TILE,instances:used,detail,source:'GLB AssetStream'};
 }
 exportPlacements({includeModels=true}={}){const models=[];if(includeModels)for(const entry of this.catalog.values()){if(entry.binary)models.push({id:entry.id,label:entry.label,license:entry.license,encoding:'base64/GLB',data:aEncode64(entry.binary)});}return {type:'TrussLabAssetScene',version:1,projection:'WGS84',generated:'User-authored or illustrative asset locations',models,assets:this.instances.map(({id,assetId,lon,lat,rotation,scale,estimated,source})=>({id,assetId,lon,lat,rotation,scale,estimated,source}))};}
 importPlacements(scene,{merge=false}={}){
  if(scene?.type!=='TrussLabAssetScene'||scene.version!==1||!Array.isArray(scene.assets)||scene.assets.length>A_LIMIT)throw Error('Неверный формат TrussLabAssetScene v1');
  if(Array.isArray(scene.models)){if(scene.models.length>28)throw Error('В сцене слишком много моделей');for(const model of scene.models){if(this.catalog.has(model.id))continue;if(model.encoding!=='base64/GLB'||typeof model.data!=='string'||model.data.length>6_000_000)throw Error('Недопустимый GLB в сцене');this.registerGLB(model.id,aDecode64(model.data),{label:model.label,license:model.license});}}
  const valid=[];for(const p of scene.assets){if(!this.catalog.has(p.assetId))continue;const m=mercatorProject(p.lon,p.lat),ground=sampleRegionGround(this.pack,m.x,m.y);if(!ground.measured||!ground.land)continue;
   const rotation=Number(p.rotation||0),scale=Number(p.scale||1);if(!Number.isFinite(rotation)||!Number.isFinite(scale)||scale<.1||scale>20)continue;
   valid.push({id:'asset-'+(++this.serial),assetId:p.assetId,lon:p.lon,lat:p.lat,rotation,scale,estimated:Boolean(p.estimated),source:String(p.source||'import').slice(0,100)});
  }
  this.instances=merge?this.instances.concat(valid).slice(0,A_LIMIT):valid;this._reindex();return valid.length;
 }
}

/** Screen-to-ground intersection in the measured GeoPack; never returns water/unknown points.
 * Camera EPSG:3857 projected x,z, y in metres; direction in scene physical space.
 */
export function regionAssetRaycast(pack,cam,forward,{screenX=.5,screenY=.5,aspect=1,fovY=Math.PI*.32,maxDistance=3200,coordinateMode='EPSG:3857'}={}){
 if(!pack||!forward||!cam)return null;
 const cv=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l)};
 const right=norm(cv(forward,[0,1,0])),up=norm(cv(right,forward));
 const x=(screenX-.5)*2*Math.tan(fovY/2)*aspect,y=(.5-screenY)*2*Math.tan(fovY/2);
 const dir=norm(forward.map((v,i)=>v+right[i]*x+up[i]*y));
 if(dir[1]>=-.01)return null;
 let prev=null;
 const point=t=>{
  if(coordinateMode==='ENU'){const x=cam.x+dir[0]*t,z=cam.z+dir[2]*t,g=metricGround(pack,x,z);return {...g,x,z,rayHeight:cam.y+dir[1]*t,t};}
  const mx=cam.x+dir[0]*t/REGION_GROUND_SCALE,my=-cam.z-dir[2]*t/REGION_GROUND_SCALE;const g=sampleRegionGround(pack,mx,my);return {...g,mx,my,rayHeight:cam.y+dir[1]*t,t};};
 for(let t=8;t<=maxDistance;t+=16){const g=point(t);
  if(!g.measured||!g.land){prev=null;continue;}
  if(g.rayHeight<=g.height){if(!prev)return null;let lo=prev.t,hi=t;for(let j=0;j<14;j++){const mid=(lo+hi)/2,p=point(mid);if(!p.measured||!p.land)return null;if(p.rayHeight<=p.height)hi=mid;else lo=mid;}const hit=point(hi),loc=coordinateMode==='ENU'?metricToGeographic(hit.x,hit.z):mercatorUnproject(hit.mx,hit.my);return {lat:loc.lat,lon:loc.lon,height:hit.height,distance:hi};}
  prev=g;
 }
 return null;
}
