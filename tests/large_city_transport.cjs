const assert=require('node:assert/strict');
require('../src/worldeditor_core');
require('../src/infrastructure_core');
const Editor=globalThis.TrussLabWorldEditorCore.WorldEditorCore;
const editor=new Editor(),width=32,step=40,end=(width-1)*step;
for(let i=0;i<width;i++){
  editor.addPath('road',[[0,i*step],[end,i*step]]);
  editor.addPath('road',[[i*step,0],[i*step,end]]);
}
for(let i=0;i<5500;i++)editor.addModel(i%4?'apartment':'office',(i%100)*12,Math.floor(i/100)*22,{floors:3});
const sim=new globalThis.TrussLabInfrastructureSim(editor,{agentCap:32,seed:17});
sim.rebuild();
assert.equal(sim.road.nodes.length,width*width);
assert.equal(sim.road.edges.length,2*width*(width-1));
for(let i=0;i<32;i++){
  const route=sim.route('road',[0,i*step],[end,(width-i-1)*step]);
  assert.ok(Math.abs(route.lengthM-end-Math.abs(width-1-2*i)*step)<.01);
  sim.spawnCar({from:route.nodes[0],to:route.nodes.at(-1)});
}
for(let t=0;t<120;t++){sim.step(1);assert.ok(sim.carAgents.length<=32);}
const copy=new Editor();copy.import(JSON.parse(JSON.stringify(editor.export())));
const restored=new globalThis.TrussLabInfrastructureSim(copy,{agentCap:32,seed:17});
assert.equal(restored.report().road.lengthM,sim.report().road.lengthM);
console.log('5500 buildings, 1024 junctions, 1984 road edges; transport roundtrip passed');
