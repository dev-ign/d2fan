#!/bin/sh
set -eu
# The approved 4K edit is preserved locally, outside Vite's public directory.
# Usage: sh scripts/encode-hero.sh [source] [output-directory] [report-directory]
source_file="${1:-source-media/new-hero-video.mp4}"
output_dir="${2:-public/assets/hero}"
report_dir="${3:-artifacts/media}"
test -f "$source_file" || { echo "Missing hero source: $source_file" >&2; exit 1; }
mkdir -p "$output_dir" "$report_dir"
staging=$(mktemp -d "$output_dir/.encode-XXXXXX")
trap 'rm -rf "$staging"' EXIT HUP INT TERM

# Full chronological edit, native frame cadence. No trim, retiming or dissolve.
ffmpeg -hide_banner -loglevel warning -y -i "$source_file" \
  -map 0:v:0 -an -vf 'scale=1920:-2,setsar=1' \
  -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -threads 4 \
  -movflags +faststart "$staging/bts-desktop.mp4"

# Stable portrait windows change only at existing hard cuts; the documented
# dance shot has one gentle track. Coordinates use the 3840x2160 source,
# proportional for source scaling.
# 0–4.5667: first pose; 4.5667–10.4: purple; 10.4–15.2667: wide poses;
# 15.2667–20.1667: jacket; 20.1667–24.3667: turned pose; remainder: stage.
# The 46.4–49.8667 dance shot tracks the artist from x≈1120 to x≈1900.
# Its crop travels from x=550 to x=1271 (7 source pixels/frame); no zoom.
# Frame boundaries (30 fps) avoid rounding a cut to the following frame.
# Override MOBILE_CROP_X for a different creative edit (e.g. '(iw-ow)/2').
crop_x="${MOBILE_CROP_X:-if(lt(n,137),450,if(lt(n,312),850,if(lt(n,458),450,if(lt(n,605),700,if(lt(n,731),450,if(between(n,1392,1495),550+(n-1392)*7,850))))))/3840*iw}"
ffmpeg -hide_banner -loglevel warning -y -i "$source_file" \
  -map 0:v:0 -an \
  -vf "crop=trunc(ih*9/16/2)*2:ih:'$crop_x':0,scale=720:1280,setsar=1" \
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -threads 4 \
  -movflags +faststart "$staging/bts-mobile.mp4"

for format in desktop mobile; do
  ffmpeg -hide_banner -loglevel warning -y -i "$staging/bts-$format.mp4" \
    -frames:v 1 -update 1 "$staging/$format.png"
  python3 -c 'from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=88, method=6)' \
    "$staging/$format.png" "$staging/bts-$format.webp"
done

# Verify the complete frame count and cadence before publishing local assets.
python3 - "$source_file" "$staging" <<'PY'
import json, subprocess, sys
from pathlib import Path
def probe(path):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]))
source = probe(sys.argv[1])
original = next(s for s in source['streams'] if s['codec_type'] == 'video')
report = {'source': source, 'variants': {}}
for name in ['desktop', 'mobile']:
    result = probe(Path(sys.argv[2]) / f'bts-{name}.mp4')
    assert len(result['streams']) == 1, 'Delivery must have exactly one silent video stream'
    stream = result['streams'][0]
    assert stream['nb_frames'] == original['nb_frames'], 'Montage frame count changed'
    assert stream['avg_frame_rate'] == original['avg_frame_rate'], 'Frame cadence changed'
    assert stream['codec_name'] == 'h264' and stream['pix_fmt'] == 'yuv420p'
    report['variants'][name] = result
Path(sys.argv[2], 'encoding.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({name: {'bytes': int(v['format']['size']), 'duration': v['streams'][0]['duration'], 'frames': v['streams'][0]['nb_frames']} for name, v in report['variants'].items()}, indent=2))
PY
for format in desktop mobile; do
  mv "$staging/bts-$format.mp4" "$staging/bts-$format.webp" "$output_dir/"
done
mv "$staging/encoding.json" "$report_dir/hero-encoding.json"
