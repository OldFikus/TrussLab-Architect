"""Smoke-test the released HTML on the host browser and record the observed GPU."""
import json
import platform
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tools.build import VERSION
engine=sys.argv[1]
with sync_playwright() as pw:
    args=['--enable-unsafe-swiftshader'] if engine=='chromium' else []
    browser=getattr(pw,engine).launch(args=args)
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.context.set_offline(True)
    page.goto((ROOT/'dist'/f'TrussLab_{VERSION}_SAFE.html').as_uri(),timeout=90000)
    page.locator('#atlas-open').click()
    page.locator('#planet-atlas').click()
    page.locator('dialog[open] [data-open]').click()
    page.wait_for_function("atlas.store.loaded===1 && atlas.stats.shapes===1")
    page.locator('#atlas-close').click()
    page.locator('.scene-header .views [data-view="3d"]').click()
    page.locator('#quality-lab-open').click()
    page.locator('#q-diagnostics').click()
    data=page.evaluate("""()=>{const gl=world3d.gl,ext=gl?.getExtension('WEBGL_debug_renderer_info');return {
      api:world3d.gpuBackend.api,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER)||'2D',
      lost:gl?.isContextLost()||false,canvas:[world3d.canvas.width,world3d.canvas.height]}}""")
    assert not errors and not data['lost'] and min(data['canvas'])>1,(errors,data)
    page.locator('#q-close').click()
    page.locator('#region3d-open').click()
    available = page.evaluate('async()=>Boolean(await navigator.gpu?.requestAdapter())')
    data['webgpuAdapter'] = available
    if available:
        assert page.evaluate('async()=>Boolean(region3d.webgpu || await region3d.enableWebGPU())')
        page.evaluate('region3d.webgpu.device.destroy()')
        page.wait_for_function('!region3d.webgpu && region3d.webgpuError.length>0')
        assert page.evaluate('region3d.active && Boolean(region3d.gl||region3d.software)')
        assert page.evaluate('async()=>await region3d.enableWebGPU()')
        data['webgpuRecreated'] = True
    assert not errors, errors
    data.update(os=platform.system(),engine=engine,version=browser.version)
    print(json.dumps(data,ensure_ascii=False))
    Path(f'compat-{platform.system()}-{engine}.json').write_text(json.dumps(data,ensure_ascii=False))
    browser.close()
