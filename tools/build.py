#!/usr/bin/env python3
"""Build and package TrussLab Architect 13.0 using Python standard library only.

Git tracks source + tests. GitHub Releases gets HTML/ZIP only.
"""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
DIST = ROOT / 'dist'
DIST.mkdir(parents=True, exist_ok=True)

html_template = (SRC / 'template.html').read_text(encoding='utf-8')
css = (SRC / 'style.css').read_text(encoding='utf-8')
modules = ['rendercore/materials.js', 'rendercore/capabilities.js', 'game.js']
js = '\n'.join((SRC / p).read_text(encoding='utf-8') for p in modules)
for needle in ('/* {{ STYLES }} */', '/* {{ SCRIPT }} */'):
    assert html_template.count(needle) == 1, f'Missing or repeated build marker: {needle}'
html = html_template.replace('/* {{ STYLES }} */', css).replace('/* {{ SCRIPT }} */', js)
html = html.replace('TrussLab Architect 11.4 — Earthworks Inspector', 'TrussLab Architect 13.0 — RenderCore Complete')
assert '/* {{ STYLES }} */' not in html and '/* {{ SCRIPT }} */' not in html
assert len(html) > 1_500_000, 'Incomplete build: bundled data or runtime missing'
out_html = DIST / 'TrussLab_Architect_13_0.html'
out_html.write_text(html, encoding='utf-8')

# Minimal runnable ZIP for end users.
with zipfile.ZipFile(DIST / 'TrussLab_Architect_13_0_Portable.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=8) as z:
    z.write(out_html, out_html.name)
    z.writestr('START_HERE_RU.txt', 'Откройте TrussLab_Architect_13_0.html в браузере. Для полноценного редактирования исходников скачайте Source ZIP из Releases или Code → Download ZIP.\n')

# Reproducible source package excluding compiled output and caches.
include = sorted([p for base in ('src', 'tools', 'tests', 'docs', '.github/workflows') for p in (ROOT / base).rglob('*') if p.is_file()])
include += [ROOT / 'README.md', ROOT / 'ROADMAP_10_8_TO_20_0_RU.md', ROOT / '.gitignore']
with zipfile.ZipFile(DIST / 'TrussLab_Architect_13_0_Source.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=8) as z:
    for p in include:
        if '__pycache__' not in p.parts and p.suffix != '.pyc':z.write(p, p.relative_to(ROOT))

for name in ('TrussLab_Architect_13_0.html', 'TrussLab_Architect_13_0_Portable.zip', 'TrussLab_Architect_13_0_Source.zip'):
    f = DIST / name
    print(f'{name}: {f.stat().st_size:,} B · sha256 {hashlib.sha256(f.read_bytes()).hexdigest()}')
