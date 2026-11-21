
/* TrussLab Architect 15.2–15.9 / CitySim Systems.
 * The city is simulated from objects in the SAME WGS84/ENU WorldEditor that
 * supplies the regional 3D meshes. Aggregated agents (not one JS object per
 * inhabitant) keep mobile and offline browsers responsive.
 * Educational city management, not public utilities or emergency planning.
 */
(function(root){'use strict';
const EPS=1e-9,clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),finite=Number.isFinite;
const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
const clone=x=>JSON.parse(JSON.stringify(x));
const coord=o=>[Number(o.x)||0,Number(o.z)||0];
const d2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const nearLine=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],u=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz+EPS),0,1);return d2(p,[a[0]+u*dx,a[1]+u*dz]);};
const DATA=Object.freeze({
 house:{homes:3,workers:0,power:2.4,water:.4},apartment:{homes:3,workers:0,power:1.6,water:.27,multiplier:'units'},
 office:{workers:14,power:14,water:1.2},shop:{workers:8,power:13,water:2.8,goods:23},
 warehouse:{workers:10,power:45,water:4.8,goods:28,pollution:3},factory:{workers:48,power:110,water:22,goods:105,pollution:17},
 'big-store':{workers:24,power:45,water:7,goods:64},school:{workers:18,power:50,water:8,school:160},
 clinic:{workers:24,power:55,water:14,health:140},hospital:{workers:100,power:220,water:60,health:520},
 'fire-station':{workers:26,power:45,water:7,fire:1},'police-station':{workers:28,power:42,water:7,police:1},
 'power-plant':{workers:36,power:20,water:10,generatePower:6500,pollution:22},'substation':{workers:4,power:3,water:0,generatePower:1100},
 'water-pump':{workers:9,power:80,water:5,generateWater:5200},'sewage-plant':{workers:16,power:60,water:12,generateSewage:4200,pollution:5},
 'bus-stop':{workers:0,power:0,water:0},'tram-stop':{workers:0,power:0,water:0},'park':{workers:2,power:1,water:6,park:1}
});
const MODELS=Object.freeze([
 {id:'factory',name:'Производство',category:'building',author:'TrussLab procedural',license:'Original / CC0',width:45,length:33,floors:1},
 {id:'big-store',name:'Торговый центр',category:'building',author:'TrussLab procedural',license:'Original / CC0',width:36,length:27,floors:2},
 {id:'hospital',name:'Больница',category:'building',author:'TrussLab procedural',license:'Original / CC0',width:42,length:28,floors:3},
 {id:'fire-station',name:'Пожарная часть',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:25,length:18,floors:1},
 {id:'police-station',name:'Полиция',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:23,length:18,floors:2},
 {id:'power-plant',name:'Электростанция',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:52,length:40,floors:2},
 {id:'water-pump',name:'Водозабор',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:22,length:18,floors:1},
 {id:'sewage-plant',name:'Очистные сооружения',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:50,length:36,floors:1},
 {id:'bus-stop',name:'Автобусная остановка',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:7,length:4,floors:1},
 {id:'tram-stop',name:'Трамвайная остановка',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:8,length:4,floors:1},
 {id:'park',name:'Парк',category:'infrastructure',author:'TrussLab procedural',license:'Original / CC0',width:26,length:26,floors:1}
]);
function registerCatalog(editor){if(!editor||!Array.isArray(editor.catalog))return;const names=new Set(editor.catalog.map(x=>x.id));for(const item of MODELS)if(!names.has(item.id)){editor.catalog.push(clone(item));names.add(item.id);}if(typeof editor.validatePlacement==='function'&&!editor.__cityplusPlacement){
 const old=editor.validatePlacement.bind(editor);
 editor.validatePlacement=(id,x,z)=>{if(!MODELS.some(m=>m.id===id))return old(id,x,z);
 const parcels=editor.objects.filter(o=>o.type==='parcel'&&o.points?.length>=3);if(!parcels.length)return {ok:true,reason:'Учебное строительство вне зонирования'};
 const inside=(p,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const zoned=parcels.filter(o=>inside([x,z],o.points));if(!zoned.length)return {ok:false,reason:'Вне участка'};
 const allowed={residential:new Set(['hospital','fire-station','police-station','bus-stop','tram-stop','park']),commercial:new Set(['big-store','hospital','fire-station','police-station','bus-stop','tram-stop','park']),industrial:new Set(['factory','power-plant','water-pump','sewage-plant','fire-station','bus-stop','tram-stop']),park:new Set(['bus-stop','tram-stop','park'])};
 return {ok:zoned.some(p=>allowed[p.zoning]?.has(id)),reason:'Проверь назначение участка'};};editor.__cityplusPlacement=true;
 }}
/* Segment spatial index. Each segment is expanded by max walking radius.
 * A long segment is capped to avoid accidental quadratic memory allocation. */
class SegmentIndex{
 constructor(paths,filter,cell=240,range=150){this.cell=cell;this.map=new Map();this.all=[];
  for(const o of paths){if(filter&&!filter(o))continue;const p=o.points;if(!Array.isArray(p))continue;for(let j=1;j<p.length;j++){
   const a=p[j-1],b=p[j];if(![...a,...b].every(finite))continue;const item={a,b,object:o,index:this.all.length};this.all.push(item);
   const xa=Math.floor((Math.min(a[0],b[0])-range)/cell),xb=Math.floor((Math.max(a[0],b[0])+range)/cell),za=Math.floor((Math.min(a[1],b[1])-range)/cell),zb=Math.floor((Math.max(a[1],b[1])+range)/cell);
   if((xb-xa+1)*(zb-za+1)>3000){item.broad=true;continue;}
   for(let x=xa;x<=xb;x++)for(let z=za;z<=zb;z++){const key=x+':'+z;let xs=this.map.get(key);if(!xs)this.map.set(key,xs=[]);xs.push(item);}
  }}
 }
 nearest(p,limit=150){const cx=Math.floor(p[0]/this.cell),cz=Math.floor(p[1]/this.cell),sources=this.map.get(cx+':'+cz)||[];let best=null,meters=limit;
  for(const s of sources){const d=nearLine(p,s.a,s.b);if(d<=meters){meters=d;best=s;}}
  for(const s of this.all)if(s.broad){const d=nearLine(p,s.a,s.b);if(d<=meters){meters=d;best=s;}}
  return best?{...best,meters}:null;
 }
}
function utilityComponents(editor,network){const paths=editor.objects.filter(o=>o.type==='utility'&&o.network===network);const index=new SegmentIndex(paths,null,220,160);
 const segments=index.all,roots=segments.map((_,i)=>i);function root(i){while(roots[i]!==i){roots[i]=roots[roots[i]];i=roots[i];}return i}function union(a,b){a=root(a);b=root(b);if(a!==b)roots[b]=a;}
 const points=new Map();for(const seg of segments){for(const p of [seg.a,seg.b]){const k=Math.round(p[0]/3)+':'+Math.round(p[1]/3);if(points.has(k))union(seg.index,points.get(k));else points.set(k,seg.index);}}
 const components=new Map();for(const seg of segments){const id=root(seg.index);seg.component=id;if(!components.has(id))components.set(id,{id,meters:0,sources:[],demand:0,connected:0});components.get(id).meters+=d2(seg.a,seg.b)}
 return {paths,segments,components,index};}
function serviceCoverage(homes,sites,radius,needPer=1){if(!homes.length||!sites.length)return 0;let total=0,served=0;for(const h of homes){const w=h.residents||1;total+=w;let reach=0;for(const s of sites){if(d2(coord(h),coord(s))<=radius){reach=1;break;}}served+=w*reach;}return clamp(served/(total||1),0,1);}
class CitySystems{
 constructor(editor,legacy,options={}){
  if(!editor||!Array.isArray(editor.objects))throw Error('WorldEditor required');
  this.editor=editor;this.legacy=legacy||null;this.infra=options.infra||null;this.day=legacy?.day||0;
  this.rngSeed=20261120;this.tax={residential:.12,commercial:.14,industrial:.10};this.serviceBudget=1;this.publicFare=2;
  this.lines=[];this.incidents=[];this.scenarios=[];this.daily=[];this.serial=0;this.tripCount=0;this.lastFinance={revenue:0,cost:0,net:0};this.simulationMs=0;this.reportMs=0;this.lastCompileRevision=-1;this._layout=null;
  registerCatalog(editor);
 }
 rand(){this.rngSeed=(Math.imul(this.rngSeed,1664525)+1013904223)>>>0;return this.rngSeed/4294967296;}
 getInfrastructure(){if(this.infra)return this.infra;if(typeof root.TrussLabInfrastructureSim==='function'){try{this.infra=new root.TrussLabInfrastructureSim(this.editor,{agentCap:50});return this.infra;}catch(err){this.infrastructureWarning=String(err?.message||err);return null;}}return null;}
 setTax(type,value){if(!(type in this.tax)||!finite(value)||value<0||value>.35)throw Error('Ставка вне диапазона 0–35%');this.tax[type]=value;return this.report()}
 addTransitLine(ids,{mode='bus',vehicles=2,headwayMinutes=15,fare=2}={}){if(!['bus','tram'].includes(mode)||!Array.isArray(ids)||ids.length<2||ids.length>30||this.lines.length>=40)throw Error('Неверный маршрут');
  const buildings=new Map(this.editor.objects.map(o=>[o.id,o]));const xs=ids.map(id=>{const o=buildings.get(id);if(!o||o.type!=='building'||!['bus-stop','tram-stop'].includes(o.catalogId))throw Error('Остановка не существует: '+id);return o});
  if(!finite(vehicles)||vehicles<1||vehicles>24||!finite(headwayMinutes)||headwayMinutes<2||headwayMinutes>180||!finite(fare)||fare<0||fare>20)throw Error('Некорректный транспортный тариф или выпуск');
  const l={id:'line-'+(++this.serial),mode,stops:ids.slice(),vehicles:Math.floor(vehicles),headwayMinutes,fare,createdDay:this.day};this.lines.push(l);this.lastCompileRevision=-1;return l;
 }
 removeTransitLine(id){const i=this.lines.findIndex(x=>x.id===id);if(i<0)return false;this.lines.splice(i,1);this.lastCompileRevision=-1;return true}
 addIncident(kind,{x=0,z=0,severity=.5,durationDays=4}={}){if(!['fire','accident','roadworks'].includes(kind)||![x,z,severity,durationDays].every(finite)||severity<0||severity>1||durationDays<1||durationDays>90||this.incidents.length>=40)throw Error('Некорректное происшествие');const x0={id:'incident-'+(++this.serial),kind,x,z,severity,remainingDays:durationDays,originalDays:durationDays};this.incidents.push(x0);return x0}
 _compile(){if(this.lastCompileRevision===this.editor.revision&&this._layout)return this._layout;
  const started=now(),objects=this.editor.objects;
  const buildings=[],roads=[],homes=[],employment=[],schools=[],health=[],fire=[],police=[],industry=[],commerce=[],stops=[],sources={power:[],water:[],sewage:[]};
  let jobs=0,housing=0,pollution=0,consumerPower=0,consumerWater=0;
  for(const o of objects){if(o.type==='road'||o.type==='interchange')roads.push(o);if(o.type!=='building')continue;
   const base=DATA[o.catalogId];if(!base)continue;const floors=clamp(Math.floor(Number(o.floors)||1),1,80),qty=o.catalogId==='apartment'?floors*6:o.catalogId==='house'?1:floors;
   const rec={id:o.id,catalogId:o.catalogId,x:Number(o.x)||0,z:Number(o.z)||0,floors,source:o,qty,kind:base};
   rec.residents=base.homes?(o.catalogId==='house'?3:qty*2.2):0;
   rec.jobs=(base.workers||0)*(o.catalogId==='warehouse'?1:qty);
   rec.power=(base.power||0)*qty;rec.water=(base.water||0)*qty;
   jobs+=rec.jobs;housing+=rec.residents;consumerPower+=rec.power;consumerWater+=rec.water;pollution+=(base.pollution||0)*qty;
   if(rec.residents)homes.push(rec);if(rec.jobs)employment.push(rec);
   if(base.school)schools.push(rec);if(base.health)health.push(rec);if(base.fire)fire.push(rec);if(base.police)police.push(rec);
   if(base.goods){if(base.pollution)industry.push(rec);else commerce.push(rec)}
   if(/-stop$/.test(o.catalogId))stops.push(rec);
   if(base.generatePower)sources.power.push({...rec,capacity:base.generatePower*qty});
   if(base.generateWater)sources.water.push({...rec,capacity:base.generateWater*qty});
   if(base.generateSewage)sources.sewage.push({...rec,capacity:base.generateSewage*qty});
   buildings.push(rec);
  }
  const parcels=objects.filter(o=>o.type==='parcel'&&o.points?.length>=3);
  function zoneAt(b){const x=b.x,z=b.z;for(const parcel of parcels){let inZone=false,poly=parcel.points;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],c=poly[j];if((a[1]>z)!==(c[1]>z)&&x<(c[0]-a[0])*(z-a[1])/(c[1]-a[1])+a[0])inZone=!inZone;}if(inZone)return parcel.zoning;}return 'unassigned';}
  const zones={residential:0,commercial:0,industrial:0,park:0,unassigned:0};for(const b of buildings){b.zone=zoneAt(b);zones[b.zone]=(zones[b.zone]||0)+1;}
  let roadLength=0;for(const o of roads)for(let k=1;k<o.points.length;k++)roadLength+=d2(o.points[k-1],o.points[k]);
  const roadIndex=new SegmentIndex(roads,null,240,250),networks={};for(const name of ['power','water','sewage'])networks[name]=utilityComponents(this.editor,name);
  const layout={zones,buildings,homes,employment,schools,health,fire,police,industry,commerce,stops,roads,roadLength,roadIndex,networks,sources,jobs,housing:Math.floor(housing),pollution,consumerPower,consumerWater,compiledMs:now()-started};
  this._layout=layout;this.lastCompileRevision=this.editor.revision;return layout;
 }
 _networkAvailability(layout,name,demandFor){const net=layout.networks[name],sources=layout.sources[name]||[];
  const sourceByComponent=new Map();let totalCapacity=0;
  for(const src of sources){totalCapacity+=src.capacity;const nearest=net.index.nearest(coord(src),140);const id=nearest?nearest.component:'standalone-'+src.id;sourceByComponent.set(id,(sourceByComponent.get(id)||0)+src.capacity)}
  let demand=0,available=0,connected=0;
  const componentDemand=new Map();
  for(const b of layout.buildings){const load=demandFor(b);if(!load)continue;demand+=load;
   const nearest=net.index.nearest(coord(b),140);let id=nearest?.component;
   if(id===undefined){const standalone=sources.find(s=>d2(coord(s),coord(b))<180);if(standalone)id='standalone-'+standalone.id;}
   if(id!==undefined&&sourceByComponent.has(id)){
    connected+=load;componentDemand.set(id,(componentDemand.get(id)||0)+load);
   }
  }
  for(const [id,need] of componentDemand)available+=Math.min(need,sourceByComponent.get(id)||0);
  return {coverage:demand?clamp(available/demand,0,1):1,capacity:totalCapacity,demand,connected,components:net.components.size,sources:sources.length};
 }
 _transit(layout){let totalCapacity=0,totalPassengers=0,routeKm=0,active=0,missing=0;
  if(!this.lines.length)return {lines:0,active:0,broken:0,passengersPerDay:0,capacityPerDay:0,routeKm:0};
  let infra=this.getInfrastructure();try{infra?.rebuild()}catch(err){this.infrastructureWarning=String(err?.message||err);infra=null;}const indexed=new Map(layout.buildings.map(o=>[o.id,o]));
  for(const l of this.lines){const stops=l.stops.map(id=>indexed.get(id)).filter(Boolean);if(stops.length!==l.stops.length||stops.length<2){missing++;continue;}
   let length=0,valid=true;
   for(let i=1;i<stops.length;i++){
    const a=coord(stops[i-1]),b=coord(stops[i]),route=infra?.route(l.mode==='tram'?'rail':'road',a,b);
    if(!route||!route.lengthM){valid=false;break;}length+=route.lengthM;
   }
   if(!valid){missing++;continue;}
   const catchment=layout.homes.reduce((n,h)=>n+(stops.some(s=>d2(coord(s),coord(h))<=450)?h.residents:0),0);
   const demand=catchment*.35;const seats=Math.floor(l.vehicles*(l.mode==='tram'?100:44)*Math.min(24,1440/l.headwayMinutes)/3);
   const passengers=Math.min(demand,seats);totalPassengers+=passengers;totalCapacity+=seats;routeKm+=length/1000;active++;
  }
  return {lines:this.lines.length,active,broken:missing,passengersPerDay:Math.round(totalPassengers),capacityPerDay:totalCapacity,routeKm:Math.round(routeKm*10)/10};
 }
 _coverage(layout,buildings,radius){return serviceCoverage(layout.homes,buildings,radius)}
 report(){const start=now(),l=this._compile(),population=this.legacy?this.legacy.population:0;
  const employmentRate=clamp((l.jobs||0)/Math.max(1,population*.47),0,1),jobsAvailable=l.jobs;
  const staticServices=l.staticServices||(l.staticServices={power:this._networkAvailability(l,'power',b=>b.power),water:this._networkAvailability(l,'water',b=>b.water),sewage:this._networkAvailability(l,'sewage',b=>b.water*.8)});const {power,water,sewage}=staticServices;
  const transitKey=this.lastCompileRevision+':'+JSON.stringify(this.lines);const transit=this._transitCacheKey===transitKey?this._transitCache:(this._transitCache=this._transit(l),this._transitCacheKey=transitKey,this._transitCache);const service={school:this._coverage(l,l.schools,950),health:this._coverage(l,l.health,1550),fire:this._coverage(l,l.fire,1900),police:this._coverage(l,l.police,2300)};
  const roadLanes=l.roads.reduce((n,r)=>n+clamp(Number(r.lanes)||Math.max(1,Math.round((r.width||7)/3.5)),1,8),0);
  const potentialTrips=(population*.68+l.jobs*.35),vehicleTrips=Math.max(0,potentialTrips-transit.passengersPerDay*.75);
  const capacity=Math.max(90,(l.roadLength/1000+1)*(roadLanes/Math.max(1,l.roads.length))*185);
  const volumeCapacity=vehicleTrips/capacity;const works=this.incidents.filter(e=>e.kind==='roadworks'||e.kind==='accident');
  const reduction=works.reduce((n,e)=>n+e.severity*.16,0);const weatherFactor=clamp(this.infra?.speedFactor?.('road')||1,.3,1);const delay=clamp(1+.15*Math.pow(clamp(volumeCapacity,0,5),4),1,10)*(1+reduction)/weatherFactor;
  const congestion=clamp((delay-1)/9,0,1),roadNetwork=l.roads.length;
  const fires=this.incidents.filter(x=>x.kind==='fire');
  const affectedByFire=fires.reduce((n,f)=>n+l.buildings.filter(o=>d2(coord(o),[f.x,f.z])<180).length*f.severity,0);
  const blazePenalty=clamp(affectedByFire/Math.max(1,l.buildings.length),0,.35)*(1-service.fire*.65);
  const pollution=l.pollution/Math.max(1,l.buildings.length)*.03;
  const desirability=clamp(.72+.13*service.school+.11*service.health+.12*service.fire+.08*service.police-.15*pollution-.24*congestion-blazePenalty-((1-power.coverage)+(1-water.coverage))*.24,0,1);
  const householdDemand=Math.max(0,Math.ceil((jobsAvailable/.47||0)*desirability-l.housing));
  const industrialOutput=l.industry.reduce((n,b)=>n+(b.kind.goods||0)*b.qty*(b.zone==='industrial'?1.15:b.zone==='unassigned'?1:.8),0)*Math.min(power.coverage,water.coverage)*(1-blazePenalty);
  const retailSupply=l.commerce.reduce((n,b)=>n+(b.kind.goods||0)*b.qty*(b.zone==='commercial'?1.12:b.zone==='unassigned'?1:.85),0)*Math.min(power.coverage,water.coverage)*(1-blazePenalty);
  const goodsDemand=population*.55,goodsDeficit=Math.max(0,goodsDemand-retailSupply-industrialOutput*.35);
  const incidents=this.incidents.filter(e=>e.remainingDays>0);
  const result={day:this.day,population,housingCapacity:l.housing,jobs:Math.round(jobsAvailable),employed:Math.min(Math.round(population*.47),Math.round(jobsAvailable)),unemployment:Math.max(0,Math.round(population*.47-jobsAvailable)),households:Math.ceil(population/2.35),housingDemand:householdDemand,
   zones:clone(l.zones),fireImpact:blazePenalty,factories:l.industry.length,retail:l.commerce.length,industrialOutput:Math.round(industrialOutput),retailSupply:Math.round(retailSupply),goodsDeficit:Math.round(goodsDeficit),
   power,water,sewage,transit,service,congestion,delayFactor:delay,vehicleTripsPerDay:Math.round(vehicleTrips),roadKm:Math.round(l.roadLength/100)/10,roadNetwork,desirability,incidents:clone(incidents),treasury:Math.round(this.legacy?.treasury||0),lastFinance:clone(this.lastFinance),scenarioCount:this.scenarios.length,historyCount:this.daily.length,projectObjects:this.editor.objects.length,
   performance:{compileMs:l.compiledMs,reportMs:0,stepMs:this.simulationMs,knownObjects:l.buildings.length,activeIncidentCount:incidents.length,transitLines:this.lines.length,estimatedAgents:0} };
  this.reportMs=now()-start;result.performance.reportMs=this.reportMs;return result;
 }
 advanceAfterBase(days=1){if(!finite(days)||days<0||days>365)throw Error('Некорректный период');const begin=now();for(let i=0;i<Math.floor(days);i++){
   this.day=this.legacy?.day||this.day+1;
   for(const incident of this.incidents)incident.remainingDays=Math.max(0,incident.remainingDays-1);
   this.incidents=this.incidents.filter(x=>x.remainingDays>0);
   const r=this.report();const industryTax=r.industrialOutput*this.tax.industrial*.085;
   const commercialTax=r.retailSupply*this.tax.commercial*.065;
   const housingTax=r.population*this.tax.residential*.40;
   const fares=r.transit.passengersPerDay*this.publicFare*.6;
   const extraRevenue=housingTax+commercialTax+industryTax+fares;
   const serviceCosts=(this._compile().buildings.length*2.4+r.transit.active*130+this._compile().roadLength/1000*4+this._compile().sources.power.length*85+this._compile().sources.water.length*66+this._compile().sources.sewage.length*55)*this.serviceBudget;
   const incidentsCost=this.incidents.reduce((n,e)=>n+e.severity*(e.kind==='fire'?230:95),0);
   const cost=serviceCosts+incidentsCost;
   if(this.legacy){this.legacy.treasury+=extraRevenue-cost;
     // Connected jobs, services and utilities determine actual migration pressure.
     const sustainable=Math.min(r.housingCapacity,Math.max(0,Math.round(r.jobs/.47*clamp(r.desirability,.12,1))));
     const safeServices=clamp(.45+.55*Math.min(r.power.coverage,r.water.coverage),.45,1);
     const goal=Math.round(sustainable*safeServices);
     this.legacy.population=clamp(Math.round(this.legacy.population+(goal-this.legacy.population)*.018),0,r.housingCapacity);
     this.legacy.treasury=clamp(this.legacy.treasury,-1e12,1e12);
   }
   this.lastFinance={revenue:Math.round(extraRevenue),cost:Math.round(cost),net:Math.round(extraRevenue-cost)};
   if(this.day%7===0){this.daily.push({day:this.day,population:this.legacy?.population||0,treasury:Math.round(this.legacy?.treasury||0),employment:r.employed,congestion:r.congestion,power:r.power.coverage,water:r.water.coverage});if(this.daily.length>520)this.daily.shift();}
   // Capped deterministic incident occurrence; manual incidents are always available.
   if(this._compile().buildings.length>10&&this.rand()<.0015&&this.incidents.length<12){let n=this._compile().buildings[Math.floor(this.rand()*this._compile().buildings.length)];this.addIncident(this.rand()<.5?'fire':'accident',{x:n.x,z:n.z,severity:.3,durationDays:3});}
  }this.simulationMs=now()-begin;return this.report();}
 recordScenario(name){if(typeof name!=='string'||name.length>80||this.scenarios.length>=20)throw Error('Некорректное название или лимит сценариев');const report=this.report(),s={id:'scenario-'+(++this.serial),name:name.trim()||'Сценарий',timestampDay:this.day,report:{...report,incidents:report.incidents.length,performance:undefined}};this.scenarios.push(s);return s;}
 compareScenarios(first,second){const a=this.scenarios.find(x=>x.id===first),b=this.scenarios.find(x=>x.id===second);if(!a||!b)throw Error('Выберите два сценария');const values={};for(const k of ['population','housingDemand','jobs','congestion','desirability','treasury','industrialOutput','goodsDeficit'])values[k]={before:a.report[k],after:b.report[k],delta:b.report[k]-a.report[k]};return {a:a.name,b:b.name,delta:values};}
 export(){return {format:'TrussLab-CitySystems',version:2,day:this.day,rngSeed:this.rngSeed,tax:clone(this.tax),serviceBudget:this.serviceBudget,publicFare:this.publicFare,lines:clone(this.lines),incidents:clone(this.incidents),scenarios:clone(this.scenarios),daily:clone(this.daily),serial:this.serial,lastFinance:clone(this.lastFinance)};}
 import(d){if(d==null){this.lines=[];this.incidents=[];this.scenarios=[];this.daily=[];this.tax={residential:.12,commercial:.14,industrial:.10};this.serviceBudget=1;this.publicFare=2;this.lastFinance={revenue:0,cost:0,net:0};this.lastCompileRevision=-1;this.day=this.legacy?.day||0;return;}
  if(d.format!=='TrussLab-CitySystems'||d.version!==2||!Array.isArray(d.lines)||d.lines.length>40||!Array.isArray(d.incidents)||d.incidents.length>40||!Array.isArray(d.scenarios)||d.scenarios.length>20||!Array.isArray(d.daily)||d.daily.length>520||!finite(d.day)||d.day<0||d.day>1e7||!finite(d.serial)||d.serial<0)throw Error('Повреждены данные городской симуляции');
  for(const l of d.lines)if(!Array.isArray(l.stops)||l.stops.length<2||l.stops.length>30||!['tram','bus'].includes(l.mode)||!finite(l.vehicles)||l.vehicles<1||l.vehicles>24)throw Error('Повреждён транспортный маршрут');
  for(const incident of d.incidents)if(!['fire','accident','roadworks'].includes(incident.kind)||![incident.x,incident.z,incident.severity,incident.remainingDays].every(finite)||incident.remainingDays<0||incident.remainingDays>90)throw Error('Некорректные сведения о происшествии');
  const taxes=d.tax||{};for(const k of Object.keys(this.tax))if(!finite(taxes[k])||taxes[k]<0||taxes[k]>.35)throw Error('Некорректный налог');
  this.day=d.day;this.tax=clone(taxes);this.serviceBudget=clamp(Number(d.serviceBudget)||1,.4,2);this.publicFare=clamp(Number(d.publicFare)||2,0,20);
  this.lines=clone(d.lines);this.incidents=clone(d.incidents);this.scenarios=clone(d.scenarios);this.daily=clone(d.daily);this.serial=d.serial;this.rngSeed=(d.rngSeed>>>0)||20261120;this.lastFinance=clone(d.lastFinance||{revenue:0,cost:0,net:0});this._layout=null;this.lastCompileRevision=-1;
  return this.report();}
}
root.TrussLabCitySystems=CitySystems;
root.TrussLabCityCatalog=MODELS;
root.TrussLabCitySegmentIndex=SegmentIndex;
})(typeof globalThis!=='undefined'?globalThis:this);
