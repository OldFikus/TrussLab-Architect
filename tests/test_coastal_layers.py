from pathlib import Path
import sys
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
    stored = dialog.locator('textarea').input_value()
    dialog.locator('textarea').fill('{}')
    dialog.locator('[data-save]').click()
    assert 'GeoJSON' in dialog.locator('output').inner_text()
    page.reload()
    page.locator('#atlas-open').click()
    page.locator('#coastal-editor').click()
    assert dialog.locator('textarea').input_value() == stored
    browser.close()
