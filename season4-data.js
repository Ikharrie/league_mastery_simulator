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
// same tree array, matching the existing Season 3 convention. `index` (the
// grid cell, (row-1)*4 + column), `parent` and `icon` come from Data Dragon
// 4.20.2 mastery.json: the id 4TRC encodes tree / row / column and `prereq`
// names the parent (Butcher -> Feast, Block -> Unyielding, Wealth -> Bandit,
// ... 15 connectors in all). Array order is the share-code order: never
// reorder entries (move `index` instead).
//
// `rankDesc` = the client's own tooltip string per rank (Data Dragon 4.20.2
// mastery.json description[], "<br>" kept as a line break; it matches the 4.20 client
// capture word for word, e.g. Dangerous Game); the tooltip shows it when
// present. desc / rankInfo keep the wiki-verified values.
var season4FinalData = [
    // offensive
    [
        {
            index: 1,
            name: "Double-Edged Sword",
            icon: "4111",
            ranks: 1,
            desc: "Melee: Deal 2% increased damage and take 1% increased damage.\nRanged: Deal and take 1.5% increased damage.",
            rankInfo: [],
            rankDesc: ["Melee - Deal an additional 2% damage and receive an additional 1% damage\nRanged - Deal an additional 1.5% damage and receive an additional 1.5% damage"],
        },
        {
            index: 2,
            name: "Fury",
            icon: "4112",
            ranks: 4,
            desc: "+#% Attack Speed",
            rankInfo: [1.25, 2.5, 3.75, 5],
            rankDesc: ["+1.25% Attack Speed", "+2.5% Attack Speed", "+3.75% Attack Speed", "+5% Attack Speed"],
        },
        {
            index: 3,
            name: "Sorcery",
            icon: "4113",
            ranks: 4,
            desc: "+#% Cooldown Reduction",
            rankInfo: [1.25, 2.5, 3.75, 5],
            rankDesc: ["+1.25% Cooldown Reduction", "+2.5% Cooldown Reduction", "+3.75% Cooldown Reduction", "+5% Cooldown Reduction"],
        },
        {
            index: 4,
            name: "Butcher",
            icon: "4114",
            ranks: 1,
            desc: "Basic attacks and single-target abilities deal 2 bonus true damage to minions and monsters",
            rankInfo: [],
            rankDesc: ["Basic attacks and single target spells deal an additional 2 damage to minions and monsters\n\nThis does not trigger off of area of effect damage or damage over time effects"],
        },
        {
            index: 5,
            name: "Expose Weakness",
            icon: "4121",
            ranks: 1,
            desc: "Damaging an enemy champion causes them to take 1% increased damage from your allies for 3 seconds",
            rankInfo: [],
            rankDesc: ["Damaging an enemy with a spell increases allied champions' damage to that enemy by 1% for the next 3 seconds"],
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
            rankDesc: ["+4 Attack Damage at level 18 (+0.22 Attack Damage per level)", "+7 Attack Damage at level 18 (+0.39 Attack Damage per level)", "+10 Attack Damage at level 18 (+0.55 Attack Damage per level)"],
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
            rankDesc: ["+6 Ability Power at level 18 (+0.33 Ability Power per level)", "+11 Ability Power at level 18 (+0.61 Ability Power per level)", "+16 Ability Power at level 18 (+0.89 Ability Power per level)"],
        },
        {
            index: 8,
            name: "Feast",
            icon: "4124",
            parent: 3,
            ranks: 1,
            desc: "Restores 3 Health and 1 Mana on unit kill (5 second cooldown)",
            rankInfo: [],
            rankDesc: ["Killing a unit restores 3 Health and 1 Mana"],
        },
        {
            index: 9,
            name: "Spell Weaving",
            icon: "4131",
            ranks: 1,
            desc: "Basic attacks against enemy champions increase your ability damage by 1% for 5 seconds (stacks up to 3 times)",
            rankInfo: [],
            rankDesc: ["Damaging an enemy champion with a Basic Attack increases Spell Damage by 1%, stacking up to 3 times (max 3% damage increase)"],
        },
        {
            index: 10,
            name: "Martial Mastery",
            icon: "4132",
            parent: 5,
            ranks: 1,
            desc: "+5 Attack Damage",
            rankInfo: [],
            rankDesc: ["+4 Attack Damage"],
        },
        {
            index: 11,
            name: "Arcane Mastery",
            icon: "4133",
            parent: 6,
            ranks: 1,
            desc: "+8 Ability Power",
            rankInfo: [],
            rankDesc: ["+6 Ability Power"],
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
            rankDesc: ["Increases damage dealt to champions below 20% Health by 5%", "Increases damage dealt to champions below 35% Health by 5%", "Increases damage dealt to champions below 50% Health by 5%"],
        },
        {
            index: 13,
            name: "Blade Weaving",
            icon: "4141",
            parent: 8,
            ranks: 1,
            desc: "Abilities that deal damage to a champion increase your basic attack damage by 1% for 5 seconds (stacks up to 3 times)",
            rankInfo: [],
            rankDesc: ["Damaging an enemy champion with a spell increases Basic Attack Damage by 1%, stacking up to 3 times (max 3% damage increase)"],
        },
        {
            index: 14,
            name: "Warlord",
            icon: "4142",
            ranks: 3,
            desc: "Increases bonus Attack Damage by #%",
            rankInfo: [2, 3.5, 5],
            rankDesc: ["Increases bonus Attack Damage by 2%", "Increases Bonus Attack Damage by 3.5%", "Increases Bonus Attack Damage by 5%"],
        },
        {
            index: 15,
            name: "Archmage",
            icon: "4143",
            ranks: 3,
            desc: "Increases Ability Power by #%",
            rankInfo: [2, 3.5, 5],
            rankDesc: ["Increases Ability Power by 2%", "Increases Ability Power by 3.5%", "Increases Ability Power by 5%"],
        },
        {
            index: 16,
            name: "Dangerous Game",
            icon: "4144",
            parent: 11,
            ranks: 1,
            desc: "Champion kills and assists restore 5% of your missing Health and Mana",
            rankInfo: [],
            rankDesc: ["Champion kills and assists restore 5% missing Health and Mana"],
        },
        {
            index: 17,
            name: "Frenzy",
            icon: "4151",
            ranks: 1,
            desc: "Critical strikes grant 5% Attack Speed for 3 seconds (stacks up to 3 times)",
            rankInfo: [],
            rankDesc: ["Critical hits grant +5% Attack Speed for 3 seconds (stacks up to 3 times)"],
        },
        {
            index: 18,
            name: "Devastating Strikes",
            icon: "4152",
            ranks: 3,
            desc: "+#% Armor Penetration and +#% Magic Penetration",
            rankInfo: [2, 4, 6],
            rankDesc: ["+2% Armor and Magic Penetration", "+4% Armor and Magic Penetration", "+6% Armor and Magic Penetration"],
            rankInfo2: [2, 4, 6],
        },
        {
            index: 20,
            name: "Arcane Blade",
            icon: "4154",
            ranks: 1,
            desc: "Basic attacks deal bonus magic damage equal to 5% of your Ability Power",
            rankInfo: [],
            rankDesc: ["Basic Attacks also deal bonus magic damage equal to 5% of Ability Power"],
        },
        {
            index: 22,
            name: "Havoc",
            icon: "4162",
            ranks: 1,
            desc: "Increases damage dealt by 3%",
            rankInfo: [],
            rankDesc: ["+3% increased damage"],
        },
    ],
    // defensive
    [
        {
            index: 1,
            name: "Block",
            icon: "4211",
            ranks: 2,
            desc: "Reduces incoming damage from champion basic attacks by #",
            rankInfo: [1, 2],
            rankDesc: ["Reduces incoming damage from champion basic attacks by 1", "Reduces incoming damage from champion basic attacks by 2"],
        },
        {
            index: 2,
            name: "Recovery",
            icon: "4212",
            ranks: 2,
            desc: "+# Health Regen per 5 seconds",
            rankInfo: [1, 2],
            rankDesc: ["+1 Health per 5 seconds", "+2 Health per 5 seconds"],
        },
        {
            index: 3,
            name: "Enchanted Armor",
            icon: "4213",
            ranks: 2,
            desc: "Increases bonus Armor and Magic Resist by #%",
            rankInfo: [2.5, 5],
            rankDesc: ["Increases bonus Armor and Magic Resist by 2.5%", "Increases bonus Armor and Magic Resist by 5%"],
        },
        {
            index: 4,
            name: "Tough Skin",
            icon: "4214",
            ranks: 2,
            desc: "Reduces damage taken from monsters by #",
            rankInfo: [1, 2],
            rankDesc: ["Reduces damage taken from neutral monsters by 1\n\nThis does not affect lane minions", "Reduces damage taken from neutral monsters by 2\n\nThis does not affect lane minions"],
        },
        {
            index: 5,
            name: "Unyielding",
            icon: "4221",
            parent: 0,
            ranks: 1,
            desc: "Reduces all incoming damage from champions by 2 (1 for ranged champions)",
            rankInfo: [],
            rankDesc: ["Melee - Reduces all incoming damage from champions by 2\nRanged - Reduces all incoming damage from champions by 1"],
        },
        {
            index: 6,
            name: "Veteran's Scars",
            icon: "4222",
            ranks: 3,
            desc: "+# Health",
            rankInfo: [12, 24, 36],
            rankDesc: ["+12 Health", "+24 Health", "+36 Health"],
        },
        {
            index: 8,
            name: "Bladed Armor",
            icon: "4224",
            parent: 3,
            ranks: 1,
            desc: "Basic attacks from enemy monsters inflict them with a bleed for 4 seconds, dealing 1% of their current Health as true damage per second",
            rankInfo: [],
            rankDesc: ["Taking Basic Attack Damage from neutral monsters cause them to bleed, dealing physical damage equal to 1% of their current Health each second\nThis does not work against lane minions"],
        },
        {
            index: 9,
            name: "Oppression",
            icon: "4231",
            ranks: 1,
            desc: "Reduces damage taken from enemies with impaired movement (slow, root, stun) by 3%",
            rankInfo: [],
            rankDesc: ["Reduces damage taken by 3% from enemies that have impaired movement (slows, snares, taunts, stuns, etc.)"],
        },
        {
            index: 10,
            name: "Juggernaut",
            icon: "4232",
            parent: 5,
            ranks: 1,
            desc: "Increases your maximum Health by 3%",
            rankInfo: [],
            rankDesc: ["+3% Maximum Health"],
        },
        {
            index: 11,
            name: "Hardiness",
            icon: "4233",
            ranks: 3,
            desc: "+# Armor",
            rankInfo: [2, 3.5, 5],
            rankDesc: ["+2 Armor", "+3.5 Armor", "+5 Armor"],
        },
        {
            index: 12,
            name: "Resistance",
            icon: "4234",
            ranks: 3,
            desc: "+# Magic Resist",
            rankInfo: [2, 3.5, 5],
            rankDesc: ["+2 Magic Resist", "+3.5 Magic Resist", "+5 Magic Resist"],
        },
        {
            index: 13,
            // V4.2 nerfed this from 0.7/1.35/2% to 0.35/0.675/1% missing HP per 5s.
            // V4.20 still uses the post-V4.2 values.
            name: "Perseverance",
            icon: "4241",
            ranks: 3,
            desc: "Restores #% of missing Health every 5 seconds",
            rankInfo: [0.35, 0.675, 1],
            rankDesc: ["Regenerates 0.35% of missing Health every 5 seconds", "Regenerates 0.675% of missing Health every 5 seconds", "Regenerates 1% of missing Health every 5 seconds"],
        },
        {
            index: 14,
            name: "Swiftness",
            icon: "4242",
            ranks: 1,
            desc: "Reduces the effectiveness of slows by 10%",
            rankInfo: [],
            rankDesc: ["Reduces the effectiveness of slows by 10%"],
        },
        {
            index: 15,
            name: "Reinforced Armor",
            icon: "4243",
            parent: 9,
            ranks: 1,
            desc: "Reduces total damage taken from critical strikes by 10%",
            rankInfo: [],
            rankDesc: ["Reduces the total damage taken from critical strikes by 10%"],
        },
        {
            index: 16,
            name: "Evasive",
            icon: "4244",
            parent: 10,
            ranks: 1,
            desc: "Reduces damage taken from area of effect magic damage by 4%",
            rankInfo: [],
            rankDesc: ["Reduces damage taken by 4% from Area of Effect magic damage"],
        },
        {
            index: 17,
            name: "Second Wind",
            icon: "4251",
            parent: 11,
            ranks: 1,
            desc: "Increases self-targeted healing, health regen, life steal and spell vamp by 10% while below 25% Health",
            rankInfo: [],
            rankDesc: ["Increases self-healing, Health Regen, Lifesteal, and Spellvamp by 10% when below 25% Health"],
        },
        {
            index: 18,
            // NAME FIX: V3.14 shipped with the Tenacious/Legendary Guardian
            // names swapped; V3.15 corrected them. In V4.20 the T5 armor/MR
            // aura is "Legendary Guardian" (Tenacious is the T6 CC capstone).
            // V3.15 also reduced the aura range to 700 from 900.
            name: "Legendary Guardian",
            icon: "4252",
            ranks: 4,
            desc: "Grants +# Armor and +# Magic Resist for each nearby visible enemy champion (700 range)",
            rankInfo: [1, 2, 3, 4],
            rankDesc: ["+1 Armor and 0.5 Magic Resist for each nearby enemy champion", "+2 Armor and 1 Magic Resist for each nearby enemy champion", "+3 Armor and 1.5 Magic Resist for each nearby enemy champion", "+4 Armor and 2 Magic Resist for each nearby enemy champion"],
            rankInfo2: [0.5, 1, 1.5, 2],
        },
        {
            index: 19,
            name: "Runic Blessing",
            icon: "4253",
            ranks: 1,
            desc: "Start the game and respawn with a 50-strength shield",
            rankInfo: [],
            rankDesc: ["Start the game with a 50 Health shield. This shield regenerates each time after respawning"],
        },
        {
            index: 22,
            // NAME FIX: this T6 capstone is "Tenacious" in V4.20 (the CC-
            // reduction mastery). See the note on the T5 Legendary Guardian
            // aura above. V5.12 later moved Tenacious to T3 at 10%.
            name: "Tenacious",
            icon: "4262",
            ranks: 1,
            desc: "Reduces the duration of crowd control effects by 15%",
            rankInfo: [],
            rankDesc: ["Reduces the duration of crowd control effects by 15%"],
        },
    ],
    // utility
    [
        {
            index: 1,
            name: "Phasewalker",
            icon: "4311",
            ranks: 1,
            desc: "Reduces Recall channel time by 1 second",
            rankInfo: [],
            rankDesc: ["Reduces the casting time of Recall by 1 second\n\nDominion - Reduces the casting time of Enhanced Recall by 0.5 seconds"],
        },
        {
            index: 2,
            name: "Fleet of Foot",
            icon: "4312",
            ranks: 3,
            desc: "+#% Movement Speed",
            rankInfo: [0.5, 1, 1.5],
            rankDesc: ["+0.5% Movement Speed", "+1% Movement Speed", "+1.5% Movement Speed"],
        },
        {
            index: 3,
            name: "Meditation",
            icon: "4313",
            ranks: 3,
            desc: "+# Mana Regen per 5 seconds",
            rankInfo: [1, 2, 3],
            rankDesc: ["+1 Mana Regen per 5 seconds", "+2 Mana Regen per 5 seconds", "+3 Mana Regen per 5 seconds"],
        },
        {
            index: 4,
            name: "Scout",
            icon: "4314",
            ranks: 1,
            desc: "Increases the cast range of Wards and Trinkets by 10%",
            rankInfo: [],
            rankDesc: ["Increases the cast range of trinket items by 15%"],
        },
        {
            index: 6,
            name: "Summoner's Insight",
            icon: "4322",
            ranks: 3,
            desc: "Reduces the cooldown of Summoner Spells by #%",
            rankInfo: [4, 7, 10],
            rankDesc: ["Reduces the cooldown of Summoner Spells by 4%", "Reduces the cooldown of Summoner Spells by 7%", "Reduces the cooldown of Summoner Spells by 10%"],
        },
        {
            index: 7,
            name: "Strength of Spirit",
            icon: "4323",
            parent: 2,
            ranks: 1,
            desc: "Gain Health Regen equal to 0.3% of your maximum Mana",
            rankInfo: [],
            rankDesc: ["+1 Health Regen per 5 seconds for every 300 maximum Mana"],
        },
        {
            index: 8,
            name: "Alchemist",
            icon: "4324",
            ranks: 1,
            desc: "Increases the duration of Potions and Elixirs by 10%",
            rankInfo: [],
            rankDesc: ["Increases the duration of potions and elixirs by 10%"],
        },
        {
            index: 9,
            name: "Greed",
            icon: "4331",
            ranks: 3,
            desc: "Grants an additional +# gold every 10 seconds",
            rankInfo: [0.5, 1, 1.5],
            rankDesc: ["+0.5 Gold every 10 seconds", "+1 Gold every 10 seconds", "+1.5 Gold every 10 seconds"],
        },
        {
            index: 10,
            name: "Runic Affinity",
            icon: "4332",
            ranks: 1,
            desc: "Increases the duration of shrine, relic, quest, and neutral monster buffs by 20%",
            rankInfo: [],
            rankDesc: ["Increases the duration of shrine, relic, quest, and neutral monster buffs by 20%"],
        },
        {
            index: 11,
            name: "Vampirism",
            icon: "4333",
            ranks: 3,
            desc: "+#% Lifesteal and Spell Vamp",
            rankInfo: [1, 2, 3],
            rankDesc: ["+1% Lifesteal and Spellvamp", "+2% Lifesteal and Spellvamp", "+3% Lifesteal and Spellvamp"],
        },
        {
            index: 12,
            name: "Culinary Master",
            icon: "4334",
            parent: 6,
            ranks: 1,
            desc: "Upgrades Health Potions into Total Biscuits of Rejuvenation, which restore an additional 20 Health and 10 Mana",
            rankInfo: [],
            rankDesc: ["Health potions are upgraded into Biscuits that restore an additional 20 Health and 10 Mana instantly upon consumption"],
        },
        {
            index: 14,
            // V4.5 increased Scavenger's pickup range from 900 to 1100, but
            // gold amount unchanged. Wealth is unchanged from V3.14.
            name: "Wealth",
            icon: "4342",
            ranks: 1,
            desc: "Increases starting gold by 40",
            rankInfo: [],
            rankDesc: ["+40 Starting Gold"],
        },
        {
            // Wiki: Scavenger sits in tier 4, Bandit in tier 5 — grid
            // positions swapped 2026-07 (this changes old share URLs).
            index: 18,
            name: "Bandit",
            icon: "4352",
            parent: 11,
            ranks: 1,
            desc: "Melee: Champion takedowns grant 15 bonus gold.\nRanged: Basic attacks and single-target on-hit abilities against enemy champions grant 3 gold (5 second cooldown per target).",
            rankInfo: [],
            rankDesc: ["Melee - Grants +15 Gold on champion kill or assist\nRanged - Grants +3 Gold each time an enemy champion is attacked. This cannot trigger on the same champion more than once every 5 seconds"],
        },
        {
            index: 15,
            name: "Expanded Mind",
            icon: "4343",
            ranks: 3,
            desc: "Increases your maximum Mana by #%",
            rankInfo: [2, 3.5, 5],
            rankDesc: ["+2% increased maximum Mana", "+3.5% increased maximum Mana", "+5% increased maximum Mana"],
        },
        {
            index: 16,
            name: "Inspiration",
            icon: "4344",
            ranks: 2,
            // 2 ranks (Data Dragon 4.20.2); was 1. hashRanks keeps the old
            // 1-bit share-code field so pre-fix links decode unchanged.
            hashRanks: 1,
            desc: "+# Experience every 10 seconds while near a higher-level allied champion",
            rankInfo: [5, 10],
            rankDesc: ["+5 Experience every 10 seconds while near a higher level allied champion", "+10 Experience every 10 seconds while near a higher level allied champion"],
        },
        {
            index: 13,
            // V4.5 buffed Scavenger range 900 -> 1100; gold unchanged.
            name: "Scavenger",
            icon: "4341",
            parent: 7,
            ranks: 1,
            desc: "Gain 1 gold each time a nearby allied champion kills an enemy minion (1100 range)",
            rankInfo: [],
            rankDesc: ["+1 Gold each time an ally kills a nearby lane minion"],
        },
        {
            index: 19,
            name: "Intelligence",
            icon: "4353",
            ranks: 3,
            desc: "+#% Cooldown Reduction. Reduces active item cooldowns by #%",
            rankInfo: [2, 3.5, 5],
            rankDesc: ["+2% Cooldown Reduction and reduces the cooldown of Activated Items by 4%", "+3.5% Cooldown Reduction and reduces the cooldown of Activated Items by 7%", "+5% Cooldown Reduction and reduces the cooldown of Activated Items by 10%"],
            rankInfo2: [4, 7, 10],
        },
        {
            index: 22,
            name: "Wanderer",
            icon: "4362",
            ranks: 1,
            desc: "Grants 5% bonus Movement Speed while out of combat",
            rankInfo: [],
            rankDesc: ["+5% Movement Speed out of combat"],
        },
    ],
];
