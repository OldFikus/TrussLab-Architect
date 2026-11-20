/* WorldEditor 2 -> Region3D bridge. New user-authored layers share the ENU
 * terrain streaming engine. DEM stays immutable; brush offsets alter temporary
 * GPU terrain vertices only. Cache changes occur on edits, never on traffic ticks. */
(function(){'use strict';
if(typeof region3d==='undefined'||!globalThis.trusslabEditor||typeof metricGround!=='function')return;
const editor=globalThis.trusslabEditor;const SCALE=600,chunkName=(x,z)=>Math.floor(x/SCALE)+':'+Math.floor(z/SCALE);
const MAT={concrete:5,brick:6,steel:8,glass:8,wood:9,asphalt:7};
function appendMeshes(){const meshes=new Map();
 const pushTri=(chunk,a,b,c,mat)=>{const a0=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],b0=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  let n=[a0[1]*b0[2]-a0[2]*b0[1],a0[2]*b0[0]-a0[0]*b0[2],a0[0]*b0[1]-a0[1]*b0[0]],len=Math.hypot(...n)||1;n=n.map(x=>x/len);
  for(const p of [a,b,c])chunk.a.push(...p,...n,mat);
 };
 function areaAt(x,z){const tx=Math.floor(x/SCALE),tz=Math.floor(z/SCALE),key=tx+':'+tz;
  if(!meshes.has(key))meshes.set(key,{a:[],originX:tx*SCALE,originZ:tz*SCALE,tiles:[tx,tz]});return meshes.get(key);}
 function local(p,t){return [p[0]-t.originX,p[1],p[2]-t.originZ];}
 const quad=(tile,a,b,c,d,mat)=>{pushTri(tile,local(a,tile),local(b,tile),local(c,tile),mat);pushTri(tile,local(a,tile),local(c,tile),local(d,tile),mat)};
 function box(x,y,z,w,h,l,mat){const tile=areaAt(x,z),a=x-w/2,b=x+w/2,c=z-l/2,d=z+l/2,lo=y,hi=y+h;
  // Outward-facing winding is essential: inverted normals previously
  // caused pitch-black roads and facades in this project's renderer.
  quad(tile,[a,hi,c],[a,hi,d],[b,hi,d],[b,hi,c],mat);
  quad(tile,[a,lo,c],[b,lo,c],[b,lo,d],[a,lo,d],mat);
  quad(tile,[a,lo,c],[a,hi,c],[b,hi,c],[b,lo,c],mat);
  quad(tile,[b,lo,d],[b,hi,d],[a,hi,d],[a,lo,d],mat);
  quad(tile,[a,lo,d],[a,hi,d],[a,hi,c],[a,lo,c],mat);
  quad(tile,[b,lo,c],[b,hi,c],[b,hi,d],[b,lo,d],mat);
 }
 function pointXZ(p){const [lon,lat]=editor.geographic(p[0],p[1]);const m=geographicToMetric(lat,lon);return [m.x,m.z]}
 const terrain=(x,z)=>{const g=metricGround(region3d.geoPack,x,z);return g.measured?(g.height+editor.terrainOffset(x,z)):0};
 for(const o of editor.objects){
  if(o.type==='building'){
   const [x,z]=pointXZ([o.x,o.z]),g=metricGround(region3d.geoPack,x,z);if(!g.measured||!g.land)continue;
   const effective=editor.effectiveMaterial(o);let p=o,seen=new Set();while(p.inheritMaterial&&p.parentId&&!seen.has(p.id)){seen.add(p.id);p=editor.objects.find(x=>x.id===p.parentId)||p;if(seen.has(p.id))break;}const base=editor.materials[p.material]?.base||p.material;const mat=MAT[base]??5,fl=Math.min(60,Math.max(1,o.floors||1)),h=3.1*fl;
   box(x,terrain(x,z),z,Math.max(2,o.width),h,Math.max(2,o.length),mat);
   if(o.catalogId==='house'||o.catalogId==='school'||o.catalogId==='station'){
    const base=terrain(x,z)+h,ridge=base+Math.min(4.5,Math.max(1.5,o.length*.18)),w=o.width,l=o.length,t=areaAt(x,z),roofmat=8;
    quad(t,[x-w/2,base,z-l/2],[x-w/2,base,z+l/2],[x,ridge,z+l/2],[x,ridge,z-l/2],roofmat);
    quad(t,[x,ridge,z-l/2],[x,ridge,z+l/2],[x+w/2,base,z+l/2],[x+w/2,base,z-l/2],roofmat);
   }
   if(o.facade==='glass'){box(x,terrain(x,z)+1,z,Math.max(1,o.width-.6),h-1,Math.max(1,o.length-.6),8);}
  }else if(['road','sidewalk','rail','interchange','switch','utility'].includes(o.type)&&o.points?.length>=2){
   const w=Math.max(.4,Number(o.width||2)),mat=o.type==='utility'?9:o.type==='road'||o.type==='interchange'?7:o.type==='sidewalk'?5:8;
   for(let i=1;i<o.points.length;i++){
    const [x0,z0]=pointXZ(o.points[i-1]),[x1,z1]=pointXZ(o.points[i]);
    let length=Math.hypot(x1-x0,z1-z0);if(length<.1)continue;
    let nx=(z1-z0)/length,nz=-(x1-x0)/length;
    // To avoid a single huge world tile, subdivide routes along the ground.
    const n=Math.max(1,Math.ceil(length/100));for(let k=0;k<n;k++){
     const u=k/n,v=(k+1)/n,ax=x0+(x1-x0)*u,az=z0+(z1-z0)*u,bx=x0+(x1-x0)*v,bz=z0+(z1-z0)*v;
     const y0=terrain(ax,az)+(.22),y1=terrain(bx,bz)+(.22),t=areaAt((ax+bx)/2,(az+bz)/2);
     quad(t,[ax+nx*w*.5,y0,az+nz*w*.5],[ax-nx*w*.5,y0,az-nz*w*.5],[bx-nx*w*.5,y1,bz-nz*w*.5],[bx+nx*w*.5,y1,bz+nz*w*.5],mat);
     if(o.type==='rail'){for(const sgn of [-.3,.3]){quad(t,[ax+nx*w*sgn,y0+.10,az+nz*w*sgn],[ax+nx*w*(sgn+.04),y0+.10,az+nz*w*(sgn+.04)],[bx+nx*w*(sgn+.04),y1+.10,bz+nz*w*(sgn+.04)],[bx+nx*w*sgn,y1+.10,bz+nz*w*sgn],8);}}
    }
   }
  }
 }
 const result=[];
 for(const tile of meshes.values()){
  if(!tile.a.length)continue;const array=new Float32Array(tile.a);
  result.push({array,count:array.length/7,triangles:array.length/21,originX:tile.originX,originZ:tile.originZ,tileSpan:SCALE,projection:'ENU',source:'WorldEditor 2',detail:'high'});
 }
 return result;
}
const baseStream=region3d._stream.bind(region3d),baseBuffer=region3d._makeBuffer.bind(region3d);
region3d._makeBuffer=function(obj){
 if(obj?.projection==='ENU'&&obj.lod&&editor.terrain.length&&obj.array){
  // Recompute the visible geometry for user terrain edits, leaving original
  // Copernicus DEM samples and imported data objects untouched.
  const a=new Float32Array(obj.array);
  for(let i=0;i<a.length;i+=7){const mat=a[i+6];if(mat<3){let wx=obj.originX+a[i],wz=obj.originZ+a[i+2];a[i+1]+=editor.terrainOffset(wx,wz);}}
  for(let i=0;i<a.length;i+=21){const u=[a[i+7]-a[i],a[i+8]-a[i+1],a[i+9]-a[i+2]],v=[a[i+14]-a[i],a[i+15]-a[i+1],a[i+16]-a[i+2]];
   let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;
   for(const k of [i,i+7,i+14]){a[k+3]=n[0]/length;a[k+4]=n[1]/length;a[k+5]=n[2]/length;}
  }
  obj={...obj,array:a};
 }
 return baseBuffer(obj);
};
region3d._stream=function(){
 if(this.worldEditorRevision!==editor.revision){
  // The edit changes scene geometry, not the legacy static bridge, asset
  // library, coastline, or source DEM. Release old buffers before rebuilding.
  for(const tile of this.worldEditorBuffers||[]){if(this.gl&&tile.buffer)this.gl.deleteBuffer(tile.buffer);this.webgpu?.release(tile)}
  this.worldEditorBuffers=appendMeshes().map(t=>this.gl?this._makeBuffer(t):t);
  this.worldEditorRevision=editor.revision;
  if(editor.terrain.length){for(const t of this.terrainCache.values()){if(this.gl&&t.buffer)this.gl.deleteBuffer(t.buffer);this.webgpu?.release(t)}this.terrainCache.clear();}
 }
 baseStream();const cx=this.cam.x,cz=this.cam.z;
 for(const t of this.worldEditorBuffers||[]){const dx=t.originX+SCALE*.5-cx,dz=t.originZ+SCALE*.5-cz;
  if(Math.abs(dx)<3000&&Math.abs(dz)<3000)this.visibleModels.push(t);
 }
};
})();
