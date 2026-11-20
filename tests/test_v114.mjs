import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:1000,clientHeight:680,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;
const s=BRIDGES.find(v=>v.id==='kerch'),state={id:'kerch',track:'bridge',soil:s.soil,span:s.span,model:makeBridge(s)};
w.start(state);w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});
const report=w.earthworkReport();
for(const name of ['road','rail']){
 const a=report[name];assert(a.samples>20);for(const p of ['cutLength','fillLength','waterLength','peakCut','peakFill'])assert(Number.isFinite(a[p])&&a[p]>=0);
 assert(a.cutLength>0&&a.fillLength>0&&a.waterLength>=0,`Missing useful earthwork classification: ${name}: ${JSON.stringify(a)}`);
}
const b=w.kerchBounds();for(const side of [b.roadSide,b.railSide]){
 for(let x of [-205,-199,-188,-178,168,184,202]){
  const z=w.trackCenter(x,side),raw=w.mapHeightBase(x,z),p=w.earthworkAt(x,z,side,raw);
  if(raw<=-1.43)assert.equal(p.height,raw,'Sea must not be filled');
 }
}
const before=w.sampleDEMMetres(194,w.trackCenter(194,b.roadSide));w.earthworkReport();assert.equal(w.sampleDEMMetres(194,w.trackCenter(194,b.roadSide)),before);
console.log('PASS 11.4 cut/fill/water report, no sea embankment, original DEM unchanged',JSON.stringify(report));
