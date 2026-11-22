"""Sample listing dots on land, weighted by night-lights density (where hotels and tours actually are).
usage: python -I build_points.py <mapcache_dir> <out.json>"""
import json, math, sys
import numpy as np
LON0, LAT0, PX = 20.0, 55.0, 32.0
def merc_y(lat): return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
night = np.load(sys.argv[1] + "/night.npy")
day = np.load(sys.argv[1] + "/day.npy")
lum = night @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
dl = day @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
blue = day[..., 2] - np.maximum(day[..., 0], day[..., 1])
land = (blue < 0.02) & (dl > 0.05)
H, W = lum.shape
# coarse grid so dots spread out instead of piling into megacities
step = 40
pts = []
rng = np.random.default_rng(7)
for y in range(0, H - step, step):
    for x in range(0, W - step, step):
        cell = lum[y:y + step, x:x + step]
        m = land[y:y + step, x:x + step]
        v = float((cell * m).max())
        if v < 0.18:
            continue
        p = min(1.0, (v - 0.18) * 1.6)
        if rng.random() > p * 0.11:
            continue
        iy, ix = np.unravel_index(np.argmax(cell * m), cell.shape)
        px, py = x + ix + rng.uniform(-3, 3), y + iy + rng.uniform(-3, 3)
        lon = LON0 + px / PX
        my = merc_y(LAT0) - py / (PX * 180 / math.pi)
        lat = math.degrees(2 * math.atan(math.exp(my)) - math.pi / 2)
        pts.append([round(lon, 3), round(lat, 3), round(0.35 + 0.65 * p, 2)])
json.dump(pts, open(sys.argv[2], "w"))
print(len(pts), "points")
