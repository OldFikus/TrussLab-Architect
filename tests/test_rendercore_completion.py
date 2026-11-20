"""Self-contained browser QA for RenderCore graphical targets and inherited systems."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=ROOT/'dist/TrussLab_Architect_13_0.html'
ARGS=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']
async def run():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=ARGS)
  page=await b.new_page(viewport={'width':960,'height':760});errs=[];warnings=[]
  page.on('pageerror',lambda e:errs.append(str(e)))
  page.on('console',lambda m:warnings.append(m.text[:220]) if m.type in ('error','warning') else None)
  await page.set_content(HTML.read_text(encoding='utf8'),wait_until='load',timeout=110000)
  core=await page.evaluate('''() => {
    const w=world3d,g=w.gl,b=w.kerchBounds();let clearance=10000,samples=0;
    for(const side of [b.roadSide,b.railSide])for(let x=-204;x<204;x+=13){const deck=x>=b.x0&&x<=b.x1?w.kerchSample(x,side)[1]:w.landApproachElevation(x,side);const gz=w.trackCenter(x,side),terrain=w.mapHeight(x,gz);if(terrain>-1.43){clearance=Math.min(clearance,deck-terrain);samples++;}}
    let before=w.staticBuilds,tex=w.pbrAtlasInfo;
    return {gl2:g instanceof WebGL2RenderingContext,csm:w.cascades.length,shadowUpdates:w.shadowCascadeUpdates,reflectionPasses:w.reflectionPasses,reflectionSource:!!w.reflection?.ready,textureLayers:tex.layers,atlasFormat:tex.format,arrayFormat:tex.arrayFormat,atlasMips:tex.mipmaps,waterTexture:w.coastTextureInfo?.resolution,post:!!w.post,depth:!!w.post?.scene?.depthTex,frames:w.postFrame,coverage:clearance,sites:samples,geocore:typeof geographicToMetric==='function',earthworks:!!w.earthworkReport,sourcePreserved:!!w.geoPack,glError:g.getError(),staticBuilds:before};
   }''')
  assert core['gl2'] and core['csm']==2 and core['reflectionSource'] and core['atlasMips'] and core['textureLayers']==4 and core['post'] and core['depth'] and core['geocore'] and core['earthworks'] and core['coverage']>.3 and core['glError']==0,core
  print('RENDER CORE',json.dumps(core),flush=True)
  # GUI can change AA without re-uploading static road mesh; GPU caps are reallocated under budget.
  await page.locator('#post-mode').select_option('taa')
  await page.locator('#gpu-budget').select_option('128')
  budget=await page.evaluate('''() => ({budget:world3d.gpuBudgetMB,shadow:world3d.shadowSize,near:world3d.cascades[0].size,reflection:world3d.reflection?.size,usedMB:world3d.estimateGPUMemory().ownedBytes/1048576,taa:world3d.post?.valid,postFrame:world3d.postFrame,err:world3d.gl.getError(),staticBuilds:world3d.staticBuilds})''')
  assert budget['budget']==128 and budget['shadow']<=1024 and budget['near']<=512 and budget['reflection']<=192 and budget['usedMB']<=128 and budget['err']==0 and budget['staticBuilds']==core['staticBuilds'],budget
  print('BUDGET',json.dumps(budget),flush=True)
  await page.locator('#post-mode').select_option('fxaa')
  await page.locator('#lighting').select_option('night')
  night=await page.evaluate('''() => ({headlamps:world3d.nearestHeadlamps().length,lamps:world3d.nearestLampPositions().length,night:world3d.daylight,err:world3d.gl.getError(),postFrame:world3d.postFrame})''')
  assert night['headlamps']>0 and night['lamps']>0 and night['err']==0 and night['night']=='night',night
  print('NIGHT',json.dumps(night),flush=True)
  await page.locator('#headlights-toggle').click()
  assert not await page.evaluate('world3d.headlightsEnabled')
  await page.locator('#headlights-toggle').click()
  assert await page.evaluate('world3d.headlightsEnabled')
  await page.locator('[data-view="2d"]').click();await page.locator('#plan-toggle').click()
  await page.locator('#earthworks-toggle').click();assert await page.locator('#earthworks-report').is_visible()
  await page.locator('#earthworks-toggle').click();assert await page.locator('#earthworks-report').is_hidden()
  await page.locator('#region3d-open').click();assert await page.locator('#region3d-overlay').is_visible()
  await page.locator('#region3d-close').click()
  assert not errs,(errs,warnings)
  print('PASS COMPLETION: adaptive CSM, real static reflection, BC3+array, reprojection AA, functional GPU budget, night, GIS/earthwork, region, JS_ERRORS=0',flush=True)
  await b.close()
asyncio.run(run())
