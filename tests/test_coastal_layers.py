from pathlib import Path
import sys
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.build import VERSION

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--enable-unsafe-swiftshader'])
    page = browser.new_page()
    page.goto((ROOT / 'dist' / f'TrussLab_{VERSION}_SAFE.html').as_uri())
    page.locator('#atlas-open').click()
    page.locator('#coastal-editor').click()
    dialog = page.get_by_role('dialog', name='Редактор береговых слоёв')
    dialog.locator('[data-example]').click()
    dialog.locator('[data-save]').click()
    summary = dialog.locator('output').inner_text()
    assert 'Объектов: 1' in summary and '%' in summary, summary
    coverage = page.evaluate("""() => {
      const values = new Int16Array(256).fill(-999); values[0]=0;
      const dem=parseGeoPack({type:'TrussLabGeoPack',version:1,gridSize:16,sceneSize:100,
        dem:{noData:-999,scaleMetres:1,encoding:'int16le/base64',data:btoa(String.fromCharCode(...new Uint8Array(values.buffer)))}}).dem;
      return [dem.validCount,dem.values.length];
    }""")
    assert coverage == [1,256]
    assert 'Покрытие сетки высот' in dialog.inner_text()
    collection = json.loads(dialog.locator('textarea').input_value())
    x, y = collection['features'][0]['geometry']['coordinates'][0][:2]
    ring = [[x,y],[x+.001,y],[x,y+.001],[x,y]]
    for kind in ['tidal', 'spit', 'island']:
        collection['features'].append({'type':'Feature','properties':{'kind':kind,'source':'QA'},
            'geometry':{'type':'Polygon','coordinates':[ring]}})
    dialog.locator('textarea').fill(json.dumps(collection))
    dialog.locator('[data-save]').click()
    assert 'Объектов: 4' in dialog.locator('output').inner_text()
    def draw_kinds():
        return page.evaluate('''() => {
          const draw=atlas._drawGeometry, calls=[];
          atlas._drawGeometry=function(ctx,geometry,kind){calls.push(kind);return draw.call(this,ctx,geometry,kind);};
          try{atlas.coastalOverlay(atlas.ctx);}finally{atlas._drawGeometry=draw;}
          return calls;
        }''')
    assert draw_kinds()==['road','area','area','area']
    dialog.get_by_label('Приливная зона').uncheck()
    assert draw_kinds()==['road','area','area']
    dialog.locator('textarea').fill('{}')
    dialog.locator('[data-save]').click()
    assert 'GeoJSON' in dialog.locator('output').inner_text()
    page.reload()
    page.locator('#atlas-open').click()
    page.locator('#coastal-editor').click()
    assert json.loads(dialog.locator('textarea').input_value()) == collection
    browser.close()
