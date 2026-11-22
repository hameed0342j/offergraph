"""Sample listing dots over built-up land in the graded city map (zoom-13 Web Mercator mosaic).
usage: python -I build_city_points.py <city-sg.jpg> <city-sg.json> <out.json>"""
import json, math, sys
import numpy as np
from PIL import Image, ImageFilter
img = Image.open(sys.argv[1]).convert("RGB")
meta = json.load(open(sys.argv[2]))
a = np.asarray(img.filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255
lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
mx = a.max(-1); mn = a.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-4)
W = 256 * 2 ** meta["zoom"]
rng = np.random.default_rng(11)
step = 46
thr = np.percentile(lum[lum > 0.03], 70)
pts = []
H, Wd = lum.shape
for y in range(0, H - step, step):
    for x in range(0, Wd - step, step):
        cl = lum[y:y + step, x:x + step]
        cs = sat[y:y + step, x:x + step]
        if cl.mean() < 0.03:
            continue  # water
        built = ((cl > thr) & (cs < 0.55)).mean()
        if rng.random() > built * 0.3:
            continue
        iy, ix = np.unravel_index(np.argmax(cl), cl.shape)
        gx = meta["tileX0"] * 256 + x + ix + rng.uniform(-6, 6)
        gy = meta["tileY0"] * 256 + y + iy + rng.uniform(-6, 6)
        lon = gx / W * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * gy / W))))
        pts.append([round(lon, 5), round(lat, 5), round(float(0.4 + 0.6 * min(1, built * 2)), 2)])
json.dump(pts, open(sys.argv[3], "w"))
print(len(pts), "points")
