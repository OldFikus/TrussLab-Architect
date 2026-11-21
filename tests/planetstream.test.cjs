const assert = require('node:assert/strict');
const {unpackPlanetRegion} = require('../src/planetstream');
const pack = require('../examples/region/index.json');
const index = unpackPlanetRegion(pack);
assert.deepEqual(index.metadata.region.center, pack.center);
assert.equal(unpackPlanetRegion(pack.index), pack.index);
for (const override of [{version:2},{center:[45,90]},{source:null},{bounds:[1,0,0,1]},
                        {id:'../tiles'},{index:null},{name:''}]) {
  assert.throws(() => unpackPlanetRegion({...pack,...override}));
}
const {PlanetCoverage}=require('../src/planetstream');
const many=new Map();
for(let x=-90;x<90;x++)for(let y=-80;y<80;y++)many.set(x+':'+y,{features:2});
const coverage=new PlanetCoverage(many);
const overview=coverage.query(-10000,-10000,10000,10000);
assert.equal(overview.reduce((s,c)=>s+c.tiles,0),many.size);
assert.equal(overview.reduce((s,c)=>s+c.features,0),2*many.size);
assert.ok(overview.length<=96);
assert.equal(coverage.query(200,200,240,240).length,0);
assert.deepEqual(new PlanetCoverage(new Map()).query(0,0,1,1),[]);
