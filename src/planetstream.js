/* PlanetStream regional package v1. Bounds and centre use WGS84 longitude, latitude. */
function unpackPlanetRegion(raw) {
  if (raw?.type !== 'TrussLabPlanetRegion') return raw;
  if (raw.version !== 1) throw Error('Версия пакета PlanetStream не поддерживается');
  const {id, name, bounds, center, source} = raw;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
    throw Error('Некорректный идентификатор региона');
  if (typeof name !== 'string' || !name.trim() || name.length > 160)
    throw Error('Требуется название региона');
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite))
    throw Error('Неверные границы региона');
  const [west,south,east,north] = bounds;
  if (west < -180 || east > 180 || west >= east || south < -85.05112878 ||
      north > 85.05112878 || south >= north) throw Error('Границы вне области проекции');
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) ||
      center[0] < west || center[0] > east || center[1] < south || center[1] > north)
    throw Error('Центр вне границ региона');
  const validSource=s=>s && ['attribution','license'].every(key=>
    typeof s[key]==='string' && s[key].trim() && s[key].length<=512) &&
    ['confirmed','approximate','demo','missing'].includes(s.quality);
  if(!validSource(source))throw Error('Укажите источник, права и достоверность');
  const layers=raw.layers??{};
  if(typeof layers!=='object'||Array.isArray(layers)||Object.entries(layers).some(([k,v])=>
    !['raster','vector'].includes(k)||!validSource(v)))throw Error('Неверное описание источника слоя');
  if (raw.index?.type !== 'TrussLabRegionIndex') throw Error('Отсутствует индекс тайлов');
  return {...raw.index, metadata:{...raw.index.metadata, region:{id,name,bounds,center,source,layers},
    sources:[source,...Object.values(layers)].map(s=>s.attribution+' · '+s.license)}};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {unpackPlanetRegion};

/* Sparse pyramid. Every occupied cell contributes its feature count to its ancestors. */
class PlanetCoverage {
  constructor(tiles) {
    this.levels = [];
    let cells = tiles;
    while (cells.size && this.levels.length < 24) {
      const next = new Map();
      for (const [key, item] of cells) {
        const [x,y] = key.split(':').map(Number);
        const parent = Math.floor(x/2) + ':' + Math.floor(y/2);
        const current = next.get(parent) || {features:0, tiles:0};
        current.features += item.features;
        current.tiles += item.tiles ?? 1;
        next.set(parent,current);
      }
      this.levels.push(next);
      if ([...next.keys()].every(k => /^(-1|0):(-1|0)$/.test(k))) break;
      cells = next;
    }
  }
  query(x0,y0,x1,y1) {
    let span=1, level=0;
    do {span *= 2; level++;}
    while ((Math.floor(x1/span)-Math.floor(x0/span)+1)*(Math.floor(y1/span)-Math.floor(y0/span)+1)>96 && level<this.levels.length);
    const cells=this.levels[level-1], result=[];
    if (!cells) return result;
    const left=Math.floor(x0/span),right=Math.floor(x1/span),bottom=Math.floor(y0/span),top=Math.floor(y1/span);
    const add=(x,y,cell)=>{if(cell)result.push({x:x*span,y:y*span,span,...cell});};
    if ((right-left+1)*(top-bottom+1)>cells.size) {
      for(const [key,value] of cells){const [x,y]=key.split(':').map(Number);if(x>=left&&x<=right&&y>=bottom&&y<=top)add(x,y,value);}
    } else {
      for(let x=left;x<=right;x++)for(let y=bottom;y<=top;y++)add(x,y,cells.get(x+':'+y));
    }
    return result;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports.PlanetCoverage=PlanetCoverage;

/* Tile vertices stay in their local ENU frame. Only small offsets reach Float32. */
function planetFrame(lat,lon) {
  const phi=lat*Math.PI/180,lambda=lon*Math.PI/180;
  const s=Math.sin(phi),c=Math.cos(phi),sl=Math.sin(lambda),cl=Math.cos(lambda);
  return {anchor:{lat,lon,height:0},basis:[[-sl,cl,0],[-s*cl,-s*sl,c],[c*cl,c*sl,s]]};
}
function planetRotation(tile,camera) {
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  return new Float32Array(tile.basis.flatMap(axis=>camera.basis.map(target=>dot(axis,target))));
}
if(typeof module!=='undefined'&&module.exports)Object.assign(module.exports,{planetFrame,planetRotation});
