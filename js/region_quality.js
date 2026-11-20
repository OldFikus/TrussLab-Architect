/** RegionWorld 10.6 frame policy and bounded streaming cache control.
 * A render governor is not an FPS guarantee. Warmup and cooldown prevent oscillation.
 */
export const REGION_QUALITY_ORDER=['low','medium','high','ultra'];
export const REGION_QUALITY_PROFILES={
 low:{dprCap:1,terrainRange:980,terrainLimit:65,cityLimit:24,cpuBudgetMB:12,cityDetail:'base',fog:1700},
 medium:{dprCap:1.15,terrainRange:1280,terrainLimit:80,cityLimit:30,cpuBudgetMB:22,cityDetail:'roof',fog:2200},
 high:{dprCap:1.45,terrainRange:1500,terrainLimit:100,cityLimit:40,cpuBudgetMB:44,cityDetail:'facade',fog:2600},
 ultra:{dprCap:1.9,terrainRange:1720,terrainLimit:125,cityLimit:48,cpuBudgetMB:78,cityDetail:'facade',fog:3400}
};
export class RegionQualityGovernor {
 constructor({level='high',cooldown=4500,target=48}={}){this.level=level;this.cooldown=cooldown;this.target=target;this.changedAt=0;this.samples=0;this.fpsEMA=0;this.transitions=0;}
 observe(fps,now,enabled=true){
  if(!enabled||!Number.isFinite(fps)||fps<=0)return this.level;
  this.fpsEMA=this.samples?this.fpsEMA*.72+fps*.28:fps;this.samples++;
  if(this.samples<4||now-this.changedAt<this.cooldown)return this.level;
  const i=REGION_QUALITY_ORDER.indexOf(this.level);
  if(this.fpsEMA<this.target*.67&&i>0){this.level=REGION_QUALITY_ORDER[i-1];this.changedAt=now;this.samples=0;this.transitions++;}
  else if(this.fpsEMA>this.target*1.18&&i<3){this.level=REGION_QUALITY_ORDER[i+1];this.changedAt=now;this.samples=0;this.transitions++;}
  return this.level;
 }
}
export function meshCpuBytes(...maps){let b=0;for(const cache of maps)for(const entry of cache.values())b+=entry?.array?.byteLength||0;return b;}
/** Evict cache entries that are not visible until desired byte budget is reached. */
export function evictMeshBytes(caches,{limitBytes,keep=new Set(),dispose=()=>{}}){
 let bytes=meshCpuBytes(...caches),count=0;
 if(bytes<=limitBytes)return {bytes,count};
 // Maps are LRU insertion-ordered; only dispose non-visible geometry.
 for(const map of caches){for(const [key,entry] of map){if(bytes<=limitBytes)break;if(keep.has(key))continue;
  bytes-=entry?.array?.byteLength||0;dispose(entry);map.delete(key);count++;
 }}
 return {bytes,count};
}
