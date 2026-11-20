/** TrussLab AssetStream — safe, bounded subset of Khronos glTF 2.0 / GLB.
 * Imports triangle geometry, node transforms and material categories. No remote URIs,
 * scripts, texture downloads, animation, skins or glTF extensions are executed.
 */
const GLB_MAGIC=0x46546c67,GLB_JSON=0x4e4f534a,GLB_BIN=0x004e4942;
const GB_LIMITS={bytes:16_000_000,triangles:120_000,vertices:360_000,nodes:512};
const GB_COMP={5121:[1,'getUint8'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
const GB_TYPE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function gbMul(a,b){const r=new Float64Array(16);for(let c=0;c<4;c++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)r[4*c+i]+=a[4*k+i]*b[4*c+k];return r;}
function gbIdentity(){const r=new Float64Array(16);r[0]=r[5]=r[10]=r[15]=1;return r;}
function gbNodeMat(n){if(Array.isArray(n.matrix)){if(n.matrix.length!==16||!n.matrix.every(Number.isFinite))throw Error('GLB: invalid node matrix');return new Float64Array(n.matrix);}
 const [x,y,z,w]=n.rotation||[0,0,0,1],[sx,sy,sz]=n.scale||[1,1,1],[tx,ty,tz]=n.translation||[0,0,0];
 if(![x,y,z,w,sx,sy,sz,tx,ty,tz].every(Number.isFinite))throw Error('GLB: invalid transform');
 const m=gbIdentity();m[0]=(1-2*(y*y+z*z))*sx;m[1]=2*(x*y+w*z)*sx;m[2]=2*(x*z-w*y)*sx;
 m[4]=2*(x*y-w*z)*sy;m[5]=(1-2*(x*x+z*z))*sy;m[6]=2*(y*z+w*x)*sy;
 m[8]=2*(x*z+w*y)*sz;m[9]=2*(y*z-w*x)*sz;m[10]=(1-2*(x*x+y*y))*sz;
 m[12]=tx;m[13]=ty;m[14]=tz;return m;
}
function gbTransform(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function gbClassifyMaterial(m){const name=String(m?.name||'').toLowerCase(),p=m?.pbrMetallicRoughness||{},col=p.baseColorFactor||[.7,.7,.7,1];
 if(/glass|window|pane/.test(name))return 10;
 if(/road|black|tire|asphalt/.test(name))return 7;
 if(/steel|metal|beam|pipe|frame|silver/.test(name)||Number(p.metallicFactor||0)>.6)return 8;
 if(/roof|red|brick|rust/.test(name)||col[0]>col[1]*1.42)return 6;
 if(/sand|stone|concrete/.test(name))return 9;
 return 5;
}
/** @param {ArrayBuffer|Uint8Array} input */
export function decodeGLB(input,{maxBytes=GB_LIMITS.bytes,maxTriangles=GB_LIMITS.triangles}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input||[]);
 if(bytes.byteLength<20||bytes.byteLength>maxBytes)throw Error('GLB: file size exceeds limit or is empty');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(0,true)!==GLB_MAGIC||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)throw Error('GLB: expected glTF binary v2');
 let offset=12,json=null,bin=null;
 while(offset+8<=bytes.length){const size=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;if(size>bytes.length-offset||size%4)throw Error('GLB: corrupt chunk length');
  if(type===GLB_JSON){if(json)throw Error('GLB: duplicate JSON chunk');json=JSON.parse(new TextDecoder().decode(bytes.subarray(offset,offset+size)).trim());}
  if(type===GLB_BIN){if(bin)throw Error('GLB: duplicate BIN chunk');bin=new DataView(bytes.buffer,bytes.byteOffset+offset,size);}
  offset+=size;
 }
 if(offset!==bytes.length||!json||!bin)throw Error('GLB: missing JSON/BIN');
 if(String(json.asset?.version||'').split('.')[0]!=='2')throw Error('GLB: unsupported glTF version');
 if((json.extensionsRequired||[]).length)throw Error('GLB: extensionsRequired unsupported');
 if((json.buffers||[]).length!==1||json.buffers[0].uri)throw Error('GLB: single embedded BIN buffer required');
 if(json.buffers[0].byteLength>bin.byteLength)throw Error('GLB: truncated binary buffer');
 if((json.nodes||[]).length>GB_LIMITS.nodes)throw Error('GLB: too many nodes');
 function accessor(i){const a=json.accessors?.[i],b=json.bufferViews?.[a?.bufferView];if(!a||!b||b.buffer!==0||a.sparse)throw Error('GLB: unsupported accessor');
  const entry=GB_COMP[a.componentType],channels=GB_TYPE[a.type];if(!entry||!channels||a.count<1||a.count>GB_LIMITS.vertices)throw Error('GLB: invalid accessor type/count');
  const [step,method]=entry,stride=b.byteStride||step*channels,base=(b.byteOffset||0)+(a.byteOffset||0);
  if(stride<step*channels||base<0||base+(a.count-1)*stride+step*channels>bin.byteLength)throw Error('GLB: accessor outside BIN');
  return {count:a.count,channels,componentType:a.componentType,read(k){const row=[];for(let c=0;c<channels;c++)row.push(bin[method](base+k*stride+c*step,...(step>1?[true]:[])));return row;}};
 }
 const scene=json.scenes?.[json.scene??0],root=scene?.nodes;
 if(!Array.isArray(root))throw Error('GLB: no active scene');
 let triangleCount=0;const groups=[];const seenNodes=new Set();
 function walk(idx,parent,depth){if(depth>64)throw Error('GLB: node tree too deep');if(seenNodes.has(idx))throw Error('GLB: repeated/cyclic node');seenNodes.add(idx);
  const node=json.nodes?.[idx];if(!node)throw Error('GLB: node missing');const matrix=gbMul(parent,gbNodeMat(node));
  if(node.mesh!==undefined){const mesh=json.meshes?.[node.mesh];if(!mesh)throw Error('GLB: mesh missing');for(const pr of mesh.primitives||[]){if(pr.mode!==undefined&&pr.mode!==4)throw Error('GLB: triangles only');
   const pos=accessor(pr.attributes?.POSITION);if(pos.componentType!==5126||pos.channels!==3)throw Error('GLB: float32 POSITION required');
   const normals=pr.attributes?.NORMAL!==undefined?accessor(pr.attributes.NORMAL):null;if(normals&&(normals.componentType!==5126||normals.channels!==3||normals.count!==pos.count))throw Error('GLB: invalid normals');
   const indices=pr.indices!==undefined?accessor(pr.indices):null;if(indices&&(indices.channels!==1||![5121,5123,5125].includes(indices.componentType)))throw Error('GLB: invalid indices');
   const n=indices?indices.count:pos.count;if(n%3)throw Error('GLB: indices not multiple of three');triangleCount+=n/3;if(triangleCount>maxTriangles)throw Error('GLB: triangle budget exceeded');
   const values=new Float32Array(n*7),mat=gbClassifyMaterial(json.materials?.[pr.material]);
   for(let i=0;i<n;i+=3){const ix=[0,1,2].map(k=>indices?indices.read(i+k)[0]:i+k);if(ix.some(k=>k>=pos.count))throw Error('GLB: index out of range');
    const pts=ix.map(k=>gbTransform(matrix,pos.read(k)));if(pts.flat().some(k=>!Number.isFinite(k)||Math.abs(k)>1_000_000))throw Error('GLB: invalid vertex position');
    const u=pts[1].map((v,k)=>v-pts[0][k]),v=pts[2].map((v,k)=>v-pts[0][k]);let nor=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];let len=Math.hypot(...nor)||1;nor=nor.map(q=>q/len);
    for(let j=0;j<3;j++){const at=(i+j)*7;values.set([...pts[j],...nor,mat],at)}
   }
   groups.push({array:values,count:n,triangles:n/3,material:mat});
  }}
  for(const kid of node.children||[])walk(kid,matrix,depth+1);
 }
 for(const idx of root)walk(idx,gbIdentity(),0);
 if(!groups.length)throw Error('GLB: no triangle meshes found');
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const g of groups){for(let i=0;i<g.array.length;i+=7)for(let j=0;j<3;j++){const x=g.array[i+j];min[j]=Math.min(min[j],x);max[j]=Math.max(max[j],x)}}
 return {name:String(json.asset?.generator||'GLB asset').slice(0,100),groups,triangles:triangleCount,bounds:{min,max},sourceBytes:bytes.byteLength,source:'GLB 2.0'};
}
/** Convert a model to a single static regional mesh, retaining 7 floats per vertex. */
export function buildGLBInstance(model,{x=0,y=0,z=0,scale=1,yaw=0}={}){
 if(!Number.isFinite(scale)||scale<=0||scale>50)throw Error('Invalid asset scale');
 const cs=Math.cos(yaw),sn=Math.sin(yaw),verts=new Float32Array(model.groups.reduce((s,g)=>s+g.array.length,0));let off=0;
 for(const group of model.groups){const a=group.array;for(let i=0;i<a.length;i+=7){const xx=a[i]*scale,zz=a[i+2]*scale;
  const nx=a[i+3],nz=a[i+5];verts.set([x+xx*cs-zz*sn,y+a[i+1]*scale,z+xx*sn+zz*cs,nx*cs-nz*sn,a[i+4],nx*sn+nz*cs,a[i+6]],off);off+=7;}}
 return {array:verts,count:verts.length/7,triangles:verts.length/21};
}
