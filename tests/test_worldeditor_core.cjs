const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm');
const sandbox={console,Date};sandbox.globalThis=sandbox;
vm.runInNewContext(fs.readFileSync('src/worldeditor_core.js','utf8'),sandbox);
const C=sandbox.TrussLabWorldEditorCore,ed=new C.WorldEditorCore();
// 13.1: local to WGS84, parcel zoning, area, containment.
const geo=ed.geographic(625,420),point=ed.local(geo[1],geo[0]);assert(Math.hypot(point[0]-625,point[1]-420)<.0001);
const parcel=ed.addParcel([[-200,-200],[800,-200],[800,400],[-200,400]],'residential');assert.equal(parcel.area,600000);assert.equal(ed.fitToParcel(0,0)[0].id,parcel.id);assert.equal(ed.fitToParcel(5000,5000).length,0);
// 13.2 author/license catalog.
assert(ed.catalog.length>=8&&ed.catalog.every(x=>x.author&&x.license));const home=ed.addModel('house',50,50);assert(home.author&&home.license);
// 13.3 all route types, no coincident points, vertex snapping.
const r=ed.addPath('road',[[0,0],[300,0]],{width:8});const sidewalk=ed.addPath('sidewalk',[[0,5],[300,5]]),junction=ed.addPath('interchange',[[100,-40],[100,40]]),rail=ed.addPath('rail',[[0,120],[300,120]]),sw=ed.addPath('switch',[[100,120],[150,165]]);assert.equal(ed.snap([2,2],10)[0],0);assert(r.id!==rail.id);
// 13.4 utilities have layers and networks.
for(const network of ['power','water','telecom','sewage'])ed.addPath('utility',[[5,200],[300,220]],{network});assert.equal(ed.objects.filter(x=>x.type==='utility').length,4);
// 13.5 painting does not modify DEM; apply smooth brush layer.
const offset0=ed.terrainOffset(0,0);ed.paintTerrain(0,0,100,4);assert.equal(ed.terrainOffset(0,0),offset0+4);assert.equal(ed.terrainOffset(120,0),0);ed.paintTerrain(0,0,50,2,'lower');assert.equal(ed.terrainOffset(0,0),2);assert(ed.sourceDemImmutable);
// 13.6 modular procedural facades & floors.
ed.setObject(home.id,{facade:'glass',floors:9,material:'glass'});assert.equal(ed.objects.find(x=>x.id===home.id).floors,9);
// 13.7 inherited material & variant & cycle guard.
const child=ed.addModel('house',70,70);ed.setParent(child.id,home.id);ed.setObject(child.id,{inheritMaterial:true});assert.equal(ed.effectiveMaterial(ed.objects.find(x=>x.id===child.id)).color,ed.materials.glass.color);assert.throws(()=>ed.setParent(home.id,child.id),/Циклическая/);ed.setMaterialVariant('glass-blue','glass',{color:'#44aacc'});assert.equal(ed.materials['glass-blue'].base,'glass');
// 13.8 undo/redo, named snapshots, persistence and safe JSON import.
const count=ed.objects.length,history=ed.revision;ed.addModel('office',900,0);assert(ed.undo());assert.equal(ed.objects.length,count);assert(ed.redo());assert.equal(ed.objects.length,count+1);const snap=ed.saveSnapshot('Before GIS');assert.equal(ed.snapshots[snap].label,'Before GIS');
// 13.9 GIS polygons suggest model placements; no insertion without approval.
const toGeo=(x,z)=>ed.geographic(x,z),ring=[[1100,100],[1250,100],[1250,280],[1100,280],[1100,100]].map(p=>toGeo(...p));const fc={type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Test GIS polygon'},geometry:{type:'Polygon',coordinates:[ring]}}]};const prev=ed.objects.length;const batch=ed.collectGIS(fc,'house',35);assert(batch.count>0);assert.equal(ed.objects.length,prev);assert(ed.pendingBatch.length>0);const approved=ed.approveBatch([0,1]);assert.equal(approved,2);assert.equal(ed.objects.length,prev+2);assert.equal(ed.pendingBatch.length,batch.count-2);
// Surveyed import does not get verified status for free.
const p1=toGeo(-8500,-1000),p2=toGeo(8500,-1000);const result=ed.importAlignment({type:'FeatureCollection',features:[{type:'Feature',properties:{mode:'road',source:'unverified user line'},geometry:{type:'LineString',coordinates:[p1,p2]}}]});assert.equal(result.length,1);assert(Math.abs(result[0].length-17000)<1);assert.equal(ed.alignmentAudit()[0].verified,false);
// Snapshot and project roundtrip.
const project=JSON.parse(JSON.stringify(ed.export()));const clone=new C.WorldEditorCore();clone.import(project);assert.equal(clone.objects.length,ed.objects.length);assert.equal(clone.terrain.length,ed.terrain.length);assert.equal(clone.alignment.length,1);assert.deepEqual(JSON.parse(JSON.stringify(clone.summary().counts)),JSON.parse(JSON.stringify(ed.summary().counts)));
// Restores state (parcel etc), no contamination.
ed.addModel('school',222,333);ed.restoreSnapshot(snap);assert.equal(ed.alignment.length,0);assert(ed.objects.length<count+2);
console.log('PASS 13.1–13.9 core: parcels/WGS84/catalog/network/switch/terrain/modules/materials/history/GIS review/alignment/save',JSON.stringify(clone.summary()));
