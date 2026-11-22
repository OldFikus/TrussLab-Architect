"""Interact with the standalone HTML and import an offline region from disk."""
from pathlib import Path
import os
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools.build import VERSION
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'), args=['--no-sandbox','--enable-unsafe-swiftshader'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.context.set_offline(True)
    for profile in ('SAFE','LAB'):
        page.goto((ROOT/'dist'/f'TrussLab_{VERSION}_{profile}.html').as_uri())
        page.locator('#rc-guide').click()
        assert 'Учебная гавань' in page.locator('dialog[open]').inner_text()
        page.locator('dialog[open] button').click()
        page.locator('#atlas-open').click()
        page.locator('#planet-atlas').click()
        page.locator('dialog[open] [data-open]').click()
        page.wait_for_function("atlas.store.loaded===1 && atlas.store.mode==='Демо'")
        page.locator('#atlas-file-picker').set_input_files(ROOT/'examples/region')
        page.wait_for_function("atlas.store.mode==='directory' && atlas.store.loaded===1 && atlas.stats.shapes===1 && document.querySelector('#atlas-status').textContent.includes('CC0-1.0')")
        page.locator('#fidelity-open').click()
        assert 'Вымысел' in page.locator('#fidelity-dialog [data-record]').inner_text()
        assert page.evaluate("BUILTIN_GLB_ASSETS.filter(m=>m.basis).every(m=>decodeGLB(aDecode64(m.variants.high)).triangles>0)")
        page.locator('#fidelity-dialog section select').select_option('melek-chamber')
        assert '3,7 × 4' in page.locator('#fidelity-dialog [data-description]').inner_text()
        page.locator('[data-reason]').fill('Повторный осмотр')
        page.locator('[data-correction]').fill('Состояние проверено')
        page.locator('[data-apply]').click()
        assert 'Состояние проверено' in page.locator('[data-record]').inner_text()
        assert page.locator('[data-history] li').count() >= 1
        page.locator('[data-photo-rights]').fill('TrussLab · тест')
        photo_bytes = __import__('base64').b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmS8AAAAASUVORK5CYII=')
        page.locator('[data-photo]').set_input_files({'name':'reference.png','mimeType':'image/png','buffer':photo_bytes})
        page.locator('#fidelity-dialog img').wait_for(state='visible')
        page.locator('[data-clear]').click()
        assert page.locator('#fidelity-dialog img').is_hidden()
        page.locator('#fidelity-dialog [data-close]').click()
        assert 'CC0-1.0' in page.locator('#atlas-status').inner_text()
        assert abs(page.evaluate('mercatorUnproject(atlas.center.x,atlas.center.y).lon') - .005) < 1e-8
        page.locator('#atlas-demo').click()
        page.wait_for_function("atlas.store.loaded > 0 && atlas.stats.shapes > 1")
    browser.close()
    assert not errors, errors
