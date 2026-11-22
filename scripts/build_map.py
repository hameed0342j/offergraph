"""Build the graded Web Mercator basemap from NASA Blue Marble (public domain).

usage: python -I build_map.py <bluemarble_24000.jpg> <night_13500.jpg> <out_dir> [--cache <dir>]

Sources (public domain, NASA, via Wikimedia Commons):
  Whole_world_-_land_and_oceans_12000.jpg  (Blue Marble, 24000x12000)
  The_earth_at_night.jpg                    (Black Marble 2012, 13500x6750)
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None

# Map extent and resolution. Keep in sync with src/map/projection.ts (read from meta.json).
LON0, LON1 = 20.0, 135.0
LAT0, LAT1 = 55.0, -25.0  # top, bottom
PX_PER_DEG = 32.0


def merc_y(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def reproject(path, cache):
    if cache and os.path.exists(cache):
        return np.load(cache)
    src = Image.open(path).convert("RGB")
    sw, sh = src.size
    spx = sw / 360.0
    # crop source equirectangular bbox with a small margin
    x0 = int((LON0 + 180) * spx)
    x1 = int(math.ceil((LON1 + 180) * spx))
    y0 = int((90 - LAT0) * spx) - 2
    y1 = int(math.ceil((90 - LAT1) * spx)) + 2
    crop = src.crop((x0, y0, x1, y1))
    del src
    W = int(round((LON1 - LON0) * PX_PER_DEG))
    rad_px = PX_PER_DEG * 180 / math.pi
    yt, yb = merc_y(LAT0), merc_y(LAT1)
    H = int(round((yt - yb) * rad_px))
    # resize horizontally to W, keep source rows, then remap rows (Mercator)
    crop = crop.resize((W, crop.size[1]), Image.LANCZOS)
    arr = np.asarray(crop)
    rows = np.arange(H) + 0.5
    my = yt - rows / rad_px
    lat = np.degrees(2 * np.arctan(np.exp(my)) - math.pi / 2)
    sy = (90 - lat) * spx - y0
    i0 = np.clip(np.floor(sy).astype(int), 0, arr.shape[0] - 2)
    f = (sy - i0)[:, None, None]
    out = arr[i0].astype(np.float32) * (1 - f) + arr[i0 + 1].astype(np.float32) * f
    out = out / 255.0
    if cache:
        np.save(cache, out.astype(np.float32))
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def lumof(c):
    return c @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def grade(day, night, p, ocean=None):
    lum = lumof(day)
    # ocean mask: blue dominant and dark (or supplied by the caller for other sources)
    if ocean is None:
        blueness = day[..., 2] - np.maximum(day[..., 0], day[..., 1])
        ocean = smoothstep(0.02, 0.10, blueness) * (1 - smoothstep(0.35, 0.6, lum))
    # desaturate toward luminance
    c = lum[..., None] + (day - lum[..., None]) * p["sat"]
    # olive tint: pull blue down, a touch more green
    c = np.clip(c * np.array(p["tint"], dtype=np.float32), 1e-4, 1)
    # tone curve on luminance with highlight compression, chroma ratio kept
    L = np.maximum(lumof(c), 1e-4)
    Lc = np.power(L, p["gamma"])
    Lt = p["gain"] * Lc / (1 + p["knee"] * Lc)
    c = c * (Lt / L)[..., None]
    # snow and ice: bright AND neutral (deserts are bright but warm)
    warmth = day[..., 0] - day[..., 2]
    # only the high ranges (Hindu Kush, Karakoram, Himalaya, Tibet): salt flats stay dark
    H, W = lum.shape
    rad_px = PX_PER_DEG * 180 / math.pi
    lat = np.degrees(2 * np.arctan(np.exp(merc_y(LAT0) - (np.arange(H) + 0.5) / rad_px)) - math.pi / 2)
    lon = LON0 + (np.arange(W) + 0.5) / PX_PER_DEG
    ranges = smoothstep(26.5, 28.5, lat)[:, None] * smoothstep(60, 63, lon)[None, :] * (1 - smoothstep(104, 108, lon))[None, :]
    snow = (smoothstep(p["snow0"], p["snow1"], lum) * (1 - smoothstep(0.03, 0.12, warmth)) * ranges)[..., None]
    snowc = np.power(np.clip(lum, 0, 1), p["snow_gamma"])[..., None] * np.array(p["snow_tint"], dtype=np.float32)
    c = c * (1 - snow) + snowc * snow
    # oceans: deep water goes near-black, shallows keep a dark olive
    shallow = np.clip((lum - 0.06) * 3.0, 0, 1)[..., None]
    oc = np.array(p["ocean_deep"], dtype=np.float32) * (1 - shallow) + np.array(p["ocean_shallow"], dtype=np.float32) * shallow
    o = ocean[..., None] * p["ocean_strength"]
    c = c * (1 - o) + oc * o
    # local contrast: bring out relief the way the reference reads (ridges, valleys)
    if p["local"] > 0:
        L2 = np.maximum(lumof(c), 1e-4)
        img = Image.fromarray(np.clip(L2 * 255 * 4, 0, 255).astype(np.uint8))
        bl = np.asarray(img.filter(ImageFilter.GaussianBlur(p["local_radius"]))).astype(np.float32) / (255 * 4)
        boost = np.clip(1 + p["local"] * (L2 - bl) / (bl + 0.02), 0.5, 1.8)
        c = c * boost[..., None]
    # city lights: faint warm-white specks
    if night is not None:
        nl = night @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        nl = smoothstep(p["lights0"], p["lights1"], nl)[..., None]
        c = c + nl * np.array(p["lights_color"], dtype=np.float32) * p["lights"]
    return np.clip(c, 0, 1)


PARAMS = {
    "sat": 0.62,
    "tint": [0.93, 1.04, 0.62],
    "gamma": 1.0,
    "gain": 0.36,
    "knee": 0.9,
    "snow0": 0.55,
    "snow1": 0.85,
    "snow_gamma": 2.2,
    "snow_tint": [0.88, 0.92, 0.86],
    "ocean_deep": [0.0, 0.004, 0.012],
    "ocean_shallow": [0.06, 0.08, 0.04],
    "ocean_strength": 0.96,
    "lights0": 0.25,
    "lights1": 0.75,
    "lights_color": [1.0, 0.96, 0.85],
    "lights": 0.10,
    "local": 0.0,
    "local_radius": 10,
}


def main():
    args = sys.argv[1:]
    cache_dir = None
    if "--cache" in args:
        i = args.index("--cache")
        cache_dir = args[i + 1]
        args = args[:i] + args[i + 2:]
    if "--params" in args:
        i = args.index("--params")
        PARAMS.update(json.loads(args[i + 1]))
        args = args[:i] + args[i + 2:]
    day_path, night_path, out_dir = args
    os.makedirs(out_dir, exist_ok=True)
    day = reproject(day_path, os.path.join(cache_dir, "day.npy") if cache_dir else None)
    night = reproject(night_path, os.path.join(cache_dir, "night.npy") if cache_dir else None)
    if night.shape != day.shape:
        night = np.asarray(Image.fromarray((night * 255).astype(np.uint8)).resize((day.shape[1], day.shape[0]), Image.LANCZOS)).astype(np.float32) / 255.0
    out = grade(day, night, PARAMS)
    img = Image.fromarray((out * 255 + 0.5).astype(np.uint8))
    img.save(os.path.join(out_dir, "basemap.jpg"), quality=84, optimize=True, progressive=True)
    # tiny blurred placeholder for the intro (loads instantly)
    small = img.resize((img.size[0] // 16, img.size[1] // 16), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2))
    small.save(os.path.join(out_dir, "basemap-blur.jpg"), quality=70)
    meta = {
        "lon0": LON0, "lon1": LON1, "lat0": LAT0, "lat1": LAT1,
        "width": img.size[0], "height": img.size[1], "pxPerDeg": PX_PER_DEG,
        "credit": "NASA Blue Marble and Black Marble (public domain), via Wikimedia Commons",
    }
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
