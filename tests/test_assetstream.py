"""GLB validation and budgeted LOD in the actual offline editor."""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.build import VERSION

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--enable-unsafe-swiftshader'])
    page = browser.new_page()
    page.goto((ROOT/'dist'/f'TrussLab_{VERSION}_SAFE.html').as_uri())
    page.locator('#region3d-open').click()
    stats = page.evaluate("""()=>{
      const stream=region3d.assets, demo=BUILTIN_GLB_ASSETS.find(x=>x.id==='warehouse');
      const bytes=aDecode64(demo.variants.high), original=stream.instances[0];
      const asset=stream.registerGLB('audit-import',bytes);
      const instance=stream.add({...original,assetId:'audit-import'});
      const m=mercatorProject(instance.lon,instance.lat),cell=stream.cellsNear(m.x,m.y).find(c=>c.instances.some(x=>x.id===instance.id));
      const high=stream.buildCell(cell.tx,cell.ty),low=stream.buildCell(cell.tx,cell.ty,{detail:'low'});
      const limited=stream.buildCell(cell.tx,cell.ty,{maxTriangles:0});
      let rejected=false;try{decodeGLB(bytes.slice(0,10));}catch{rejected=true;}
      return [asset.triangles,high.triangles,low.triangles,limited===null,rejected];
    }""")
    assert stats[0]>0 and stats[1]>=stats[2]>0 and all(stats[3:]), stats
    print('GLB import / LOD / budget',stats)
    browser.close()
