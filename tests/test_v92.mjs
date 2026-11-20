import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {sampleGshhgLand,GSHHG_GRID_SIZE} from '../js/gshhg_data.js';
import {sceneToGeo,geoToScene} from '../js/georef.js';
const noop=()=>{};
const ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:1000,clientHeight:640,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const world=new World3D(canvas);world.renderSoftware=noop;
const cfg=BRIDGES.find(v=>v.id==='kerch'),payload={id:'kerch',track:'bridge',soil:cfg.soil,span:cfg.span,model:makeBridge(cfg)};
world.start(payload);
assert.equal(world.coastMode,'reference');
assert.equal(GSHHG_GRID_SIZE,512);
for(const p of [[-195,0],[195,0],[0,110],[-50,-100],[100,75]]){
 const q=sampleGshhgLand(...p);assert(Number.isFinite(q)&&q>=0&&q<=1,'gshhg sampler out of bounds');
 const gps=sceneToGeo(...p),xy=geoToScene(gps.lat,gps.lon);
 assert(Math.abs(xy.x-p[0])<1e-7&&Math.abs(xy.z-p[1])<1e-7);
}
const before=world.staticBuilds;
assert(world.setCoastMode('gshhg'));
assert(world.sceneDirty);
world.render(payload,true);
assert.equal(world.staticBuilds,before+1);
assert(world.mesh.a.every(Number.isFinite));
const b=world.kerchBounds();let minClearance=Infinity;
for(let x=b.x0;x<=b.x1;x+=6){for(const side of [b.roadSide,b.railSide]){
 const z=world.kerchCenter(x)+side,gap=world.kerchDeck(x,z)-world.mapHeight(x,z);
 minClearance=Math.min(minClearance,gap);
 assert(gap>=1.2,`GSHHG mode unexpectedly intersects the bridge at ${x}: ${gap}`);
}}
for(const place of ['kerch','tuzla','taman']){
 world.setPresetCamera(place);assert(world.camPos.every(Number.isFinite));
}
assert.equal(world.setCoastMode('invalid'),false);
assert(world.setCoastMode('reference'));
assert(!world.gisMask,'GIS should remain optional');
console.log(`PASS 9.2: GSHHG regional data, source switch, 2D/3D shared model, 3 area cameras, bridge clearance min=${minClearance.toFixed(2)}`);
