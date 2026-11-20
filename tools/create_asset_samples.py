#!/usr/bin/env python3
"""Generate original, small Khronos glTF 2.0 GLB demonstration geometry."""
import json,math,struct,base64
from collections import defaultdict
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]/'assets/models';OUT.mkdir(parents=True,exist_ok=True)
COLORS={'concrete':(.62,.59,.52,1),'roof_red':(.75,.22,.17,1),'glass':(.2,.5,.63,1),'steel':(.38,.44,.48,1),'dark':(.12,.14,.17,1),'brick':(.55,.40,.31,1)}
class Model:
 def __init__(self):self.polys=defaultdict(list)
 def face(self,pts,mat):
  a,b,c=pts[:3]; u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];l=math.sqrt(sum(z*z for z in n)) or 1;n=[z/l for z in n]
  for p in pts:self.polys[mat].append((p,n))
 def tri(self,a,b,c,mat):self.face([a,b,c],mat)
 def quad(self,a,b,c,d,mat):self.tri(a,b,c,mat);self.tri(a,c,d,mat)
 def box(self,x,y,z,w,h,d,mat):
  x0,x1=x-w/2,x+w/2;y0,y1=y,y+h;z0,z1=z-d/2,z+d/2
  a=(x0,y0,z0);b=(x1,y0,z0);c=(x1,y0,z1);dd=(x0,y0,z1);e=(x0,y1,z0);f=(x1,y1,z0);g=(x1,y1,z1);h1=(x0,y1,z1)
  for q in [(a,dd,c,b),(e,f,g,h1),(a,b,f,e),(dd,h1,g,c),(a,e,h1,dd),(b,c,g,f)]:self.quad(*q,mat)
 def cylinder(self,x,y,z,r,height,sides,mat):
  for k in range(sides):
   a,b=2*math.pi*k/sides,2*math.pi*(k+1)/sides
   p=(x+r*math.cos(a),y,z+r*math.sin(a));q=(x+r*math.cos(b),y,z+r*math.sin(b));a1=(p[0],y+height,p[2]);b1=(q[0],y+height,q[2]);self.quad(p,q,b1,a1,mat);self.tri((x,y+height,z),a1,b1,mat)
 def rod(self,a,b,width,mat):
  # A square beam with vertical or horizontal width; two-axis frame built from tangent.
  d=[b[i]-a[i] for i in range(3)];l=math.sqrt(sum(x*x for x in d)) or 1;d=[x/l for x in d];u=[-d[2],0,d[0]];lu=math.sqrt(sum(x*x for x in u));u=[x/lu for x in u] if lu>.01 else [1,0,0];v=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]]
  rr=width/2;p=[tuple(a[i]+u[i]*rr*su+v[i]*rr*sv for i in range(3)) for su,sv in ((-1,-1),(1,-1),(1,1),(-1,1))];q=[tuple(b[i]+u[i]*rr*su+v[i]*rr*sv for i in range(3)) for su,sv in ((-1,-1),(1,-1),(1,1),(-1,1))]
  for i in range(4):j=(i+1)%4;self.quad(p[i],p[j],q[j],q[i],mat)
 def glb(self,name,path):
  bin_data=bytearray();views=[];accessors=[];primitives=[];material_ids=list(self.polys)
  for mat,vals in self.polys.items():
   if not vals:continue
   pos=[c for p,n in vals for c in p];nor=[c for p,n in vals for c in n]
   ids=[]
   for typ,seq in [('POSITION',pos),('NORMAL',nor)]:
    offset=len(bin_data);bin_data.extend(struct.pack('<%df'%len(seq),*seq));whilepad=(-len(bin_data))%4;bin_data.extend(b'\x00'*whilepad)
    view=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(seq)*4,'target':34962});acc=len(accessors);data={'bufferView':view,'componentType':5126,'count':len(vals),'type':'VEC3'}
    if typ=='POSITION':data['min']=[min(pos[i::3]) for i in range(3)];data['max']=[max(pos[i::3]) for i in range(3)]
    accessors.append(data);ids.append(acc)
   primitives.append({'attributes':{'POSITION':ids[0],'NORMAL':ids[1]},'mode':4,'material':material_ids.index(mat)})
  materials=[{'name':m,'pbrMetallicRoughness':{'baseColorFactor':COLORS[m],'metallicFactor':.85 if m=='steel' else .0,'roughnessFactor':.32 if m=='steel' else .75},'doubleSided':False} for m in material_ids]
  root={'asset':{'generator':'TrussLab original / '+name,'version':'2.0'},'buffers':[{'byteLength':len(bin_data)}],'bufferViews':views,'accessors':accessors,'meshes':[{'name':name,'primitives':primitives}],'nodes':[{'mesh':0,'name':name}],'scenes':[{'nodes':[0]}],'scene':0,'materials':materials}
  j=json.dumps(root,separators=(',',':')).encode();j+=b' '*((-len(j))%4);bin_data.extend(b'\x00'*(-len(bin_data)%4));size=12+8+len(j)+8+len(bin_data)
  blob=struct.pack('<III',0x46546c67,2,size)+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(bin_data),0x004e4942)+bin_data
  path.write_bytes(blob);return len(blob),sum(len(v)//3 for v in self.polys.values())
def make_lighthouse(lod):
 m=Model();n=18 if lod=='high' else 8
 m.cylinder(0,0,0,5,2,n,'concrete');m.cylinder(0,2,0,3.3,23,n,'concrete');m.cylinder(0,25,0,4.1,1.4,n,'steel');m.cylinder(0,26.4,0,2.7,4,n,'glass');m.cylinder(0,30.4,0,3.8,1,n,'roof_red');m.rod((0,31,0),(0,35,0),.33,'steel')
 if lod=='high':
  for a in range(0,360,30):
   rad=math.radians(a);x=3.8*math.cos(rad);z=3.8*math.sin(rad);m.rod((x,26.5,z),(x,29.9,z),.17,'steel')
  for y in (6,11,16,21):m.box(0,y,-3.38,1.25,1.6,.2,'glass')
 return m
def make_warehouse(lod):
 m=Model();m.box(0,0,0,26,9,18,'brick');m.box(0,9,0,27,1.0,19,'steel');m.box(0,10,0,28,2.0,10,'roof_red');
 if lod=='high':
  for x in (-9,-3,3,9):
   for y in (2,5):m.box(x,y,-9.12,2.4,1.9,.25,'glass')
  for x in (-8,0,8):m.box(x,0,9.2,3.6,5,.28,'steel')
  for x in (-11,11):m.rod((x,0,-9.3),(x,10,-9.3),.4,'concrete')
 return m
def make_crane(lod):
 m=Model();m.box(0,0,0,9,2,11,'dark')
 for x in (-3.4,3.4):
  for z in (-4.3,4.3):m.rod((x,2,z),(x,32,z),.55,'steel')
 m.box(0,32,0,10,2,10,'steel');m.rod((-25,34,0),(23,34,0),1.1,'steel');m.rod((-25,34,0),(-3,45,0),.6,'steel');m.rod((-3,45,0),(23,34,0),.6,'steel');m.rod((-3,34,0),(-3,47,0),.6,'steel');m.rod((15,34,0),(15,17,0),.18,'dark');m.box(15,16,0,4,.8,4,'dark')
 if lod=='high':
  for z in (-4.3,4.3):
   for y in range(2,29,7):
    m.rod((-3.4,y,z),(3.4,y+7,z),.25,'steel');m.rod((3.4,y,z),(-3.4,y+7,z),.25,'steel')
  for x in range(-24,21,7):m.rod((x,34,0),(x+5,36,0),.19,'steel')
 return m
bundled=[]
for name,make in [('lighthouse',make_lighthouse),('warehouse',make_warehouse),('crane',make_crane)]:
 variants={}
 for detail in ('low','high'):
  path=OUT/f'{name}_{detail}.glb';size,tris=make(detail).glb(name+' '+detail,path);variants[detail]=base64.b64encode(path.read_bytes()).decode();print(path.name,'bytes',size,'tri',tris)
 bundled.append({'id':name,'label':{'lighthouse':'Маяк','warehouse':'Склад','crane':'Портовый кран'}[name],'variants':variants,'license':'TrussLab original, CC0 demo geometry, not a surveyed landmark'})
js='/** Embedded ORIGINAL GLB 2.0 demo assets, no external requests. */\nexport const BUILTIN_GLB_ASSETS='+json.dumps(bundled,ensure_ascii=False,separators=(',',':'))+';\n'
(Path(__file__).resolve().parents[1]/'js/bundled_assets.js').write_text(js,encoding='utf8')
