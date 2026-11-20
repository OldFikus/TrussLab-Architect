#!/usr/bin/env python3
"""Full self-contained HTML UI smoke test; raster GPU support may be sandbox-limited."""
import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await b.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load',timeout=45000)
  await page.wait_for_timeout(700)
  assert await page.locator('#region3d-open').count()==1
  await page.locator('#region3d-open').click()
  await page.wait_for_timeout(1800)
  print('BEFORE ASSERT',await page.locator('#region3d-overlay').count(),await page.locator('#region3d-overlay').get_attribute('style'), 'errors',errors, 'status',await page.locator('#region3d-status').inner_text());assert await page.locator('#region3d-overlay').is_visible(),'regional 3D overlay closed'
  text=await page.locator('#region3d-hud').inner_text()
  print('REGIONAL',text[:450]);print('ENGINE',await page.locator('#region3d-engine').inner_text())
  assert 'DEM:' in text and 'секторы' in text
  await page.screenshot(path=str(ROOT/'assets'/'qa_v104_region3d_initial.png'),full_page=True)
  await page.locator('#region3d-light').click();await page.locator('#region3d-light').click()
  assert 'Ночь' in await page.locator('#region3d-light').inner_text()
  await page.locator('#region3d-tuzla').click();await page.wait_for_timeout(900)
  print('TUZLA', (await page.locator('#region3d-hud').inner_text())[:250])
  await page.screenshot(path=str(ROOT/'assets'/'qa_v104_region3d_night.png'),full_page=True)
  await page.locator('#region3d-gpu-probe').click();await page.wait_for_timeout(600)
  print('WEBGPU',await page.locator('#region3d-status').inner_text())
  await page.locator('#region3d-atlas').click();await page.wait_for_timeout(300)
  assert await page.locator('#atlas-overlay').is_visible()
  assert not await page.locator('#region3d-overlay').is_visible()
  print('ATLAS',await page.locator('#atlas-status').inner_text())
  await page.locator('#atlas-region3d').click();await page.wait_for_timeout(650)
  assert await page.locator('#region3d-overlay').is_visible()
  await page.locator('#region3d-close').click();await page.wait_for_timeout(250)
  assert not await page.locator('#region3d-overlay').is_visible()
  await page.locator('[data-view="3d"]').click();await page.wait_for_timeout(500)
  assert await page.locator('#stage-3d').is_visible()
  print('BRIDGE BACK',await page.locator('#camera-hud').inner_text())
  print('JS_ERRORS',errors)
  await b.close()
  assert not errors, '\n'.join(errors)
 if __name__=='__main__':return
if __name__=='__main__':asyncio.run(main())
