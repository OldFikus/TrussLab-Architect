import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:1000,clientHeight:680,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const w=new World3D(canvas);w.renderSoftware=noop;const s=BRIDGES.find(v=>v.id==='kerch'),state={id:'kerch',track:'bridge',soil:s.soil,span:s.span,model:makeBridge(s)};
w.start(state);w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});
const b=w.kerchBounds();let nCut=0,nFill=0,daylight=0,minCover=Infinity,maxRunout=0;
for(const side of [b.roadSide,b.railSide]){
 const half=side===b.roadSide?2.28:1.78;
 for(const x of [-205,-198,-187,-174,-163,164,179,190,202]){
  const center=w.trackCenter(x,side),orig=w.mapHeightBase(x,center);
  const shape=w.earthworkAt(x,center,side,orig),deck=w.landApproachElevation(x,side);
  assert(shape.outer>shape.core && shape.outer<22);
  maxRunout=Math.max(maxRunout,shape.outer-shape.core);
  for(const dz of [-half,0,half]){
   let z=center+dz,raw=w.mapHeightBase(x,z),h=w.mapHeight(x,z);
   if(h>-1.43){minCover=Math.min(minCover,deck-h);assert(deck-h>.31,`buried ${side}: ${x}, ${dz}`)}
  }
  if(shape.kind==='cut'&&shape.depth>.2)nCut++;
  if(shape.kind==='fill'&&shape.depth>.2)nFill++;
  if(['cut','fill'].includes(shape.kind)&&shape.depth>.2){
   for(let delta=0;delta<1;delta+=.125){
    const u=shape.core+delta*(shape.outer-shape.core),q=w.earthworkAt(x,center+u,side,orig);
    assert(q.weight>=0&&q.weight<=1);
    if(delta>.25&&delta<.75)daylight++;
   }
   const beyond=w.earthworkAt(x,center+shape.outer+.02,side,orig);
   assert.equal(beyond.weight,0);
  }
 }
}
// Painted shoulder geometry adds no auxiliary dynamic traffic updates.
const m={a:[],quad(a,b,c,d,mat){this.a.push(a,b,c,d,mat)},tube(a,b,r,mat){this.a.push(a,b,r,mat)}};
w.addApproachShoulders(m,[-185,4,-4],[-184,4,-4],2.28,false);
assert(m.a.length>=8,'No road verges emitted');
const sourceBefore=w.sampleDEMMetres(201,w.trackCenter(201,b.roadSide));
w.render(state,true);const builds=w.staticBuilds;w.tick(1750);w.tick(1820);assert.equal(w.staticBuilds,builds);
assert.equal(w.sampleDEMMetres(201,w.trackCenter(201,b.roadSide)),sourceBefore);
assert(nCut>0&&nFill>0&&daylight>0,`No cuts/fills found ${nCut} ${nFill}`);
console.log('PASS 11.3 variable-depth cut/fill slopes, verges, unmodified DSM and isolated traffic',JSON.stringify({nCut,nFill,minCover,maxRunout,daylight}));
