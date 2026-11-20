import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  p=await b.new_page(viewport={'width':1100,'height':760})
  errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.set_content((BASE/'dist/TrussLab_Architect_14_0.html').read_text(),wait_until='load')
  await p.locator('#worldeditor-open').click()
  # 13.7 variants, inheritance, shared properties.
  await p.evaluate('''()=>{let w=trusslabEditor;let a=w.addModel('house',0,0);let c=w.addModel('house',750,750);w.setParent(c.id,a.id);w.setObject(c.id,{inheritMaterial:true});}''')
  before=await p.evaluate('trusslabEditor.effectiveMaterial(trusslabEditor.objects[1]).color')
  await p.locator('#we-root [data-tool="select"]').click()
  await p.evaluate('''()=>{TrussLabWorldEditorUI.selectTool('select')}''')
  # selection via browser event at center for parent 0,0.
  rect=await p.locator('#we-canvas').bounding_box();await p.locator('#we-canvas').click(position={'x':rect['width']/2,'y':rect['height']/2})
  assert await p.locator('#we-inspector #we-create-variant').count()==1
  await p.locator('#we-variant-color').fill('#4cb8cb')
  await p.locator('#we-create-variant').click()
  assert await p.evaluate('trusslabEditor.effectiveMaterial(trusslabEditor.objects[1]).color')=='#4cb8cb'
  # 13.4 network segmentation connectivity calculation.
  data=await p.evaluate('''()=>{let w=trusslabEditor;w.addPath('utility',[[0,0],[50,0]],{network:'water'});w.addPath('utility',[[50,0],[100,0]],{network:'water'});w.addPath('utility',[[300,0],[400,0]],{network:'power'});return w.utilityReport();}''')
  assert data['water']['components']==1 and data['water']['segments']==2 and data['power']['components']==1
  await p.locator('#we-network-check').click();assert 'water' in await p.locator('#we-geo-info').inner_text()
  # 13.1 mixed land use validation.
  zone=await p.evaluate('''()=>{let w=trusslabEditor;w.addParcel([[-200,-200],[200,-200],[200,200],[-200,200]],'residential');return [w.validatePlacement('warehouse',50,50),w.validatePlacement('house',50,50),w.validatePlacement('house',1000,1000)]}''')
  assert not zone[0]['ok'] and zone[1]['ok'] and not zone[2]['ok']
  # 13.9 proposed features span three review pages; approval never silently discards other pages.
  await p.locator('#we-gis-demo').click();total=await p.evaluate('trusslabEditor.pendingBatch.length');assert total>150
  await p.locator('#we-page-next').click();await p.locator('[data-batch="80"]').check()
  await p.locator('#we-page-next').click();await p.locator('[data-batch="160"]').check()
  await p.locator('#we-approve').click()
  assert await p.evaluate('trusslabEditor.pendingBatch.length')==total-2
  # 13.8 full JSON export & import roundtrip, source DEM unchanged (by checksum).
  data=await p.evaluate('''()=>{let w=trusslabEditor;let source=world3d.geoPack.dem.values;let hash=0;for(let i=0;i<source.length;i+=97)hash=(hash+source[i]*1315423911)|0;
  let pack=JSON.parse(JSON.stringify(w.export()));let C=TrussLabWorldEditorCore.WorldEditorCore;let restored=new C;restored.import(pack);let hash2=0;for(let i=0;i<source.length;i+=97)hash2=(hash2+source[i]*1315423911)|0;
  return {original:hash,after:hash2,objects:w.objects.length,reopened:restored.objects.length,remaining:restored.pendingBatch.length};}''')
  assert data['original']==data['after'] and data['objects']==data['reopened'] and data['remaining']==total-2
  # inspector map audit includes explicit approximate status.
  await p.locator('#we-geo-check').click()
  diagnostic=await p.locator('#we-geo-info').inner_text()
  assert 'Нет независимо подтверждённых осей' in diagnostic and 'Демонстрационная ось' in diagnostic
  assert not errors,errors
  print('PASS ADVANCED 13.1–13.9 materials, zoning, network graph, three-page GIS review, project roundtrip, DEM immutable, unverified axis',json.dumps(data),flush=True)
  await b.close()
asyncio.run(main())
