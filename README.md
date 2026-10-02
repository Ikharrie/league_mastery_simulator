League of Legends: Historical Mastery Simulator
================================================

A browser-based calculator for League of Legends masteries and runes across
historical seasons and patches ("Legacy LoL Calculator" in the page
header). Pick a season and patch, plan a mastery or rune page, and share a
link that round-trips the patch + build state. Each patch is drawn the way
the game client of its time drew it: the Adobe AIR client (2009-2016) for
the early seasons, the League Client (2017+) for the late ones.

This is a fork of [dpatti/league-mastery-calc][dp], reworked into a
season-aware simulator. The original calculator handled a single patch at a
time; this fork lists every patch where masteries or runes changed, plus the
first and last patch of every season: 191 patches over three pages.

Demo
----

**https://ikharrie.github.io/league_mastery_simulator/** (GitHub Pages,
served from `master`). Locally, open `index.html` or serve the folder (see
Local development).

Pages and eras
--------------

| Page | Patches | System | Client look |
| --- | --- | --- | --- |
| [index.html](index.html) masteries | V1.0.0.32 – V1.0.0.128 (10) | classic 30-point Offense / Defense / Utility trees | AIR, 2010 client |
| | V1.0.0.129 – V3.13 (6) | classic | AIR, 2012 client (V3.13: 2014 sheet) |
| | V3.14 – V5.21 (9) | classic, the 2014 trees | AIR, 2014 client |
| | V5.22 – V6.24 (12) | Ferocity / Cunning / Resolve keystone trees | AIR, 2014 client |
| | V7.2 – V7.21 (5) | keystone trees | League Client |
| [runes.html](runes.html) pre-Reforged runes | V1.0.0.63 – V1.0.0.128 (8) | marks, seals, glyphs, quintessences | AIR, 2010 client |
| | V1.0.0.129 – V1.0.0.152 (6) | | AIR, 2012 client |
| | V3.04 (1) | | AIR, 2013 client |
| | V3.13 – V6.22 (9) | | AIR, 2014 client |
| | V7.21 (1) | | League Client rune book |
| [runes-reforged.html](runes-reforged.html) Runes Reforged | V7.22 – V26.19 (124) | paths, keystones, stat shards (from V8.23) | League Client (the 2017 page layout through V12, the V13 layout from V13.1) |

Patches per season (the Season dropdown; the Patch dropdown lists the
season's patches, oldest first):

| Season | S1 | S2 | S3 | S4 | S5 | S6 | S7 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Masteries | 10 | 4 | 2 | 5 | 4 | 10 | 7 | **42** |
| Runes | 8 | 5 | 3 | 3 | 2 | 2 | 2 | **25** |

| Season | S8 (2018) | S9 | S10 | S11 | S12 | S13 | S14 | 2025 | 2026 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Runes Reforged | 21 | 14 | 16 | 11 | 13 | 12 | 15 | 12 | 10 | **124** |

* **Seasons.** A preseason patch belongs to the season that follows it:
  V3.14 (Preseason 4) is Season 4, V4.20 (Preseason 5) is Season 5, V8.23
  is Season 9. Pre-Season One (the 2009 launch) is Season 1. From 2024 the
  season starts at V14.1, V25.S1.1 and V26.01. The pre-Reforged rune page
  starts at V1.0.0.63, the first rune state that can be reconstructed.
* **Patch labels** are `V<patch>` plus a tag for structural patches:
  `V5.22 (Preseason 6)`, `V5.10 (Utility rework)`, `V8.6 (Conqueror)`,
  `V26.19 (Current)`; reconstructions with low confidence say `(approx.)`.
  2025 and 2026 use Riot's official names (`V25.S1.1`, `V26.01`).
* **Defaults.** An empty link opens V1.0.0.152 (masteries), V7.21 (runes)
  and the live patch V26.19 (Runes Reforged). A season opens on its
  late-season patch (`data/patches/seasons.json`).
* **AIR pages** sit on the burnt-edge parchment profile sheet of the AIR
  client: summoner name tab, profile sub-tabs of that client year (Masteries
  / Runes are real links), page chips, the Mastery Pages sidebar (Save /
  Return / Delete / Revert) and AIR tooltips that follow the cursor.
* **League Client pages** use the client's own uikit look: flat gold
  buttons, framed dropdowns, anchored tooltips with a caret, the 7.21
  masteries panel, the 7.21 rune book (gold rune circle, socket frames and
  per-stat glyphs) and the perks editor of Runes Reforged.
* The site header (LCU-styled nav with Season / Patch dropdowns, Link and
  Share) is the same on every page. Switching patches happens in place and
  the build carries over (below); the look follows the patch.

Masteries: classic 30-point Offense / Defense / Utility trees for S1-S5,
with the tree art, frames, counters and connectors of each client. From
V5.22 the keystone system: 30 points, each tree capped at 18 (5+1+5+1+5+1),
5-rank rows share a point pool, 1-rank rows are radio groups, one keystone
across all trees. Tooltips show each patch's own client text: Data Dragon's
per-rank strings from V3.14 on and for every keystone patch, the wiki-era
values for S1-S3, the client's own mistakes included (corrections the client
never shipped go into the patch's change notes, not into the tooltip).

Pre-Reforged runes: 9 marks, 9 seals, 9 glyphs and 3 quintessences, tiers
1-3, a statistics panel and a champion-level slider for the scaling runes.
Each patch has its own catalog: the S1-S2 catalogs (reconstructed from the
wiki) carry dodge runes and the event and promo runes of the time, the
pre-V6.22 catalogs keep flat Armor Penetration as its own stat (Lethality
did not exist yet), and the Rune Combiner button stays until V4.20. The
V7.21 page is the League Client rune book: the inventory to the left of
the gold rune circle (runes listed per type, each with how many are left),
statistics inside the circle, click a rune to place it and shift-click to
fill every free slot of its colour. On a narrow screen the board, inventory
and statistics stack.

Runes Reforged: a primary path with keystone + 3 runes, a secondary path
with 2 runes from different rows, and stat shards from V8.23 with the
options of each of the 7 shard eras (scaling CDR, Ability Haste from
V10.23, the V14.2 flex and defense rework, scaling Health 10-180 from
V25.22). Grid and list modes as in the client. Rune descriptions are the
client's text of the patch (CommunityDragon where Data Dragon's export was
wrong or incomplete).

**Switching patch or season** keeps the build wherever the target patch
allows it: masteries by mastery (tier and prerequisite rules re-applied,
ranks clamped), runes by rune id, Runes Reforged picks per slot and shard
row. Whatever does not fit is dropped and a toast says how much (for
example "3 points could not carry over to V4.20"); a switch across a
mastery tree rework (V1.0.0.129, V1.0.0.152, V3.14, V5.12, V5.22, V6.22)
starts an empty page ("Masteries were reworked in V5.22: page reset").

Share links
-----------

* Masteries: `index.html#m-V<patch>|<code>[|<page name>]`, for example
  `m-V4.5`, `m-V1.0.0.118b`.
* Runes: `runes.html#preReforged-V<patch>|<30 rune ids>[|<champion level>]`,
  for example `preReforged-V1.0.0.94b`, `preReforged-V3.04`.
* Runes Reforged:
  `runes-reforged.html#rr-v<major>-<minor>|<primary>|<secondary>|<shards>[|<page name>]`,
  in live numbering: `rr-v8-4`, `rr-v25-1` (V25.S1.1), `rr-v26-19`.

The mastery code packs the ranks over the trees in grid order (tree, then
row and column). An empty build on the default patch writes no hash. The
Save buttons inside the pages copy the link, like Share.

**Old links keep working** (`data/patches/aliases.json`, checked by
`tools/test-links.js` against 586 recorded links):

* The old mastery ids `s1-final`, `s2-ahri`, `s3-pbe`, `s4-final`,
  `s5-final`, `s6-launch`, `s7-preseason`, `s7-final` and the plain
  `index.html#<code>` (= `s3-pbe`) open their patch (V1.0.0.128, V1.0.0.131,
  V1.0.0.152, V4.20, V5.21, V5.22, V6.22, V7.21). Their codes used the old
  data order, so each old id carries its own codec
  (`data/masteries/legacy-codecs.js`) and the build is imported mastery by
  mastery. The only point an old link can lose is the S1 Demolisher point
  (Demolisher was removed in V1.0.0.63).
* `preReforged-V6.24` opens V6.22 (identical catalog), `rr-v12-23` opens
  V12.22 (no change in between); the plain `runes.html#<30 ids>` opens
  V7.21. Every other old rune and Reforged id is still a listed patch.
* An id of a patch that is not listed opens the listed patch before it,
  which has the same data (`m-V4.7` opens V4.5, `rr-v8-17` opens V8.16).
* After loading, the page rewrites the URL to the canonical id (and, for an
  old mastery link, the canonical code), so Link and Share always copy a
  canonical link. Some old ids now show a different season, because of the
  preseason rule: `s4-final` and `preReforged-V4.20` are Season 5,
  `preReforged-V3.14` is Season 4, `rr-v8-23` … `rr-v11-23` are the next
  season. The values shown are the corrected per-patch values.

Local development
-----------------

```
python -m http.server
```

Any port works; then open `http://127.0.0.1:8000/` (or the port you
picked). Opening the HTML files straight from disk (`file://`) works too:
the per-patch data files are plain scripts, never fetched. There is no build
step to run the site and nothing to install: plain HTML, CSS and
JavaScript, with jQuery 1.7 vendored under `vendor/`. Fonts come from
Google Fonts (stand-ins for the client fonts: Spectral / Spectral SC for
Beaufort, Inter for Spiegel, Marcellus for Friz Quadrata, Source Sans 3 for
the AIR client's sans); without network access the pages fall back to
system fonts. Mastery and pre-Reforged rune art and data are bundled, so
those two pages work offline. The Runes Reforged page bundles its scene,
style-picker and stat-shard art and its per-patch text extras but fetches
`runesReforged.json` and the rune icons at runtime (from Riot Data Dragon;
the V7.22 icons come from CommunityDragon), so it needs network access.

How the data is loaded: every page loads `patch-registry.js` (generated:
the seasons, the 191 listed patches with their era and chrome, the aliases)
and `lol-data.js` (`LolPatches` lookups, `LolData` loader). An inline call
in `<head>` writes the `<script>` of the patch the link opens, so the first
paint is synchronous; other patches load on demand when the dropdowns
change, one small file each (identical patches share a file).

Data and tools
--------------

All data is generated from committed inputs by Node scripts (Node 18+;
22+ for the browser tests). Nothing in the build touches the network.

```
node tools/build-all.js                         # build everything, run every check
node tools/build-all.js --check                 # the same, writing nothing (CI)
node tools/build-all.js --raw <cache> --browser # + the audits and the browser tests
```

`tools/build-all.js` runs, in order: `node --check` on every script; the
three data builders; the registry (`--strict`, then `--strict --check`);
the unit tests; `tools/check-patches.js`, `tools/test-links.js` and
`tools/test-carry.js`. It is idempotent: a second run changes no generated
file. `--raw <cache>` points at the research download cache
(`<research>\patches\raw`) and adds the audits that compare every unlisted
Data Dragon patch with the listed patch in effect, plus the cached Runes
Reforged catalogs for the link and carry tests. `--browser` adds the
headless Edge / Chrome tests over `file://`. Without them those parts are
reported as optional skips. `--log <dir>` keeps the full output of every
step. Exit code 0 = passed, 1 = a failure, 2 = an unexpected skip.

The builders (the three data builders take `--check` and `--audit <cache>`,
the registry builder `--check`):

| Script | Reads | Writes |
| --- | --- | --- |
| `tools/build-masteries.js` | `data/patches/masteries*.json`, `data/sources/masteries/**`, `tools/fixtures/legacy-codecs.json` | `data/masteries/m-<patch>.js`, `legacy-codecs.js`, `manifest.json` |
| `generate-runes-data.js` | `data/patches/runes*.json`, `data/sources/runes/**` | `data/runes/catalog-<patch>.js`, `manifest.json` |
| `tools/build-reforged.js` | `data/patches/reforged*.json`, `data/sources/reforged/**` | `data/reforged/rr-<patch>.js`, `manifest.json` |
| `tools/build-registry.js` | `data/patches/seasons.json`, `aliases.json`, the listings and the three manifests | `patch-registry.js` |

The checks: `tools/check-patches.js` (registry, change rule, masteries,
runes and Reforged invariants, spot checks in `tools/fixtures/spotchecks.json`),
`tools/test-links.js` (every recorded legacy link decodes to the same build
and rewrites to a canonical link that round-trips), `tools/test-carry.js`
(patch and season switches carry the build as specified),
`tools/lib/patches.test.js` (patch order, seasons, ids, labels) and
`tools/fixtures/stub-shell-test.js unit` (the runtime registry and loader).
`check-patches`, `test-links` and `test-carry` also take `--research
<research folder>` (inputs outside the repo, read only) and `--json <file>`;
the last two take `--browser`.

One-shot tools (not part of the build; committed for provenance):

* `tools/import-masteries.js`, `tools/import-runes.js`,
  `tools/import-reforged.js --research <research>` copy the research results
  into `data/sources/` (and seed the listings).
* `tools/import-ddragon-versions.js --research <research>` or
  `--versions <versions.json>` writes `data/sources/ddragon-versions.json`,
  Riot's list of live patches and builds (the season-boundary check reads it).
* `tools/fetch-mastery-icons.js --research <research>` downloads the
  mastery icons of every listed Data Dragon build (the only tool that uses
  the network) and vendors only new art under `images/masteries/<build>/`.
* `tools/capture-legacy.js` froze the legacy links and screenshots before
  the per-patch rework (`tools/fixtures/README.md`); `shots` / `compare`
  take and diff the 69 screenshots of the 23 legacy views.
* `python detect-indents.py` (needs Pillow) finds the painted rune-slot
  indents on the AIR rune sheet; the AIR slot positions in
  `runes-calculator.js` were measured with it.

Data layout:

* `data/patches/` — hand-curated. `seasons.json` (seasons, boundaries,
  defaults, label rules), `aliases.json` (old ids), one listing per page
  (`masteries.json`, `runes.json`, `reforged.json`: each listed patch with
  its reason, date, sources and change notes), `<page>-overrides.json`
  (cited corrections on top of the source data), `masteries-families.json`
  (stable mastery keys per tree family) and `noise/<page>.json` (source
  differences ignored as noise, and why).
* `data/sources/` — committed inputs: trimmed Data Dragon `mastery.json` /
  `rune.json` builds, the wiki-era snapshots of S1-S3, the Runes Reforged
  client texts per patch and the stat-shard eras, the mastery icon map, and
  `ddragon-versions.json`.
* `data/masteries/`, `data/runes/`, `data/reforged/`, `patch-registry.js` —
  generated, do not edit. One file per distinct payload, each a single
  `LolData.register(...)` call, plus a `manifest.json` per page.

Maintenance: a new live patch
-----------------------------

Masteries and pre-Reforged runes are finished history; only Runes Reforged
grows. For each new live patch (today's live patch is V26.19, Data Dragon
16.19.1):

1. Download `https://ddragon.leagueoflegends.com/api/versions.json` and run
   `node tools/import-ddragon-versions.js --versions <file>`. Until the
   steps below are done, `check-patches` G3 fails ("DDragon's latest patch
   is …").
2. Cache the new build in the research download cache
   (`raw/reforged/runesReforged-<build>.json` and the CommunityDragon
   `perks.json`, `perkstyles.json` and `perks.cdtb.bin.json` of the branch),
   re-run the Reforged research diff for it, then
   `node tools/import-reforged.js --research <research>` to write
   `data/sources/reforged/<patch>.json` and the noise log.
3. Curate:
   * `data/patches/reforged.json`: the new patch becomes the season's last
     listed patch (reason `season-end`, or `season-end+change` when it
     changed something). The old "Current" patch stays listed only if it
     has a change of its own; if not, drop it (its id keeps opening the same
     data, as `rr-v12-23` does).
   * `data/patches/seasons.json`: `live`, `pageDefaults.reforged`, and the
     season's `last`, `lastDate` and `pages.reforged` (`last`, `count`,
     `default`).
   * The static header of `runes-reforged.html` (`rr-v26-19`,
     "V26.19 (Current)"): what shows before the scripts run.
   * The checks' own expectations, which are hard-coded on purpose (they
     are the specification, not read from the data): `tools/check-patches.js`
     (`LISTED`, `SEASONS`, `LIVE`, `SEASON_DEFAULTS`, `PAGE_DEFAULTS`,
     labels, F5), `tools/build-reforged.js` (`EXPECTED_*`) and
     `tools/lib/patches.test.js`.
   * A new year (V27.01) is also a new season: add it to `seasons.json`, to
     `tools/lib/patches.js` (`seasonOf` keeps only 2026 open) and to the
     tables above. A stat-shard change is a new era in
     `data/sources/reforged/shard-eras.json`, `runes-reforged-data.js`
     (`reforgedShardEras`) and `tools/lib/patches.js` (`shardEraOf`).
4. `node tools/build-all.js`, then
   `node tools/build-all.js --raw <cache> --browser`.

Project layout
--------------

* `index.html`, `runes.html`, `runes-reforged.html` — the three pages.
* `patch-registry.js` (generated) and `lol-data.js` — the patch registry
  and the data loader every page loads first.
* `nav.js` — client era switch (`body[data-client="air"|"lcu"]`), header
  and Season / Patch navigation, tooltip, toast, LCU dropdown list, stage
  scaling.
* `air-sheet.js` — AIR sheet chrome per patch (client period, sub-tabs,
  page chips) and the Mastery Pages sidebar.
* `calculator.js` (classic masteries and the masteries page controller),
  `keystone-calculator.js`, `runes-calculator.js`, `runes-reforged.js` —
  the calculators. `runes-reforged-data.js` — the stat-shard eras.
* `css/`
  * `base.css` — tokens (LCU hextech and AIR colours, fonts), page shell
    and backdrops, stage scale-to-fit, site header, LCU and AIR
    primitives, the shared tooltip and toast. Loaded first on every page.
  * `air-sheet.css` — the AIR parchment profile sheet (2010, 2012, 2013
    and 2014 clients) and the Mastery Pages sidebar, shared by classic
    masteries, keystone AIR and legacy runes.
  * `masteries-classic.css` — S1-S5 trees (`#calculator`).
  * `masteries-keystone.css` — V5.22-V7.21 trees, AIR and League Client
    skins (`#keystone-calculator`).
  * `runes-legacy.css` — pre-Reforged rune page, AIR and League Client.
  * `runes-reforged.css` — the Runes Reforged perks editor.
* `data/` — per-patch data, see Data and tools.
* `tools/` — generators, importers and checks; `tools/lib/patches.js` is
  the shared patch / season library; `tools/fixtures/` the frozen legacy
  links and the spot checks.
* `vendor/` — jQuery 1.7.
* `*-notes.md`, `*verification-report.md` — research notes and the
  value checks behind the first datasets (superseded by `data/patches/`,
  kept as history).
* `images/`
  * `air/` — AIR sheet art, sidebar emblems and flourish.
  * `classic/` — S1-S5 tree panels, frames and connectors.
  * `masteries/<build>/` — mastery icons per Data Dragon build, only where
    the art changed (`gray_` = locked); `masteries/s1/`, `masteries/s2/` —
    Season 1 / 2 icons; `masteries/keystone-air/` — AIR keystone panel and
    frames.
  * `lcu/` — League Client uikit pieces (backdrop, nav, dropdown,
    tooltip, buttons); `lcu/masteries/` — the 7.21 masteries panel sprites.
  * `runes/` — rune icons, the painted rune-page parchment and the AIR
    button glyphs; `runes-lcu/` — the 7.21 rune book (circle, socket
    frames, per-stat glyphs).
  * `runes-reforged/` — scenes, style picker, page icons and stat-shard
    icons.

Roadmap
-------

* Pages saved in the browser (Save currently copies the share link).
* Compare one build across patches.
* Patch-notes side panel (the per-patch change notes are in
  `data/patches/<page>.json`).

Contributors
------------

This project stands on a chain of prior work.

**Mastery calculator (this repo and its fork chain):**

* [Doug Patti (dpatti)][dp] — original author of the season-2/season-3
  mastery calculator, 2012.
* [@wonderfulheaven][wh] — Season 3 mastery data update.
* [Ikharrie][ih] — current fork: season-aware simulator, multi-season data,
  rune calculators, client-era looks.

**Data and assets:**

* [Riot Data Dragon][ddragon] — Riot's static-data CDN. Source of the
  S3-S5 and keystone-era mastery icons (with Riot's `gray_` variants) and
  `mastery.json` strings, the pre-Reforged `rune.json` catalogs and rune
  icons, and the Runes Reforged catalog and rune icons (fetched live per
  patch).
* [CommunityDragon][cdragon] — open mirror of the League Client's files:
  the 7.21 masteries panel and rune book sprites, League Client uikit
  pieces, Runes Reforged scene and style-picker art, stat-shard icons, and
  the perks data cited for rune values.
* [League of Legends Wiki][lolwiki] and the [Fandom wiki][lolfandom] —
  historical mastery and rune values, tiers, prerequisites and effect
  text for every season, the Season 1 and Season 2 mastery icons (the
  wiki's 2011 / 2012 client icons), and client screenshots used as visual
  references.
* Riot's own web pages, via the [Wayback Machine][wayback] — the tree
  emblem sprite of Riot's 2011 "Masteries in Season Two" page, which the
  Mastery Pages sidebar emblems are cut from, and Riot's 2010 capture of
  the client Masteries page that the Season 1 tree art is rebuilt from.
* The [legacy-lol-client][llc] fan reconstruction of the AIR client — the
  painted rune-page parchment (`images/runes/summoners_runes_bg.jpg`) the
  AIR rune page and sheet are built on, and the rune-slot fill order.
* The **Pyroblasty fork of dpatti** ([live][pyroblasty]) was a useful
  visual reference for the Season 6 calculator era when sanity-checking
  the dark/gold palette.

Legal
-----

Legacy LoL Calculator isn't endorsed by Riot Games and doesn't reflect the
views or opinions of Riot Games or anyone officially involved in producing
or managing Riot Games properties. Riot Games, and all associated
properties are trademarks or registered trademarks of Riot Games, Inc.

League of Legends, its mastery, rune and ability icons and its client art
are the property of Riot Games, Inc. This is a non-commercial fan-made
historical reference, made under Riot's "Legal Jibber Jabber" policy.

[lolwiki]: https://wiki.leagueoflegends.com/
[lolfandom]: https://leagueoflegends.fandom.com/
[ddragon]: https://developer.riotgames.com/docs/lol#data-dragon
[cdragon]: https://www.communitydragon.org/
[wayback]: https://web.archive.org/
[llc]: https://legacy-lol-client.vercel.app/
[pyroblasty]: https://github.com/Pyroblasty/league-mastery-calc

[dp]: https://github.com/dpatti/league-mastery-calc
[wh]: https://twitter.com/wonderfulheaven
[ih]: https://github.com/Ikharrie

License
-------

The MIT License

Copyright (c) 2012 by Doug Patti
Copyright (c) 2026 by the contributors above

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
