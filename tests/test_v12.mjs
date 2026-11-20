import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:900,clientHeight:600,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;
const data=BRIDGES.find(s=>s.id==='kerch');w.start({id:'kerch',track:'bridge',soil:data.soil,span:data.span,model:makeBridge(data)});w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});
import {rendercoreDescriptor} from '../js/rendercore_materials.js';
for(let m=0;m<27;m++){const d=rendercoreDescriptor(m);assert(d.roughness>0&&d.roughness<=1);assert(d.metallic>=0&&d.metallic<=1);}
assert(rendercoreDescriptor(5).metallic>rendercoreDescriptor(4).metallic);
const previous=w.performanceSnapshot().staticBuilds;assert.deepEqual(w.setRenderCore({ggx:false,roughness:2}),{ggx:false,roughness:1.65});
assert.deepEqual(w.setRenderCore({ggx:true,roughness:1}),{ggx:true,roughness:1});assert.throws(()=>w.setRenderCore({roughness:NaN}));
assert.equal(w.performanceSnapshot().staticBuilds,previous);
console.log('PASS 12.0: material classes, finite params, no static rebuild when switching shading');
