const assert=require('node:assert/strict');
require('../src/world_visual_core.js');require('../src/nature_core.js');
const {NatureWorld,BUDGETS,SOILS,BIOMES}=globalThis.TrussLabNatureCore;
const V=globalThis.TrussLabWorldVisualCore;
const N=new NatureWorld(), center=V.CENTER;
const ground=(x,z)=>V.syntheticGround(x,z,'hills');
assert.equal(N.season,'summer');assert.equal(N.light().phase,'day');
for(const v of ['eco','balanced','high'])assert(N.setQuality(v).trees>0);
assert.throws(()=>N.setQuality('ultra'),/бюджет/);
assert.throws(()=>N.setSeason(13));N.setSeason(10);assert.equal(N.season,'autumn');N.setSeason(1);assert.equal(N.season,'winter');
N.setSeason(6);N.setHour(23);assert.equal(N.light().phase,'night');N.advanceHours(4);assert.equal(N.hour,3);
assert.throws(()=>N.advanceHours(-3));
for(let x=center-1200;x<=center+1200;x+=200)for(let z=center-1000;z<=center+1000;z+=200){
 const site=N.soilAt(x,z,ground);assert(SOILS.includes(site.type)&&BIOMES.includes(site.biome));assert.equal(site.confidence,'demo');
}
const weather=N.weatherAt(center,center);const far=N.weatherAt(center+20000,center+20000);
assert(weather.precipitation>far.precipitation);assert(weather.visibilityM<far.visibilityM);
assert(N.transportEffects(center,center).road<1);
N.setSeason(1);assert(N.weatherAt(center,center).snow>0);N.setSeason(6);
const front=N.addFront(center+200,center+300,{precipitation:.55,cloud:.7,radius:1100});assert(front);
assert.throws(()=>N.addFront(0,0,{radius:-1}));
const lake=N.addLake(center+160,center-40,100);assert(N.waterAt(center+160,center-40)?.type==='lake');assert.equal(N.waterAt(center+999,center+999),null);
const river=N.addRiver([[center-200,center+130],[center+200,center+130]],{width:25});assert(N.waterAt(center,center+135)?.type==='river');
N.setWaterLevel(lake,18);assert.equal(N.waterAt(center+160,center-40).level,18);
N.removeWater(lake);assert(!N.waterBodies.some(o=>o.id===lake));const sea=N.addSea(center-400,center-500,350);assert.equal(N.waterAt(center-400,center-500).type,'sea');
const key=N.vegetationNear(center,center,ground,{limit:150,range:900});const key2=N.vegetationNear(center,center,ground,{limit:150,range:900});assert.deepEqual(key,key2);assert(key.length>5&&key.length<=150);
const b=new V.MeshBatch(center-1200,center-1200);const result=N.geometryFor(key,{ground,meshBatch:b,cam:[center,center],budget:BUDGETS[N.quality]});
assert(result.trees>0&&result.trees<=BUDGETS[N.quality].trees);assert(result.bytes<=BUDGETS[N.quality].bytes);assert(result.triangles<=BUDGETS[N.quality].triangles);
let normals=0;for(let k=0;k<b.data.length;k+=7){let norm=Math.hypot(b.data[k+3],b.data[k+4],b.data[k+5]);assert(Number.isFinite(norm)&&Math.abs(norm-1)<.00001);normals++;}assert(normals>100);
const wb=new V.MeshBatch();let waterTris=N.waterGeometry(wb,ground);assert(waterTris>=2);assert(wb.data.length>0);for(let i=0;i<wb.data.length;i+=7){if(wb.data[i+6]===3){assert(wb.data[i+4]>.98,'Water normal must face up');}}
const roundTrip=JSON.parse(JSON.stringify(N.export()));const C=new NatureWorld();C.import(roundTrip);
assert.deepEqual(C.export(),roundTrip);assert.deepEqual(C.weatherAt(center,center),N.weatherAt(center,center));
assert.throws(()=>C.import({...roundTrip,month:42}));assert.deepEqual(C.export(),roundTrip);
C.setQuality('eco');const sparse=C.vegetationNear(center,center,ground,{limit:BUDGETS.eco.trees,range:800});const EB=new V.MeshBatch();const E=C.geometryFor(sparse,{ground,meshBatch:EB,cam:[center,center],budget:BUDGETS.eco});assert(E.bytes<=BUDGETS.eco.bytes&&E.trees<=BUDGETS.eco.trees);
console.log('PASS 16.1–16.9 core: deterministic biomes, weather, snow, seasons, editable waters, vegetation GPU limits, normals, save integrity', {summer:key.length,eco:E.trees,waterTris,vertices:normals});
