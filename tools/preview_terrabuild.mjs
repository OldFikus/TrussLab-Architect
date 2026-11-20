import fs from 'node:fs';
import {World3D} from '../js/world3d.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
import {BRIDGES,makeBridge} from '../js/data.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1500};
const canvas={clientWidth:900,clientHeight:500,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;const sc=BRIDGES.find(s=>s.id==='kerch');w.start({id:'kerch',track:'bridge',soil:sc.soil,span:sc.span,model:makeBridge(sc)});w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});w.setCoastMode('osm');
for(const side of [-1,1])for(let row=0;row<13;row++)for(let col=0;col<7;col++){
 const x=side*(142+col*7.8),z=-105+row*16.7+(col%2)*3.5;
 const type=(row*3+col*7)%13===0?'apartment':(row+col)%7===0?'warehouse':(row+2*col)%6===0?'tree':'house';
 w.settlement.add(w,{type,x,z,floors:type==='apartment'?4+row%3:2,yaw:(col%4)*90});
}
const b=w.kerchBounds();const axes={road:[],rail:[]};for(let k=0;k<=180;k++){const x=b.x0+(b.x1-b.x0)*k/180;axes.road.push([x,w.trackCenter(x,b.roadSide)]);axes.rail.push([x,w.trackCenter(x,b.railSide)]);}
const out={count:w.settlement.items.length,items:w.settlement.toJSON(),axes,worldSize:w.worldSize};
fs.writeFileSync(new URL('../assets/terrabuild_preview_data.json',import.meta.url),JSON.stringify(out));
console.log('Preview demo generated:',out.count,'objects');
