# Civic North fork

This fork adds a portrait carousel kit and two command-line tools on top of the original dimensional-drawing skills. Civic North uses it for **Spec Sheet**, a LinkedIn document-carousel series. The original skills under `skills/` are unchanged, so **Sync fork** on GitHub stays conflict-free.

Credit and license: `NOTICE.md` and `LICENSE` (MIT, Enes Ozturk; additions MIT, Civic North).

## What is added

| Path | What it does |
|---|---|
| `kit/spec-kit.js` | The upstream drawing kit, rescaled for 1080 x 1350 slides, plus process parts: slot, stage, flow, gate, struck, box, tbd, formula, layers, keyPlan, frame, closeSheet |
| `kit/spec-kit.css` | Portrait line weights and type, with a 24 px floor so labels read on a phone |
| `tools/render.mjs` | `spec-render <episode-dir>`: writes the PDF, full-size PNGs, 390 px phone previews, and `contact.png` (all slides on one image) to `out/` |
| `tools/check.mjs` | `spec-check <episode-dir>`: deterministic checks, writes `out/check.json`, exits 1 on any failure |
| `tools/lib.mjs` | Shared loader: bundled fonts, kit injection, `window.EPISODE`, drawing, repo rules |

## Use it from another repo

```json
"devDependencies": { "@civicnorth/spec-sheet-kit": "github:CivicNorth/dimensional-drawing#v1.0.0" }
```

Pin a tag, never `#main`, and commit the lockfile, so an old episode always re-renders exactly as it was approved.

An episode folder holds `slides.html` (defines `window.drawEpisode(K)`), `episode.json` (lesson, `pdfTitle`, `sources`, `claims`, `checked`, `close.next`), and `caption.md`. The last sheet is drawn with `K.closeSheet()`, which reads the next episode, sources and checked date only from `episode.json`; passing any of them to the function throws, so the sheet and the claims ledger cannot drift. It also throws if its content would run into the footer, or a source has no label.

Thresholds live in the nearest `spec-sheet.rules.json` in a folder above the episode folder; with none, the check fails rather than falling back to defaults. A rules file inside the episode folder is ignored and fails the check. An episode may only add code prefixes (`checks.extraCodePrefixes`); any other override fails.

Render writes `out/render.json` with `inputs`, a SHA-256 of the slides, episode, caption, kit and rules files it drew. Check deletes any old `check.json` first, computes the same hash, and fails if `render.json` is missing or its hash differs, so a passing `check.json` always describes the PDF on disk. A failed render, or a check that cannot load the drawing, also deletes the old PDF and PNGs. An ordinary check failure keeps the outputs for inspection and records the failure in `check.json`. If the checker itself crashes while scanning, the crash is recorded as a FAIL.

Optional rules (v1.1): `requireClaimQuote`, `primaryDomains`, `series`, and `caption` turn on the evidence, primary-source, series and caption-recipe checks below. Without them the checks are skipped.

## Grouping contract

The kit wraps what it draws so the checker can reason about it:
- `g.part` is a box and its own labels. Each label must fit inside its box.
- `g.dim` is a dimension, callout or note leader and its own label. Its lines may touch its label; no other line may.
- `g.brand` is the only place color, images, or the brand name may appear, and only on the first and last sheet.
- `[data-avoid]` (from `K.slot(..., {avoid:true})`) marks a word shown as the thing to avoid; it is not checked against the banned list.

## What spec-check fails

| Check | Fails when |
|---|---|
| slide-size, slide-count | Any slide is not 1080 x 1350, or the count is outside the rules |
| sheet-numbers | A footer's "SHT n OF t" does not match the slide's position and the slide count |
| load | No Chrome found, the bundled fonts did not load, a script error, or a `closeSheet` error (old outputs are deleted) |
| rules | No rules file above the episode, a rules file that is not valid JSON, a rules file inside it, a rules file missing any threshold or with an empty banned list, or `episode.json` changing a threshold |
| render | No `out/render.json`, the files changed since the last render, or the rendered PDF or PNGs are missing |
| crash | The checker itself failed partway |
| min-size | Any visible SVG text or tspan, or any HTML text node, renders below the floor, CSS transforms included |
| safe-area | Text inside the margin |
| collision | Text overlaps other text (a tspan and its own text element excepted) |
| line-cross | A line, polyline, path, polygon, circle or ellipse larger than a dot, or a box edge, runs through a label; a dimension, callout or note leader may touch its own label |
| label-fit | A label runs outside its own part's box |
| monochrome | A non-gray fill, stroke, text, background, gradient stop, border, outline or shadow color, a CSS filter, a background image, or an image, outside the brand group |
| brand | A brand group on any sheet but the first and last |
| font, contrast, element | Text not in Arimo or JetBrains Mono, text lighter than #888 or drawn below 60% opacity (opacity, fill-opacity and color alpha combined), or a `foreignObject`, `use` or `textPath` element |
| em-dash, emoji, banned | An em dash, emoji, or banned phrase on a sheet (curly quotes normalized; `re:` entries are regular expressions; `[data-avoid]` excepted). En dashes only warn |
| codes | A code drawn outside a table that no table row defines (`K1..K5` in a code cell defines K1 to K5). Codes are matched in capitals only. Also fails a code drawn on a sheet before the first sheet whose table defines it, so the key comes before the drawings (v1.3) |
| claims-sources | A claim pointing to a missing source or a sheet that does not exist, a claim or `checked` date that is not a real date, a source without a full https URL or unused by any claim, a sheet citing a missing SRC, a sheet a claim lists that does not carry that claim's SRC mark, an SRC mark on a sheet that no claim lists, or a last sheet whose "no outside facts" line disagrees with the sources |
| caption | Over the length limit, a link or any bare domain, an em dash, a spaced en dash or double hyphen, an emoji, hashtags over the limit, a banned phrase, or not ending with the question when the rules require it |
| evidence | (`requireClaimQuote`) a claim without a quote of 3 to 45 words copied from its source page. The checker cannot fetch pages; the auditor confirms each quote is really on the page |
| primary | (`primaryDomains`) a source outside the primary-source list without a `primaryNote` the auditor must confirm |
| series | (`series`, a JSON file beside the rules) the episode is missing from the series file, not approved, has no approval record in the owner's words or one that names a different episode (`approval.episode`) or is not confirmed (`approval.confirmed: true`), is marked `review` or `posted` without a `verify-report.md` that starts `VERDICT: PASS` and carries the current `inputs:` hash (printed by spec-check; `status` and `postedAt` in episode.json are not inputs, so moving an episode to review does not stale its report), has a different title, or its close sheet teases a number, day or title that does not match the next episode in the same season. WARN when that next episode is not yet approved |
| caption recipe | (`caption`) the first line, call to action, question placement, or hashtags differ from the recipe: first line from a template, the question alone before the call to action, a call to action naming the next episode from the series file, and 3 to 5 approved hashtags including the required ones, only in the last paragraph. On a season's last episode the call to action is `ctaEnd`, where `{nextSeason}` is filled in |
| pdf-title | `pdfTitle` empty, over 100 characters, with a dash or emoji, or with a banned phrase |

It cannot judge whether the lesson is true or good, or whether a line crosses a shape it should not. That is the reviewer's job.

Known limits: the PDF's text layer repeats each haloed label (a side effect of the knockout stroke); this does not affect how the PDF looks. A sheet's cover "SHEETS" value is not compared with the slide count.

## Changing the kit

Change it here, re-render every published episode to see the effect, then tag a new version (`v1.2.0`) and bump the pin in the consuming repo on purpose.

## Requirements

Node 18+, and Chrome or Chromium on the machine (found automatically on Linux, macOS and Windows, or set `CHROMIUM_PATH`). Fonts come from npm (Arimo and JetBrains Mono, both SIL Open Font License 1.1). No ffmpeg and no network font service are needed.
