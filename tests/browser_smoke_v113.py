#!/usr/bin/env python3
"""TrussLab 11.3: mobile browser smoke and terrain/road clearance validation."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await browser.new_page(viewport={'width':412,'height':915},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load',timeout=60000)
  assert await page.title()=='TrussLab Architect 11.3 — GeoEarthworks'
  assert await page.locator('#crossing-profile').is_visible()
  r=await page.evaluate('''() => {
   const b=world3d.kerchBounds();const data={};
   for(const [name,side,w] of [['road',b.roadSide,2.28],['rail',b.railSide,1.78]]){
    let min=1000;
    for(let x=-205;x<206;x+=3.25){const deck=x>=b.x0&&x<=b.x1?world3d.kerchSample(x,side)[1]:world3d.landApproachElevation(x,side);
      for(const f of [-1,0,1]){const z=world3d.trackCenter(x,side)+w*f;
        const h=world3d.mapHeight(x,z);if(h>-1.43)min=Math.min(min,deck-h);
      }
    }data[name]=min;
   }
   return {data,software:world3d.software,triangles:world3d.stats.triangles,versions:document.title};
  }''')
  assert r['data']['road']>.30,r
  assert r['data']['rail']>.30,r
  await page.locator('#region3d-open').click();await page.wait_for_timeout(250)
  assert await page.locator('#region3d-overlay').is_visible()
  await page.locator('#region3d-close').click()
  await page.screenshot(path=str(ROOT/'assets/qa_v113_mobile.png'),full_page=False)
  assert not errors,errors
  print('PASS 11.3 browser: autonomous mobile HTML, terrain cover',r,'no JS errors')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
