import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:900,clientHeight:600,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;
const data=BRIDGES.find(s=>s.id==='kerch');w.start({id:'kerch',track:'bridge',soil:data.soil,span:data.span,model:makeBridge(data)});w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});
const before=w.mapHeightBase(194,w.trackCenter(194,w.kerchBounds().roadSide));const r=w.inspectAllApproaches(4.2);
assert.equal(r.sections.length,4);for(const s of r.sections){assert(s.samples>5&&Number.isFinite(s.maxSlope));if(s.land)assert(s.minClearance>=.25,JSON.stringify(s));}
assert.equal(w.mapHeightBase(194,w.trackCenter(194,w.kerchBounds().roadSide)),before);console.log('PASS 11.7: four quality reports and immutable terrain');
