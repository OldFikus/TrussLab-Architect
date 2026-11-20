import {sceneToGeo,geoToScene} from './georef.js';
import {sampleCoast} from './geopack.js';
// TrussLab 10.1 TerraBuild: editable user-made buildings, not surveyed structures.
// Scene unit ≈ 80 m horizontally in the approximate GeoPack frame.


export const SETTLEMENT_TYPES={
 house:{label:'Частный дом',w:2.0,d:2.35,floors:2,space:1.2,mat:10,roof:19},
 apartment:{label:'Многоквартирный',w:3.6,d:3.05,floors:5,space:1.7,mat:20,roof:8},
 warehouse:{label:'Склад / цех',w:4.7,d:3.5,floors:1,space:2.1,mat:12,roof:11},
 tree:{label:'Дерево',w:.8,d:.8,floors:1,space:.28,mat:15,roof:15},
 lamp:{label:'Фонарь',w:.27,d:.27,floors:1,space:.20,mat:5,roof:23}
};
const settlementClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const MAX_SETTLEMENT_OBJECTS=240;
const validCoord=v=>Number.isFinite(v)&&Math.abs(v)<=210;
export function normalizeSettlement(raw){
 if(!raw||!SETTLEMENT_TYPES[raw.type])throw Error('Неизвестный тип постройки');
 const {type}=raw,meta=SETTLEMENT_TYPES[type],x=Number(raw.x),z=Number(raw.z);
 if(!validCoord(x)||!validCoord(z))throw Error('Объект за пределами карты');
 const floors=type==='house'?settlementClamp(Math.round(Number(raw.floors)||2),1,3):type==='apartment'?settlementClamp(Math.round(Number(raw.floors)||5),2,10):1;
 let yaw=Math.round(Number(raw.yaw)||0);yaw=((yaw%360)+360)%360;yaw=Math.round(yaw/90)*90%360;
 return {id:Number.isSafeInteger(raw.id)&&raw.id>0?raw.id:0,type,x:+x.toFixed(3),z:+z.toFixed(3),floors,yaw, label:typeof raw.label==='string'?raw.label.slice(0,64):meta.label};
}
export function settlementExtent(item){const d=SETTLEMENT_TYPES[item.type],flip=item.yaw%180!==0;return {width:flip?d.d:d.w,depth:flip?d.w:d.d,radius:Math.hypot(d.w,d.d)*.5+d.space};}
// Terrain and collision validation is deliberately non-destructive: the OSM mask/DSM never gets edited.
export function checkSettlementPlacement(world,existing,candidate,{ignoreId=null}={}){
 const b=normalizeSettlement(candidate),type=SETTLEMENT_TYPES[b.type],ext=settlementExtent(b);
 if(Math.abs(b.x)+ext.width/2>=world.worldSize/2||Math.abs(b.z)+ext.depth/2>=world.worldSize/2)return {ok:false,reason:'Участок выходит за границу карты'};
 const corners=[[0,0],[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
 const elevations=[];
 for(const [a,c] of corners){const x=b.x+a*ext.width,z=b.z+c*ext.depth;
  if(world.geoPack?.coast){const val=sampleCoast(world.geoPack,x,z);if(val===null||val<.68)return {ok:false,reason:'Здесь вода или береговая граница OSM'};}
  const h=world.mapHeight(x,z);if(!Number.isFinite(h)||h<-1.45)return {ok:false,reason:'Основание находится в воде'};
  elevations.push(h);
 }
 if(b.type!=='tree'&&b.type!=='lamp'&&Math.max(...elevations)-Math.min(...elevations)>3.0)return {ok:false,reason:'Крутой склон — выберите площадку ровнее'};
 const bounds=world.kerchBounds?.();
 if(bounds&&b.x>=-207&&b.x<=207){
  for(const [side,clearance] of [[bounds.roadSide,3.3],[bounds.railSide,3.0]]){
   const center=world.trackCenter(b.x,side);
   if(Math.abs(b.z-center)<ext.depth/2+clearance)return {ok:false,reason:'Слишком близко к автодороге или железной дороге'};
  }
 }
 for(const other of existing){if(other.id===ignoreId)continue;
  const old=settlementExtent(other),dx=Math.abs(other.x-b.x),dz=Math.abs(other.z-b.z);
  if(dx<(ext.width+old.width)/2+.4 && dz<(ext.depth+old.depth)/2+.4)return {ok:false,reason:'Место уже занято другим объектом'};
 }
 return {ok:true,item:b,ground:world.mapHeight(b.x,b.z)};
}
export class SettlementStore{
 constructor(){this.items=[];this.nextId=1}
 add(world,raw){if(this.items.length>=MAX_SETTLEMENT_OBJECTS)return {ok:false,reason:'Достигнут предел 240 объектов'};
  const q=checkSettlementPlacement(world,this.items,raw);if(!q.ok)return q;
  const item={...q.item,id:this.nextId++};this.items.push(item);return {ok:true,item};
 }
 remove(id){const i=this.items.findIndex(x=>x.id===id);if(i<0)return false;this.items.splice(i,1);return true}
 nearest(x,z,maxDist=3.5){let best=null,dist=maxDist;for(const item of this.items){const d=Math.hypot(item.x-x,item.z-z);if(d<dist){best=item;dist=d}}return best}
 clear(){this.items=[];this.nextId=1}
 restore(items){if(!Array.isArray(items)||items.length>MAX_SETTLEMENT_OBJECTS)throw Error('Неверное количество объектов');
  const copy=items.map(normalizeSettlement),ids=new Set();for(const b of copy){if(!b.id||ids.has(b.id))throw Error('Повторяющийся идентификатор постройки');ids.add(b.id)}
  this.items=copy;this.nextId=Math.max(1,...copy.map(b=>b.id+1));return this.items.length;
 }
 toJSON(){return this.items.map(x=>({...x}))}
 toGeoJSON(){return {type:'FeatureCollection',name:'TrussLab TerraBuild 10.1 — приблизительные координаты',features:this.items.map(item=>{
  const p=sceneToGeo(item.x,item.z);return {type:'Feature',properties:{id:item.id,type:item.type,floors:item.floors,yaw:item.yaw,label:item.label,accuracy:'approximate scene anchor; NOT surveyed'},geometry:{type:'Point',coordinates:[p.lon,p.lat]}};
 })};}
 importGeoJSON(world,featureCollection){if(featureCollection?.type!=='FeatureCollection'||!Array.isArray(featureCollection.features))throw Error('Нужен GeoJSON FeatureCollection');
  let added=0,rejected=0;for(const feat of featureCollection.features.slice(0,MAX_SETTLEMENT_OBJECTS)){
   if(feat?.geometry?.type!=='Point'||!Array.isArray(feat.geometry.coordinates)){rejected++;continue}
   try{const [lon,lat]=feat.geometry.coordinates;if(!Number.isFinite(lon)||!Number.isFinite(lat)){rejected++;continue}
    const pos=geoToScene(lat,lon),p=feat.properties||{};
    const result=this.add(world,{type:SETTLEMENT_TYPES[p.type]?p.type:'house',x:pos.x,z:pos.z,floors:p.floors,yaw:p.yaw,label:p.label});
    if(result.ok)added++;else rejected++;
   }catch(e){rejected++}
  }
  return {added,rejected};
 }
}
