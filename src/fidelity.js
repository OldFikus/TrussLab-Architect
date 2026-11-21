const FIDELITY_KINDS=Object.freeze({gis:'GIS',photo:'Фотография',scan:'Скан',model:'Модель',fiction:'Вымысел',unknown:'Нет данных'});
function validEvidenceDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');
  return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value;
}
function fidelityRecord(feature,region,asOf='') {
  const p=feature?.properties||{},source=region?.layers?.vector||region?.source;
  const base=p.fidelity||{};
  const timeline=[base,...(Array.isArray(base.history)?base.history.slice(0,500):[])].filter(v=>v&&validEvidenceDate(v.date)).sort((a,b)=>a.date.localeCompare(b.date));
  const cutoff=validEvidenceDate(asOf)?asOf:'9999-12-31';
  const evidence=timeline.filter(v=>v.date<=cutoff).at(-1)||(asOf?{}:base);
  if(asOf&&!evidence.date)return {name:String(p.name||'Объект'),kind:'unknown',quality:'missing',author:'Нет данных',license:'Нет данных',reference:'',date:'',state:'Нет датированной записи'};

  const kind=Object.hasOwn(FIDELITY_KINDS,evidence.kind)?evidence.kind:source?.quality==='demo'?'fiction':'unknown';
  return {name:String(p.name||p.building||p.highway||p.railway||'Объект'),
    kind,quality:evidence.quality||source?.quality||'missing',author:evidence.attribution||source?.attribution||'Нет данных',
    license:evidence.license||source?.license||'Нет данных',reference:evidence.reference||'',date:evidence.date||'',state:evidence.state||'Не указано'};
}
if(typeof module!=='undefined'&&module.exports)module.exports={fidelityRecord,FIDELITY_KINDS};

function inspectTransport(graph) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])),adj=new Map(graph.nodes.map(n=>[n.id,[]]));
  let invalid=0,duplicates=0,length=0;
  const unique=new Set();
  for(const e of graph.edges){
    const a=nodes.get(e.from),b=nodes.get(e.to);
    if(!a||!b||e.from===e.to||![a.x,a.z,b.x,b.z,e.length].every(Number.isFinite)||e.length<=0){invalid++;continue;}
    const key=(e.oneWay?[e.from,e.to]:[e.from,e.to].sort((x,y)=>x-y)).join('/')+'/'+(e.track??0)+'/'+!!e.oneWay;
    if(unique.has(key))duplicates++;unique.add(key);length+=e.length;
    adj.get(e.from).push(e.to);adj.get(e.to).push(e.from);
  }
  let components=0;const seen=new Set();
  for(const n of graph.nodes){if(seen.has(n.id))continue;
    components++;const stack=[n.id];seen.add(n.id);
    while(stack.length){for(const next of adj.get(stack.pop()))if(!seen.has(next)){seen.add(next);stack.push(next);}}
  }
  return {length,components,invalid,duplicates,edges:graph.edges.length};
}
if(typeof module!=='undefined'&&module.exports)module.exports.inspectTransport=inspectTransport;

function neutralFootprints(items) {
  const features=[];
  for(const {f} of items){
    const g=f?.geometry,p=f?.properties||{};
    if(!g||!['Polygon','MultiPolygon'].includes(g.type))continue;
    const type=p.building?'building':p.landuse||p.place==='neighbourhood'?'block':null;
    if(!type)continue;
    const geometry={type:g.type,coordinates:g.coordinates};
    features.push({type:'Feature',geometry,properties:{kind:type}});
  }
  return {type:'FeatureCollection',features};
}
if(typeof module!=='undefined'&&module.exports)module.exports.neutralFootprints=neutralFootprints;
