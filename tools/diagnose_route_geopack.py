#!/usr/bin/env python3
"""Read-only TrussLab GeoPack route/shore sanity check.

Emits a coastline overlay PNG and Russian text report, touching neither OSM nor
Copernicus layers. The default route mirrors the ILLUSTRATIVE 9.4 fallback, and
an exported real/edit GeoJSON route can optionally be supplied.
"""
from __future__ import annotations
import argparse, base64, json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

LAT0,LON0=45.308440,36.506491
AX,AZ,MPP=-118.0,-8.6447513,80.0
THETA=math.radians(-24)
C,S=math.cos(THETA),math.sin(THETA)
MLAT=111132.92
MLON=111412.84*math.cos(math.radians(LAT0))-93.5*math.cos(3*math.radians(LAT0))

def geo_to_scene(lats,lons):
    east=(np.asarray(lons)-LON0)*MLON
    north=(np.asarray(lats)-LAT0)*MLAT
    return AX+(east*C+north*S)/MPP,AZ+(-east*S+north*C)/MPP

def scene_to_geo(x,z):
    dx=(x-AX)*MPP;dz=(z-AZ)*MPP
    east=dx*C-dz*S; north=dx*S+dz*C
    return LAT0+north/MLAT,LON0+east/MLON

def default_route(x,side):
    return -3.2+5*np.sin((x+30)*.024)+1.35*np.sin(x*.062)+side

def read_lines(path:Path):
    obj=json.loads(path.read_text('utf-8'))
    features=obj.get('features',[]) if obj.get('type')=='FeatureCollection' else [obj]
    routes={}
    for f in features:
        g=f.get('geometry',f);props=f.get('properties',{})
        if g.get('type')!='LineString':continue
        mode=str(props.get('mode',props.get('kind',''))).lower()
        if mode not in ('road','rail'):continue
        pts=np.asarray(g['coordinates'],dtype=float)
        if pts.ndim!=2 or pts.shape[0]<2 or pts.shape[1]<2:continue
        xx,zz=geo_to_scene(pts[:,1],pts[:,0]);ix=np.argsort(xx)
        x,z=xx[ix],zz[ix]
        uniq=np.concatenate(([True],np.diff(x)>.03))
        if np.sum(uniq)<2:continue
        routes[mode]=(x[uniq],z[uniq])
    return routes

def load_pack(path):
    obj=json.loads(path.read_text('utf-8'))
    if obj.get('type')!='TrussLabGeoPack' or obj.get('version')!=1:
        raise ValueError('Не TrussLabGeoPack v1')
    n=int(obj['gridSize']);size=float(obj['sceneSize'])
    coast=obj.get('coast')
    if not coast:raise ValueError('В GeoPack нет береговой маски. Пакет содержит только DEM?')
    a=np.frombuffer(base64.b64decode(coast['data'],validate=True),dtype='uint8')
    if len(a)!=n*n:raise ValueError('Размер маски не совпадает с N×N')
    return obj, a.reshape(n,n),size

def sample(mask,size,x,z):
    n=mask.shape[0]
    col=np.rint((x/size+.5)*(n-1)).astype(int)
    row=np.rint((z/size+.5)*(n-1)).astype(int)
    inside=(col>=0)&(row>=0)&(col<n)&(row<n)
    result=np.full(len(x),-1,dtype=np.int8)
    result[inside]=(mask[row[inside],col[inside]]>127).astype(np.int8)
    return result

def font(size):
    for f in ('C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:return ImageFont.truetype(f,size)
        except OSError:pass
    return ImageFont.load_default()

def diagnose(mask,size,route_file=None):
    xs=np.linspace(-118,118,513)
    others=read_lines(route_file) if route_file else {}
    diag={}
    for name,side in [('road',-4.05),('rail',4.1)]:
        zs=default_route(xs,side)
        if name in others:
            a,b=others[name];zs=np.interp(xs,a,b,left=np.nan,right=np.nan)
        valid=np.isfinite(zs)
        cl=np.full(len(xs),-1,dtype=np.int8)
        cl[valid]=sample(mask,size,xs[valid],zs[valid])
        good=cl>=0
        transitions=int(np.count_nonzero((cl[1:]!=cl[:-1])&good[1:]&good[:-1]))
        denom=int(good.sum());land=int((cl==1).sum());water=int((cl==0).sum());outside=int((cl==-1).sum())
        diag[name]={
         'xs':xs,'zs':zs,'cls':cl,'land':land,'water':water,'outside':outside,
         'land_percent':round(land/denom*100,1) if denom else None,
         'crossings':transitions,'start_land':int(cl[0]),'end_land':int(cl[-1]),
         'start_geo':scene_to_geo(xs[0],zs[0]) if np.isfinite(zs[0]) else None,
         'end_geo':scene_to_geo(xs[-1],zs[-1]) if np.isfinite(zs[-1]) else None,
        }
    return diag

def nearest_land(mask,size,x,z):
    land=np.argwhere(mask>127)
    if not len(land):return None
    n=len(mask);step=size/n
    xx=(land[:,1]+.5)*step-size/2;zz=(land[:,0]+.5)*step-size/2
    d2=(xx-x)**2+(zz-z)**2;ix=int(np.argmin(d2))
    return round(math.sqrt(float(d2[ix]))*MPP/1000,2)

def preview(mask,size,diag,path):
    n=mask.shape[0]
    sea=np.array([33,90,110],dtype=np.uint8);land=np.array([111,149,100],dtype=np.uint8)
    rgb=np.where((mask>127)[...,None],land,sea).astype(np.uint8)
    # Keep exact pixel registration while making the overlay large enough to inspect.
    im=Image.fromarray(rgb,'RGB').resize((1024,1024),Image.Resampling.NEAREST)
    d=ImageDraw.Draw(im)
    def xy(x,z):return ((x/size+.5)*1024,(z/size+.5)*1024)
    for name,stats in diag.items():
        x=stats['xs'];z=stats['zs'];cls=stats['cls']
        for k in range(len(x)-1):
            if not np.isfinite(z[k]) or not np.isfinite(z[k+1]):continue
            color='#63ffaa' if cls[k]==1 else '#ff6c6c' if cls[k]==0 else '#ffe0a0'
            d.line([xy(x[k],z[k]),xy(x[k+1],z[k+1])],fill='#142934',width=7)
            d.line([xy(x[k],z[k]),xy(x[k+1],z[k+1])],fill=color,width=4)
        for idx,tag in ((0,'KERCH'),(-1,'TAMAN')):
            if not np.isfinite(z[idx]):continue
            X,Y=xy(x[idx],z[idx]);d.ellipse((X-6,Y-6,X+6,Y+6),fill='#ffffff',outline='#162e39',width=2)
            d.text((X+9,Y-19),name.upper()+' '+tag,fill='#ffffff',font=font(15),stroke_width=2,stroke_fill='#172a37')
    d.rectangle((12,12,760,107),fill='#102a36')
    d.text((24,22),'TrussLab 9.4 route / coastline QA',font=font(23),fill='#f6ebd6')
    d.text((24,57),'GREEN = land   RED = water   WHITE = endpoints',font=font(16),fill='#c9e6e3')
    d.text((24,80),'Single-anchor approximate georef; NOT surveyed alignment',font=font(13),fill='#a6c0c5')
    im.save(path)

def main():
    ap=argparse.ArgumentParser(description='Read-only route versus GeoPack coast diagnostic. No internet used.')
    ap.add_argument('--geopack',type=Path,default=Path('data/kerch_geopack.json'))
    ap.add_argument('--route',type=Path,help='Optional route GeoJSON exported from TrussLab')
    ap.add_argument('--output',type=Path,help='Output PNG (defaults alongside GeoPack)')
    args=ap.parse_args()
    if not args.geopack.exists():ap.error('GeoPack not found: '+str(args.geopack))
    _,mask,size=load_pack(args.geopack)
    diag=diagnose(mask,size,args.route)
    out=args.output or args.geopack.with_name('kerch_route_alignment.png')
    out.parent.mkdir(parents=True,exist_ok=True)
    preview(mask,size,diag,out)
    land_pct=float(np.mean(mask>127)*100)
    lines=[f'GeoPack: {args.geopack}',f'Суша всей карты: {land_pct:.1f}%',
           'Ось: '+(str(args.route) if args.route else 'УСЛОВНАЯ ось TrussLab 9.4; НЕ реальная трассировка'),
           'Координаты WGS84 приблизительные; одна опорная точка; не инженерная съемка.']
    for name,s in diag.items():
        lines += [f'--- {name.upper()} ---',
                  f"По суше: {s['land_percent']}%; пересечений: {s['crossings']}; вода: {s['water']}; суша: {s['land']}; вне маски: {s['outside']}"]
        for which,i in [('Керчь',0),('Тамань',-1)]:
            c=int(s['cls'][i]);classif='суша' if c==1 else 'вода' if c==0 else 'вне карты'
            d=nearest_land(mask,size,float(s['xs'][i]),float(s['zs'][i])) if c==0 and np.isfinite(s['zs'][i]) else None
            coords=s['start_geo'] if i==0 else s['end_geo']
            text=f'{which}: {classif}'
            if coords is not None:text+=f'; WGS84≈ {coords[0]:.6f}, {coords[1]:.6f}'
            if d is not None:text+=f'; ближайшая суша ≈ {d} км'
            lines.append(text)
    if all(v['land']==0 and v['water']>0 for v in diag.values()):
        lines.append('ВЫВОД: обе оси полностью в воде внутри карты. Требуется привязка ТРАССЫ, не повторная загрузка DEM.')
    lines.append('Исходный GeoPack не изменялся.')
    text='\n'.join(lines)+'\n';out.with_suffix('.txt').write_text(text,encoding='utf-8')
    print(text);print('Карта с наложением:',out);print('Текстовый отчет:',out.with_suffix('.txt'))

if __name__=='__main__':main()
