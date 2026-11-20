import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,FOUNDATION_LEVELS,makeBridge,SOILS} from '../js/data.js';
import {solveBridge,solveFoundation} from '../js/physics.js';
const noop=()=>{};
const ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:1024,clientHeight:640,width:0,height:0,style:{display:'block'},getContext:kind=>kind==='2d'?ctx:null,addEventListener:noop,setPointerCapture:noop};
const world=new World3D(canvas);world.renderSoftware=noop;world.trafficEnabled=true;
const model=makeBridge(BRIDGES[1]);const payload={track:'bridge',id:'kerch',soil:'silt',span:32,model};
world.start(payload);
assert.equal(world.worldSize,420);
assert.equal(world.map,true);
assert(world.mesh.a.length>100000);
assert.equal(world.mesh.a.length%7,0);
assert(world.mesh.a.every(Number.isFinite));
let minGap=Infinity;const b=world.kerchBounds();
for(let x=b.x0;x<=b.x1;x+=1.25)for(const off of [b.roadSide,b.railSide]){
 const z=world.kerchCenter(x)+off,deck=world.kerchDeck(x,z);
 for(const dx of [-1.4,0,1.4])for(const dz of [-1.9,-.95,0,.95,1.9]){
 const d=deck-world.mapHeight(Math.max(-110,Math.min(110,x+dx)),z+dz);
 minGap=Math.min(minGap,d);
 assert(d>=1.25,'deck/ground collision at x='+x+' z='+z+' gap='+d);
 }
}
const top=model.nodes.find(n=>n.y>10);assert(top,'model must have arch nodes');
let before=world.modelToWorldNode(top,model,b.roadSide);
top.y+=1;
let after=world.modelToWorldNode(top,model,b.roadSide);
assert(after[1]>before[1]+.2,'3D arch must reflect edited 2D node height');
world.sceneDirty=true;world.render(payload,true);
assert(world.mesh.a.every(Number.isFinite));
for(const cfg of BRIDGES){const a=solveBridge(makeBridge(cfg));assert(a&&typeof a==='object')}
for(const cfg of FOUNDATION_LEVELS){const f={soil:cfg.soil,type:'strip',length:cfg.length,width:cfg.width,floors:cfg.floors,load:cfg.length*cfg.width*cfg.floors*8.5,depth:1.2,stripWidth:1.2,water:SOILS[cfg.soil].water,pileCount:12,pileLength:13};const r=solveFoundation(f);assert(Number.isFinite(r.cost));}
// Artistic profile: the arch decks share one level; road approach climbs faster.
const arches=[b.archA+2,(b.archA+b.archB)/2,b.archB-2];
for(const x of arches){
 const road=world.kerchDeck(x,world.kerchCenter(x)+b.roadSide),rail=world.kerchDeck(x,world.kerchCenter(x)+b.railSide);
 assert(Math.abs(road-rail)<.03,`arch deck levels mismatch at ${x}: ${road}, ${rail}`);
}
const xRoad=b.archA-15;
const road=world.kerchDeck(xRoad,world.kerchCenter(xRoad)+b.roadSide),rail=world.kerchDeck(xRoad,world.kerchCenter(xRoad)+b.railSide);
assert(road<rail-0.15,'shorter road ramp should begin later, then climb more steeply');
const slope=(side,x)=>{const z=x0=>world.kerchCenter(x0)+side;return (world.kerchDeck(x+.5,z(x+.5))-world.kerchDeck(x-.5,z(x-.5)));};
assert(slope(b.roadSide,b.archA-10)>slope(b.railSide,b.archA-10)+.04,'road profile should have steeper local grade');
assert(world.railRamp>world.roadRamp,'railway approach needs longer ramp');
for(const cam of ['overview','arch','map','road','water']){world.setPresetCamera(cam);assert(world.camPos.every(Number.isFinite))}
console.log(`PASS 9.0: ${(world.mesh.a.length/7).toLocaleString()} vertices, minimum map clearance ${minGap.toFixed(2)}, shared arch edit, 10 bridges, 8 foundations, five camera modes`);
// Regression: animated traffic must never rebuild the giant static coast/bridge mesh.
const cacheBuilds=world.staticBuilds;
const staticCount=world.count;
const firstTrafficUpdates=world.trafficUpdates;
world.tick(1000);
world.tick(1240);
world.tick(1480);
assert.equal(world.staticBuilds,cacheBuilds,'traffic triggered static rebuild');
assert.equal(world.count,staticCount,'animated traffic changed static mesh');
assert(world.trafficUpdates>firstTrafficUpdates,'dynamic layer did not refresh');
assert(world.trafficCount>0,'traffic layer missing');
assert(world.trafficCount<world.count/4,'traffic is not isolated in a small layer');
world.setTrafficEnabled(false);
assert.equal(world.trafficCount,0,'paused traffic should be absent');
world.tick(1800);world.tick(2160);
assert.equal(world.staticBuilds,cacheBuilds,'pause triggered static rebuild');
world.setTrafficEnabled(true);
assert(world.trafficCount>0,'resume traffic did not restore dynamic mesh');
console.log('PASS 9.0 cache: static builds='+world.staticBuilds+', traffic updates='+world.trafficUpdates+', static='+staticCount+' vertices, dynamic='+world.trafficCount+' vertices');

// The enlarged terrain must contain both coastlines and open water across the stage.
const hh=(x,z)=>world.mapHeight(x,z);
assert(hh(-190,0)>-1.49,'western Crimea bank absent');
assert(hh(190,0)>-1.49,'eastern Taman bank absent');
assert(hh(0,95)<-1.49,'strait incorrectly filled with land');
assert(Math.abs(hh(-125,-60)-hh(-125,60))>.15,'west coast has no variations');
console.log('PASS 9.0 geography: two distinct banks, central open water, irregular shoreline');
// WGS84 roundtrip for the approximate single-anchor reference frame.
const {sceneToGeo,geoToScene,GEOREF}=await import('../js/georef.js');
for(const v of [[-118,-8.6447513],[0,0],[115,21],[-170,95]]){
 const gps=sceneToGeo(v[0],v[1]),q=geoToScene(gps.lat,gps.lon);
 assert(Math.abs(q.x-v[0])<1e-7&&Math.abs(q.z-v[1])<1e-7,'WGS84 roundtrip failed');
}
assert.equal(GEOREF.anchor.lat,45.308440);
console.log('PASS 9.0 geo: WGS84 anchor and reversible approximate transform');
// WGS84 GeoJSON polygons affect the shared terrain sampler and clear cache.
const origin=sceneToGeo(-95,10),corners=[[-105,4],[-85,4],[-85,16],[-105,16],[-105,4]];
const coords=corners.map(([x,z])=>{const v=sceneToGeo(x,z);return [v.lon,v.lat]});
const imported=world.loadGeoJSON({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[coords]}}]});
assert.equal(imported.polygons,1);
assert.equal(world.sampleLandMask(-95,10),1);
assert.equal(world.sampleLandMask(-95,21),null); // outside GIS bounding box: original terrain mask remains
console.log('PASS 9.0 GIS: user-supplied WGS84 GeoJSON imported and applied');
// Streaming test with a fake WebGL buffer interface, independent from the browser.
let uploads=0,deletes=0;
const mockGL={ARRAY_BUFFER:34962,STATIC_DRAW:35044,createBuffer:()=>({}),bindBuffer:noop,bufferData:()=>uploads++,deleteBuffer:()=>deletes++};
world.software=false;world.gl=mockGL;world.chunkedTerrain=true;world.camPos=[-74,22,17];world.map=true;
world.clearTerrainChunks();
assert.equal(world.streamTerrain(4),true);
assert.equal(uploads,4);
assert(world.visibleChunks.length>=1);
const baseBuilds=world.staticBuilds;
assert.equal(world.streamTerrain(0),false);
assert.equal(uploads,4);
assert.equal(world.staticBuilds,baseBuilds);
world.camPos=[80,23,24];
assert.equal(world.streamTerrain(4),true);
assert.equal(uploads,8);
console.log('PASS 9.0 streaming: GPU tile buffers cached and renewed without rebuilding static bridge');
