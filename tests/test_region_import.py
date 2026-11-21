"""Verify a real multi-row-group GeoParquet and tiled COG through the package reader."""
import json
import os
from pathlib import Path
import sys
import tempfile
import subprocess
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import LineString
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tools.build import VERSION

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    geom=LineString([(0.001,0.005),(0.04,0.005)]).wkb
    table=pa.table({'geometry':[geom]*12,'highway':['residential']*12})
    geo=dict(version='1.0.0',primary_column='geometry',columns={'geometry':dict(encoding='WKB',geometry_types=['LineString'])})
    pq.write_table(table.replace_schema_metadata({b'geo':json.dumps(geo).encode()}),root/'streets.parquet',row_group_size=3)
    with rasterio.open(root/'map.tif','w',driver='COG',width=512,height=256,count=1,dtype='uint8',crs='EPSG:3857',transform=from_origin(0,2048,8,8)) as dst:
        dst.write(np.full((1,256,512),150,dtype=np.uint8))
    args=[sys.executable,str(ROOT/'tools/import_region.py'),'--output',str(root/'demo'),'--name','Import test','--license-name','CC0','--attribution','TrussLab','--quality','demo','--parquet',str(root/'streets.parquet'),'--cog',str(root/'map.tif')]
    subprocess.run(args,check=True)
    manifest=json.loads((root/'demo/index.json').read_text())
    tiles=manifest['index']['tiles']
    assert len(tiles)==3 and tiles['0:0']['features']==12 and 'raster' in tiles['1:0'] and 'raster' not in tiles['2:0']
    assert subprocess.run(args,capture_output=True).returncode!=0
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
        page=browser.new_page()
        page.context.set_offline(True)
        page.goto((ROOT/'dist'/f'TrussLab_{VERSION}_SAFE.html').as_uri())
        page.locator('#atlas-open').click()
        page.locator('#atlas-file-picker').set_input_files(root/'demo')
        page.wait_for_function("atlas.store.loaded===3 && atlas.stats.shapes===36")
        assert page.evaluate("atlas.store.get('1:0').raster.width") == 256
        page.locator('#planet-3d').click()
        page.wait_for_function("document.querySelector('dialog[open] output').textContent.includes('загрузок 3')")
        assert page.evaluate("document.querySelector('dialog[open] canvas').getContext('webgl').getError()")==0
        page.locator('dialog[open] button').click()
        browser.close()
