/* CPU fallback for the same interleaved position/normal/material meshes as WebGL.
   Bound the pixel buffer instead of dropping faces from connected surfaces. */
class SoftwareSceneRenderer {
 constructor(){
  this.surface=document.createElement('canvas');
  this.context=this.surface.getContext('2d');
  this.palette=['49694b','bfa87c','765c46','353f49','9da9a6','72868c','3989a9','547177','756f69','8d8880','deded2','52616c','769dad','a89472','435c65','44704c','eed2a2','35393e','b9cbd0','bd5742','d0ded7','bad0dc','a76f48','e6c083','b8d1cf','83b99b','354b54','a57d54'].map(hex=>parseInt(hex,16));
  this.vertices=new Float64Array(9);
  this.clipped=new Float64Array(12);
 }
 // Clip in camera space so a surface crossing the eye plane stays continuous.
 clip(vertices){
  let n=0;
  for(let i=0,j=6;i<9;j=i,i+=3){
   const a=vertices[j+2],b=vertices[i+2];
   if((a>=.20)!==(b>=.20)){
    const t=(.20-a)/(b-a);
    this.clipped[n++]=vertices[j]+t*(vertices[i]-vertices[j]);
    this.clipped[n++]=vertices[j+1]+t*(vertices[i+1]-vertices[j+1]);
    this.clipped[n++]=.20;
   }
   if(b>=.20){this.clipped[n++]=vertices[i];this.clipped[n++]=vertices[i+1];this.clipped[n++]=b;}
  }
  return n;
 }
 triangle(v,b,c,r,g,blue){
  const ax=v[0],ay=v[1],az=v[2],bx=v[b],by=v[b+1],bz=v[b+2],cx=v[c],cy=v[c+1],cz=v[c+2];
  const dx=bx-ax,dy=by-ay,ex=cx-ax,ey=cy-ay,area=dx*ey-dy*ex;
  if(Math.abs(area)<1e-8)return false;
  const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(this.width-1,Math.floor(Math.max(ax,bx,cx)-.5));
  const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(this.height-1,Math.floor(Math.max(ay,by,cy)-.5));
  if(x1<x0||y1<y0)return false;
  const du=ey/area,dv=-dy/area,rgba=this.image.data;
  for(let y=y0;y<=y1;y++){
   const yy=y+.5-ay,xx=x0+.5-ax;
   let u=(xx*ey-yy*ex)/area,vv=(dx*yy-dy*xx)/area;
   for(let x=x0,index=y*this.width+x0;x<=x1;x++,index++,u+=du,vv+=dv){
    if(u<-.000001||vv<-.000001||u+vv>1.000001)continue;
    const depth=az+u*(bz-az)+vv*(cz-az);
    if(depth<=this.depth[index])continue;
    this.depth[index]=depth;
    const k=index*4;rgba[k]=r;rgba[k+1]=g;rgba[k+2]=blue;rgba[k+3]=255;
   }
  }
  return true;
 }
 draw(scene,w,h){
  const scale=Math.min(1,Math.sqrt(230400/(w*h)));
  const W=Math.max(1,Math.round(w*scale)),H=Math.max(1,Math.round(h*scale));
  if(W!==this.width||H!==this.height){
   this.width=this.surface.width=W;this.height=this.surface.height=H;
   this.image=this.context.createImageData(W,H);this.depth=new Float32Array(W*H);
  }
  this.depth.fill(0);this.image.data.fill(0);
  const f=H/(2*Math.tan(Math.PI/6)),eye=scene.eye,{forward,right,up}=scene.cameraBasis();
  let drawn=0;
  for(const mesh of [scene.mesh.a,scene.buildingMesh.a,scene.trafficMesh.a]){
   for(let i=0;i+20<mesh.length;i+=21){
    const v=this.vertices;
    for(let k=i,j=0;j<9;k+=7,j+=3){
     const x=mesh[k]-eye[0],y=mesh[k+1]-eye[1],z=mesh[k+2]-eye[2];
     v[j]=x*right[0]+y*right[1]+z*right[2];
     v[j+1]=x*up[0]+y*up[1]+z*up[2];
     v[j+2]=x*forward[0]+y*forward[1]+z*forward[2];
    }
    const n=this.clip(v),p=this.clipped;
    if(n<9)continue;
    for(let j=0;j<n;j+=3){const inv=1/p[j+2];p[j]=W*.5+f*p[j]*inv;p[j+1]=H*.5-f*p[j+1]*inv;p[j+2]=inv;}
    const color=this.palette[Math.round(mesh[i+6])]??this.palette[0];
    const sun=Math.max(0,-.447*mesh[i+3]+.837*mesh[i+4]+.323*mesh[i+5]);
    const light=Math.max(.25,.76+.34*sun+scene.ambientLift)*(scene.daylight==='night'?.56:1);
    for(let j=3;j+5<n;j+=3)if(this.triangle(p,j,j+3,(color>>16)*light,((color>>8)&255)*light,(color&255)*light))drawn++;
   }
  }
  this.context.putImageData(this.image,0,0);
  scene.ctx.drawImage(this.surface,0,0,w,h);
  return drawn;
 }
}
