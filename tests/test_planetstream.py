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
        page.locator('#atlas-open').click()
        page.locator('#planet-atlas').click()
        page.locator('dialog[open] [data-open]').click()
        page.wait_for_function("atlas.store.loaded===1 && atlas.store.mode==='Демо'")
        page.locator('#atlas-file-picker').set_input_files(ROOT/'examples/region')
        page.wait_for_function("atlas.store.loaded === 1 && atlas.stats.shapes === 1")
        assert 'CC0-1.0' in page.locator('#atlas-status').inner_text()
        assert abs(page.evaluate('mercatorUnproject(atlas.center.x,atlas.center.y).lon') - .005) < 1e-8
        page.locator('#atlas-demo').click()
        page.wait_for_function("atlas.store.loaded > 0 && atlas.stats.shapes > 1")
    browser.close()
    assert not errors, errors
