#!/usr/bin/env python3
"""Offline HTML 10.7 integration smoke test. No external resources/GPU required."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await b.new_page(viewport={'width':1360,'height':900})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load',timeout=45000)
  await page.locator('#region3d-open').click();await page.wait_for_timeout(1600)
  assert await page.locator('#region3d-overlay').is_visible()
  assert await page.locator('#region3d-quality').inner_text()=='Детали: auto'
  await page.locator('#region3d-quality').click()
  assert 'low' in await page.locator('#region3d-quality').inner_text()
  await page.locator('#region3d-material').click()
  assert 'кино' in await page.locator('#region3d-material').inner_text()
  await page.locator('#region3d-culling').click()
  assert 'выкл' in await page.locator('#region3d-culling').inner_text()
  await page.wait_for_timeout(600)
  assert 'LOD' in await page.locator('#region3d-hud').inner_text()
  assert 'CPU' in await page.locator('#region3d-hud').inner_text()
  await page.locator('#region3d-culling').click()
  assert 'вкл' in await page.locator('#region3d-culling').inner_text()
  await page.locator('#region3d-tuzla').click();await page.wait_for_timeout(450)
  await page.locator('#region3d-atlas').click();await page.wait_for_timeout(350)
  assert await page.locator('#atlas-overlay').is_visible()
  await page.locator('#atlas-close').click()
  await page.locator('[data-view="3d"]').click();await page.wait_for_timeout(250)
  assert await page.locator('#stage-3d').is_visible()
  assert not errors,errors
  print('PASS 10.7 browser: offline UI, quality/materials, culling toggle, GIS region 3D, atlas, bridge return; JS_ERRORS=0')
  await b.close()
if __name__=='__main__':asyncio.run(main())
