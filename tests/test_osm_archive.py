import base64
import io
import json
import sys
import tarfile
import tempfile
from pathlib import Path

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from prepare_geodata import N, SCENE, scene_to_geo
from prepare_osm_archive import read_geojson_from_archive, rasterize_water_polygons, update_geopack

# Fake OSM sea polygon covering right half of the local game scene.
# Uses the SAME WGS84 projection functions as the production tool.
def point(x,z):
    lat,lon=scene_to_geo(np.asarray(x),np.asarray(z))
    return [float(lon),float(lat)]
poly=[point(0,-SCENE/2-10),point(SCENE/2+10,-SCENE/2-10),point(SCENE/2+10,SCENE/2+10),point(0,SCENE/2+10),point(0,-SCENE/2-10)]
mock={'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Polygon','coordinates':[poly]}}]}

with tempfile.TemporaryDirectory() as d:
    tmp=Path(d)
    tar=tmp/'mock.tgz'
    raw=json.dumps(mock).encode()
    with tarfile.open(tar,'w:gz') as ar:
        info=tarfile.TarInfo('package/map.geo.json');info.size=len(raw)
        ar.addfile(info,io.BytesIO(raw))
    geo=read_geojson_from_archive(tar)
    mask,detail=rasterize_water_polygons(geo)
    assert mask.shape == (N,N)
    assert .47 < (mask>0).mean() < .53, (mask>0).mean()
    assert mask[:,int(N*.15)].mean() > 250, 'left region should be land'
    assert mask[:,int(N*.85)].mean() < 5, 'right region should be sea'
    assert detail['regionSeaPolygons']==1
    out=tmp/'data'/'kerch_geopack.json';out.parent.mkdir(parents=True)
    dem_bytes=np.arange(N*N,dtype='<i2').tobytes()
    prior={'type':'TrussLabGeoPack','version':1,'sceneSize':SCENE,'gridSize':N,'metadata':{'sources':[{'dataset':'Copernicus DEM GLO-30 Public','credit':'Copernicus'}]},'dem':{'encoding':'int16le/base64','data':base64.b64encode(dem_bytes).decode(),'scaleMetres':.1,'noData':-32768}}
    out.write_text(json.dumps(prior))
    result=update_geopack(out,mask,detail)
    assert result['dem']==prior['dem'], 'DEM changed in memory'
    actual=json.loads(out.read_text())
    assert actual['dem']==prior['dem'], 'DEM changed on disk'
    assert actual['coast']['encoding']=='uint8/base64'
    assert 'OpenStreetMap contributors' in str(actual['metadata']['sources'])
    assert out.with_suffix('.preview.png').exists()
    before=out.read_bytes()
    no_coast={'type':'FeatureCollection','features':[]}
    try:
        rasterize_water_polygons(no_coast)
        raise AssertionError('must reject empty data')
    except ValueError: pass
    assert out.read_bytes()==before
    print('PASS: npm tar parsing, WGS84->scene, polygon mask, DEM preserved, preview, invalid source safe')
