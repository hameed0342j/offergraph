"""Fetch, stitch and grade the Singapore city basemap.

Source: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (https://s2maps.eu),
contains modified Copernicus Sentinel data 2016, CC BY 4.0. Web Mercator tiles, zoom 13.

usage: python -I build_city.py <tile_cache_dir> <out_dir> [--params JSON]
"""
import io
import json
import math
import os
import sys
import time
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_map  # noqa: E402  (shared grading)

Z = 13
LON0, LON1 = 103.44, 104.27
LAT0, LAT1 = 1.55, 1.11  # top, bottom
URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"
UA = "OfferGraphMapBuilder/1.0 (offline demo asset, attribution kept)"


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2 * n
    return x, y


def fetch(cache, z, x, y):
    path = os.path.join(cache, f"{z}_{y}_{x}.jpg")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return Image.open(path).convert("RGB")
    req = urllib.request.Request(URL.format(z=z, y=y, x=x), headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            time.sleep(0.25)  # be polite to the tile server
            return Image.open(io.BytesIO(data)).convert("RGB")
        except Exception as e:  # retry with backoff
            print("retry", z, x, y, e)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"tile {z}/{y}/{x} failed")


def main():
    args = sys.argv[1:]
    params = {}
    if "--params" in args:
        i = args.index("--params")
        params = json.loads(args[i + 1])
        args = args[:i] + args[i + 2:]
    cache, out_dir = args
    os.makedirs(cache, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    x0, y0 = tile_xy(LON0, LAT0, Z)
    x1, y1 = tile_xy(LON1, LAT1, Z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    mosaic = Image.new("RGB", (W, H))
    n = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mosaic.paste(fetch(cache, Z, tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))
            n += 1
    print("tiles", n, "mosaic", W, H)
    day = np.asarray(mosaic).astype(np.float32) / 255.0
    p = dict(build_map.PARAMS)
    p.update({"snow0": 5.0, "snow1": 6.0, "lights": 0.0})
    p.update(params)
    # Sentinel-2 water is teal: blue well above red and above green; land is not
    br = (day[..., 2] - day[..., 0]) * 255
    gr = (day[..., 1] - day[..., 0]) * 255
    water = build_map.smoothstep(14, 22, br) * build_map.smoothstep(20, 27, gr)
    wimg = Image.fromarray((water * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    water = np.asarray(wimg).astype(np.float32) / 255.0
    water = build_map.smoothstep(0.45, 0.62, water)
    out = build_map.grade(day, None, p, ocean=water)
    img = Image.fromarray((out * 255 + 0.5).astype(np.uint8))
    img.save(os.path.join(out_dir, "city-sg.jpg"), quality=84, optimize=True, progressive=True)
    meta = {
        "zoom": Z, "tileX0": tx0, "tileY0": ty0, "width": W, "height": H,
        "credit": "Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0",
    }
    with open(os.path.join(out_dir, "city-sg.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
