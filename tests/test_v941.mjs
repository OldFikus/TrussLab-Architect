import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
const noop=()=>{};
const ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:960,clientHeight:590,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;
const sc=BRIDGES.find(v=>v.id==='kerch');w.start({id:'kerch',track:'bridge',soil:sc.soil,span:sc.span,model:makeBridge(sc)});
const n=64,side=new Uint8Array(n*n),dem=new Int16Array(n*n).fill(150);
for(let j=0;j<n;j++)for(let i=0;i<n;i++)side[j*n+i]=j<22?255:0;
const pack={type:'TrussLabGeoPack',version:1,gridSize:n,sceneSize:420,
 coast:{encoding:'uint8/base64',data:Buffer.from(side).toString('base64')},
 dem:{encoding:'int16le/base64',data:Buffer.from(dem.buffer).toString('base64'),scaleMetres:.1,noData:-32768}};
w.loadGeoPack(pack);
let result=w.routeCoastDiagnostics({detail:true});
assert.equal(result.ok,true);
assert.equal(result.globalLandPercent,34.4);
assert.equal(result.source,'УСЛОВНАЯ ось 9.4');
for(const t of ['road','rail']){
 const item=result.tracks[t];
 assert.equal(item.landPercent,0);
 assert.equal(item.waterSamples,513);
 assert.equal(item.landSamples,0);
 assert.equal(item.outsideSamples,0);
 assert.equal(item.shoreCrossings,0);
 assert.equal(item.startLand,false);
 assert.equal(item.endLand,false);
 assert(item.reason.includes('в воде'));
 assert(item.nearestLandStart?.km>2);
 assert(item.nearestLandEnd?.km>2);
 assert.equal(item.samples.length,33);
}
assert.equal(w.setRouteOffset(0,-80),true);
assert.equal(w.setRouteOffset(12,-80),true);
result=w.routeCoastDiagnostics({detail:true});
assert(result.tracks.road.shoreCrossings>=2);
assert.equal(result.tracks.road.startLand,true);
assert.equal(result.tracks.road.endLand,true);
assert.equal(w.getRouteControls()[0].locked,false);
assert.equal(w.getRouteControls()[12].locked,false);
const saved=[...w.routeOffsets];
w.resetRoute();assert.equal(w.routeOffsets[0],0);
assert(w.setRouteOffsets(saved));assert.equal(w.routeOffsets[0],-80);
assert.equal(w.sampleDEMMetres(0,0),15);
assert.equal(pack.dem.data,Buffer.from(dem.buffer).toString('base64'));
console.log('PASS 9.4.1: 34.4% region land + wholly offshore routes diagnosed, shore distance, editable termini, DEM unmodified');
