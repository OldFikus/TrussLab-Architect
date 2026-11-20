#!/usr/bin/env python3
"""Create a marked-as-synthetic QA region. This is NOT a Crimea reconstruction."""
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
lat,lon=45.308440,36.506491
features=[]
for row in range(12):
 for col in range(22):
  x=lon+.006+col*.0011;y=lat-.012+row*.0015
  r=.00033
  polygon=[[x,y],[x+r,y],[x+r,y+r*.78],[x,y+r*.78],[x,y]]
  features.append({'type':'Feature','id':f'synthetic_{row}_{col}','properties':{'building':'yes','building:levels':1+(row+col)%6,'source':'SYNTHETIC QA ONLY'},'geometry':{'type':'Polygon','coordinates':[polygon]}})
for j in range(12):
 y=lat-.012+j*.0015-.00030
 line=[[lon+.005,y],[lon+.031,y]]
 features.append({'type':'Feature','id':f'synthetic_street_{j}','properties':{'highway':'residential','source':'SYNTHETIC QA ONLY'},'geometry':{'type':'LineString','coordinates':line}})
for j in range(10):
 x=lon+.005+j*.0027-.00018
 line=[[x,lat-.014],[x,lat+.008]]
 features.append({'type':'Feature','id':f'synthetic_street_ns_{j}','properties':{'highway':'tertiary','source':'SYNTHETIC QA ONLY'},'geometry':{'type':'LineString','coordinates':line}})
raw={'type':'FeatureCollection','name':'TrussLab 10.3 TEST / not real buildings','metadata':{'source':'SYNTHETIC DEMO — DO NOT USE FOR 1:1','license':'Original TrussLab test data'},'features':features}
target=ROOT/'data'/'region_demo_source.geojson';target.write_text(json.dumps(raw,ensure_ascii=False,separators=(',',':')),'utf8')
print('Demo source:',target,len(features),'synthetic features')
