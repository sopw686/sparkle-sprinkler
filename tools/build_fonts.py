"""Download the font stack, convert it to WOFF2 in /fonts/, and write fonts.css + manifest.json.

Usage:  python tools/build_fonts.py
Needs:  pip install -r tools/requirements.txt

FONTS is the stack, in fallback order. Fonts with subset=True are cut down to the
codepoints used in data/emoticons.csv (they are multi-MB and nobody types in them);
every other font ships whole. Re-run after editing the CSV, then run check_coverage.py.
"""

import csv
import io
import json
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from fontTools import subset as ftsubset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "fonts"
CACHE_DIR = Path(__file__).resolve().parent / ".cache"
CSV_PATH = ROOT / "data" / "emoticons.csv"

GOOGLE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
DEJAVU_ZIP = "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip"

# (CSS family, google/fonts file stem or None, subset to CSV?)
FONTS = [
    ("Noto Serif", "NotoSerif", False),
    ("Noto Sans", "NotoSans", False),
    ("Noto Sans Symbols", "NotoSansSymbols", False),
    ("Noto Sans Symbols 2", "NotoSansSymbols2", False),
    ("Noto Music", "NotoMusic", False),
    ("Noto Sans Arabic", "NotoSansArabic", False),
    ("Noto Sans Armenian", "NotoSansArmenian", False),
    ("Noto Sans Batak", "NotoSansBatak", False),
    ("Noto Sans Bengali", "NotoSansBengali", False),
    ("Noto Sans Brahmi", "NotoSansBrahmi", False),
    ("Noto Sans Canadian Aboriginal", "NotoSansCanadianAboriginal", False),
    ("Noto Sans Cham", "NotoSansCham", False),
    ("Noto Sans Coptic", "NotoSansCoptic", False),
    ("Noto Sans Egyptian Hieroglyphs", "NotoSansEgyptianHieroglyphs", True),
    ("Noto Sans Elbasan", "NotoSansElbasan", False),
    ("Noto Sans Georgian", "NotoSansGeorgian", False),
    ("Noto Sans Gujarati", "NotoSansGujarati", False),
    ("Noto Sans Gurmukhi", "NotoSansGurmukhi", False),
    ("Noto Sans Hebrew", "NotoSansHebrew", False),
    ("Noto Sans Kannada", "NotoSansKannada", False),
    ("Noto Sans Lao", "NotoSansLao", False),
    ("Noto Sans Malayalam", "NotoSansMalayalam", False),
    ("Noto Sans Meroitic", "NotoSansMeroitic", False),
    ("Noto Sans Oriya", "NotoSansOriya", False),
    ("Noto Sans Syriac", "NotoSansSyriac", False),
    ("Noto Sans Telugu", "NotoSansTelugu", False),
    ("Noto Sans Thai", "NotoSansThai", False),
    ("Noto Serif Tibetan", "NotoSerifTibetan", False),
    ("Noto Sans Vai", "NotoSansVai", False),
    ("Noto Sans Yi", "NotoSansYi", False),
    ("Noto Sans Math", "NotoSansMath", False),
    ("Noto Sans JP", "NotoSansJP", True),
    ("DejaVu Sans", None, False),
]

FINAL_GENERIC = "serif"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "sparkle-sprinkler-build"})
    with urllib.request.urlopen(req) as r:
        return r.read()


def download_google(stem):
    cached = CACHE_DIR / f"{stem}.ttf"
    if cached.exists():
        return cached
    folder = stem.lower()
    for name in (f"{stem}[wdth,wght].ttf", f"{stem}[wght].ttf", f"{stem}-Regular.ttf"):
        url = GOOGLE + folder + "/" + urllib.parse.quote(name)
        try:
            data = fetch(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue
            raise
        cached.write_bytes(data)
        print(f"  downloaded {name}")
        return cached
    sys.exit(f"Could not find {stem} in google/fonts (tried ofl/{folder}/)")


def download_dejavu():
    cached = CACHE_DIR / "DejaVuSans.ttf"
    if not cached.exists():
        with zipfile.ZipFile(io.BytesIO(fetch(DEJAVU_ZIP))) as z:
            member = next(n for n in z.namelist() if n.endswith("/ttf/DejaVuSans.ttf"))
            cached.write_bytes(z.read(member))
        print("  downloaded DejaVuSans.ttf")
    return cached


def csv_codepoints():
    cps = set()
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            cps.update(ord(c) for c in (row.get("Emoticons") or ""))
    return cps


def to_ranges(cps):
    cps = sorted(cps)
    out, start, prev = [], None, None
    for cp in cps:
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append((start, prev))
            start = prev = cp
    if start is not None:
        out.append((start, prev))
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in out)


def build_one(family, src, subset_to):
    font = TTFont(src)
    if "fvar" in font:
        axes = {a.axisTag: a for a in font["fvar"].axes}
        pins = {}
        if "wght" in axes:
            pins["wght"] = 400
        if "wdth" in axes:
            pins["wdth"] = 100
        for tag, a in axes.items():
            pins.setdefault(tag, a.defaultValue)
        font = instancer.instantiateVariableFont(font, pins)

    opts = ftsubset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.flavor = "woff2"
    sub = ftsubset.Subsetter(opts)
    cmap = set(font.getBestCmap())
    if subset_to is not None:
        keep = cmap & subset_to
    else:
        keep = cmap
    sub.populate(unicodes=keep)
    sub.subset(font)

    out_name = family.replace(" ", "") + ".woff2"
    font.flavor = "woff2"
    font.save(FONT_DIR / out_name)
    return out_name, set(font.getBestCmap())


def main():
    CACHE_DIR.mkdir(exist_ok=True)
    FONT_DIR.mkdir(exist_ok=True)
    used = csv_codepoints()
    manifest, faces = [], []
    for family, stem, do_subset in FONTS:
        print(family)
        src = download_dejavu() if stem is None else download_google(stem)
        out_name, cmap = build_one(family, src, used if do_subset else None)
        size = (FONT_DIR / out_name).stat().st_size
        print(f"  -> fonts/{out_name} ({size // 1024} KB, {len(cmap)} codepoints)")
        manifest.append({"family": family, "file": out_name})
        faces.append(
            "@font-face {\n"
            f'  font-family: "{family}";\n'
            f'  src: url("{out_name}") format("woff2");\n'
            "  font-weight: 400;\n"
            "  font-style: normal;\n"
            "  font-display: swap;\n"
            f"  unicode-range: {to_ranges(cmap)};\n"
            "}\n"
        )

    stack = ", ".join(f'"{m["family"]}"' for m in manifest) + f", {FINAL_GENERIC}"
    css = (
        "/* Generated by tools/build_fonts.py — do not edit by hand. */\n\n"
        + "\n".join(faces)
        + f"\n:root {{\n  --sprinkle-font-stack: {stack};\n}}\n"
    )
    (FONT_DIR / "fonts.css").write_text(css, encoding="utf-8")
    (FONT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote fonts/fonts.css and fonts/manifest.json ({len(manifest)} fonts)")


if __name__ == "__main__":
    main()
