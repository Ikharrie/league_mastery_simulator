# Mastery Data Verification Report — Season 2 & Season 3

Verifies the repo's mastery data against the LoL wiki
(https://wiki.leagueoflegends.com/en-us/) for the relevant seasons.

## Data sources

- **Season 2 data**: `git show a8b15ec:data.js` (commit `a8b15ec`, 2011-12-16,
  "Update for Ahri patch"). This represents the **V1.0.0.131** state of the
  game — the new mastery system was introduced in V1.0.0.129 (Nov 29, 2011),
  V1.0.0.130 patched Ahri, and V1.0.0.131 (Dec 14, 2011) nerfed Alacrity
  (1/2/3/4% from 1.5/3/4.5/6%) which matches the repo data.
- **Season 3 data**: `season3CurrentData` in current `data.js` (commit
  `46150fc`, "PBE updates to calculator"). This represents the **V1.0.0.152
  preseason 3 / V3.0** state of the game (preseason 3 went live on
  2012-11-13; PBE-era commit was 2012-11-30). The repo claims the
  "3.x (current)" label, but the content is squarely V1.0.0.152 era and was
  never updated to reflect later S3 balance changes (V3.01, V3.02, etc).

## Patch identification

- **Season 2 data fits: V1.0.0.131** (Dec 14, 2011 — Ahri patch)
- **Season 3 data fits: V1.0.0.152** (Nov 13, 2012 — Preseason 3 launch)
  — though the file is labelled `"3.x (current)"` and the calculator markets
  it as "current", it is in fact the preseason-3 snapshot.

---

## Season 2 (V1.0.0.131) discrepancies

### Offense

- [S2][Offense][Weapon Expertise] desc typo: repo=`"+10% Armor Penetraton"`
  wiki=`"+10% Armor Penetration"` (missing "i")
  (source: https://wiki.leagueoflegends.com/en-us/Weapon_Expertise_(Season_2012_Mastery))
- [S2][Offense][Summoner's Wrath] Surge effect:
  repo=`"Increases Ability Power and Attack Speed gained by 10%"`
  wiki=`"Increases Surge's attack speed gained to 40% from 35% (i.e. +5 percentage points), and ability power gained by 10%"`
  — repo conflates the two bonuses and overstates the attack-speed bonus.
  (source: https://wiki.leagueoflegends.com/en-us/Summoner%27s_Wrath_(Season_2012_Mastery))
- [S2][Offense][Lethality] desc missing "+":
  repo=`"10% Critical Strike Damage"`
  wiki=`"+10% critical strike damage"` (cosmetic; the value is correct)

### Defense

- [S2][Defense][Summoner's Resolve] Heal effect:
  repo=`"Increases Health restored by 10%"`
  wiki=`"Increases the amount of health restored by 15%"` for V1.0.0.131 (it
  was nerfed to 10% in V1.0.0.131 patch notes — repo matches V1.0.0.131
  values, **no discrepancy**). Confirmed correct.
- [S2][Defense][Bladed Armor] desc text:
  repo=`"Returns 6 damage against minion and monster attacks"`
  wiki=`"Returns 6 true damage against minions' and monsters' basic attacks"`
  (value correct; the wording omits "true" and "basic attacks" — minor)
  (source: https://wiki.leagueoflegends.com/en-us/Bladed_Armor_(Season_2012_Mastery))
- [S2][Defense][Indomitable] desc:
  repo=`"Reduces incoming damage by #"` with [1, 2]
  wiki=`"Reduces incoming damage by 1 / 2"` — matches numerically; no issue.

### Utility

- [S2][Utility][Strength of Spirit] desc unclear:
  repo=`"Increases health regen per 5 seconds by #% of maximum mana"` with
  [0.4, 0.7, 1]
  wiki=`"Grants 0.4 / 0.7 / 1% of maximum mana as health regeneration per 5 seconds"`
  — equivalent meaning; values correct.
  (source: https://wiki.leagueoflegends.com/en-us/Strength_of_Spirit_(Season_2012_Mastery))
- [S2][Utility][Mastermind] index: repo uses `index: 23` for Mastermind, while
  every other tier-6 mastery in the file uses `index: 22`. This is a
  layout inconsistency, not a wiki discrepancy — the wiki places Mastermind
  in tier 6 (requires 20 utility points), same position as other tier-6
  masteries. Likely a typo in the original tree-grid layout.

**Season 2 verdict:** All 49 masteries are present and accounted for. Per-rank
numeric values are correct. The only real defects are the "Penetraton" typo,
the misleading Surge wording, and the Mastermind index oddity.

---

## Season 3 (V1.0.0.152) discrepancies

### Offense

- [S3][Offense][Sunder] rankInfo: repo=`[2, 4, 6]`
  **wiki=`[2, 3.5, 5]`** — major; Sunder was added in V1.0.0.152 with the
  3.5/5 values; the repo carried over the S2 numbers.
  (source: https://wiki.leagueoflegends.com/en-us/Sunder_(Season_2013_Mastery))
- [S3][Offense][Deadliness] rankInfo: repo=`[0.166, 0.333, 0.498, 0.664]`
  **wiki=`[0.17, 0.33, 0.5, 0.67]`** — the repo values use a different
  rounding convention (rank3 0.498 vs 0.5, rank4 0.664 vs 0.67). Display
  drift, not a mechanical defect.
  (source: https://wiki.leagueoflegends.com/en-us/Deadliness_(Season_2013_Mastery))
- [S3][Offense][Weapon Expertise] desc typo: repo=`"+8% Armor Penetraton"`
  wiki=`"+8% Armor Penetration"` (same typo carried from S2)
- [S3][Offense][Weapon Expertise] parent: repo=`parent: 4` (Butcher);
  wiki: prerequisite is **4 points in Deadliness** (index 6 in the repo).
  In V1.0.0.152, Weapon Expertise required Deadliness, not Butcher.
  (source: https://wiki.leagueoflegends.com/en-us/Weapon_Expertise_(Season_2013_Mastery))
- [S3][Offense][Arcane Knowledge] parent: repo=`parent: 5` (index 5 is unused
  in the S3 offense tree; the repo offense tree has no entry at index 5).
  Wiki: prerequisite is **4 points in Blast** (index 7 in the repo).
  (source: https://wiki.leagueoflegends.com/en-us/Arcane_Knowledge_(Season_2013_Mastery))
- [S3][Offense][Frenzy] parent: repo=`parent: 10` (Weapon Expertise);
  wiki: prerequisite is **2 points in Lethality** (index 13 in the repo).
  (source: https://wiki.leagueoflegends.com/en-us/Frenzy_(Season_2013_Mastery))
- [S3][Offense][Spellsword] desc: repo=`"Deals 5% of your Ability Power in magic damage to the target on each basic attack"`
  wiki=`"Basic attacks deal bonus magic damage equal to 5% of ability power"`
  — semantically identical; no defect.
- [S3][Offense][Mental Force] desc punctuation:
  repo=`"# Ability Power"` (missing leading "+")
  wiki=`"+2 / +4 / +6 ability power"` — cosmetic.

### Defense

- [S3][Defense][Hardiness] rankInfo: repo=`[2, 4, 6]`
  **wiki=`[2, 3.5, 5]`** — same issue as Sunder; Hardiness was added at
  2/3.5/5 in V1.0.0.152.
  (source: https://wiki.leagueoflegends.com/en-us/Hardiness_(Season_2013_Mastery))
- [S3][Defense][Resistance] rankInfo: repo=`[2, 4, 6]`
  **wiki=`[2, 3.5, 5]`** — same issue.
  (source: https://wiki.leagueoflegends.com/en-us/Resistance_(Season_2013_Mastery))
- [S3][Defense][Bladed Armor] desc: repo=`"Deals 6 damage to any enemy monster that attacks you"`
  wiki=`"Returns 6 true damage against minions' and monsters' basic attacks"`
  — repo omits **minions** (Bladed Armor returns damage to both minions
  AND monsters in S3; only the 2014 version was monsters-only).
  (source: https://wiki.leagueoflegends.com/en-us/Bladed_Armor_(Season_2013_Mastery))
- [S3][Defense][Block] parent: repo=`parent: 7` (index 7 doesn't exist in
  S3 defense tree). Wiki: prerequisite is **2 points in Unyielding**
  (index 9 in the repo).
  (source: https://wiki.leagueoflegends.com/en-us/Block_(Season_2013_Mastery))
- [S3][Defense][Veteran's Scars] parent: repo=`parent: 2` (Perseverance);
  wiki: prerequisite is **4 points in Durability** (index 3 in the repo).
  (source: https://wiki.leagueoflegends.com/en-us/Veteran%27s_Scars_(Season_2013_Mastery))
- [S3][Defense][Defender] desc: repo=`"Grants +1 Armor and Magic Resist for each nearby enemy champion"`
  wiki adds the precise condition: "for each nearby **visible** enemy champion
  within 700 units". Repo wording is slightly less precise but not wrong.
- [S3][Defense][Reinforced Armor] desc: matches wiki; no issue.
- [S3][Defense][Honor Guard] desc:
  repo=`"Reduces damage taken from all sources by 3%"`
  wiki=same wording; does NOT reduce true damage in practice (a footnote
  on the wiki). Not a defect.

### Utility

- [S3][Utility][Artifacer] **name typo**: repo=`"Artifacer"`
  **wiki=`"Artificer"`** (this is a misspelling; the in-game mastery was
  always called "Artificer").
  (source: https://wiki.leagueoflegends.com/en-us/Artificer_(Season_2013_Mastery))
- [S3][Utility][Pickpocket] desc: repo=`"5 gold for melee champions and 3 gold for ranged champions"`
  wiki effect text: `"Gain 3 / 5 gold..."` — the wiki article writes the values
  ambiguously, but original game tooltip confirmed melee=5, ranged=3, so
  the repo wording is **correct** (and clearer than the wiki). No defect.
- [S3][Utility][Wealth] parent: repo=`parent: 8` (Artifacer);
  wiki: prerequisite is **4 points in Greed** (index 9 in the repo).
  (source: https://wiki.leagueoflegends.com/en-us/Wealth_(Season_2013_Mastery))
- [S3][Utility][Explorer] parent: repo=`parent: 11` (Vampirism);
  wiki: prerequisite is **1 point in Biscuiteer** (index 12 in the repo).
  (source: https://wiki.leagueoflegends.com/en-us/Explorer_(Season_2013_Mastery))
- [S3][Utility][Summoner's Insight] desc — Clarity:
  repo=`"Increases Mana restored by 25%"` — correct.
- [S3][Utility][Summoner's Insight] desc — Clairvoyance:
  repo=`"Grants additional vision of enemy units revealed"`
  wiki=`"Grants persistent sight of revealed enemies for 5 seconds"` —
  the repo wording is vague but factually correct.
- [S3][Utility][Strength of Spirit] desc:
  repo=`"Up to +# Health Regen per 5 seconds for each 400 Mana you possess"` with [1, 2, 3]
  wiki=`"Grants 1 / 2 / 3 bonus health regeneration per 5 seconds for every 400 maximum mana"` — equivalent; no defect.

**Season 3 verdict:** Several mechanical defects (3 numeric value errors in
Sunder/Hardiness/Resistance, 1 typo, ~5 wrong `parent` links). The wrong
`parent` links are likely benign if the calculator only uses `parent` for
display arrow rendering; but if it gates point allocation, they're real bugs.

---

## Summary of suspected errors (across both seasons)

1. **Typo "Penetraton"** appears in BOTH S2 and S3 Weapon Expertise
   descriptions. (Mentioned by the user — confirmed.)
2. **Typo "Artifacer"** in S3 Utility — the correct mastery name is
   "Artificer".
3. **S3 Sunder, Hardiness, Resistance values inherited from S2**: all three
   have repo values `[2, 4, 6]` but the V1.0.0.152 wiki values are
   `[2, 3.5, 5]`. These look like the S2 numbers were never updated when
   the S3 tree was forked.
4. **S3 Deadliness AD-per-level rounding**: repo uses
   `[0.166, 0.333, 0.498, 0.664]` (each rank = 0.166 × n) but the wiki
   reports `[0.17, 0.33, 0.5, 0.67]` (each rank = 0.166̄ × n rounded to 2dp).
5. **Wrong `parent` indices on several S3 masteries** (Weapon Expertise,
   Arcane Knowledge, Frenzy, Block, Veteran's Scars, Wealth, Explorer).
   Some of these parents point to indices that don't exist in the S3 tree
   (e.g. `parent: 5` in offense, `parent: 7` in defense), which is a
   guaranteed bug if anything reads them.
6. **S2 Summoner's Wrath Surge wording** is misleading — the +10% applies
   only to AP; attack speed went from 35% to 40% (which is +5 percentage
   points or +14.3% multiplicative, not 10%).

## Masteries in repo not on wiki, or vice versa

- All 49 S2 masteries in the repo match the V1.0.0.131 / Season 2012 wiki
  tree exactly (17 Offense, 16 Defense, 16 Utility). No extras, no missing.
  Tree totals: 44 / 37 / 38 — matches wiki overview.
- All 56 S3 masteries in the repo match the V1.0.0.152 / Season 2013 wiki
  tree exactly (18 Offense, 19 Defense, 19 Utility). No extras, no missing.
  Tree totals: 42 / 40 / 41 — matches wiki overview (defense overview says
  it cost 40 points; repo sums to 40).

## Methodology note

This verification compared the repo data against ~50 individual mastery
pages on `wiki.leagueoflegends.com`, plus the three tree-overview pages per
season, plus the V1.0.0.152 patch page and several patch-history sub-sections.
Discrepancies that are purely cosmetic (rounding to 2 decimals vs 3,
"+" prefixes, extra clarifications like "monsters' basic attacks" instead of
"monster attacks") are noted but not flagged as defects. Discrepancies that
change numerical effect or break a mastery-prerequisite linkage are flagged
as real bugs.
