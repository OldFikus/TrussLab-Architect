#!/usr/bin/env python3
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await browser.new_page(viewport={'width':430,'height':880},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load',timeout=65000)
  assert await page.locator('#crossing-profile').is_visible()
  result=await page.evaluate('''() => ({count:world3d.approachProfileCache.size,width:document.getElementById('profile-canvas').width})''')
  assert result['count']==4 and result['width']<=650,result
  await page.locator('#road-ramp').fill('30')
  assert (await page.evaluate('world3d.approachProfileCache.size'))==4
  await page.locator('#region3d-open').click()
  assert await page.locator('#region3d-overlay').is_visible()
  assert not errors,errors
  print('PASS 11.1 browser: mobile grade chart, controls, regional world, JS_ERRORS=0')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
