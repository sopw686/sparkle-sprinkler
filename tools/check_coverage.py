"""Check every unique codepoint in data/emoticons.csv against the font stack in fonts/.

Usage:  python tools/check_coverage.py [--verbose]
Exit code 1 if any codepoint is not covered by any font.

Reports, per codepoint, the first font in the stack (fonts/manifest.json order) whose
cmap contains it, lists uncovered codepoints, and warns about grapheme clusters whose
base and combining marks resolve to different fonts (those may render detached).
"""

import csv
import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "fonts"
CSV_PATH = ROOT / "data" / "emoticons.csv"

# Not drawn from a font in a way that matters (spaces, joiners, variation selectors).
IGNORED = {0x20, 0xA0, 0x200B, 0x200C, 0x200D, 0xFE0E, 0xFE0F}


def load_emoticons():
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        return [row["Emoticons"].strip() for row in csv.DictReader(f) if (row.get("Emoticons") or "").strip()]


def load_stack():
    manifest = json.loads((FONT_DIR / "manifest.json").read_text(encoding="utf-8"))
    return [(m["family"], set(TTFont(FONT_DIR / m["file"]).getBestCmap())) for m in manifest]


def resolve(cp, stack):
    for family, cmap in stack:
        if cp in cmap:
            return family
    return None


def clusters(text):
    """Approximate grapheme clusters: a base followed by its combining marks / joiners."""
    out = []
    for ch in text:
        cat = unicodedata.category(ch)
        joins = cat.startswith("M") or ord(ch) in (0x200C, 0x200D) or (out and out[-1][-1] == "്")
        if out and joins:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def describe(cp):
    return f"U+{cp:04X} {chr(cp)!s:2} {unicodedata.name(chr(cp), '<unnamed>')}"


def main():
    verbose = "--verbose" in sys.argv
    emoticons = load_emoticons()
    stack = load_stack()

    users = defaultdict(list)
    for emo in emoticons:
        for ch in emo:
            if ord(ch) not in IGNORED and emo not in users[ord(ch)]:
                users[ord(ch)].append(emo)

    by_font = defaultdict(list)
    uncovered = []
    for cp in sorted(users):
        family = resolve(cp, stack)
        if family is None:
            uncovered.append(cp)
        else:
            by_font[family].append(cp)

    print(f"{len(emoticons)} emoticons, {len(users)} unique codepoints, {len(stack)} fonts\n")
    print("Codepoints per font (first match in stack order):")
    for family, _ in stack:
        cps = by_font.get(family, [])
        print(f"  {family:32} {len(cps):3}")
        if verbose:
            for cp in cps:
                print(f"      {describe(cp)}")

    unused = [f for f, _ in stack if not by_font.get(f)]
    if unused:
        print("\nFonts that render nothing in the CSV (kept for typed text, or removable):")
        for f in unused:
            print(f"  {f}")

    # Browsers render a cluster with the first font that covers all of it, when one exists.
    split = []
    for emo in emoticons:
        for cl in clusters(emo):
            cps = [ord(c) for c in cl if ord(c) not in IGNORED]
            if len(cps) < 2 or any(all(cp in cmap for cp in cps) for _, cmap in stack):
                continue
            split.append((emo, cl, {resolve(cp, stack) for cp in cps}))
    if split:
        print("\nWarning: clusters no single font covers (base and marks may render detached):")
        for emo, cl, fams in split:
            cps = " ".join(f"U+{ord(c):04X}" for c in cl)
            print(f"  {emo}   [{cps}]  -> {', '.join(sorted(f or 'UNCOVERED' for f in fams))}")

    if uncovered:
        print(f"\nUNCOVERED: {len(uncovered)} codepoint(s)")
        for cp in uncovered:
            print(f"  {describe(cp)}   used in: {'  '.join(users[cp])}")
        sys.exit(1)
    print("\nAll codepoints covered.")


if __name__ == "__main__":
    main()
