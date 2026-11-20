import assert from 'node:assert/strict';
import {parseGeoPack,sampleCoast,sampleDem} from '../js/geopack.js';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
const N=32,coast=new Uint8Array(N*N),h=new Int16Array(N*N);
for(let j=0;j<N;j++)for(let i=0;i<N;i++){
 const idx=j*N+i;coast[idx]=i>N/2?255:0;h[idx]=j<3?-32768:240; // 24m DSM except nodata row
}
const pack={type:'TrussLabGeoPack',version:1,gridSize:N,sceneSize:420,
 metadata:{sources:[{dataset:'TEST / SYNTHETIC — NOT OSM'}]},
 coast:{encoding:'uint8/base64',data:Buffer.from(coast).toString('base64')},
 dem:{encoding:'int16le/base64',data:Buffer.from(h.buffer).toString('base64'),scaleMetres:.1,noData:-32768}};
const parsed=parseGeoPack(pack);
assert.equal(parsed.coast.length,N*N);
assert.equal(sampleCoast(parsed,-170,0),0);
assert.equal(sampleCoast(parsed,170,0),1);
assert.equal(sampleDem(parsed,170,0),24);
assert.equal(sampleDem(parsed,-150,-200),null);
assert.throws(()=>parseGeoPack({...pack,gridSize:1500}));
assert.throws(()=>parseGeoPack({...pack,coast:{encoding:'uint8/base64',data:'AAAA'}}));
const noop=()=>{};
const ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:900,clientHeight:580,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const world=new World3D(canvas);world.renderSoftware=noop;
const cfg=BRIDGES.find(v=>v.id==='kerch'),payload={id:'kerch',track:'bridge',soil:cfg.soil,span:cfg.span,model:makeBridge(cfg)};
world.start(payload);
assert.equal(world.geoPack,null);
assert.equal(world.demEnabled,false);
const originalStatic=world.staticBuilds;
const loaded=world.loadGeoPack(pack);
assert.deepEqual([loaded.grid,loaded.osm,loaded.dem],[N,true,true]);
assert.equal(world.coastMode,'osm');assert(world.demEnabled);
assert.equal(world.sampleDEMMetres(140,0),24);
const hActual=world.mapHeight(140,100);
assert(Number.isFinite(hActual));
world.render(payload,true);assert.equal(world.staticBuilds,originalStatic+1);
assert(world.mesh.a.every(Number.isFinite));
assert(world.setDEMEnabled(false));
assert.equal(world.sampleDEMMetres(140,0),null);
assert(world.setCoastMode('gshhg'));
assert(world.setCoastMode('osm'));
world.clearGeoPack();
assert.equal(world.geoPack,null);assert.equal(world.demEnabled,false);assert.equal(world.coastMode,'reference');
assert.equal(world.setCoastMode('osm'),false);
console.log('PASS 9.3: GeoPack decoding, OSM coast switching, 24 m DSM sampling, noData, chunk invalidation, legacy fallback');
