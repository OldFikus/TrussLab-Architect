import assert from 'node:assert/strict';
import {geoToECEF,ecefToGeo,geoToENU,enuToGeo,enuDistance} from '../js/geodesy_enu.js';
const anchor={lat:45.30844,lon:36.506491,height:0};
for(const [lat,lon,h] of [[45.30844,36.506491,0],[45.32503,36.4702,42],[45.24544,36.59162,8],[44.9,36.1,130],[-45,-120,50],[0,0,10]]){
 const e=geoToECEF(lat,lon,h),back=ecefToGeo(e.x,e.y,e.z);
 assert(Math.abs(back.lat-lat)<1e-9,`ECEF latitude ${lat}`);assert(Math.abs(back.lon-lon)<1e-9);
 assert(Math.abs(back.height-h)<1e-4);
 const local=geoToENU(lat,lon,h,anchor),geo=enuToGeo(local,anchor);
 assert(Math.abs(geo.lat-lat)<1e-9);assert(Math.abs(geo.lon-lon)<1e-9);assert(Math.abs(geo.height-h)<1e-4);
}
const center=geoToENU(anchor.lat,anchor.lon,0,anchor);assert(enuDistance(center,{east:0,north:0,up:0})<1e-6);
const east=geoToENU(45.30844,36.516491,0,anchor);assert(east.east>750&&east.east<820);
assert.throws(()=>geoToECEF(100,0),/Invalid/);
console.log('PASS GeoCore pre-11.0: WGS84 ECEF ENU reversible across Kerch, Tuzla, other latitudes; centimetre-level maths (not survey accuracy)');
