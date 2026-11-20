#!/usr/bin/env python3
"""Overture area downloader: no Google scraping, streamed open GeoJSON extracts.

One run produces one or more TrussLab GeoCity .geojson chunks. The geographic
coordinates originate in Overture Maps, not from heuristic scene-generated models.
This script needs an internet connection and `pip install overturemaps` on the user's PC.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

# Conservative starter bounding boxes around the geographic areas, EPSG:4326.
# These are DOWNLOAD WINDOWS, not surveyed object coordinates or route geometry.
AREAS = {
    'kerch': (36.455, 45.257, 36.548, 45.348),
    'tuzla': (36.532, 45.200, 36.653, 45.295),
    'taman': (36.645, 45.162, 36.754, 45.255),
}

def find_cli():
    executable=shutil.which('overturemaps')
    if executable:
        return [executable]
    python_dir=Path(sys.executable).parent
    for candidate in [python_dir/'Scripts'/'overturemaps.exe', python_dir/'overturemaps']:
        if candidate.exists():
            return [str(candidate)]
    raise RuntimeError('CLI overturemaps не обнаружен. Установите: py -3 -m pip install overturemaps')

def read_features(path):
    text=Path(path).read_text('utf8-sig').strip()
    if not text:
        return []
    if text[0]=='{':
        try:
            root=json.loads(text)
            if root.get('type')=='FeatureCollection':return root.get('features',[])
            if root.get('type')=='Feature':return [root]
        except json.JSONDecodeError:
            pass
    # Some GeoJSON tools produce one Feature per line.
    results=[]
    for line in text.splitlines():
        if line.strip().startswith('{'):
            results.append(json.loads(line))
    return results

def coord_count(geometry):
    def count(obj):
        if not isinstance(obj,list):return 0
        if obj and isinstance(obj[0],(int,float)):return 1
        return sum(count(i) for i in obj)
    return count(geometry.get('coordinates',[]))

def extract(area,types,out_dir,cli,features_per_chunk):
    bbox=','.join(map(str,AREAS[area]))
    out_dir.mkdir(parents=True,exist_ok=True)
    combined=[]
    with tempfile.TemporaryDirectory() as d:
        for feature_type in types:
            target=Path(d)/f'{feature_type}.geojson'
            command=cli+['download','--bbox='+bbox,'-f','geojson','--type='+feature_type,'-o',str(target)]
            print('Загрузка Overture',area,feature_type,flush=True)
            try:
                proc=subprocess.run(command,timeout=360)
            except subprocess.TimeoutExpired:
                print('ВНИМАНИЕ: превышен лимит ожидания сети (6 минут) для',feature_type)
                continue
            if proc.returncode!=0 or not target.exists():
                print('ВНИМАНИЕ: загрузка не удалась; другой слой будет проверен отдельно:',feature_type)
                continue
            data=read_features(target)
            print('  найдено объектов:',len(data),flush=True)
            for f in data:
                if f.get('type')!='Feature' or not isinstance(f.get('geometry'),dict):continue
                geom=f['geometry']
                if geom.get('type') not in {'Polygon','MultiPolygon','LineString','MultiLineString'}:continue
                props=f.get('properties') or {}
                # Overture building and transportation are separate feature types;
                # preserve their original data, adding only categorization for app.
                props=dict(props)
                props['trusslab_source_type']=feature_type
                if feature_type=='building': props['building']=props.get('building') or 'yes'
                elif feature_type=='segment': props['type']='segment'
                combined.append({'type':'Feature','geometry':geom,'properties':props})
    if not combined:
        print('Ни одного объекта не загружено. Источники или интернет недоступны.');return []
    paths=[]
    part=1;chunk=[];points=0
    for item in combined:
        n=coord_count(item['geometry'])
        if chunk and (len(chunk)>=features_per_chunk or points+n>50000):
            path=out_dir/f'geocity_{area}_{part:02d}.geojson'
            path.write_text(json.dumps({'type':'FeatureCollection','name':f'Overture Maps / {area} / part {part}','metadata':{'source':'Overture Maps Foundation','license':'ODbL; check source attribution','status':'actual imported footprints, not engineering survey'},'features':chunk},ensure_ascii=False,separators=(',',':')),'utf8');paths.append(path)
            print('Сохранено',path,len(chunk),'объектов',round(path.stat().st_size/1024/1024,2),'МБ')
            part+=1;chunk=[];points=0
        chunk.append(item);points+=n
    if chunk:
        path=out_dir/f'geocity_{area}_{part:02d}.geojson'
        path.write_text(json.dumps({'type':'FeatureCollection','name':f'Overture Maps / {area} / part {part}','metadata':{'source':'Overture Maps Foundation','license':'ODbL; check source attribution','status':'actual imported footprints, not engineering survey'},'features':chunk},ensure_ascii=False,separators=(',',':')),'utf8');paths.append(path)
        print('Сохранено',path,len(chunk),'объектов',round(path.stat().st_size/1024/1024,2),'МБ')
    return paths

def main():
    ap=argparse.ArgumentParser(description='Prepare real Overture GIS footprints for TrussLab GeoCity 10.2')
    ap.add_argument('--area',choices=[*AREAS,'all'],default='kerch')
    ap.add_argument('--output',default='data/geocity_import')
    ap.add_argument('--buildings-only',action='store_true')
    ap.add_argument('--features-per-chunk',type=int,default=2500)
    args=ap.parse_args()
    if not (100<=args.features_per_chunk<=6000):ap.error('Features per chunk must be 100..6000')
    cli=find_cli();areas=list(AREAS) if args.area=='all' else [args.area]
    print('GIS: Overture Maps. No Google Maps imagery is downloaded.',flush=True)
    paths=[]
    for area in areas:
        paths+=extract(area,['building'] if args.buildings_only else ['building','segment'],Path(args.output),cli,args.features_per_chunk)
    if paths:
        print('\nГОТОВО:',len(paths),'файлов. В игре: Крымский мост -> План местности -> GEO CITY -> Здания + дороги.')
        print('Подгружайте файлы по очереди; текущая область карты ограничена ~34×34 км, WGS84 привязка ≈.')
    else:
        raise RuntimeError('Загрузки не получены. Проверьте доступ к Overture, попробуйте --buildings-only или скачайте GeoJSON через Explorer.')
if __name__=='__main__':main()
