import {geoToScene} from './georef.js';
/**
 * GeoCity 10.2 — open geographic building footprints and transport corridors.
 * Geometry is sourced ONLY from an explicitly imported GeoJSON file.
 * Nothing in this module invents buildings or claims as-built accuracy.
 * WGS84 -> local World3D is approximate until a multi-point GIS calibration exists.
 */

export const CITY_SPAN=35;
export const CITY_MAX_FEATURES=16000;
export const CITY_MAX_COORDS=280000;
export const CITY_BOUNDS=210;
const cityClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cityFinite=(v)=>typeof v==='number'&&Number.isFinite(v);
const cityArea2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const cityPolygonArea=p=>p.reduce((sum,a,i)=>sum+a[0]*p[(i+1)%p.length][1]-p[(i+1)%p.length][0]*a[1],0)*.5;
function cityInTriangle(p,a,b,c){const e=.00000001,d1=cityArea2(a,b,p),d2=cityArea2(b,c,p),d3=cityArea2(c,a,p);return d1>=-e&&d2>=-e&&d3>=-e;}
/** Ear clipping with predictable upper bound; simple concave rings only, no holes. */
export function triangulateRing(ring){
 if(!Array.isArray(ring)||ring.length<3||ring.length>256)return [];
 const pts=cityPolygonArea(ring)>=0?ring:[...ring].reverse(),order=pts.map((_,i)=>i),tris=[];
 let guard=0;
 while(order.length>3&&guard++<pts.length*pts.length){
  let clipped=false;
  for(let k=0;k<order.length;k++){
   const ai=order[(k+order.length-1)%order.length],bi=order[k],ci=order[(k+1)%order.length];
   if(cityArea2(pts[ai],pts[bi],pts[ci])<1e-9)continue;
   let inside=false;
   for(const j of order){if(j===ai||j===bi||j===ci)continue;if(cityInTriangle(pts[j],pts[ai],pts[bi],pts[ci])){inside=true;break}}
   if(inside)continue;
   tris.push([pts[ai],pts[bi],pts[ci]]);order.splice(k,1);clipped=true;break;
  }
  if(!clipped)return [];
 }
 if(order.length===3)tris.push([pts[order[0]],pts[order[1]],pts[order[2]]]);
 return tris;
}
function cityDedupeRing(points){
 const result=[];
 for(const p of points){if(!result.length||Math.hypot(p[0]-result.at(-1)[0],p[1]-result.at(-1)[1])>1e-5)result.push(p)}
 if(result.length>1&&Math.hypot(result[0][0]-result.at(-1)[0],result[0][1]-result.at(-1)[1])<1e-5)result.pop();
 return result;
}
function cityClassify(properties){
 const p=properties||{},t=String(p.type||p.subtype||'').toLowerCase();
 if(p.building||p['building:part']||t==='building'||t==='building_part'||p.theme==='buildings')return 'building';
 if(p.highway||p.railway||t==='segment'||t==='road'||t==='rail'||p.class||p.road_class)return 'road';
 return null;
}
function cityIsRail(p){return !!p.railway||['rail','railway','railroad'].includes(String(p.subtype||p.class||'').toLowerCase());}
function cityDimensions(p){
 const rawHeight=Number(p.height??p['building:height']);const floors=Number(p['building:levels']??p.num_floors??p.levels);
 const h=rawHeight>1&&rawHeight<550?rawHeight:(floors>0&&floors<=120?floors*3.2:9.5);
 return {heightM:+cityClamp(h,2.2,250).toFixed(2),heightSource:rawHeight>1?'source height':floors>0?'estimated from levels':'fallback 9.5 m'};
}
function cityConvertCoord(q){if(!Array.isArray(q)||!cityFinite(q[0])||!cityFinite(q[1])||Math.abs(q[0])>180||Math.abs(q[1])>90)throw Error('Недопустимая географическая координата');const s=geoToScene(q[1],q[0]);return [+s.x.toFixed(5),+s.z.toFixed(5)];}
function cityInBounds(bb){return bb[0]<CITY_BOUNDS&&bb[2]>-CITY_BOUNDS&&bb[1]<CITY_BOUNDS&&bb[3]>-CITY_BOUNDS;}
function cityBbox(pts){return [Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]}
function cityHighwayWidth(p){const t=String(p.highway||p.class||p.road_class||'').toLowerCase();return /motorway|trunk/.test(t)?18:/primary/.test(t)?12:/secondary/.test(t)?10:/tertiary/.test(t)?8:/residential|living_street/.test(t)?5:/service|track|path|footway/.test(t)?2.6:6;}
/**
 * Parse and cityClassify in a bounded run. One in-memory feature is owned by one tile;
 * long roads are split into segments. No network/API access.
 */
export function parseCityGeoJSON(input){
 if(input?.type!=='FeatureCollection'||!Array.isArray(input.features))throw Error('Ожидается GeoJSON FeatureCollection');
 if(input.features.length>CITY_MAX_FEATURES)throw Error(`Слишком много объектов (максимум ${CITY_MAX_FEATURES} за импорт)`);
 const output=[],report={input:input.features.length,buildings:0,roads:0,rails:0,skipped:0,holes:0,invalid:0,estimatedHeights:0,source:String(input.name||input.metadata?.source||'Пользовательский GeoJSON').slice(0,100)};
 let total=0;
 const pushRoad=(geo,p,rail)=>{
  for(let i=1;i<geo.length;i++){
   const start=geo[i-1],end=geo[i],distance=Math.hypot(start[0]-end[0],start[1]-end[1]);
   const steps=cityClamp(Math.ceil(distance/(CITY_SPAN*.60)),1,100);
   for(let step=0;step<steps;step++){
    const mix=t=>[start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t];
    const segment=[mix(step/steps),mix((step+1)/steps)],bb=cityBbox(segment),dx=segment[0][0]-segment[1][0],dz=segment[0][1]-segment[1][1];
    if(!cityInBounds(bb)||Math.hypot(dx,dz)<.004)continue;
    const t={kind:rail?'rail':'road',points:segment,bb,widthM:rail?3:cityHighwayWidth(p),tileX:Math.floor((segment[0][0]+segment[1][0])/(2*CITY_SPAN)),tileZ:Math.floor((segment[0][1]+segment[1][1])/(2*CITY_SPAN))};
    output.push(t);if(rail)report.rails++;else report.roads++;
   }
  }
 };
 for(const feat of input.features){
  const type=cityClassify(feat?.properties),g=feat?.geometry,p=feat?.properties||{};
  if(!type||!g){report.skipped++;continue;}
  try{
   if(type==='building'){
    const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    if(!polygons.length){report.skipped++;continue;}
    for(const rings of polygons){
     if(!Array.isArray(rings)||!Array.isArray(rings[0]))continue;
     if(rings.length>1){report.holes++;continue;} // avoid incorrect filled courtyards
     const sourceRing=rings[0];total+=sourceRing.length;if(total>CITY_MAX_COORDS)throw Error('Слишком много координат');
     let pts=cityDedupeRing(sourceRing.map(cityConvertCoord));if(pts.length<3||pts.length>128)continue;
     if(cityPolygonArea(pts)<0)pts=[...pts].reverse();
     const bb=cityBbox(pts);if(!cityInBounds(bb)||Math.abs(cityPolygonArea(pts))<.001)continue;
     const roof=triangulateRing(pts);if(!roof.length)continue;
     const d=cityDimensions(p),cx=(bb[0]+bb[2])/2,cz=(bb[1]+bb[3])/2;
     output.push({kind:'building',points:pts,triangles:roof,bb,heightM:d.heightM,heightSource:d.heightSource,tileX:Math.floor(cx/CITY_SPAN),tileZ:Math.floor(cz/CITY_SPAN)});
     if(d.heightSource==='fallback 9.5 m')report.estimatedHeights++;
     report.buildings++;
    }
   }else{
    const rail=cityIsRail(p),lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
    if(!lines.length){report.skipped++;continue;}
    for(const line of lines){total+=line.length;if(total>CITY_MAX_COORDS)throw Error('Слишком много координат');if(line.length<2)continue;pushRoad(line.map(cityConvertCoord),p,rail)}
   }
  }catch(err){if(/Слишком много координат/.test(err.message))throw err;report.invalid++;}
 }
 const tiles=new Map();for(const e of output){const key=`${e.tileX}:${e.tileZ}`;if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(e)}
 report.tiles=tiles.size;report.renderable=output.length;report.coords=total;
 return {tiles,items:output,report,accuracy:'WGS84 source footprints in approximate single-anchor TrussLab scene; heights may be estimated',sourceGeoJSON:input};
}
