"""Create gallery WebPs from the locally preserved PNG masters.

Usage: python3 scripts/encode-biography.py
Requires Pillow, already used by the hero encoding pipeline.
"""
from pathlib import Path
from PIL import Image

folder = Path('source-media/biography')
output = Path('public/assets/photoss')
sources = sorted(folder.glob('*.png'))
if not sources:
    raise SystemExit('Missing PNG masters in source-media/biography; see docs/development/MEDIA_AND_LOCALE.md')
output.mkdir(parents=True, exist_ok=True)
for source in sources:
    target = output / source.with_suffix('.webp').name
    with Image.open(source) as image:
        image.save(target, 'WEBP', quality=88, method=6)
    print(f'{source.name} → {target.name}: {target.stat().st_size:,} bytes')
