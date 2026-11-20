#!/usr/bin/env python3
"""Build self-contained TrussLab Architect 13.0 without external services."""
from pathlib import Path
root = Path(__file__).resolve().parent
source = (root / "template.html").read_text(encoding="utf-8")
style = (root / "style.css").read_text(encoding="utf-8")
script = (root / "game.js").read_text(encoding="utf-8")
assert "/* {{ SCRIPT }} */" in source and "/* {{ STYLES }} */" in source
output = source.replace("/* {{ STYLES }} */", style).replace("/* {{ SCRIPT }} */", script)
output = output.replace("TrussLab Architect 11.4 — Earthworks Inspector", "TrussLab Architect 13.0 — Adaptive Frame Pipeline")
dest = root.parents[1] / "dist" / "TrussLab_Architect_13_0.html"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(output, encoding="utf-8")
print(f"{dest} ({dest.stat().st_size:,} bytes)")
