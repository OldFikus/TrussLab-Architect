import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist'])
  p=await b.new_page(viewport={'width':480,'height':340})
  await p.evaluate("""(() => {const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(t==='webgl2')return null;return g.call(this,t,...a)}})()""")
  e=[];log=[];p.on('pageerror',lambda x:e.append(str(x)));p.on('console',lambda m:log.append(m.type+':'+m.text[:500]))
  await p.set_content((ROOT/'dist/TrussLab_Architect_13_0.html').read_text(),wait_until='load',timeout=110000)
  res=await p.evaluate('''() => ({webgl:!!world3d.gl,webgl1:world3d.gl && !(world3d.gl instanceof WebGL2RenderingContext),sw:world3d.software,err:world3d.gl?.getError(),atlas:world3d.pbrAtlasInfo,cas:world3d.cascades.length,post:!!world3d.post})''')
  print('WEBGL1',res,log[-3:],'ERRORS',e,flush=True)
  await b.close()
asyncio.run(main())
