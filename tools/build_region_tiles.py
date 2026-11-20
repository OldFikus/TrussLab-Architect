#!/usr/bin/env python3
"""TrussLab 10.3 regional vector tile builder (stdlib, offline, no download).

Reads GeoJSON FeatureCollections in streaming mode (bounded 128 KiB chunks) or
GeoJSONL/NDJSON. Writes small independent WGS84 GeoJSON tiles, indexed by a
metric EPSG:3857 grid. Objects crossing tiles are replicated, not destroyed.
IMPORTANT: EPSG:3857 coordinates are projection metres, not surveyed ground metres.
Source tags and attribution are passed through without interpreting their truth.
"""
from __future__ import annotations
import argparse, json, math, os, re, shutil, sys, tempfile
from collections import OrderedDict
from pathlib import Path

EARTH=6378137.0
LIMIT=EARTH*math.pi

def mercator(lon,lat):
    lon=float(lon);lat=float(lat)
    if not math.isfinite(lon) or not math.isfinite(lat) or abs(lon)>180 or abs(lat)>90:
        raise ValueError('Invalid WGS84 coordinates')
    lat=max(-85.05112878,min(85.05112878,lat))
    return (EARTH*math.radians(lon),EARTH*math.log(math.tan(math.pi/4+math.radians(lat)/2)))

def iter_features(path):
    """Iterate features without loading entire FeatureCollection into RAM."""
    path=Path(path)
    with path.open(encoding='utf-8-sig') as f:
        if path.suffix.lower() in {'.ndjson','.jsonl','.geojsonl'}:
            for i,line in enumerate(f,1):
                if not line.strip():continue
                item=json.loads(line)
                if item.get('type')=='Feature':yield item
                elif item.get('type')=='FeatureCollection':yield from item.get('features',[])
                else:raise ValueError(f'Not GeoJSON feature, line {i}')
            return
        buf=''; decoder=json.JSONDecoder(); complete=False
        while not re.search(r'"features"\s*:\s*\[',buf):
            t=f.read(131072)
            if not t: raise ValueError(f'GeoJSON FeatureCollection missing features array: {path}')
            buf+=t
            if len(buf)>4_000_000:raise ValueError('GeoJSON header too large')
        match=re.search(r'"features"\s*:\s*\[',buf)
        header=buf[:match.start()]
        if '"FeatureCollection"' not in header:raise ValueError('GeoJSON FeatureCollection expected')
        buf=buf[match.end():]
        while True:
            buf=buf.lstrip(' \r\n\t,')
            if not buf:
                t=f.read(131072)
                if not t:raise ValueError('Unexpected EOF in features array')
                buf=t;continue
            if buf[0]==']':complete=True;break
            try:
                feature,n=decoder.raw_decode(buf)
                buf=buf[n:]
                if isinstance(feature,dict) and feature.get('type')=='Feature':yield feature
            except json.JSONDecodeError:
                t=f.read(131072)
                if not t:raise ValueError('Incomplete or invalid GeoJSON feature')
                buf+=t
                if len(buf)>20_000_000:raise ValueError('Individual feature exceeds 20 MB')
        if not complete:raise ValueError('Unclosed features array')

def walk_coords(geo):
    if not isinstance(geo,dict):return
    t=geo.get('type')
    if t=='GeometryCollection':
        for g in geo.get('geometries',[]):yield from walk_coords(g)
    elif t in {'Polygon','MultiPolygon','LineString','MultiLineString','Point','MultiPoint'}:
        def visit(v):
            if not isinstance(v,(list,tuple)):return
            if len(v)>=2 and isinstance(v[0],(float,int)) and isinstance(v[1],(float,int)):
                yield (v[0],v[1])
            else:
                for q in v:yield from visit(q)
        yield from visit(geo.get('coordinates',[]))

def feature_range(feat,tile_size):
    it=iter(walk_coords(feat.get('geometry')))
    p=next(it,None)
    if p is None:return None
    x0,y0=mercator(*p);x1,y1=x0,y0
    for p in it:
        x,y=mercator(*p)
        x0=min(x,x0);x1=max(x1,x);y0=min(y0,y);y1=max(y1,y)
    # Keep exact grid-boundary geometry in a single target tile rather than
    # duplicating massive neighbouring regions for a shared-edge line.
    eps=.000001
    return (math.floor(x0/tile_size),math.floor(y0/tile_size),
            math.floor((x1-eps if x1>x0 else x1)/tile_size),
            math.floor((y1-eps if y1>y0 else y1)/tile_size)),(x0,y0,x1,y1)

class OpenFiles:
    def __init__(self,folder,max_open=32):
        self.folder=folder;self.live=OrderedDict();self.max_open=max_open
        self.touched=set();self.counts={}
    def add(self,key,feature):
        path=self.folder/f'{key[0]}_{key[1]}.geojson'
        if key not in self.live:
            if len(self.live)>=self.max_open:
                _,h=self.live.popitem(last=False);h.close()
            h=path.open('a',encoding='utf8');self.live[key]=h
        else:
            h=self.live.pop(key);self.live[key]=h
        if key not in self.touched:
            h.write('{"type":"FeatureCollection","features":[')
            self.touched.add(key)
        else:h.write(',')
        h.write(json.dumps(feature,ensure_ascii=False,separators=(',',':')))
        self.counts[key]=self.counts.get(key,0)+1
    def finish(self):
        for h in self.live.values():h.close()
        self.live.clear()
        for key in self.touched:
            with (self.folder/f'{key[0]}_{key[1]}.geojson').open('a',encoding='utf8') as f:f.write(']}')

def build(inputs,output,tile_size=2048,max_tiles_per_feature=64,max_features_per_tile=7000):
    inputs=[Path(p) for p in inputs]
    if not inputs:raise ValueError('Input folder has no GeoJSON files')
    output=Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='truss_region_',dir=output.parent) as tmp:
        folder=Path(tmp)/'tiles';folder.mkdir()
        sink=OpenFiles(folder)
        report={'featuresRead':0,'featuresWritten':0,'invalid':0,'tooLarge':0,'ignored':0,'tileCount':0}
        bounds=[float('inf'),float('inf'),-float('inf'),-float('inf')]
        for path in inputs:
            print('Чтение',path,flush=True)
            for f in iter_features(path):
                report['featuresRead']+=1
                try:
                    result=feature_range(f,tile_size)
                    if result is None:report['ignored']+=1;continue
                    (a,b,c,d),bb=result
                    n=(c-a+1)*(d-b+1)
                    if n<1 or n>max_tiles_per_feature:report['tooLarge']+=1;continue
                    bounds=[min(bounds[0],bb[0]),min(bounds[1],bb[1]),max(bounds[2],bb[2]),max(bounds[3],bb[3])]
                    for ix in range(a,c+1):
                        for iy in range(b,d+1):
                            key=(ix,iy)
                            if sink.counts.get(key,0)>=max_features_per_tile:raise RuntimeError(f'Tile {key} exceeded max {max_features_per_tile} features. Use smaller tile-km.')
                            sink.add(key,f);report['featuresWritten']+=1
                except (TypeError,ValueError,OverflowError) as e:
                    report['invalid']+=1
                    if report['invalid']<=5:print('  Пропущен повреждённый объект:',e)
                if report['featuresRead']%10000==0:print('  обработано',report['featuresRead'],flush=True)
        sink.finish()
        if not sink.counts:raise ValueError('No valid geographic features were found')
        tiles={f'{x}:{y}':{'path':f'tiles/{x}_{y}.geojson','features':count}
               for (x,y),count in sorted(sink.counts.items())}
        report['tileCount']=len(tiles)
        index={'type':'TrussLabRegionIndex','version':1,'projection':'EPSG:3857',
               'tileSizeMeters':tile_size,'tileBoundsMercator':bounds,
               'tiles':tiles,'report':report,
               'metadata':{'accuracy':'source-dependent; EPSG:3857 projected metres are not ground distance',
                           'sources':[p.name for p in inputs],
                           'attribution':'Preserve and display source attribution; OSM/Overture typically ODbL.'}}
        (Path(tmp)/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),'utf8')
        # Transactional install: finished tiles and manifest go into place together;
        # restore previous dataset if either move fails (no partial replacement).
        output.mkdir(exist_ok=True)
        backup=Path(tmp)/'previous';backup.mkdir()
        previous_tiles=output/'tiles';previous_index=output/'index.json'
        if previous_tiles.exists():os.replace(previous_tiles,backup/'tiles')
        if previous_index.exists():os.replace(previous_index,backup/'index.json')
        try:
            os.replace(folder,previous_tiles)
            os.replace(Path(tmp)/'index.json',previous_index)
        except Exception:
            if previous_tiles.exists():shutil.rmtree(previous_tiles)
            if previous_index.exists():previous_index.unlink()
            if (backup/'tiles').exists():os.replace(backup/'tiles',previous_tiles)
            if (backup/'index.json').exists():os.replace(backup/'index.json',previous_index)
            raise
    return index

def main():
    ap=argparse.ArgumentParser(description='TrussLab 10.3: assemble external region tiles from GeoJSON, offline')
    ap.add_argument('--input',nargs='+',required=True,help='One or more files, or an input directory (recursive)')
    ap.add_argument('--output',default='data/region_tiles')
    ap.add_argument('--tile-km',type=float,default=2.048)
    ap.add_argument('--max-tiles-per-feature',type=int,default=64)
    args=ap.parse_args()
    if not 0.5<=args.tile_km<=16:ap.error('tile-km must be 0.5..16')
    paths=[]
    for arg in args.input:
        p=Path(arg)
        if p.is_dir():paths+=sorted(f for f in p.rglob('*') if f.suffix.lower() in {'.json','.geojson','.ndjson','.jsonl','.geojsonl'} and f.name not in {'index.json','kerch_geopack.json'})
        elif p.is_file():paths.append(p)
        else:ap.error(f'Input does not exist: {arg}')
    result=build(paths,args.output,int(args.tile_km*1000),args.max_tiles_per_feature)
    print('ГОТОВО: файлов:',result['report']['tileCount'],'объектов:',result['report']['featuresRead'],
          'внешний атлас:',Path(args.output)/'index.json')
    print('В TrussLab: «🌐 Регионы» → «📁 Папка тайлов»; выберите папку',args.output)

if __name__=='__main__':main()
