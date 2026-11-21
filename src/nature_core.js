/* TrussLab NatureWorld 16.1–16.9. Procedural, local, and clearly fictional.
   No original DEM or Kerch geo imagery modified. Deterministic and bounded.
   API is useful in offline HTML and Node.js without DOM / GPU. */
(function(root){'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x)=>Number.isFinite(x);
const smooth=(x)=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
const copy=(x)=>JSON.parse(JSON.stringify(x));
const mix=(a,b,t)=>a+(b-a)*t;
function hash(a,b,seed=1741){let x=Math.imul((a|0)^seed,0x9e3779b1)^Math.imul((b|0),0x85ebca6b);x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;}
const rnd=(a,b,s=1741)=>hash(a,b,s)/4294967296;
function noise(x,z,seed){const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(x-ix),fz=smooth(z-iz);return lerp(lerp(rnd(ix,iz,seed),rnd(ix+1,iz,seed),fx),lerp(rnd(ix,iz+1,seed),rnd(ix+1,iz+1,seed),fx),fz);}
const WATERTYPES=['lake','river','sea'];
const SOILS=['sand','clay','loam','rock','peat'];
const BIOMES=['meadow','forest','coast','wetland','alpine','barren'];
const BUDGETS={eco:{trees:70,grasses:65,triangles:5500,bytes:600000,range:780},balanced:{trees:230,grasses:220,triangles:16000,bytes:1800000,range:1100},high:{trees:540,grasses:650,triangles:36000,bytes:4100000,range:1450}};
class NatureWorld {
 constructor({seed=1741,environment='fictional'}={}){
  this.seed=seed>>>0;this.environment=environment;this.month=6;this.hour=13;this.elapsedHours=0;
  this.fronts=[{id:'front-1',x:45000,z:45000,radius:2200,windX:1.2,windZ:-.4,precipitation:.42,cloud:.65}];
  this.waterBodies=[];this.nextWaterId=0;this.weatherMode='rain';this.quality='balanced';this.vegetation=true;this.precipitation=true;
  this.stats={lastVegetationMs:0,trees:0,grass:0,triangles:0,bytes:0,dropped:0,waterTriangles:0};
 }
 setQuality(q){if(!BUDGETS[q])throw Error('Недопустимый экологический бюджет');this.quality=q;return BUDGETS[q];}
 setSeason(month){if(!Number.isInteger(month)||month<1||month>12)throw Error('Неверный месяц');this.month=month;}
 setHour(hour){if(!finite(hour)||hour<0||hour>=24)throw Error('Неверное время суток');this.hour=hour;}
 advanceHours(h){if(!finite(h)||h<0||h>24*365)throw Error('Неверный шаг времени');const total=this.hour+h;this.hour=total%24;this.month=1+((this.month-1+Math.floor(total/24/30))%12);this.elapsedHours+=h;}
 get season(){return ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'][this.month-1];}
 light(){const elev=Math.sin((this.hour-6)/12*Math.PI);return {elevation:elev,phase:elev<-.1?'night':elev<.2?'sunset':'day',season:this.season,hour:this.hour};}
 addFront(x,z,{radius=1900,windX=.9,windZ=.5,precipitation=.55,cloud=.7}={}){
  if(![x,z,radius,windX,windZ,precipitation,cloud].every(finite)||radius<80||radius>16000||precipitation<0||precipitation>1||cloud<0||cloud>1)throw Error('Недопустимый погодный фронт');
  if(this.fronts.length>=12)throw Error('Лимит погодных фронтов');const id='front-'+(this.fronts.length+1);this.fronts.push({id,x,z,radius,windX,windZ,precipitation,cloud});return id;
 }
 weatherAt(x,z){if(![x,z].every(finite))throw Error('Координаты погоды');
  const seasonal={winter:-7,spring:10,summer:24,autumn:9}[this.season],diurnal=4*Math.cos((this.hour-14)*Math.PI/12);
  let rain=0,cloud=.20,windX=0,windZ=0;
  for(const f of this.fronts){const cx=f.x+f.windX*this.elapsedHours*180,cz=f.z+f.windZ*this.elapsedHours*180;
   const influence=smooth((f.radius-Math.hypot(x-cx,z-cz))/Math.max(1,f.radius*.65));rain=Math.max(rain,f.precipitation*influence);cloud=Math.max(cloud,f.cloud*influence);windX+=f.windX*influence;windZ+=f.windZ*influence;}
  const temperatureC=seasonal+diurnal-rain*3,humidity=clamp(.26+rain*.72+cloud*.13,0,1);
  const fog=clamp(rain*.58+(humidity>.82?.18:0)+(this.hour<7?.09:0),0,1);
  const windMps=clamp(2.3+Math.hypot(windX,windZ)*6+cloud*2,0,40);
  const snow=temperatureC<=0?rain:0;
  return {rain:rain-snow,snow,precipitation:rain,cloud,humidity,temperatureC,fog,windMps,windX,windZ,visibilityM:Math.round(lerp(8500,450,clamp(fog*.92+rain*.56,0,1))),night:this.light().phase==='night'};
 }
 transportEffects(x,z){const w=this.weatherAt(x,z),icy=w.temperatureC<1&&w.precipitation>.15,road=clamp(1-w.rain*.34-w.snow*.42-w.fog*.21-(icy?.18:0),.25,1),rail=clamp(1-w.rain*.16-w.snow*.25-w.fog*.06-(icy?.07:0),.35,1),ship=clamp(1-w.windMps/90-w.fog*.3,.3,1);
  return {road,rail,ship,visibilityM:w.visibilityM,rain:w.precipitation,snow:w.snow,fog:w.fog,windMps:w.windMps,temperatureC:w.temperatureC,night:w.night};}
 soilAt(x,z,ground){if(![x,z].every(finite)||typeof ground!=='function')throw Error('Некорректная почва');const g=ground(x,z);if(!g?.measured)return {type:'unknown',biome:'barren',measured:false,source:g?.source||'none',confidence:'none'};
  const h=g.height||0,around=[[40,0],[-40,0],[0,40],[0,-40]].map(([dx,dz])=>ground(x+dx,z+dz)?.height??h);
  const slope=Math.max(...around.map(v=>Math.abs(v-h)))/40;
  const moisture=noise(x/1100,z/1100,this.seed+7)*.68+noise(x/250,z/250,this.seed+93)*.32;
  const coast=!g.land||h<3,wet=!coast&&h<15&&moisture>.70;
  const type=coast?'sand':slope>.50?'rock':wet?'peat':moisture>.67?'clay':moisture>.28?'loam':'sand';
  const biome=!g.land?'coast':coast?'coast':slope>.72&&h>42?'alpine':wet?'wetland':moisture>.37&&slope<.44?'forest':h>70?'alpine':'meadow';
  return {type,biome,moisture,slope,height:h,land:!!g.land,measured:true,source:'NatureWorld heuristic, fictional; not soil survey',confidence:'demo'};
 }
 addLake(x,z,radius,{level=null,label='Учебное озеро'}={}){if(![x,z,radius].every(finite)||radius<15||radius>2800||this.waterBodies.length>=80||level!==null&&!finite(level))throw Error('Неверное озеро');const id='lake-'+(++this.nextWaterId);this.waterBodies.push({id,type:'lake',x,z,radius,level,label});return id;}
 addSea(x,z,radius,{level=-.48,label='Условная морская акватория'}={}){if(![x,z,radius].every(finite)||radius<100||radius>5000||this.waterBodies.length>=80||level!==null&&!finite(level))throw Error('Неверная морская область');const id='sea-'+(++this.nextWaterId);this.waterBodies.push({id,type:'sea',x,z,radius,level,label});return id;}
 addRiver(points,{width=27,level=null,label='Учебная река'}={}){if(!Array.isArray(points)||points.length<2||points.length>100||!points.every(p=>p.length===2&&p.every(finite))||!finite(width)||width<2||width>180||this.waterBodies.length>=80||level!==null&&!finite(level))throw Error('Неверное русло');const id='river-'+(++this.nextWaterId);this.waterBodies.push({id,type:'river',points:copy(points),width,level,label});return id;}
 setWaterLevel(id,level){const o=this.waterBodies.find(o=>o.id===id);if(!o||level!==null&&!finite(level))throw Error('Нет такого слоя воды');o.level=level;}
 removeWater(id){const i=this.waterBodies.findIndex(o=>o.id===id);if(i<0)throw Error('Водоём не найден');this.waterBodies.splice(i,1);}
 waterAt(x,z){for(const o of this.waterBodies){if(o.type==='lake'||o.type==='sea'){const d=Math.hypot(x-o.x,z-o.z);if(d<=o.radius)return {type:o.type,distanceToShore:o.radius-d,level:o.level,id:o.id};}
  else if(o.type==='river'){for(let i=1;i<o.points.length;i++){const a=o.points[i-1],b=o.points[i],vx=b[0]-a[0],vz=b[1]-a[1],t=clamp(((x-a[0])*vx+(z-a[1])*vz)/(vx*vx+vz*vz||1),0,1),d=Math.hypot(x-a[0]-vx*t,z-a[1]-vz*t);if(d<o.width*.5)return {type:'river',distanceToShore:o.width*.5-d,level:o.level,id:o.id};}}}
  return null;
 }
 // Stable, camera-independent placement by world grid. Batch at camera radius only;
 // no objects appended to the WorldEditor save for individual grass stems.
 vegetationNear(cx,cz,ground,{limit=BUDGETS[this.quality].trees,range=BUDGETS[this.quality].range,editorObjects=[]}={}){
  if(!this.vegetation||limit<=0)return [];
  const budget=BUDGETS[this.quality],step=this.quality==='high'?60:this.quality==='eco'?92:72,trees=[];
  const ix0=Math.floor((cx-range)/step),ix1=Math.ceil((cx+range)/step),iz0=Math.floor((cz-range)/step),iz1=Math.ceil((cz+range)/step);
  let looked=0;
  for(let ix=ix0;ix<=ix1;ix++)for(let iz=iz0;iz<=iz1;iz++){
   const x=(ix+rnd(ix,iz,this.seed+11)*.78+.12)*step,z=(iz+rnd(ix,iz,this.seed+19)*.78+.12)*step;
   if((x-cx)**2+(z-cz)**2>range*range)continue;
   const site=this.soilAt(x,z,ground);looked++;
   if(!site.land||site.slope>.42||this.waterAt(x,z))continue;
   if(site.biome!=='forest'&&site.biome!=='meadow'&&site.biome!=='wetland')continue;
   if(rnd(ix,iz,this.seed+31)>(site.biome==='forest'?.79:site.biome==='meadow'?.32:.48))continue;
   if(editorObjects.some(o=>{if(o.type!=='building'||!finite(o.wx)||!finite(o.wz))return false;return Math.abs(o.wx-x)<(o.width||20)*.65+8&&Math.abs(o.wz-z)<(o.length||16)*.65+8;}))continue;
   const species=site.biome==='wetland'?'birch':rnd(ix,iz,this.seed+87)<.4?'pine':'oak';
   trees.push({id:ix+':'+iz,x,z,y:ground(x,z).height,biome:site.biome,soil:site.type,species,height:lerp(6,17,rnd(ix,iz,this.seed+47)),size:.7+rnd(ix,iz,this.seed+63)*.6,fromCam:(x-cx)**2+(z-cz)**2});
  }
  // Prioritize visible foreground. Previous grid-order sampling exhausted the cap
  // on the far left of the map and left the player's camera almost treeless.
  trees.sort((a,b)=>a.fromCam-b.fromCam||a.id.localeCompare(b.id));
  return trees.slice(0,limit).map(({fromCam,...rest})=>rest);
 }
 foliage(){return this.season==='autumn'?12:this.season==='winter'?13:this.season==='spring'?11:11;}
 geometryFor(trees,{ground,meshBatch,cam=[0,0],budget=BUDGETS[this.quality]}={}){
  const batch=meshBatch,material=this.foliage();let count=0,grasses=0,dropped=0;
  const tri=(a,b,c,m)=>batch.tri(a,b,c,m),quad=(a,b,c,d,m)=>batch.quad(a,b,c,d,m);
  for(const tree of trees){if(count>=budget.trees)break;
   if(batch.data.length/7/3+9>budget.triangles||batch.data.length*4+9*21*4>budget.bytes){dropped++;continue;}
   const x=tree.x,z=tree.z,y=tree.y,h=tree.height,s=tree.size,rad=h*.26*s;
   // Three-sided taper trunk and crossed canopy sheets, 11–16 tris per tree.
   for(let k=0;k<3;k++){const a=k*Math.PI*2/3,b=(k+1)*Math.PI*2/3;
    tri([x+Math.cos(a)*.45*s,y,z+Math.sin(a)*.45*s],[x+Math.cos(b)*.45*s,y,z+Math.sin(b)*.45*s],[x,y+h*.62,z],9);
   }
   if(tree.species==='pine'){
    for(let j=0;j<2;j++){const yy=y+h*(.38+j*.20),height=h*(.52-j*.10),rr=rad*(1-j*.25);
     for(let k=0;k<4;k++){const a=k*Math.PI*.5,b=(k+1)*Math.PI*.5;tri([x+Math.cos(a)*rr,yy,z+Math.sin(a)*rr],[x+Math.cos(b)*rr,yy,z+Math.sin(b)*rr],[x,yy+height,z],this.season==='winter'?11:material);}
    }
   }else if(this.season!=='winter'){
    for(const a of [0,Math.PI*.5]){const dx=Math.cos(a)*rad,dz=Math.sin(a)*rad;
     quad([x-dx,y+h*.48,z-dz],[x+dx,y+h*.48,z+dz],[x+dx,y+h*.94,z+dz],[x-dx,y+h*.94,z-dz],material);
    }
   }
   // Render a small local understory cluster per anchor. This greatly improves
   // near-camera forest continuity without per-plant JavaScript agents.
   if(this.season!=='winter' && tree.biome==='forest'){
    for(let j=0;j<4;j++){
     if(batch.data.length/21+4>budget.triangles||batch.data.length*4+4*21*4>budget.bytes){dropped++;break;}
     const a=(j*2.39996+rnd(j,Math.round(x),this.seed)*.8),d=4+4*rnd(j,Math.round(z),this.seed+20),px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d,py=ground(px,pz)?.height??y;
     const hh=h*(.45+.15*rnd(j,Math.floor(x),this.seed+20)),rr=rad*.7;
     for(const ang of [0,Math.PI*.5]){const dx=Math.cos(ang)*rr,dz=Math.sin(ang)*rr;
      quad([px-dx,py+hh*.27,pz-dz],[px+dx,py+hh*.27,pz+dz],[px+dx,py+hh,pz+dz],[px-dx,py+hh,pz-dz],material);
     }
    }
   }
   count++;
  }
  const grassStep=this.quality==='high'?21:33;
  const n=Math.min(budget.grasses,Math.ceil(Math.sqrt(budget.grasses))**2),side=Math.ceil(Math.sqrt(n));
  for(let i=0;i<side&&grasses<n;i++)for(let j=0;j<side&&grasses<n;j++){
   const ix=Math.floor((cam[0]-budget.range*.5)/grassStep)+i*3,iz=Math.floor((cam[1]-budget.range*.5)/grassStep)+j*3;
   const x=ix*grassStep+rnd(ix,iz,this.seed+44)*grassStep,z=iz*grassStep+rnd(ix,iz,this.seed+17)*grassStep;
   const site=this.soilAt(x,z,ground);if(!site.land||site.slope>.3||this.waterAt(x,z)||site.biome==='alpine')continue;
   if(batch.data.length/7/3+2>budget.triangles||batch.data.length*4+6*7*4>budget.bytes){dropped++;continue;}
   const y=ground(x,z).height,h=lerp(.7,2.2,rnd(ix,iz,this.seed+66)),w=.35+h*.35,m=site.biome==='wetland'?14:this.season==='autumn'?12:this.season==='winter'?13:11;
   quad([x-w,y,z],[x+w,y,z],[x+w*.1,y+h,z],[x-w*.1,y+h,z],m);grasses++;
  }
  const triangles=batch.data.length/21,bytes=batch.data.length*4;
  this.stats={...this.stats,trees:count,grass:grasses,triangles,bytes,dropped};return {trees:count,grass:grasses,triangles,bytes,dropped};
 }
 waterGeometry(batch,ground,waterLevelOffset=.14){let triangles=0;
  for(const o of this.waterBodies){
   if(o.type==='lake'||o.type==='sea'){const n=32,centerY=o.level??(ground(o.x,o.z)?.height??0)+waterLevelOffset;
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,x=o.x,z=o.z,r=o.radius;
     batch.tri([x,centerY,z],[x+Math.cos(b)*r,centerY,z+Math.sin(b)*r],[x+Math.cos(a)*r,centerY,z+Math.sin(a)*r],3);
     // Sand-colored narrow surf bands at the lake perimeter.
     batch.quad([x+Math.cos(a)*r,centerY+.012,z+Math.sin(a)*r],[x+Math.cos(b)*r,centerY+.012,z+Math.sin(b)*r],
       [x+Math.cos(b)*(r+2.5),centerY+.012,z+Math.sin(b)*(r+2.5)],[x+Math.cos(a)*(r+2.5),centerY+.012,z+Math.sin(a)*(r+2.5)],1);
    }triangles+=n*3;
   }else if(o.type==='river'){
    for(let i=1;i<o.points.length;i++){const a=o.points[i-1],b=o.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l*o.width*.5,nz=dx/l*o.width*.5,ya=o.level??(ground(a[0],a[1])?.height??0)+waterLevelOffset,yb=o.level??(ground(b[0],b[1])?.height??0)+waterLevelOffset;
     batch.quad([a[0]-nx,ya,a[1]-nz],[a[0]+nx,ya,a[1]+nz],[b[0]+nx,yb,b[1]+nz],[b[0]-nx,yb,b[1]-nz],3);triangles+=2;
    }
   }
  }
  this.stats.waterTriangles=triangles;return triangles;
 }
 export(){return {format:'TrussLab-NatureWorld',version:1,seed:this.seed,environment:this.environment,month:this.month,hour:this.hour,elapsedHours:this.elapsedHours,quality:this.quality,vegetation:this.vegetation,precipitation:this.precipitation,weatherMode:this.weatherMode,fronts:copy(this.fronts),waterBodies:copy(this.waterBodies),nextWaterId:this.nextWaterId};}
 import(p){if(!p||p.format!=='TrussLab-NatureWorld'||p.version!==1||!finite(p.seed)||!Number.isInteger(p.month)||p.month<1||p.month>12||!finite(p.hour)||p.hour<0||p.hour>=24||!finite(p.elapsedHours)||p.elapsedHours<0||p.elapsedHours>1e8||!BUDGETS[p.quality]||!Array.isArray(p.waterBodies)||p.waterBodies.length>80||!Array.isArray(p.fronts)||p.fronts.length>12)throw Error('Формат NatureWorld несовместим');
  const tmp=new NatureWorld({seed:p.seed,environment:p.environment});tmp.month=p.month;tmp.hour=p.hour;tmp.weatherMode=['clear','cloud','rain','storm','snow'].includes(p.weatherMode)?p.weatherMode:'rain';tmp.elapsedHours=p.elapsedHours;tmp.quality=p.quality;tmp.vegetation=p.vegetation!==false;tmp.precipitation=p.precipitation!==false;tmp.fronts=[];for(const f of p.fronts)tmp.addFront(f.x,f.z,f);
  tmp.waterBodies=[];for(const o of p.waterBodies){if(o.type==='lake')tmp.addLake(o.x,o.z,o.radius,{level:o.level,label:o.label});else if(o.type==='sea')tmp.addSea(o.x,o.z,o.radius,{level:o.level,label:o.label});else if(o.type==='river')tmp.addRiver(o.points,{width:o.width,level:o.level,label:o.label});else throw Error('Неизвестный тип воды');tmp.waterBodies.at(-1).id=String(o.id||tmp.waterBodies.at(-1).id);}
  tmp.nextWaterId=Math.max(tmp.nextWaterId,p.nextWaterId||0,...tmp.waterBodies.map(o=>Number(o.id.match(/-(\d+)$/)?.[1])||0));
  Object.assign(this,{nextWaterId:tmp.nextWaterId,seed:tmp.seed,environment:tmp.environment,month:tmp.month,hour:tmp.hour,elapsedHours:tmp.elapsedHours,quality:tmp.quality,vegetation:tmp.vegetation,precipitation:tmp.precipitation,weatherMode:tmp.weatherMode,fronts:tmp.fronts,waterBodies:tmp.waterBodies});
 }
}
root.TrussLabNatureCore={NatureWorld,BUDGETS,SOILS,BIOMES,WATERTYPES,hash,noise,clamp};
})(typeof globalThis!=='undefined'?globalThis:this);
