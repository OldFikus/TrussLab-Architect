#!/usr/bin/env python3
"""InfrastructureSim browser integration: controls, 2D graph, export, WorldEditor continuity."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=ROOT/'dist/TrussLab_Architect_14_9.html'
FLAGS=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']
async def test(viewport):
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=FLAGS)
  page=await browser.new_page(viewport=viewport,accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(HTML.read_text(encoding='utf8'),wait_until='load',timeout=80000)
  assert await page.title()=='TrussLab Architect 14.9 — InfrastructureSim'
  assert await page.locator('#infra-open').count()==1
  await page.locator('#infra-open').click();assert await page.locator('#infra-root').is_visible()
  await page.locator('#is-pause').click()
  await page.locator('#is-demo').click();await page.wait_for_timeout(350)
  rep=await page.evaluate('trusslabInfraSim.report()')
  assert rep['road']['edges']>=5 and rep['rail']['edges']>=8,rep
  assert rep['rail']['components']==1,rep
  await page.locator('#is-route').click()
  assert 'Длина маршрута' in await page.locator('#is-status').inner_text()
  await page.locator('#is-agent-cap').fill('8');await page.locator('#is-agent-cap').dispatch_event('change')
  await page.locator('#is-car-ten').click()
  assert await page.evaluate('trusslabInfraSim.carAgents.length')<=8
  await page.locator('#is-train').click()
  assert await page.evaluate('trusslabInfraSim.trainSchedules.length')==1
  await page.locator('#is-ship').click()
  assert await page.evaluate('trusslabInfraSim.ships.length')==1
  await page.locator('#is-nav-height').fill('10');await page.locator('#is-air-draft').fill('30')
  await page.locator('#is-ship').click();assert await page.evaluate('trusslabInfraSim.stats.shipBlocked')>=1
  await page.locator('#is-load').click();assert 'Опоры:' in await page.locator('#is-load-results').inner_text()
  await page.locator('#is-soil').select_option('peat');await page.locator('#is-foundation').click()
  assert await page.evaluate('trusslabInfraSim.foundations.length')==1
  await page.locator('#is-rain').fill('80');await page.locator('#is-rain').dispatch_event('input')
  await page.locator('#is-night').check()
  assert await page.evaluate('trusslabInfraSim.weather.night')
  await page.locator('#is-snapshot').click();await page.locator('#is-rain').fill('0');await page.locator('#is-rain').dispatch_event('input')
  await page.locator('#is-snapshot').click();await page.locator('#is-compare').click()
  assert 'Δ скорости' in await page.locator('#is-comparison').inner_text()
  async with page.expect_download() as download:await page.locator('#is-export').click()
  assert (await download.value).suggested_filename=='TrussLab_InfrastructureSim_Project.json'
  async with page.expect_download() as download:
   # Download again for import buffer can use JS model rather than file
   await page.locator('#is-export').click()
  bundle=await page.evaluate('''()=>({format:'TrussLab-InfrastructureBundle',version:1,editor:trusslabEditor.export(),sim:trusslabInfraSim.export()})''')
  await page.locator('#is-file').set_input_files({'name':'scene.json','mimeType':'application/json','buffer':__import__('json').dumps(bundle).encode('utf8')})
  assert 'восстановлены' in await page.locator('#is-status').inner_text()
  await page.locator('#is-back').click();assert await page.locator('#we-root').is_visible()
  await page.locator('#we-close').click()
  assert not errors,errors
  if viewport['width']<700:
   await page.locator('#infra-open').click();await page.wait_for_timeout(150)
   await page.screenshot(path=str(ROOT/'tests/infrastructure_mobile.png'),full_page=False)
  else:
   await page.locator('#infra-open').click();await page.wait_for_timeout(150)
   await page.screenshot(path=str(ROOT/'tests/infrastructure_desktop.png'),full_page=False)
  report=await page.evaluate('trusslabInfraSim.report()')
  print('PASS InfrastructureSim browser',viewport['width'],{k:report[k] for k in ['cars','trains','navLaneCount','foundationCount','road','rail','night']},'errors',len(errors))
  await browser.close()
async def main():
 await test({'width':1320,'height':890})
 await test({'width':412,'height':900})
if __name__=='__main__':asyncio.run(main())
