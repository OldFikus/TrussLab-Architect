"""Build offline PlanetStream from the editable GPU Clarity SAFE modules."""
from pathlib import Path
import hashlib
import json
if __package__:
    from .heritage import assets
else:
    from heritage import assets
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
DIST = ROOT / 'dist'
VERSION = '20.2'
SERIES = 'WorldForge'
GROUPS = {
    'STYLES': 'style.css worldeditor.css infrastructure.css citysim_plus.css world_visual.css nature.css quality_ui.css',
    'SCRIPT': 'planetstream.js rendercore/materials.js rendercore/capabilities.js game.js worldeditor_core.js worldeditor_ui.js worldeditor_region3d.js infrastructure_core.js infrastructure_ui.js',
    'EXTENSIONS': 'citysim_plus.js citysim_plus_ui.js world_visual_core.js world_visual_ui.js nature_core.js nature_ui.js quality_ui.js planet_scene.js planet_atlas.js fidelity.js fidelity_ui.js heritage_ui.js recovery.js guide.js coastal_layers.js',
}

def build():
    DIST.mkdir(exist_ok=True)
    html = (SRC / 'template.html').read_text()
    for group, names in GROUPS.items():
        marker = '/* {{ ' + group + ' }} */'
        assert html.count(marker) == 1
        html = html.replace(marker, '\n'.join((SRC / n).read_text() for n in names.split()))
    anchor='const BUILTIN_GLB_ASSETS=['
    assert html.count(anchor)==1
    html=html.replace(anchor,anchor+json.dumps(assets(),ensure_ascii=False)[1:-1]+',')
    guide=(ROOT/'docs/EDITOR_GUIDE_RU.md').read_text(encoding='utf-8')
    html=html.replace('null /* {{ EDITOR_GUIDE }} */',json.dumps(guide,ensure_ascii=False).replace('<',r'\u003c'))
    region=ROOT/'examples'/'region'
    demo={'manifest':json.loads((region/'index.json').read_text()),'files':{
        p.relative_to(region).as_posix():json.loads(p.read_text()) for p in (region/'tiles').glob('*.geojson')}}
    html=html.replace('null /* {{ PLANET_DEMO }} */',json.dumps(demo,ensure_ascii=False).replace('<',r'\u003c'))
    for profile in ('SAFE', 'LAB'):
        page = html
        if profile == 'LAB':
            flag = "const optInBalanced=gpuQuery.get('trussBalanced')==='1';"
            assert page.count(flag) == 1
            page = page.replace(flag, "const optInBalanced=gpuQuery.get('trussBalanced')!=='0';")
        title = f'TrussLab Architect {VERSION} — {SERIES} · GPU Clarity {profile}'
        page = page.replace('TrussLab Architect 16.0 — GPU Clarity SAFE · 1080p / 1440p</title>', title + '</title>')
        path = DIST / f'TrussLab_{VERSION}_{profile}.html'
        page=page.replace('v16.0 GPU TEMPORAL LAB',f'v{VERSION} {SERIES} · {profile}')
        path.write_text(page,encoding='utf-8')
        print(path.name, hashlib.sha256(path.read_bytes()).hexdigest())
    with ZipFile(DIST / f'TrussLab_{VERSION}_Portable.zip','w',ZIP_DEFLATED) as archive:
        archive.write(ROOT/'docs/DATA_AND_LICENSES_RU.md','DATA_AND_LICENSES_RU.md')
        for license_path in sorted((ROOT/'docs/licenses').glob('*.txt')):
            archive.write(license_path,'licenses/'+license_path.name)
        archive.write(ROOT/'docs/EDITOR_GUIDE_RU.md','EDITOR_GUIDE_RU.md')
        for path in [*DIST.glob(f'TrussLab_{VERSION}_*.html'), *sorted((ROOT/'examples').rglob('*'))]:
            if path.is_file(): archive.write(path, path.name if path.parent == DIST else path.relative_to(ROOT))
    with ZipFile(DIST / f'TrussLab_{VERSION}_Source.zip','w',ZIP_DEFLATED) as archive:
        for name in ['src','tools','tests','docs','examples','README.md','ROADMAP_10_8_TO_20_0_RU.md']:
            path = ROOT/name
            for item in sorted(path.rglob('*')) if path.is_dir() else [path]:
                if item.is_file() and '__pycache__' not in item.parts: archive.write(item,item.relative_to(ROOT))

    paths=sorted(p for p in DIST.glob(f'TrussLab_{VERSION}_*') if p.suffix in ('.html','.zip'))
    (DIST/f'SHA256_{VERSION}.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in paths),encoding='utf-8')

if __name__ == '__main__':
    build()
