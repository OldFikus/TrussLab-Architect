import {geographicToMetric,metricToGeographic,metricGround,GEOCORE_METRIC_STEP} from "./geo_metric.js";
import {mercatorProject,mercatorUnproject,regionTileKey} from './region_tiles.js';
import {geoToScene} from './georef.js';
import {sampleCoast,sampleDem} from './geopack.js';
import {triangulateRing} from './geocity.js';
/** RegionStream 10.4: pure geographic mesh generators and floating-origin math.
 * Planar x/z positions are EPSG:3857 projected metres, NOT geodesic distance.
 * CPU retains Float64 absolute coordinates; GPU receives <=2048m tile-local Float32.
 * GeoPack heights are real Copernicus DSM values only inside the GeoPack footprint.
 */





export const REGION_TERRAIN_SPAN=384;
export const REGION_ORIGIN_STEP=768;
// EPSG:3857 metres are enlarged by sec(latitude): correct the local ground scale near Kerch.
// A latitude-dependent geodesic/tangent plane is needed for continental 1:1.
export const REGION_GROUND_SCALE=Math.cos(45.30844*Math.PI/180);
const regionClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function floatingOrigin(x,z,step=REGION_ORIGIN_STEP){return {x:Math.floor(x/step)*step,z:Math.floor(z/step)*step};}
export function gpuLocalPosition(mx,my,origin){return [Math.fround((mx-origin.x)*REGION_GROUND_SCALE),Math.fround((-my-origin.z)*REGION_GROUND_SCALE)];}
export function chooseTerrainLOD(distance,quality='high'){
 const q=quality==='ultra'?1:quality==='medium'?2:quality==='low'?3:1.5;
 return distance<540?Math.round(12*q):distance<1180?Math.round(24*q):Math.round(48*q);
}
export function visibleTerrainPlan(camX,camZ,{quality='high',span=REGION_TERRAIN_SPAN,range=1680}={}){
 const tx=Math.floor(camX/span),ty=Math.floor(-camZ/span),r=Math.min(7,Math.ceil(range/span));
 const tiles=[];
 for(let x=tx-r;x<=tx+r;x++)for(let y=ty-r;y<=ty+r;y++){
  const cx=(x+.5)*span,cz=-(y+.5)*span;
  const d=Math.hypot(cx-camX,cz-camZ);
  if(d>range+span*.3)continue;
  tiles.push({tx:x,ty:y,dist:d,step:chooseTerrainLOD(d,quality),tileX:x*span,tileZ:-y*span});
 }
 tiles.sort((a,b)=>a.dist-b.dist);
 return tiles;
}
export function sampleRegionGround(pack,mx,my){
 if(!pack)return {height:-2,land:false,measured:false};
 const g=mercatorUnproject(mx,my),s=geoToScene(g.lat,g.lon);
 const land=sampleCoast(pack,s.x,s.z),dem=sampleDem(pack,s.x,s.z);
 if(land===null||dem===null)return {height:-2,land:false,measured:false};
 if(land<.5)return {height:-.48,land:false,measured:true};
 return {height:regionClamp(dem,-4,280),land:true,measured:true};
}
export class RegionMesh{
 constructor(){this.vertices=[];this.triangles=0;}
 triangle(a,b,c,m){
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
  const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
  for(const p of [a,b,c])this.vertices.push(p[0],p[1],p[2],nx,ny,nz,m);
  this.triangles++;
 }
 quad(a,b,c,d,m){this.triangle(a,b,c,m);this.triangle(a,c,d,m)}
 finish(){return {array:new Float32Array(this.vertices),count:this.triangles*3,triangles:this.triangles};}
}
export function buildRegionTerrain(pack,entry,{span=REGION_TERRAIN_SPAN,verticalScale=1,metric=false}={}){
 const mesh=new RegionMesh(),tx=entry.tx,ty=entry.ty,step=entry.step,n=Math.max(3,Math.round(span/step));
 const x0=tx*span,y0=ty*span;let valid=0,total=0,shore=0;
 const grid=new Array((n+1)*(n+1));
 for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
  const dx=i*span/n,dy=j*span/n;
  const p=metric?metricGround(pack,x0+dx,-y0-dy):sampleRegionGround(pack,x0+dx,y0+dy);
  grid[j*(n+1)+i]={x:dx*(metric?1:REGION_GROUND_SCALE),y:p.height*verticalScale,z:-dy*(metric?1:REGION_GROUND_SCALE),land:p.land,measured:p.measured};
  total++;if(p.measured)valid++;if(p.measured&&!p.land)shore++;
 }
 const tri=(a,b,c)=>{
  let mat=!a.measured||!b.measured||!c.measured?4:(a.land&&b.land&&c.land)?(Math.max(a.y,b.y,c.y)>32?2:0):3;
  mesh.triangle([a.x,a.y,a.z],[b.x,b.y,b.z],[c.x,c.y,c.z],mat);
 };
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const a=grid[j*(n+1)+i],b=grid[j*(n+1)+i+1],c=grid[(j+1)*(n+1)+i+1],d=grid[(j+1)*(n+1)+i];
  tri(a,b,c);tri(a,c,d);
 }
 // Geometric skirts conceal T-junction cracks between neighboring terrain LODs.
 // Skirts are strictly below the sampled DSM; they are NOT additional measured terrain.
 let skirtTriangles=0;
 const skirt=(a,b)=>{
  const depth=Math.min(14,Math.max(3,3+Math.abs(a.y-b.y)*.33));
  const material=(!a.measured||!b.measured)?4:(!a.land||!b.land)?3:2;
  mesh.quad([a.x,a.y,a.z],[b.x,b.y,b.z],[b.x,b.y-depth,b.z],[a.x,a.y-depth,a.z],material);
  skirtTriangles+=2;
 };
 for(let i=0;i<n;i++){skirt(grid[i],grid[i+1]);skirt(grid[n*(n+1)+i],grid[n*(n+1)+i+1]);}
 for(let j=0;j<n;j++){skirt(grid[j*(n+1)],grid[(j+1)*(n+1)]);skirt(grid[j*(n+1)+n],grid[(j+1)*(n+1)+n]);}
 return {...mesh.finish(),originX:x0,originZ:-y0,tileSpan:span,projection:metric?'ENU':'EPSG:3857',skirtTriangles,lod:n,validFraction:valid/Math.max(1,total),waterFraction:shore/Math.max(1,total)};
}
const isFiniteLonLat=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const heightForBuilding=p=>{
 const h=Number(p.height??p['building:height']),levels=Number(p['building:levels']??p.levels??p.num_floors);
 return h>1&&h<500?Math.min(250,h):levels>=1&&levels<=100?Math.min(190,3.2*levels):9.5;
};
function classify(feature){const p=feature?.properties||{},t=String(p.type||p.subtype||p.trusslab_source_type||'').toLowerCase();
 if(p.building||p['building:part']||/building/.test(t))return 'building';
 if(p.railway||/rail/.test(t))return 'rail';
 if(p.highway||p.class||p.road_class||/road|segment/.test(t))return 'road';
 return '';
}
function projectRing(pts,x0,y0,max=192){
 if(!Array.isArray(pts)||pts.length>max||pts.length<3||!pts.every(isFiniteLonLat))return [];
 const out=[];for(const p of pts){const m=mercatorProject(p[0],p[1]),x=m.x-x0,z=-(m.y-y0);if(!out.length||Math.hypot(out.at(-1)[0]-x,out.at(-1)[1]-z)>.15)out.push([x*REGION_GROUND_SCALE,z*REGION_GROUND_SCALE]);}
 if(out.length>2&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<.15)out.pop();
 return out;
}
export function regionCityDetail(distance,quality='high'){
 const q=quality==='auto'?'high':quality;
 if(q==='low')return 'base';
 if(q==='medium')return distance<600?'roof':'base';
 if(q==='high')return distance<720?'facade':distance<1550?'roof':'base';
 return distance<1100?'facade':distance<2200?'roof':'base';
}
/** Cosmetic LOD, NOT surveyed architectural details. Deterministic per-feature mesh. */
export function buildRegionCityTile(pack,fc,{tx,ty,tileSizeMeters,sizeLimit=1800,detail='base'}={}){
 const m=new RegionMesh(),size=tileSizeMeters||2048,x0=tx*size,y0=ty*size;let windowQuads=0,parapets=0;
 const features=fc?.features||[];let buildings=0,roads=0,rails=0,estimated=0,processed=0;
 for(const f of features){if(processed++>sizeLimit)break;const kind=classify(f),g=f?.geometry,p=f?.properties||{};
  if(!g||!kind)continue;
  if(kind==='building'){
   const parts=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates.slice(0,8):[];
   for(const rings of parts){if(!rings?.length||rings.length>1)continue;const ring=projectRing(rings[0],x0,y0);if(ring.length<3||ring.length>128)continue;
    const cx=ring.reduce((s,v)=>s+v[0],0)/ring.length,cz=ring.reduce((s,v)=>s+v[1],0)/ring.length;
    const ground=sampleRegionGround(pack,x0+cx/REGION_GROUND_SCALE,y0-cz/REGION_GROUND_SCALE);const base=ground.measured&&ground.land?ground.height:0;
    const high=heightForBuilding(p);if(!p.height&&!p['building:height'])estimated++;
    const roof=triangulateRing(ring);if(!roof.length)continue;
    for(let k=0;k<ring.length;k++){
     const a=ring[k],b=ring[(k+1)%ring.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<.25)continue;
     m.quad([a[0],base,a[1]],[b[0],base,b[1]],[b[0],base+high,b[1]],[a[0],base+high,a[1]],5);
    }
    for(const t of roof){m.triangle([t[0][0],base+high,t[0][1]],[t[1][0],base+high,t[1][1]],[t[2][0],base+high,t[2][1]],detail==='base'?6:9)}
    if(detail!=='base'){
     // Low-poly roof edge; real roof shapes and material still require aerial / survey data.
     for(let k=0;k<ring.length;k++){
      const a=ring[k],b=ring[(k+1)%ring.length];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])<1.5)continue;
      m.quad([a[0],base+high,a[1]],[b[0],base+high,b[1]],[b[0],base+high+.42,b[1]],[a[0],base+high+.42,a[1]],9);parapets++;
     }
    }
    if(detail==='facade'&&high>=4&&ring.length<=90){
     const signedArea=ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1]},0);
     const sign=signedArea>=0?1:-1;
     let budget=144;
     for(let k=0;k<ring.length&&budget>0;k++){
      const a=ring[k],b=ring[(k+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<5.2)continue;
      const cols=Math.min(9,Math.floor(length/5)),rows=Math.min(12,Math.floor((high-1)/3.3));
      const nx=sign*dz/length*.11,nz=-sign*dx/length*.11;
      for(let j=0;j<rows&&budget>0;j++)for(let i=0;i<cols&&budget>0;i++){
       const t=(i+.5)/cols,w=Math.min(.19/cols,1.1/length);
       const x1=a[0]+dx*(t-w)+nx,z1=a[1]+dz*(t-w)+nz;
       const x2=a[0]+dx*(t+w)+nx,z2=a[1]+dz*(t+w)+nz;
       const y1=base+1.05+j*3.3,y2=Math.min(base+high-.6,y1+1.45);
       if(y2<=y1+.25)continue;
       m.quad([x1,y1,z1],[x2,y1,z2],[x2,y2,z2],[x1,y2,z1],10);
       windowQuads++;budget--;
      }
     }
    }
    buildings++;
   }
  }else{
   const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates.slice(0,80):[];
   const width=kind==='rail'?1.5:/motorway|trunk/.test(String(p.highway||p.class))?11:/primary/.test(String(p.highway||p.class))?8:3.5;
   for(const line of lines){if(!Array.isArray(line)||line.length<2)continue;
    for(let i=1;i<Math.min(line.length,250);i++){
     if(!isFiniteLonLat(line[i-1])||!isFiniteLonLat(line[i]))continue;
     const a=mercatorProject(line[i-1][0],line[i-1][1]),b=mercatorProject(line[i][0],line[i][1]);
     const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.3||len>1600)continue;
     const nx=dy/len*width*.5/REGION_GROUND_SCALE,ny=-dx/len*width*.5/REGION_GROUND_SCALE;
     const q=[[a.x+nx,a.y+ny],[a.x-nx,a.y-ny],[b.x-nx,b.y-ny],[b.x+nx,b.y+ny]];
     const pts=q.map(([x,y])=>[(x-x0)*REGION_GROUND_SCALE,(sampleRegionGround(pack,x,y).height||0)+.23,-(y-y0)*REGION_GROUND_SCALE]);
     // Do not force an unknown-region road to -2 metres underground.
     for(let k=0;k<4;k++)if(pts[k][1]<0)pts[k][1]=.23;
     m.quad(pts[0],pts[1],pts[2],pts[3],kind==='rail'?8:7);
     if(kind==='rail')rails++;else roads++;
    }
   }
  }
 }
 return {...m.finish(),originX:x0,originZ:-y0,tileSpan:size,buildings,roads,rails,estimated,sourceFeatures:features.length,detail,windowQuads,parapets};
}
