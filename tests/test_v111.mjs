import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
import {engineerProfile,sampleEngineeredProfile,profileMetrics} from '../js/road_grade.js';
const noop=()=>{},ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:1010,clientHeight:680,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const world=new World3D(canvas);world.renderSoftware=noop;
const s=BRIDGES.find(b=>b.id==='kerch'),state={id:'kerch',track:'bridge',soil:s.soil,span:s.span,model:makeBridge(s)};
world.start(state);world.loadGeoPack(BUILTIN_GEOPACK);world.setRouteExtents({x0:-160.5,x1:156});
const b=world.kerchBounds(),limits={road:.185,rail:.097};
for(const [name,side] of [['road',b.roadSide],['rail',b.railSide]]){
 for(const [x,sgn] of [[b.x0,-1],[b.x1,1]]){
  const profile=world.getLandApproachProfile(side,x+sgn),metrics=profileMetrics(profile);
  assert(metrics.peakGrade<=limits[name]+1e-7);
  assert(metrics.peakGradeChange<=profile.maxCurvature+1e-7);
  assert(Math.abs(world.landApproachElevation(x,side)-world.kerchSample(x,side)[1])<1e-6);
  assert(Math.abs(world.landApproachElevation(x+sgn*.05,side)-world.landApproachElevation(x,side))<.003);
  for(let i=1;i<=60;i++){
   const xx=x+(profile.endX-x)*i/60,zz=world.trackCenter(xx,side);
   if(world.mapHeightBase(xx,zz)>-1.43)assert(world.landApproachElevation(xx,side)-world.mapHeight(xx,zz)>-.05);
  }
  for(let i=1;i<=120;i++){
   const x1=profile.startX+(profile.endX-profile.startX)*(i-.5)/120,x2=profile.startX+(profile.endX-profile.startX)*(i+.5)/120;
   assert(Math.abs((sampleEngineeredProfile(profile,x2)-sampleEngineeredProfile(profile,x1))/(x2-x1))<=limits[name]+.008);
  }
 }
}
const test=engineerProfile({startX:0,endX:90,initialHeight:4,road:true,terrainAt:x=>x>31&&x<35?18:(x>70?11:2),landAt:()=>true});
assert(profileMetrics(test).peakGrade<=.185+1e-7);
world.render(state,true);assert(world.mesh.a.length>100000&&world.mesh.a.every(Number.isFinite));
const builds=world.staticBuilds;world.tick(1100);world.tick(1400);assert.equal(world.staticBuilds,builds);
console.log('PASS 11.1: smooth four approaches, continuity, maximum grade/curvature, DEM unchanged, traffic isolation');
