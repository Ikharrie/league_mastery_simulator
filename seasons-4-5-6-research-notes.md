# Seasons 4 / 5 / 6 (pre-rework) mastery research notes

> **Superseded data (per-patch rework, 2026-10).** The files in the table below are gone. Seasons 4 and 5 are now 9 per-patch datasets (V3.14 … V5.21), generated from Data Dragon by `tools/build-masteries.js` into `data/masteries/`; see `data/patches/masteries.json` (listed patches, changes, sources), `data/patches/masteries-overrides.json` and `data/sources/masteries/corrections-vs-legacy.json`. Season boundaries follow `data/patches/seasons.json`: a preseason patch belongs to the next season, so V4.20 is now Season 5. Kept as research history.

## Files produced

| File | Variable | Patch represented |
|---|---|---|
| `season4-data.js` | `season4FinalData` | **V4.20** (Oct 29, 2014) — Season 4 finale |
| `season5-data.js` | `season5FinalData` | **V5.21** (Oct 29, 2015) — last pre-rework patch (see caveat) |
| `season6pre-data.js` | `season6PreReworkData` | **V5.21** (Oct 29, 2015) — same as above (see caveat) |

## Patch-selection caveat (important)

The task prompt asked for **V5.22** as "Season 5 final" and **V6.8** as the
"last patch with the old mastery system." Both assumptions are **wrong**:

- The Ferocity / Cunning / Resolve overhaul actually shipped in **V5.22**
  (Nov 11, 2015), not V6.9. V5.22 was the Preseason 6 patch and the patch
  notes explicitly say "Masteries have been reworked. All Mastery Pages
  have been reset."
- **V6.9** released **May 4, 2016** (not May 11) and was a mid-Season 6
  mage update plus the Death Recap rework. It touched exactly one mastery
  (Soraka–Windspeaker's Blessing interaction).
- That means there is no real "V6.8 pre-rework" snapshot of the old
  30-point tree — by Season 6 the old tree was already gone for ~5 months.

The most faithful preservation of the old tree at the Season 5 / Season 6
boundary is **V5.21 (Oct 29, 2015)** — the last patch before the V5.22
overhaul. `season5-data.js` and `season6pre-data.js` both ship that
snapshot. If the calculator UI wants to label them differently that's
fine, but the data is identical by design.

If a literal "Season 6 mid-patch in the old tree" is ever truly needed,
the answer is: it doesn't exist; substitute V5.21.

## Changes vs. Season 3 (`season3CurrentData`)

The big rework was **V3.14 (Nov 20, 2013, Preseason 4)** — the entire
30-point tree was rebuilt. The S3 → S4 diff is essentially "every
mastery." A non-exhaustive list of *removed* masteries from S3:

- Offense: Summoner's Wrath, Deadliness, Blast, Destruction, Weapon
  Expertise, Arcane Knowledge, Lethality, Sunder, Spellsword
- Defense: Summoner's Resolve, Durability, Defender, Legendary Armor,
  Good Hands, Honor Guard
- Utility: Summoner's Insight (replaced by the new tier-2 version),
  Improved Recall, Mastermind, Artificer, Biscuiteer, Awareness,
  Explorer, Pickpocket, Nimble

And the major *additions* in V3.14: Double-Edged Sword, Expose Weakness,
Spell Weaving, Blade Weaving, Martial Mastery, Arcane Mastery,
Devastating Strikes, Warlord, Dangerous Game, Havoc (capstone), Recovery,
Veteran's Scars (rebuilt), Oppression, Perseverance (reworked into %
missing HP), Evasive, Second Wind, Runic Blessing, Legendary Guardian
(capstone), Phasewalker, Fleet of Foot, Strength of Spirit, Alchemist,
Culinary Master, Bandit, Inspiration, Scavenger, Wanderer (capstone).

In short: well over 40 masteries changed between Season 3 and Season 4 —
**this is a full rewrite, not a diff**.

## Top balance changes (Season 4 → Season 5 → "Season 6")

### Season 4 (V3.14 → V4.20)

Almost no Season 4 mastery changes — Riot left the new tree alone. Only
two patches touched it:

- **V4.2 (Feb 10)** — Perseverance health regen halved from
  `0.7/1.35/2%` to `0.35/0.675/1%` missing HP every 5s. Big tank /
  sustain-jungler nerf.
- **V4.5 (Apr 3)** — Feast on-kill heal `2 → 3` HP (laning sustain
  buff); Scavenger pickup range `900 → 1100` (matches Ancient Coin).

### Season 5 (V5.1 → V5.21)

Two big mid-season trees overhauls plus the v5.22 deletion at end of
season:

- **V5.10 (May 28)** — *Utility tree overhaul*. Bandit unified across
  melee/ranged (melee on-takedown gold removed; melee now `+10` gold
  per-attack, ranged still `+3`). Expanded Mind moved T4→T1 and changed
  from `2/3.5/5%` bonus mana to flat `25/50/75` mana. Meditation moved
  T1→T4 and changed from flat `1/2/3` MP5 to `0.5/1/1.5%` missing mana
  per 5s. Intelligence item-active CDR buffed from `4/7/10%` to
  `8/14/20%`. Wanderer changed from `5%` OOC MS to flat `+20` MS.
  Inspiration XP `5/10 → 10/20`.
- **V5.12 (Jun 24)** — *Defense tree overhaul*. Swiftness moved T4→T1
  and gained a 2nd rank (`7.5/15%` slow resist). Tenacious moved T6→T3,
  collapsed from a 4-rank armor/MR-per-enemy aura to a single 10%
  tenacity rank. Enchanted Armor moved T1→T5 and gained two ranks
  (`2.5/5/7.5/10%` bonus res). Oppression moved T3→T5, value `3% → 2%`.
  Runic Blessing removed (50-hp respawn shield). Adaptive Armor added
  at T4 (4% bonus res → opposite res). Legendary Guardian moved T5→T6
  and *completely reworked*: old version was `15%` CC reduction; new
  version is `+3` armor / `+3` MR per nearby visible enemy (700 range).

### Season 6 (V5.22 onward — NOT included)

The Ferocity / Cunning / Resolve system is a different system entirely
(Keystone masteries, 18-points-max-per-tree, etc.) and is not collected
here per the task instructions.

## Uncertainties and flagged values

- **Perseverance launch value** — the wiki says V3.14 launched it at
  `1/2/3%` missing HP/5s, but a later edit silently mentions `0.7/1.35/2%`
  as the V3.14 value. V3.15 changed it to `0.7/1.35/2%` and V4.2 finalized
  it at `0.35/0.675/1%`. The S4/S5 files use the final V4.2 values, which
  is correct for V4.20 and V5.21.
- **Unyielding** — the per-mastery wiki page is internally
  contradictory: one section says "T3, 2 ranks, 1/2 damage reduction",
  another says "T2, 1 rank, 2 damage (1 ranged)". The V3.14 patch notes
  themselves are the clearer source and say "T2, 1 rank, 2 (1 on
  ranged)." That's what the files use.
- **Brute Force / Mental Force per-level scaling** — V3.14 patch notes
  describe these as "4/8/12 AD at level 18" and "5.33/10.66/16 AP at
  level 18", i.e. per-level scaling. The data files encode them as
  `perlevel: 1` with per-level coefficients (`0.22/0.44/0.67` AD,
  `0.3/0.59/0.89` AP) that match the listed level-18 totals to within
  rounding. If you want exactly level-18 values displayed, the calculator
  already supports `perlevel` from Season 3.
- **Executioner ranks** — wiki "3 ranks, increases damage to champs below
  20/35/50% health by 5%" was the V3.14 description. By V4.20 the
  Executioner page describes it as "Deal X% increased damage below 50%
  Health" with rank values `2/3/5%`. The S4/S5 files use the latter
  (later-snapshot-consistent) values. If a more accurate
  V3.14-vs-V4.20-launch diff is needed for Executioner, additional wiki
  archaeology would be warranted.
- **Bandit V5.10 melee/ranged values** — wiki phrasing slightly
  inconsistent on whether melee changed to `+10` or `+8` gold/attack
  post-V5.10. The patch-notes-direct read was `+10`, used in the files.
- **Bladed Armor bleed duration** — wiki gives both "for X seconds"
  (no value) and "for 4 seconds." Files use 4 seconds; this is a minor
  cosmetic concern only since the calculator displays the description.
- **Tenacious V3.14 aura range** — listed as 900 range. Confirmed by the
  Tenacious mastery page.
- **Legendary Guardian range V5.12** — wiki gives 900 initially and
  "later adjusted to 700." V5.21 description ships 700 in the files.
- **Spell Weaving / Blade Weaving stack timeout** — V3.14 spec is "stacks
  up to 3 times, refreshes on hit/cast" with no explicit duration on
  some wiki copies; the 5-second window is the most commonly cited and
  is what the files state.

None of these are blocking — they're tooltip-text differences or 1pp
rank-value uncertainties, not structural questions about the tree.

## Sources consulted

- `https://wiki.leagueoflegends.com/en-us/V3.14`
- `https://wiki.leagueoflegends.com/en-us/V4.2`, `V4.5`, `V4.10`, `V4.20`
  (plus every other V4.x patch as a "no mastery changes" check)
- `https://wiki.leagueoflegends.com/en-us/V5.10`, `V5.12`, `V5.21`, `V5.22`
  (plus every other V5.x patch as a "no mastery changes" check)
- `https://wiki.leagueoflegends.com/en-us/V6.8`, `V6.9`
- `https://wiki.leagueoflegends.com/en-us/Offense_Mastery_Tree_(2014)`
- `https://wiki.leagueoflegends.com/en-us/Defense_Mastery_Tree_(2014)`
- `https://wiki.leagueoflegends.com/en-us/Utility_Mastery_Tree_(2014)`
- `https://wiki.leagueoflegends.com/en-us/<Name>_(Season_2014_Mastery)`
  individual pages for: Sorcery, Tenacious, Bandit, Legendary Guardian,
  Oppression, Swiftness, Enchanted Armor, Perseverance, Adaptive Armor,
  Runic Blessing, Recovery, Block, Tough Skin, Veteran's Scars,
  Hardiness, Unyielding, Juggernaut, Reinforced Armor, Evasive,
  Second Wind, Intelligence, Wanderer, Meditation, Expanded Mind
