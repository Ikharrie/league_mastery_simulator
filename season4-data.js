// Season 4 / V4.20 (Oct 29, 2014) mastery data — Season 4 finale.
//
// This is the 30-point Offense / Defense / Utility tree that was introduced
// in V3.14 (Nov 20, 2013, Preseason 4) and stayed in place for the entire
// 2014 season. Only two patches in Season 4 touched mastery values:
//   - V4.2  (Feb 10, 2014): Perseverance regen halved (0.7/1.35/2 -> 0.35/0.675/1)
//   - V4.5  (Apr 3, 2014):  Feast on-kill HP 2 -> 3; Scavenger range 900 -> 1100
//
// Sources (per-mastery wiki pages):
//   https://wiki.leagueoflegends.com/en-us/Offense_Mastery_Tree_(2014)
//   https://wiki.leagueoflegends.com/en-us/Defense_Mastery_Tree_(2014)
//   https://wiki.leagueoflegends.com/en-us/Utility_Mastery_Tree_(2014)
//   https://wiki.leagueoflegends.com/en-us/<Name>_(Season_2014_Mastery)
//
// Tiers in the 4-wide grid use indexes:
//   T1: 1-4, T2: 5-8, T3: 9-12, T4: 13-16, T5: 17-20, T6: 21-24
//
// IMPORTANT: This tree is almost entirely different from Season 3. The
// V3.14 preseason was a full rework — new keystones-adjacent capstones
// (Havoc / Legendary Guardian / Wanderer), removal of "per-level"-scaling
// stat masteries (Deadliness, Blast, Durability, Awareness, etc.), and a
// switch to single-rank capstones with stacking conditional effects
// (Frenzy, Spell Weaving, Blade Weaving, Dangerous Game).
//
// `parent` references the ARRAY INDEX (0-based) of the prerequisite in the
// same tree array, matching the existing Season 3 convention. The Season 4
// tree has very few hard prerequisites — only Juggernaut requires 3 ranks
// in Veteran's Scars on the wiki, but the calculator's `parent` model is
// the simpler "tier-up requires N points in same column", so we encode the
// few documented parent relationships and rely on the column/tier point
// gates for the rest.
var season4FinalData = [
    // offensive
    [
        {
            index: 1,
            name: "Double-Edged Sword",
            ranks: 1,
            desc: "Melee: Deal 2% increased damage and take 1% increased damage.\nRanged: Deal and take 1.5% increased damage.",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Fury",
            ranks: 4,
            desc: "+#% Attack Speed",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 3,
            name: "Sorcery",
            ranks: 4,
            desc: "+#% Cooldown Reduction",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 4,
            name: "Butcher",
            ranks: 1,
            desc: "Basic attacks and single-target abilities deal 2 bonus true damage to minions and monsters",
            rankInfo: [],
        },
        {
            index: 5,
            name: "Expose Weakness",
            ranks: 1,
            desc: "Damaging an enemy champion causes them to take 1% increased damage from your allies for 3 seconds",
            rankInfo: [],
        },
        {
            index: 6,
            name: "Brute Force",
            ranks: 3,
            perlevel: 1,
            desc: "+# Attack Damage per level\n(+# Attack Damage at champion level 18)",
            // Wiki: 0.22 / 0.39 / 0.55 AD per level (3.96 / 7.02 / 9.9 at level 18).
            rankInfo: [0.22, 0.39, 0.55],
        },
        {
            index: 7,
            name: "Mental Force",
            ranks: 3,
            perlevel: 1,
            desc: "+# Ability Power per level\n(+# Ability Power at champion level 18)",
            // Wiki: 0.33 / 0.61 / 0.89 AP per level (5.94 / 10.98 / 16.02 at level 18).
            rankInfo: [0.33, 0.61, 0.89],
        },
        {
            index: 8,
            name: "Feast",
            ranks: 1,
            desc: "Restores 3 Health and 1 Mana on unit kill (5 second cooldown)",
            rankInfo: [],
        },
        {
            index: 9,
            name: "Spell Weaving",
            ranks: 1,
            desc: "Basic attacks against enemy champions increase your ability damage by 1% for 5 seconds (stacks up to 3 times)",
            rankInfo: [],
        },
        {
            index: 10,
            name: "Martial Mastery",
            ranks: 1,
            desc: "+5 Attack Damage",
            rankInfo: [],
        },
        {
            index: 11,
            name: "Arcane Mastery",
            ranks: 1,
            desc: "+8 Ability Power",
            rankInfo: [],
        },
        {
            index: 12,
            name: "Executioner",
            ranks: 3,
            // Wiki: flat +5% damage; the HEALTH THRESHOLD scales per rank
            // (20 / 35 / 50% maximum health). Unchanged V3.14 -> V5.21.
            desc: "Deal 5% increased damage to champions below #% maximum Health",
            rankInfo: [20, 35, 50],
        },
        {
            index: 13,
            name: "Blade Weaving",
            ranks: 1,
            desc: "Abilities that deal damage to a champion increase your basic attack damage by 1% for 5 seconds (stacks up to 3 times)",
            rankInfo: [],
        },
        {
            index: 14,
            name: "Warlord",
            ranks: 3,
            desc: "Increases bonus Attack Damage by #%",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 15,
            name: "Archmage",
            ranks: 3,
            desc: "Increases Ability Power by #%",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 16,
            name: "Dangerous Game",
            ranks: 1,
            desc: "Champion kills and assists restore 5% of your missing Health and Mana",
            rankInfo: [],
        },
        {
            index: 17,
            name: "Frenzy",
            ranks: 1,
            desc: "Critical strikes grant 5% Attack Speed for 3 seconds (stacks up to 3 times)",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Devastating Strikes",
            ranks: 3,
            desc: "+#% Armor Penetration and +#% Magic Penetration",
            rankInfo: [2, 4, 6],
            rankInfo2: [2, 4, 6],
        },
        {
            index: 19,
            name: "Arcane Blade",
            ranks: 1,
            desc: "Basic attacks deal bonus magic damage equal to 5% of your Ability Power",
            rankInfo: [],
        },
        {
            index: 21,
            name: "Havoc",
            ranks: 1,
            desc: "Increases damage dealt by 3%",
            rankInfo: [],
        },
    ],
    // defensive
    [
        {
            index: 1,
            name: "Block",
            ranks: 2,
            desc: "Reduces incoming damage from champion basic attacks by #",
            rankInfo: [1, 2],
        },
        {
            index: 2,
            name: "Recovery",
            ranks: 2,
            desc: "+# Health Regen per 5 seconds",
            rankInfo: [1, 2],
        },
        {
            index: 3,
            name: "Enchanted Armor",
            ranks: 2,
            desc: "Increases bonus Armor and Magic Resist by #%",
            rankInfo: [2.5, 5],
        },
        {
            index: 4,
            name: "Tough Skin",
            ranks: 2,
            desc: "Reduces damage taken from monsters by #",
            rankInfo: [1, 2],
        },
        {
            index: 5,
            name: "Unyielding",
            ranks: 1,
            desc: "Reduces all incoming damage from champions by 2 (1 for ranged champions)",
            rankInfo: [],
        },
        {
            index: 6,
            name: "Veteran's Scars",
            ranks: 3,
            desc: "+# Health",
            rankInfo: [12, 24, 36],
        },
        {
            index: 7,
            name: "Bladed Armor",
            ranks: 1,
            desc: "Basic attacks from enemy monsters inflict them with a bleed for 4 seconds, dealing 1% of their current Health as true damage per second",
            rankInfo: [],
        },
        {
            index: 9,
            name: "Oppression",
            ranks: 1,
            desc: "Reduces damage taken from enemies with impaired movement (slow, root, stun) by 3%",
            rankInfo: [],
        },
        {
            index: 10,
            name: "Juggernaut",
            ranks: 1,
            desc: "Increases your maximum Health by 3%",
            rankInfo: [],
            parent: 5, // Veteran's Scars (array index 5 in this tree)
        },
        {
            index: 11,
            name: "Hardiness",
            ranks: 3,
            desc: "+# Armor",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 12,
            name: "Resistance",
            ranks: 3,
            desc: "+# Magic Resist",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 13,
            // V4.2 nerfed this from 0.7/1.35/2% to 0.35/0.675/1% missing HP per 5s.
            // V4.20 still uses the post-V4.2 values.
            name: "Perseverance",
            ranks: 3,
            desc: "Restores #% of missing Health every 5 seconds",
            rankInfo: [0.35, 0.675, 1],
        },
        {
            index: 14,
            name: "Swiftness",
            ranks: 1,
            desc: "Reduces the effectiveness of slows by 10%",
            rankInfo: [],
        },
        {
            index: 15,
            name: "Reinforced Armor",
            ranks: 1,
            desc: "Reduces total damage taken from critical strikes by 10%",
            rankInfo: [],
        },
        {
            index: 16,
            name: "Evasive",
            ranks: 1,
            desc: "Reduces damage taken from area of effect magic damage by 4%",
            rankInfo: [],
        },
        {
            index: 17,
            name: "Second Wind",
            ranks: 1,
            desc: "Increases self-targeted healing, health regen, life steal and spell vamp by 10% while below 25% Health",
            rankInfo: [],
        },
        {
            index: 18,
            // NAME FIX: V3.14 shipped with the Tenacious/Legendary Guardian
            // names swapped; V3.15 corrected them. In V4.20 the T5 armor/MR
            // aura is "Legendary Guardian" (Tenacious is the T6 CC capstone).
            // V3.15 also reduced the aura range to 700 from 900.
            name: "Legendary Guardian",
            ranks: 4,
            desc: "Grants +# Armor and +# Magic Resist for each nearby visible enemy champion (700 range)",
            rankInfo: [1, 2, 3, 4],
            rankInfo2: [0.5, 1, 1.5, 2],
        },
        {
            index: 19,
            name: "Runic Blessing",
            ranks: 1,
            desc: "Start the game and respawn with a 50-strength shield",
            rankInfo: [],
        },
        {
            index: 21,
            // NAME FIX: this T6 capstone is "Tenacious" in V4.20 (the CC-
            // reduction mastery). See the note on the T5 Legendary Guardian
            // aura above. V5.12 later moved Tenacious to T3 at 10%.
            name: "Tenacious",
            ranks: 1,
            desc: "Reduces the duration of crowd control effects by 15%",
            rankInfo: [],
        },
    ],
    // utility
    [
        {
            index: 1,
            name: "Phasewalker",
            ranks: 1,
            desc: "Reduces Recall channel time by 1 second",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Fleet of Foot",
            ranks: 3,
            desc: "+#% Movement Speed",
            rankInfo: [0.5, 1, 1.5],
        },
        {
            index: 3,
            name: "Meditation",
            ranks: 3,
            desc: "+# Mana Regen per 5 seconds",
            rankInfo: [1, 2, 3],
        },
        {
            index: 4,
            name: "Scout",
            ranks: 1,
            desc: "Increases the cast range of Wards and Trinkets by 10%",
            rankInfo: [],
        },
        {
            index: 5,
            name: "Summoner's Insight",
            ranks: 3,
            desc: "Reduces the cooldown of Summoner Spells by #%",
            rankInfo: [4, 7, 10],
        },
        {
            index: 6,
            name: "Strength of Spirit",
            ranks: 1,
            desc: "Gain Health Regen equal to 0.3% of your maximum Mana",
            rankInfo: [],
        },
        {
            index: 7,
            name: "Alchemist",
            ranks: 1,
            desc: "Increases the duration of Potions and Elixirs by 10%",
            rankInfo: [],
        },
        {
            index: 9,
            name: "Greed",
            ranks: 3,
            desc: "Grants an additional +# gold every 10 seconds",
            rankInfo: [0.5, 1, 1.5],
        },
        {
            index: 10,
            name: "Runic Affinity",
            ranks: 1,
            desc: "Increases the duration of shrine, relic, quest, and neutral monster buffs by 20%",
            rankInfo: [],
        },
        {
            index: 11,
            name: "Vampirism",
            ranks: 3,
            desc: "+#% Lifesteal and Spell Vamp",
            rankInfo: [1, 2, 3],
        },
        {
            index: 12,
            name: "Culinary Master",
            ranks: 1,
            desc: "Upgrades Health Potions into Total Biscuits of Rejuvenation, which restore an additional 20 Health and 10 Mana",
            rankInfo: [],
        },
        {
            index: 13,
            // V4.5 increased Scavenger's pickup range from 900 to 1100, but
            // gold amount unchanged. Wealth is unchanged from V3.14.
            name: "Wealth",
            ranks: 1,
            desc: "Increases starting gold by 40",
            rankInfo: [],
        },
        {
            // Wiki: Scavenger sits in tier 4, Bandit in tier 5 — grid
            // positions swapped 2026-07 (this changes old share URLs).
            index: 17,
            name: "Bandit",
            ranks: 1,
            desc: "Melee: Champion takedowns grant 15 bonus gold.\nRanged: Basic attacks and single-target on-hit abilities against enemy champions grant 3 gold (5 second cooldown per target).",
            rankInfo: [],
        },
        {
            index: 15,
            name: "Expanded Mind",
            ranks: 3,
            desc: "Increases your maximum Mana by #%",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 16,
            name: "Inspiration",
            ranks: 1,
            desc: "Grants 5 bonus Experience every 10 seconds while near a higher-level allied champion (rounded up at level 18)",
            rankInfo: [],
        },
        {
            index: 14,
            // V4.5 buffed Scavenger range 900 -> 1100; gold unchanged.
            name: "Scavenger",
            ranks: 1,
            desc: "Gain 1 gold each time a nearby allied champion kills an enemy minion (1100 range)",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Intelligence",
            ranks: 3,
            desc: "+#% Cooldown Reduction. Reduces active item cooldowns by #%",
            rankInfo: [2, 3.5, 5],
            rankInfo2: [4, 7, 10],
        },
        {
            index: 21,
            name: "Wanderer",
            ranks: 1,
            desc: "Grants 5% bonus Movement Speed while out of combat",
            rankInfo: [],
        },
    ],
];
