/**
 * TrussLab WGS84 reference transform (approximate, not survey data).
 * The reference anchor is the user-provided map location at the Kerch approach.
 * Local scene units map to 80 metres, and the main axis is turned toward SE.
 * This produces consistent GPS-style coordinates, but does NOT establish the
 * engineering route, OSM alignment, elevations or authoritative bridge geometry.
 */
export const GEOREF = Object.freeze({
  datum: 'WGS84',
  anchor: Object.freeze({lat:45.308440,lon:36.506491}),
  worldAnchor: Object.freeze({x:-118,z:-8.6447513}),
  metersPerUnit: 80,
  headingDegrees: -24,
  calibration: 'single public map point + approximate visual axis',
  accuracy: 'illustrative; external GIS / survey alignment required'
});
const theta=GEOREF.headingDegrees*Math.PI/180;
const c=Math.cos(theta),s=Math.sin(theta);
const metreLat=111132.92;
const metreLon=111412.84*Math.cos(GEOREF.anchor.lat*Math.PI/180)-93.5*Math.cos(3*GEOREF.anchor.lat*Math.PI/180);
export function sceneToGeo(x,z){
  const dx=(x-GEOREF.worldAnchor.x)*GEOREF.metersPerUnit;
  const dz=(z-GEOREF.worldAnchor.z)*GEOREF.metersPerUnit;
  const east=dx*c-dz*s,north=dx*s+dz*c;
  return {lat:GEOREF.anchor.lat+north/metreLat,lon:GEOREF.anchor.lon+east/metreLon};
}
export function geoToScene(lat,lon){
  const north=(lat-GEOREF.anchor.lat)*metreLat;
  const east=(lon-GEOREF.anchor.lon)*metreLon;
  return {x:GEOREF.worldAnchor.x+(east*c+north*s)/GEOREF.metersPerUnit,
          z:GEOREF.worldAnchor.z+(-east*s+north*c)/GEOREF.metersPerUnit};
}
export function formatLocation(x,z){
  const p=sceneToGeo(x,z);
  return `${p.lat.toFixed(5)}°, ${p.lon.toFixed(5)}° ~`;
}
