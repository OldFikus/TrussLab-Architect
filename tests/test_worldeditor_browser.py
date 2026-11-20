import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
  p=await b.new_page(viewport={'width':1320,'height':820})
  errs=[];p.on('pageerror',lambda e:errs.append(str(e)))
  await p.set_content((ROOT/'dist/TrussLab_Architect_14_0.html').read_text(),wait_until='load',timeout=65000)
  await p.wait_for_timeout(450)
  print('BOOT',await p.evaluate('''() => ({core:!!globalThis.TrussLabWorldEditorCore,editor:!!globalThis.trusslabEditor,btn:!!document.querySelector('#worldeditor-open')})'''),'ERRORS',errs[:3],flush=True)
  await p.locator('#worldeditor-open').click()
  await p.wait_for_timeout(550)
  print('OPEN',await p.locator('#we-root').is_visible(),'canvas',await p.locator('#we-canvas').evaluate('(e)=>[e.width,e.height]'),'errors',errs[:5],flush=True)
  await p.screenshot(path=str(ROOT/'tests/worldeditor_open.png'))
  await p.locator('[data-tool="building"]').click()
  await p.locator('#we-canvas').click(position={'x':340,'y':260})
  print('ADDED',await p.evaluate('trusslabEditor.summary()'),'error',errs[:5],flush=True)
  await p.locator('#we-view').click()
  await p.wait_for_timeout(180)
  await p.screenshot(path=str(ROOT/'tests/worldeditor_iso.png'))
  await p.locator('#we-close').click()
  print('CLOSED',await p.locator('#we-root').is_hidden())
  await b.close()
asyncio.run(main())
