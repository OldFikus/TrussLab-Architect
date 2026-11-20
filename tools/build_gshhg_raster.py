"""Generate compact 512x512 raster land/water mask from locally installed GSHHG intermediate-resolution Basemap geometry.
The generated product is an approximate regional raster, NOT survey coastline or DEM.
GSHHG © Wessel and Smith, data distributed under LGPL >=2.2.2; see https://www.soest.hawaii.edu/wessel/gshhg/
"""
from pathlib import Path
import math,base64
from PIL import Image,ImageDraw,ImageFilter
from mpl_toolkits.basemap import Basemap
ROOT=Path(__file__).resolve().parent.parent
N=512;S=420; anchor_lat=45.308440;anchor_lon=36.506491;world_x=-118;world_z=-8.6447513;meters_per=80;heading=math.radians(-24)
cos=math.cos(heading);sin=math.sin(heading)
mlat=111132.92;mlon=111412.84*math.cos(math.radians(anchor_lat))-93.5*math.cos(math.radians(3*anchor_lat))
def pixel(lon,lat):
    north=(lat-anchor_lat)*mlat;east=(lon-anchor_lon)*mlon
    x=world_x+(east*cos+north*sin)/meters_per; z=world_z+(-east*sin+north*cos)/meters_per
    return round((x/S+.5)*N),round((z/S+.5)*N)
m=Basemap(projection='cyl',llcrnrlon=36.0,urcrnrlon=37.2,llcrnrlat=44.95,urcrnrlat=45.65,resolution='i')img=Image.new('L',(N,N),0);draw=ImageDraw.Draw(img)
for p in m.landpolygons:
    pts=[pixel(lon,lat) for lon,lat in p.get_coords()]
    if len(pts)>2:draw.polygon(pts,fill=255)
for p in m.lakepolygons:
    pts=[pixel(lon,lat) for lon,lat in p.get_coords()]
    if len(pts)>2:draw.polygon(pts,fill=0)
img=img.filter(ImageFilter.GaussianBlur(1.6))
# Quantization improves RLE; coast heights sampled bilinearly at run time.
img=img.point(lambda v:round(v/16)*16 if v<248 else 255)
img.save(ROOT/'assets'/'gshhg_shoreline_preview.png')
raw=img.tobytes();packed=bytearray()
i=0
while i<len(raw):
    v=raw[i];j=i+1
    while j<len(raw) and raw[j]==v and j-i<65535:j+=1
    count=j-i;packed.extend((count&255,count>>8,v));i=j
enc=base64.b64encode(packed).decode('ascii')
source='''/** GSHHG intermediate-resolution coastline raster. NOT accurate for Tuzla island or narrow waterways.
 * Data attribution: GSHHG / Wessel and Smith, https://www.soest.hawaii.edu/wessel/gshhg/
 * GSHHG LGPL; reproducible generation script: tools/build_gshhg_raster.py
 */
export const GSHHG_GRID_SIZE=512;
const GSHHG_RLE="'''+enc+'''";
let values=null;
function ensureGshhg(){
 if(values)return values;
 const raw=atob(GSHHG_RLE),data=new Uint8Array(GSHHG_GRID_SIZE*GSHHG_GRID_SIZE);
 let offset=0;
 for(let i=0;i+2<raw.length;i+=3){let count=raw.charCodeAt(i)+(raw.charCodeAt(i+1)<<8),v=raw.charCodeAt(i+2);data.fill(v,offset,offset+count);offset+=count}
 if(offset!==data.length)throw Error('Invalid GSHHG raster payload');
 values=data;return values;
}
export function sampleGshhgLand(x,z,size=420){
 const N=GSHHG_GRID_SIZE,a=Math.max(0,Math.min(N-1.000001,(x/size+.5)*(N-1))),b=Math.max(0,Math.min(N-1.000001,(z/size+.5)*(N-1)));
 const i=Math.floor(a),j=Math.floor(b),u=a-i,v=b-j,p=ensureGshhg(),k=j*N+i;
 const a0=p[k]*(1-u)+p[k+1]*u,a1=p[k+N]*(1-u)+p[k+N+1]*u;
 return (a0*(1-v)+a1*v)/255;
}
'''
(ROOT/'js'/'gshhg_data.js').write_text(source,encoding='utf8')
print('GSHHG raster bytes',len(raw),'compressed',len(enc),'landmask area',sum(v>127 for v in raw)/len(raw))
