#!/usr/bin/env python3
"""No external GIS library or online data needed for deterministic QA."""
from pathlib import Path
from tempfile import TemporaryDirectory
import sys,json,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from build_region_tiles import mercator,iter_features,build

class RegionTests(unittest.TestCase):
    def test_projection_anchor(self):
        p=mercator(36.506491,45.30844)
        self.assertGreater(p[0],4e6)
        self.assertGreater(p[1],5e6)
        with self.assertRaises(ValueError):mercator(720,0)
    def test_big_stream_and_tile_paths(self):
        with TemporaryDirectory() as temp:
            root=Path(temp)
            file=root/'sample.geojson'
            # JSON with metadata in front, an array streaming from repeated tiny reads.
            parts=[]
            for i in range(150):
                lon=36.50+.00018*i;lat=45.30+(i%8)*.00012
                coords=[[lon,lat],[lon+.00008,lat],[lon+.00008,lat+.00008],[lon,lat+.00008],[lon,lat]]
                parts.append({'type':'Feature','properties':{'building':'yes'},'geometry':{'type':'Polygon','coordinates':[coords]}})
            file.write_text(json.dumps({'type':'FeatureCollection','metadata':{'source':'QA synthetic'},'features':parts}),encoding='utf8')
            self.assertEqual(len(list(iter_features(file))),150)
            out=root/'region'
            manifest=build([file],out,512)
            self.assertEqual(manifest['report']['featuresRead'],150)
            self.assertGreater(len(manifest['tiles']),1)
            self.assertEqual(sum(t['features'] for t in manifest['tiles'].values()),manifest['report']['featuresWritten'])
            for obj in manifest['tiles'].values():
                data=json.loads((out/obj['path']).read_text('utf8'))
                self.assertEqual(data['type'],'FeatureCollection')
                self.assertEqual(len(data['features']),obj['features'])
            # Failed rebuild cannot damage previous successful output.
            broken=root/'broken.geojson';broken.write_text('{bad json','utf8')
            old=(out/'index.json').read_bytes()
            with self.assertRaises(ValueError):build([broken],out,512)
            self.assertEqual(old,(out/'index.json').read_bytes())
    def test_ndjson(self):
        with TemporaryDirectory() as temp:
            path=Path(temp)/'city.ndjson'
            feature={'type':'Feature','properties':{'highway':'residential'},'geometry':{'type':'LineString','coordinates':[[36.5,45.3],[36.52,45.31]]}}
            path.write_text('\n'.join(json.dumps(feature) for _ in range(3)))
            self.assertEqual(len(list(iter_features(path))),3)
            out=Path(temp)/'tiles';m=build([path],out,1024)
            self.assertGreater(m['report']['featuresWritten'],3)

if __name__=='__main__':unittest.main()
