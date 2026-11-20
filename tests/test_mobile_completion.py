import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
R=Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
  p=await b.new_page(viewport={'width':412,'height':900},device_scale_factor=1)
  errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.set_content((R/'dist/TrussLab_Architect_13_0.html').read_text('utf8'),wait_until='load',timeout=65000)
  assert await p.locator('#headlights-toggle').is_visible()
  assert await p.locator('#water-mode').count()==1
  assert await p.locator('#post-mode').count()==1
  assert await p.locator('#gpu-budget').count()==1
  assert await p.locator('#earthworks-toggle').count()==1
  await p.locator('#lighting').select_option('night')
  assert await p.evaluate('world3d.daylight')=='night'
  await p.locator('#headlights-toggle').click()
  assert not await p.evaluate('world3d.headlightsEnabled')
  await p.locator('#headlights-toggle').click()
  assert await p.evaluate('world3d.headlightsEnabled')
  await p.locator('#post-mode').select_option('taa')
  assert await p.evaluate('world3d.postQuality')=='taa'
  await p.locator('#gpu-budget').select_option('128')
  assert await p.evaluate('world3d.gpuBudgetMB')==128
  await p.locator('#water-mode').select_option('eco')
  assert await p.evaluate('world3d.waterMode')=='eco'
  await p.locator('#water-mode').select_option('cinematic')
  await p.locator('[data-view="2d"]').click()
  await p.locator('#plan-toggle').click()
  await p.locator('#earthworks-toggle').click()
  assert await p.locator('#earthworks-report').is_visible()
  assert 'Ж/Д' in await p.locator('#earthworks-report').inner_text()
  print('MOBILE',await p.evaluate('({width:document.documentElement.scrollWidth,view:innerWidth,daylight:world3d.daylight,water:world3d.waterMode,mode:st.view})'))
  assert not errors,errors
  await b.close()
  print('PASS mobile 412px: legacy 11.4 map diagnostics, night/day, water and headlights controls, JS errors=0')
asyncio.run(main())
