"""Compile local GeoParquet and COG sources into an offline PlanetStream package."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import json
import math
from pathlib import Path
import sqlite3
import tempfile

SIZE = 2048
LIMIT = 200000
RADIUS = 6378137


def geographic(x, y):
    return [math.degrees(x / RADIUS), math.degrees(math.atan(math.sinh(y / RADIUS)))]


def cells(bounds):
    west, south, east, north = bounds
    if not all(math.isfinite(x) and abs(x) <= 20037509 for x in bounds):
        raise ValueError('Source exceeds Web Mercator coverage')
    x0, y0 = math.floor(west / SIZE), math.floor(south / SIZE)
    x1 = max(x0, math.ceil(east / SIZE) - 1)
    y1 = max(y0, math.ceil(north / SIZE) - 1)
    if (x1-x0+1)*(y1-y0+1) > LIMIT:
        raise ValueError('Split this area into smaller regions')
    for x in range(x0, x1+1):
        for y in range(y0, y1+1):
            yield x, y


def vectors(path, db):
    import pyarrow.parquet as pq
    from shapely import from_wkb
    from shapely.geometry import box, mapping
    from shapely.ops import transform
    from pyproj import Transformer, CRS
    parquet = pq.ParquetFile(path)
    meta = json.loads((parquet.schema_arrow.metadata or {})[b'geo'])
    name = meta['primary_column']
    info = meta['columns'][name]
    if info['encoding'] != 'WKB' or info.get('crs', True) is None:
        raise ValueError('GeoParquet requires WKB and a known CRS')
    crs = CRS.from_user_input(info.get('crs','OGC:CRS84'))
    forward = Transformer.from_crs(crs,3857,always_xy=True).transform
    inverse = Transformer.from_crs(3857,4326,always_xy=True).transform
    tags = [key for key in ('building','highway','railway','height','building:levels') if key in parquet.schema_arrow.names]
    for batch in parquet.iter_batches(columns=[name,*tags],batch_size=256):
        for row in batch.to_pylist():
            data = row.pop(name)
            if data is None: continue
            obj = transform(forward,from_wkb(data))
            if obj.is_empty: continue
            if obj.geom_type not in ('LineString','MultiLineString','Polygon','MultiPolygon'):
                raise ValueError(f'Unsupported vector geometry {obj.geom_type}')
            for x,y in cells(obj.bounds):
                clipped = obj.intersection(box(x*SIZE,y*SIZE,(x+1)*SIZE,(y+1)*SIZE))
                if clipped.is_empty or clipped.area == 0 and 'Polygon' in obj.geom_type: continue
                if clipped.geom_type not in ('LineString','MultiLineString','Polygon','MultiPolygon'): continue
                feature = dict(type='Feature',properties={k:v for k,v in row.items() if v is not None},
                               geometry=mapping(transform(inverse,clipped)))
                db.execute('INSERT INTO features VALUES (?,?,?)',(x,y,json.dumps(feature,separators=(',',':'))))
        db.commit()


def rasters(path, target):
    import rasterio
    from rasterio.enums import ColorInterp, Resampling
    from rasterio.vrt import WarpedVRT
    from rasterio.windows import Window
    from PIL import Image
    import numpy as np
    with rasterio.Env(GDAL_CACHEMAX=64*1024*1024), rasterio.open(path) as src:
        if src.crs is None or src.dtypes[0] != 'uint8':
            raise ValueError('Imagery must have a CRS and 8-bit samples')
        colors = src.colorinterp
        if all(c in colors for c in (ColorInterp.red,ColorInterp.green,ColorInterp.blue)):
            bands = [colors.index(c)+1 for c in (ColorInterp.red,ColorInterp.green,ColorInterp.blue)]
        elif colors[0] == ColorInterp.gray: bands = [1]
        else: raise ValueError('Only grayscale and RGB imagery are supported')
        with WarpedVRT(src,crs='EPSG:3857',add_alpha=ColorInterp.alpha not in colors,warp_mem_limit=32) as overview:
            alpha = overview.colorinterp.index(ColorInterp.alpha)+1
            for x,y in cells(overview.bounds):
                from rasterio.transform import from_bounds
                transform = from_bounds(x*SIZE,y*SIZE,(x+1)*SIZE,(y+1)*SIZE,256,256)
                with WarpedVRT(overview,crs='EPSG:3857',transform=transform,width=256,height=256,
                               resampling=Resampling.nearest,warp_mem_limit=16) as tile:
                    pixels = tile.read([*bands,alpha],window=Window(0,0,256,256))
                if not pixels[-1].any(): continue
                if len(bands)==1: pixels=pixels[[0,0,0,1]]
                filename = f'tiles/{x}_{y}.png'
                Image.fromarray(np.moveaxis(pixels,0,2)).save(target/filename)
                yield x,y,filename


def compile_region(output, name, attribution, license_name, quality, parquet=None, cog=None):
    import re
    output = Path(output).resolve()
    if not parquet and not cog: raise ValueError('Choose a GeoParquet or COG input')
    if output.exists(): raise FileExistsError(output)
    if not re.fullmatch('[a-z0-9][a-z0-9-]{0,63}',output.name): raise ValueError('Use a lowercase package ID as output directory')
    if not all(v.strip() and len(v)<=n for v,n in [(name,160),(attribution,512),(license_name,512)]) or quality not in ('confirmed','approximate','demo','missing'):
        raise ValueError('Invalid title, attribution, license or quality')
    with tempfile.TemporaryDirectory(dir=output.parent) as work:
        target=Path(work)/'package'
        (target/'tiles').mkdir(parents=True)
        tiles={}
        if parquet:
            with sqlite3.connect(Path(work)/'spool.db') as db:
                db.execute('CREATE TABLE features(x INTEGER,y INTEGER,body TEXT)')
                db.execute('CREATE INDEX cells ON features(x,y)')
                vectors(parquet,db)
                for x,y,count,length in db.execute('SELECT x,y,count(*),sum(length(body)) FROM features GROUP BY x,y'):
                    if len(tiles)>=LIMIT or count>25000 or length+count+50>4000000:
                        raise ValueError('Region or vector tile exceeds package limits')
                    filename=f'tiles/{x}_{y}.geojson'
                    with (target/filename).open('w') as f:
                        f.write('{"type":"FeatureCollection","features":[')
                        for i,(value,) in enumerate(db.execute('SELECT body FROM features WHERE x=? AND y=?',(x,y))):
                            if i: f.write(',')
                            f.write(value)
                        f.write(']}')
                    tiles[f'{x}:{y}']=dict(features=count,path=filename)
        if cog:
            for x,y,filename in rasters(cog,target):
                tiles.setdefault(f'{x}:{y}',dict(features=0))['raster']=filename
        if not tiles or len(tiles)>LIMIT: raise ValueError('Empty region or excessive tile count')
        xy=[tuple(map(int,k.split(':'))) for k in tiles]
        xs,ys=zip(*xy)
        west,south=geographic(min(xs)*SIZE,min(ys)*SIZE)
        east,north=geographic((max(xs)+1)*SIZE,(max(ys)+1)*SIZE)
        west,east=max(-180,west),min(180,east)
        south,north=max(-85.05112878,south),min(85.05112878,north)
        manifest=dict(type='TrussLabPlanetRegion',version=1,id=output.name,name=name,
                      bounds=[west,south,east,north],center=[(west+east)/2,(south+north)/2],
                      source=dict(attribution=attribution,license=license_name,quality=quality),
                      index=dict(type='TrussLabRegionIndex',version=1,projection='EPSG:3857',tileSizeMeters=SIZE,tiles=tiles))
        (target/'index.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf8')
        if output.exists(): raise FileExistsError(output)
        target.rename(output)
        return len(tiles)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ('output','name','attribution','license_name','quality'):
        parser.add_argument('--'+key.replace('_','-'),dest=key,required=True)
    parser.add_argument('--parquet')
    parser.add_argument('--cog')
    with ProcessPoolExecutor(max_workers=1) as pool:
        print(pool.submit(compile_region,**vars(parser.parse_args())).result(),'tiles')
