#!/usr/bin/env python3
"""Offline build of TrussLab 15.0 InfrastructureSim. No network dependencies."""
from pathlib import Path
import hashlib
import zipfile
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'src'; DIST=ROOT/'dist'; DIST.mkdir(parents=True,exist_ok=True)
modules=['rendercore/materials.js','rendercore/capabilities.js','game.js','worldeditor_core.js','worldeditor_ui.js','worldeditor_region3d.js','infrastructure_core.js','infrastructure_ui.js']
for name in modules: assert (SRC/name).is_file(), name
html=(SRC/'template.html').read_text('utf8')
css=(SRC/'style.css').read_text('utf8')+'\n'+(SRC/'worldeditor.css').read_text('utf8')+'\n'+(SRC/'infrastructure.css').read_text('utf8')
script='\n'.join((SRC/name).read_text('utf8') for name in modules)
assert html.count('/* {{ SCRIPT }} */')==1 and html.count('/* {{ STYLES }} */')==1
html=html.replace('/* {{ STYLES }} */',css).replace('/* {{ SCRIPT }} */',script)
html=html.replace('TrussLab Architect 14.0 — WorldEditor 2','TrussLab Architect 15.0 — InfrastructureSim').replace('TrussLab Architect 14.9 — InfrastructureSim','TrussLab Architect 15.0 — InfrastructureSim')
assert len(html)>1_800_000 and 'TrussLabWorldEditorCore' in html and 'worldeditor-open' in script
out=DIST/'TrussLab_Architect_15_0.html';out.write_text(html,encoding='utf8')
with zipfile.ZipFile(DIST/'TrussLab_Architect_15_0_Portable.zip','w',zipfile.ZIP_DEFLATED,compresslevel=7) as z:
 z.write(out,out.name); z.writestr('START_HERE_RU.txt','Откройте TrussLab_Architect_15_0.html в браузере. Исходники находятся на главной странице GitHub.\n')
with zipfile.ZipFile(DIST/'TrussLab_Architect_15_0_Source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=7) as z:
 for directory in ('src','tools','tests','docs'):
  for p in sorted((ROOT/directory).rglob('*')):
   if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.png','.jpg','.jpeg'):
    z.write(p,p.relative_to(ROOT))
 for name in ('README.md','ROADMAP_10_8_TO_20_0_RU.md','.gitignore'):
  if (ROOT/name).is_file():z.write(ROOT/name,name)
for p in sorted(DIST.iterdir()):print(p.name, f'{p.stat().st_size:,} B',hashlib.sha256(p.read_bytes()).hexdigest()[:16])
