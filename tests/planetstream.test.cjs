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
