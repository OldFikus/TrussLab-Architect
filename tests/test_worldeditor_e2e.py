import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0,str(ROOT))
from tools.build import VERSION
HTML=(ROOT/'dist'/f'TrussLab_{VERSION}_SAFE.html').read_text(encoding='utf-8')
FLAGS=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']
async def exercise(page,mobile):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 await page.set_content(HTML,wait_until='load',timeout=80000)
 print('EDITOR OPEN BEGIN', mobile, flush=True)
 await page.locator('#worldeditor-open').click()
 await page.wait_for_timeout(450)
 assert await page.locator('#we-root').is_visible()
 assert await page.locator('#we-canvas').evaluate('(e)=>e.width')>0
 c=page.locator('#we-canvas')
 # 13.2: place a model.
 await page.locator('[data-tool="building"]').click()
 await c.click(position={'x':int((await c.bounding_box())['width']*.42),'y':int((await c.bounding_box())['height']*.52)})
 assert await page.evaluate('trusslabEditor.summary().counts.building')==1
 # 13.1: create a zone using 4 points, finish.
 await page.locator('[data-tool="parcel"]').click()
 box=await c.bounding_box();pts=[(.38,.34),(.53,.34),(.53,.64),(.38,.64)]
 for x,y in pts:await c.click(position={'x':int(box['width']*x),'y':int(box['height']*y)})
 await page.locator('#we-finish').click()
 assert await page.evaluate('trusslabEditor.summary().counts.parcel')==1
 # 13.3 13.4: actual road and utility line.
 await page.locator('[data-tool="road"]').click()
 for x,y in [(.12,.20),(.32,.24),(.64,.22)]:await c.click(position={'x':int(box['width']*x),'y':int(box['height']*y)})
 await page.locator('#we-finish').click()
 assert await page.evaluate('trusslabEditor.summary().counts.road')==1
 await page.locator('[data-tool="utility"]').click()
 for x,y in [(.13,.27),(.35,.29)]:await c.click(position={'x':int(box['width']*x),'y':int(box['height']*y)})
 await page.locator('#we-finish').click()
 assert await page.evaluate('trusslabEditor.summary().counts.utility')==1
 # 13.5 separate terrain brushes.
 await page.locator('[data-tool="terrain"]').click()
 await c.click(position={'x':int(box['width']*.58),'y':int(box['height']*.64)})
 assert await page.evaluate('trusslabEditor.terrain.length')==1
 # 13.8 snapshots.
 await page.locator('#we-snapshot').click()
 assert await page.evaluate('trusslabEditor.snapshots.length')==1
 await page.locator('#we-undo').click()
 await page.locator('#we-redo').click()
 print('EDITOR TO GIS',mobile,flush=True)
 # 13.9 generate a reviewed GIS polygon; no auto-placement.
 await page.locator('#we-gis-demo').click()
 pending=await page.evaluate('trusslabEditor.pendingBatch.length');assert pending>0
 before=await page.evaluate('trusslabEditor.objects.length')
 await page.locator('[data-batch="0"]').check()
 await page.locator('[data-batch="1"]').check()
 await page.locator('#we-approve').click()
 after=await page.evaluate('trusslabEditor.objects.length');assert after==before+2,(before,pending,after)
 # Shared 2D and 3D schema / browser switching.
 await page.locator('#we-view').click()
 await page.wait_for_timeout(150)
 assert await page.locator('#we-view').inner_text()=='▤ Карта 2D'
 await page.locator('#we-view').click()
 # check geo roundtrip in runtime
 data=await page.evaluate('''() => ({objects:trusslabEditor.summary().objects,demSafe:trusslabEditor.sourceDemImmutable,projection:trusslabEditor.export().anchor,geo:trusslabEditor.objects[0].type,uiOpen:!document.getElementById('we-root').hidden})''')
 assert data['demSafe'] and data['objects']>=6
 await page.screenshot(path=str(ROOT/'tests'/('worldeditor_mobile.png' if mobile else 'worldeditor_desktop.png')))
 await page.locator('#we-close').click()
 assert await page.locator('#we-root').is_hidden()
 # actual Region3D stream must contain editor objects after regeneration.
 print('REGION OPEN BEGIN',mobile,flush=True)
 await page.locator('#region3d-open').click()
 await page.wait_for_timeout(350)
 render=await page.evaluate('''() => ({active:region3d.active,editorMeshes:region3d.worldEditorBuffers?.length||0,visible:region3d.visibleModels?.filter(x=>x.source==='WorldEditor 2').length||0,revision:region3d.worldEditorRevision,coreRevision:trusslabEditor.revision,software:region3d.software,errors:region3d.gl?.getError()??null})''')
 assert render['active'] and render['editorMeshes']>0,render
 assert render['revision']==render['coreRevision'],render
 if render['errors'] is not None:assert render['errors']==0,render
 print('PASS E2E',('mobile' if mobile else 'desktop'),json.dumps({'editor':data,'region':render},ensure_ascii=False),'JS_ERRS',errors[:3],flush=True)
 assert not errors,errors
 await page.locator('#region3d-close').click()
async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,args=FLAGS)
  for mobile in [False,True]:
   page=await browser.new_page(viewport={'width':412 if mobile else 1330,'height':920 if mobile else 830},device_scale_factor=1)
   try:await exercise(page,mobile)
   finally:await page.close()
  await browser.close()
asyncio.run(run())
