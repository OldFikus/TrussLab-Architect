#!/usr/bin/env python3
"""11.4 Earthworks Inspector mobile UI and embedded HTML browser test."""
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
  assert await page.title()=='TrussLab Architect 11.4 — Earthworks Inspector'
  await page.locator('[data-view="2d"]').click()
  await page.locator('#plan-toggle').click()
  assert await page.locator('#earthworks-toggle').is_visible()
  await page.locator('#earthworks-toggle').click()
  assert await page.locator('#earthworks-report').is_visible()
  report=await page.locator('#earthworks-report').inner_text()
  assert 'АВТО' in report and 'Ж/Д' in report and 'срез' in report,report
  await page.screenshot(path=str(ROOT/'assets/qa_v114_earthworks_map.png'),full_page=False)
  await page.locator('#earthworks-toggle').click()
  assert await page.locator('#earthworks-report').is_hidden()
  await page.locator('[data-view="3d"]').click()
  await page.locator('#region3d-open').click()
  assert await page.locator('#region3d-overlay').is_visible()
  await page.locator('#region3d-close').click()
  assert not errors,errors
  print('PASS 11.4 browser: earthworks heatmap and report, toggle, return to world, zero JS errors')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
