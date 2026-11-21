const assert=require('node:assert/strict');require('../src/nature_core.js');require('../src/world_visual_core.js');
const {NatureWorld,BUDGETS}=globalThis.TrussLabNatureCore,V=globalThis.TrussLabWorldVisualCore;
const n=new NatureWorld();const t=performance.now();
for(let k=0;k<110;k++){
 const x=V.CENTER+(k%11-5)*205,z=V.CENTER+((k/11)|0-5)*240;
 const trees=n.vegetationNear(x,z,(a,b)=>V.syntheticGround(a,b,'hills'),{limit:BUDGETS.high.trees,range:BUDGETS.high.range});
 const mesh=new V.MeshBatch(x,z);let r=n.geometryFor(trees,{ground:(a,b)=>V.syntheticGround(a,b,'hills'),meshBatch:mesh,cam:[x,z],budget:BUDGETS.high});
 assert(r.bytes<=BUDGETS.high.bytes && r.triangles<=BUDGETS.high.triangles);
}
for(let i=0;i<75;i++)n.addLake(V.CENTER+i*8,V.CENTER+i*9,60);
const water=new V.MeshBatch();n.waterGeometry(water,(x,z)=>V.syntheticGround(x,z,'plains'));
assert(water.data.length<1000000);
const took=performance.now()-t;
console.log('PASS Nature stress: 110 high-density camera positions, 75 water bodies, hard geometry limits,',Math.round(took),'ms');
