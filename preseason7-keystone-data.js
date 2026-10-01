// Preseason 7 / V6.22 (2016-11-10) — the "Assassins" preseason update to the
// Ferocity / Cunning / Resolve keystone mastery system. This is the state of
// the tree at the START of the 2017 preseason, mid-way between the Preseason 6
// launch (V5.22, see season6-keystone-data.js) and the final pre-Runes-Reforged
// build (V7.21, see season7-keystone-data.js).
//
// System rules: identical to season6-keystone-data.js / season7-keystone-data.js
// (see those headers for the long-form summary). 30 total points, 18 per-tree
// cap, 3 trees of 6 tiers each, only one keystone reachable across all trees.
// Tier unlocks at cumulative 5/6/11/12/17 points in the tree.
//
// V6.22-specific changes captured here (verified against per-mastery Patch
// History; V6.22 values often differ from BOTH V5.22 and V7.21):
//   Ferocity
//     - Tier reshuffle: tier 2 now hosts Fresh Blood (NEW) + Feast + Expose
//       Weakness; tier 4 now hosts Bounty Hunter + Double-Edged Sword (moved
//       down) + Battle Trance (NEW). Oppressor was REMOVED this patch.
//     - Fresh Blood (new): first basic attack vs a champion deals 10 + 1/lvl
//       (= 11 at lvl 1, 28 at lvl 18) bonus damage, 6s per-target cooldown.
//     - Battle Trance (new): ramps up to +5% increased damage over 5s while in
//       combat (V7.4 later nerfed to +3% over 3s — the V7.21 file's value).
//     - Double-Edged Sword: BUFFED this patch to +5% dealt / +2.5% taken from
//       the +3% / +1.5% launch values (V7.4 later reverted to 3% / 1.5%).
//     - Deathfire Touch: V6.1 form still live — 8 + 25% AP + 60% bonus AD burn
//       over 4s (V7.5 later cut the AD ratio to 45% — the V7.21 file's value).
//     - Fervor of Battle: pre-V6.24 form — max 10 stacks, 1–6/lvl AD per stack
//       (max 10–60 AD), 4s duration (V6.24 later: 8 stacks, 1–8 AD, 6s).
//     - Warlord's Bloodlust: the missing-health life-steal form (0%–20% bonus
//       life steal vs champions). The Energized rework only arrived in V7.5, so
//       this is NEITHER the V5.22 crit form NOR the V7.21 Energized form.
//   Cunning
//     - Assassin (added V5.24) at tier 2; Greenfather's Gift (added V6.22) at
//       tier 4.
//     - Precision: CONVERTED to Lethality this patch — 1.7/3.4/5.1/6.8/8.5
//       Lethality (+ magic pen), BEFORE the V7.4 nerf to 1.2/2.4/3.6/4.8/6.
//   Resolve
//     - Siegemaster (added V6.22) at tier 2; Fearless (added V6.22) at tier 4.
//     - Courage of the Colossus REPLACED Strength of the Ages this patch, at its
//       strong launch values (20–190 base + 7% max HP per nearby champion, 4s,
//       30s cd; V6.24 later nerfed to 3–54 + 5%, 45–30s cd — the V7.21 value).
//     - Bond of Stone is still the tier-6 keystone; Stoneborn Pact only replaced
//       it in V7.5.
//     - Grasp of the Undying heals for HALF the damage dealt (V6.12 change).
//
// DDragon note: https://ddragon.leagueoflegends.com/cdn/6.22.1/data/en_US/mastery.json
// exists and — unlike 5.22.3, where Sorcery shipped with the corrupted name
// "game_mastery_displayname_6112" — every one of its 44 entries has a correct
// "name" field. So NO iconId overrides are needed for this patch.
//
// Sources: https://wiki.leagueoflegends.com/en-us/Ferocity_Mastery_Tree_(2016)
//          https://wiki.leagueoflegends.com/en-us/Cunning_Mastery_Tree_(2016)
//          https://wiki.leagueoflegends.com/en-us/Resolve_Mastery_Tree_(2016)
//          the individual <Name>_(Season_2016_Mastery) Patch History pages,
//          and https://wiki.leagueoflegends.com/en-us/V6.22 (patch notes).

var preseason7KeystoneData = {
    patch: "V6.22",
    patchLabel: "V6.22 (Preseason 7 — Assassins update, 2016-11-10)",
    totalPoints: 30,
    rules: {
        tiers: 6,
        minorMaxRanksOddTier: 5,
        minorMaxRanksEvenTier: 1,
        maxPointsPerTree: 18,
        oneKeystoneAcrossAllTrees: true
    },
    // AIR client layout: from V6.22 the 5-rank icons sit on the centred
    // pair like the 2-option rows (capture nerf_tankmasteries.png).
    airFiveRankLayout: "pair",
    // Per-mastery `airIconVersion`: the V6.22 AIR client still drew the
    // 5.22.3 art for Fresh Blood and Double-Edged Sword (same capture).
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
                        { id: "fury",    name: "Fury", iconId: 6111,    ranks: 5, desc: "+0.8/1.6/2.4/3.2/4% Attack Speed",         rankInfo: [0.8, 1.6, 2.4, 3.2, 4] },
                        { id: "sorcery", name: "Sorcery", iconId: 6114, ranks: 5, desc: "+0.4/0.8/1.2/1.6/2% ability/spell damage",  rankInfo: [0.4, 0.8, 1.2, 1.6, 2] }
                    ]
                },
                {
                    tier: 2,
                    masteries: [
                        // V6.22 reshuffle: Fresh Blood (new) + Feast + Expose Weakness.
                        // Oppressor was removed this patch.
                        { id: "fresh-blood",     name: "Fresh Blood", iconId: 6121, airIconVersion: "5.22.3", ranks: 1, desc: "Your first basic attack vs. a champion deals 10 + 1 per level (11 at lvl 1, 28 at lvl 18) bonus damage (6s per-target cooldown).", rankInfo: [28] },
                        // Feast cooldown was 30s by V6.22 (V6.8 raised it to 30s from 25s).
                        { id: "feast",           name: "Feast", iconId: 6122,           ranks: 1, desc: "Killing a unit restores 20 health (30s cooldown).", rankInfo: [20] },
                        { id: "expose-weakness", name: "Expose Weakness", iconId: 6123, ranks: 1, desc: "Your damaging abilities debuff enemies for 3s, making them take 3% more damage from your allies.", rankInfo: [3] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        { id: "vampirism",      name: "Vampirism", iconId: 6131,      ranks: 5, desc: "+0.4/0.8/1.2/1.6/2% Life Steal and Spell Vamp", rankInfo: [0.4, 0.8, 1.2, 1.6, 2] },
                        // V6.12 rework in effect: flat + per-level (caps at lvl 18: 10 AD / 15 AP).
                        { id: "natural-talent", name: "Natural Talent", iconId: 6134, ranks: 5, desc: "Flat + per-level AD/AP (max at lvl 18: +2/4/6/8/10 AD and +3/6/9/12/15 AP)", rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        // V6.22 added Battle Trance; Double-Edged Sword moved down from tier 2.
                        { id: "bounty-hunter",      name: "Bounty Hunter", iconId: 6141,      ranks: 1, desc: "+1% damage per unique enemy champion you have killed (max 5%).", rankInfo: [1] },
                        // V6.22 BUFF: 5% dealt / 2.5% taken (up from 3% / 1.5%). V7.4 later reverted.
                        { id: "double-edged-sword", name: "Double-Edged Sword", iconId: 6142, airIconVersion: "5.22.3", ranks: 1, desc: "Deal 5% increased damage and take 2.5% increased damage from all sources.", rankInfo: [5] },
                        { id: "battle-trance",      name: "Battle Trance", iconId: 6143,      ranks: 1, desc: "While in combat with enemy champions, ramp up to +5% increased damage over 5 seconds (lost 3s after leaving combat).", rankInfo: [5] }
                    ]
                },
                {
                    tier: 5,
                    masteries: [
                        { id: "battering-blows",   name: "Battering Blows", iconId: 6151,   ranks: 5, desc: "+1.4/2.8/4.2/5.6/7% Armor Penetration",   rankInfo: [1.4, 2.8, 4.2, 5.6, 7] },
                        { id: "piercing-thoughts", name: "Piercing Thoughts", iconId: 6154, ranks: 5, desc: "+1.4/2.8/4.2/5.6/7% Magic Penetration",  rankInfo: [1.4, 2.8, 4.2, 5.6, 7] }
                    ]
                },
                {
                    tier: 6,
                    isKeystone: true,
                    masteries: [
                        // V6.22 is the missing-health life-steal form (attack-speed component
                        // removed in V6.4; Energized rework only arrived V7.5).
                        { id: "warlords-bloodlust", name: "Warlord's Bloodlust", iconId: 6161, keystone: true, ranks: 1, desc: "Basic attacks gain 0%–20% bonus life steal vs. champions, scaling with your missing health (20% at 80%+ missing HP); life steal is reduced to 50% effectiveness against minions." },
                        // V6.22 stack rules: max 10 stacks, 1–6 (lvl) AD per stack (max 10–60 AD),
                        // 4s duration; melee gain 2 stacks per action, ranged 1. V6.24 changed to
                        // 8 stacks / 1–8 AD / 6s.
                        { id: "fervor-of-battle",   name: "Fervor of Battle", iconId: 6162,   keystone: true, ranks: 1, desc: "Basic attacks and abilities vs. champions grant Fervor (2 stacks melee / 1 ranged) for 4s, up to 10 stacks. Each stack adds 1–6 (lvl) bonus physical damage to basic attacks vs. champions (max 10–60 AD)." },
                        // V6.1 form: 60% bonus AD ratio on the single-target burn (V7.5 cut it to 45%).
                        { id: "deathfire-touch",    name: "Deathfire Touch", iconId: 6164,    keystone: true, ranks: 1, desc: "Damaging abilities apply a 4s burn dealing 8 + 25% AP + 60% bonus AD magic damage over time (halved over 2s for AoE, quartered over 1s for damage-over-time)." }
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
                        { id: "runic-affinity", name: "Runic Affinity", iconId: 6321, ranks: 1, desc: "Jungle monster buffs (Red/Blue/Baron/Elder/Rift Herald) last 15% longer.", rankInfo: [15] },
                        // V6.8 changed the biscuit restore to 15 HP / 15 MP from 20 HP / 10 MP.
                        { id: "secret-stash",   name: "Secret Stash", iconId: 6322,   ranks: 1, desc: "Potions and elixirs last 10% longer; Health Potions become Total Biscuits of Rejuvenation (restore an additional 15 HP / 15 MP instantly).", rankInfo: [10] },
                        // Assassin was added in V5.24.
                        { id: "assassin",       name: "Assassin", iconId: 6323,       ranks: 1, desc: "Deal 2% increased damage to enemy champions while no allied champions are within 800 range.", rankInfo: [2] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        // Pre-V7.4 values (V7.4 nerfed to 0.6/1.2/1.8/2.4/3%).
                        { id: "merciless",  name: "Merciless", iconId: 6331,  ranks: 5, desc: "+1/2/3/4/5% damage to enemy champions below 40% health", rankInfo: [1, 2, 3, 4, 5] },
                        // Pre-V7.4 values (V7.4 reduced to 0.25–1.25%).
                        { id: "meditation", name: "Meditation", iconId: 6332, ranks: 5, desc: "Every 5s, restore 0.3/0.6/0.9/1.2/1.5% of your missing mana", rankInfo: [0.3, 0.6, 0.9, 1.2, 1.5] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        // Greenfather's Gift was added in V6.22 at these values.
                        { id: "greenfathers-gift", name: "Greenfather's Gift", iconId: 6341, ranks: 1, desc: "After being in brush, your next basic attack or damaging ability deals bonus magic damage equal to 3% of the target's current health (9s cooldown).", rankInfo: [3] },
                        { id: "bandit",            name: "Bandit", iconId: 6342,            ranks: 1, desc: "Gain 1g per nearby minion killed by an ally; gain 10g (melee) / 3g (ranged) on-hit vs. champions (5s cooldown).", rankInfo: [10] },
                        { id: "dangerous-game",    name: "Dangerous Game", iconId: 6343,    ranks: 1, desc: "Champion kills/assists restore 5% of missing health and missing mana.", rankInfo: [5] }
                    ]
                },
                {
                    tier: 5,
                    masteries: [
                        // V6.22 converted Precision to Lethality at 1.7/3.4/5.1/6.8/8.5
                        // (V7.4 later nerfed to 1.2/2.4/3.6/4.8/6). Magic pen unchanged this patch.
                        { id: "precision",    name: "Precision", iconId: 6351,    ranks: 5, desc: "+1.7/3.4/5.1/6.8/8.5 Lethality and +0.6/1.2/1.8/2.4/3 (+0.06/0.12/0.18/0.24/0.3 per level) Magic Penetration", rankInfo: [1.7, 3.4, 5.1, 6.8, 8.5] },
                        { id: "intelligence", name: "Intelligence", iconId: 6352, ranks: 5, desc: "+1/2/3/4/5% Cooldown Reduction (raises CDR cap by the same amount)", rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 6,
                    isKeystone: true,
                    masteries: [
                        // V6.1 buff state, still live at V6.22: 40% MS / 75% Slow Resist / 2.5s window.
                        { id: "stormraiders-surge",    name: "Stormraider's Surge", iconId: 6361,    keystone: true, ranks: 1, desc: "Dealing 30% of a champion's max health within 2.5s grants +40% movement speed and 75% Slow Resist for 3s (10s cooldown)." },
                        // V6.2 state: 3s stack window, +30% bonus AD ratio, 25–15s cooldown by lvl.
                        { id: "thunderlords-decree",   name: "Thunderlord's Decree", iconId: 6362,   keystone: true, ranks: 1, desc: "Three attacks/abilities on a champion within 3s deal 10–180 (lvl) + 30% bonus AD + 10% AP magic damage in an area (25–15s cooldown by lvl)." },
                        // V5.24 state, still live at V6.22: +5–22 armor and +2.5–11 MR (lvl) to ally.
                        { id: "windspeakers-blessing", name: "Windspeaker's Blessing", iconId: 6363, keystone: true, ranks: 1, desc: "Your heals and shields are 10% stronger. Heals/shields on allies also grant them +5–22 armor and +2.5–11 magic resist (lvl) for 3s." }
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
                        { id: "recovery",   name: "Recovery", iconId: 6211,   ranks: 5, desc: "+0.4/0.8/1.2/1.6/2 health regen per 5 seconds", rankInfo: [0.4, 0.8, 1.2, 1.6, 2] },
                        // V5.24 nerf state, still live at V6.22.
                        { id: "unyielding", name: "Unyielding", iconId: 6212, ranks: 5, desc: "+1/2/3/4/5% bonus Armor and Magic Resist",       rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 2,
                    masteries: [
                        // Explorer was +15 by V6.22 (V5.24 raised it to 15 from 12).
                        { id: "explorer",    name: "Explorer", iconId: 6221,    ranks: 1, desc: "+15 bonus flat movement speed in brush and river.", rankInfo: [15] },
                        { id: "tough-skin",  name: "Tough Skin", iconId: 6223,  ranks: 1, desc: "Reduces damage from champion and monster basic attacks by 2 (after armor).", rankInfo: [2] },
                        // Siegemaster was added in V6.22.
                        { id: "siegemaster", name: "Siegemaster", iconId: 6222, ranks: 1, desc: "+8 armor and +8 magic resist while near an allied tower (destroyed towers do not count).", rankInfo: [8] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        { id: "runic-armor",    name: "Runic Armor", iconId: 6231,    ranks: 5, desc: "+1.6/3.2/4.8/6.4/8% effectiveness of shields and health restoration on you.", rankInfo: [1.6, 3.2, 4.8, 6.4, 8] },
                        // V6.12 final form: flat health 10/20/30/40/50.
                        { id: "veterans-scars", name: "Veteran's Scars", iconId: 6232, ranks: 5, desc: "+10/20/30/40/50 maximum health.", rankInfo: [10, 20, 30, 40, 50] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        // V6.22 added Fearless.
                        { id: "insight",      name: "Insight", iconId: 6241,      ranks: 1, desc: "-15% summoner spell cooldowns.", rankInfo: [15] },
                        // V5.23 state: threshold = 25% (not 20%).
                        { id: "perseverance", name: "Perseverance", iconId: 6242, ranks: 1, desc: "+50% base health regen, +200% while below 25% maximum health.", rankInfo: [50] },
                        // V6.22 launch values: +10% plus 2–36 flat by level (V7.4 cut the flat to 1.5–27).
                        { id: "fearless",     name: "Fearless", iconId: 6243,     ranks: 1, desc: "When damaged by an enemy champion: +10% (+2–36 flat by lvl) bonus armor and magic resist for 2s (9s cooldown).", rankInfo: [10] }
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
                        // V6.12 halved the heal relative to the damage.
                        { id: "grasp-of-the-undying",    name: "Grasp of the Undying", iconId: 6261,    keystone: true, ranks: 1, desc: "Every 4s in combat, your next attack vs. a champion deals 3% (1.5% ranged) of your max health as magic damage and heals you for half that amount (1.5%, or 0.75% ranged)." },
                        // Added V6.22, REPLACING Strength of the Ages. Launch values below;
                        // V6.24 later nerfed to 3–54 (lvl) + 5% max HP, 45–30s cooldown.
                        { id: "courage-of-the-colossus", name: "Courage of the Colossus", iconId: 6262, keystone: true, ranks: 1, desc: "After hitting an enemy champion with a stun, taunt, snare, or knock-up: gain a 4-second shield of 20–190 (lvl) + 7% max HP for each nearby enemy champion (30s cooldown)." },
                        // Bond of Stone is still the tier-6 keystone here; Stoneborn Pact only replaced it in V7.5.
                        { id: "bond-of-stone",           name: "Bond of Stone", iconId: 6263,           keystone: true, ranks: 1, desc: "Take 4% reduced damage (8% while near an ally). 8% of damage your allied champions would take is redirected to you (cannot drop you below 15% HP)." }
                    ]
                }
            ]
        }
    ]
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = preseason7KeystoneData;
}
