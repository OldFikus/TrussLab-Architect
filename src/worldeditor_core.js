/* WorldEditor 2 — deterministic, serializable georeferenced edit model.
   ENU horizontal metres are based on WGS84 anchor, not survey control.
   No external dependencies, offline capable, original raster DEM is immutable. */
(function(root){
'use strict';
const ANCHOR={lat:45.308440,lon:36.506491};
const R=6378137;
const clone=v=>JSON.parse(JSON.stringify(v));
const number=v=>Number.isFinite(v);
const bounds=v=>{let xs=v.map(p=>p[0]),zs=v.map(p=>p[1]);return [Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const area=poly=>Math.abs(poly.reduce((n,p,i)=>n+p[0]*poly[(i+1)%poly.length][1]-poly[(i+1)%poly.length][0]*p[1],0))/2;
const pointIn=(p,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){let a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
// WGS84 ECEF -> ENU at an explicit (non-surveyed) reference point.
// Map convention x=east, z=south. Projection accuracy is metric; the
// bridge alignment and its reference position remain unverified.
const FLAT=1/298.257223563,E2=FLAT*(2-FLAT),DEG=Math.PI/180;
const phi0=ANCHOR.lat*DEG,lam0=ANCHOR.lon*DEG;
const s0=Math.sin(phi0),c0=Math.cos(phi0),sl0=Math.sin(lam0),cl0=Math.cos(lam0);
function ecef(lat,lon,h=0){const p=lat*DEG,l=lon*DEG,sp=Math.sin(p),cp=Math.cos(p),n=R/Math.sqrt(1-E2*sp*sp);return [(n+h)*cp*Math.cos(l),(n+h)*cp*Math.sin(l),(n*(1-E2)+h)*sp];}
const A0=ecef(ANCHOR.lat,ANCHOR.lon);
function local(lat,lon){const p=ecef(lat,lon),dx=p[0]-A0[0],dy=p[1]-A0[1],dz=p[2]-A0[2];return [-sl0*dx+cl0*dy,s0*cl0*dx+s0*sl0*dy-c0*dz];}
function geographic(x,z){const north=-z,east=x;const bx=A0[0]-sl0*east-s0*cl0*north,by=A0[1]+cl0*east-s0*sl0*north,bz=A0[2]+c0*north;
// Solve local tangent-plane vertical offset so the inverse point lies on the
// WGS84 reference ellipsoid, not a plane hundreds of metres above it at 30km.
const ux=c0*cl0,uy=c0*sl0,uz=s0,BMIN=R*(1-FLAT),aa=1/(R*R),bb=1/(BMIN*BMIN);
const A=aa*(ux*ux+uy*uy)+bb*uz*uz,B=2*(aa*(bx*ux+by*uy)+bb*bz*uz),C=aa*(bx*bx+by*by)+bb*bz*bz-1;
const up=(-B+Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A);
const xx=bx+ux*up,yy=by+uy*up,zz=bz+uz*up;const lon=Math.atan2(yy,xx);const r=Math.hypot(xx,yy);let lat=Math.atan2(zz,r*(1-E2));for(let i=0;i<7;i++){const si=Math.sin(lat),n=R/Math.sqrt(1-E2*si*si);lat=Math.atan2(zz+E2*n*si,r);}return [lon/DEG,lat/DEG];}
const MATERIALS={concrete:{name:'Бетон C40',color:'#adb4b1',roughness:.81,metallic:0},steel:{name:'Сталь',color:'#a9bac6',roughness:.36,metallic:.86},brick:{name:'Кирпич',color:'#b16d54',roughness:.87,metallic:0},glass:{name:'Стекло',color:'#8fc4d1',roughness:.18,metallic:.05},asphalt:{name:'Асфальт',color:'#46515a',roughness:.92,metallic:0},wood:{name:'Дерево',color:'#ac8a62',roughness:.73,metallic:0}};
const CATALOG=[
{id:'house',name:'Частный дом',category:'building',author:'TrussLab procedural',license:'CC0 / original',width:16,length:12,floors:2},
{id:'apartment',name:'Жилой квартал',category:'building',author:'TrussLab procedural',license:'CC0 / original',width:38,length:22,floors:5},
{id:'office',name:'Офис',category:'building',author:'TrussLab procedural',license:'CC0 / original',width:32,length:24,floors:8},
{id:'warehouse',name:'Склад',category:'building',author:'TrussLab procedural',license:'CC0 / original',width:46,length:26,floors:1},
{id:'school',name:'Школа',category:'building',author:'TrussLab procedural',license:'CC0 / original',width:40,length:25,floors:3},
{id:'shop',name:'Магазин',category:'building',author:'TrussLab procedural',license:'CC0 / original',width:22,length:16,floors:1},
{id:'clinic',name:'Поликлиника',category:'building',author:'TrussLab procedural',license:'CC0 / original',width:30,length:20,floors:2},
{id:'station',name:'Железнодорожная станция',category:'infrastructure',author:'TrussLab procedural',license:'CC0 / original',width:44,length:16,floors:2},
{id:'lamp',name:'Фонарь',category:'infrastructure',author:'TrussLab procedural',license:'CC0 / original',width:2,length:2,floors:1},
{id:'substation',name:'Подстанция',category:'infrastructure',author:'TrussLab procedural',license:'CC0 / original',width:16,length:12,floors:1},
{id:'bridge-pier',name:'Опора моста (условная)',category:'infrastructure',author:'TrussLab procedural',license:'CC0 / original',width:8,length:8,floors:1}
];
const KINDS=['parcel','building','road','sidewalk','interchange','rail','switch','utility','terrain','marker'];
class WorldEditorCore{
 constructor(){this.origin=clone(ANCHOR);this.objects=[];this.terrain=[];this.snapshots=[];this.history=[];this.future=[];this.id=0;this.revision=0;this.pendingBatch=[];this.materials=clone(MATERIALS);this.catalog=clone(CATALOG);this.sourceInfo={coast:'GeoPack OSM-derived historical',dem:'Copernicus GLO-30 DSM',accuracy:'Approximate anchor; not surveyed'};this.sourceDemImmutable=true;this.alignment=[];}
 snapshotState(){return {objects:clone(this.objects),terrain:clone(this.terrain),materials:clone(this.materials),pendingBatch:clone(this.pendingBatch),alignment:clone(this.alignment),id:this.id,revision:this.revision};}
 _apply(s){this.objects=clone(s.objects);this.terrain=clone(s.terrain);this.materials=clone(s.materials);this.pendingBatch=clone(s.pendingBatch);this.alignment=clone(s.alignment||[]);this.id=s.id;this.revision=s.revision;}
 mutate(fn){const state=this.snapshotState();try{const value=fn();this.history.push(state);if(this.history.length>70)this.history.shift();this.future=[];this.revision++;return value;}catch(err){this._apply(state);throw err;}}
 undo(){if(!this.history.length)return false;this.future.push(this.snapshotState());this._apply(this.history.pop());return true;}
 redo(){if(!this.future.length)return false;this.history.push(this.snapshotState());this._apply(this.future.pop());return true;}
 newId(){return 'we-'+(++this.id);}
 validatePoints(points,min=1){if(!Array.isArray(points)||points.length<min||points.length>3000||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(number)&&p.every(n=>Math.abs(n)<100000)))throw Error('Некорректные координаты в метрах');return points.map(p=>[+p[0],+p[1]]);}
 addParcel(points,zoning='residential',label='Участок'){const path=this.validatePoints(points,3);if(area(path)<20)throw Error('Площадь должна быть не меньше 20 м²');return this.mutate(()=>{const o={id:this.newId(),type:'parcel',points:path,zoning,label,area:area(path)};this.objects.push(o);return o;});}
 addModel(catalogId,x,z,props={}){const ref=this.catalog.find(x=>x.id===catalogId);if(!ref)throw Error('Модель отсутствует в каталоге');if(!number(x)||!number(z))throw Error('Координата не число');return this.mutate(()=>{const o={id:this.newId(),type:'building',catalogId,x,z,width:ref.width,length:ref.length,floors:ref.floors,facade:'windows',material:'concrete',author:ref.author,license:ref.license,...props};this.objects.push(o);return o;});}
 addPath(type,points,props={}){if(!['road','sidewalk','rail','utility','interchange','switch'].includes(type))throw Error('Тип линии не поддерживается');const p=this.validatePoints(points,2);if(p.some((a,i)=>i&&dist(a,p[i-1])<.05))throw Error('Совпадающие вершины линии');return this.mutate(()=>{const o={id:this.newId(),type,points:p,width:type==='road'?8:type==='sidewalk'?2:type==='rail'?3:type==='interchange'?9:1,material:'asphalt',network:type==='utility'?'power':null,...props};this.objects.push(o);return o;});}
 setObject(id,patch){return this.mutate(()=>{const o=this.objects.find(x=>x.id===id);if(!o)throw Error('Объект не найден');for(const [key,value] of Object.entries(patch)){if(['id','type','author','license'].includes(key))continue;if(key==='points')o.points=this.validatePoints(value,2);else if(key==='x'||key==='z'||key==='width'||key==='floors'||key==='length'){if(!number(value))throw Error('Некорректное числовое значение');o[key]=value;}else if(!key.startsWith('_'))o[key]=clone(value);}if(o.type==='parcel')o.area=area(o.points);return o;});}
 remove(id){return this.mutate(()=>{const index=this.objects.findIndex(o=>o.id===id);if(index<0)throw Error('Не найдено');this.objects.splice(index,1);for(const o of this.objects)if(o.parentId===id)o.parentId=null;return true;});}
 setParent(childId,parentId){if(childId===parentId)throw Error('Объект не может наследовать сам себя');const child=this.objects.find(o=>o.id===childId),parent=this.objects.find(o=>o.id===parentId);if(!child||!parent)throw Error('Не найдены связанные объекты');let cursor=parent;while(cursor){if(cursor.id===childId)throw Error('Циклическая связь запрещена');cursor=this.objects.find(o=>o.id===cursor.parentId)}return this.setObject(childId,{parentId});}
 effectiveMaterial(object){let x=object,seen=new Set();while(x?.inheritMaterial&&x.parentId&&!seen.has(x.id)){seen.add(x.id);x=this.objects.find(o=>o.id===x.parentId);}return this.materials[x?.material]||this.materials.concrete;}
 setMaterialVariant(name,base,changes){if(!this.materials[base])throw Error('Базовый материал не найден');if(!/^[a-z0-9_-]{2,25}$/i.test(name))throw Error('Название материала некорректно');return this.mutate(()=>{this.materials[name]={...clone(this.materials[base]),...clone(changes),base};});}
 paintTerrain(x,z,radius,delta,mode='raise'){if(![x,z,radius,delta].every(number)||radius<=0||radius>2000||Math.abs(delta)>50)throw Error('Неверная кисть');return this.mutate(()=>{const b={id:this.newId(),x,z,radius,delta:mode==='lower'?-Math.abs(delta):Math.abs(delta),mode};this.terrain.push(b);return b;});}
 terrainOffset(x,z){let h=0;for(const b of this.terrain){const d=Math.hypot(x-b.x,z-b.z),a=Math.max(0,1-d/b.radius);h+=b.delta*a*a*(3-2*a);}return h;}
 saveSnapshot(label='Снимок'){this.snapshots.push({label,date:new Date().toISOString(),state:this.snapshotState()});if(this.snapshots.length>15)this.snapshots.shift();return this.snapshots.length-1;}
 restoreSnapshot(index){const shot=this.snapshots[index];if(!shot)throw Error('Нет такого снимка');return this.mutate(()=>this._apply(shot.state));}
 local(lat,lon){return local(lat,lon)}
 geographic(x,z){return geographic(x,z)}
 fitToParcel(x,z){return this.objects.filter(o=>o.type==='parcel'&&pointIn([x,z],o.points));}
 validatePlacement(catalogId,x,z){
  const model=this.catalog.find(o=>o.id===catalogId);if(!model)return {ok:false,reason:'Неизвестная модель'};
  const zones=this.objects.filter(o=>o.type==='parcel');if(!zones.length)return {ok:true,reason:'Свободная учебная зона; зонирование не задано'};
  const available=zones.filter(o=>pointIn([x,z],o.points));if(!available.length)return {ok:false,reason:'За границами выделенных земельных зон'};
  const suitable=available.some(zone=>zone.zoning==='park'?['lamp'].includes(catalogId):zone.zoning==='industrial'?['warehouse','substation','station','lamp','office','bridge-pier'].includes(catalogId):zone.zoning==='commercial'?['office','station','school','clinic','shop','lamp','house','apartment'].includes(catalogId):['house','apartment','school','clinic','shop','lamp','office'].includes(catalogId));
  return {ok:suitable,reason:suitable?'Модель соответствует зонированию':'Тип модели не соответствует разрешённому использованию'};
 }
 utilityReport(tolerance=4){
  const byNetwork={};const all=this.objects.filter(o=>o.type==='utility');
  for(const net of ['power','water','sewage','telecom']){
   const paths=all.filter(o=>o.network===net),seen=new Set();let groups=0,length=0;
   for(const line of paths)for(let i=1;i<line.points.length;i++)length+=dist(line.points[i-1],line.points[i]);
   for(const line of paths){if(seen.has(line.id))continue;groups++;seen.add(line.id);const queue=[line];
    while(queue.length){const cur=queue.shift();for(const other of paths){if(seen.has(other.id))continue;
      if(cur.points.some(a=>other.points.some(b=>dist(a,b)<=tolerance))){seen.add(other.id);queue.push(other);}
    }}
   }
   byNetwork[net]={segments:paths.length,components:groups,disconnected:Math.max(0,groups-1),lengthMetres:Math.round(length*100)/100};
  }
  return byNetwork;
 }

 snap(point,radius=18){let best=point,d=radius;for(const o of this.objects){const arr=o.points||(o.type==='building'?[[o.x,o.z]]:[]);for(const p of arr){const e=dist(p,point);if(e<d){d=e;best=p;}}}return [...best];}
 importAlignment(geojson){
  if(geojson?.type!=='FeatureCollection'||!Array.isArray(geojson.features))throw Error('Требуется GeoJSON FeatureCollection');
  const result=[];
  for(const feature of geojson.features){if(!['LineString','MultiLineString'].includes(feature.geometry?.type))continue;
    const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const line of lines){if(!Array.isArray(line)||line.length<2||line.length>10000)throw Error('Некорректная геометрия оси');
      const points=line.map(p=>{if(!Array.isArray(p)||p.length<2||!p.slice(0,2).every(number)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('Неверные WGS84 координаты');return local(p[1],p[0]);});
      const length=points.slice(1).reduce((sum,p,i)=>sum+dist(p,points[i]),0);
      if(length<30||length>70000)throw Error('Недопустимая длина оси');
      const mode=String(feature.properties?.mode||feature.properties?.kind||'road').toLowerCase();
      result.push({id:'axis-'+(result.length+1),mode:mode.includes('rail')?'rail':'road',points,length,source:feature.properties?.source||'Imported GeoJSON, not verified',verified:false});
    }
  }
  if(!result.length||result.length>8)throw Error('Нужны от одной до восьми географических осей');
  return this.mutate(()=>{this.alignment=result;return result.map(o=>({mode:o.mode,length:o.length,source:o.source}));});
 }
 alignmentAudit(){return this.alignment.map(a=>({mode:a.mode,lengthMetres:a.length,approxErrorTo19km:a.length-19000,source:a.source,verified:!!a.verified}));}
 collectGIS(geojson,catalogId='house',spacing=36){const ref=this.catalog.find(o=>o.id===catalogId);if(!ref)throw Error('Модель не найдена');if(!geojson||!Array.isArray(geojson.features))throw Error('Ожидался GeoJSON FeatureCollection');const proposed=[];let considered=0;
 for(const feature of geojson.features){if(feature.geometry?.type!=='Polygon')continue;const ring=feature.geometry.coordinates?.[0];if(!Array.isArray(ring)||ring.length<4||ring.length>10000)continue;const poly=ring.map(p=>local(p[1],p[0])),box=bounds(poly);if(box[2]-box[0]>10000||box[3]-box[1]>10000)continue;
 for(let x=box[0]+spacing/2;x<box[2];x+=spacing)for(let z=box[1]+spacing/2;z<box[3];z+=spacing){if(!pointIn([x,z],poly))continue;considered++;if(proposed.length>=600)throw Error('Слишком много объектов — уменьшите полигон');proposed.push({x,z,catalogId,source:feature.properties?.name||'GeoJSON polygon',approved:false});}}
 if(!proposed.length)throw Error('Подходящих полигонов или точек нет');this.mutate(()=>{this.pendingBatch=proposed});return {count:proposed.length,considered};}
 approveBatch(indices){return this.mutate(()=>{const s=new Set(indices),chosen=this.pendingBatch.filter((x,i)=>s.has(i));for(const item of chosen){const model=this.catalog.find(c=>c.id===item.catalogId);this.objects.push({id:this.newId(),type:'building',catalogId:model.id,x:item.x,z:item.z,width:model.width,length:model.length,floors:model.floors,material:'concrete',facade:'windows',author:model.author,license:model.license,source:item.source});}this.pendingBatch=this.pendingBatch.filter((x,i)=>!s.has(i));return chosen.length;});}
 export(){return {format:'TrussLabWorldEditor',version:2,anchor:clone(this.origin),sourceInfo:clone(this.sourceInfo),sourceDemImmutable:true,editor:this.snapshotState(),snapshots:clone(this.snapshots)};}
 import(data){if(data?.format!=='TrussLabWorldEditor'||data?.version!==2||!data?.editor||!Array.isArray(data.editor.objects))throw Error('Неподдерживаемый формат проекта');if(data.editor.objects.length>20000)throw Error('Слишком много объектов');for(const o of data.editor.objects){if(!KINDS.includes(o.type))throw Error('Неизвестный тип объекта');if(o.points)this.validatePoints(o.points,o.type==='parcel'?3:2);}const incoming=clone(data.editor);return this.mutate(()=>{this._apply(incoming);this.snapshots=clone(data.snapshots||[]).slice(-15);});}
 summary(){const counts={};for(const o of this.objects)counts[o.type]=(counts[o.type]||0)+1;return {objects:this.objects.length,terrainBrushes:this.terrain.length,revision:this.revision,snapshots:this.snapshots.length,counts};}
}
root.TrussLabWorldEditorCore={WorldEditorCore,CATALOG,MATERIALS,ANCHOR,pointIn,area,local,geographic};
})(globalThis);
