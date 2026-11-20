import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
const noop=()=>{};
const ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:1000,clientHeight:680,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const world=new World3D(canvas);world.renderSoftware=noop;
const scenario=BRIDGES.find(x=>x.id==='kerch');
const state={id:'kerch',track:'bridge',soil:scenario.soil,span:scenario.span,model:makeBridge(scenario)};
world.start(state);
const N=192,size=420,coast=new Uint8Array(N*N),dem=new Int16Array(N*N).fill(144);
for(let j=0;j<N;j++)for(let i=0;i<N;i++){
 const x=((i+.5)/N-.5)*size,z=((j+.5)/N-.5)*size;
 const shoreLeft=-143+2*Math.sin(z*.02),shoreRight=150+2*Math.sin(z*.017);
 // Land on both external mainland banks, an island in the central strait.
 const land=x<shoreLeft||x>shoreRight||(Math.abs(x-10)<4&&z>20&&z<115);
 coast[j*N+i]=land?255:0;
}
const pack={type:'TrussLabGeoPack',version:1,gridSize:N,sceneSize:size,
 coast:{encoding:'uint8/base64',data:Buffer.from(coast).toString('base64')},
 dem:{encoding:'int16le/base64',data:Buffer.from(dem.buffer).toString('base64'),scaleMetres:.1,noData:-32768}};
world.loadGeoPack(pack);
const before=world.routeCoastDiagnostics({detail:true});
for(const t of ['road','rail'])assert.equal(before.tracks[t].landSamples,0);
const fit=world.proposeCoastalExtensions();
assert.equal(fit.ok,true,fit.reason);
assert(fit.left.extensionKm>1&&fit.right.extensionKm>1);
assert(fit.x0 < -143 && fit.x1 > 150);
assert.deepEqual(world.routeExtents,{x0:-118,x1:118},'preview cannot change model');
assert(world.applyCoastalExtensions(fit));
const after=world.routeCoastDiagnostics({detail:true});
for(const t of ['road','rail']){
 const stats=after.tracks[t];
 assert.equal(stats.startLand,true);
 assert.equal(stats.endLand,true);
 assert(stats.shoreCrossings>=2);
 assert(stats.landSamples>0);
}
assert(world.routeLengthKm()>20);
assert.equal(world.sampleDEMMetres(0,0),14.4,'DEM layer unchanged');
assert.equal(world.geoPackSource,pack);
const exported=world.exportRouteGeoJSON();
assert.equal(exported.features[0].geometry.coordinates.length,237);
const exportedLength=exported.features[0].geometry.coordinates[236][0]-exported.features[0].geometry.coordinates[0][0];
assert(exportedLength>.15,'GeoJSON exports the new approach extents');
assert.equal(world.proposeCoastalExtensions().ok,false,'do not extend an already aligned route');
const oldExtents={...world.routeExtents};world.resetRouteExtents();
assert.deepEqual(world.routeExtents,{x0:-118,x1:118});
assert(world.setRouteExtents(oldExtents));
assert.equal(world.routeExtents.x0,oldExtents.x0);
assert.equal(world.setRouteExtents({x0:0,x1:999}),false);
world.render(state,true);
assert(world.mesh.a.length>100000 && world.mesh.a.every(Number.isFinite));
let staticBuilds=world.staticBuilds;world.tick(1000);world.tick(1300);
assert.equal(world.staticBuilds,staticBuilds,'traffic stays on separate dynamic scene');
console.log('PASS 9.4.2: both shore approaches extended, DEM preserved, both line endpoints on land, 2D/3D/export match, traffic cached');
