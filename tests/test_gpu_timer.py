import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def run():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'])
  page=await b.new_page(viewport={'width':480,'height':380});await page.set_content((ROOT/'dist/TrussLab_Architect_13_0.html').read_text(),wait_until='load')
  await page.wait_for_timeout(1600)
  result=await page.evaluate('''() => {const w=world3d,t=w.gpuTimer,g=w.gl,ex=t.ext;return {enabled:!!ex,disjoint:!!ex&&g.getParameter(ex.GPU_DISJOINT_EXT),queries:w.gpuStats.queries,gpuMs:w.gpuStats.gpuMs,pending:t.pending.length,active:!!t.active,available:t.pending.length?g.getQueryParameter(t.pending[0],g.QUERY_RESULT_AVAILABLE):null,err:g.getError()};}''')
  print(result,flush=True);await b.close()
asyncio.run(run())
