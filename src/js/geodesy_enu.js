/** GeoCore 11.0 preparation: WGS84 ellipsoid conversions, reusable independent module.
 * ECEF coordinates are metres; ENU is local tangent metres at anchor.
 * No claim about accuracy of the source DEM or placed game objects is implied.
 */
export const WGS84_A=6378137;
export const WGS84_F=1/298.257223563;
export const WGS84_E2=WGS84_F*(2-WGS84_F);
const WG_RAD=Math.PI/180;
function wgValidate(lat,lon,h=0){if(![lat,lon,h].every(Number.isFinite)||lat>90||lat< -90||lon>180||lon< -180||Math.abs(h)>100_000)throw Error('Invalid WGS84 coordinate')}
export function geoToECEF(lat,lon,height=0){wgValidate(lat,lon,height);const p=lat*WG_RAD,l=lon*WG_RAD,s=Math.sin(p),c=Math.cos(p),N=WGS84_A/Math.sqrt(1-WGS84_E2*s*s);
 return {x:(N+height)*c*Math.cos(l),y:(N+height)*c*Math.sin(l),z:(N*(1-WGS84_E2)+height)*s};
}
export function ecefToGeo(x,y,z){if(![x,y,z].every(Number.isFinite)||Math.hypot(x,y,z)<1)throw Error('Invalid ECEF point');
 const r=Math.hypot(x,y),lon=Math.atan2(y,x),e2=WGS84_E2;
 if(r<1e-7)return {lat:(z>=0?90:-90),lon:0,height:Math.abs(z)-WGS84_A*(1-WGS84_F)};
 let lat=Math.atan2(z,r*(1-e2)),height=0;
 for(let k=0;k<12;k++){const s=Math.sin(lat),N=WGS84_A/Math.sqrt(1-e2*s*s);
  height=r/Math.cos(lat)-N;const next=Math.atan2(z+e2*N*s,r);if(Math.abs(next-lat)<1e-15){lat=next;break}lat=next;
 }
 const N=WGS84_A/Math.sqrt(1-e2*Math.sin(lat)**2);height=r/Math.cos(lat)-N;
 return {lat:lat/WG_RAD,lon:lon/WG_RAD,height};
}
export function ecefToENU(point,anchor){const {lat,lon}=anchor;wgValidate(lat,lon,anchor.height??0);
 const a=geoToECEF(lat,lon,anchor.height??0),dx=point.x-a.x,dy=point.y-a.y,dz=point.z-a.z;
 const p=lat*WG_RAD,l=lon*WG_RAD,sp=Math.sin(p),cp=Math.cos(p),sl=Math.sin(l),cl=Math.cos(l);
 return {east:-sl*dx+cl*dy,north:-sp*cl*dx-sp*sl*dy+cp*dz,up:cp*cl*dx+cp*sl*dy+sp*dz};
}
export function enuToECEF(enu,anchor){const {lat,lon}=anchor;wgValidate(lat,lon,anchor.height??0);
 const a=geoToECEF(lat,lon,anchor.height??0),p=lat*WG_RAD,l=lon*WG_RAD,sp=Math.sin(p),cp=Math.cos(p),sl=Math.sin(l),cl=Math.cos(l),e=enu.east,n=enu.north,u=enu.up;
 if(![e,n,u].every(Number.isFinite))throw Error('Invalid ENU point');
 return {x:a.x-sl*e-sp*cl*n+cp*cl*u,y:a.y+cl*e-sp*sl*n+cp*sl*u,z:a.z+cp*n+sp*u};
}
export function geoToENU(lat,lon,height=0,anchor={lat:45.30844,lon:36.506491,height:0}){return ecefToENU(geoToECEF(lat,lon,height),anchor)}
export function enuToGeo(enu,anchor={lat:45.30844,lon:36.506491,height:0}){const {x,y,z}=enuToECEF(enu,anchor);return ecefToGeo(x,y,z)}
/** Local project metric errors can be assessed by measuring ENU directly. */
export function enuDistance(a,b){return Math.hypot(a.east-b.east,a.north-b.north,a.up-b.up)}
