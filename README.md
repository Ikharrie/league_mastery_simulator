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
time; this fork keeps multiple snapshots side by side.

Demo
----

Serve the folder with any static web server (see Local development) and
open `index.html`. A hosted demo will live at the gh-pages URL once
published.

Pages and eras
--------------

| Page | Snapshots | Client look |
| --- | --- | --- |
| [index.html](index.html) masteries | Season 1 (V1.0.0.130) | AIR, 2010 client |
| | Season 2 (V1.0.0.131, Ahri patch), Season 3 (V1.0.0.152, Preseason 3), Season 4 (V4.20), Season 5 (V5.21) | AIR, 2012-2015 client |
| | V5.22 (Preseason 6) and V6.22 (Preseason 7): Ferocity / Cunning / Resolve keystone trees | AIR, 2015-2016 client |
| | V7.21: final keystone trees | League Client |
| [runes.html](runes.html) pre-Reforged runes | V3.14, V4.20, V5.21, V6.24 | AIR |
| | V7.21 | League Client |
| [runes-reforged.html](runes-reforged.html) Runes Reforged | V7.22, V8.23, V9.23, V10.23, V11.23, V12.23, V13.24, V14.19, V25.24, V26.13 | League Client (2017 page layout through V12.23, the V13 layout from V13.24) |

* **AIR pages** sit on the burnt-edge parchment profile sheet of the AIR
  client: summoner name tab, profile sub-tabs (Masteries / Runes are real
  links), page chips, the Mastery Pages sidebar (Save / Return / Delete /
  Revert) and AIR tooltips that follow the cursor.
* **League Client pages** use the client's own uikit look: flat gold
  buttons, framed dropdowns, anchored tooltips with a caret, the 7.21
  masteries panel, the 7.21 rune book (gold rune circle, socket frames and
  per-stat glyphs) and the perks editor of Runes Reforged.
* The site header (LCU-styled nav with Season / Patch dropdowns, Link and
  Share) is the same on every page. Switching patches happens in place; the
  look follows the patch.

Masteries: classic 30-point Offense / Defense / Utility trees for S1-S5,
with the tree art, frames, counters and connectors of each client. From
V5.22 the keystone system: 30 points, each tree capped at 18 (5+1+5+1+5+1),
5-rank rows share a point pool, 1-rank rows are radio groups, one keystone
across all trees. Tooltips carry the per-rank values (Data Dragon strings
for S4 / S5).

Pre-Reforged runes: 9 marks, 9 seals, 9 glyphs and 3 quintessences, tiers
1-3 (about 296 runes per patch, event runes included), a statistics panel
and a champion-level slider for the scaling runes. The pre-V6.22 catalogs
keep flat Armor Penetration as its own stat (Lethality did not exist yet).

Runes Reforged: a primary path with keystone + 3 runes, a secondary path
with 2 runes from different rows, and stat shards from V8.23 with the
options of each era (scaling CDR, Ability Haste from V10.23, the V14.2 flex
and defense rework). Grid and list modes as in the client.

Share links keep working across versions: `index.html#<dataset>|<code>`,
`runes.html#preReforged-V5.21|<30 rune ids>[|<champion level>]` and
`runes-reforged.html#rr-v14-19|<primary>|<secondary>|<shards>`; mastery and
Runes Reforged links add `|<page name>` when the page has a custom name.
Older link formats still decode to the same build. The Save buttons inside
the pages copy the link, like Share.

Local development
-----------------

```
python -m http.server
```

Any port works; then open `http://127.0.0.1:8000/` (or the port you
picked). There is no build step and nothing to install: plain HTML, CSS and
JavaScript, with jQuery 1.7 vendored under `vendor/`. Fonts come from
Google Fonts (stand-ins for the client fonts: Spectral / Spectral SC for
Beaufort, Inter for Spiegel, Marcellus for Friz Quadrata, Source Sans 3 for
the AIR client's sans); without network access the pages fall back to
system fonts. Mastery and pre-Reforged rune art is bundled. The Runes
Reforged page bundles its scene, style-picker and stat-shard art but
fetches `runesReforged.json` and the rune icons at runtime (from Riot Data
Dragon; the V7.22 icons come from CommunityDragon), so it needs network
access.

Data tools:

* `node generate-runes-data.js` regenerates `runes-data.js` from the Data
  Dragon rune catalogs under `data/`.
* `node embed-mastery-icon-ids.js` stamps the Data Dragon icon ids from
  `data/mastery-<version>.json` onto the keystone data files.
* `python detect-indents.py` (needs Pillow) finds the painted rune-slot
  indents on the AIR rune sheet; the AIR slot positions in
  `runes-calculator.js` were measured with it.

Project layout
--------------

* `index.html`, `runes.html`, `runes-reforged.html` — the three pages.
* `css/`
  * `base.css` — tokens (LCU hextech and AIR colours, fonts), page shell
    and backdrops, stage scale-to-fit, site header, LCU and AIR
    primitives, the shared tooltip and toast. Loaded first on every page.
  * `air-sheet.css` — the AIR parchment profile sheet and the Mastery
    Pages sidebar, shared by classic masteries, keystone AIR and legacy
    runes.
  * `masteries-classic.css` — S1-S5 trees (`#calculator`).
  * `masteries-keystone.css` — V5.22-V7.21 trees, AIR and League Client
    skins (`#keystone-calculator`).
  * `runes-legacy.css` — pre-Reforged rune page, AIR and League Client.
  * `runes-reforged.css` — the Runes Reforged perks editor.
* `nav.js` — client era switch (`body[data-client="air"|"lcu"]`), header
  and Season / Patch navigation, tooltip, toast, LCU dropdown list, stage
  scaling.
* `air-sheet.js` — AIR sheet chrome per period and the Mastery Pages
  sidebar.
* `calculator.js` (classic masteries), `keystone-calculator.js`,
  `runes-calculator.js`, `runes-reforged.js` — the calculators.
* Data: `data.js` (mastery dataset registry), `season1-data.js` …
  `season5-data.js`, `season6-keystone-data.js`,
  `preseason7-keystone-data.js`, `season7-keystone-data.js`,
  `runes-data.js` (generated), `runes-reforged-data.js`.
* `data/` — Data Dragon `mastery.json` / `rune.json` catalogs used by the
  data tools.
* `vendor/` — jQuery 1.7.
* `*-notes.md`, `*verification-report.md` — research notes and the
  value checks behind the datasets.
* `images/`
  * `air/` — AIR sheet art, sidebar emblems and flourish.
  * `classic/` — S1-S5 tree panels, frames and connectors.
  * `masteries/<version>/` — mastery icons per Data Dragon version
    (`gray_` = locked); `masteries/s1/`, `masteries/s2/` — Season 1 / 2
    icons; `masteries/keystone-air/` — AIR keystone panel and frames.
  * `lcu/` — League Client uikit pieces (backdrop, nav, dropdown,
    tooltip, buttons); `lcu/masteries/` — the 7.21 masteries panel sprites.
  * `runes/` — rune icons, the painted rune-page parchment and the AIR
    button glyphs; `runes-lcu/` — the 7.21 rune book (circle, socket
    frames, per-stat glyphs).
  * `runes-reforged/` — scenes, style picker, page icons and stat-shard
    icons.

Roadmap
-------

* More than one patch per season (most seasons have one snapshot).
* Pages saved in the browser (Save currently copies the share link).
* Compare one build across patches.
* Patch-notes side panel.
* V7.21 rune book: inventory to the left of the ring and the statistics
  inside it, as in the client.

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
