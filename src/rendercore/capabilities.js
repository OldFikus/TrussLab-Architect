/** RenderCore 2 shared capability catalogue. Bridges and regional scene are
 * separate render backends but query one consistent feature contract.
 * Never infer physical VRAM capacity or promise a GPU extension is available.
 */
class RenderCoreCapabilities {
 static detectGL(gl){
  if(!gl)return Object.freeze({backend:'cpu2d',webgl2:false,textureArrays:false,compressedBC3:false,timestampQueries:false,depthReprojection:false});
  const gl2=typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext;
  return Object.freeze({
   backend:gl2?'webgl2':'webgl1',webgl2:gl2,textureArrays:gl2,
   compressedBC3:!!gl.getExtension('WEBGL_compressed_texture_s3tc'),
   timestampQueries:!!gl.getExtension(gl2?'EXT_disjoint_timer_query_webgl2':'EXT_disjoint_timer_query'),
   depthReprojection:gl2||!!gl.getExtension('WEBGL_depth_texture'),
   maxTextureSize:Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)||0),
   maxTextureUnits:Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)||0),
   supportsStaticCSM:true,shadowCascades:3,
   materials:'baseColor/metallic/roughness linearized GGX + ACES',
   reflections:'planar static scene / Fresnel',
   aa:'FXAA / TAA depth reprojection with fallback'
  });
 }
 static detectWebGPU(adapter){
  return Object.freeze({backend:'webgpu',pbr:true,materials:'baseColor/metallic/roughness linearized GGX + ACES',
    maxTextureDimension2D:Number(adapter?.limits?.maxTextureDimension2D||0),
    supportsStaticCSM:false,reflections:'environment approximation',aa:'hardware/browser'});
 }
}
