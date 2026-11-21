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
const {inspectTransport}=require('../src/fidelity');
const nodes=[{id:0,x:0,z:0},{id:1,x:10,z:0},{id:2,x:20,z:0}];
const valid={from:1,to:0,length:10,oneWay:true};
assert.deepEqual(inspectTransport({nodes,edges:[valid,valid,{from:0,to:9,length:10}]}),
  {length:20,components:2,invalid:1,duplicates:1,edges:3});
const {neutralFootprints}=require('../src/fidelity');
const polygon={type:'Polygon',coordinates:[[[0,0],[1,0],[0,1],[0,0]]]};
const neutral=neutralFootprints([{f:{geometry:polygon,properties:{building:'yes',owner:'private',parcel_id:123}}},
  {f:{geometry:polygon,properties:{landuse:'residential'}}}]);
assert.deepEqual(neutral.features.map(f=>f.properties),[{kind:'building'},{kind:'block'}]);
assert.deepEqual(neutral.features[0].geometry,polygon);
const historic={properties:{fidelity:{history:[
  {kind:'gis',date:'2011-04-01',state:'фундамент'},
  {kind:'photo',date:'2013-02-29',state:'ошибка даты'},
  {kind:'scan',date:'2020-01-01',state:'реконструкция'}
]}}};
assert.equal(fidelityRecord(historic,null,'2014-01-01').state,'фундамент');
assert.equal(fidelityRecord(historic,null,'2009-01-01').quality,'missing');
assert.equal(fidelityRecord(historic,null).kind,'scan');
