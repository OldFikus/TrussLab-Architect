/* TrussLab InfrastructureSim 14.1–14.9. Offline, deterministic, instructional.
 * ENU x=east, z=south in metres. This is NOT an engineer-certified bridge model.
 * Bridges, soils, navigation clearance and simulation coefficients are USER
 * SCENARIOS, not verified parameters of any actual infrastructure. */
(function(root){'use strict';
const finite=Number.isFinite, clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),copy=x=>JSON.parse(JSON.stringify(x));
const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const along=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const DEFAULT_WEATHER={rain:0,fog:0,windMps:3,temperatureC:17,night:false};
const SOILS={rock:{name:'Скала',bearingKpa:650,elasticMpa:70,poisson:.24},sand:{name:'Песок',bearingKpa:220,elasticMpa:26,poisson:.32},clay:{name:'Глина',bearingKpa:140,elasticMpa:12,poisson:.36},silt:{name:'Ил',bearingKpa:75,elasticMpa:6,poisson:.40},peat:{name:'Торф / болото',bearingKpa:35,elasticMpa:2,poisson:.44}};
const FOUNDATIONS=['shallow','strip','raft','piles'];
const segmentIntersection=(a,b,c,d)=>{
 const rx=b[0]-a[0],rz=b[1]-a[1],sx=d[0]-c[0],sz=d[1]-c[1],den=rx*sz-rz*sx;
 if(Math.abs(den)<1e-9)return null;
 const ux=c[0]-a[0],uz=c[1]-a[1],t=(ux*sz-uz*sx)/den,u=(ux*rz-uz*rx)/den;
 return t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8?{t:clamp(t,0,1),u:clamp(u,0,1)}:null;
};
class Graph{
 constructor(kind){this.kind=kind;this.nodes=[];this.edges=[];this.adjacency=new Map();this.spatial=new Map();this.maxNodes=7500;}
 addNode(x,z,track=0){const step=1.5,key=`${Math.round(x/step)}:${Math.round(z/step)}:${track}`;let id=this.spatial.get(key);if(id!==undefined)return id;
  if(this.nodes.length>=this.maxNodes)throw Error('Превышен лимит вершин сети');id=this.nodes.length;this.nodes.push({id,x,z,track});this.adjacency.set(id,[]);this.spatial.set(key,id);return id;}
 addEdge(from,to,props={}){if(from===to)return null;const a=this.nodes[from],b=this.nodes[to],d=Math.hypot(a.x-b.x,a.z-b.z);if(d<.05)return null;const id=this.edges.length,e={id,from,to,length:d,speedKph:props.speedKph??(this.kind==='rail'?75:55),source:props.source||'',track:props.track??0,switch:!!props.switch,oneWay:!!props.oneWay};this.edges.push(e);this.adjacency.get(from).push({to,edge:id,forward:true});if(!e.oneWay)this.adjacency.get(to).push({to:from,edge:id,forward:false});return e;}
 nearest(x,z,track=null){let best=null,m=Infinity;for(const p of this.nodes){if(track!==null&&p.track!==track)continue;const d=Math.hypot(p.x-x,p.z-z);if(d<m){m=d;best=p;}}return best?{...best,distance:m}:null;}
 route(start,end,mode='time'){const a=typeof start==='number'?this.nodes[start]:this.nearest(start[0],start[1]),b=typeof end==='number'?this.nodes[end]:this.nearest(end[0],end[1]);if(!a||!b)return null;
  const n=this.nodes.length,dist=new Float64Array(n).fill(Infinity),prev=new Array(n).fill(null),seen=new Uint8Array(n),heap=[];
  function push(node,cost){heap.push({node,cost});let i=heap.length-1;while(i){let j=(i-1)>>1;if(heap[j].cost<=cost)break;heap[i]=heap[j];i=j;}heap[i]={node,cost};}
  function pop(){const v=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let j=i*2+1;if(j>=heap.length)break;if(j+1<heap.length&&heap[j+1].cost<heap[j].cost)j++;if(heap[j].cost>=last.cost)break;heap[i]=heap[j];i=j;}heap[i]=last;}return v;}
  dist[a.id]=0;push(a.id,0);
  while(heap.length){let v=pop();if(seen[v.node])continue;seen[v.node]=1;if(v.node===b.id)break;for(const step of this.adjacency.get(v.node)||[]){const e=this.edges[step.edge],weight=mode==='distance'?e.length:e.length/Math.max(1,e.speedKph)*3.6;const nd=dist[v.node]+weight;if(nd<dist[step.to]-1e-9){dist[step.to]=nd;prev[step.to]={node:v.node,edge:e.id,forward:step.forward};push(step.to,nd);}}}
  if(!finite(dist[b.id]))return null;
  const edgeIds=[],nodeIds=[b.id];let v=b.id;while(v!==a.id){const x=prev[v];if(!x)return null;edgeIds.push({id:x.edge,from:x.node,to:v,forward:x.forward});v=x.node;nodeIds.push(v);}nodeIds.reverse();edgeIds.reverse();
  return {nodes:nodeIds,steps:edgeIds,lengthM:edgeIds.reduce((s,e)=>s+this.edges[e.id].length,0),travelSeconds:edgeIds.reduce((s,x)=>{const e=this.edges[x.id];return s+e.length/Math.max(1,e.speedKph)*3.6;},0),cost:dist[b.id]};
 }
 components(){const seen=new Set(),sizes=[];for(const node of this.nodes){if(seen.has(node.id))continue;let stack=[node.id],size=0;seen.add(node.id);while(stack.length){const n=stack.pop();size++;for(const step of this.adjacency.get(n)||[]){if(!seen.has(step.to)){seen.add(step.to);stack.push(step.to)}}}sizes.push(size)}return sizes.sort((a,b)=>b-a)}
 export(){return {kind:this.kind,nodes:this.nodes.length,edges:this.edges.length,components:this.components().length,lengthM:this.edges.reduce((s,x)=>s+x.length,0)}}
}
function makeGraph(items,kind,spacing=4){const g=new Graph(kind);const segments=[];
 for(const o of items){if(kind==='rail'&&o.type==='switch')continue; if(!Array.isArray(o.points)||o.points.length<2)continue;
  const tracks=kind==='rail'?(o.tracks===1?[0]:[0,1]):[0];
  // Continuous polyline offsets. Segment-local normals create cracks at
  // every rail curve; a shared vertex normal is essential for connected tracks.
  const nvec=i=>{const points=o.points,n=points.length;
    const direction=(a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;return [-dz/l,dx/l]};
    const u=i?direction(points[i-1],points[i]):direction(points[0],points[1]);
    const v=i<n-1?direction(points[i],points[i+1]):direction(points[n-2],points[n-1]);
    const sum=[u[0]+v[0],u[1]+v[1]],norm=Math.hypot(...sum)||1;
    const unit=[sum[0]/norm,sum[1]/norm];const miter=clamp(1/Math.max(.35,unit[0]*u[0]+unit[1]*u[1]),1,2.5);
    return [unit[0]*miter,unit[1]*miter];
  };
  for(const track of tracks){const off=kind==='rail'?(track===0?-spacing/2:spacing/2):0;
   const shifted=o.points.map((p,i)=>{const n=nvec(i);return [p[0]+n[0]*off,p[1]+n[1]*off]});
   for(let i=1;i<shifted.length;i++){
    const start=shifted[i-1],end=shifted[i];if(![...start,...end].every(finite)||length(start,end)<.1)continue;
    segments.push({a:start,b:end,source:o.id||'',track,oneWay:!!o.oneWay,speedKph:clamp(Number(o.speedKph)|| (kind==='rail'?75:55),5,250),splits:[0,1]});
   }
  }
 }
 if(segments.length>2000)throw Error('Слишком много сегментов для локальной маршрутизации');
 // Detect grade-free junctions only for the same rail track. Rails crossing
 // at a different level are not auto-connected; manual switches are required.
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j];if(kind==='rail'&&a.track!==b.track)continue;
  const p=segmentIntersection(a.a,a.b,b.a,b.b);if(p){a.splits.push(p.t);b.splits.push(p.u);}
 }
 for(const s of segments){const u=[...new Set(s.splits.map(x=>Math.round(x*1e6)/1e6))].sort((a,b)=>a-b);for(let i=1;i<u.length;i++){
  const a=along(s.a,s.b,u[i-1]),b=along(s.a,s.b,u[i]);const v=g.addNode(a[0],a[1],s.track),w=g.addNode(b[0],b[1],s.track);g.addEdge(v,w,s);
 }}
 if(kind==='rail'){
  for(const sw of items.filter(o=>o.type==='switch')){
   const pt=sw.points?.[0];if(!pt)continue;const a=g.nearest(pt[0],pt[1],0),b=g.nearest(pt[0],pt[1],1);
   if(a&&b&&a.distance<24&&b.distance<24)g.addEdge(a.id,b.id,{speedKph:20,source:sw.id||'',switch:true,track:-1});
  }
 }
 return g;
}
class InfrastructureSim{
 constructor(editor,{agentCap=60,seed=20261120}={}){
  if(!editor||!Array.isArray(editor.objects))throw Error('Для InfrastructureSim требуется WorldEditor');
  this.editor=editor;this.clock=0;this.seed=(seed>>>0)||1;this.agentCap=clamp(Math.round(agentCap),1,250);this.trafficFlowCarsPerMinute=12;this.autoTraffic=true;this.nextCarSpawn=0;
  this.weather=copy(DEFAULT_WEATHER);this.carAgents=[];this.trainSchedules=[];this.trains=[];this.shipLanes=[];this.ships=[];this.signals=[];this.foundations=[];this.events=[];this.scenarios=[];this.nextId=0;
  this.bridge={spanM:220,EI_Nm2:2.8e12,uniformLoadNPerM:2e4,stressLimitPa:2.2e8,sectionModulusM3:28,navClearanceM:null};
  this.stats={carsCompleted:0,trainDepartures:0,trainArrivals:0,trainWaitingSeconds:0,shipCompleted:0,shipBlocked:0,carDistanceM:0};
  this.road=new Graph('road');this.rail=new Graph('rail');this.lastEditorRevision=-1;this.rebuild();
 }
 _id(prefix){return prefix+'-'+(++this.nextId)}
 random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296}
 rebuild(force=false){if(!force&&this.editor.revision===this.lastEditorRevision)return false;
  this.road=makeGraph(this.editor.objects.filter(o=>o.type==='road'||o.type==='interchange'),'road');
  this.rail=makeGraph(this.editor.objects.filter(o=>o.type==='rail'||o.type==='switch'),'rail');
  this.lastEditorRevision=this.editor.revision;
  // Agents keep their identity only if their routes still refer to valid edges.
  this.carAgents=this.carAgents.filter(c=>c.steps.every(s=>this.road.edges[s.id]));
  this.trains=this.trains.filter(t=>t.steps.every(s=>this.rail.edges[s.id]));
  return true;
 }
 graph(kind){return kind==='rail'?this.rail:this.road}
 route(kind,from,to,mode='time'){this.rebuild();return this.graph(kind).route(from,to,mode)}
 addSignal(edgeId,offset=.5){this.rebuild();if(!this.rail.edges[edgeId])throw Error('Нет такого участка железной дороги');if(!finite(offset)||offset<0||offset>1)throw Error('Некорректное положение сигнала');const o={id:this._id('sig'),edgeId,offset,aspect:'green'};this.signals.push(o);return o;}
 spawnCar({from=null,to=null,speedKph=45}={}){this.rebuild();if(this.carAgents.length>=this.agentCap)return null;const nodes=this.road.nodes;if(nodes.length<2)return null;
  const start=from??nodes[Math.floor(this.random()*nodes.length)].id;let end=to??nodes[Math.floor(this.random()*nodes.length)].id;
  let path=this.road.route(start,end);if(!path||!path.steps.length){const origin=Array.isArray(start)?this.road.nearest(start[0],start[1]):nodes[start];let far=nodes.slice().sort((a,b)=>Math.hypot(b.x-origin.x,b.z-origin.z)-Math.hypot(a.x-origin.x,a.z-origin.z));for(const v of far){path=this.road.route(start,v.id);if(path?.steps.length)break;}}
  if(!path?.steps.length)return null;const car={id:this._id('car'),steps:path.steps,at:0,distance:0,speedKph:clamp(speedKph,10,110),x:nodes[path.nodes[0]].x,z:nodes[path.nodes[0]].z};this.carAgents.push(car);return car;
 }
 scheduleTrain({from=null,to=null,departSeconds=0,speedKph=70,label='Поезд',repeatSeconds=0}={}){
  this.rebuild();if(this.rail.nodes.length<2)throw Error('Железнодорожная сеть отсутствует');const a=from??this.rail.nodes[0].id,b=to??this.rail.nodes.at(-1).id;
  const route=this.rail.route(a,b);if(!route?.steps.length)throw Error('Между станциями нет связанного пути');
  if(![departSeconds,speedKph,repeatSeconds].every(finite)||departSeconds<0||repeatSeconds<0)throw Error('Некорректное расписание');
  const entry={id:this._id('sched'),label,from:a,to:b,departSeconds,speedKph:clamp(speedKph,15,160),repeatSeconds,nextDeparture:departSeconds};this.trainSchedules.push(entry);return entry;
 }
 dispatchTrain(schedule){if(this.trains.length>=20)return null;const route=this.rail.route(schedule.from,schedule.to);if(!route?.steps.length)return null;
  const occ=this._occupiedRail();if(occ.has(route.steps[0].id))return null;
  const p=this.rail.nodes[route.nodes[0]];
  const t={id:this._id('train'),scheduleId:schedule.id,label:schedule.label,steps:route.steps,at:0,distance:0,speedKph:schedule.speedKph,x:p.x,z:p.z,blocked:false};this.trains.push(t);this.stats.trainDepartures++;return t;
 }
 _occupiedRail(){const occupied=new Set();for(const t of this.trains){const step=t.steps[t.at];if(step)occupied.add(step.id)}return occupied}
 addShippingLane(points,{name='Учебный судоходный коридор',clearanceM=null}={}){if(!Array.isArray(points)||points.length<2||points.length>500||!points.every(a=>Array.isArray(a)&&a.length===2&&a.every(finite)))throw Error('Некорректный судоходный маршрут');const o={id:this._id('lane'),points:copy(points),name,clearanceM:clearanceM===null?null:Number(clearanceM)};this.shipLanes.push(o);return o;}
 clearance(vessel,lane){const available=lane?.clearanceM??this.bridge.navClearanceM;const airDraftM=vessel.airDraftM??0;
  return {airDraftM,availableM:available,passable:available===null?null:airDraftM+Math.max(0,this.weather.windMps-12)*.03<=available,depthVerified:false,depthStatus:'Нет данных о батиметрии',engineeringVerified:false};
 }
 launchShip({laneId=null,speedKnots=8,airDraftM=18,name='Судно'}={}){const lane=this.shipLanes.find(x=>x.id===(laneId||this.shipLanes[0]?.id));if(!lane)throw Error('Нет судоходного коридора');if(this.ships.length>=15)return null;
  if(!finite(airDraftM)||airDraftM<0||airDraftM>200)throw Error('Некорректная высота судна');const valid=this.clearance({airDraftM},lane);const p=lane.points[0];
  const s={id:this._id('ship'),laneId:lane.id,name,speedKnots:clamp(speedKnots,1,24),airDraftM,at:0,distance:0,x:p[0],z:p[1],blocked:valid.passable===false};this.ships.push(s);if(s.blocked)this.stats.shipBlocked++;return s;
 }
 setWeather(patch){for(const k of Object.keys(patch))if(!(k in DEFAULT_WEATHER))throw Error('Неизвестный погодный параметр: '+k);
  const w={...this.weather,...patch};for(const [k,a,b] of [['rain',0,1],['fog',0,1],['windMps',0,50],['temperatureC',-45,55]]){if(!finite(w[k])||w[k]<a||w[k]>b)throw Error('Неверный параметр погоды '+k);}w.night=!!w.night;this.weather=w;return copy(w);
 }
 speedFactor(kind){const w=this.weather;let k=1-w.rain*(kind==='road'?.44:kind==='rail'?.26:.20)-w.fog*(kind==='road'?.24:kind==='rail'?.08:.22);if(w.night)k-=kind==='road'?.10:.02;if(w.temperatureC<0&&w.rain>.3)k-=.14;if(kind==='ship')k-=clamp((w.windMps-10)*.026,0,.4);return clamp(k,.26,1);}
 _advance(agent,graph,meters,repeat=false){while(meters>0&&agent.at<agent.steps.length){let step=agent.steps[agent.at],edge=graph.edges[step.id];if(!edge){agent.at=agent.steps.length;break;}const available=edge.length-agent.distance,delta=Math.min(meters,available);agent.distance+=delta;meters-=delta;const from=graph.nodes[step.from],to=graph.nodes[step.to],u=clamp(agent.distance/edge.length,0,1);agent.x=from.x+(to.x-from.x)*u;agent.z=from.z+(to.z-from.z)*u;
  if(agent.distance>=edge.length-.0001){agent.at++;agent.distance=0;}
 }if(repeat&&agent.at>=agent.steps.length){agent.at=0;agent.distance=0;}return agent.at>=agent.steps.length;}
 step(dt=1){if(!finite(dt)||dt<0||dt>120)throw Error('Некорректный шаг симуляции');this.rebuild();this.clock+=dt;
  // 14.3 continuous, capped demand. Spawn at most 12 vehicles per step so
  // background traffic cannot freeze a low-end browser after a time jump.
  if(this.autoTraffic&&this.road.edges.length&&this.trafficFlowCarsPerMinute>0){
   const period=60/this.trafficFlowCarsPerMinute;let count=0;
   while(this.clock>=this.nextCarSpawn&&count++<12){this.spawnCar();this.nextCarSpawn+=period;}
   if(this.nextCarSpawn<this.clock-120)this.nextCarSpawn=this.clock;
  }

  for(const sch of this.trainSchedules){let launches=0;while(this.clock+1e-7>=sch.nextDeparture&&launches<2){const train=this.dispatchTrain(sch);if(!train){this.stats.trainWaitingSeconds+=dt;break;}sch.nextDeparture=sch.repeatSeconds>0?sch.nextDeparture+sch.repeatSeconds:Infinity;launches++;}}
  for(const c of this.carAgents){const factor=this.speedFactor('road');const m=dt*(c.speedKph*1000/3600)*factor;this.stats.carDistanceM+=m;const ended=this._advance(c,this.road,m);if(ended)this.stats.carsCompleted++;}this.carAgents=this.carAgents.filter(c=>c.at<c.steps.length);
  // Reserve the current rail segment for a single train; trailing trains may
  // not enter occupied segments. Simplified block rule, not interlocking.
  const occupied=this._occupiedRail();for(const t of this.trains){const edge=t.steps[t.at];if(!edge)continue;
   const next=t.steps[t.at+1];const remaining=this.rail.edges[edge.id].length-t.distance;
   const wanted=dt*(t.speedKph*1000/3600)*this.speedFactor('rail');
   if(next&&remaining<=wanted&&occupied.has(next.id)){t.blocked=true;this.stats.trainWaitingSeconds+=dt;this._advance(t,this.rail,Math.max(0,remaining-.01));}
   else{t.blocked=false;const before=t.at;this._advance(t,this.rail,wanted);if(t.at!==before){occupied.delete(edge.id);if(t.steps[t.at])occupied.add(t.steps[t.at].id);}}
  }this.trains=this.trains.filter(t=>{if(t.at>=t.steps.length){this.stats.trainArrivals++;return false;}return true;});
  for(const s of this.ships){const lane=this.shipLanes.find(x=>x.id===s.laneId),check=this.clearance(s,lane);s.blocked=check.passable===false;if(s.blocked)continue;
   let m=dt*s.speedKnots*.514444*this.speedFactor('ship');while(m>0&&s.at<lane.points.length-1){const a=lane.points[s.at],b=lane.points[s.at+1],d=length(a,b),n=Math.min(m,d-s.distance);s.distance+=n;m-=n;const p=along(a,b,s.distance/d);s.x=p[0];s.z=p[1];if(s.distance>=d-1e-5){s.at++;s.distance=0;}}
  }this.ships=this.ships.filter(s=>{const lane=this.shipLanes.find(x=>x.id===s.laneId);if(s.at>=lane.points.length-1){this.stats.shipCompleted++;return false}return true});
  this.signals.forEach(sig=>{sig.aspect=occupied.has(sig.edgeId)?'red':'green'});return this.report();
 }
 calculateBridge({spanM=this.bridge.spanM,EI_Nm2=this.bridge.EI_Nm2,uniformLoadNPerM=this.bridge.uniformLoadNPerM,pointLoads=[],stressLimitPa=this.bridge.stressLimitPa,sectionModulusM3=this.bridge.sectionModulusM3}={}){
  if(![spanM,EI_Nm2,uniformLoadNPerM,stressLimitPa,sectionModulusM3].every(finite)||spanM<=0||spanM>10000||EI_Nm2<=0||uniformLoadNPerM<0||sectionModulusM3<=0||stressLimitPa<=0)throw Error('Неправильные параметры расчётного пролёта');
  if(!Array.isArray(pointLoads)||pointLoads.length>200||pointLoads.some(p=>!finite(p.x)||p.x<0||p.x>spanM||!finite(p.forceN)||p.forceN<0))throw Error('Неверные сосредоточенные силы');
  const L=spanM,q=uniformLoadNPerM,total=q*L+pointLoads.reduce((s,p)=>s+p.forceN,0);
  const RB=(q*L*L/2+pointLoads.reduce((s,p)=>s+p.forceN*p.x,0))/L,RA=total-RB;
  const points=[];let maxMoment=0,maxDeflection=0;
  for(let i=0;i<=100;i++){
   const x=L*i/100;let M=RA*x-q*x*x/2,y=q*x*(L*L*L-2*L*x*x+x*x*x)/(24*EI_Nm2);
   for(const p of pointLoads){const a=p.x,b=L-a;M-=p.forceN*Math.max(0,x-a);y+=x<=a?p.forceN*b*x*(L*L-b*b-x*x)/(6*L*EI_Nm2):p.forceN*a*(L-x)*(L*L-a*a-(L-x)**2)/(6*L*EI_Nm2);}
   points.push({x,momentNm:M,deflectionM:y});maxMoment=Math.max(maxMoment,Math.abs(M));maxDeflection=Math.max(maxDeflection,Math.abs(y));
  }
  const stressPa=maxMoment/sectionModulusM3,utilization=stressPa/stressLimitPa;
  return {supports:{leftN:RA,rightN:RB},totalN:total,equilibriumErrorN:Math.abs(RA+RB-total),momentErrorNm:Math.abs(RB*L-q*L*L/2-pointLoads.reduce((s,p)=>s+p.forceN*p.x,0)),maxMomentNm:maxMoment,maxDeflectionM:maxDeflection,stressPa,utilization,pass:utilization<=1,points,verifiedDesign:false,assumptions:'Схема шарнирно опёртой балки Эйлера–Бернулли. Не модель реального моста.'};
 }
 setFoundation(objectId,{kind='shallow',soil='sand',widthM=6,lengthM=6,loadKN=2400,piles=4,depthM=1.5}={}){
  if(!FOUNDATIONS.includes(kind)||!SOILS[soil])throw Error('Неизвестный грунт или фундамент');if(![widthM,lengthM,loadKN,piles,depthM].every(finite)||widthM<=0||lengthM<=0||loadKN<0||widthM>500||lengthM>500||piles<1||piles>200||depthM<0||depthM>50)throw Error('Неверный размер фундамента');
  const o={id:this._id('foundation'),objectId:objectId||null,kind,soil,widthM,lengthM,loadKN,piles,depthM};this.foundations.push(o);return o;
 }
 foundationReport(f){const s=SOILS[f.soil];if(!s)throw Error('Неизвестный грунт');let area=f.widthM*f.lengthM;
  if(f.kind==='strip')area*=.42;if(f.kind==='piles')area=Math.min(area,f.piles*.7*12);if(f.kind==='raft')area*=1.15;
  const pressureKpa=f.loadKN/area,capacity=s.bearingKpa*(f.kind==='piles'?1.55:1),utilization=pressureKpa/capacity;
  // Elastic half-space approximation, not geotechnical settlement prediction.
  const characteristicB=Math.sqrt(area),settlementM=(pressureKpa/(s.elasticMpa*1000))*characteristicB*(1-s.poisson*s.poisson)*(f.kind==='piles'?.45:1);
  const needsGroundwaterStudy=f.soil==='peat'||f.soil==='silt';return {areaM2:area,pressureKpa,capacityKpa:capacity,utilization,settlementM,pass:utilization<=1&&settlementM<.05,needsGroundwaterStudy,verifiedDesign:false};
 }
 captureScenario(name='Сценарий'){const snap={name,time:this.clock,config:{weather:copy(this.weather),bridge:copy(this.bridge),agentCap:this.agentCap},metrics:this.report()};this.scenarios.push(snap);if(this.scenarios.length>30)this.scenarios.shift();return snap;}
 compareScenarios(a,b){const A=typeof a==='number'?this.scenarios[a]:a,B=typeof b==='number'?this.scenarios[b]:b;if(!A||!B)throw Error('Не найдены сценарии');const diff={};for(const key of ['roadSpeedFactor','railSpeedFactor','shipSpeedFactor','carsCompleted','trainArrivals','maxDeflectionM','maxFoundationUtilization']){const v=B.metrics[key]-A.metrics[key];diff[key]=finite(v)?v:0;}return {baseline:A.name,alternative:B.name,delta:diff,baselineStability:A.metrics.stability,alternativeStability:B.metrics.stability,warnings:['Игровая модель; инженерная безопасность не подтверждена']};}
 report(){this.rebuild();const bridge=this.calculateBridge(),foundations=this.foundations.map(f=>({...this.foundationReport(f),id:f.id}));const maxFoundationUtilization=foundations.length?Math.max(...foundations.map(x=>x.utilization)):0;
  const stability={beamWithinDemoLimit:bridge.pass,footingsWithinDemoLimit:foundations.every(x=>x.pass),navigationAirClearancePass:this.ships.every(s=>{const lane=this.shipLanes.find(x=>x.id===s.laneId);return this.clearance(s,lane).passable!==false}),engineeringVerified:false};
  return {clockSeconds:this.clock,stability,road:this.road.export(),rail:this.rail.export(),roadSpeedFactor:this.speedFactor('road'),railSpeedFactor:this.speedFactor('rail'),shipSpeedFactor:this.speedFactor('ship'),cars:this.carAgents.length,trains:this.trains.length,ships:this.ships.length,carsCompleted:this.stats.carsCompleted,trainArrivals:this.stats.trainArrivals,trainDepartures:this.stats.trainDepartures,trainWaitingSeconds:this.stats.trainWaitingSeconds,shipCompleted:this.stats.shipCompleted,shipBlocked:this.stats.shipBlocked,maxDeflectionM:bridge.maxDeflectionM,bridgeUtilization:bridge.utilization,maxFoundationUtilization,night:this.weather.night,weather:copy(this.weather),navLaneCount:this.shipLanes.length,foundationCount:this.foundations.length,designVerified:false};}
 export(){return {format:'TrussLab-InfrastructureSim',version:1,clock:this.clock,agentCap:this.agentCap,trafficFlowCarsPerMinute:this.trafficFlowCarsPerMinute,autoTraffic:this.autoTraffic,nextCarSpawn:this.nextCarSpawn,seed:this.seed,weather:copy(this.weather),stats:copy(this.stats),bridge:copy(this.bridge),carAgents:copy(this.carAgents),trainSchedules:copy(this.trainSchedules),trains:copy(this.trains),shipLanes:copy(this.shipLanes),ships:copy(this.ships),signals:copy(this.signals),foundations:copy(this.foundations),scenarios:copy(this.scenarios),nextId:this.nextId};}
 import(o){if(!o||o.format!=='TrussLab-InfrastructureSim'||o.version!==1)throw Error('Неподдерживаемый формат InfrastructureSim');
  const keys={carAgents:250,trainSchedules:50,trains:30,shipLanes:30,ships:20,signals:2000,foundations:1000,scenarios:30};for(const [k,n] of Object.entries(keys))if(!Array.isArray(o[k])||o[k].length>n)throw Error('Превышен лимит импорта '+k);
  if(!finite(o.clock)||o.clock<0||!finite(o.seed)||!finite(o.agentCap))throw Error('Некорректная симуляция');this.setWeather(o.weather);
  for(const k of Object.keys(keys))this[k]=copy(o[k]);this.stats=copy(o.stats);this.bridge=copy(o.bridge);this.clock=o.clock;this.seed=o.seed>>>0;this.agentCap=clamp(Math.round(o.agentCap),1,250);this.trafficFlowCarsPerMinute=clamp(Number(o.trafficFlowCarsPerMinute)||0,0,120);this.autoTraffic=!!o.autoTraffic;this.nextCarSpawn=Number(o.nextCarSpawn)||this.clock;this.nextId=Number(o.nextId)||0;this.rebuild(true);return this.report();}
}
root.TrussLabInfrastructureSim=InfrastructureSim;root.TrussLabInfrastructureGraph=Graph;root.TrussLabInfrastructureSoils=SOILS;
})(typeof globalThis!=='undefined'?globalThis:this);
