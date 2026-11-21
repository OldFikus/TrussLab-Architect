"""Large sparse installation, camera traversal, real browser heap and frame intervals."""
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tools.build import VERSION
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
    p=browser.new_page(viewport={'width':900,'height':620})
    p.goto((ROOT/'dist'/f'TrussLab_{VERSION}_SAFE.html').as_uri())
    p.locator('#atlas-open').click()
    cdp=p.context.new_cdp_session(p)
    heap=lambda:cdp.send('Runtime.getHeapUsage')['usedSize']
    before=heap()
    stats=p.evaluate("""async()=>{
      const tiles={},size=2048,inline=new Map();
      for(let x=-200;x<200;x++)for(let y=-225;y<225;y++)tiles[x+':'+y]={features:1,path:'tiles/demo.geojson'};
      inline.set('tiles/demo.geojson',{type:'FeatureCollection',features:[{type:'Feature',properties:{highway:'road'},geometry:{type:'LineString',coordinates:[[0,0],[.001,.001]]}}]});
      const start=performance.now();atlas.store.setManifest({type:'TrussLabRegionIndex',version:1,projection:'EPSG:3857',tileSizeMeters:size,tiles},{inline});
      const indexMs=performance.now()-start;atlas.goTo(0,0,.09);
      let prev=await new Promise(requestAnimationFrame),peakCache=0,peakHeap=0;
      const intervals=[];
      for(let i=0;i<120;i++){
        atlas.center.x=(i-60)*size;atlas.schedule();
        const now=await new Promise(requestAnimationFrame);
        intervals.push(now-prev);prev=now;
        peakCache=Math.max(peakCache,atlas.store.cache.size);
        peakHeap=Math.max(peakHeap,performance.memory?.usedJSHeapSize||0);
      }
      intervals.sort((a,b)=>a-b);
      return {tiles:atlas.store.index.tiles.size,indexMs,peakCache,peakHeap,
              p95Ms:intervals[113],maxFrameMs:intervals.at(-1),over50ms:intervals.filter(x=>x>50).length,loaded:atlas.store.loaded};
    }""")
    stats['heapAfterBytes']=heap()
    stats['heapBeforeBytes']=before
    print(json.dumps(stats),flush=True)
    assert stats['tiles']==180000 and 0<stats['peakCache']<=96 and stats['loaded']>200
    assert stats['heapAfterBytes']-before<256*1024*1024
    p.locator('#atlas-demo').click()
    p.wait_for_function('atlas.store.loaded>0')
    cdp.send('HeapProfiler.collectGarbage')
    assert heap()-before<32*1024*1024
    browser.close()
