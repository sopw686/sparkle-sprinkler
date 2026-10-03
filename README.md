# sparkle-sprinkler

Type normally and the Sparkle Sprinkler adds text emoticons ⋆˚✿˖° to each sentence you finish.
It's a static site (plain HTML/CSS/JS, no build step) that runs on GitHub Pages.

## Run locally

```sh
python -m http.server
```

Then open http://localhost:8000/v1/. Opening the files directly (`file://`) won't work, because the page fetches the CSV.

## Layout

| Path | What |
| --- | --- |
| `v1/` | Version 1 (matches `mockups/`). Self-contained: `index.html`, `style.css`, `app.js` (DOM), `sprinkle.js` (logic) |
| `v2/` | Same as v1, black on white |
| `v3/` | Same as v1, rainbow text on light pink |
| `data/emoticons.csv` | Emoticon list, exported from Google Sheets as UTF-8 CSV |
| `fonts/` | Self-hosted Noto + DejaVu Sans WOFF2s and the generated `fonts.css` / `manifest.json` |
| `tools/` | Font build and coverage scripts |

To start a new version, copy `v1/` to `v2/` and edit the copy. Only `data/` and `fonts/` are shared.

## Tuning

- **Cuteness**: `CUTENESS_COUNTS` at the top of `v1/app.js`. Slider level *i* adds `CUTENESS_COUNTS[i-1]` emoticons per sentence. The length of the array sets the number of slider levels.
- **Abbreviations** that don't end a sentence: `ABBREVIATIONS` at the top of `v1/sprinkle.js`.

## Editing the emoticons

In the CSV, the `Emoticons` column holds the emoticon and `Name` is optional. Every other column is treated as a tag column, so you can add a "Fourth tag" column and it just works. Tags show up in Tone Select automatically.

After changing the CSV, check that the fonts still cover every character:

```sh
pip install -r tools/requirements.txt
python tools/check_coverage.py        # add --verbose for a per-font list
python tools/build_fonts.py           # only if something is uncovered, after adding a font to FONTS
```

`build_fonts.py` subsets Noto Sans JP and the Egyptian Hieroglyphs font to the CSV's characters, so re-run it whenever the CSV gains new CJK or hieroglyph characters.

## Tests

```sh
npm test
```
