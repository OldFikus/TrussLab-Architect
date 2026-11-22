"""Verify that the downloadable offline package matches the tested standalone builds."""
import hashlib
import sys
from pathlib import Path
from zipfile import ZipFile
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.build import DIST, VERSION

prefix = f'TrussLab_{VERSION}_'
manifest = (DIST / f'SHA256_{VERSION}.txt').read_text().splitlines()
expected = {prefix + suffix for suffix in ('SAFE.html', 'LAB.html', 'Portable.zip', 'Source.zip')}
assert len(manifest) == len(expected)
for line in manifest:
    digest, name = line.split('  ')
    expected.remove(name)
    assert hashlib.sha256((DIST / name).read_bytes()).hexdigest() == digest
with ZipFile(DIST / (prefix + 'Portable.zip')) as portable:
    for profile in ('SAFE', 'LAB'):
        name = prefix + profile + '.html'
        assert portable.read(name) == (DIST / name).read_bytes()
    for file in ('EDITOR_GUIDE_RU.md', 'DATA_AND_LICENSES_RU.md', 'examples/region/index.json'):
        assert portable.getinfo(file).file_size > 0
    assert any(p.startswith('licenses/') for p in portable.namelist())
with ZipFile(DIST / (prefix + 'Source.zip')) as source:
    for file in ('tools/build.py', 'src/game.js', 'docs/EDITOR_GUIDE_RU.md', 'tests/test_worldforge_package.py'):
        assert source.read(file) == (ROOT / file).read_bytes()
print('Verified checksums, standalone profiles, offline examples, licenses and source archive')
