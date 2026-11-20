import asyncio,json,math,subprocess,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets'
# A SYNTHETIC test building in the current approximate map frame, not a real building.
def geo(x,z):
 lat0,lon0=45.308440,36.506491
 dx=(x+118)*80;dz=(z+8.6447513)*80;t=math.radians(-24)
 e=dx*math.cos(t)-dz*math.sin(t);n=dx*math.sin(t)+dz*math.cos(t)
 mlon=111412.84*math.cos(math.radians(lat0))-93.5*math.cos(math.radians(lat0)*3)
 return [lon0+e/mlon,lat0+n/111132.92]
def box(x,z):return [geo(x-1.5,z-1),geo(x+1.5,z-1),geo(x+1.5,z+1),geo(x-1.5,z+1),geo(x-1.5,z-1)]
async def main():
 server=subprocess.Popen(['python3','-m','http.server','8874','--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(.5)
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
   page=await browser.new_page(viewport={'width':1440,'height':920},device_scale_factor=1)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.set_content((ROOT/'index.html').read_text('utf8'),wait_until='load')
   await page.wait_for_timeout(700)
   print('TITLE',await page.title())
   print('3D',await page.locator('#stage-3d').is_visible(),'GEO_CITY_TOOLBAR',await page.locator('#geocity-toolbar').is_visible())
   await page.locator('[data-view="2d"]').click()
   await page.locator('#plan-toggle').click()
   print('2D_MAP',await page.locator('#stage').is_visible(),'GEO_CITY_TOOLBAR',await page.locator('#geocity-toolbar').is_visible())
   fake={'type':'FeatureCollection','name':'synthetic browser QA fixture (NOT geodata)','features':[
     {'type':'Feature','properties':{'building':'yes','height':10},'geometry':{'type':'Polygon','coordinates':[box(-155,-80)]}},
     {'type':'Feature','properties':{'highway':'residential'},'geometry':{'type':'LineString','coordinates':[geo(-156,-75),geo(-149,-75)]}}
   ]}
   await page.locator('#city-import-file').set_input_files({'name':'qa_synthetic_geojson.geojson','mimeType':'application/geo+json','buffer':json.dumps(fake).encode()})
   await page.wait_for_timeout(500)
   print('CITY',await page.locator('#city-count').inner_text(),'STATUS',(await page.locator('#status').inner_text())[:120])
   await page.screenshot(path=str(OUT/'qa_v102_city_2d.png'),full_page=True)
   await page.locator('#city-toggle').click()
   print('TOGGLE',await page.locator('#city-toggle').inner_text())
   await page.locator('#city-toggle').click()
   await page.locator('[data-view="3d"]').click()
   await page.wait_for_timeout(900)
   print('CITY_3D',await page.locator('#city-count').inner_text())
   await page.screenshot(path=str(OUT/'qa_v102_city_3d.png'),full_page=True)
   print('ERRORS',errors)
   await browser.close()
   if errors:raise AssertionError(errors)
 finally:server.terminate()
asyncio.run(main())
