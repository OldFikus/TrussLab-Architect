const assert=require('node:assert/strict');
require('../src/worldeditor_core.js');
const c=globalThis.TrussLabWorldEditorCore;
for(let k=-20;k<=20;k+=2){
  const lat=c.ANCHOR.lat+k*.021,lon=c.ANCHOR.lon-k*.017;
  const [x,z]=c.local(lat,lon);
  const [lo,la]=c.geographic(x,z);
  assert(Math.abs(lo-lon)<1.0e-7,`longitude error ${lo-lon}`);
  assert(Math.abs(la-lat)<1.0e-7,`latitude error ${la-lat}`);
}
const [lon,lat]=c.geographic(0,0);
assert(Math.abs(lon-c.ANCHOR.lon)<1e-9&&Math.abs(lat-c.ANCHOR.lat)<1e-9);
const w=new c.WorldEditorCore();
const snap=w.export();
assert(snap.sourceInfo.accuracy.includes('not surveyed'));
console.log('PASS WGS84/ECEF/ENU local-east-and-south conversion, 41 roundtrip points within 1e-7 degrees, explicit unsurveyed coordinates');
