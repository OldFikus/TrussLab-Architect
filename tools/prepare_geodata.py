#!/usr/bin/env python3
"""Prepare TrussLabGeoPack v1 from REAL OSM coastline ways and Copernicus GLO-30 GeoTIFF.

Running --download requires internet on YOUR machine; no account is needed for the
public S3 elevation tile. No map imagery is scraped from Google.

Example:
  python tools/prepare_geodata.py --download --output data/kerch_geopack.json
  python tools/prepare_geodata.py --osm-json downloads/osm_coast.json \
      --dem-tif downloads/Copernicus_DSM_COG_10_N45_00_E036_00_DEM.tif \
      --output data/kerch_geopack.json

The rasterization approximates the land/water side of nearest OSM coastline ways;
any broken OSM chains may cause local misclassification. Check coast preview.
This is NOT a surveyed bridge or a replacement for hydrographic/bathymetric data.
"""
from __future__ import annotations
import argparse, base64, datetime as dt, json, math, sys, urllib.parse, urllib.request
from pathlib import Path
import numpy as np

SCENE=420.0
N=512
LAT0=45.308440
LON0=36.506491
AX=-118.0
AZ=-8.6447513
MPP=80.0
HEADING=math.radians(-24)
C=math.cos(HEADING)
S=math.sin(HEADING)
METRE_LAT=111132.92
METRE_LON=111412.84*math.cos(math.radians(LAT0))-93.5*math.cos(3*math.radians(LAT0))
BBOX=(45.02,36.24,45.55,36.98)  # Overpass (south, west, north, east); expanded outside scene.
S3='https://copernicus-dem-30m.s3.amazonaws.com'
TILE='Copernicus_DSM_COG_10_N45_00_E036_00_DEM'
DEM_URL=f'{S3}/{TILE}/{TILE}.tif'
USER_AGENT='TrussLabArchitectGeodata/9.3 (offline educational visualization; OSM attribution included)'

def geo_to_scene(lats, lons):
    east=(np.asarray(lons)-LON0)*METRE_LON
    north=(np.asarray(lats)-LAT0)*METRE_LAT
    return AX+(east*C+north*S)/MPP, AZ+(-east*S+north*C)/MPP

def scene_to_geo(xx, zz):
    dx=(xx-AX)*MPP
    dz=(zz-AZ)*MPP
    east=dx*C-dz*S
    north=dx*S+dz*C
    return LAT0+north/METRE_LAT,LON0+east/METRE_LON

def grid_centers():
    v=(-SCENE/2)+(np.arange(N)+.5)*SCENE/N
    return np.meshgrid(v, v)

def download_with_limit(url: str, target: Path, limit_mb: int=250, data: bytes|None=None,
                        timeout: int=80, attempts: int=2, validate=None):
    """Download atomically and reuse cache, but reject HTML/error payloads cached as JSON.

    An unreachable Overpass server must never prevent a separate DEM download.
    """
    import time
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.is_file() and target.stat().st_size>100:
        if validate is None or validate(target):
            print('Кэш:',target)
            return target
        print('ВНИМАНИЕ: неверный файл в кэше, повторяем загрузку:',target,file=sys.stderr)
        target.unlink()
    print('Загрузка:',url.split('?')[0][:125],flush=True)
    last=None
    for attempt in range(attempts):
        tmp=target.with_suffix(target.suffix+'.part')
        try:
            request=urllib.request.Request(url,data=data,headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request,timeout=timeout) as response, tmp.open('wb') as out:
                size=0
                while True:
                    chunk=response.read(1024*1024)
                    if not chunk:break
                    size+=len(chunk)
                    if size>limit_mb*1024*1024:raise ValueError('Файл слишком большой (лимит '+str(limit_mb)+' МБ).')
                    out.write(chunk)
            if size<100:raise ValueError('Пустой или слишком маленький ответ')
            if validate is not None and not validate(tmp):
                raise ValueError('Ответ сервера не содержит OSM coastline (возможна HTML-ошибка 502/504)')
            tmp.replace(target)
            print(f'  записано: {size/1024/1024:.1f} МБ')
            return target
        except Exception as exc:
            last=exc
            tmp.unlink(missing_ok=True)
            print(f'  попытка {attempt+1}/{attempts} неудачна: {exc}',file=sys.stderr)
            if attempt+1<attempts:time.sleep(2)
    raise RuntimeError(str(last))

def valid_overpass_json(path:Path):
    try:
        data=json.loads(path.read_text(encoding='utf8'))
        return isinstance(data,dict) and isinstance(data.get('elements'),list) and any(
            isinstance(el,dict) and len(el.get('geometry',[]))>1 for el in data['elements'])
    except (ValueError,OSError,UnicodeError,TypeError):
        return False

def download_osm(cache:Path,timeout:int=25):
    south,west,north,east=BBOX
    query=f'[out:json][timeout:60];way["natural"="coastline"]({south},{west},{north},{east});out geom;'
    data=urllib.parse.urlencode({'data':query}).encode()
    target=cache/'osm_coastline_kerch_overpass.json'
    # Small, public endpoints have no SLA. Skip if busy; import local OSM later.
    endpoints=('https://overpass.private.coffee/api/interpreter',
               'https://overpass.kumi.systems/api/interpreter',
               'https://overpass-api.de/api/interpreter')
    for endpoint in endpoints:
        try:
            return download_with_limit(endpoint,target,20,data,timeout=timeout,
                                       attempts=1,validate=valid_overpass_json)
        except Exception as exc:
            print('  Overpass недоступен:',str(exc)[:180],file=sys.stderr)
    print('ВНИМАНИЕ: OSM сейчас недоступен; продолжаем с Copernicus DEM.',file=sys.stderr)
    print('После загрузки DEM можно добавить OSM отдельно через --osm-only.',file=sys.stderr)
    return None

def read_coastline_points(file:Path):
    data=json.loads(file.read_text(encoding='utf8'))
    features=[]
    if isinstance(data,dict) and 'elements' in data:
        for item in data['elements']:
            geom=item.get('geometry',[])
            if len(geom)>1:
                features.append([(q['lon'],q['lat']) for q in geom if 'lon' in q and 'lat' in q])
    else:
        array=data.get('features',[]) if data.get('type')=='FeatureCollection' else [data]
        for f in array:
            geom=f.get('geometry',f)
            if geom.get('type')=='LineString':features.append(geom['coordinates'])
            if geom.get('type')=='MultiLineString':features.extend(geom['coordinates'])
    if not features:raise ValueError('Нет OSM coastline ways (LineString/MultiLineString или Overpass geometry).')
    return features

def rasterize_osm(path:Path):
    from scipy.spatial import cKDTree
    lines=read_coastline_points(path)
    points=[]; directions=[]; segs=0
    half=SCENE/2
    for line in lines:
        arr=np.asarray(line,dtype=float)
        if arr.ndim!=2 or arr.shape[1]<2 or len(arr)<2:continue
        x,z=geo_to_scene(arr[:,1],arr[:,0])
        for a,b in zip(np.column_stack((x,z))[:-1],np.column_stack((x,z))[1:]):
            if min(a[0],b[0])>half+30 or max(a[0],b[0])<-half-30:continue
            if min(a[1],b[1])>half+30 or max(a[1],b[1])<-half-30:continue
            d=b-a;length=np.linalg.norm(d)
            if length<.0001:continue
            steps=min(1024,max(2,math.ceil(length/.85)))
            t=np.linspace(0,1,steps,endpoint=False)[:,None]
            pts=a[None,:]+d[None,:]*t
            points.append(pts);directions.append(np.repeat(d[None,:]/length,len(pts),axis=0))
            segs+=1
    if not points:raise ValueError('OSM coastline не пересекает область TrussLab; проверьте геопривязку.')
    samples=np.concatenate(points).astype('float32');vectors=np.concatenate(directions).astype('float32')
    xs,zs=grid_centers();pixels=np.column_stack((xs.ravel(),zs.ravel())).astype('float32')
    tree=cKDTree(samples)
    side=np.empty(len(pixels),dtype='uint8')
    for i in range(0,len(pixels),25000):
        q=pixels[i:i+25000];_,indices=tree.query(q,k=1,workers=-1)
        rel=q-samples[indices];d=vectors[indices]
        signed=d[:,0]*rel[:,1]-d[:,1]*rel[:,0]
        side[i:i+len(q)]=np.where(signed>=0,255,0).astype('uint8')
    land=float(side.mean()/255)
    print(f'OSM: {len(lines)} coastline ways, {segs} segments, {len(samples)} samples, суша ≈{land:.1%}')
    if land<.05 or land>.95:
        print('ВНИМАНИЕ: доля суши выглядит необычно. Проверьте маску вручную.',file=sys.stderr)
    return side.reshape(N,N),{'ways':len(lines),'segments':segs,'coastlineOrientation':'land-left','classification':'nearest segment; approximate for open/broken chains'}

def read_dem_tif(path:Path):
    import rasterio
    from scipy.ndimage import map_coordinates
    xx,zz=grid_centers()
    lat,lon=scene_to_geo(xx,zz)
    with rasterio.open(path) as src:
        if src.crs is None:raise ValueError('GeoTIFF не имеет CRS (системы координат).')
        if src.crs.to_epsg()!=4326:
            from rasterio.warp import transform
            xs,ys=transform('EPSG:4326',src.crs,lon.ravel().tolist(),lat.ravel().tolist())
            lon=np.asarray(xs).reshape(N,N);lat=np.asarray(ys).reshape(N,N)
        # Only one GLO-30 tile near 45N36E is needed for the scene calibration.
        band=src.read(1,masked=True).astype('float32').filled(np.nan)
        col,row=(~src.transform)*(lon,lat)
        values=map_coordinates(band,[np.asarray(row)-.5,np.asarray(col)-.5],order=1,mode='constant',cval=np.nan)
    good=np.isfinite(values)&(values>-500)&(values<5000)
    quantized=np.full((N,N),-32768,dtype='<i2')
    quantized[good]=np.round(np.clip(values[good]*10,-32000,32000)).astype('<i2')
    print(f'DEM: {good.mean():.1%} пикселей покрыты, диапазон значений '+(f'{values[good].min():.1f}–{values[good].max():.1f} м' if good.any() else 'нет покрытия'))
    if good.mean()<.50:print('ВНИМАНИЕ: менее 50% карты покрыты DEM; потребуются другие тайлы.',file=sys.stderr)
    return quantized,{'sourceCRS':str(src.crs),'validFraction':round(float(good.mean()),5),'tile':path.name,'kind':'DSM','metresPerStep':0.1}

def write_preview(coast,dem,out:Path):
    from PIL import Image,ImageDraw
    if coast is not None:
        im=Image.fromarray(np.uint8(np.where(coast>0,146,43)),'L').convert('RGB')
        arr=np.asarray(im).copy();arr[coast>0]=[110,139,101];arr[coast==0]=[26,87,111];im=Image.fromarray(arr,'RGB')
    else:im=Image.new('RGB',(N,N),(55,84,100))
    if dem is not None:
        a=dem.astype('float32')*.1
        valid=dem!=-32768
        normalized=np.maximum(0,np.minimum(1,(a+5)/80))
        rgb=np.asarray(im).copy()
        rgb[valid]=np.maximum(0,np.minimum(255,rgb[valid]*(.65+.35*normalized[valid,None]))).astype('uint8')
        im=Image.fromarray(rgb,'RGB')
    d=ImageDraw.Draw(im);d.rectangle([4,4,298,44],fill=(13,35,43));d.text((12,12),'TrussLab GeoPack / OSM + GLO-30',fill=(240,242,231))
    im.save(out)
    print('Превью:',out)

def existing_geopack(path:Path):
    if not path.is_file():return None
    try:
        old=json.loads(path.read_text(encoding='utf8'))
        if (old.get('type')=='TrussLabGeoPack' and old.get('version')==1
                and old.get('gridSize')==N and abs(old.get('sceneSize',0)-SCENE)<.001):
            return old
    except (OSError,ValueError,TypeError):pass
    return None

def main():
    ap=argparse.ArgumentParser(description='OSM/Copernicus -> TrussLab GeoPack JSON (offline import)')
    ap.add_argument('--download',action='store_true',help='download OSM + public GLO-30; continue if one unavailable')
    ap.add_argument('--dem-only',action='store_true',help='with --download, download ONLY Copernicus DEM (no Overpass)')
    ap.add_argument('--osm-only',action='store_true',help='with --download, download ONLY OSM (preserve existing DEM)')
    ap.add_argument('--osm-timeout',type=int,default=25,help='per-Overpass-server timeout in seconds; default 25')
    ap.add_argument('--osm-json',type=Path,help='Overpass JSON or GeoJSON LineString from OSM coastline')
    ap.add_argument('--dem-tif',type=Path,help='Copernicus DEM GeoTIFF (GLO-30 or compatible)')
    ap.add_argument('--output',type=Path,default=Path('data/kerch_geopack.json'))
    args=ap.parse_args()
    if args.dem_only and args.osm_only:ap.error('Use either --dem-only OR --osm-only, not both.')
    if not args.download and not args.osm_json and not args.dem_tif:
        ap.print_help();sys.exit(2)
    if not (5<=args.osm_timeout<=120):ap.error('--osm-timeout must be 5..120 seconds')
    coast=args.osm_json;dem=args.dem_tif
    if coast is not None and not coast.is_file():ap.error(f'File missing: {coast}')
    if dem is not None and not dem.is_file():ap.error(f'File missing: {dem}')
    if args.download:
        cache=args.output.parent/'source_downloads';cache.mkdir(parents=True,exist_ok=True)
        if coast is None and not args.dem_only:coast=download_osm(cache,args.osm_timeout)
        if dem is None and not args.osm_only:
            try:dem=download_with_limit(DEM_URL,cache/(TILE+'.tif'),250,timeout=90,attempts=2)
            except Exception as exc:print('ВНИМАНИЕ: DEM недоступен:',exc,file=sys.stderr)
    if coast is None and dem is None:
        raise RuntimeError('Не удалось получить новые OSM или DEM. Уже существующий GeoPack не изменён. '
                           'Для быстрого получения высот запустите --download --dem-only; '
                           'для OSM передайте --osm-json.')
    old=existing_geopack(args.output)
    metadata={'preparedUTC':dt.datetime.now(dt.timezone.utc).isoformat(),
              'terrainGrid':'rotated local scene grid, 420 units',
              'anchorWGS84':[LAT0,LON0],'metresPerHorizontalUnit':MPP,
              'georeferenceAccuracy':'approximate single point calibration, NOT surveyed',
              'sources':[]}
    if old:
        metadata['sources']=list(old.get('metadata',{}).get('sources',[]))
    result={'type':'TrussLabGeoPack','version':1,'sceneSize':SCENE,'gridSize':N,'metadata':metadata}
    mask=None;heights=None
    if coast:
        mask,meta=rasterize_osm(coast)
        result['coast']={'encoding':'uint8/base64','data':base64.b64encode(mask.tobytes()).decode('ascii')}
        metadata['sources']=[q for q in metadata['sources'] if 'OpenStreetMap' not in q.get('dataset','')]
        metadata['sources'].append({'dataset':'OpenStreetMap natural=coastline','license':'ODbL','credit':'© OpenStreetMap contributors','details':meta})
    elif old and old.get('coast'):
        result['coast']=old['coast']
        mask=np.frombuffer(base64.b64decode(old['coast']['data']),dtype=np.uint8).reshape(N,N)
        print('Сохраняем существующий OSM-слой из',args.output)
    if dem:
        heights,meta=read_dem_tif(dem)
        result['dem']={'encoding':'int16le/base64','data':base64.b64encode(heights.tobytes()).decode('ascii'),
                       'scaleMetres':0.1,'noData':-32768}
        metadata['sources']=[q for q in metadata['sources'] if 'Copernicus' not in q.get('dataset','') and 'elevation' not in q.get('dataset','').lower()]
        metadata['sources'].append({'dataset':'Copernicus DEM GLO-30 Public' if dem.name.startswith('Copernicus_DSM_COG_10') else 'External elevation GeoTIFF (unverified provider)',
                                    'credit':'Copernicus Programme / ESA' if dem.name.startswith('Copernicus_DSM_COG_10') else 'Check source file licence','details':meta})
    elif old and old.get('dem'):
        result['dem']=old['dem']
        heights=np.frombuffer(base64.b64decode(old['dem']['data']),dtype='<i2').reshape(N,N)
        print('Сохраняем существующий DEM-слой из',args.output)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temp=args.output.with_suffix(args.output.suffix+'.part')
    temp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    temp.replace(args.output)
    print('Готово:',args.output, f'{args.output.stat().st_size/1024/1024:.2f} МБ')
    try:write_preview(mask,heights,args.output.with_suffix('.preview.png'))
    except Exception as exc:print('Не удалось создать PNG-превью:',exc,file=sys.stderr)
    print('Слои пакета:', 'OSM' if 'coast' in result else 'без OSM', '+ DEM' if 'dem' in result else '+ без DEM')
    if 'coast' not in result:print('Берег остаётся из встроенной карты TrussLab, пока OSM не загружен.')
    print('В TrussLab нажмите «📦 OSM + DEM» и выберите этот JSON-файл.')

if __name__=='__main__':main()
