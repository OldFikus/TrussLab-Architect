import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
P=Path(__file__).resolve().parents[1]/'dist/TrussLab_Architect_14_9.html'
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist'])
  p=await b.new_page(viewport={'width':960,'height':750})
  errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.set_content(P.read_text(),wait_until='load',timeout=70000)
  await p.evaluate('''()=>{let m=trusslabEditor.addModel('house',0,0);trusslabEditor.addPath('road',[[-300,15],[300,15]]);trusslabEditor.paintTerrain(50,100,200,3); }''')
  await p.locator('#region3d-open').click()
  await p.wait_for_timeout(700)
  s=await p.evaluate('''()=>({active:region3d.active,software:region3d.software,hasGL:!!region3d.gl,err:region3d.gl?.getError(),editor:region3d.worldEditorBuffers?.length,rev:region3d.worldEditorRevision,original:trusslabEditor.revision,tiles:region3d.terrainCache.size,visible:region3d.visibleModels?.filter(x=>x.source==='WorldEditor 2').length})''')
  print('WEBGL test',s,'errors',errors,flush=True)
  assert s['active'] and s['editor']>0 and s['rev']==s['original']
  if s['hasGL']:assert s['err']==0,s
  assert not errors,errors
  await p.screenshot(path=str(P.parent.parent/'tests/region3d_worldeditor.png'))
  await b.close()
asyncio.run(main())
