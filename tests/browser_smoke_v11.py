#!/usr/bin/env python3
"""Browser smoke for GeoCore 11.0 using embedded GeoPack, no network required."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await browser.new_page(viewport={'width':1440,'height':940},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load',timeout=70000)
  await page.locator('#region3d-open').click();await page.wait_for_timeout(850)
  assert await page.locator('#region3d-overlay').is_visible()
  position=await page.evaluate('''() => {const s=region3d.assets.instances[0],p=geographicToMetric(s.lat,s.lon);region3d.cam.x=p.x;region3d.cam.z=p.z;region3d.cam.y=180;region3d.yaw=.2;region3d.pitch=-1.30;return {lat:s.lat,lon:s.lon,x:p.x,z:p.z,projection:region3d.visibleTerrain[0]?.projection};}''')
  assert position['projection']=='ENU',position
  await page.locator('#region3d-asset-choice').select_option('lighthouse')
  await page.locator('#region3d-asset-place').click();canvas=page.locator('#region3d-stage');box=await canvas.bounding_box()
  await page.mouse.click(box['x']+box['width']*.5,box['y']+box['height']*.5)
  await page.wait_for_timeout(450)
  status=await page.locator('#region3d-status').inner_text();assert 'Поставлен объект' in status,status
  await page.locator('#region3d-location-save').click()
  assert 'сохранена' in await page.locator('#region3d-status').inner_text()
  camera=await page.evaluate('''() => ({...region3d.cam})''')
  await page.evaluate('''() => {region3d.cam.x+=450;region3d.cam.z+=550;}''')
  await page.locator('#region3d-location-load').click()
  restored=await page.evaluate('''() => ({...region3d.cam})''')
  assert abs(restored['x']-camera['x'])<.05 and abs(restored['z']-camera['z'])<.05
  await page.locator('#region3d-atlas').click();assert await page.locator('#atlas-overlay').is_visible()
  await page.locator('#atlas-close').click()
  assert not errors,errors
  await page.screenshot(path=str(ROOT/'assets/qa_v11_geocore.png'))
  print('PASS 11.0 browser: ENU terrain, mouse placement, camera WGS84 persistence, atlas, JS_ERRORS=0')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
