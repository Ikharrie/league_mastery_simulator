// Season 7 / V7.21 (2017-10-25) — final pre-Runes-Reforged state of the
// Ferocity / Cunning / Resolve keystone mastery system. One patch later
// (V7.22, 2017-11-08) the entire system was replaced by Runes Reforged.
//
// System rules: identical to season6-keystone-data.js (see that file's
// header for the long-form rules summary). 30 total points (18 per-tree
// cap), 3 trees, 6 tiers each, only one keystone reachable across all
// trees.
//
// Sources: https://wiki.leagueoflegends.com/en-us/Ferocity_Mastery_Tree_(2016)
//          https://wiki.leagueoflegends.com/en-us/Cunning_Mastery_Tree_(2016)
//          https://wiki.leagueoflegends.com/en-us/Resolve_Mastery_Tree_(2016)
//          plus the individual <Name>_(Season_2016_Mastery) pages.

var season7KeystoneData = {
    patch: "V7.21",
    patchLabel: "V7.21 (Final pre-Runes-Reforged, 2017-10-25)",
    totalPoints: 30,
    rules: {
        tiers: 6,
        minorMaxRanksOddTier: 5,
        minorMaxRanksEvenTier: 1,
        maxPointsPerTree: 18,
        oneKeystoneAcrossAllTrees: true
    },
    trees: [
        // ============================================================ FEROCITY
        {
            id: "ferocity",
            name: "Ferocity",
            color: "#c53030",
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
                        // V6.22 reshuffle: Feast + Fresh Blood + Expose Weakness occupy tier 2.
                        { id: "fresh-blood",     name: "Fresh Blood", iconId: 6121,     ranks: 1, desc: "Your first basic attack vs. a champion deals an additional 11–28 (lvl) damage (6s cooldown).", rankInfo: [28] },
                        { id: "feast",           name: "Feast", iconId: 6122,           ranks: 1, desc: "Killing a unit restores 20 health (30s cooldown).", rankInfo: [20] },
                        { id: "expose-weakness", name: "Expose Weakness", iconId: 6123, ranks: 1, desc: "Your damaging abilities debuff enemies for 3s, making them take 3% more damage from your allies.", rankInfo: [3] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        { id: "vampirism",      name: "Vampirism", iconId: 6131,      ranks: 5, desc: "+0.4/0.8/1.2/1.6/2% Life Steal and Spell Vamp", rankInfo: [0.4, 0.8, 1.2, 1.6, 2] },
                        // V6.12 rework: flat + per-level (caps unchanged at lvl 18: 10 AD / 15 AP).
                        { id: "natural-talent", name: "Natural Talent", iconId: 6134, ranks: 5, desc: "Flat + per-level AD/AP (max at lvl 18: +2/4/6/8/10 AD and +3/6/9/12/15 AP)", rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        // V6.22 added Battle Trance; Double-Edged Sword moved here.
                        { id: "bounty-hunter",      name: "Bounty Hunter", iconId: 6141,      ranks: 1, desc: "+1% damage per unique enemy champion you have killed (max 5%).", rankInfo: [1] },
                        { id: "double-edged-sword", name: "Double-Edged Sword", iconId: 6142, ranks: 1, desc: "Deal 3% increased damage and take 1.5% increased damage from all sources.", rankInfo: [3] },
                        { id: "battle-trance",      name: "Battle Trance", iconId: 6143,      ranks: 1, desc: "While in combat with enemy champions, ramp up to +3% increased damage over 3 seconds.", rankInfo: [3] }
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
                        // Warlord's by V7.6+ is Energized-based with AD scaling.
                        { id: "warlords-bloodlust", name: "Warlord's Bloodlust", iconId: 6161, keystone: true, ranks: 1, desc: "Moving/attacking energizes your next attack: heals for 5–40% AD (lvl) and grants +30% MS for 0.75s. Critical strikes heal for double (scaling with bonus crit damage)." },
                        // V6.24 stack rules: 8 stacks @ 1–8 AD per stack (max 8–64 AD by lvl).
                        { id: "fervor-of-battle",   name: "Fervor of Battle", iconId: 6162,   keystone: true, ranks: 1, desc: "Basic attacks vs. champions grant 2 Fervor stacks (melee) / 1 stack (ranged) for 8s, max 8. Each stack: 1–8 (lvl) bonus AD on-hit (max 8–64 AD)." },
                        // V7.5+ values: 45% bonus AD ratio on the single-target burn.
                        { id: "deathfire-touch",    name: "Deathfire Touch", iconId: 6164,    keystone: true, ranks: 1, desc: "Damaging abilities apply a 4s burn dealing 8 + 25% AP + 45% bonus AD magic damage over time (halved for AoE, quartered for DoT)." }
                    ]
                }
            ]
        },

        // ============================================================== CUNNING
        {
            id: "cunning",
            name: "Cunning",
            color: "#2e7fb8",
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
                        { id: "secret-stash",   name: "Secret Stash", iconId: 6322,   ranks: 1, desc: "Potions and elixirs last 10% longer; Health Potions become Total Biscuits of Rejuvenation (restore 15 HP / 15 MP).", rankInfo: [10] },
                        { id: "assassin",       name: "Assassin", iconId: 6323,       ranks: 1, desc: "Deal 2% increased damage to enemy champions while no allied champions are within 800 range.", rankInfo: [2] }
                    ]
                },
                {
                    tier: 3,
                    masteries: [
                        // V7.4 nerf: 0.6/1.2/1.8/2.4/3% (down from 1/2/3/4/5%).
                        { id: "merciless",  name: "Merciless", iconId: 6331,  ranks: 5, desc: "+0.6/1.2/1.8/2.4/3% damage to enemy champions below 40% health", rankInfo: [0.6, 1.2, 1.8, 2.4, 3] },
                        // Always restored missing mana; V7.4 reduced the values
                        // (0.3-1.5% down to 0.25-1.25%).
                        { id: "meditation", name: "Meditation", iconId: 6332, ranks: 5, desc: "Every 5s, restore 0.25/0.5/0.75/1/1.25% of your missing mana", rankInfo: [0.25, 0.5, 0.75, 1, 1.25] }
                    ]
                },
                {
                    tier: 4,
                    masteries: [
                        { id: "greenfathers-gift", name: "Greenfather's Gift", iconId: 6341, ranks: 1, desc: "After being in brush, your next attack/ability deals bonus magic damage = 3% of target's current health (9s cooldown).", rankInfo: [3] },
                        { id: "bandit",            name: "Bandit", iconId: 6342,             ranks: 1, desc: "Gain 1g per nearby minion killed by an ally; gain 10g (melee) / 3g (ranged) on-hit vs. champions (5s cooldown).", rankInfo: [10] },
                        { id: "dangerous-game",    name: "Dangerous Game", iconId: 6343,     ranks: 1, desc: "Champion kills/assists restore 5% of missing health and missing mana.", rankInfo: [5] }
                    ]
                },
                {
                    tier: 5,
                    masteries: [
                        // V6.22 converted to Lethality. V7.4 nerf: 1.2/2.4/3.6/4.8/6 Lethality.
                        { id: "precision",    name: "Precision", iconId: 6351,    ranks: 5, desc: "+1.2/2.4/3.6/4.8/6 Lethality and +0.3/0.6/0.9/1.2/1.5 (+0.05/0.1/0.15/0.2/0.25 per level) Magic Penetration", rankInfo: [1.2, 2.4, 3.6, 4.8, 6] },
                        { id: "intelligence", name: "Intelligence", iconId: 6352, ranks: 5, desc: "+1/2/3/4/5% Cooldown Reduction (raises CDR cap by the same amount)", rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 6,
                    isKeystone: true,
                    masteries: [
                        // V6.1 buff state: 40% MS / 75% Slow Resist / 2.5s window.
                        { id: "stormraiders-surge",   name: "Stormraider's Surge", iconId: 6361,   keystone: true, ranks: 1, desc: "Dealing 30% of a champion's max health within 2.5s grants +40% movement speed and 75% Slow Resist for 3s (10s cooldown)." },
                        // V6.2 state: 25–15s cooldown (lvl), 3s stack window, +30% bonus AD ratio.
                        { id: "thunderlords-decree",  name: "Thunderlord's Decree", iconId: 6362,  keystone: true, ranks: 1, desc: "Three attacks/abilities on a champion within 3s deal 10–180 (lvl) + 30% bonus AD + 10% AP magic damage in an area (25–15s cooldown by lvl)." },
                        // V5.24 state held through V7.21: +5–22 armor and +2.5–11 MR (lvl) bonus to ally on heal/shield.
                        { id: "windspeakers-blessing", name: "Windspeaker's Blessing", iconId: 6363, keystone: true, ranks: 1, desc: "Your heals and shields are 10% stronger. Heals/shields on allies also grant them +5–22 armor and +2.5–11 magic resist (lvl) for 3s." }
                    ]
                }
            ]
        },

        // ============================================================== RESOLVE
        {
            id: "resolve",
            name: "Resolve",
            color: "#3f9e57",
            tiers: [
                {
                    tier: 1,
                    masteries: [
                        { id: "recovery",  name: "Recovery", iconId: 6211,  ranks: 5, desc: "+0.4/0.8/1.2/1.6/2 health regen per 5 seconds",        rankInfo: [0.4, 0.8, 1.2, 1.6, 2] },
                        // V5.24 nerf state held through V7.21.
                        { id: "unyielding", name: "Unyielding", iconId: 6212, ranks: 5, desc: "+1/2/3/4/5% bonus Armor and Magic Resist",            rankInfo: [1, 2, 3, 4, 5] }
                    ]
                },
                {
                    tier: 2,
                    masteries: [
                        // V6.22 added Siegemaster.
                        { id: "explorer",    name: "Explorer", iconId: 6221,    ranks: 1, desc: "+15 bonus flat movement speed in brush and river.", rankInfo: [15] },
                        { id: "tough-skin",  name: "Tough Skin", iconId: 6223,  ranks: 1, desc: "Reduces damage from champion and monster basic attacks by 2 (after armor).", rankInfo: [2] },
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
                        // V5.23 state held: threshold = 25% (not 20%).
                        { id: "perseverance", name: "Perseverance", iconId: 6242, ranks: 1, desc: "+50% base health regen, +200% while below 25% maximum health.", rankInfo: [50] },
                        // V7.4 nerf: flat 1.5–27 bonus resists (lvl).
                        { id: "fearless",     name: "Fearless", iconId: 6243,     ranks: 1, desc: "When damaged by a champion: +10% (+1.5–27 flat by lvl) bonus armor and magic resist for 2s (9s cooldown).", rankInfo: [10] }
                    ]
                },
                {
                    tier: 5,
                    masteries: [
                        { id: "swiftness",          name: "Swiftness", iconId: 6251,          ranks: 5, desc: "+3/6/9/12/15% Tenacity and Slow Resist",     rankInfo: [3, 6, 9, 12, 15] },
                        { id: "legendary-guardian", name: "Legendary Guardian", iconId: 6252, ranks: 5, desc: "+0.6/1.2/1.8/2.4/3 bonus armor and MR for each nearby enemy champion (700 range).", rankInfo: [0.6, 1.2, 1.8, 2.4, 3] }
                    ]
                },
                {
                    tier: 6,
                    isKeystone: true,
                    masteries: [
                        // V6.12 halved the heal relative to the damage.
                        { id: "grasp-of-the-undying",   name: "Grasp of the Undying", iconId: 6261,   keystone: true, ranks: 1, desc: "Every 4s in combat, your next attack vs. a champion deals 3% (1.5% ranged) of your max health as magic damage and heals you for half that amount (1.5%, or 0.75% ranged)." },
                        // V7.2 final form: 3–54 (lvl) + 5% max HP shield per nearby champion on hard CC.
                        { id: "courage-of-the-colossus", name: "Courage of the Colossus", iconId: 6262, keystone: true, ranks: 1, desc: "After hitting a champion with a stun, taunt, snare, or knock-up: gain a 3-second shield of 3–54 (lvl) + 5% max HP for each nearby enemy champion (45–30s cooldown by lvl)." },
                        // V7.5 addition (replaced Bond of Stone).
                        { id: "stoneborn-pact",          name: "Stoneborn Pact", iconId: 6263,          keystone: true, ranks: 1, desc: "+5% max health as bonus health. Any crowd control you apply brands enemies with an Earthen Rune for 4s; allied attacks on branded enemies heal them for 5 + 2.5% of your max HP over 2s (halved if you're ranged)." }
                    ]
                }
            ]
        }
    ]
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = season7KeystoneData;
}
