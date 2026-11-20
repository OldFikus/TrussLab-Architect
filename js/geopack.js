/**
 * TrussLab GeoPack v1: locally converted OSM coastline + Copernicus GLO-30.
 * The payload is deliberately data-only. No script or network call is executed.
 * Pixels run left->right in scene X and top->bottom in scene Z, which matches 2D map.
 * Coastline is classified from the nearest OSM coastline segment (land to its left).
 * The DEM remains a DSM, not a terrain survey.
 */
function b64decode(text){
 if(typeof text!=='string'||text.length>12_000_000)throw Error('Недопустимый размер GeoPack.');
 if(typeof atob==='function'){
   const raw=atob(text),bytes=new Uint8Array(raw.length);
   for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   return bytes;
 }
 if(typeof Buffer!=='undefined')return Uint8Array.from(Buffer.from(text,'base64'));
 throw Error('Нет декодера base64.');
}
export function parseGeoPack(pack){
 if(!pack||pack.type!=='TrussLabGeoPack'||pack.version!==1)throw Error('Требуется TrussLabGeoPack версии 1.');
 const n=Number(pack.gridSize);
 if(!Number.isInteger(n)||n<16||n>1024)throw Error('Размер сетки GeoPack должен быть 16–1024.');
 const sceneSize=Number(pack.sceneSize);
 if(!Number.isFinite(sceneSize)||sceneSize<100||sceneSize>1000)throw Error('Неверные размеры сцены.');
 const out={version:1,gridSize:n,sceneSize,coast:null,dem:null,metadata:pack.metadata||{}};
 if(pack.coast){
  if(pack.coast.encoding!=='uint8/base64')throw Error('Неподдерживаемая кодировка береговой маски.');
  const bytes=b64decode(pack.coast.data);
  if(bytes.length!==n*n)throw Error('Повреждена маска берега: неверный размер.');
  out.coast=bytes;
 }
 if(pack.dem){
  if(pack.dem.encoding!=='int16le/base64')throw Error('Неподдерживаемая кодировка высот.');
  const bytes=b64decode(pack.dem.data);
  if(bytes.length!==n*n*2)throw Error('Повреждена модель высот: неверный размер.');
  const values=new Int16Array(n*n),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<values.length;i++)values[i]=view.getInt16(i*2,true);
  const scale=Number(pack.dem.scaleMetres);
  if(!Number.isFinite(scale)||scale<=0||scale>100)throw Error('Недопустимый масштаб высот.');
  out.dem={values,scaleMetres:scale,noData:Number(pack.dem.noData??-32768)};
 }
 if(!out.coast&&!out.dem)throw Error('GeoPack пуст: нет берегов или высот.');
 return out;
}
function sceneGridCoords(x,z,size,n){
 const u=(x/size+.5)*(n-1),v=(z/size+.5)*(n-1);
 if(u<0||v<0||u>n-1||v>n-1)return null;
 return [u,v];
}
export function sampleCoast(geopack,x,z){
 if(!geopack?.coast)return null;
 const n=geopack.gridSize,uv=sceneGridCoords(x,z,geopack.sceneSize,n);
 if(!uv)return null;
 const [u,v]=uv,i=Math.floor(u),j=Math.floor(v),i1=Math.min(n-1,i+1),j1=Math.min(n-1,j+1),tx=u-i,ty=v-j,b=geopack.coast;
 const v00=b[j*n+i],v10=b[j*n+i1],v01=b[j1*n+i],v11=b[j1*n+i1];
 return ((v00*(1-tx)+v10*tx)*(1-ty)+(v01*(1-tx)+v11*tx)*ty)/255;
}
export function sampleDem(geopack,x,z){
 if(!geopack?.dem)return null;
 const n=geopack.gridSize,uv=sceneGridCoords(x,z,geopack.sceneSize,n);
 if(!uv)return null;
 const [u,v]=uv,i=Math.floor(u),j=Math.floor(v),i1=Math.min(n-1,i+1),j1=Math.min(n-1,j+1),tx=u-i,ty=v-j,d=geopack.dem,{values,noData}=d;
 const samples=[[i,j,(1-tx)*(1-ty)],[i1,j,tx*(1-ty)],[i,j1,(1-tx)*ty],[i1,j1,tx*ty]];
 let sum=0,weight=0;
 for(const [x1,y1,w] of samples){const val=values[y1*n+x1];if(val!==noData){sum+=w*val;weight+=w}}
 return weight>.001?(sum/weight)*d.scaleMetres:null;
}
