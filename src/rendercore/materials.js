/** RenderCore 2 material contract — display-encoded baseColor, linear metallic/roughness.
 * IDs follow the bridge renderer's material group, and region WGSL uses matching
 * Cook-Torrance/ACES equations. No external texture image or license dependency.
 */
const RENDERCORE_MATERIALS=Object.freeze([
 Object.freeze({name:'asphalt',rgb:Object.freeze([56,64,72]),metallic:0.0,roughness:.91}),
 Object.freeze({name:'concrete',rgb:Object.freeze([144,153,150]),metallic:0.0,roughness:.83}),
 Object.freeze({name:'steel',rgb:Object.freeze([91,112,119]),metallic:.81,roughness:.37}),
 Object.freeze({name:'rail',rgb:Object.freeze([76,91,97]),metallic:.76,roughness:.47})
]);
