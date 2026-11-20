import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:1010,clientHeight:680,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const world=new World3D(canvas);world.renderSoftware=noop;
const scenario=BRIDGES.find(b=>b.id==='kerch'),state={id:'kerch',track:'bridge',soil:scenario.soil,span:scenario.span,model:makeBridge(scenario)};
world.start(state);world.loadGeoPack(BUILTIN_GEOPACK);world.setRouteExtents({x0:-160.5,x1:156});
const b=world.kerchBounds(),samples={},clearanceMin={};
for(const [name,side,half] of [['road',b.roadSide,2.28],['rail',b.railSide,1.78]]){
 let minimum=Infinity,worst=null,cuts=0,fills=0,walk=0;
 for(let x=-206.5;x<=206.5;x+=.84){
  const bridge=x>=b.x0&&x<=b.x1;
  const deck=bridge?world.kerchSample(x,side)[1]:world.landApproachElevation(x,side);
  for(const f of [-1,-.5,0,.5,1]){
   const z=world.trackCenter(x,side)+f*half;
   const source=world.mapHeightBase(x,z),graded=world.mapHeight(x,z),clearance=deck-graded;
   if(source>-1.43||graded>-1.43){
    walk++;if(clearance<minimum){minimum=clearance;worst={x,z,f,source,graded,deck};}
    if(graded<source-.2)cuts++;
    if(graded>source+.2)fills++;
   }
  }
 }
 assert(minimum>.30,`${name} road surface blocked by terrain: ${JSON.stringify(worst)}`);
 // Sample a tile's triangles with a barycentric projection onto road centreline.
 // The adaptive tile resolution should not bridge over the cut roadbed.
 for(let tileX of [-6,-5,-4,3,4,5]){
  const centerX=tileX*35+17.5,z=world.trackCenter(centerX,side);
  const tileZ=Math.floor(z/35);
  const mesh=world.terrainTileMesh(tileX,tileZ,6).a;
  for(let i=0;i<mesh.length;i+=21){
   const vs=[0,7,14].map(d=>[mesh[i+d],mesh[i+d+1],mesh[i+d+2]]);
   const mid=vs.reduce((a,v)=>[a[0]+v[0]/3,a[1]+v[1]/3,a[2]+v[2]/3],[0,0,0]);
   const x=mid[0];if(Math.abs(x)>207)continue;
   const projectedZ=world.trackCenter(x,side);
   if(Math.abs(mid[2]-projectedZ)>half+.7)continue;
   const deck=x>=b.x0&&x<=b.x1?world.kerchSample(x,side)[1]:world.landApproachElevation(x,side);
   if(mid[1]>-1.42)assert(deck-mid[1]>.10,`LOD tile terrain at (${x.toFixed(1)},${mid[2].toFixed(1)}) overlays ${name} deck`);
  }
 }
 samples[name]={walk,cuts,fills};clearanceMin[name]={clearance:minimum,worst};
}
const sourceBefore=world.sampleDEMMetres(200,world.trackCenter(200,b.roadSide));
world.render(state,true);const count=world.staticBuilds;world.tick(1800);world.tick(1900);assert.equal(world.staticBuilds,count);
assert.equal(world.sampleDEMMetres(200,world.trackCenter(200,b.roadSide)),sourceBefore);
console.log('PASS 11.2 graded road/rail approach clearance, LOD6 triangles, independent source DEM, cached static traffic',JSON.stringify({samples,clearanceMin}));
