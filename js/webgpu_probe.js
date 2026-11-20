/** WebGPU readiness probe, NOT a WebGPU game renderer.
 * Requests an adapter/device and compiles minimal WGSL. Never changes the active WebGL canvas.
 */
export const REGION_WGSL_SMOKE=`struct Output { @builtin(position) position: vec4f, @location(0) tint: vec3f };
@vertex fn vertex_main(@location(0) position: vec3f) -> Output {
 var out: Output; out.position=vec4f(position,1.0);out.tint=vec3f(0.18,0.72,0.76);return out;
}
@fragment fn fragment_main(in: Output) -> @location(0) vec4f {
 return vec4f(in.tint,1.0);
}`;
export async function probeWebGPU(gpu=(typeof navigator!=='undefined'?navigator.gpu:null)){
 if(!gpu||typeof gpu.requestAdapter!=='function')return {supported:false,shader:false,reason:'navigator.gpu недоступен'};
 let device;
 try{
  const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)return {supported:false,shader:false,reason:'GPU-адаптер не найден'};
  device=await adapter.requestDevice({requiredFeatures:[],requiredLimits:{}});
  const module=device.createShaderModule({label:'TrussLab 10.4 WGSL smoke',code:REGION_WGSL_SMOKE});
  const report=await module.getCompilationInfo();
  const errors=[...report.messages].filter(x=>x.type==='error');
  return {supported:true,shader:!errors.length,reason:errors.length?errors.map(x=>x.message).join('; ').slice(0,200):'WGSL скомпилирован, WebGPU-рендерер пока в разработке',limits:{maxTextureDimension2D:adapter.limits.maxTextureDimension2D,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize}};
 }catch(e){return {supported:false,shader:false,reason:String(e?.message||e).slice(0,200)}}
 finally{try{device?.destroy?.()}catch(_){}}
}
