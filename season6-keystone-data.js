// Season 6 / V5.22 (2015-11-11) — initial Preseason 6 state of the
// Ferocity / Cunning / Resolve keystone mastery system that replaced the
// 2014 Offense/Defense/Utility tree.
//
// System rules (verified against the LoL wiki):
//   - 30 mastery points total (one per summoner level, capped at 30). Each
//     tree holds at most 18 points (5+1+5+1+5+1), so the classic builds were
//     18/12/0 splits. The old "18 total points" reading was wrong — 18 is
//     the per-tree cap, not the budget.
//   - Three trees: Ferocity (crimson, offense), Cunning (violet,
//     utility/cdr), Resolve (teal / steel blue, defense). `color` is the
//     AIR tooltip title colour of the tree.
//   - Each tree has 6 tiers.
//   - Odd tiers (1, 3, 5) host two minor masteries sharing one 5-point
//     pool. Splitting points between the two options IS allowed (confirmed
//     by the V6.1 "splitting points between Battering Blows and Piercing
//     Thoughts granted the incorrect amount of stats" bug-fix note).
//   - Even tiers (2, 4) host two or three 1-rank minor masteries; pick one.
//   - Tier 6 hosts three 1-rank keystones; pick at most one — and since a
//     keystone needs 17 points below it and the budget is 30, only ONE
//     keystone is reachable across all three trees.
//   - Tiers unlock on cumulative points in the tree (5/6/11/12/17), which
//     given the 5/1/5/1/5 row pools is equivalent to filling every
//     previous row.
//
// Sources: https://wiki.leagueoflegends.com/en-us/Ferocity_Mastery_Tree_(2016)
//          https://wiki.leagueoflegends.com/en-us/Cunning_Mastery_Tree_(2016)
//          https://wiki.leagueoflegends.com/en-us/Resolve_Mastery_Tree_(2016)
//          plus the individual <Name>_(Season_2016_Mastery) pages.

var season6KeystoneData = {
    patch: "V5.22",
    patchLabel: "V5.22 (Preseason 6 launch, 2015-11-11)",
    totalPoints: 30,
    rules: {
        tiers: 6,
        minorMaxRanksOddTier: 5,
        minorMaxRanksEvenTier: 1,
        maxPointsPerTree: 18,
        oneKeystoneAcrossAllTrees: true
    },
    // AIR client layout: 5-rank icons at the column edges (V5.22 - V6.x,
    // refs/keystone/gdub_page11.png, Masteries2016.png).
    airFiveRankLayout: "edge",
    // `slot` (optional, per mastery) = left-to-right position in the client
    // when it differs from the data order. The data order is the share-hash
    // index and must not change; Cunning tiers 2 and 4 show Runic Affinity /
    // Bandit on the left (gdub_page11.png, pcg capture).
    trees: [
        // ============================================================ FEROCITY
        {
            id: "ferocity",
            name: "Ferocity",
            color: "#c83c32",
            tiers: [
                {
                    tier: 1,
                    masteries: [
                        { id: "fury",    name: "Fury", iconId: 6111,    ranks: 5, desc: "+0.8/1.6/2.4/3.2/4% Attack Speed",        rankInfo: [0.8, 1.6, 2.4, 3.2, 4] },
                        // iconId: 5.22.3 mastery.json ships Sorcery with a corrupted
                        // name ("game_mastery_displayname_6112"), so match by id.
                        { id: "sorcery", name: "Sorcery", iconId: 6114, ranks: 5, desc: "+0.4/0.8/1.2/1.6/2% ability/spell damage", rankInfo: [0.4, 0.8, 1.2, 1.6, 2] }
                    ]
                },
                {
                    tier: 2,
                    masteries: [
                        // V5.22 launch tier 2: Double-Edged Sword + Feast. Fresh Blood
                        // (V6.22) and Expose Weakness (V6.4) came later.
                        { id: "double-edged-sword", name: "Double-Edged Sword", iconId: 6121, ranks: 1, desc: "Melee: +3% damage dealt, +1.5% damage taken. Ranged: +2% damage dealt, +2% damage taken.", rankInfo: [3] },
                        { id: "feast",              name: "Feast", iconId: 6122,              ranks: 1, desc: "Killing a unit restores 20 health (20s cooldown).",                                      rankInfo: [20] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        { id: "vampirism",      name: "Vampirism", iconId: 6131,      ranks: 5, desc: "+0.4/0.8/1.2/1.6/2% Life Steal and Spell Vamp",      rankInfo: [0.4, 0.8, 1.2, 1.6, 2] },
                        // V5.22 Natural Talent: pure per-level scaling (no flat component until V6.12).
                        { id: "natural-talent", name: "Natural Talent", iconId: 6134, ranks: 5, desc: "Per-level AD/AP (max at 18: +2/4/6/8/10 AD and +3/6/9/12/15 AP)", rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        // Exactly two options at launch — Expose Weakness did not exist
                        // until V6.4 (and entered at tier 2, not here).
                        { id: "bounty-hunter",  name: "Bounty Hunter", iconId: 6141,  ranks: 1, desc: "+1% damage for each unique enemy champion you have killed.", rankInfo: [1] },
                        { id: "oppressor",      name: "Oppressor", iconId: 6142,      ranks: 1, desc: "Deal 2.5% increased damage to enemies whose movement is impaired.", rankInfo: [2.5] }
                    ]
                },
                {
                    tier: 5,
                    masteries: [
                        { id: "battering-blows",  name: "Battering Blows", iconId: 6151,  ranks: 5, desc: "+1.4/2.8/4.2/5.6/7% Armor Penetration",  rankInfo: [1.4, 2.8, 4.2, 5.6, 7] },
                        { id: "piercing-thoughts", name: "Piercing Thoughts", iconId: 6154, ranks: 5, desc: "+1.4/2.8/4.2/5.6/7% Magic Penetration", rankInfo: [1.4, 2.8, 4.2, 5.6, 7] }
                    ]
                },
                {
                    tier: 6,
                    isKeystone: true,
                    masteries: [
                        { id: "warlords-bloodlust", name: "Warlord's Bloodlust", iconId: 6161, keystone: true, ranks: 1, desc: "Critical strikes heal you for 15% of the damage dealt and grant +20% attack speed for 4s (2s cooldown)." },
                        { id: "fervor-of-battle",   name: "Fervor of Battle", iconId: 6162,   keystone: true, ranks: 1, desc: "Basic attacks and spells vs. champions grant Fervor for 5s (stacks up to 10); each stack adds 1–8 (lvl) bonus physical damage to your basic attacks against champions." },
                        { id: "deathfire-touch",    name: "Deathfire Touch", iconId: 6164,    keystone: true, ranks: 1, desc: "Damaging abilities burn champions for 5 + 20% AP + 50% bonus AD magic damage over 3s (AoE/DoT: 2.5 + 10% AP + 25% bonus AD over 1.5s)." }
                    ]
                }
            ]
        },

        // ============================================================== CUNNING
        {
            id: "cunning",
            name: "Cunning",
            color: "#a060c0",
            tiers: [
                {
                    tier: 1,
                    masteries: [
                        { id: "wanderer", name: "Wanderer", iconId: 6311, ranks: 5, desc: "+0.6/1.2/1.8/2.4/3% out-of-combat movement speed", rankInfo: [0.6, 1.2, 1.8, 2.4, 3] },
                        { id: "savagery", name: "Savagery", iconId: 6312, ranks: 5, desc: "+1/2/3/4/5 bonus damage on basic attacks and single-target spells vs. minions and monsters", rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 2,
                    masteries: [
                        // V5.22 launch tier-2 Cunning had Secret Stash and Runic Affinity
                        // only (Assassin was added in V5.24).
                        { id: "secret-stash",   name: "Secret Stash", iconId: 6322,   slot: 1, ranks: 1, desc: "Potions, flasks and elixirs last 10% longer; Health Potions become Total Biscuits of Rejuvenation (restore an additional 20 HP / 10 MP instantly).", rankInfo: [10] },
                        { id: "runic-affinity", name: "Runic Affinity", iconId: 6321, slot: 0, ranks: 1, desc: "Jungle monster buffs (Red/Blue/Baron/Elder) last 15% longer.", rankInfo: [15] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        // V5.22 Merciless: 1/2/3/4/5% (later nerfed to 0.6/1.2/1.8/2.4/3% in V7.4).
                        { id: "merciless",  name: "Merciless", iconId: 6331,  ranks: 5, desc: "+1/2/3/4/5% damage to enemy champions below 40% health", rankInfo: [1, 2, 3, 4, 5] },
                        { id: "meditation", name: "Meditation", iconId: 6332, ranks: 5, desc: "Every 5s, restore 0.3/0.6/0.9/1.2/1.5% of your missing mana", rankInfo: [0.3, 0.6, 0.9, 1.2, 1.5] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        { id: "dangerous-game", name: "Dangerous Game", iconId: 6343, slot: 1, ranks: 1, desc: "Champion kills/assists restore 5% of missing health and missing mana.", rankInfo: [5] },
                        { id: "bandit",         name: "Bandit", iconId: 6342,         slot: 0, ranks: 1, desc: "Gain 1g per nearby minion killed by an ally; gain 10g (melee) / 3g (ranged) on-hit vs. champions (5s cooldown).", rankInfo: [10] }
                    ]
                },
                {
                    tier: 5,
                    masteries: [
                        // V5.22 Precision: per-level armor penetration (0.6/1.2/1.8/2.4/3 + scaling),
                        // pre-Lethality conversion (which happened in V6.22).
                        { id: "precision",    name: "Precision", iconId: 6351,    ranks: 5, desc: "+0.6/1.2/1.8/2.4/3 (+0.06/0.12/0.18/0.24/0.3 per level) Armor and Magic Penetration", rankInfo: [0.6, 1.2, 1.8, 2.4, 3] },
                        { id: "intelligence", name: "Intelligence", iconId: 6352, ranks: 5, desc: "+1/2/3/4/5% Cooldown Reduction (raises CDR cap by the same amount)", rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 6,
                    isKeystone: true,
                    masteries: [
                        { id: "stormraiders-surge", name: "Stormraider's Surge", iconId: 6361, keystone: true, ranks: 1, desc: "Dealing 30% of a champion's max health within 2s grants +35% movement speed for 3s (10s cooldown)." },
                        { id: "thunderlords-decree", name: "Thunderlord's Decree", iconId: 6362, keystone: true, ranks: 1, desc: "3 attacks/abilities on a champion within 5s deal 10–180 (lvl) + 20% bonus AD + 10% AP magic damage in an area (30s cooldown)." },
                        { id: "windspeakers-blessing", name: "Windspeaker's Blessing", iconId: 6363, keystone: true, ranks: 1, desc: "Your heals and shields are 10% stronger. Heals/shields on allies grant them +15% of their armor and MR for 3s." }
                    ]
                }
            ]
        },

        // ============================================================== RESOLVE
        {
            id: "resolve",
            name: "Resolve",
            color: "#6a6ad2",
            tiers: [
                {
                    tier: 1,
                    masteries: [
                        { id: "recovery",  name: "Recovery", iconId: 6211,  ranks: 5, desc: "+0.4/0.8/1.2/1.6/2 health regen per 5 seconds",       rankInfo: [0.4, 0.8, 1.2, 1.6, 2] },
                        // V5.22 Unyielding: 1.2/2.4/3.6/4.8/6% (nerfed to 1/2/3/4/5% in V5.24).
                        { id: "unyielding", name: "Unyielding", iconId: 6212, ranks: 5, desc: "+1.2/2.4/3.6/4.8/6% bonus Armor and Magic Resist",  rankInfo: [1.2, 2.4, 3.6, 4.8, 6] }
                    ]
                },
                {
                    tier: 2,
                    masteries: [
                        // V5.22 launch Resolve tier-2 was Explorer + Tough Skin (Siegemaster added V6.22).
                        { id: "explorer",   name: "Explorer", iconId: 6221,   ranks: 1, desc: "+12 bonus flat movement speed in brush and river.", rankInfo: [12] },
                        { id: "tough-skin", name: "Tough Skin", iconId: 6223, ranks: 1, desc: "Reduces damage from champion and monster basic attacks by 2 (after armor).", rankInfo: [2] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        { id: "runic-armor",    name: "Runic Armor", iconId: 6231,    ranks: 5, desc: "+1.6/3.2/4.8/6.4/8% effectiveness of shields and health restoration on you.", rankInfo: [1.6, 3.2, 4.8, 6.4, 8] },
                        // V5.22 Veteran's Scars: 0.8/1.6/2.4/3.2/4% max health (changed to flat HP V5.24).
                        { id: "veterans-scars", name: "Veteran's Scars", iconId: 6232, ranks: 5, desc: "+0.8/1.6/2.4/3.2/4% maximum health.", rankInfo: [0.8, 1.6, 2.4, 3.2, 4] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        { id: "insight",      name: "Insight", iconId: 6241,      ranks: 1, desc: "-15% summoner spell cooldowns.", rankInfo: [15] },
                        // V5.22 Perseverance: +50% base HP regen, increased to +200% below 20% HP (threshold moved to 25% in V5.23).
                        { id: "perseverance", name: "Perseverance", iconId: 6242, ranks: 1, desc: "+50% base health regen, +200% while below 20% maximum health.", rankInfo: [50] }
                    ]
                },
                {
                    tier: 5,
                    masteries: [
                        { id: "swiftness",          name: "Swiftness", iconId: 6251,          ranks: 5, desc: "+3/6/9/12/15% Tenacity and Slow Resist", rankInfo: [3, 6, 9, 12, 15] },
                        { id: "legendary-guardian", name: "Legendary Guardian", iconId: 6252, ranks: 5, desc: "+0.6/1.2/1.8/2.4/3 bonus armor and MR for each nearby enemy champion (700 range).", rankInfo: [0.6, 1.2, 1.8, 2.4, 3] }
                    ]
                },
                {
                    tier: 6,
                    isKeystone: true,
                    masteries: [
                        { id: "grasp-of-the-undying", name: "Grasp of the Undying", iconId: 6261, keystone: true, ranks: 1, desc: "Every 4s in combat, your next attack vs. a champion deals 3% (1.5% ranged) of your max health as magic damage and heals you for the same amount." },
                        { id: "strength-of-the-ages", name: "Strength of the Ages", iconId: 6262, keystone: true, ranks: 1, desc: "Killing a large monster grants +10 permanent health; a siege minion grants +20. Stacks up to +300 HP. Once capped, each nearby siege minion death restores 100 HP." },
                        { id: "bond-of-stone",        name: "Bond of Stone", iconId: 6263,        keystone: true, ranks: 1, desc: "Take 4% reduced damage (8% while near an ally). 8% of damage your allied champions would take is redirected to you (cannot drop you below 15% HP)." }
                    ]
                }
            ]
        }
    ]
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = season6KeystoneData;
}
