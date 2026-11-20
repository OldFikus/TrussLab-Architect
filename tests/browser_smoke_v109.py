#!/usr/bin/env python3
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await browser.new_page(viewport={'width':1440,'height':940},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load',timeout=55000)
  await page.locator('#region3d-open').click();await page.wait_for_timeout(1200)
  assert await page.locator('#region3d-overlay').is_visible()
  assert await page.locator('#region3d-asset-choice option').count()>=3
  await page.locator('#region3d-asset-choice').select_option('lighthouse')
  await page.evaluate('''() => { const a=region3d.assets.instances[0]; const m=mercatorProject(a.lon,a.lat); region3d.cam.x=m.x;region3d.cam.z=-m.y;region3d.cam.y=180;region3d.pitch=-1.30;region3d.yaw=.2; }''')
  await page.locator('#region3d-asset-place').click()
  assert 'Клик' in await page.locator('#region3d-asset-place').inner_text()
  canvas=page.locator('#region3d-stage');box=await canvas.bounding_box()
  await page.mouse.click(box['x']+box['width']*.5,box['y']+box['height']*.5)
  await page.wait_for_timeout(450)
  status=await page.locator('#region3d-status').inner_text();assert 'Поставлен объект' in status,status
  scene=await page.evaluate('region3d.assets.exportPlacements()');assert len(scene['assets'])>=5
  assert scene['assets'][-1]['assetId']=='lighthouse'
  async with page.expect_download() as download:
   await page.locator('#region3d-asset-save').click()
  item=await download.value;assert item.suggested_filename=='trusslab_asset_scene_10_9.json'
  await page.locator('#region3d-asset-remove').click()
  assert 'Удалено' in await page.locator('#region3d-status').inner_text()
  await page.locator('#region3d-asset-file').set_input_files({'name':'scene.json','mimeType':'application/json','buffer':json.dumps(scene,ensure_ascii=False).encode('utf-8')})
  await page.wait_for_timeout(350)
  assert 'Сцена восстановлена' in await page.locator('#region3d-status').inner_text()
  assert not errors,errors
  await page.screenshot(path=str(ROOT/'assets/qa_v109_assetstudio.png'),full_page=False)
  print('PASS 10.9 browser: select GLB, raycast placement, export download, remove, JSON reimport, JS_ERRORS=0')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
