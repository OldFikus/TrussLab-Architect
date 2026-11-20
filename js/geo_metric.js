import {mercatorUnproject,mercatorProject} from './region_tiles.js';
import {geoToScene,sceneToGeo,GEOREF} from './georef.js';
import {sampleCoast,sampleDem} from './geopack.js';
import {geoToENU,enuToGeo} from './geodesy_enu.js';
/** GeoCore 11.0 — metric coordinate frame for streamed regional 3D.
 * World 3D: x=ENU East (metres), z=-ENU North (metres), y=DSM height (metres).
 * IMPORTANT: DEM elevations are *not* ellipsoidal; do not feed them as WGS84 height.
 * The bridge remains an editable legacy local scene, accessed through an explicit
 * approximate WGS84 adapter. Historical EPSG:3857 vector tiles stay unchanged on disk.
 */




export const GEOCORE_ORIGIN=Object.freeze({lat:45.30844,lon:36.506491,height:0});
export const GEOCORE_METRIC_STEP=768;
const valid=n=>Number.isFinite(n);
export function geographicToMetric(lat,lon){const m=geoToENU(lat,lon,0,GEOCORE_ORIGIN);return {x:m.east,z:-m.north};}
/** Numerical inverse of the horizontal ENU coordinates evaluated at ellipsoidal h=0.
 * ENU tangent curvature affects the UP coordinate, which we never misuse as a DSM height.
 */
export function metricToGeographic(x,z){
 if(!valid(x)||!valid(z)||Math.hypot(x,z)>650_000)throw Error('ENU coordinate outside configured regional frame');
 let g=enuToGeo({east:x,north:-z,up:0},GEOCORE_ORIGIN);
 for(let i=0;i<6;i++){
  const p=geographicToMetric(g.lat,g.lon),dx=x-p.x,dn=p.z-z;
  if(Math.hypot(dx,dn)<.00001)break;
  const mlon=111320*Math.max(.05,Math.cos(g.lat*Math.PI/180));
  g={lat:g.lat+dn/111132,lon:g.lon+dx/mlon};
 }
 return {lat:g.lat,lon:g.lon};
}
export function mercatorToMetric(mx,my){const g=mercatorUnproject(mx,my);return geographicToMetric(g.lat,g.lon);}
export function metricToMercator(x,z){const g=metricToGeographic(x,z);return mercatorProject(g.lon,g.lat);}
export function metricGround(pack,x,z){
 if(!pack)return {height:-2,land:false,measured:false};
 // The originally prepared GeoPack uses the historical approximate scene projection.
 // We retain that source grid unchanged while mapping coordinates through WGS84.
 const g=metricToGeographic(x,z),s=geoToScene(g.lat,g.lon);
 const land=sampleCoast(pack,s.x,s.z),dem=sampleDem(pack,s.x,s.z);
 if(land===null||dem===null)return {height:-2,land:false,measured:false};
 if(land<.5)return {height:-.48,land:false,measured:true};
 return {height:Math.max(-4,Math.min(280,dem)),land:true,measured:true};
}
/** Translate legacy EPSG:3857 CPU mesh to local ENU metres. Does not alter GeoJSON.
 * Each triangle's vertices are non-indexed (7 floats: position, normal, material).
 * World origins shift from Mercator to ENU. Recompute normals for the new basis.
 */
export function reprojectMercatorMesh(mesh,localScale=Math.cos(45.30844*Math.PI/180)){
 if(!mesh||!(mesh.array instanceof Float32Array))throw Error('Metric reprojection expects CPU Float32 mesh');
 if(mesh.projection==='ENU')return mesh;
 const baseX=mesh.originX,baseY=-mesh.originZ;
 const origin=mercatorToMetric(baseX,baseY),out=new Float32Array(mesh.array.length),src=mesh.array;
 const cache=new Map();
 for(let i=0;i<src.length;i+=7){
  const px=src[i],pz=src[i+2],key=px+','+pz;
  let local=cache.get(key);
  if(!local){const m=mercatorToMetric(baseX+px/localScale,baseY-pz/localScale);local=[m.x-origin.x,m.z-origin.z];cache.set(key,local)}
  out[i]=local[0];out[i+1]=src[i+1];out[i+2]=local[1];out[i+6]=src[i+6];
 }
 for(let i=0;i+20<out.length;i+=21){
  const ax=out[i],ay=out[i+1],az=out[i+2];
  const ux=out[i+7]-ax,uy=out[i+8]-ay,uz=out[i+9]-az;
  const vx=out[i+14]-ax,vy=out[i+15]-ay,vz=out[i+16]-az;
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
  for(let j=0;j<3;j++){out[i+j*7+3]=nx;out[i+j*7+4]=ny;out[i+j*7+5]=nz;}
 }
 const tileSpan=(mesh.tileSpan??384)*localScale;
 return {...mesh,array:out,originX:origin.x,originZ:origin.z,tileSpan,projection:'ENU',metric:true};
}
export function bridgeSceneToMetric(x,z){const g=sceneToGeo(x,z);return {...geographicToMetric(g.lat,g.lon),source:'approximate bridge georeference'};}
export function metricToBridgeScene(x,z){const g=metricToGeographic(x,z);return geoToScene(g.lat,g.lon);}
export function bridgeGeoAccuracy(){return {anchor:GEOCORE_ORIGIN,worldAnchor:GEOREF.worldAnchor,calibration:GEOREF.calibration,surveyed:false,verticalDatum:'Copernicus DSM source datum, NOT WGS84 ellipsoidal height'};}
/** Persist regional camera in stable WGS84; legacy 10.x positions are projected. */
export function migrateRegionCamera(camera,projection='EPSG:3857'){
 if(!camera||!valid(camera.x)||!valid(camera.z)||!valid(camera.y))throw Error('Invalid saved camera');
 if(projection==='ENU')return {...camera};
 if(projection!=='EPSG:3857')throw Error('Unknown legacy camera projection');
 const p=mercatorToMetric(camera.x,-camera.z);return {x:p.x,z:p.z,y:camera.y};
}
export function exportMetricCamera(camera){const g=metricToGeographic(camera.x,camera.z);return {type:'TrussLabRegionCamera',version:2,projection:'WGS84',lat:g.lat,lon:g.lon,heightDSM:camera.y,sourceAccuracy:'regional DEM / illustrative structures'};}
export function importMetricCamera(saved){
 if(saved?.type!=='TrussLabRegionCamera')throw Error('Invalid camera');
 if(saved.version===2&&saved.projection==='WGS84')return {...geographicToMetric(saved.lat,saved.lon),y:saved.heightDSM};
 if(saved.version===1&&saved.projection==='EPSG:3857')return migrateRegionCamera(saved.camera);
 throw Error('Unsupported camera format');
}
