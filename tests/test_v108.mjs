import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeGLB,buildGLBInstance} from '../js/glb_loader.js';
import {RegionAssetStream} from '../js/region_assets.js';
import {parseGeoPack} from '../js/geopack.js';
import {BUILTIN_GEOPACK} from '../js/bundled_geopack.js';
const pack=parseGeoPack(BUILTIN_GEOPACK);
for(const type of ['lighthouse','crane','warehouse'])for(const detail of ['high','low']){ const a=readFileSync(new URL(`../assets/models/${type}_${detail}.glb`,import.meta.url));
 const m=decodeGLB(new Uint8Array(a));
 assert(m.triangles>10,`${type} ${detail} triangles`);
 assert.equal(m.groups.reduce((s,g)=>s+g.triangles,0),m.triangles);
 const r=buildGLBInstance(m,{x:17,y:32,z:9,yaw:.3,scale:1.4});
 assert(r.array.every(Number.isFinite));assert.equal(r.count,3*m.triangles);
}
const stream=new RegionAssetStream(pack);
assert.equal(stream.catalog.size,3);
assert(stream.instances.length>=3,'Demo GLB assets on measured dry ground');
const nearby=stream.cellsNear(mercatorX(36.4702),mercatorY(45.32503),1800);
assert(nearby.length>0);
let built=0;
for(const c of nearby){const mesh=stream.buildCell(c.tx,c.ty,{detail:'high'});if(mesh){assert(mesh.array.length>0);assert(mesh.array.every(Number.isFinite));assert.equal(mesh.array.length,mesh.count*7);built++;}}
assert(built>=1,'Asset mesh batch generated from GLB');
const json=stream.exportPlacements();assert.equal(json.assets.length,stream.instances.length);
const other=new RegionAssetStream(pack,{seedDemo:false});assert.equal(other.importPlacements(json),json.assets.length);
assert.equal(other.instances.length,stream.instances.length);
const id=other.instances.at(-1).id;assert(other.remove(id));assert.equal(other.instances.length,stream.instances.length-1);
const bad=readFileSync(new URL('../assets/models/lighthouse_high.glb',import.meta.url));
const broken=new Uint8Array(bad);broken[0]=0;
assert.throws(()=>decodeGLB(broken),/GLB/);
assert.throws(()=>decodeGLB(new Uint8Array(22_000_000)),/GLB/);
assert.throws(()=>stream.add({assetId:'lighthouse',lon:0,lat:0}),/известную сушу/);
const duplicate=stream.instances[0];assert(duplicate.source.includes('synthetic'));
console.log(`PASS 10.8: 6 original GLB 2.0 assets, ${stream.instances.length} dry-land instances, ${built} GPU mesh batches, limits, export/import`);
function mercatorX(lon){return 6378137*lon*Math.PI/180}
function mercatorY(lat){return 6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))}
