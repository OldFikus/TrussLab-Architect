import assert from 'node:assert/strict';
import {World3D} from '../js/world3d.js';
import {BRIDGES,makeBridge} from '../js/data.js';
import {sceneToGeo} from '../js/georef.js';
import {parseRouteGeoJSON,sampleRouteLine,lineLengthKm} from '../js/route_geojson.js';
const noop=()=>{};
const ctx={fillRect:noop,beginPath:noop,stroke:noop,fill:noop,moveTo:noop,lineTo:noop,clearRect:noop,arc:noop,createPattern:()=>({}),createLinearGradient:()=>({addColorStop:noop}),setTransform:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.performance={now:()=>1000};
const canvas={clientWidth:960,clientHeight:590,width:0,height:0,style:{display:'block'},getContext:k=>k==='2d'?ctx:null,addEventListener:noop};
const world=new World3D(canvas);world.renderSoftware=noop;
const scenario=BRIDGES.find(b=>b.id==='kerch'),state={id:'kerch',track:'bridge',soil:scenario.soil,span:scenario.span,model:makeBridge(scenario)};
world.start(state);
const bounds=world.kerchBounds();
assert(bounds.archA<0&&bounds.archB<0,'arch reference should be near Kerch-side approach');
const original=world.kerchCenter(0),originalRoad=world.trackCenter(0,bounds.roadSide);
const gpsLine=(side,delta)=>Array.from({length:237},(_,i)=>{
 const x=-118+i,z=world.kerchBaseCenter(x)+side+delta+3*Math.sin(x*.033),g=sceneToGeo(x,z);
 return [g.lon,g.lat];
});
const fc={type:'FeatureCollection',features:[
 {type:'Feature',properties:{mode:'road',name:'Test road / synthetic'},geometry:{type:'LineString',coordinates:gpsLine(bounds.roadSide,4)}},
 {type:'Feature',properties:{mode:'rail',name:'Test rail / synthetic'},geometry:{type:'LineString',coordinates:gpsLine(bounds.railSide,-2)}}
]};
const imported=world.loadRouteGeoJSON(fc);
assert.deepEqual(imported.roles.sort(),['rail','road']);
assert(imported.width>18000&&imported.width<20000,'reported geographic corridor length');
assert(Math.abs(world.trackCenter(0,bounds.roadSide)-(world.kerchBaseCenter(0)+bounds.roadSide+4))<.015);
assert(Math.abs(world.trackCenter(0,bounds.railSide)-(world.kerchBaseCenter(0)+bounds.railSide-2))<.015);
assert(Math.abs(world.kerchCenter(0)-original-1)<.015,'midpoint of road+rail should define shared base');
assert(Math.abs(world.trackCenter(0,bounds.roadSide)-originalRoad)>3.9,'road track shifted with imported axis');
assert(world.sceneDirty,'route import must invalidate terrain and 3D meshes');
const geo=world.exportRouteGeoJSON();assert.equal(geo.features.length,2);assert.equal(geo.features[0].geometry.coordinates.length,237);
assert(Math.abs(geo.features[0].geometry.coordinates[118][0]-sceneToGeo(0,world.trackCenter(0,bounds.roadSide)).lon)<1e-6);
assert(world.setRouteOffset(6,1.5));assert(Math.abs(world.trackCenter(0,bounds.roadSide)-(world.kerchBaseCenter(0)+bounds.roadSide+5.5))<.015);
assert(world.routeLengthKm()>18&&world.routeLengthKm()<22);
world.resetRoute();
world.render(state,true);assert(world.mesh.a.length>100000&&world.mesh.a.every(Number.isFinite));
let vertices=world.count,builds=world.staticBuilds;world.tick(1000);world.tick(1300);
assert.equal(world.staticBuilds,builds,'dynamic traffic cannot rebuild detailed bridge');
assert.equal(world.count,vertices);
// Imported shore has only x>0 land: both lines cross one coast, and DEM layer is unchanged.
const N=32;const coast=new Uint8Array(N*N),dem=new Int16Array(N*N).fill(125);
for(let j=0;j<N;j++)for(let i=0;i<N;i++)coast[j*N+i]=i>N/2?255:0;
const pack={type:'TrussLabGeoPack',version:1,gridSize:N,sceneSize:420,
 coast:{encoding:'uint8/base64',data:Buffer.from(coast).toString('base64')},
 dem:{encoding:'int16le/base64',data:Buffer.from(dem.buffer).toString('base64'),scaleMetres:.1,noData:-32768}};
world.loadGeoPack(pack);let height=world.sampleDEMMetres(45,15);assert.equal(height,12.5);
const diagnostics=world.routeCoastDiagnostics();assert(diagnostics.ok);
for(const type of ['road','rail']){
 const a=diagnostics.tracks[type];assert.equal(a.startLand,false);assert.equal(a.endLand,true);assert.equal(a.shoreCrossings,1);
}
assert(world.clearRouteGeoJSON()===undefined);assert.equal(world.geoRoute,null);
assert(Math.abs(world.kerchCenter(0)-original)<1e-9);assert.equal(world.sampleDEMMetres(45,15),height);
assert.equal(world.coastMode,'osm');
// Reject disconnected, narrow and geographically absurd candidates; no silent fallback to invented survey.
assert.throws(()=>world.loadRouteGeoJSON({type:'FeatureCollection',features:[]}),/Не найдена/);
const short={type:'LineString',coordinates:gpsLine(bounds.roadSide,0).slice(70,85)};
assert.throws(()=>world.loadRouteGeoJSON(short),/Не найдена/);
const bad={type:'LineString',coordinates:[[1000,1000],[1001,1001]]};
assert.throws(()=>world.loadRouteGeoJSON(bad),/Не найдена/);
assert.equal(world.geoRoute,null);
const p=sampleRouteLine([[0,5],[100,15]],50,-5);
assert(Math.abs(p-10)<1e-9);assert.equal(sampleRouteLine([[0,5],[100,15]],-1,-5),-5);
assert(lineLengthKm([[0,0],[100,0]])===8);
console.log('PASS 9.4: WGS84 independent road+rail route import, arch relocation, map diagnostics, GeoJSON export, DEM unchanged, traffic cached');
