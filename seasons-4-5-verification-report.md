# Mastery Data Verification Report — Season 4 & Season 5

Verifies the repo's Season 4 (`season4-data.js` / `season4FinalData`) and
Season 5 (`season5-data.js` / `season5FinalData`) 30-point mastery datasets
against the LoL wiki (https://wiki.leagueoflegends.com/en-us/) for the
2014-era mastery system (introduced V3.14, retired V5.22).

## Data sources

- **Season 4 data**: `season4FinalData` in `season4-data.js`. Claims **V4.20**
  (Oct 29, 2014), the Season 4 finale. This is the 30-point tree introduced in
  V3.14 (Preseason 4) with the two Season-4 balance touches (V4.2 Perseverance
  nerf, V4.5 Feast/Scavenger).
- **Season 5 data**: `season5FinalData` in `season5-data.js`. Claims **V5.21**
  (Oct 29, 2015), the last patch before the V5.22 Ferocity/Cunning/Resolve
  rework. Incorporates the V5.10 Utility overhaul and the V5.12 Defense
  overhaul.

## Patch identification (confirmed)

- **Season 4 data fits: V4.20** — content is the V3.14 tree plus the V4.2
  Perseverance nerf (`0.35/0.675/1%` missing HP) and the V4.5 Scavenger range
  bump (`1100`). Confirms the registry's "V4.20" label, **with one caveat**:
  the file reproduced the *pre-V3.15* swapped names for the Tenacious /
  Legendary Guardian pair and the pre-V3.15 aura range (900). Those were
  already corrected in-game by V3.15 (Dec 2013), so they are defects for a
  V4.20 snapshot (fixed — see below).
- **Season 5 data fits: V5.21** — content is the V4.20 tree plus the full
  V5.10 (Utility) and V5.12 (Defense) reworks. Confirms the "V5.21" label.
  The Tenacious / Legendary Guardian names are correct in this file.

Both trees are the "(2014)" mastery system on the wiki; the three
tree-overview pages
(`Offense_Mastery_Tree_(2014)`, `Defense_Mastery_Tree_(2014)`,
`Utility_Mastery_Tree_(2014)`) describe the **final** (post-V5.12/V5.10) state,
so they match the S5 layout, not the S4 layout.

---

## Season 4 (V4.20) discrepancies

### Offense

- **[S4][Offense][Executioner] rankInfo + desc — WRONG (fixed).**
  repo=`desc "Deal #% increased damage to champions below 50% Health"`,
  `rankInfo [2, 3, 5]`
  wiki=`"Increases damage dealt to champions below 20 / 35 / 50% maximum health by 5%"`
  — the bonus is a **flat +5%**; it is the *health threshold* that scales per
  rank (20 / 35 / 50%). The repo modelled it backwards (fixed % threshold,
  scaling %). Unchanged V3.14 → V5.21.
  (source: https://wiki.leagueoflegends.com/en-us/Executioner_(Season_2014_Mastery))
- **[S4][Offense][Brute Force] rankInfo — WRONG (fixed).**
  repo=`[0.22, 0.44, 0.67]` AD/level
  wiki=`"Grants 0.22 / 0.39 / 0.55 attack damage per level"`
  (3.96 / 7.02 / 9.9 at level 18). Ranks 2 and 3 were overstated (the repo
  values instead reconstruct a "4 / 8 / 12 at level 18" reading; the live wiki
  page reports 0.39 / 0.55). Fixed to the wiki per-level values.
  (source: https://wiki.leagueoflegends.com/en-us/Brute_Force_(Season_2014_Mastery))
- **[S4][Offense][Mental Force] rankInfo — WRONG (fixed).**
  repo=`[0.3, 0.59, 0.89]` AP/level
  wiki=`"Grants 0.33 / 0.61 / 0.89 ability power per level"`
  (5.94 / 10.98 / 16.02 at level 18). Ranks 1 and 2 were slightly low
  (rank 3 already matched). Fixed to the wiki per-level values.
  (source: https://wiki.leagueoflegends.com/en-us/Mental_Force_(Season_2014_Mastery))
- [S4][Offense][Warlord] rankInfo=`[2, 3.5, 5]` — matches wiki
  (`"2 / 3.5 / 5% bonus attack damage"`). No defect.
  (source: https://wiki.leagueoflegends.com/en-us/Warlord_(Season_2014_Mastery))
- [S4][Offense][Devastating Strikes] rankInfo=`[2,4,6]` / rankInfo2=`[2,4,6]`
  — matches wiki (`"2 / 4 / 6% armor penetration and 2 / 4 / 6% magic
  penetration"`). No defect.
  (source: https://wiki.leagueoflegends.com/en-us/Devastating_Strikes_(Season_2014_Mastery))
- Double-Edged Sword, Fury, Sorcery, Butcher, Expose Weakness, Feast,
  Spell Weaving, Martial Mastery, Arcane Mastery, Blade Weaving, Archmage,
  Dangerous Game, Frenzy, Arcane Blade, Havoc — names, ranks and tier
  positions all match the Offense tree overview; no numeric defect found.

### Defense

- **[S4][Defense][Legendary Guardian] / [Tenacious] — NAMES SWAPPED (fixed).**
  The repo attached the T5 4-rank Armor/MR aura to the name **"Tenacious"**
  (array index 8→`index:18`) and the T6 15%-CC-reduction capstone to the name
  **"Legendary Guardian"** (`index:21`). This reproduces the *pre-V3.15* bug
  that Riot themselves fixed: the V3.15 notes read
  *"Fixed a bug where the name had gotten swapped with the Tenacious Mastery."*
  For a V4.20 snapshot the correct names are: T5 aura = **Legendary Guardian**,
  T6 CC capstone = **Tenacious**. Fixed by swapping the two `name` strings
  only (tiers/indexes/ranks/values untouched).
  (sources: https://wiki.leagueoflegends.com/en-us/V3.15 ,
  https://wiki.leagueoflegends.com/en-us/Legendary_Guardian_(Season_2014_Mastery) ,
  https://wiki.leagueoflegends.com/en-us/V5.12)
- **[S4][Defense][Legendary Guardian aura] range — WRONG (fixed).**
  repo desc=`"...for each nearby enemy champion (900 range)"`
  wiki: V3.15 *"Required range ... reduced to 700 from 900."* By V4.20 the
  aura range is **700**. Fixed to `"...nearby visible enemy champion (700 range)"`.
  Rank values (`[1,2,3,4]` armor / `[0.5,1,1.5,2]` MR) are correct.
- [S4][Defense][Juggernaut] parent=`5` → array index 5 = Veteran's Scars.
  Correct: wiki says Juggernaut (T3, 1 rank, 3% max health) requires
  **3 points in Veteran's Scars**. Value and prerequisite verified.
  (source: https://wiki.leagueoflegends.com/en-us/Juggernaut_(Season_2014_Mastery))
- [S4][Defense][Veteran's Scars] rankInfo=`[12,24,36]` — matches wiki. No defect.
  (source: https://wiki.leagueoflegends.com/en-us/Veteran%27s_Scars_(Season_2014_Mastery))
- [S4][Defense][Perseverance] rankInfo=`[0.35, 0.675, 1]` — matches wiki
  post-V4.2 (`"0.35 / 0.675 / 1% missing health"`). Correct for V4.20.
  (source: https://wiki.leagueoflegends.com/en-us/Perseverance_(Season_2014_Mastery))
- [S4][Defense][Enchanted Armor] ranks=2, rankInfo=`[2.5, 5]`, T1 — matches
  wiki pre-V5.12 (`"bonus armor/MR by 2.5 / 5%"`). Correct for V4.20.
  (source: https://wiki.leagueoflegends.com/en-us/Enchanted_Armor_(Season_2014_Mastery))
- [S4][Defense][Hardiness] `[2,3.5,5]`, [Resistance] `[2,3.5,5]`, [Block]
  `[1,2]`, [Recovery] `[1,2]`, [Tough Skin] `[1,2]`, Swiftness (T4, 1 rank,
  10%), Unyielding, Bladed Armor, Oppression (T3, 3%), Reinforced Armor,
  Evasive, Second Wind, Runic Blessing — all consistent with the 2014 wiki;
  no defect. (Swiftness/Enchanted Armor/Oppression/Tenacious/Runic Blessing
  positions are the *pre-V5.12* layout, which is correct for V4.20.)

### Utility

- **[S4][Utility][Scavenger] desc — MISLEADING (fixed).**
  repo=`"Gain 1 gold when an allied minion is killed nearby (1100 range)"`
  wiki=`"You gain 1 each time a nearby allied champion kills an enemy minion within 1100 units."`
  The repo wording implies *your own* minion dying; the mastery actually pays
  out when a nearby **ally kills an enemy minion**. Fixed to
  `"Gain 1 gold each time a nearby allied champion kills an enemy minion (1100 range)"`.
  Range (1100, post-V4.5) is correct.
  (source: https://wiki.leagueoflegends.com/en-us/Scavenger_(Season_2014_Mastery))
- **[S4][Utility][Bandit] / [Scavenger] tier positions — SUSPECT (flagged, not fixed).**
  repo places **Bandit at T4** (`index:14`) and **Scavenger at T5**
  (`index:17`). The Utility tree overview (2014) and the Scavenger page place
  **Scavenger at T4** and **Bandit at T5** (Bandit + Intelligence are the two
  T5 masteries). This looks like the two are swapped. **Not fixed** — correcting
  it requires changing `index` grid positions, which the task forbids (it would
  alter the share-URL bit layout). Flagged for maintainer review.
  (sources: https://wiki.leagueoflegends.com/en-us/Utility_Mastery_Tree_(2014) ,
  https://wiki.leagueoflegends.com/en-us/Scavenger_(Season_2014_Mastery))
- [S4][Utility][Meditation] ranks=3, rankInfo=`[1,2,3]`, T1 — matches wiki
  pre-V5.10 (`"1 / 2 / 3 mana regen per 5s"`). Correct for V4.20.
  (source: https://wiki.leagueoflegends.com/en-us/Meditation_(Season_2014_Mastery))
- [S4][Utility][Expanded Mind] rankInfo=`[2,3.5,5]` `+#% Mana`, T4 — matches
  wiki pre-V5.10 (`"maximum mana by 2 / 3.5 / 5%"`). Correct for V4.20.
  (source: https://wiki.leagueoflegends.com/en-us/Expanded_Mind_(Season_2014_Mastery))
- [S4][Utility][Intelligence] rankInfo=`[2,3.5,5]` / rankInfo2=`[4,7,10]` —
  matches wiki pre-V5.10 (active-item CDR `4 / 7 / 10%`). Correct for V4.20.
  (source: https://wiki.leagueoflegends.com/en-us/Intelligence_(Season_2014_Mastery))
- [S4][Utility][Bandit] desc — melee 15 on-takedown / ranged 3 on-hit —
  matches wiki pre-V5.10. Correct for V4.20 (values only; position flagged above).
- [S4][Utility][Greed] `[0.5,1,1.5]`, [Vampirism] `[1,2,3]`, [Fleet of Foot]
  `[0.5,1,1.5]`, [Summoner's Insight] `[4,7,10]`, Wealth (+40 gold),
  Phasewalker, Scout, Strength of Spirit, Alchemist, Runic Affinity, Culinary
  Master, Inspiration, Wanderer — verified/consistent with the 2014 wiki;
  no defect.
  (sources: .../Greed_(Season_2014_Mastery) , .../Vampirism_(Season_2014_Mastery))

---

## Season 5 (V5.21) discrepancies

### Offense (identical to Season 4)

- **[S5][Offense][Executioner] — WRONG (fixed).** Same defect and fix as S4.
- **[S5][Offense][Brute Force] — WRONG (fixed).** Same as S4 (`0.22/0.39/0.55`).
- **[S5][Offense][Mental Force] — WRONG (fixed).** Same as S4 (`0.33/0.61/0.89`).
- Warlord, Devastating Strikes and the rest — same verified values as S4; no
  further defects. (Offense tree was untouched V3.14 → V5.21.)

### Defense (post-V5.12 layout)

- [S5][Defense][Tenacious] T3, 1 rank, 10% CC — **correct.** V5.12 moved it
  T6→T3 and reduced 15%→10%. Name/tier/value verified.
  (source: https://wiki.leagueoflegends.com/en-us/Tenacious_(Season_2014_Mastery))
- [S5][Defense][Legendary Guardian] T6, 1 rank, `+3` Armor / `+3` MR per nearby
  visible enemy (700 range) — **correct.** V5.12 consolidated the 4-rank aura
  to a single `3/3` rank at T6.
  (source: https://wiki.leagueoflegends.com/en-us/Legendary_Guardian_(Season_2014_Mastery))
- [S5][Defense][Swiftness] T1, ranks=2, rankInfo=`[7.5, 15]` — matches wiki
  V5.12 (`"7.5 / 15% from 10%"`, moved T4→T1, 1→2 ranks). Correct.
- [S5][Defense][Enchanted Armor] T5, ranks=4, rankInfo=`[2.5,5,7.5,10]` —
  matches wiki V5.12 (moved T1→T5, 2→4 ranks). Correct.
- [S5][Defense][Oppression] T5, 1 rank, 2% — matches wiki V5.12 (moved T3→T5,
  3%→2%). Correct.
- [S5][Defense][Adaptive Armor] T4, 1 rank — matches wiki V5.12 (new mastery
  at T4, 4% adaptive bonus resist). Correct.
- Runic Blessing correctly **absent** (removed V5.12). Block, Recovery, Tough
  Skin, Unyielding, Veteran's Scars, Bladed Armor, Juggernaut (parent=5 =
  Veteran's Scars — correct), Hardiness, Resistance, Perseverance, Reinforced
  Armor, Evasive, Second Wind — all verified; no defect.
  (source: https://wiki.leagueoflegends.com/en-us/V5.12)

### Utility (post-V5.10 layout)

- **[S5][Utility][Expanded Mind] rankInfo — WRONG (fixed).**
  repo=`[25, 50, 75]`
  wiki=`"Bonus mana changed to 20 / 50 / 75 from 2 / 3.5 / 5% maximum mana"`
  — rank 1 was `25`, should be `20`. Fixed to `[20, 50, 75]`.
  (source: https://wiki.leagueoflegends.com/en-us/Expanded_Mind_(Season_2014_Mastery))
- **[S5][Utility][Scavenger] desc — MISLEADING (fixed).** Same defect and fix
  as S4.
- **[S5][Utility][Bandit] / [Scavenger] tier positions — SUSPECT (flagged, not
  fixed).** Same swap as S4 (repo: Bandit T4 / Scavenger T5; wiki: Scavenger
  T4 / Bandit T5). Not fixed (would change `index` positions).
- [S5][Utility][Meditation] T4, rankInfo=`[0.5,1,1.5]` `% missing mana` —
  matches wiki V5.10 (moved T1→T4, flat regen → % missing mana). Correct.
- [S5][Utility][Intelligence] rankInfo=`[2,3.5,5]` / rankInfo2=`[8,14,20]` —
  matches wiki V5.10 (active-item CDR `4/7/10%` → `8/14/20%`). Correct.
- [S5][Utility][Bandit] melee 10 / ranged 3 on-hit — matches wiki V5.10.
  Correct (values only; position flagged).
- [S5][Utility][Wanderer] flat `+20` MS out of combat — matches wiki V5.10
  (`5%` → flat `20`). Correct.
- [S5][Utility][Inspiration] `10/20` XP — matches wiki V5.10 (`5/10` → `10/20`).
  Correct.
- Phasewalker, Fleet of Foot, Scout, Summoner's Insight, Strength of Spirit,
  Alchemist, Greed, Runic Affinity, Vampirism, Culinary Master, Wealth —
  verified; no defect.

---

## Tree totals (points to fully max each tree)

| Tree | Repo S4 | Repo S5 | Wiki (2014 system) |
|---|---|---|---|
| Offense | 38 | 38 | 38 |
| Defense | 34 | 34 | 34 |
| Utility | 33 | 33 | 33 |

All six totals match the wiki tree-overview pages. Mastery counts, names and
tier placements otherwise match the overviews, with the single exception of
the Bandit/Scavenger T4↔T5 ordering flagged above.

---

## Fixes applied vs. defects only flagged

### Fixes applied (both files unless noted)

1. **Executioner** — `rankInfo [2,3,5]` → `[20,35,50]` and desc rewritten to
   "Deal 5% increased damage to champions below #% maximum Health" (the 5% is
   flat; the health threshold scales). *S4 + S5.*
2. **Brute Force** — `rankInfo [0.22,0.44,0.67]` → `[0.22,0.39,0.55]` AD/level.
   *S4 + S5.*
3. **Mental Force** — `rankInfo [0.3,0.59,0.89]` → `[0.33,0.61,0.89]` AP/level.
   *S4 + S5.*
4. **Scavenger** — desc corrected from "when an allied minion is killed nearby"
   to "each time a nearby allied champion kills an enemy minion". *S4 + S5.*
5. **Legendary Guardian / Tenacious name swap** — S4 `index:18` (T5 aura)
   renamed `Tenacious` → `Legendary Guardian`; S4 `index:21` (T6 CC capstone)
   renamed `Legendary Guardian` → `Tenacious`. *S4 only* (S5 was already
   correct). Tiers, indexes, ranks and values unchanged.
6. **Legendary Guardian aura range** — S4 `index:18` desc `900` → `700` (and
   "enemy champion" → "visible enemy champion"). *S4 only.*

`node --check` passes on both `season4-data.js` and `season5-data.js` after
edits.

### Defects only flagged (not changed — would require forbidden index/rank edits)

- **Bandit / Scavenger tier positions swapped** (both files). Wiki places
  Scavenger at T4 and Bandit at T5; the repo has Bandit at `index:14` (T4) and
  Scavenger at `index:17` (T5). Fixing this means reassigning `index` values
  (grid positions), which the task forbids because it changes the share-URL bit
  encoding and layout. Left as-is; recommend the maintainer swap these two
  entries' `index` fields (14↔17) in a dedicated layout change if desired.

### Non-defects explicitly checked (no change)

- Perseverance `0.35/0.675/1` (post-V4.2) — correct for both files.
- Enchanted Armor 2-rank `[2.5,5]` (S4) vs 4-rank `[2.5,5,7.5,10]` (S5) — both
  correct for their patch.
- Meditation, Expanded Mind, Intelligence, Wanderer, Inspiration, Bandit
  values — all match their pre/post-V5.10 wiki values.
- Swiftness, Oppression, Adaptive Armor, Runic Blessing (removed), Tenacious,
  Legendary Guardian (S5) — all match the V5.12 defense overhaul.
- Juggernaut `parent:5` → Veteran's Scars — correct prerequisite in both files.

---

## Methodology note

Verification compared each mastery against its individual
`*_(Season_2014_Mastery)` wiki page (Executioner, Warlord, Devastating Strikes,
Brute Force, Mental Force, Veteran's Scars, Juggernaut, Perseverance,
Enchanted Armor, Tenacious, Legendary Guardian, Scavenger, Bandit, Greed,
Vampirism, Expanded Mind, Intelligence, Meditation), the three 2014 tree
overview pages, and the primary patch pages **V3.15** and **V5.12** (which were
decisive for untangling the Tenacious/Legendary Guardian name-swap history).
Purely cosmetic differences (verbatim tooltip phrasing, "+" prefixes, rounding
of the derived level-18 totals) were not flagged. Only value errors, misleading
mechanical descriptions, wrong names, and wrong prerequisite links were treated
as defects. The one structural discrepancy that could not be corrected without
violating the index-stability constraint (Bandit/Scavenger ordering) is flagged
rather than fixed.
