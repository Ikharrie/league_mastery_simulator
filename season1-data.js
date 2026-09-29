// Season 1 / 2011 (pre-November 15, 2011 rework) mastery data.
//
// Source: https://wiki.leagueoflegends.com/en-us/ individual mastery pages,
// each at the pattern <Name>_(Season_2011_Mastery). Tree structure pages:
//   https://wiki.leagueoflegends.com/en-us/Offense_Mastery_Tree_(2011)
//   https://wiki.leagueoflegends.com/en-us/Defense_Mastery_Tree_(2011)
//   https://wiki.leagueoflegends.com/en-us/Utility_Mastery_Tree_(2011)
//
// Tiers in the 4-wide grid use indexes:
//   T1: 1-4, T2: 5-8, T3: 9-12, T4: 13-16, T5: 17-20, T6: 21-24
//
// Notes on uncertain / corrected items:
//   - Brute Force: confirmed 2011 as 3 ranks +1/+2/+3 flat AD (matches your
//     pre-verified value). Later seasons (2012+) shifted to per-level scaling.
//   - Deadliness: 2011 was 3 ranks 0.66/1.33/2% critical strike chance (NOT 4
//     ranks; the user's prompt said 4 but the wiki history confirms 3).
//   - Archmage's Savvy: 2011 was 3 ranks of per-level AP (0.2/0.4/0.6 per
//     level). Listed in your prompt under Tier 1 Offense.
//   - Lethality: 2011 = 3 ranks of 3.33/6.66/10% crit damage (not 2 ranks).
//   - Mender's Faith: 2011 final form (post-V1.0.0.61) reduced Heal cooldown
//     by 30 sec; earlier 2011 form added 10-180 healing. Used the cooldown
//     form here as that's the late-Season-1 state.
//   - Strength of Spirit prerequisite: wiki says it required 3 points in
//     Resistance, but most tree-summary sources just say "4 Defense points
//     for Tier 2"; left without parent ref because it isn't visually adjacent
//     in the standard 2011 tree layout (matches Evasion treatment).
//   - Column positions within each tier are best-effort reconstructions of
//     the in-game grid; the simulator only needs them to render layout.
//
// `parent` references the ARRAY POSITION of the prerequisite within this
// tree (0-based) — same convention as the Season 3 entries in data.js.

var season1Data = [
    // ---------------------------------------------------------------- Offense
    [
        {
            index: 1,
            name: "Deadliness",
            ranks: 3,
            desc: "+#% Critical Strike chance",
            rankInfo: [0.66, 1.33, 2],
        },
        {
            index: 2,
            name: "Cripple",
            ranks: 1,
            desc: "Improves your |Exhaust| to also reduce the target's Armor and Magic Resist by 10 and increases its duration by 0.5 seconds",
            rankInfo: [],
        },
        {
            index: 3,
            name: "Plentiful Bounty",
            ranks: 1,
            desc: "Improves your |Smite| to grant 5 bonus gold on use and reduces its cooldown by 5 seconds",
            rankInfo: [],
        },
        {
            index: 4,
            name: "Archmage's Savvy",
            ranks: 3,
            perlevel: 1,
            desc: "+# Ability Power per level\n(+# Ability Power at champion level 18)",
            rankInfo: [0.2, 0.4, 0.6],
        },
        {
            index: 6,
            name: "Sorcery",
            ranks: 4,
            desc: "+#% Cooldown Reduction",
            rankInfo: [0.75, 1.5, 2.25, 3],
        },
        {
            index: 7,
            name: "Alacrity",
            ranks: 4,
            desc: "+#% Attack Speed",
            rankInfo: [1, 2, 3, 4],
        },
        {
            index: 9,
            name: "Burning Embers",
            ranks: 1,
            desc: "While your |Ignite| is on cooldown, grants 10 Ability Power",
            rankInfo: [],
        },
        {
            index: 10,
            name: "Archaic Knowledge",
            ranks: 1,
            desc: "+15% Magic Penetration",
            rankInfo: [],
            parent: 4,
        },
        {
            index: 11,
            name: "Sunder",
            ranks: 3,
            desc: "+# Armor Penetration",
            rankInfo: [2, 4, 6],
        },
        {
            index: 12,
            name: "Offensive Mastery",
            ranks: 2,
            desc: "Basic attacks and single-target spells deal # bonus damage to minions and monsters",
            rankInfo: [2, 4],
        },
        {
            index: 14,
            name: "Brute Force",
            ranks: 3,
            desc: "+# Attack Damage",
            rankInfo: [1, 2, 3],
        },
        {
            index: 15,
            name: "Demolisher",
            ranks: 1,
            desc: "Improves |Promote|: reduces its cooldown by 15 seconds, grants Promoted units +20 Armor, and increases turret damage by 15 while Promote is off cooldown",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Lethality",
            ranks: 3,
            desc: "+#% Critical Strike Damage",
            rankInfo: [3.33, 6.66, 10],
        },
        {
            index: 19,
            name: "Improved Rally",
            ranks: 1,
            desc: "Improves your |Rally| to also grant 20-70 Ability Power (scaling with level) and increases its duration by 5 seconds",
            rankInfo: [],
        },
        {
            index: 22,
            name: "Havoc",
            ranks: 1,
            desc: "Increases your physical damage and magic damage by 4%",
            rankInfo: [],
        },
    ],
    // ---------------------------------------------------------------- Defense
    [
        {
            index: 1,
            name: "Mender's Faith",
            ranks: 1,
            desc: "Reduces the cooldown of your |Heal| spell by 30 seconds",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Resistance",
            ranks: 3,
            desc: "+# Magic Resist",
            rankInfo: [2, 4, 6],
        },
        {
            index: 3,
            name: "Hardiness",
            ranks: 3,
            desc: "+# Armor",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 4,
            name: "Perseverance",
            ranks: 3,
            desc: "Increases your Health Regen and Mana Regen by #%",
            rankInfo: [2, 3, 4],
        },
        {
            index: 6,
            name: "Strength of Spirit",
            ranks: 3,
            desc: "Increases Health Regen per 5 seconds by #% of your maximum Mana",
            rankInfo: [0.33, 0.66, 1],
            parent: 1,
        },
        {
            index: 7,
            name: "Evasion",
            ranks: 4,
            desc: "+#% Dodge chance",
            rankInfo: [0.5, 1, 1.5, 2],
        },
        {
            index: 9,
            name: "Defensive Mastery",
            ranks: 2,
            desc: "Reduces damage taken from minions and monsters by #",
            rankInfo: [1, 2],
        },
        {
            index: 10,
            name: "Nimbleness",
            ranks: 1,
            desc: "Grants 10% bonus Movement Speed for 5 seconds after dodging an attack",
            rankInfo: [],
            parent: 5,
        },
        {
            index: 11,
            name: "Harden Skin",
            ranks: 3,
            desc: "Blocks # physical damage from all sources",
            rankInfo: [1, 1.5, 2],
            parent: 2,
        },
        {
            index: 14,
            name: "Veteran's Scars",
            ranks: 4,
            desc: "+# Health",
            rankInfo: [12, 24, 36, 48],
        },
        {
            index: 15,
            name: "Willpower",
            ranks: 1,
            desc: "Reduces the cooldown of |Cleanse| by 20 seconds",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Ardor",
            ranks: 3,
            desc: "+#% Ability Power and +#% Attack Speed",
            rankInfo: [1.33, 2.66, 4],
        },
        {
            index: 19,
            name: "Reinforce",
            ranks: 1,
            desc: "Your |Fortify| and |Garrison| spells cause allied turrets to deal 50% splash damage",
            rankInfo: [],
        },
        {
            index: 22,
            name: "Tenacity",
            ranks: 1,
            desc: "Reduces all damage dealt to your champion by 4%",
            rankInfo: [],
        },
    ],
    // ---------------------------------------------------------------- Utility
    [
        {
            index: 1,
            name: "Spatial Accuracy",
            ranks: 1,
            desc: "Improves |Teleport|: reduces cast delay by 0.5 seconds and cooldown by 5 seconds. Improves |Promote|: reduces cooldown by 30 seconds",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Good Hands",
            ranks: 3,
            desc: "Reduces time spent dead by #%",
            rankInfo: [3.33, 6.66, 10],
        },
        {
            index: 3,
            name: "Perseverance",
            ranks: 3,
            desc: "Increases your Health Regen and Mana Regen by #%",
            rankInfo: [2, 3, 4],
        },
        {
            index: 4,
            name: "Haste",
            ranks: 1,
            desc: "Improves your |Ghost| to increase its Movement Speed by 6% and its duration by 1.5 seconds",
            rankInfo: [],
        },
        {
            index: 6,
            name: "Awareness",
            ranks: 4,
            desc: "Increases Experience earned by #%",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 7,
            name: "Expanded Mind",
            ranks: 4,
            desc: "Increases maximum Mana by #%",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 9,
            name: "Greed",
            ranks: 1,
            desc: "Grants 1 bonus gold every 10 seconds",
            rankInfo: [],
        },
        {
            index: 10,
            name: "Meditation",
            ranks: 3,
            desc: "+# Mana Regen per 5 seconds",
            rankInfo: [1, 2, 3],
        },
        {
            index: 11,
            name: "Utility Mastery",
            ranks: 2,
            desc: "Increases the duration of shrines, relics, quests, and neutral monster buffs by #%",
            rankInfo: [15, 30],
        },
        {
            index: 12,
            name: "Insight",
            ranks: 1,
            desc: "Improves your |Clarity| to grant the same amount of mana to allies as your champion receives",
            rankInfo: [],
        },
        {
            index: 14,
            name: "Quickness",
            ranks: 3,
            desc: "+#% Movement Speed",
            rankInfo: [1, 2, 3],
        },
        {
            index: 15,
            name: "Blink of an Eye",
            ranks: 1,
            desc: "Reduces the cooldown of |Flash| by 15 seconds",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Intelligence",
            ranks: 3,
            desc: "+#% Cooldown Reduction",
            rankInfo: [2, 4, 6],
        },
        {
            index: 19,
            name: "Mystical Vision",
            ranks: 1,
            desc: "Improves your |Clairvoyance| to increase its duration by 4 seconds and reduce its cooldown by 5 seconds",
            rankInfo: [],
        },
        {
            index: 22,
            name: "Presence of the Master",
            ranks: 1,
            desc: "Reduces the recharge time of all Summoner Spells by 15%",
            rankInfo: [],
        },
    ],
];
