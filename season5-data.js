// Season 5 / V5.21 (Oct 29, 2015) mastery data — the LAST pre-rework patch
// of the 30-point Offense / Defense / Utility tree.
//
// NOTE on patch selection: The original task prompt asked for V5.22 as the
// "Season 5 final" state. That is incorrect — V5.22 (Nov 11, 2015) is the
// patch that REPLACED this tree with the Ferocity / Cunning / Resolve
// system. The last patch with the 30-point old tree is V5.21. See
// seasons-4-5-6-research-notes.md for details.
//
// Two Season 5 patches reworked the old tree before it was retired:
//   - V5.10 (May 28, 2015): Utility tree overhaul (Bandit, Expanded Mind,
//     Inspiration, Intelligence, Meditation, Wanderer; Expanded Mind and
//     Meditation swapped positions)
//   - V5.12 (Jun 24, 2015): Defense tree overhaul (Swiftness -> T1,
//     Tenacious -> T3 single rank, Enchanted Armor -> T5, Oppression ->
//     T5, Legendary Guardian -> T6 reworked; Runic Blessing removed;
//     Adaptive Armor added at T4)
//
// Sources:
//   https://wiki.leagueoflegends.com/en-us/V5.10
//   https://wiki.leagueoflegends.com/en-us/V5.12
//   https://wiki.leagueoflegends.com/en-us/<Name>_(Season_2014_Mastery)
//
// Tiers in the 4-wide grid use indexes:
//   T1: 1-4, T2: 5-8, T3: 9-12, T4: 13-16, T5: 17-20, T6: 21-24
// `index`, `parent` and `icon` come from Data Dragon 5.21.1 mastery.json
// (id 4TRC = tree / row / column, `prereq` = parent). Array order is the
// share-code order: never reorder entries (move `index` instead).
//
// Offense tree is unchanged from V4.20 / V3.14.
var season5FinalData = [
    // offensive — identical to Season 4
    [
        {
            index: 1,
            name: "Double-Edged Sword",
            icon: "4111",
            ranks: 1,
            desc: "Melee: Deal 2% increased damage and take 1% increased damage.\nRanged: Deal and take 1.5% increased damage.",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Fury",
            icon: "4112",
            ranks: 4,
            desc: "+#% Attack Speed",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 3,
            name: "Sorcery",
            icon: "4113",
            ranks: 4,
            desc: "+#% Cooldown Reduction",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 4,
            name: "Butcher",
            icon: "4114",
            ranks: 1,
            desc: "Basic attacks and single-target abilities deal 2 bonus true damage to minions and monsters",
            rankInfo: [],
        },
        {
            index: 5,
            name: "Expose Weakness",
            icon: "4121",
            ranks: 1,
            desc: "Damaging an enemy champion causes them to take 1% increased damage from your allies for 3 seconds",
            rankInfo: [],
        },
        {
            index: 6,
            name: "Brute Force",
            icon: "4122",
            ranks: 3,
            perlevel: 1,
            desc: "+# Attack Damage per level\n(+# Attack Damage at champion level 18)",
            // Wiki: 0.22 / 0.39 / 0.55 AD per level (3.96 / 7.02 / 9.9 at level 18).
            rankInfo: [0.22, 0.39, 0.55],
        },
        {
            index: 7,
            name: "Mental Force",
            icon: "4123",
            ranks: 3,
            perlevel: 1,
            desc: "+# Ability Power per level\n(+# Ability Power at champion level 18)",
            // Wiki: 0.33 / 0.61 / 0.89 AP per level (5.94 / 10.98 / 16.02 at level 18).
            rankInfo: [0.33, 0.61, 0.89],
        },
        {
            index: 8,
            name: "Feast",
            icon: "4124",
            parent: 3,
            ranks: 1,
            desc: "Restores 3 Health and 1 Mana on unit kill (5 second cooldown)",
            rankInfo: [],
        },
        {
            index: 9,
            name: "Spell Weaving",
            icon: "4131",
            ranks: 1,
            desc: "Basic attacks against enemy champions increase your ability damage by 1% for 5 seconds (stacks up to 3 times)",
            rankInfo: [],
        },
        {
            index: 10,
            name: "Martial Mastery",
            icon: "4132",
            parent: 5,
            ranks: 1,
            desc: "+5 Attack Damage",
            rankInfo: [],
        },
        {
            index: 11,
            name: "Arcane Mastery",
            icon: "4133",
            parent: 6,
            ranks: 1,
            desc: "+8 Ability Power",
            rankInfo: [],
        },
        {
            index: 12,
            name: "Executioner",
            icon: "4134",
            ranks: 3,
            // Wiki: flat +5% damage; the HEALTH THRESHOLD scales per rank
            // (20 / 35 / 50% maximum health). Unchanged V3.14 -> V5.21.
            desc: "Deal 5% increased damage to champions below #% maximum Health",
            rankInfo: [20, 35, 50],
        },
        {
            index: 13,
            name: "Blade Weaving",
            icon: "4141",
            parent: 8,
            ranks: 1,
            desc: "Abilities that deal damage to a champion increase your basic attack damage by 1% for 5 seconds (stacks up to 3 times)",
            rankInfo: [],
        },
        {
            index: 14,
            name: "Warlord",
            icon: "4142",
            ranks: 3,
            desc: "Increases bonus Attack Damage by #%",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 15,
            name: "Archmage",
            icon: "4143",
            ranks: 3,
            desc: "Increases Ability Power by #%",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 16,
            name: "Dangerous Game",
            icon: "4144",
            parent: 11,
            ranks: 1,
            desc: "Champion kills and assists restore 5% of your missing Health and Mana",
            rankInfo: [],
        },
        {
            index: 17,
            name: "Frenzy",
            icon: "4151",
            ranks: 1,
            desc: "Critical strikes grant 5% Attack Speed for 3 seconds (stacks up to 3 times)",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Devastating Strikes",
            icon: "4152",
            ranks: 3,
            desc: "+#% Armor Penetration and +#% Magic Penetration",
            rankInfo: [2, 4, 6],
            rankInfo2: [2, 4, 6],
        },
        {
            index: 20,
            name: "Arcane Blade",
            icon: "4154",
            ranks: 1,
            desc: "Basic attacks deal bonus magic damage equal to 5% of your Ability Power",
            rankInfo: [],
        },
        {
            index: 22,
            name: "Havoc",
            icon: "4162",
            ranks: 1,
            desc: "Increases damage dealt by 3%",
            rankInfo: [],
        },
    ],
    // defensive — V5.12 reworked layout & several values
    [
        {
            index: 1,
            name: "Block",
            icon: "4211",
            ranks: 2,
            desc: "Reduces incoming damage from champion basic attacks by #",
            rankInfo: [1, 2],
        },
        {
            index: 2,
            name: "Recovery",
            icon: "4212",
            ranks: 2,
            desc: "+# Health Regen per 5 seconds",
            rankInfo: [1, 2],
        },
        {
            index: 3,
            // V5.12: Swiftness moved from T4 to T1, ranks 1 -> 2,
            // slow resist 10% -> 7.5/15%.
            name: "Swiftness",
            icon: "4213",
            ranks: 2,
            desc: "Reduces the effectiveness of slows by #%",
            rankInfo: [7.5, 15],
        },
        {
            index: 4,
            name: "Tough Skin",
            icon: "4214",
            ranks: 2,
            desc: "Reduces damage taken from monsters by #",
            rankInfo: [1, 2],
        },
        {
            index: 5,
            name: "Unyielding",
            icon: "4221",
            parent: 0,
            ranks: 1,
            desc: "Reduces all incoming damage from champions by 2 (1 for ranged champions)",
            rankInfo: [],
        },
        {
            index: 6,
            name: "Veteran's Scars",
            icon: "4222",
            ranks: 3,
            desc: "+# Health",
            rankInfo: [12, 24, 36],
        },
        {
            index: 8,
            name: "Bladed Armor",
            icon: "4224",
            parent: 3,
            ranks: 1,
            desc: "Basic attacks from enemy monsters inflict them with a bleed for 4 seconds, dealing 1% of their current Health as true damage per second",
            rankInfo: [],
        },
        {
            index: 9,
            // V5.12: Tenacious moved from T6 (4-rank armor/MR aura) to T3
            // (1-rank tenacity).
            name: "Tenacious",
            icon: "4231",
            ranks: 1,
            desc: "Reduces the duration of crowd control effects by 10% (stacks multiplicatively with Tenacity)",
            rankInfo: [],
        },
        {
            index: 10,
            name: "Juggernaut",
            icon: "4232",
            parent: 5,
            ranks: 1,
            desc: "Increases your maximum Health by 3%",
            rankInfo: [],
        },
        {
            index: 11,
            name: "Hardiness",
            icon: "4233",
            ranks: 3,
            desc: "+# Armor",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 12,
            name: "Resistance",
            icon: "4234",
            ranks: 3,
            desc: "+# Magic Resist",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 13,
            name: "Perseverance",
            icon: "4241",
            ranks: 3,
            desc: "Restores #% of missing Health every 5 seconds",
            rankInfo: [0.35, 0.675, 1],
        },
        {
            index: 14,
            // V5.12 added Adaptive Armor at T4.
            name: "Adaptive Armor",
            icon: "4242",
            ranks: 1,
            desc: "If your bonus Armor exceeds your bonus Magic Resist, gain Magic Resist equal to 4% of your bonus Armor. Otherwise, gain Armor equal to 4% of your bonus Magic Resist.",
            rankInfo: [],
        },
        {
            index: 15,
            name: "Reinforced Armor",
            icon: "4243",
            parent: 9,
            ranks: 1,
            desc: "Reduces total damage taken from critical strikes by 10%",
            rankInfo: [],
        },
        {
            index: 16,
            name: "Evasive",
            icon: "4244",
            parent: 10,
            ranks: 1,
            desc: "Reduces damage taken from area of effect magic damage by 4%",
            rankInfo: [],
        },
        {
            index: 17,
            name: "Second Wind",
            icon: "4251",
            parent: 11,
            ranks: 1,
            desc: "Increases self-targeted healing, health regen, life steal and spell vamp by 10% while below 25% Health",
            rankInfo: [],
        },
        {
            index: 18,
            // V5.12: Enchanted Armor moved from T1 (2 ranks 2.5/5%) to T5
            // (4 ranks 2.5/5/7.5/10%).
            name: "Enchanted Armor",
            icon: "4252",
            ranks: 4,
            desc: "Increases bonus Armor and Magic Resist by #%",
            rankInfo: [2.5, 5, 7.5, 10],
        },
        {
            index: 19,
            // V5.12: Oppression moved from T3 to T5, value 3% -> 2%.
            name: "Oppression",
            icon: "4253",
            ranks: 1,
            desc: "Reduces damage taken from enemies with impaired movement (slow, root, stun) or reduced Attack Speed by 2%",
            rankInfo: [],
        },
        {
            index: 22,
            // V5.12: Legendary Guardian reworked completely. Previously
            // T6 1-rank 15% CC reduction. Now T6 1-rank stat aura.
            name: "Legendary Guardian",
            icon: "4262",
            ranks: 1,
            desc: "Grants +3 Armor and +3 Magic Resist for each nearby visible enemy champion (700 range)",
            rankInfo: [],
        },
    ],
    // utility — V5.10 reworked layout & several values
    [
        {
            index: 1,
            name: "Phasewalker",
            icon: "4311",
            ranks: 1,
            desc: "Reduces Recall channel time by 1 second",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Fleet of Foot",
            icon: "4312",
            ranks: 3,
            desc: "+#% Movement Speed",
            rankInfo: [0.5, 1, 1.5],
        },
        {
            index: 3,
            // V5.10: Expanded Mind moved from T4 to T1, and changed from
            // 2/3.5/5% max mana to flat 20/50/75 mana (wiki: "20 / 50 / 75").
            name: "Expanded Mind",
            icon: "4313",
            ranks: 3,
            desc: "+# Mana",
            rankInfo: [20, 50, 75],
        },
        {
            index: 4,
            name: "Scout",
            icon: "4314",
            ranks: 1,
            desc: "Increases the cast range of Wards and Trinkets by 10%",
            rankInfo: [],
        },
        {
            index: 6,
            name: "Summoner's Insight",
            icon: "4322",
            ranks: 3,
            desc: "Reduces the cooldown of Summoner Spells by #%",
            rankInfo: [4, 7, 10],
        },
        {
            index: 7,
            name: "Strength of Spirit",
            icon: "4323",
            parent: 2,
            ranks: 1,
            desc: "Gain Health Regen equal to 0.3% of your maximum Mana",
            rankInfo: [],
        },
        {
            index: 8,
            name: "Alchemist",
            icon: "4324",
            ranks: 1,
            desc: "Increases the duration of Potions and Elixirs by 10%",
            rankInfo: [],
        },
        {
            index: 9,
            name: "Greed",
            icon: "4331",
            ranks: 3,
            desc: "Grants an additional +# gold every 10 seconds",
            rankInfo: [0.5, 1, 1.5],
        },
        {
            index: 10,
            name: "Runic Affinity",
            icon: "4332",
            ranks: 1,
            desc: "Increases the duration of shrine, relic, quest, and neutral monster buffs by 20%",
            rankInfo: [],
        },
        {
            index: 11,
            name: "Vampirism",
            icon: "4333",
            ranks: 3,
            desc: "+#% Lifesteal and Spell Vamp",
            rankInfo: [1, 2, 3],
        },
        {
            index: 12,
            name: "Culinary Master",
            icon: "4334",
            parent: 6,
            ranks: 1,
            desc: "Upgrades Health Potions into Total Biscuits of Rejuvenation, which restore an additional 20 Health and 10 Mana",
            rankInfo: [],
        },
        {
            index: 14,
            name: "Wealth",
            icon: "4342",
            ranks: 1,
            desc: "Increases starting gold by 40",
            rankInfo: [],
        },
        {
            // Wiki: Scavenger sits in tier 4, Bandit in tier 5 — grid
            // positions swapped 2026-07 (this changes old share URLs).
            index: 18,
            // V5.10: Bandit unified — melee on-takedown gold removed,
            // both melee and ranged now get on-hit gold (melee 10 / ranged 3).
            name: "Bandit",
            icon: "4352",
            parent: 11,
            ranks: 1,
            desc: "Melee: Basic attacks and single-target on-hit abilities against champions grant 10 gold (5 second cooldown per target).\nRanged: Basic attacks and single-target on-hit abilities against champions grant 3 gold (5 second cooldown per target).",
            rankInfo: [],
        },
        {
            index: 15,
            // V5.10: Meditation moved from T1 to T4, changed from flat
            // 1/2/3 mana regen to 0.5/1/1.5% missing mana every 5s.
            name: "Meditation",
            icon: "4343",
            ranks: 3,
            desc: "Once every 5 seconds, restores #% of your missing Mana",
            rankInfo: [0.5, 1, 1.5],
        },
        {
            index: 16,
            // V5.10: Inspiration XP gain 5/10 -> 10/20.
            name: "Inspiration",
            icon: "4344",
            ranks: 2,
            // 2 ranks (Data Dragon 5.21.1); was 1. hashRanks keeps the old
            // 1-bit share-code field so pre-fix links decode unchanged.
            hashRanks: 1,
            desc: "+# Experience every 10 seconds while near a higher-level allied champion",
            rankInfo: [10, 20],
        },
        {
            index: 13,
            name: "Scavenger",
            icon: "4341",
            parent: 7,
            ranks: 1,
            desc: "Gain 1 gold each time a nearby allied champion kills an enemy minion (1100 range)",
            rankInfo: [],
        },
        {
            index: 19,
            // V5.10: Intelligence item-active CDR buffed from 4/7/10% to
            // 8/14/20%. Base CDR unchanged.
            name: "Intelligence",
            icon: "4353",
            ranks: 3,
            desc: "+#% Cooldown Reduction. Reduces active item cooldowns by #%",
            rankInfo: [2, 3.5, 5],
            rankInfo2: [8, 14, 20],
        },
        {
            index: 22,
            // V5.10: Wanderer changed from 5% out-of-combat MS to 20 flat MS.
            name: "Wanderer",
            icon: "4362",
            ranks: 1,
            desc: "Grants 20 bonus Movement Speed while out of combat",
            rankInfo: [],
        },
    ],
];
