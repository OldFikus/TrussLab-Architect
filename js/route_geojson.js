/**
 * WGS84 route centreline importer for TrussLab Architect 9.4.
 * NEVER infer an engineering alignment from the shoreline mask alone.
 * Expected: one or two long LineStrings, explicitly tagged mode=road/rail/center.
 * Source coordinates remain WGS84; samples use the same georef as GeoPack.
 */
const routeClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function kindFor(properties={}){
 const s=[properties.mode,properties.kind,properties.route_type,properties.railway,properties.highway,
          properties.name,properties.ref].filter(x=>x!==undefined&&x!==null).join(' ').toLowerCase();
 if(/rail|железн|поезд|ж\/д|train|tracks/.test(s))return 'rail';
 if(/road|highway|motorway|авто|автодор|vehicle|дорог/.test(s))return 'road';
 return 'center';
}
function cleanLine(coords,project){
 if(!Array.isArray(coords)||coords.length<2)return null;
 const arr=[];
 for(const p of coords){
  if(!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)continue;
  const v=project(p[1],p[0]);if(!Number.isFinite(v.x)||!Number.isFinite(v.z))continue;
  if(!arr.length||Math.hypot(v.x-arr[arr.length-1][0],v.z-arr[arr.length-1][1])>.03)arr.push([v.x,v.z]);
 }
 if(arr.length<2)return null;
 // A centreline must be approximately single-valued in station X. Reject zigzags/loops.
 if(arr[0][0]>arr[arr.length-1][0])arr.reverse();
 let forward=0,backward=0;
 for(let i=1;i<arr.length;i++){const dx=arr[i][0]-arr[i-1][0];if(dx>=0)forward+=dx;else backward-=dx;}
 if(forward<=0||backward/forward>.12)return null;
 const sorted=arr.filter(p=>p[0]>-210&&p[0]<210&&p[1]>-210&&p[1]<210);
 if(sorted.length<2)return null;
 // Remove tiny backtracking (OSM direction can be imperfect) without sorting corners.
 const samples=[];
 for(const p of sorted)if(!samples.length||p[0]>samples[samples.length-1][0]+.035)samples.push(p);
 if(samples.length<2)return null;
 const span=samples.at(-1)[0]-samples[0][0];
 if(span<30)return null;
 const stride=Math.max(1,Math.ceil(samples.length/4000));
 const simplified=samples.filter((p,i)=>i%stride===0||i===samples.length-1);
 return {points:simplified,span,start:simplified[0][0],end:simplified.at(-1)[0]};
}
export function parseRouteGeoJSON(value,project,{x0=-118,x1=118}={}){
 if(!value||typeof value!=='object')throw Error('Ожидается GeoJSON с LineString.');
 let features=value.type==='FeatureCollection'?value.features:value.type==='Feature'?[value]:[value];
 if(!Array.isArray(features)||features.length>5000)throw Error('Слишком много объектов GeoJSON. Выделите только оси моста.');
 let best={};let accepted=0;
 for(const f of features){
  const geom=f?.geometry||f;
  if(!geom)continue;
  const lines=geom.type==='LineString'?[geom.coordinates]:geom.type==='MultiLineString'?geom.coordinates:[];
  const kind=kindFor(f?.properties||{});
  for(const line of lines){
   const data=cleanLine(line,project);if(!data)continue;
   const overlap=Math.max(0,Math.min(x1,data.end)-Math.max(x0,data.start));
   if(overlap<55)continue;
   accepted++;
   if(!best[kind]||overlap>best[kind].overlap)best[kind]={...data,overlap};
  }
 }
 if(!Object.keys(best).length)throw Error('Не найдена длинная ось моста внутри карты. Требуется GeoJSON LineString WGS84, охватывающий хотя бы 4,4 км по оси X.');
 const width=Math.max(...Object.values(best).map(r=>r.overlap));
 if(width<100)throw Error('Ось слишком короткая для всей трассы. Выберите линию перехода Керчь — Тузла — Тамань, а не отдельный пролёт.');
 return {road:best.road?.points||null,rail:best.rail?.points||null,center:best.center?.points||null,
         information:{accepted,roles:Object.keys(best),width:Math.round(width*80),
                      coordinates:'WGS84 lon,lat',source:value.name||'импорт пользователя',
                      accuracy:'positions depend on existing approximate TrussLab georeference; not surveyed'}};
}
/** Smooth blend near imported route ends to avoid a visible kink. */
export function sampleRouteLine(points,x,fallback,transition=9){
 if(!points||points.length<2)return fallback;
 const first=points[0][0],last=points.at(-1)[0];
 if(x<first||x>last)return fallback;
 let lo=0,hi=points.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid][0]<x)lo=mid;else hi=mid;}
 const p=points[lo],q=points[hi],t=routeClamp((x-p[0])/Math.max(.00001,q[0]-p[0]),0,1);
 const imported=p[1]+(q[1]-p[1])*t;
 const w=routeClamp(Math.min(x-first,last-x)/transition,0,1),s=w*w*(3-2*w);
 return fallback+(imported-fallback)*s;
}
export function lineLengthKm(points,metresPerUnit=80){
 if(!points)return 0;let sum=0;
 for(let i=1;i<points.length;i++)sum+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
 return sum*metresPerUnit/1000;
}
