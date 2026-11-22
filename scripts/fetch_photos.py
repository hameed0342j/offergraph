"""Fetch one free-licensed photo per attraction from Wikimedia Commons, with credits.

usage: python -I fetch_photos.py <cache_dir> <public_photos_dir> <photos_json>
Paced (one API call every 3.5 s, backoff on rate limits). Only CC0, public domain, CC BY and CC BY-SA.
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

UA = "OfferGraphPhotoFetcher/1.0 (offline hackathon demo; credits kept)"
API = "https://commons.wikimedia.org/w/api.php"

QUERIES = {
    "night-safari": "Night Safari Singapore",
    "zoo": "Singapore Zoo animals",
    "river-wonders": "River Safari Singapore",
    "bird-paradise": "Bird Paradise Mandai",
    "uss": "Universal Studios Singapore",
    "sea-aquarium": "S.E.A. Aquarium Sentosa",
    "cable-car": "Singapore Cable Car Sentosa",
    "luge": "Skyline Luge Sentosa",
    "wings": "Wings of Time Sentosa",
    "gardens": "Gardens by the Bay Supertree Grove",
    "skypark": "Marina Bay Sands SkyPark",
    "flyer": "Singapore Flyer",
    "river-cruise": "Singapore River bumboat",
    "hop-on": "Singapore hop-on hop-off bus",
    "chinatown": "Chinatown Singapore street",
    "jewel": "Jewel Changi Rain Vortex",
    "science-centre": "Science Centre Singapore",
    "ubin": "Pulau Ubin",
    "east-coast": "East Coast Park Singapore",
    "kranji": "Kranji Singapore countryside",
    "islands": "Kusu Island Singapore",
}

HOTEL_QUERIES = {
    "h-pp-orchard": "Pan Pacific Orchard Singapore",
    "h-pp-singapore": "Pan Pacific Singapore hotel",
    "h-mbs": "Marina Bay Sands hotel towers",
    "h-fullerton": "Fullerton Hotel Singapore",
    "h-shangri": "Shangri-La Hotel Singapore",
    "h-jen": "Orchard Gateway Singapore",
    "h-jen-tanglin": "Tanglin Road Singapore",
    "h-ibis": "Bencoolen Street Singapore",
    "h-village": "Sentosa Siloso Singapore",
    "h-crowne": "Crowne Plaza Changi Airport",
    "h-yotel": "Orchard Road Singapore",
    "h-swissotel": "Swissotel The Stamford Singapore",
}

OK_LICENSE = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? ?\d(\.\d)?)", re.I)


def get(url, params=None, tries=5):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            if data.startswith(b"You are making too many requests"):
                raise RuntimeError("rate limited")
            return data
        except Exception as e:
            wait = 6 * (i + 1)
            print("  retry in", wait, "s:", e)
            time.sleep(wait)
    raise RuntimeError("failed " + url)


def supplier_copies(im, out_dir, pid):
    """What each supplier feed would deliver: full size, medium, tiny, watermarked."""
    from PIL import ImageDraw, ImageFilter
    base = im.copy()
    base.thumbnail((600, 400))
    base.save(os.path.join(out_dir, pid + "-orbit.jpg"), quality=85)
    m = im.copy(); m.thumbnail((400, 270)); m = m.resize(base.size); m.save(os.path.join(out_dir, pid + "-atlas.jpg"), quality=80)
    t = im.copy(); t.thumbnail((120, 80)); t = t.resize(base.size).filter(ImageFilter.GaussianBlur(1.2)); t.save(os.path.join(out_dir, pid + "-corvid.jpg"), quality=70)
    for s, label in (("nomad", "nomadrates.example"), ("meridian", "MERIDIAN")):
        w = base.copy().convert("RGBA")
        layer = Image.new("RGBA", w.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for i in range(-2, 6):
            d.text((20 + i * 110, 40 + i * 60), label, fill=(255, 255, 255, 110))
        d.rectangle((0, w.size[1] - 34, w.size[0], w.size[1]), fill=(0, 0, 0, 120))
        d.text((12, w.size[1] - 26), "(c) " + label, fill=(255, 255, 255, 220))
        Image.alpha_composite(w, layer).convert("RGB").save(os.path.join(out_dir, pid + "-" + s + ".jpg"), quality=80)


def strip(html):
    return re.sub(r"<[^>]+>", "", html or "").strip()


def main():
    cache, out_dir, out_json = sys.argv[1:4]
    queries = HOTEL_QUERIES if "--hotels" in sys.argv else QUERIES
    os.makedirs(cache, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    credits = json.load(open(out_json, encoding="utf-8")) if os.path.exists(out_json) else []
    have = {c["id"] for c in credits}
    for pid, q in queries.items():
        if pid in have and os.path.exists(os.path.join(out_dir, pid + ".jpg")):
            continue
        print("search", pid, "|", q)
        data = json.loads(get(API, {
            "action": "query", "format": "json", "generator": "search", "gsrsearch": q + " filetype:bitmap",
            "gsrnamespace": 6, "gsrlimit": 8, "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime",
            "iiurlwidth": 330, "iiextmetadatafilter": "LicenseShortName|Artist|Credit",
        }))
        time.sleep(3.5)
        pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
        chosen = None
        for p in pages:
            ii = (p.get("imageinfo") or [{}])[0]
            if ii.get("mime") not in ("image/jpeg", "image/png"):
                continue
            lic = strip(ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value"))
            if not OK_LICENSE.match(lic):
                continue
            w, h = ii.get("width", 0), ii.get("height", 0)
            if w < 600 or h < 400 or w / max(1, h) > 2.2:
                continue
            chosen = (p, ii, lic)
            break
        if not chosen:
            print("  no usable photo for", pid)
            continue
        p, ii, lic = chosen
        raw = get(ii["thumburl"])
        time.sleep(1.5)
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        # square crop for 2.8rem thumbnails (retina: 160 px)
        s = min(im.size)
        l, t = (im.size[0] - s) // 2, (im.size[1] - s) // 2
        im.crop((l, t, l + s, t + s)).resize((160, 160), Image.LANCZOS).save(os.path.join(out_dir, pid + ".jpg"), quality=84)
        # a wider version for detail panels
        im2 = im.copy()
        im2.thumbnail((330, 330))
        im2.save(os.path.join(out_dir, pid + "-w.jpg"), quality=82)
        if pid.startswith("h-"):
            supplier_copies(im, out_dir, pid)
        artist = strip(ii.get("extmetadata", {}).get("Artist", {}).get("value"))[:120]
        credits = [c for c in credits if c["id"] != pid]
        credits.append({"id": pid, "title": p["title"].replace("File:", ""), "artist": artist or "Unknown", "license": lic, "source": ii.get("descriptionurl", "")})
        json.dump(credits, open(out_json, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print("  ok", pid, "|", lic, "|", artist[:40])


if __name__ == "__main__":
    main()
