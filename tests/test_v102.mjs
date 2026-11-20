import assert from 'node:assert/strict';
import {parseCityGeoJSON,triangulateRing} from '../js/geocity.js';
import {sceneToGeo} from '../js/georef.js';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const no=()=>{};
const ctx={fillRect:no,beginPath:no,stroke:no,fill:no,moveTo:no,lineTo:no,clearRect:no,arc:no,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:no}),setTransform:no};
globalThis.document={createElement:()=>({getContext:()=>ctx})};globalThis.window={addEventListener:no};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>2500};
const canvas={clientWidth:1000,clientHeight:680,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:no};
const w=new World3D(canvas);w.renderSoftware=no;
const sc=BRIDGES.find(t=>t.id==='kerch'),state={id:'kerch',track:'bridge',soil:sc.soil,span:sc.span,model:makeBridge(sc)};
w.start(state);w.loadGeoPack(BUILTIN_GEOPACK);w.setRouteExtents({x0:-160.5,x1:156});w.setCoastMode('osm');w.render(state,true);
const c=([x,z])=>{const o=sceneToGeo(x,z);return [o.lon,o.lat]};
const poly=[[-147,-82],[-142,-82],[-142,-79],[-145,-79],[-145,-76],[-147,-76],[-147,-82]];
const roof=triangulateRing(poly.slice(0,-1));assert.equal(roof.length,4,'concave L-shaped footprint should triangulate into 4 triangles');
const fc={type:'FeatureCollection',name:'test WGS84 real-geometry sample',features:[
 {type:'Feature',properties:{building:'yes','building:levels':3},geometry:{type:'Polygon',coordinates:[poly.map(c)]}},
 {type:'Feature',properties:{type:'building',height:18},geometry:{type:'Polygon',coordinates:[[[-152,-75],[-150,-75],[-150,-73],[-152,-73],[-152,-75]].map(c)]}},
 {type:'Feature',properties:{highway:'residential'},geometry:{type:'LineString',coordinates:[[-153,-78],[-143,-78]].map(c)}},
 {type:'Feature',properties:{railway:'rail'},geometry:{type:'LineString',coordinates:[[-151,-76],[-149,-75]].map(c)}},
 {type:'Feature',properties:{building:'yes'},geometry:{type:'Polygon',coordinates:[poly.map(c),[[-146,-81],[-145.5,-81],[-145.5,-80],[-146,-80],[-146,-81]].map(c)]}},
]};
const q=parseCityGeoJSON(fc);
assert.equal(q.report.buildings,2);assert.equal(q.report.roads,1);assert.equal(q.report.rails,1);assert.equal(q.report.holes,1);assert.equal(q.report.estimatedHeights,0);
assert(q.report.tiles>=1);assert(q.report.coords>0);
const buildings=q.items.filter(x=>x.kind==='building');assert(Math.abs(buildings[0].heightM-9.6)<.1);assert.equal(buildings[1].heightM,18);
const before=w.staticBuilds,dem=w.sampleDEMMetres(-147,-82),source=w.geoPackSource;
let report=w.loadCityGeoJSON(fc);assert.equal(report.buildings,2);
const originalMapHeight=w.mapHeight.bind(w),originalGeoPack=w.geoPack;w.mapHeight=()=>3;w.geoPack=null;const mesh=w.cityTileGeometry(q.items);assert(mesh.a.length>300);
let alloc=0,uploads=0,deleted=0;
w.gl={ARRAY_BUFFER:1,STATIC_DRAW:2,createBuffer:()=>({id:++alloc}),bindBuffer:no,bufferData:()=>{uploads++},deleteBuffer:()=>{deleted++}};
w.software=false;w.map=true;w.camPos=[-145,22,-78];
assert(w.streamCity());const uploadCount=uploads;assert(uploadCount>0);assert(w.cityVisible.some(t=>t.count>0));
assert.equal(w.streamCity(),false);assert.equal(uploads,uploadCount,'a camera-stationary tile must not upload again');
const arr=Array.from(q.tiles.values()).flat();assert.equal(arr.length,4);
w.cityEnabled=false;w.streamCity();assert.equal(w.cityVisible.length,0);
w.cityEnabled=true;const copy={type:'FeatureCollection',features:[{type:'Feature',properties:{building:'yes'},geometry:{type:'Polygon',coordinates:[[[-144,-70],[-143,-70],[-143,-69],[-144,-69],[-144,-70]].map(c)]}}]};
report=w.loadCityGeoJSON(copy,{append:true});assert.equal(report.buildings,3);assert(deleted>=1,'replacing imported city releases GPU tile buffer');
w.mapHeight=originalMapHeight;w.geoPack=originalGeoPack;
assert.equal(w.staticBuilds,before);assert.strictEqual(w.geoPackSource,source);assert.equal(w.sampleDEMMetres(-147,-82),dem,'DEM not modified by city import');
assert.throws(()=>parseCityGeoJSON({type:'FeatureCollection',features:new Array(16001).fill(null)}),/Слишком много/);
console.log('PASS 10.2: 2D GIS polygons & transport, concave triangulation, holes skipped, WGS84 transform, static independent tile buffers, culling/append, OSM/DEM preserved.');
