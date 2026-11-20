"""QA-only 2D overlay of actual GeoPack sea mask and the TerraBuild example.
Not a screenshot of the runtime, nor a surveyed city map.
"""
import base64,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import numpy as np
root=Path(__file__).resolve().parents[1]
geo=json.loads((root/'data/kerch_geopack.json').read_text())
preview=json.loads((root/'assets/terrabuild_preview_data.json').read_text())
n=geo['gridSize']; raw=np.frombuffer(base64.b64decode(geo['coast']['data']),dtype=np.uint8).reshape((n,n))
land=raw>128;pixels=np.zeros((n,n,3),dtype=np.uint8)
pixels[~land]=[30,99,114];pixels[land]=[137,159,119]
for j in range(n):
 for i in range(n):
  if land[j,i]:
   r=((i*89+j*43)%37)/37
   pixels[j,i]=[int(126+19*r),int(149+19*r),int(108+19*r)]
   if 0<j<n-1 and 0<i<n-1 and not all(land[j-1:j+2,i-1:i+2].flat):pixels[j,i]=[197,182,130]
# terrain mask comes from the user's GeoPack, not drawn by hand
MAP=835;LEFT=35;TOP=37
base=Image.new('RGB',(1200,910),(13,36,47))
tex=Image.fromarray(pixels,'RGB').resize((MAP,MAP),Image.Resampling.NEAREST)
base.paste(tex,(LEFT,TOP));d=ImageDraw.Draw(base)
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
f=ImageFont.truetype(fontpath,19);fs=ImageFont.truetype(fontpath,13);fb=ImageFont.truetype(fontpath,27)
S=preview['worldSize'];p=lambda x,z:(LEFT+(x/S+.5)*MAP,TOP+(z/S+.5)*MAP)
for name,pts,color,width in [('road',preview['axes']['road'],'#ffd197',5),('rail',preview['axes']['rail'],'#d6edf1',3)]:d.line([p(x,z) for x,z in pts],fill=color,width=width,joint='curve')
colors={'house':'#e9be97','apartment':'#ef9d7e','warehouse':'#b7dce1','tree':'#4be083','lamp':'#e6d572'}
for item in preview['items']:
 x,z=p(item['x'],item['z']);color=colors[item['type']]
 if item['type'] in ('tree','lamp'):
  r=4 if item['type']=='tree' else 2;d.ellipse((x-r,z-r,x+r,z+r),fill=color,outline='#0c2833',width=1)
 else:
  r=5 if item['type']=='house' else 7;d.rectangle((x-r,z-r,x+r,z+r),fill=color,outline='#0d3741',width=1)
# correction for tree y variable
for x,z,label in [(-177,-30,'КЕРЧЬ'),(-15,21,'ТУЗЛА'),(158,-25,'ТАМАНЬ')]:
 q=p(x,z);d.text((q[0],q[1]),label,font=fs,fill='#ffffff',stroke_width=2,stroke_fill='#193744')
SIDE=895
d.text((SIDE,55),'TRUSSLAB',font=fb,fill='#e6f2ee')
d.text((SIDE,92),'10.1 TerraBuild',font=f,fill='#8ae5c5')
d.line((SIDE,130,1170,130),fill='#486978',width=2)
for i,line in enumerate([f'{preview["count"]} игровых объектов','на базе GeoPack','OSM + GLO-30','', 'Условные кварталы,','не реальные дома.','', 'Авто: золотой','Ж/Д: светло-голубой','', 'Дома: бежевый','Квартиры: коралловый','Склады: голубой','Деревья: зелёный']):
 d.text((SIDE,154+i*39),line,font=fs if i not in (0,1,2) else f,fill='#e3efea' if i else '#ffda89')
d.text((35,889),'Предпросмотр маски и размещения · НЕ скриншот 3D · WGS84-привязка условная',font=fs,fill='#a4c8c5')
output=root/'assets/terrabuild_preview_10_1.png';base.save(output,optimize=True)
print(output,output.stat().st_size)
