import asyncio
from playwright.async_api import async_playwright
from pathlib import Path
import subprocess, time
async def main():
 srv=subprocess.Popen(['python3','-m','http.server','8873','--bind','127.0.0.1'],cwd='/mnt/data/TrussLab_Architect_10_1',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(.5)
 try:
  await run_browser()
 finally:srv.terminate()
async def run_browser():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  page=await browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:8873/TrussLab_Architect_10_1_Standalone.html',wait_until='load')
  await page.wait_for_timeout(1500)
  print('TITLE',await page.title(),'err',errors,'status',await page.locator('#status').inner_text())
  print('BUILDER',await page.locator('#settlement-toolbar').is_visible(),'view3d',await page.locator('#stage-3d').is_visible())
  await page.locator('#plan-toggle').click()
  await page.wait_for_timeout(300)
  print('MAP=',await page.locator('#stage').is_visible(),'BUILDER=',await page.locator('#settlement-toolbar').is_visible())
  await page.locator('#building-seed').click()
  await page.wait_for_timeout(250)
  print('SEED',await page.locator('#building-count').inner_text(),'status=',await page.locator('#status').inner_text(),'ERRORS',errors)
  await page.screenshot(path='/mnt/data/TrussLab_Architect_10_1/assets/preview_10_1_city_plan.png',full_page=True)
  await page.locator('[data-view="3d"]').click()
  await page.wait_for_timeout(500)
  print('3d',await page.locator('#building-count').inner_text(),'err=',errors)
  await page.screenshot(path='/mnt/data/TrussLab_Architect_10_1/assets/preview_10_1_city_3d.png',full_page=True)
  await page.locator('#building-clear').click()
  print('clear',await page.locator('#building-count').inner_text(),'err=',errors)
  await browser.close()
  if errors:raise AssertionError(errors)
asyncio.run(main())
