import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:900,clientHeight:600,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;
const data=BRIDGES.find(s=>s.id==='kerch');w.start({id:'kerch',track:'bridge',soil:data.soil,span:data.span,model:makeBridge(data)});w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});
const calls=[];let bad=false;
const validate=(...args)=>{if(args.flat(Infinity).some(v=>typeof v==='number'&&!Number.isFinite(v)))bad=true};
const m={box:(...args)=>{validate(...args);calls.push(['box',args])},tube:(...args)=>{validate(...args);calls.push(['tube',args])},prismBetween:(...args)=>{validate(...args);calls.push(['joint',args])}};
assert.equal(w.addBridgeAbutments(m),4);assert(!bad);assert(calls.length>40);assert(calls.filter(v=>v[0]==='joint').length>=8);
assert.equal(w.addBridgeAbutments(m),4); // deterministic and independent of traffic
const d=w.kerchBounds();assert(d.x0<0&&d.x1>0);assert(w.trafficUpdates<4);
console.log('PASS 11.5: four abutments and transition joints, finite mesh, unchanged traffic');
