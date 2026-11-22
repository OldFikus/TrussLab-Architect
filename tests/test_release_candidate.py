from pathlib import Path
import sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tools.build import VERSION
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--enable-unsafe-swiftshader'])
    page=browser.new_page()
    page.goto((ROOT/'dist'/f'TrussLab_{VERSION}_SAFE.html').as_uri())
    page.evaluate("async()=>{await TrussLabRecovery.checkpoint();await TrussLabRecovery.restore();}")
    page.locator('.scene-header .views [data-view="3d"]').click()
    page.evaluate("""()=>{const ext=world3d.gl?.getExtension('WEBGL_lose_context');if(!ext)throw Error('Loss simulation unavailable');ext.loseContext();setTimeout(()=>ext.restoreContext(),700);}""")
    page.wait_for_function("document.querySelector('#rc-recover')?.parentElement.textContent.includes('Восстановлено') && world3d.gl && !world3d.gl.isContextLost()",timeout=60000)
    page.locator('#quality-lab-open').click()
    page.get_by_text('Телеметрия за 5 секунд',exact=True).click()
    page.locator('#rc-profile').click()
    page.wait_for_function("Number(JSON.parse(document.querySelector('#rc-profile').parentElement.dataset.report||'{}').p95Ms)>0")
    browser.close()
