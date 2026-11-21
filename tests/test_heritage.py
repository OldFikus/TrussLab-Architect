from pathlib import Path
import json
import struct
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools.heritage import MONUMENTS,geometry,glb
for model in MONUMENTS:
    points=geometry(model)
    assert abs(max(p[1] for p in points)-model['height'])<1e-5
    blob=glb(points,model['label'])
    assert struct.unpack_from('<I',blob,8)[0]==len(blob)
    length=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+length])
    assert doc['accessors'][0]['count']==doc['accessors'][1]['count']==len(points)
    offset=28+length+doc['bufferViews'][2]['byteOffset']
    assert blob[offset:offset+8]==b'\x89PNG\r\n\x1a\n'
