/**
 * TrussLab 10.3: regional vector tile storage, independent of the bridge scene.
 * EPSG:3857 *projected* metres. Ground distances must use geodesic calculation.
 * No network request occurs unless the user explicitly supplies an HTTP index.
 */
export const MERC_RADIUS=6378137;
export const MERC_LIMIT=85.05112878;
export function mercatorProject(lon,lat){
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)throw Error('Invalid WGS84 coordinate');
 return {x:MERC_RADIUS*lon*Math.PI/180,y:MERC_RADIUS*Math.log(Math.tan(Math.PI/4+Math.max(-MERC_LIMIT,Math.min(MERC_LIMIT,lat))*Math.PI/360))};
}
export function mercatorUnproject(x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid Mercator coordinate');
 return {lon:x/MERC_RADIUS*180/Math.PI,lat:(2*Math.atan(Math.exp(y/MERC_RADIUS))-Math.PI/2)*180/Math.PI};
}
export function regionTileKey(x,y,tileSize){return `${Math.floor(x/tileSize)}:${Math.floor(y/tileSize)}`;}
export function validateRegionIndex(raw){
 if(raw?.type!=='TrussLabRegionIndex'||raw.version!==1||raw.projection!=='EPSG:3857')throw Error('Нужен TrussLabRegionIndex v1 (EPSG:3857)');
 const size=raw.tileSizeMeters;
 if(!Number.isInteger(size)||size<256||size>20000)throw Error('Недопустимый размер тайла');
 const data=raw.tiles;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Не найден список тайлов');
 const entries=Object.entries(data);if(entries.length>300000)throw Error('Слишком много записей в индексе');
 const tiles=new Map();
 for(const [key,val] of entries){
  if(!/^-?\d+:-?\d+$/.test(key))throw Error('Недопустимый ключ тайла');
  const [tx,ty]=key.split(':').map(Number);
  if(!Number.isSafeInteger(tx)||!Number.isSafeInteger(ty)||Math.abs(tx)>10000000||Math.abs(ty)>10000000)throw Error('Неверные координаты тайла');
  if(typeof val?.path!=='string'||val.path.length>200||!/^tiles\/[a-zA-Z0-9_\-]+\.geojson$/.test(val.path)||val.path.includes('..'))throw Error('Недопустимый путь тайла');
  if(!Number.isInteger(val.features)||val.features<0||val.features>200000)throw Error('Некорректное число объектов');
  tiles.set(key,{path:val.path,features:val.features});
 }
 return {size,tiles,metadata:raw.metadata||{},report:raw.report||{}};
}
export function normalizeRegionFiles(files){
 const map=new Map();
 for(const file of files||[]){
  const path=(file.webkitRelativePath||file.name||'').replaceAll('\\','/');
  // Strip only the chosen root directory; retain tiles/<name>.geojson.
  const parts=path.split('/');const name=parts.length>1?parts.slice(1).join('/'):path;
  if(name==='index.json'||/^tiles\/[a-zA-Z0-9_\-]+\.geojson$/.test(name))map.set(name,file);
 }
 return map;
}
export class RegionTileStore{
 constructor({limit=96,parallel=3,maxBytes=4_000_000}={}){
  this.limit=limit;this.parallel=parallel;this.maxBytes=maxBytes;this.index=null;
  this.files=new Map();this.baseURL=null;this.inline=new Map();this.cache=new Map();this.pending=new Set();this.queue=[];
  this.loaded=0;this.failures=0;this.failedKeys=new Set();this.mode='none';this.onUpdate=()=>{};
 }
 setManifest(raw,{files=null,baseURL=null,inline=null,mode='files'}={}){
  this.index=validateRegionIndex(raw);this.files=files||new Map();this.baseURL=baseURL;
  this.inline=inline||new Map();this.mode=mode;this.queue=[];this.pending.clear();this.cache.clear();this.loaded=0;this.failures=0;this.failedKeys.clear();
  this.epoch=(this.epoch||0)+1;this.onUpdate();return this.index;
 }
 async openDirectory(fileList){
  const files=normalizeRegionFiles(fileList),manifest=files.get('index.json');
  if(!manifest)throw Error('В папке нет index.json; выбери папку, созданную build_region_tiles.py');
  const raw=JSON.parse(await manifest.text());
  return this.setManifest(raw,{files,mode:'directory'});
 }
 async openURL(url){
  if(!/^https?:\/\//i.test(url))throw Error('Нужен URL http(s) к index.json; для диска используй «Папка тайлов»');
  const res=await fetch(url);if(!res.ok)throw Error('HTTP '+res.status);
  const raw=await res.json();const baseURL=new URL('.',url).href;
  return this.setManifest(raw,{baseURL,mode:'http'});
 }
 stats(){return {indexed:this.index?.tiles.size||0,cached:this.cache.size,loaded:this.loaded,pending:this.pending.size,queued:this.queue.length,failures:this.failures,mode:this.mode};}
 get(key){const item=this.cache.get(key);if(item){this.cache.delete(key);this.cache.set(key,item);}return item||null;}
 _evict(){while(this.cache.size>this.limit){const oldest=this.cache.keys().next().value;this.cache.delete(oldest)}}
 _pull(){
  while(this.pending.size<this.parallel&&this.queue.length){
   const item=this.queue.shift(),key=item.key;
   if(this.pending.has(key)||this.cache.has(key)||this.failedKeys.has(key))continue;
   this.pending.add(key);const epoch=this.epoch;
   this._load(key).then(fc=>{
    if(this.epoch!==epoch)return;
    this.cache.set(key,fc);this.loaded++;this._evict();
   }).catch(err=>{
    if(this.epoch!==epoch)return;
    this.failures++;this.failedKeys.add(key);this.lastError=String(err?.message||err).slice(0,160);
   }).finally(()=>{
    if(this.epoch!==epoch)return;
    this.pending.delete(key);this.onUpdate();this._pull();
   });
  }
 }
 async _load(key){
  const source=this.index.tiles.get(key),path=source?.path;
  if(!path)throw Error('Нет тайла в индексе: '+key);
  let content;
  if(this.inline.has(path))content=JSON.stringify(this.inline.get(path));
  else if(this.files.has(path)){
   const f=this.files.get(path);if(f.size>this.maxBytes)throw Error('Слишком большой тайл '+path);
   content=await f.text();
  }else if(this.baseURL){
   const url=new URL(path,this.baseURL);
   if(url.origin!==new URL(this.baseURL).origin||!url.pathname.endsWith('.geojson'))throw Error('Нарушен путь к тайлу');
   const res=await fetch(url.href);if(!res.ok)throw Error(`Тайл ${path}: HTTP ${res.status}`);
   const text=await res.text();if(text.length>this.maxBytes)throw Error('Слишком большой сетевой тайл');content=text;
  }else throw Error('Файл тайла не выбран: '+path);
  if(content.length>this.maxBytes)throw Error('Слишком большой JSON-тайл');
  const fc=JSON.parse(content);
  if(fc?.type!=='FeatureCollection'||!Array.isArray(fc.features)||fc.features.length>25000)throw Error('Неверный формат тайла '+path);
  return fc;
 }
 /** Only queue keys in current viewport; do not preload the full country. */
 request(keys){
  if(!this.index)return;
  const wanted=new Set(keys);
  this.queue=this.queue.filter(x=>wanted.has(x.key));
  const queued=new Set(this.queue.map(x=>x.key));
  for(const key of keys){
   if(!this.index.tiles.has(key)||this.cache.has(key)||this.pending.has(key)||this.failedKeys.has(key)||queued.has(key))continue;
   this.queue.push({key});queued.add(key);
  }
  this._pull();
 }
 /** Used to place a few visible tiles inside existing local bridge 3D scene. */
 loadedFeatureCollection(keys,maxFeatures=12000){
  const features=[];for(const key of keys){const fc=this.get(key);if(!fc)continue;
   if(features.length+fc.features.length>maxFeatures)break;features.push(...fc.features)}
  return {type:'FeatureCollection',name:'Regional tiles / local 3D excerpt',metadata:{source:this.index?.metadata?.sources?.join(', ')||'Imported regional tiles'},features};
 }
}
