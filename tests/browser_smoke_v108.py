#!/usr/bin/env python3
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await b.new_page(viewport={'width':1440,'height':900})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text(encoding='utf8'),wait_until='load',timeout=55000)
  await page.locator('#region3d-open').click();await page.wait_for_timeout(900)
  assert await page.locator('#region3d-overlay').is_visible()
  await page.locator('#region3d-model-focus').click();await page.wait_for_timeout(350)
  hud=await page.locator('#region3d-hud').inner_text();assert 'GLB' in hud,hud
  assert '4 объектов' in hud,hud
  await page.locator('#region3d-models').click()
  assert 'выкл' in await page.locator('#region3d-models').inner_text()
  await page.locator('#region3d-models').click()
  assert 'вкл' in await page.locator('#region3d-models').inner_text()
  await page.locator('#region3d-model-file').set_input_files(ROOT/'assets/models/lighthouse_high.glb')
  await page.wait_for_timeout(250)
  status=await page.locator('#region3d-status').inner_text();assert 'Загружена модель' in status,status
  await page.locator('#region3d-model-file').set_input_files({'name':'bad.glb','mimeType':'model/gltf-binary','buffer':b'invalid'})
  await page.wait_for_timeout(150)
  status=await page.locator('#region3d-status').inner_text();assert 'GLB:' in status,status
  await page.screenshot(path=str(ROOT/'assets/qa_v108_models.png'),full_page=False)
  await page.locator('#region3d-close').click();assert not await page.locator('#region3d-overlay').is_visible()
  assert not errors,errors
  print('PASS 10.8 browser: region GLB visible, focus, toggle, model import, invalid rejection, close; JS_ERRORS=0')
  await b.close()
if __name__=='__main__':asyncio.run(main())
