/** TrussLab RenderCore 2 — material parameters mirrored in GLSL.
 * Approximate material classes for original geometry; NOT scanned PBR textures. */
export const RENDERCORE_MATERIALS=Object.freeze({
 grass:Object.freeze({roughness:.97,metallic:0}),
 sand:Object.freeze({roughness:.91,metallic:0}),
 asphalt:Object.freeze({roughness:.89,metallic:0}),
 concrete:Object.freeze({roughness:.82,metallic:0}),
 steel:Object.freeze({roughness:.37,metallic:.79}),
 paintedMetal:Object.freeze({roughness:.46,metallic:.50}),
 water:Object.freeze({roughness:.13,metallic:0}),
 glass:Object.freeze({roughness:.12,metallic:0})
});
export function rendercoreDescriptor(code){
 if(!Number.isFinite(code))throw Error('Invalid material id');
 const m=Math.floor(code+.5);
 if(m===6)return RENDERCORE_MATERIALS.water;
 if(m===3)return RENDERCORE_MATERIALS.asphalt;
 if(m===4)return RENDERCORE_MATERIALS.concrete;
 if(m===5||m===11||m===18)return RENDERCORE_MATERIALS.steel;
 if(m===7||m===12||m===17)return RENDERCORE_MATERIALS.paintedMetal;
 if(m===21||m===24)return RENDERCORE_MATERIALS.glass;
 if(m===1||m===9||m===13)return RENDERCORE_MATERIALS.sand;
 return RENDERCORE_MATERIALS.grass;
}
