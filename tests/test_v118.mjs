import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:900,clientHeight:600,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;
const data=BRIDGES.find(s=>s.id==='kerch');w.start({id:'kerch',track:'bridge',soil:data.soil,span:data.span,model:makeBridge(data)});w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});
for(const preset of ['crimea-abutment','taman-abutment']){
 w.setPresetCamera(preset);assert(w.camPos.every(Number.isFinite));assert(Number.isFinite(w.pitch)&&Number.isFinite(w.yaw));
 const f=w.cameraBasis().forward;assert(Math.hypot(...f)>.99);
}
const q=w.performanceSnapshot();assert.equal(q.renderer,'CPU 2.5D');assert(q.meshMiB>=0&&q.staticTriangles>=0&&q.trafficUpdates>=0);assert(Number.isFinite(q.terrainCache));
console.log('PASS 11.8: shoreline camera presets and render metrics');
