/* TrussLab 15.10 / WorldStream visual extension. Pure deterministic geometry and
 * fictional sandbox maths. No raster replacements, no downloaded dependencies.
 * For gameplay only: this does not add surveyed geography or 1:1 buildings. */
(function(root){'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const DIST=12000, CENTER=45000, HALF=DIST/2;
const range=(x,z)=>Math.abs(x-CENTER)<=HALF&&Math.abs(z-CENTER)<=HALF;
function syntheticGround(x,z,preset='hills'){
 if(!Number.isFinite(x)||!Number.isFinite(z)||!range(x,z))return null;
 const u=(x-CENTER),v=(z-CENTER);
 const n=Math.sin(u*.0023+1.9)*Math.cos(v*.0018-2)+Math.sin((u+v)*.0011)*.62+
  Math.cos(u*.00043-1.9)*Math.sin(v*.00056)*1.4;
 let height=17+n*5+Math.cos(u*.00019)*Math.sin(v*.00025)*8;
 if(preset==='plains')height=11+n*1.9;
 else if(preset==='coast'){height=8+n*2.5+u*.004;}
 else height=25+n*9+Math.cos(u*.0004)*Math.sin(v*.00021)*22;
 const land=height>0.4;
 return {height:land?height:-.48,land,measured:true,source:'TrussLab procedural sandbox · synthetic, not GIS'};
}
function hash(str){let h=2166136261;for(const c of String(str)){h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;}return h>>>0;}
function roadsFromEditor(objects,convert){const paths=[];
 for(const o of objects){if(!['road','rail','interchange'].includes(o.type)||!Array.isArray(o.points)||o.points.length<2)continue;
  const converted=o.points.map(p=>convert(p)).filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
  for(let i=1;i<converted.length;i++){
   const a=converted[i-1],b=converted[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<9||length>20000)continue;
   paths.push({id:o.id+':'+i,type:o.type,a,b,length,width:o.width||8,speedKph:clamp(Number(o.speedKph)||40,10,100),seed:hash(o.id+':'+i)});
  }
 }
 return paths;
}
function vehiclePlan(paths,cam,{density=.55,maxAgents=70,limit=1700,clock=0,slow=1}={}){
 if(!(density>0)||!(maxAgents>0))return [];
 const options=[];const max=Math.max(0,Math.min(120,Math.floor(maxAgents)));
 for(const path of paths){
  // Distance from camera to finite segment, not just its midpoint.
  const dx=path.b[0]-path.a[0],dz=path.b[1]-path.a[1];const denom=dx*dx+dz*dz||1;
  const t=clamp(((cam[0]-path.a[0])*dx+(cam[1]-path.a[1])*dz)/denom,0,1);
  const d=Math.hypot(cam[0]-path.a[0]-dx*t,cam[1]-path.a[1]-dz*t);
  if(d>limit)continue;
  const desired=Math.max(0,Math.ceil(path.length/(path.type==='rail'?550:120)*density));
  for(let i=0;i<desired&&i<70;i++){
   const seed=hash(path.seed+'|'+i),along0=(i+.25+(seed%43)/100)/desired;
   options.push({segment:path,idx:i,d,seed,along0});
  }
 }
 options.sort((a,b)=>a.d-b.d||a.seed-b.seed);
 return options.slice(0,max).map(item=>{
  const p=item.segment;const speed=(p.type==='rail'?clamp(p.speedKph,20,90):p.speedKph)*1000/3600*clamp(slow,.08,1);
  const t=((item.along0 + clock*speed/p.length)%1+1)%1;
  const backward=(item.seed&1)===1;
  const pos=backward?1-t:t;
  const vx=(p.b[0]-p.a[0])/p.length*(backward?-1:1),vz=(p.b[1]-p.a[1])/p.length*(backward?-1:1);
  return {id:p.id+'#'+item.idx,x:p.a[0]+(p.b[0]-p.a[0])*pos,z:p.a[1]+(p.b[1]-p.a[1])*pos,dirX:vx,dirZ:vz,type:p.type==='rail'?'train':((item.seed%12)<2?'bus':(item.seed%13===0?'truck':'car')),width:p.width||8,seed:item.seed};
 });
}
class MeshBatch{
 constructor(originX=0,originZ=0){this.data=[];this.originX=originX;this.originZ=originZ;this.quads=0;}
 tri(a,b,c,m){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;
  for(const v of [a,b,c])this.data.push(v[0]-this.originX,v[1],v[2]-this.originZ,nx/l,ny/l,nz/l,m);
 }
 quad(a,b,c,d,m){this.tri(a,b,c,m);this.tri(a,c,d,m);this.quads++;}
 // Oriented solid: the direction is longitudinal +front and thickness vertical.
 car(x,y,z,forwardX,forwardZ,length=4.4,width=1.9,height=1.45,body=8){const fx=forwardX,fz=forwardZ,rx=fz,rz=-fx,hw=width/2,hl=length/2;
  const q=(f,r,h)=>[x+fx*f+rx*r,y+h,z+fz*f+rz*r];
  const a=q(-hl,-hw,0),b=q(hl,-hw,0),c=q(hl,hw,0),d=q(-hl,hw,0),e=q(-hl,-hw,height),f=q(hl,-hw,height),g=q(hl,hw,height),h=q(-hl,hw,height);
  this.quad(e,f,g,h,body);this.quad(a,b,f,e,body);this.quad(d,h,g,c,body);this.quad(a,e,h,d,body);this.quad(b,c,g,f,body);
  // windscreen and rear window, using the renderer's glass emissive-at-night mat.
  this.quad(q(hl*.12,-hw-.025,height*.56),q(hl*.67,-hw-.025,height*.56),q(hl*.55,-hw-.025,height*.87),q(hl*.12,-hw-.025,height*.87),10);
  this.quad(q(hl*.12,hw+.025,height*.56),q(hl*.12,hw+.025,height*.87),q(hl*.55,hw+.025,height*.87),q(hl*.67,hw+.025,height*.56),10);
  return this;
 }
 buildingWindows(x,z,ground,width,length,floors,style='windows',maxWindows=110){
  const levels=Math.max(1,Math.min(50,Math.floor(floors))),h=levels*3.1,lim=Math.max(6,maxWindows);let made=0;
  const mat=style==='glass'?10:style==='panels'?8:10;
  for(const side of ['north','south','east','west']){
   const span=side==='north'||side==='south'?width:length,cols=Math.max(1,Math.min(12,Math.floor(span/5.4)));
   for(let floor=0;floor<levels;floor++)for(let col=0;col<cols;col++){
    if(made>=lim)return made;
    const u=(col+.5)/cols-.5,fy=ground+.95+floor*3.1,top=fy+(style==='glass'?1.90:1.36),half=Math.min(1.55,span/cols*.32);
    const face=side==='north'?-length/2-.09:side==='south'?length/2+.09:side==='west'?-width/2-.09:width/2+.09;
    if(side==='north'||side==='south'){
     const w=u*width;
     if(side==='north')this.quad([x+w-half,fy,z+face],[x+w-half,top,z+face],[x+w+half,top,z+face],[x+w+half,fy,z+face],mat);
     else this.quad([x+w-half,fy,z+face],[x+w+half,fy,z+face],[x+w+half,top,z+face],[x+w-half,top,z+face],mat);
    }else{
     const w=u*length;
     if(side==='west')this.quad([x+face,fy,z+w-half],[x+face,fy,z+w+half],[x+face,top,z+w+half],[x+face,top,z+w-half],mat);
     else this.quad([x+face,fy,z+w-half],[x+face,top,z+w-half],[x+face,top,z+w+half],[x+face,fy,z+w+half],mat);
    }
    made++;
   }
  }
  return made;
 }
 finalize(name='TrussLab WorldVisual',tileSpan=2600){const data=new Float32Array(this.data);return {array:data,count:data.length/7,triangles:data.length/21,originX:this.originX,originZ:this.originZ,tileSpan,projection:'ENU',detail:'high',source:name};}
}
root.TrussLabWorldVisualCore={CENTER,DIST,HALF,syntheticGround,hash,roadsFromEditor,vehiclePlan,MeshBatch};
})(typeof globalThis!=='undefined'?globalThis:this);
