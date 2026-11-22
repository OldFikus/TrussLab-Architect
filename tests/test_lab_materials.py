"""Exercise the optional LAB shadow and material pipeline on the distributed HTML."""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.build import VERSION

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 760})
    page.goto((ROOT/'dist'/f'TrussLab_{VERSION}_LAB.html').as_uri())
    page.locator('.scene-header .views [data-view="3d"]').click()
    page.locator('#quality-lab-open').click()
    page.locator('#q-shadow-detail').select_option('fine')
    page.wait_for_function('world3d.cascades.length===2 && world3d.cascades.every(c=>c.matrix) && world3d.shadowMatrix')
    data = page.evaluate("""() => {
      const w=world3d, gl=w.gl, uniform=name=>gl.getUniform(w.prog,gl.getUniformLocation(w.prog,name));
      return {profile:w.shaderProfile, layers:w.pbrAtlasInfo?.layers,
        array:!!w.pbrArray, splits:[...uniform('cascadeSplits')], maps:['shadowMap','shadowMapNear','shadowMapMid'].map(uniform),
        error:gl.getError(), lost:gl.isContextLost()};
    }""")
    print(data)
    assert data['profile']=='balanced' and data['layers']==4 and data['array'], data
    assert data['splits'][0]>0 and data['maps']==[1,2,3] and data['error']==0 and not data['lost'], data
    page.locator('#q-shadow-detail').select_option('standard')
    page.wait_for_function("world3d.gl.getUniform(world3d.prog,world3d.uCascadeSplits)[0]===0")
    assert page.evaluate('!!world3d.gpuTimer')
    if page.evaluate('!!world3d.gpuTimer.ext'):
        page.wait_for_function('world3d.gpuStats.queries>0 && world3d.gpuStats.gpuMs>=0',timeout=60000)
    browser.close()
