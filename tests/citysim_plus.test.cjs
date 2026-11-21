const assert=require('node:assert/strict');
require('../src/citysim_plus.js');
const City=global.TrussLabCitySystems;
let counter=0;
class Editor{
 constructor(){this.objects=[];this.catalog=[{id:'house'}];this.revision=0;}
 addModel(kind,x,z,extra={}){const o={id:'o'+(++counter),type:'building',catalogId:kind,x,z,width:24,length:16,floors:1,...extra};this.objects.push(o);this.revision++;return o}
 addPath(type,points,extra={}){const o={id:'o'+(++counter),type,points,width:8,...extra};this.objects.push(o);this.revision++;return o}
}
let e=new Editor(),legacy={day:0,population:0,treasury:250000,step(d){this.day+=d;return this.day;}};
let sim=new City(e,legacy);
assert(e.catalog.some(c=>c.id==='fire-station'));
for(let i=0;i<20;i++)e.addModel('apartment',i*50,20,{floors:5});
for(let i=0;i<5;i++)e.addModel('office',i*80,80,{floors:5});
e.addModel('factory',300,110);e.addModel('shop',300,140);e.addModel('hospital',180,100);e.addModel('fire-station',80,100);e.addModel('police-station',90,110);e.addModel('school',110,100);
e.addPath('road',[[-100,0],[0,0],[500,0],[1000,0]],{width:10});
let a=sim.report();assert(a.housingCapacity>1000&&a.jobs>300);assert(a.factories===1&&a.retail===1);assert(a.power.coverage===0&&a.water.coverage===0);assert(a.service.health>0);
const before=a.projectObjects;
const sub=e.addModel('substation',200,-30),pump=e.addModel('water-pump',230,-30),clean=e.addModel('sewage-plant',260,-30);
e.addPath('utility',[[0,-20],[1000,-20]],{network:'power'});e.addPath('utility',[[0,-15],[1000,-15]],{network:'water'});e.addPath('utility',[[0,-10],[1000,-10]],{network:'sewage'});
let b=sim.report();assert(b.power.coverage>0&&b.water.coverage>0&&b.sewage.coverage>0,b);
// report is idempotent: source capacity/demand cannot accumulate on each call.
for(let i=0;i<15;i++){let r=sim.report();assert.equal(r.power.demand,b.power.demand);assert.equal(r.power.coverage,b.power.coverage)}
const stop1=e.addModel('bus-stop',50,10),stop2=e.addModel('bus-stop',520,10);
assert.throws(()=>sim.addTransitLine([stop1.id,'does-not-exist']),/Остановка/);
const line=sim.addTransitLine([stop1.id,stop2.id]);assert(line.id);
// Inject deterministic infrastructure route for transit (real browser uses actual InfrastructureSim).
sim.infra={rebuild(){},route(kind,a,b){return {lengthM:Math.hypot(a[0]-b[0],a[1]-b[1]),travelSeconds:72}}};
let transit=sim.report();assert.equal(transit.transit.lines,1);assert.equal(transit.transit.active,1);assert(transit.transit.passengersPerDay>0);
assert.throws(()=>sim.setTax('industrial',.4),/Ставка/);sim.setTax('industrial',.13);
const fire=sim.addIncident('fire',{x:100,z:100,severity:.6,durationDays:7});const works=sim.addIncident('roadworks',{x:200,z:0,severity:1,durationDays:12});assert(fire&&works);
const alpha=sim.recordScenario('Без развития');assert.equal(alpha.report.incidents,2);
for(let d=0;d<30;d++){legacy.day++;sim.advanceAfterBase(1)}
assert(legacy.population>0,legacy);assert(sim.daily.length>=4);assert.equal(sim.incidents.length,0);assert(legacy.treasury!==250000);
let beta=sim.recordScenario('Через 30 дней');let delta=sim.compareScenarios(alpha.id,beta.id);assert.equal(delta.delta.population.after,legacy.population);assert(beta.timestampDay===30);
const saved=JSON.parse(JSON.stringify(sim.export()));const fresh=new City(e,legacy,{infra:sim.infra});fresh.import(saved);
assert.deepEqual(fresh.export().lines,saved.lines);assert.equal(fresh.scenarios.length,2);assert.equal(fresh.daily.length,sim.daily.length);
assert.throws(()=>fresh.import({...saved,incidents:[{kind:'fire',x:0,z:0,severity:.4,remainingDays:Infinity}]}));
// Allow city scale at >5,000 buildings with limited memory.
const large=new Editor();for(let i=0;i<5500;i++)large.addModel(i%5===0?'office':'apartment',(i%120)*40,Math.floor(i/120)*40,{floors:3});
large.addPath('road',[[-100,-20],[4900,-20]]);
const big=new City(large,{day:0,population:0,treasury:250000});let start=performance.now();let bigReport=big.report();let elapsed=performance.now()-start;
assert(bigReport.projectObjects===5501&&bigReport.jobs>2000&&bigReport.housingCapacity>10000);
assert(elapsed<10000,`City summary too slow: ${elapsed.toFixed(0)}ms`);
console.log('PASS CitySim 15.2–15.9: economy, commerce, industry, utilities, services, transit, weather-independent incidents, scenarios, serialization; 5,500 buildings',Math.round(elapsed)+' ms');
