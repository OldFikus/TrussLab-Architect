const assert=require('node:assert/strict');
require('../src/worldeditor_core.js');require('../src/infrastructure_core.js');
const Editor=globalThis.TrussLabWorldEditorCore.WorldEditorCore,Sim=globalThis.TrussLabInfrastructureSim;
const e=new Editor();
// Three intersecting road axes, two tracks with a controlled crossover.
e.addPath('road',[[-1100,0],[1100,0]],{speedKph:80});
e.addPath('road',[[0,-800],[0,800]],{speedKph:55});
e.addPath('road',[[-700,-700],[-350,-350],[0,0],[350,350],[700,700]],{speedKph:35});
e.addPath('rail',[[-1000,300],[-300,310],[0,300],[300,310],[1000,300]],{tracks:2});
e.addPath('switch',[[0,300],[15,310]]);
const rawBefore=JSON.stringify(e.export());
const s=new Sim(e,{agentCap:30,seed:7});
assert.equal(s.report().road.components,1);assert.equal(s.report().rail.components,1);
assert(s.route('road',[-1100,0],[0,800]).lengthM>=1500);
assert(s.rail.edges.some(x=>x.switch));
const from=s.rail.nodes.find(n=>n.track===0&&n.x<0).id,to=s.rail.nodes.findLast(n=>n.track===0&&n.x>0).id;
s.scheduleTrain({from,to,departSeconds:0,repeatSeconds:40,speedKph:95});
s.scheduleTrain({from,to,departSeconds:0,repeatSeconds:70,speedKph:95});
s.agentCap=12;s.trafficFlowCarsPerMinute=60;s.autoTraffic=true;
const lane=s.addShippingLane([[-200,-500],[0,0],[200,500]],{clearanceM:25});
s.launchShip({laneId:lane.id,airDraftM:30});
for(let k=0;k<180;k++){
 s.step(2);assert(s.carAgents.length<=12,'agent overflow');
 const used=new Set();for(const t of s.trains){const seg=t.steps[t.at];if(!seg)continue;assert(!used.has(seg.id),`rail block collision at step ${k}`);used.add(seg.id)}
}
assert(s.stats.trainDepartures>=1);assert(s.stats.trainArrivals>=1);assert(s.stats.shipBlocked>=1);
assert.equal(JSON.stringify(e.export()),rawBefore,'Editor/DEM was mutated by transport');
// Engineering hand checks for simply supported beam with uniform load.
const L=100,q=30000,EI=9e11;
const B=s.calculateBridge({spanM:L,EI_Nm2:EI,uniformLoadNPerM:q,pointLoads:[]});
assert(Math.abs(B.supports.leftN-q*L/2)<.001);assert(Math.abs(B.supports.rightN-q*L/2)<.001);
assert(Math.abs(B.maxMomentNm-q*L*L/8)<.1,`moment ${B.maxMomentNm}`);
assert(Math.abs(B.maxDeflectionM-5*q*L**4/(384*EI))<1e-8,`deflection ${B.maxDeflectionM}`);
const old=s.captureScenario('Прочный пролёт');s.bridge.EI_Nm2=1e10;
const foot=s.setFoundation(null,{soil:'peat',kind:'shallow',widthM:2,lengthM:2,loadKN:950});
const alt=s.captureScenario('Слабое основание');const comparison=s.compareScenarios(old,alt);
assert(comparison.delta.maxDeflectionM>0);assert.equal(comparison.baselineStability.engineeringVerified,false);
assert.equal(comparison.alternativeStability.footingsWithinDemoLimit,false);
// Repeatability and project roundtrip with weather and cap.
const json=s.export(),t=new Sim(e);t.import(json);
assert.equal(t.clock,s.clock);assert.deepEqual(t.report().weather,s.report().weather);
assert.equal(t.report().rail.edges,s.report().rail.edges);assert.equal(t.report().foundationCount,s.report().foundationCount);
assert.deepEqual(t.report().stability,s.report().stability);
console.log('PASS InfrastructureSim stress / invariants',JSON.stringify({carCap:12,trainDepartures:s.stats.trainDepartures,trainArrivals:s.stats.trainArrivals,shipBlocked:s.stats.shipBlocked,bendingNm:B.maxMomentNm,deflectionM:B.maxDeflectionM,scenarios:s.scenarios.length}));
