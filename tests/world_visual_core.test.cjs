const assert=require('node:assert/strict');
require('../src/world_visual_core.js');
const V=globalThis.TrussLabWorldVisualCore;
assert(V.syntheticGround(V.CENTER,V.CENTER,'hills')?.land);
assert.equal(V.syntheticGround(V.CENTER+V.HALF+1,V.CENTER),null);
assert.equal(V.syntheticGround(V.CENTER,V.CENTER,'plains').source.includes('synthetic'),true);
for(const type of ['hills','plains','coast']){
 const p=V.syntheticGround(V.CENTER+300,V.CENTER+700,type);assert(Number.isFinite(p.height));
}
const roads=V.roadsFromEditor([{type:'road',id:'r-1',speedKph:40,points:[[0,0],[400,0],[400,400]]},
 {type:'rail',id:'rail-1',points:[[0,40],[500,40]]},
 {type:'building',id:'b',points:[[0,0],[200,0]]}],p=>p);
assert.equal(roads.length,3);
const cars=V.vehiclePlan(roads,[200,200],{density:1.2,maxAgents:80,clock:17});
assert(cars.length>0&&cars.length<=80&&cars.every(x=>Number.isFinite(x.x)&&Number.isFinite(x.z)));
const next=V.vehiclePlan(roads,[200,200],{density:1.2,maxAgents:80,clock:18});
assert.equal(cars.length,next.length);
assert(cars.some((x,i)=>Math.hypot(x.x-next[i].x,x.z-next[i].z)>1));
assert(V.vehiclePlan(roads,[99999,99999],{density:1.2,maxAgents:80,clock:18}).length===0);
assert(V.vehiclePlan(roads,[200,200],{density:0,maxAgents:80,clock:18}).length===0);

const N=new V.MeshBatch();N.car(0,0,0,1,0);
const normals=Array.from({length:5},(_,i)=>N.data.slice(i*42+3,i*42+6));
for(const [face,expected] of [[0,[0,1,0]],[1,[0,0,1]],[2,[0,0,-1]],[3,[-1,0,0]],[4,[1,0,0]]]){
 assert(normals[face].every((v,i)=>Math.abs(v-expected[i])<1e-7),`wrong car normal for face ${face}`);
}
let many=[];for(let i=0;i<1000;i++)many.push({type:'road',id:'r'+i,points:[[i*14,0],[i*14,140]]});
let crowded=V.vehiclePlan(V.roadsFromEditor(many,p=>p),[100,0],{density:3,maxAgents:28,clock:34});assert(crowded.length<=28);
const M=new V.MeshBatch(100,200);M.car(100,20,200,1,0);const n=M.buildingWindows(100,200,20,24,16,8,'windows',25);assert(n===25);
const mesh=M.finalize();assert(mesh.array.length===mesh.count*7&&mesh.count%3===0);
for(const val of mesh.array)assert(Number.isFinite(val));
// All face normals must have unit length, including glass and windows.
for(let i=0;i<mesh.array.length;i+=7){let d=Math.hypot(mesh.array[i+3],mesh.array[i+4],mesh.array[i+5]);assert(Math.abs(d-1)<.00001);}
console.log('PASS WorldVisual: deterministic sandbox, 3D traffic road alignment/caps, 3D building details, finite normals,',mesh.triangles,'triangles');
