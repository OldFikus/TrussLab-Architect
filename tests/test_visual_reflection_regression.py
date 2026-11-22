#!/usr/bin/env python3
"""Guard against reflection pass leaving the main bridge vertex buffer bound incorrectly.

Software WebGL is intentionally used; this is a geometrical visibility invariant,
not photometric matching to actual construction photos.
"""
import asyncio
from io import BytesIO
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0,str(ROOT))
from tools.build import VERSION
ARGS=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']

def structural_pixels(png):
    im=Image.open(BytesIO(png)).convert('RGB')
    # Bridge pier region for the reproducible "water" preset, with UI mask excluded.
    im=im.crop((75,145,im.width-20,min(im.height,405)))
    return sum(1 for r,g,b in im.getdata() if min(r,g,b)>115 and max(r,g,b)-min(r,g,b)<50)

async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,args=ARGS)
  page=await browser.new_page(viewport={'width':1120,'height':910})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'dist'/f'TrussLab_{VERSION}_LAB.html').read_text(),wait_until='load',timeout=85000)
  await page.locator('.scene-header .views [data-view="3d"]').click()
  counts={}
  for mode in ('eco','cinematic'):
    result=await page.evaluate('''(mode)=>{world3d.postQuality='off';world3d.waterMode=mode;
      world3d.setPresetCamera('water');world3d.setSunHour(12);
      world3d.render(worldPayload(),false);
      let gl=world3d.gl;return {err:gl.getError(),reflection:world3d.reflectionPasses, staticBuilds:world3d.staticBuilds};}''',mode)
    image=await page.locator('#stage-3d').screenshot()
    counts[mode]=structural_pixels(image)
    assert result['err']==0,result
    if mode=='cinematic': assert result['reflection']>=1,result
  assert counts['eco']>10000,counts
  assert counts['cinematic']>counts['eco']*.64,('Bridge disappeared behind reflective water',counts)
  assert not errors,errors
  print('PASS visual invariant: reflective water preserves bridge structural geometry',counts,flush=True)
  await browser.close()
asyncio.run(main())
