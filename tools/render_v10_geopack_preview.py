"""Offline map preview of the user's authentic GeoPack and the still-illustrative route."""
import base64,json,numpy as np
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
P=Path(__file__).resolve().parents[1]
g=json.loads((P/'data/kerch_geopack.json').read_text('utf8'))
n=g['gridSize'];mask=np.frombuffer(base64.b64decode(g['coast']['data']),dtype=np.uint8).reshape(n,n)/255.0
height=np.frombuffer(base64.b64decode(g['dem']['data']),dtype='<i2').reshape(n,n).astype(np.float32)*float(g['dem']['scaleMetres'])
# Preserve geographic orientation of the packed grid. Crop only vertical outskirts for 16:9 view.
zmin,zmax=-145,145;y0=int((zmin/g['sceneSize']+.5)*n);y1=int((zmax/g['sceneSize']+.5)*n)
land=mask[y0:y1];dem=height[y0:y1]
H,W=land.shape
# DSM-shaded land + coastal watercolor tint; procedural visualization only (NOT aerial imagery).
gradx=np.gradient(dem,axis=1);grady=np.gradient(dem,axis=0)
slope=np.sqrt(gradx**2+grady**2)
shade=np.clip(.92-.03*slope, .46,1)
ny=np.arange(H)[:,None]
xs=np.arange(W)[None,:]
waterwave=np.sin(xs*.09+ny*.05)*.022+np.sin(xs*.014-ny*.11)*.012
rgb=np.zeros((H,W,3),np.uint8)
for k,(wet,dry) in enumerate(zip((28,87,103),(118,151,99))):
 sea=wet+(5 if k==1 else 2)*waterwave*25
 landcol=(dry+np.clip(dem,0,80)*(0.4 if k==0 else -0.1))*shade
 rgb[...,k]=np.clip(sea*(1-land)+landcol*land,0,255)
img=Image.fromarray(rgb,'RGB').resize((1200,828),Image.Resampling.BILINEAR)
# Image water and land crisp edge at source resolution; avoid inventing extra coastline pixels.
edge=Image.fromarray(np.uint8(land*255),'L').resize((1200,828),Image.Resampling.NEAREST)
# Do not actually modify the coast, just overlay water according to classified mask.
d=ImageDraw.Draw(img,'RGBA')
fontpaths=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']
fontpath=next(x for x in fontpaths if Path(x).exists())
ft=lambda size:ImageFont.truetype(fontpath,size)
world=420
xy=lambda x,z:(round((x/world+.5)*1200),round(((z-zmin)/(zmax-zmin))*828))
left,right=-160.5,156
center=lambda x:-3.2+5*np.sin((x+30)*.024)+1.35*np.sin(x*.062)
for side,col in ((-4.05,(248,195,119,255)),(4.10,(111,228,205,255))):
 points=[xy(float(x),float(center(x)+side)) for x in np.linspace(left,right,500)]
 d.line(points,fill=(12,33,41,255),width=10,joint='curve')
 d.line(points,fill=col,width=5,joint='curve')
 for x in (left,right):
  X,Y=xy(x,float(center(x)+side));d.ellipse((X-7,Y-7,X+7,Y+7),fill=col,outline=(255,255,255,255),width=3)
# Arch highlight exactly matches current v10 illustrative segment.
ax,ay=xy(-84,float(center(-84)));bx,by=xy(-56,float(center(-56)))
d.rounded_rectangle((ax-6,ay-40,bx+6,ay+40),radius=6,outline=(255,255,235,255),width=3)
for x,z,text in [(-173,-42,'КРЫМ · КЕРЧЬ'),(155,-56,'ТАМАНЬ'),(-26,76,'ТУЗЛИНСКИЙ УЧАСТОК'),(-83,-45,'АРОЧНЫЙ УЧАСТОК')]:
 tx,ty=xy(x,z);d.text((tx,ty),text,fill=(247,251,242,255),font=ft(19),stroke_width=3,stroke_fill=(15,39,46,255))
# Caption band is explicitly a GIS schematic, not a photoreal image.
footer=Image.new('RGB',(1200,118),(11,34,43));fd=ImageDraw.Draw(footer)
fd.text((22,15),'TRUSSLAB 10.0   /   КРЫМ — ТУЗЛА — ТАМАНЬ',font=ft(24),fill=(247,239,223))
fd.text((22,57),'Берега: OSM-производный архив ≈2017   •   Высоты: Copernicus GLO-30   •   суша 35,99%',font=ft(17),fill=(176,221,214))
fd.text((22,86),'Ось = игровая подгонка ≈25,5 км, НЕ проектная трасса моста ≈19 км. Геопривязка по 1 точке.',font=ft(15),fill=(246,202,145))
final=Image.new('RGB',(1200,946));final.paste(img,(0,0));final.paste(footer,(0,828))
out=P/'assets/geopack_10_alignment_preview.png';final.save(out,optimize=True)
print(out,final.size)
