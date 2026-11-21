"""Original, dimensioned cutaway meshes for two Kerch chamber tombs. Metres, Y up."""
import base64
import json
import math
import struct
import random
import zlib

BASE='https://archaeolog.ru/media/periodicals/agis/AGIS-4/Presentations/Smekalov/mondeskr/'
MONUMENTS=[
    dict(id='royal-chamber',label='Царский курган · камера',width=4.39,depth=4.35,height=8.84,
         walls=10,vault=12,round=True,source=BASE+'tsarkurg.htm',
         basis='Камера 4,39 × 4,35 м, высота 8,84 м. В своде 12 колец.'),
    dict(id='melek-chamber',label='Мелек-Чесменский курган · камера',width=3.7,depth=4,height=3.8,
         walls=5,vault=7,round=False,source=BASE+'melekch.htm',planSource='https://esu.com.ua/article-66184',
         basis='Камера 3,7 × 4 м. Пять рядов стен и семь уступов свода. Высота 3,8 м принята для визуализации.'),
]


def geometry(m):
    points=[]
    def quad(a,b,c,d): points.extend((a,b,c,a,c,d))
    sides=24 if m['round'] else 4
    def ring(y,rx,rz,blend):
        result=[]
        for k in range(sides):
            t=(k/sides)*2*math.pi+math.pi/4
            cx,cz=math.cos(t),math.sin(t)
            edge=max(abs(cx),abs(cz))
            result.append([rx*cx*((1-blend)/edge+blend),y,rz*cz*((1-blend)/edge+blend)])
        return result
    rows=m['walls']+m['vault']
    for k in range(rows):
        vault=max(0,(k-m['walls'])/m['vault'])
        blend=min(1,max(0,(k-4)/6)) if m['round'] else 0
        rx,rz=m['width']*(1-vault)/2,m['depth']*(1-vault)/2
        h=m['height']/rows
        outer=ring(k*h,rx+.25,rz+.25,blend)
        inner=ring(k*h,rx,rz,blend)
        top=ring((k+1)*h,rx,rz,blend)
        rim=ring((k+1)*h,rx+.25,rz+.25,blend)
        for i in range(3*sides//4):  # leave a quarter open for inspection
            j=i+1
            quad(inner[i],inner[j],top[j],top[i]);quad(outer[j],outer[i],rim[i],rim[j])
            quad(top[i],top[j],rim[j],rim[i]);quad(inner[j],inner[i],outer[i],outer[j])
        for i in (0,3*sides//4):quad(inner[i],top[i],rim[i],outer[i])
    return points


def limestone(seed):
    rng=random.Random(seed)
    rows=bytearray()
    for y in range(64):
        rows.append(0)
        for x in range(64):
            joint=y%16==0 or (x+(y//16%2)*16)%32==0
            value=(133 if joint else 198)+rng.randrange(-11,12)
            rows.extend([value,value-12,value-34])
    def chunk(kind,body):
        return struct.pack('>I',len(body))+kind+body+struct.pack('>I',zlib.crc32(kind+body)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',64,64,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')


def glb(points,label):
    binary=b''.join(struct.pack('<3f',*point) for point in points)
    axes=list(zip(*points))
    data=dict(asset=dict(version='2.0',generator='TrussLab FidelityLab'),scene=0,
              scenes=[dict(nodes=[0])],nodes=[dict(mesh=0)],meshes=[dict(name=label,primitives=[dict(attributes={'POSITION':0},material=0)])],
              materials=[dict(name='Limestone',doubleSided=True,pbrMetallicRoughness=dict(baseColorFactor=[.76,.69,.55,1],metallicFactor=0,roughnessFactor=.9))],
              buffers=[dict(byteLength=len(binary))],bufferViews=[dict(buffer=0,byteLength=len(binary),target=34962)],
              accessors=[dict(bufferView=0,componentType=5126,count=len(points),type='VEC3',min=list(map(min,axes)),max=list(map(max,axes)))])
    offset=len(binary)
    uv=bytearray()
    for i in range(0,len(points),3):
        a,b,c=points[i:i+3]
        ab=[b[j]-a[j] for j in range(3)];ac=[c[j]-a[j] for j in range(3)]
        normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
        axis=max(range(3),key=lambda j:abs(normal[j]))
        u,v=[j for j in range(3) if j!=axis]
        for pt in (a,b,c):uv.extend(struct.pack('<2f',pt[u]/2,pt[v]/2))
    image=limestone(label)
    data['bufferViews'].extend([dict(buffer=0,byteOffset=offset,byteLength=len(uv),target=34962),
                                dict(buffer=0,byteOffset=offset+len(uv),byteLength=len(image))])
    data['accessors'].append(dict(bufferView=1,componentType=5126,count=len(points),type='VEC2'))
    data['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']=1
    data['images']=[dict(bufferView=2,mimeType='image/png')]
    data['textures']=[dict(source=0)]
    data['materials'][0]['pbrMetallicRoughness']['baseColorTexture']={'index':0}
    binary+=uv+image;data['buffers'][0]['byteLength']=len(binary);binary+=b'\x00'*(-len(binary)%4)
    meta=json.dumps(data,separators=(',',':')).encode()
    meta+=b' '*(-len(meta)%4)
    return struct.pack('<4sII',b'glTF',2,28+len(meta)+len(binary))+struct.pack('<I4s',len(meta),b'JSON')+meta+struct.pack('<I4s',len(binary),b'BIN\x00')+binary


def assets():
    result=[]
    for m in MONUMENTS:
        binary=base64.b64encode(glb(geometry(m),m['label'])).decode()
        result.append({**m,'license':'TrussLab · авторская геометрия CC0-1.0','variants':{'high':binary,'low':binary}})
    return result
