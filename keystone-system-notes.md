# Keystone Mastery System (V5.22 - V7.21)

Notes on the Ferocity / Cunning / Resolve keystone mastery system that
shipped in patch V5.22 (2015-11-11, Preseason 6) and was retired with
Runes Reforged in V7.22 (2017-11-08). Two data snapshots are captured in
`season6-keystone-data.js` (V5.22 launch) and
`season7-keystone-data.js` (V7.21 final pre-Reforged).

## Confirmed system rules

- **Total spendable points: 18.** A maxed tree spends 5 + 1 + 5 + 1 + 5 + 1 = 18.
  The legacy summoner-level cap (30) is unrelated; the tree itself only
  contains 18 slots.
- **Three trees:** Ferocity (red, offense), Cunning (yellow, utility / CDR),
  Resolve (blue, defense).
- **Six tiers per tree.**
- **Odd tiers (1, 3, 5):** two **mutually exclusive** minor masteries, each
  ranked 1-5. The wiki phrases this as "splitting points between them is
  allowed but only one is meaningfully selected" -- functionally the
  simulator can treat them as a pair sharing a 5-point pool.
- **Even tiers (2, 4):** two or three 1-rank minor masteries; pick one.
- **Tier 6:** three 1-rank keystones; pick at most one.
- **Tier-N requires 5 points spent in tier N-1** of the same tree.
- **Only ONE keystone may be active across all three trees combined.** This
  is the system's defining constraint and the reason "keystone identity"
  drove every build choice in Season 6/7.

## V7.21 keystones (9 total)

**Ferocity**
- Warlord's Bloodlust (Energized attack: heals 5-40% AD by lvl, +30% MS 0.75s; crits double the heal)
- Fervor of Battle (on-hit stacks, 8 stacks x 1-8 AD by lvl = up to 64 bonus AD)
- Deathfire Touch (4s magic-damage burn from damaging abilities; 25% AP + 45% bonus AD ratio)

**Cunning**
- Stormraider's Surge (deal 30% max HP in 2.5s -> +40% MS / 75% slow resist for 3s)
- Thunderlord's Decree (3 hits in 3s -> AoE magic damage proc; 25-15s cooldown by lvl)
- Windspeaker's Blessing (+10% heals/shields, plus bonus armor/MR to the target)

**Resolve**
- Grasp of the Undying (every 4s in combat, next attack deals/heals 3% max HP; 1.5% ranged)
- Courage of the Colossus (hard CC -> shield scaling with enemies in range)
- Stoneborn Pact (+5% max HP; your hard CC lets allies heal off the target)

## V5.22 keystones (9 total) and what changed by V7.21

**Ferocity** keystones did not change names (still Warlord's / Fervor / Deathfire),
but Warlord's Bloodlust was reworked end-to-end (crit-trigger -> missing-HP
lifesteal -> Energized-based AD heal) and Fervor's stacking mechanics were
revised at least four times.

**Cunning** keystones also kept the same three names (Stormraider's /
Thunderlord's / Windspeaker's), with the most-impactful balance moves
being Thunderlord's gaining a level-scaling cooldown (V6.2) and
Windspeaker's switching from %-of-resists to flat-by-level resists (V5.24).

**Resolve** is the only tree whose keystone roster CHANGED. V5.22 launched
with **Grasp of the Undying / Strength of the Ages / Bond of Stone**:
- **Strength of the Ages** (permanent +HP from siege minions/monsters, capped
  at +300, then auto-heal on siege minion deaths) was REMOVED in V6.22 and
  REPLACED by **Courage of the Colossus**.
- **Bond of Stone** (4-8% damage reduction + 8% ally-damage redirection)
  was REMOVED in V7.5 and REPLACED by **Stoneborn Pact**.

## 2-3 most impactful V5.22 -> V7.21 changes

1. **Resolve keystone reroll.** Replacing Strength of the Ages and Bond of
   Stone with Courage of the Colossus and Stoneborn Pact shifted the tank
   meta from "passive scaling tank" to "engage tank" (Colossus rewards
   hitting hard CC) and "enchanter-tank hybrid" (Stoneborn Pact rewards
   peeling for allies).
2. **Precision adopting Lethality (V6.22).** When the global Armor-Pen ->
   Lethality conversion hit, Precision became flat Lethality + scaling
   magic pen, which materially rebalanced AD assassin power curves and
   how the Cunning T5 row was valued versus Intelligence (CDR).
3. **Warlord's Bloodlust full rework cycle.** Warlord's went through at
   least four distinct designs between V5.22 and V7.21 (crit-on-trigger,
   missing-HP lifesteal, Energized lifesteal, Energized AD-scaled heal),
   each of which moved which ADCs/bruisers wanted the keystone -- a
   strong signal that the keystone-identity model was brittle and is part
   of why Runes Reforged replaced the whole system in V7.22.

Sources: official LoL wiki pages
`Ferocity_Mastery_Tree_(2016)`, `Cunning_Mastery_Tree_(2016)`,
`Resolve_Mastery_Tree_(2016)`, and each `<Name>_(Season_2016_Mastery)` page.
