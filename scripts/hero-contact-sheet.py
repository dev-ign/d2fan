"""Assemble real browser screenshots after running tests/hero-video.spec.ts.

Requires Pillow (also used by encode-hero.sh). Does not alter the screenshots.
"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('artifacts/qa-hero-v2')
browser = root / 'browser'
times = ['0.05', '8', '14.78', '29.57', '44.35', '46.5', '49.5', '58.95']
for width, columns, cell_width, cell_height in [(1440, 2, 720, 480), (390, 4, 234, 536)]:
    sheet = Image.new('RGB', (cell_width * columns, cell_height * 2 if width == 390 else cell_height * 4), '#151313')
    draw = ImageDraw.Draw(sheet)
    for index, time in enumerate(times):
        screenshot = Image.open(browser / f'hero-{width}-frame-{time}.png').convert('RGB')
        screenshot.thumbnail((cell_width, cell_height - 30))
        x, y = index % columns * cell_width, index // columns * cell_height
        sheet.paste(screenshot, (x, y))
        draw.text((x + 10, y + cell_height - 21), f'{width}px / {time}s', fill='#f2ece3')
    sheet.save(root / f'contact-{width}.jpg', quality=92)

# Use all delivered mobile frames sampled at three-second intervals by FFmpeg:
# ffmpeg -i public/assets/hero/bts-mobile.mp4 -vf fps=1/3,scale=180:320 .../%02d.jpg
frames = sorted((root / 'mobile-frames').glob('*.jpg'))
if frames:
    sheet = Image.new('RGB', (900, 350 * ((len(frames) + 4) // 5)), '#151313')
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(frames):
        x, y = index % 5 * 180, index // 5 * 350
        sheet.paste(Image.open(path), (x, y))
        draw.text((x + 8, y + 326), f'{index * 3 + 1.5:.1f}s', fill='#f2ece3')
    sheet.save(root / 'mobile-framing.jpg', quality=92)
