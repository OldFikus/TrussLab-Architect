#!/usr/bin/env python3
import asyncio, subprocess, time, json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 server=subprocess.Popen(['python3','-m','http.server','8876','--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(.45)
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
   page=await browser.new_page(viewport={'width':1380,'height':850},device_scale_factor=1)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load')
   await page.wait_for_timeout(450)
   await page.locator('#atlas-open').click()
   await page.wait_for_timeout(100)
   print('VISIBLE',await page.locator('#atlas-overlay').is_visible(),'HTML',await page.locator('#atlas-overlay').evaluate('(e)=>e.outerHTML.slice(0,180)'),'ERR',errors)
   assert await page.locator('#atlas-overlay').is_visible()
   print('ATLAS OPEN',await page.locator('#atlas-status').inner_text())
   await page.locator('#atlas-demo').click()
   await page.wait_for_timeout(500)
   print('DEMO',await page.locator('#atlas-status').inner_text())
   assert 'тайлов' in (await page.locator('#atlas-status').inner_text())
   await page.screenshot(path=str(ROOT/'assets'/'qa_v103_demo_atlas.png'),full_page=True)
   await page.locator('#atlas-crimea').click()
   await page.wait_for_timeout(100)
   print('CRIMEA ZOOM',await page.locator('#atlas-status').inner_text())
   await page.locator('#atlas-kerch').click()
   async def route_demo(route):
    request_url=route.request.url
    rel=request_url.split('/data/region_demo_tiles/')[-1]
    data=(ROOT/'data'/'region_demo_tiles'/rel).read_bytes()
    await route.fulfill(status=200,body=data,content_type='application/json')
   await page.route('https://atlas.test/data/region_demo_tiles/**',route_demo)
   await page.locator('#atlas-url').fill('https://atlas.test/data/region_demo_tiles/index.json')
   await page.locator('#atlas-connect-url').click()
   await page.wait_for_timeout(450)
   print('URL INDEX',await page.locator('#atlas-status').inner_text())
   assert 'http' in (await page.locator('#atlas-status').inner_text())
   # File-input load uses the exact same local tile pack; no web-server needed in production.
   path=ROOT/'data'/'region_demo_tiles'
   await page.locator('#atlas-file-picker').set_input_files(str(path))
   await page.wait_for_timeout(450)
   print('FOLDER',await page.locator('#atlas-status').inner_text())
   assert 'directory' in (await page.locator('#atlas-status').inner_text())
   await page.screenshot(path=str(ROOT/'assets'/'qa_v103_directory_atlas.png'),full_page=True)
   # Transfer currently loaded visible source objects into local (not global) 3D.
   await page.locator('#atlas-3d').click()
   await page.wait_for_timeout(250)
   print('TRANSFER_3D',await page.locator('#city-count').inner_text())
   assert not await page.locator('#atlas-overlay').is_visible()
   await page.locator('[data-view="3d"]').click()
   await page.wait_for_timeout(400)
   print('BRIDGE REOPEN',await page.locator('#stage-3d').is_visible())
   print('PAGEERROR',errors)
   await browser.close()
   if errors:raise AssertionError(errors)
 finally:server.terminate()
if __name__=='__main__':asyncio.run(main())
