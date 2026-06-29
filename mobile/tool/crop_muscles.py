#!/usr/bin/env python3
"""Auto-crop the full-body muscle figures into medium-zoom tiles.

Reads the full-body originals from assets/muscles/src/*.png and writes a
medium-zoom square crop, centred on the orange highlight, to
assets/muscles/*.png (the bundled tiles used by the exercise cards).

The crop is sized so the highlighted muscle fills ~37% of the tile
(side = highlight's larger dimension * 2.7, clamped), giving a consistent
zoom across the whole set. `fullbody` (highlight spans the body) is copied
through uncropped so the whole figure stays visible.

Run from mobile/:  python3 tool/crop_muscles.py
"""
import glob
import os
import shutil

from PIL import Image

SRC = "assets/muscles/src"
OUT = "assets/muscles"

ZOOM = 2.7          # crop side = highlight_max_dim * ZOOM (muscle ~37% of tile)
MIN_SIDE = 520      # don't over-zoom tiny highlights (e.g. core)
WHOLE_BODY = 600    # highlight bigger than this => it's the full body; don't crop


def highlight_bbox(im):
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            r, g, b, a = px[x, y]
            if a > 200 and r > 175 and 55 < g < 175 and b < 95:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def main():
    for path in sorted(glob.glob(f"{SRC}/*.png")):
        name = os.path.basename(path)
        im = Image.open(path).convert("RGBA")
        w, h = im.size
        bbox = highlight_bbox(im)
        if bbox is None:
            print(f"{name:14} no highlight -> copied whole")
            shutil.copyfile(path, f"{OUT}/{name}")
            continue
        x0, y0, x1, y1 = bbox
        bw, bh = x1 - x0, y1 - y0
        bmax = max(bw, bh)
        if bmax > WHOLE_BODY:
            print(f"{name:14} whole-body highlight -> copied uncropped")
            shutil.copyfile(path, f"{OUT}/{name}")
            continue
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        side = int(clamp(round(bmax * ZOOM), MIN_SIDE, min(w, h)))
        sx = int(clamp(cx - side // 2, 0, w - side))
        sy = int(clamp(cy - side // 2, 0, h - side))
        im.crop((sx, sy, sx + side, sy + side)).save(f"{OUT}/{name}")
        print(f"{name:14} bbox {bw}x{bh} -> {side}px square @ ({sx},{sy})")


if __name__ == "__main__":
    main()
