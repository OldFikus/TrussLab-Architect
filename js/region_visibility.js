/** 10.7 conservative region-tile horizontal-frustum culling.
 * This is a broad-phase visibility test: near tiles stay visible and vertical
 * frustum rejection is deliberately skipped to avoid disappearing terrain.
 */
export function tileInHorizontalView(entry,cam,yaw,{span=384,aspect=1.6,verticalFov=Math.PI*.32,groundScale=.703,margin=.14}={}){
 const tileSpan=entry.tileSpan||span;
 const x=entry.originX+tileSpan*.5,z=entry.originZ-tileSpan*.5;
 const dx=(x-cam.x)*groundScale,dz=(z-cam.z)*groundScale;
 const distance=Math.hypot(dx,dz),radius=tileSpan*groundScale*.71;
 if(distance<radius*2+90)return true;
 const forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw);
 const d=(dx*forwardX+dz*forwardZ)/distance;
 const horizontalHalf=Math.atan(Math.tan(verticalFov*.5)*Math.max(.4,Math.min(4,aspect)));
 const tileAngularRadius=Math.asin(Math.min(.95,radius/distance));
 return d>=Math.cos(Math.min(Math.PI,horizontalHalf+tileAngularRadius+margin));
}
export function visibleRegionMeshes(entries,cam,yaw,config={}){
 const visible=[];let culled=0,trianglesCulled=0;
 for(const entry of entries){if(tileInHorizontalView(entry,cam,yaw,config))visible.push(entry);
  else{culled++;trianglesCulled+=entry.triangles||0;}}
 return {visible,culled,trianglesCulled};
}
