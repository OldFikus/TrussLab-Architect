"""Render both distributed profiles with missing WebGL and with MSAA unavailable."""
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.build import VERSION

def run(browser, profile, block_all):
    page = browser.new_page(viewport={'width': 1000, 'height': 700})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,opts){
        if (/webgl/.test(type) && (BLOCK_ALL || opts?.antialias!==false)) return null;
        return original.apply(this,arguments);
      };""".replace('BLOCK_ALL',str(block_all).lower()))
    page.goto((ROOT/'dist'/f'TrussLab_{VERSION}_{profile}.html').as_uri())
    page.locator('.scene-header .views [data-view="3d"]').click()
    if block_all:
        page.wait_for_function('world3d.software && world3d.softwareDrawnTriangles>0')
        page.evaluate("()=>{st.track='bridge';st.idx=BRIDGES.findIndex(b=>b.id==='kerch');world3d.start(worldPayload());}")
        assert page.evaluate('world3d.map && world3d.cpuRenderer.depth.some(z=>z>0)')
        page.locator('#quality-lab-open').click()
        assert 'Попытки запуска WebGL' in page.locator('#q-report').inner_text()
        # A tiled solid sheet must cover every interior pixel, regardless of triangle count.
        result = page.evaluate("""()=>{
          const scene=world3d, flat=[], near=[], far=[];
          function tri(mesh,points,z,mat){for(const [x,y] of points)mesh.push(x,y,z,0,1,0,mat);}
          for(let i=0;i<64;i++)for(let j=0;j<64;j++){
            const x=(i-32)/32,y=(j-32)/32,d=1/32;
            tri(flat,[[x,y],[x+d,y],[x+d,y+d]],2,0);
            tri(flat,[[x,y],[x+d,y+d],[x,y+d]],2,0);
          }
          tri(near,[[-.5,-.5],[.5,-.5],[0,.5]],1,6);
          tri(far,[[-1,-1],[1,-1],[0,1]],2,1);
          const cv=document.createElement('canvas');cv.width=cv.height=128;
          const test=Object.create(scene);test.ctx=cv.getContext('2d');test.eye=[0,0,0];
          test.cameraBasis=()=>({right:[1,0,0],up:[0,1,0],forward:[0,0,1]});
          test.mesh={a:flat};test.buildingMesh={a:near};test.trafficMesh={a:far};
          const renderer=new SoftwareSceneRenderer();renderer.draw(test,128,128);
          let gaps=0;for(let y=12;y<116;y++)for(let x=12;x<116;x++)if(!renderer.depth[y*128+x])gaps++;
          const nearest=renderer.depth[64*128+64];
          test.mesh={a:[-.5,-.5,-1,0,1,0,6,.5,-.5,1,0,1,0,6,0,.5,1,0,1,0,6]};
          test.buildingMesh=test.trafficMesh={a:[]};renderer.draw(test,128,128);
          return [gaps,nearest,renderer.depth.some(v=>v>0)];
        }""")
        assert result == [0,1,True], result
    else:
        page.wait_for_function("world3d.gl && !world3d.gl.isContextLost() && !world3d.software")
        assert page.evaluate("world3d.gpuBackend.attempts.some(s=>s.includes('[no-msaa] context created'))")
        assert page.evaluate('world3d.shaderProfile') == ('safe' if profile=='SAFE' else 'balanced')
    assert not errors, errors
    print(profile, 'CPU' if block_all else 'WebGL without MSAA', 'passed', flush=True)
    page.close()

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'),args=['--enable-unsafe-swiftshader'])
    for profile in ('SAFE','LAB'):
        for block in (True,False):
            run(browser,profile,block)
    browser.close()
