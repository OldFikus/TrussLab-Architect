/* InfrastructureSim 14.1–14.9 regression without browser or external data. */
const assert=require('node:assert/strict');
require('../src/worldeditor_core.js');require('../src/infrastructure_core.js');
const e=new globalThis.TrussLabWorldEditorCore.WorldEditorCore(),Sim=globalThis.TrussLabInfrastructureSim;
const roadA=e.addPath('road',[[-450,0],[0,0],[450,0]],{speedKph:65});
e.addPath('road',[[0,-300],[0,0],[0,300]],{speedKph:45});
const railA=e.addPath('rail',[[-600,100],[-300,100],[0,100],[300,100],[600,100]],{tracks:2,speedKph:95});
e.addPath('switch',[[0,100],[10,100]]);
const sim=new Sim(e,{seed:123,agentCap:5});const r=sim.report();
assert(r.road.nodes>0&&r.road.edges>=4&&r.road.components===1,JSON.stringify(r.road)); // 14.1
const rp=sim.route('road',[-450,0],[0,300]);assert(rp&&rp.lengthM>=700&&rp.lengthM<850,JSON.stringify(rp));
assert(r.rail.edges>=9,'double track and switch not represented'); // 14.2
assert(sim.rail.edges.some(x=>x.switch),'switch edge missing');
assert(sim.rail.nodes.some(n=>n.track===0)&&sim.rail.nodes.some(n=>n.track===1));
const signal=sim.addSignal(0,.25);assert(signal.aspect==='green');
for(let i=0;i<10;i++)sim.spawnCar({from:sim.road.nodes[0].id,to:sim.road.nodes.at(-1).id});
assert.equal(sim.carAgents.length,5,'Agent cap 14.3');
const trainFrom=sim.rail.nodes[0].id,trainEnd=sim.rail.nodes.find(n=>n.track===0&&n.x>500).id;
const schedule=sim.scheduleTrain({from:trainFrom,to:trainEnd,departSeconds:0,speedKph:90,label:'Электропоезд'}); // 14.4
sim.step(1);assert.equal(sim.stats.trainDepartures,1);assert(sim.trains.length===1);
assert(sim.signals[0].aspect==='red'||sim.signals[0].aspect==='green');
const lane=sim.addShippingLane([[-200,-200],[0,-100],[250,100]],{clearanceM:30}); //14.5
const vessel=sim.launchShip({laneId:lane.id,airDraftM:21});assert.equal(sim.clearance(vessel,lane).passable,true);
const blocked=sim.launchShip({laneId:lane.id,airDraftM:35});assert.equal(blocked.blocked,true);assert.equal(sim.clearance(vessel,lane).depthVerified,false);
const P=100000,L=200,EI=3e12;
const b=sim.calculateBridge({spanM:L,EI_Nm2:EI,uniformLoadNPerM:0,pointLoads:[{forceN:P,x:L/2}]}); // 14.6
assert(Math.abs(b.supports.leftN-P/2)<1e-7);assert(Math.abs(b.supports.rightN-P/2)<1e-7);
assert(Math.abs(b.maxMomentNm-P*L/4)<1e-4,`moment ${b.maxMomentNm}`);
assert(Math.abs(b.maxDeflectionM-P*L**3/(48*EI))<1e-8,`deflection ${b.maxDeflectionM}`);
assert.equal(b.verifiedDesign,false);
const sand=sim.setFoundation(null,{kind:'raft',soil:'sand',widthM:10,lengthM:10,loadKN:500});
const peat=sim.setFoundation(null,{kind:'shallow',soil:'peat',widthM:2,lengthM:2,loadKN:600}); //14.7
assert(sim.foundationReport(sand).pass);assert(!sim.foundationReport(peat).pass);
const dry=sim.speedFactor('road');sim.setWeather({rain:.9,fog:.8,night:true,windMps:20,temperatureC:-3}); //14.8
assert(sim.speedFactor('road')<dry);assert(sim.speedFactor('ship')<dry);
const snap0=sim.captureScenario('штиль');sim.step(2);const snap1=sim.captureScenario('дождь');const compare=sim.compareScenarios(snap0,snap1);assert(compare.delta.trainArrivals!==undefined);//14.9
const save=sim.export();const sim2=new Sim(e);sim2.import(save);assert.equal(sim2.report().cars,sim.report().cars);assert.equal(sim2.report().road.edges,r.road.edges);
assert.equal(e.sourceDemImmutable,true,'DEM was touched');
console.log('PASS InfrastructureSim 14.1–14.9:',JSON.stringify({road:r.road,rail:r.rail,routeMetres:rp.lengthM,trains:sim.stats.trainDepartures,cars:sim.carAgents.length,shipCheck:sim.clearance(vessel,lane),bridgeDeflection:b.maxDeflectionM,peatUtilization:sim.foundationReport(peat).utilization}));
