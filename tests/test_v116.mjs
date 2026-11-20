import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:900,clientHeight:600,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;
const data=BRIDGES.find(s=>s.id==='kerch');w.start({id:'kerch',track:'bridge',soil:data.soil,span:data.span,model:makeBridge(data)});w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});
const before=w.sampleDEMMetres(185,w.trackCenter(185,w.kerchBounds().roadSide));
for(const side of [w.kerchBounds().roadSide,w.kerchBounds().railSide])for(const x of [-196,-182,184,199]){
 const r=w.earthworkCrossSection(x,side);assert.equal(r.samples.length>30,true);assert.equal(r.x,x);assert(r.samples.every(p=>Number.isFinite(p.original)&&Number.isFinite(p.modified)));
 assert(Number.isFinite(r.minClearance)&&r.minClearance>=.25,JSON.stringify({x,side,clearance:r.minClearance}));assert(r.peakCut>=0&&r.peakFill>=0);
 const central=r.samples.reduce((best,p)=>Math.abs(p.offset)<Math.abs(best.offset)?p:best,r.samples[0]);assert(Math.abs(central.offset)<.5);
}
assert.equal(w.sampleDEMMetres(185,w.trackCenter(185,w.kerchBounds().roadSide)),before);
console.log('PASS 11.6: cross sections road/rail, no buried deck, no DEM change');
