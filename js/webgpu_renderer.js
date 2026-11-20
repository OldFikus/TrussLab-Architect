/** TrussLab 10.5: actual WebGPU region renderer. WebGL1 remains an independent fallback.
 * All 3D vertices are tile-local Float32, while the geography remains Float64 on CPU.
 * Uses the exact RegionMesh interleaved layout: pos3, normal3, material1 (stride 28).
 * No network requests and no external shader libraries.
 */
export const REGION_WGSL_RENDER = `
struct Scene {
  vp: mat4x4<f32>,
  sun: vec4<f32>,
  camera: vec4<f32>,
  fog: vec4<f32>,
};
struct Tile {offset: vec4<f32>};
@group(0) @binding(0) var<uniform> scene: Scene;
@group(1) @binding(0) var<uniform> tile: Tile;
struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) material: f32,
};
@vertex fn vertex_main(@location(0) position: vec3<f32>,@location(1) normal: vec3<f32>,@location(2) material: f32) -> VertexOut {
  var out: VertexOut;
  let world = position + tile.offset.xyz;
  out.clip = scene.vp * vec4<f32>(world, 1.0);
  out.world = world;
  out.normal = normal;
  out.material = material;
  return out;
}
fn materialColor(id: f32, p: vec3<f32>) -> vec3<f32> {
  let variation = sin(p.x * 0.047) * sin(p.z * 0.081) * 0.5 + 0.5;
  if(id < 0.5) {return mix(vec3<f32>(0.22,0.35,0.19),vec3<f32>(0.36,0.44,0.23),variation);}
  if(id < 1.5) {return vec3<f32>(0.69,0.59,0.43);}
  if(id < 2.5) {return vec3<f32>(0.43,0.40,0.33);}
  if(id < 3.5) {return vec3<f32>(0.045,0.29,0.40);}
  if(id < 4.5) {return vec3<f32>(0.18,0.23,0.28);}
  if(id < 5.5) {return vec3<f32>(0.53,0.58,0.59);}
  if(id < 6.5) {return vec3<f32>(0.43,0.27,0.22);}
  if(id < 7.5) {return vec3<f32>(0.12,0.14,0.16);}
  if(id < 8.5) {return vec3<f32>(0.43,0.46,0.47);}
  if(id < 9.5) {return vec3<f32>(0.62,0.56,0.48);}
  if(id < 10.5) {return vec3<f32>(0.09,0.17,0.25);}
  return vec3<f32>(0.26,0.34,0.20);
}
@fragment fn fragment_main(input: VertexOut) -> @location(0) vec4<f32> {
  let id = floor(input.material + 0.5);
  let norm = normalize(input.normal);
  let sun = normalize(scene.sun.xyz);
  let diffuse = max(0.0,dot(norm,sun));
  let night = scene.camera.w > 0.5;
  let sunset = scene.fog.y > 0.5;
  var base = materialColor(id,input.world);
  if(id < 3.5 && id > 2.5) {
    let waves = sin(input.world.x * 0.055 + scene.sun.w * 1.4) * sin(input.world.z * 0.082 - scene.sun.w * 0.4);
    base = base + waves * vec3<f32>(0.035,0.065,0.095);
  }
  if(id > 4.5 && id < 5.5) {
    let band = select(0.0,1.0,fract(input.world.y / 3.15)>0.78);
    base = base * (1.0 - band*0.15);
    if(night) {
      let win = select(0.0,1.0,fract(input.world.x*.31)>.64 && fract(input.world.y*.28)>.54 && fract(input.world.z*.27)>.32);
      base = base + win * vec3<f32>(0.35,0.25,0.07);
    }
  }
  let ambient = select(select(0.52,0.42,sunset),0.18,night);
  let power = select(select(0.95,0.7,sunset),0.22,night);
  var rgb = base * (ambient + diffuse*power);
  let view = normalize(scene.camera.xyz-input.world);
  let reflected = normalize(sun+view);
  let gloss = select(select(20.0,78.0,id>6.5&&id<9.5),125.0,id>2.5&&id<3.5);
  let specPower = pow(max(dot(norm,reflected),0.0),gloss);
  let strength = select(select(0.045,0.13,id>6.5&&id<9.5),0.26,id>2.5&&id<3.5);
  rgb = rgb + specPower * strength * select(1.0,0.18,night);
  if(id > 9.5 && id < 10.5) {
    let glint = pow(max(0.0,dot(normalize(scene.camera.xyz-input.world),reflect(-sun,norm))),44.0);
    rgb = rgb + vec3<f32>(0.15,0.25,0.36)*glint;
    if(night){let lit = select(0.0,1.0,fract(input.world.x*.19+input.world.y*.33+input.world.z*.12)>.45);rgb=rgb+vec3<f32>(.38,.29,.12)*lit;}
  }
  let dist = distance(input.world,scene.camera.xyz);
  let fogFactor = clamp((dist-scene.fog.x*.42)/(scene.fog.x*.85),0.0,1.0);
  let sky = select(select(vec3<f32>(0.54,0.72,0.82),vec3<f32>(0.70,0.51,0.39),sunset),vec3<f32>(0.045,0.065,0.105),night);
  rgb = mix(rgb,sky,fogFactor*.78);
  let greyscale = dot(rgb,vec3<f32>(.2126,.7152,.0722));
  if(scene.fog.w > 1.5){rgb = mix(vec3<f32>(greyscale),rgb,.82);} // neutral
  else if(scene.fog.w > .5){rgb = mix(vec3<f32>(greyscale),rgb,1.16);} // cinematic
  rgb = max(rgb,vec3<f32>(0.0)) * scene.fog.z;
  return vec4<f32>(rgb/(rgb+vec3<f32>(.25))*.95,1.0);
}
`;
export function webgpuProjection(fovy,aspect,near,far){
 const f=1/Math.tan(fovy/2);
 return [f/aspect,0,0,0, 0,f,0,0, 0,0,far/(near-far),-1, 0,0,(far*near)/(near-far),0];
}
export class RegionWebGPU {
 constructor(){this.buffers=new Map();this.bytes=0;this.uploads=0;this.drawCalls=0;this.lossReason='';this.ready=false;}
 async initialize(anchorCanvas,{gpu=null,onDeviceLost=()=>{}}={}){
  const api=gpu??(typeof navigator!=='undefined'?navigator.gpu:null);
  if(!api?.requestAdapter)throw Error('WebGPU недоступен в этом браузере');
  this.api=api;
  const adapter=await api.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('Адаптер WebGPU не найден');
  const device=await adapter.requestDevice();
  if(!device)throw Error('Устройство WebGPU не создано');
  this.device=device;
  const canvas=anchorCanvas.ownerDocument.createElement('canvas');
  canvas.className='region3d-webgpu-layer';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  const context=canvas.getContext('webgpu');if(!context)throw Error('Контекст WebGPU не поддерживается');
  this.canvas=canvas;this.context=context;
  this.format=api.getPreferredCanvasFormat();
  context.configure({device,format:this.format,alphaMode:'opaque'});
  const shader=device.createShaderModule({label:'TrussLab RegionWorld surface WGSL',code:REGION_WGSL_RENDER});
  if(typeof shader.getCompilationInfo==='function'){
   const info=await shader.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');
   if(errors.length)throw Error('WGSL: '+errors.map(m=>m.message).join('; ').slice(0,240));
  }
  this.pipeline=device.createRenderPipeline({
   label:'TrussLab tile renderer',layout:'auto',
   vertex:{module:shader,entryPoint:'vertex_main',buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32'}]}]},
   fragment:{module:shader,entryPoint:'fragment_main',targets:[{format:this.format}]},
   primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}
  });
  const U=typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:{COPY_DST:8,UNIFORM:64,VERTEX:32};
  this.U=U;
  this.sceneBuffer=device.createBuffer({label:'Region frame uniform',size:112,usage:U.UNIFORM|U.COPY_DST});
  this.sceneBind=device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.sceneBuffer}}]});
  this._onLost=onDeviceLost;
  device.lost?.then(info=>{this.lossReason=String(info?.message||'устройство потеряно');this.ready=false;this._onLost(this.lossReason)}).catch(()=>{});
  anchorCanvas.parentElement?.appendChild(canvas);
  anchorCanvas.style.opacity='0'; // preserved for WASD, pointer events and WebGL fallback
  this.anchorCanvas=anchorCanvas;this.ready=true;
  return this;
 }
 release(entry){const t=this.buffers.get(entry);if(!t)return;
  try{t.vertex.destroy();t.uniform.destroy()}catch(_){}this.bytes-=t.bytes;this.buffers.delete(entry);
 }
 _tile(entry){if(!entry?.count||!entry.array)return null;
  let t=this.buffers.get(entry);if(t)return t;
  const device=this.device,bytes=entry.array.byteLength;
  const vertex=device.createBuffer({size:Math.ceil(bytes/4)*4,usage:this.U.VERTEX|this.U.COPY_DST,label:'Region tile vertices'});
  device.queue.writeBuffer(vertex,0,entry.array.buffer,entry.array.byteOffset,entry.array.byteLength);
  const uniform=device.createBuffer({size:16,usage:this.U.UNIFORM|this.U.COPY_DST,label:'Region tile floating offset'});
  const bind=device.createBindGroup({layout:this.pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:uniform}}]});
  t={vertex,uniform,bind,count:entry.count,bytes};this.buffers.set(entry,t);this.bytes+=bytes;this.uploads++;return t;
 }
 _resize(w,h){if(w===this.w&&h===this.h)return;this.w=w;this.h=h;
  this.canvas.width=w;this.canvas.height=h;
  this.depth?.destroy();this.depth=this.device.createTexture({size:{width:w,height:h,depthOrArrayLayers:1},format:'depth24plus',usage:typeof GPUTextureUsage!=='undefined'?GPUTextureUsage.RENDER_ATTACHMENT:16});
 }
 render(entries,{width,height,vp,origin,camera,sun,night=0,sunset=0,time=0,fog=2500,exposure=1,style=0,groundScale=1,sky=[.48,.68,.81,1]}){
  if(!this.ready)return;
  this._resize(width,height);
  const scene=new Float32Array(28);scene.set(vp,0);scene.set([sun[0],sun[1],sun[2],time],16);scene.set([camera[0],camera[1],camera[2],night],20);scene.set([fog,sunset,exposure,style],24);
  const device=this.device;device.queue.writeBuffer(this.sceneBuffer,0,scene);
  const command=device.createCommandEncoder();
  const pass=command.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:sky[0],g:sky[1],b:sky[2],a:1},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.sceneBind);
  this.drawCalls=0;
  for(const entry of entries){const tile=this._tile(entry);if(!tile)continue;
   const offset=new Float32Array([(entry.originX-origin.x)*groundScale,0,(entry.originZ-origin.z)*groundScale,0]);
   device.queue.writeBuffer(tile.uniform,0,offset);
   pass.setBindGroup(1,tile.bind);pass.setVertexBuffer(0,tile.vertex);pass.draw(tile.count);this.drawCalls++;
  }
  pass.end();device.queue.submit([command.finish()]);
 }
 dispose(){this.ready=false;
  for(const entry of [...this.buffers.keys()])this.release(entry);
  try{this.sceneBuffer?.destroy();this.depth?.destroy();this.canvas?.remove();if(this.anchorCanvas)this.anchorCanvas.style.opacity='1';}catch(_){}
  try{this.device?.destroy?.()}catch(_){}
  this.canvas=null;
 }
}
