League of Legends: Historical Mastery Simulator
================================================

A browser-based mastery-tree calculator covering League of Legends across
multiple historical seasons and patches. Pick a season and patch from the
dropdowns, plan a mastery build, share a link that round-trips the season +
patch + build state, and (eventually) compare builds across patches.

This is a fork of [dpatti/league-mastery-calc][dp], reworked into a
season-aware simulator. The original calculator handled a single patch at a
time; this fork keeps multiple snapshots side by side.

Demo
----

Open `index.html` through a local web server (e.g. `python -m http.server`).
A jsDelivr-hosted demo will live at the gh-pages URL once published.

What's new in this fork
-----------------------

* **Season + Patch dropdowns** in the panel, styled to match the in-game
  blue/gold panel look.
* **Versioned data registry** (`masteryDataSets` in `data.js`): each season +
  patch is one entry, each with its own tree data, point cap, and sprite
  sheet URL.
* **Shareable URLs** that encode `<dataset-id>|<mastery-code>`. Old links
  (just the code, no prefix) still resolve to the default season.
* **Share button** that copies the current shareable URL to the clipboard.
* **Multiple seasons shipped**: Season 1 (Late, V1.0.0.130), Season 2 (Ahri
  patch, V1.0.0.131), Season 3 (PBE preview, V3.01).
* **Riot Data Dragon icons at runtime** for Season 3. Each data-set entry
  can declare a `ddragonVersion`; on activation the calculator fetches that
  version's `mastery.json` and decorates buttons with the matching icon
  PNGs. Season 1 and Season 2 pre-date Data Dragon, so they fall back to
  the bundled Season-3 sprite strip as a placeholder.

* **Pre-Runes-Reforged rune calculator** at [runes.html](runes.html). Place
  runes into the 9 Mark + 9 Seal + 9 Glyph + 3 Quintessence slots, scrub
  the champion-level slider to see scaling-rune values at that level, and
  share the page via URL hash. Three season snapshots — V4.20, V5.21, and
  V7.21 (all three tiers, ~296 runes each including event runes) — are
  generated straight from Data Dragon's legacy `rune.json` catalogs
  (`node generate-runes-data.js` regenerates `runes-data.js` from the
  files under `data/`), with per-rune icons from the same bundle. The
  pre-V6.22 catalogs keep flat Armor Penetration as its own stat since
  Lethality didn't exist yet.

* **Seasons 6 + 7 mastery (Ferocity / Cunning / Resolve keystone
  system)** — V5.22 (Preseason 6) replaced the classic 30-point
  Offense/Defense/Utility trees with the keystone system: still 30 points
  total, but each tree caps at 18 (5+1+5+1+5+1), so builds were 18/12/0
  splits. It ran until V7.21 (last patch before Runes Reforged shipped).
  Three snapshots are available: V5.22 (launch), V6.22 (Preseason 7
  "Assassins" update — Courage of the Colossus, Lethality conversion),
  and V7.21 (final). Selecting Season 6 or Season 7 switches the calculator to a
  three-column tree view with the keystone tier pinned to the bottom and
  one reachable keystone across all trees. 5-rank rows share a point pool
  and support splitting between the two options (as the real client did);
  1-rank rows behave as radio groups. Mastery icons load at runtime from
  each patch's own Data Dragon `mastery.json` (5.22.3 / 7.21.1), and the
  data files were fact-checked mastery-by-mastery against the wiki's
  Season 2016 mastery pages.

* **Runes Reforged calculator** at
  [runes-reforged.html](runes-reforged.html) — V7.22 through V14.19+
  picker. Pick a primary path with keystone + 3 minor runes, a secondary
  path with 2 minor runes (one per slot row, no two from the same row),
  and three stat shards (Offense / Flex / Defense, added in V8.23). The
  shard options are era-accurate per patch: scaling CDR through V10.22,
  +8 Ability Haste from V10.23, and the reworked Flex/Defense rows
  (Move Speed, Tenacity & Slow Resist, flat/scaling Health) from V14.2.
  Catalog is fetched at runtime from Riot Data Dragon's
  `runesReforged.json` for the selected patch, with rune icons hot-linked
  from the DDragon CDN and stat-shard icons from CommunityDragon.

Roadmap
-------

* Dedicated icon sprite sheets per season for the mastery calculator.
* Per-patch granularity inside each season (currently only one snapshot per
  season).
* Saveable in-browser mastery and rune pages (like the in-client "save page"
  flow).
* Patch-notes side panel toggle.
* Rune calculator: named/saveable pages (the in-client "save page" flow).

Local development
-----------------

```
python -m http.server 8765
```

Then visit `http://127.0.0.1:8765/`. Modern browsers block the jQuery CDN
script when the page is loaded over `file://`, so a local server is required.

Contributors
------------

This project stands on a chain of prior work.

**Mastery calculator (this repo and its fork chain):**

* [Doug Patti (dpatti)][dp] — original author of the season-2/season-3
  mastery calculator, 2012.
* [@wonderfulheaven][wh] — Season 3 mastery data update.
* [Ikharrie][ih] — current fork: season-aware simulator, multi-season data,
  share button, sprite-sheet wiring, README rewrite.

**Data and assets:**

* [League of Legends Wiki][lolwiki] (wiki.leagueoflegends.com) and the
  [community-run Fandom wiki][lolfandom] — sources for historical mastery
  rank values, tier structure, prerequisites, and effect descriptions used
  to populate every season dataset (S1, S2, S3, S4, S5 30-point trees and
  S6 + S7 Ferocity / Cunning / Resolve keystone trees), plus the
  pre-Reforged rune effect tables.
* [Riot Data Dragon][ddragon] — Riot's static-data CDN. Source of:
  * Mastery icons for S3 (`mastery.json` per patch).
  * Keystone-era mastery IDs and icons from `7.23.1/data/.../mastery.json`
    (last DDragon version that shipped a mastery file).
  * Runes Reforged catalog (`runesReforged.json`) — fetched live at the
    selected patch, with rune icons hot-linked from `cdn/img/{icon}`.
  * Legacy pre-Reforged rune values from `rune.json`.
* [CommunityDragon][cdragon] — open community mirror of LoL game data;
  source of stat-shard icons (`perk-images/statmods/`) because Riot's
  `runesReforged.json` doesn't include them.
* The **Pyroblasty fork of dpatti** ([live][pyroblasty]) was a useful
  visual reference for the Season 6 calculator era when sanity-checking
  the dark/gold palette.
* **Riot Games** — League of Legends, all mastery icons, rune icons,
  ability icons, background panel art, and tree-art sprites are the
  property of Riot Games, Inc. This project is a fan-made historical
  reference and is not endorsed by, sponsored by, or affiliated with Riot
  Games. Asset use is consistent with Riot's Legal Jibber Jabber for
  non-commercial fan projects.

[lolwiki]: https://wiki.leagueoflegends.com/
[lolfandom]: https://leagueoflegends.fandom.com/
[ddragon]: https://developer.riotgames.com/docs/lol#data-dragon
[cdragon]: https://www.communitydragon.org/
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
