import assert from 'node:assert/strict';
import {geoToENU,enuToGeo} from '../js/geodesy_enu.js';
import {geographicToMetric,metricToGeographic,mercatorToMetric,metricToMercator,metricGround,reprojectMercatorMesh,bridgeSceneToMetric,metricToBridgeScene,migrateRegionCamera,exportMetricCamera,importMetricCamera} from '../js/geo_metric.js';
import {mercatorProject} from '../js/region_tiles.js';
import {parseGeoPack} from '../js/geopack.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
import {buildRegionTerrain,REGION_TERRAIN_SPAN,REGION_GROUND_SCALE,buildRegionCityTile} from '../js/region3d_geometry.js';
import {regionAssetRaycast,RegionAssetStream} from '../js/region_assets.js';
import {sampleCoast,sampleDem} from '../js/geopack.js';
import {geoToScene} from '../js/georef.js';
const near=(a,b,tol,msg)=>assert(Math.abs(a-b)<=tol,(msg||'different')+`: ${a} != ${b}`);
const pack=parseGeoPack(BUILTIN_GEOPACK),anchor={lat:45.30844,lon:36.506491,height:0};
// Roundtrip across the full current mapped section and in farther regional points.
for(const [lat,lon] of [[45.30844,36.506491],[45.32503,36.4702],[45.24544,36.59162],[45.11,36.8],[44.9,36.1],[46.5,37.4]]){
 const metric=geographicToMetric(lat,lon),back=metricToGeographic(metric.x,metric.z);
 near(back.lat,lat,1e-8,'latitude'),near(back.lon,lon,1e-8,'longitude');
 const merc=mercatorProject(lon,lat),geo=mercatorToMetric(merc.x,merc.y);
 near(geo.x,metric.x,1e-6),near(geo.z,metric.z,1e-6);
 const roundMerc=metricToMercator(metric.x,metric.z);
 near(roundMerc.x,merc.x,0.002),near(roundMerc.y,merc.y,0.002);
}
const start=geographicToMetric(anchor.lat,anchor.lon);near(start.x,0,0.001);near(start.z,0,0.001);
const x1=geographicToMetric(anchor.lat,anchor.lon+.01);assert(x1.x>750&&x1.x<830,'metric east displacement');
// DSM samples are not WGS84 ellipsoidal heights; preserve their raw value.
for(const [lat,lon] of [[45.32503,36.4702],[45.30844,36.506491],[45.24,36.60]]){
 const s=geoToScene(lat,lon),pt=geographicToMetric(lat,lon);
 const ground=metricGround(pack,pt.x,pt.z),coast=sampleCoast(pack,s.x,s.z),dem=sampleDem(pack,s.x,s.z);
 assert.equal(ground.measured,coast!==null&&dem!==null);
 if(coast!==null&&dem!==null){assert.equal(ground.land,coast>=.5);if(ground.land)near(ground.height,Math.max(-4,Math.min(280,dem)),1e-7);}
}
// Terrain coordinates are metres; nearest tiles should align without the legacy Mercator scale.
const entry={tx:0,ty:0,step:48,dist:0},terrain=buildRegionTerrain(pack,entry,{metric:true});
assert.equal(terrain.projection,'ENU');near(terrain.originX,0,0);near(terrain.originZ,0,0);
assert(terrain.count>60&&terrain.array.every(Number.isFinite));
const next=buildRegionTerrain(pack,{...entry,tx:1},{metric:true});
near(next.originX,REGION_TERRAIN_SPAN,1e-8);near(next.originZ,0,1e-8);
// A legacy mesh must translate both its origin and vertices, retaining absolute GIS locations.
const lon=36.48,lat=45.30,mer=mercatorProject(lon,lat),x0=Math.floor(mer.x/2048)*2048,y0=Math.floor(mer.y/2048)*2048;
const dx=(mer.x-x0)*REGION_GROUND_SCALE,dz=-(mer.y-y0)*REGION_GROUND_SCALE;
const src=new Float32Array([dx,15,dz,0,1,0,5,dx+5,15,dz,0,1,0,5,dx,15,dz+5,0,1,0,5]);
const transformed=reprojectMercatorMesh({array:src,count:3,originX:x0,originZ:-y0,tileSpan:2048});
const actual=geographicToMetric(lat,lon);
near(transformed.originX+transformed.array[0],actual.x,0.05,'mesh x');near(transformed.originZ+transformed.array[2],actual.z,0.05,'mesh z');
assert.equal(transformed.projection,'ENU');assert.equal(transformed.count,3);assert(transformed.array.every(Number.isFinite));
// Legacy saved camera and new stable WGS84 record should resolve to same view.
const old={x:mer.x,z:-mer.y,y:157};const imported=migrateRegionCamera(old);
near(imported.x,actual.x,0.05);near(imported.z,actual.z,0.05);
const saved=exportMetricCamera({...actual,y:157});const fresh=importMetricCamera(saved);
near(fresh.x,actual.x,.01);near(fresh.z,actual.z,.01);near(fresh.y,157,0);
near(importMetricCamera({type:'TrussLabRegionCamera',version:1,projection:'EPSG:3857',camera:old}).x,actual.x,.05);
assert.throws(()=>importMetricCamera({type:'TrussLabRegionCamera',version:3,projection:'other'}),/Unsupported/);
// Historical bridge adapter is reversible, but intentionally marked approximate.
const bridge=bridgeSceneToMetric(-118,-8.6447513),scene=metricToBridgeScene(bridge.x,bridge.z);
near(scene.x,-118,.0001);near(scene.z,-8.6447513,.0001);assert(bridge.source.includes('approximate'));
// Click placement uses actual metric cam x/z, but the asset stays in WGS84.
const assets=new RegionAssetStream(pack);assert(assets.instances.length>0);
const placed=assets.instances[0],m=geographicToMetric(placed.lat,placed.lon);
const hit=regionAssetRaycast(pack,{x:m.x,z:m.z,y:220},[0,-1,0],{maxDistance:600,coordinateMode:'ENU'});
assert(hit,'ENU raycast should hit land');near(hit.lon,placed.lon,0.00002);near(hit.lat,placed.lat,0.00002);
const savedScene=assets.exportPlacements(),again=new RegionAssetStream(pack,{seedDemo:false});
assert.equal(again.importPlacements(savedScene),assets.instances.length);
near(again.instances[0].lat,assets.instances[0].lat,0);
console.log('PASS 11.0: WGS84/ECEF/ENU, metre basis, DSM datum isolation, terrain and city reprojection, camera migration, bridge adapter, raycast, asset persistence');
