const assert=require('node:assert/strict');
const {fidelityRecord,FIDELITY_KINDS}=require('../src/fidelity');
for(const kind of ['gis','photo','scan','model','fiction']){
  const rec=fidelityRecord({properties:{fidelity:{kind,reference:'archive'}}});
  assert.equal(rec.kind,kind);assert.equal(rec.reference,'archive');assert.equal(rec.quality,'missing');
}
assert.equal(fidelityRecord({},{}).kind,'unknown');
assert.equal(fidelityRecord({},{source:{quality:'demo'}}).kind,'fiction');
assert.equal(fidelityRecord({properties:{fidelity:{kind:'toString'}}}).kind,'unknown');
assert.equal(Object.keys(FIDELITY_KINDS).length,6);
