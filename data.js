var season3CurrentData = [
    // offensive
    [
        {
            index: 1,
            name: "Summoner's Wrath",
            icon: "511",
            ranks: 1,
            desc: "Improves the following Summoner Spells:\n\n|Exhaust:| Reduces target's Magic Resist and Armor by 10\n|Ignite:| Increases Ability Power and Attack Damage by 5 while on cooldown\n|Ghost:| Increases Movement Speed bonus to 35%\n|Garrison:| Allied Garrisoned turrets deal 50% splash damage.",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Fury",
            icon: "512",
            ranks: 4,
            desc: "+#% Attack Speed",
            rankInfo: [1, 2, 3, 4],
        },
        {
            index: 3,
            name: "Sorcery",
            icon: "513",
            ranks: 4,
            desc: "+#% Cooldown Reduction",
            rankInfo: [1, 2, 3, 4],
        },
        {
            index: 4,
            name: "Butcher",
            icon: "514",
            ranks: 2,
            desc: "Basic attacks deal # bonus damage to minions and monsters",
            rankInfo: [2, 4],
        },
        {
            index: 6,
            name: "Deadliness",
            icon: "522",
            ranks: 4,
            perlevel: 1,
            desc: "+# Attack Damage per level\n(# Attack Damage at champion level 18)",
            rankInfo: [0.17, 0.33, 0.5, 0.67],
        },
        {
            index: 7,
            name: "Blast",
            icon: "523",
            ranks: 4,
            perlevel: 1,
            desc: "+# Ability Power per level\n(# Ability Power at champion level 18)",
            rankInfo: [0.25, 0.5, 0.75, 1],
        },
        {
            index: 8,
            name: "Destruction",
            icon: "524",
            ranks: 1,
            desc: "Increase damage to turrets by 5%",
            rankInfo: [],
        },
        {
            index: 9,
            name: "Havoc",
            icon: "531",
            ranks: 3,
            desc: "Increases damage dealt by #%",
            rankInfo: [0.67, 1.33, 2],
        },
        {
            index: 10,
            name: "Weapon Expertise",
            icon: "532",
            parent: 4,
            ranks: 1,
            desc: "+8% Armor Penetration",
            rankInfo: [],
        },
        {
            index: 11,
            name: "Arcane Knowledge",
            icon: "533",
            parent: 5,
            ranks: 1,
            desc: "+8% Magic Penetration",
            rankInfo: [],
        },
        {
            index: 13,
            name: "Lethality",
            icon: "541",
            ranks: 2,
            desc: "+#% Critical Strike Damage\n (#% for melee champions)",
            rankInfo: [2.5, 5],
            rankInfo2: [5, 10],
        },
        {
            index: 14,
            name: "Brute Force",
            icon: "542",
            ranks: 2,
            desc: "+# Attack Damage",
            rankInfo: [1.5, 3],
        },
        {
            index: 15,
            name: "Mental Force",
            icon: "543",
            ranks: 3,
            desc: "# Ability Power",
            rankInfo: [2, 4, 6],
        },
        {
            index: 16,
            name: "Spellsword",
            icon: "544",
            ranks: 1,
            desc: "Deals 5% of your Ability Power in magic damage to the target on each basic attack",
            rankInfo: [],
        },
        {
            index: 17,
            name: "Frenzy",
            icon: "551",
            parent: 10,
            ranks: 1,
            desc: "Grants 10% attack speed for 2 seconds after landing a critical hit",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Sunder",
            icon: "552",
            ranks: 3,
            desc: "+# Armor Penetration",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 19,
            name: "Archmage",
            icon: "553",
            ranks: 4,
            desc: "Increases Ability Power by #%",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 22,
            name: "Executioner",
            icon: "562",
            ranks: 1,
            desc: "Increases damage dealt by 5% to targets below 50% Health",
            rankInfo: [],
        },
    ],
        // defensive
    [
        {
            index: 1,
            name: "Summoner's Resolve",
            icon: "611",
            ranks: 1,
            desc: "Improves the following Summoner Spells:\n\n|Cleanse:| Increases duration of disable reduction by 1 second\n|Heal:| Passively increases Health by 5 per level\n|Smite:| Grants 10 bonus gold on use\n|Barrier:| Increases Barrier shield amount by 20",
            rankInfo: [],
        },
        {
            index: 2,
            name: "Perseverance",
            icon: "612",
            ranks: 3,
            desc: "Grants up to +# Health Regen per 5 seconds based on missing Health",
            rankInfo: [2, 4, 6],
        },
        {
            index: 3,
            name: "Durability",
            icon: "613",
            ranks: 4,
            perlevel: 1,
            desc: "+# Health per level\n(+# Health at champion level 18)",
            rankInfo: [1.5, 3, 4.5, 6],
        },
        {
            index: 4,
            name: "Tough Skin",
            icon: "614",
            ranks: 2,
            desc: "Reduces damage taken from monsters by #",
            rankInfo: [1, 2],
        },
        {
            index: 5,
            name: "Hardiness",
            icon: "621",
            ranks: 3,
            desc: "+# Armor",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 6,
            name: "Resistance",
            icon: "622",
            ranks: 3,
            desc: "+# Magic Resist",
            rankInfo: [2, 3.5, 5],
        },
        {
            index: 8,
            name: "Bladed Armor",
            icon: "624",
            parent: 3,
            ranks: 1,
            desc: "Deals 6 damage to any enemy monster that attacks you",
            rankInfo: [],
        },
        {
            index: 9,
            name: "Unyielding",
            icon: "631",
            ranks: 2,
            desc: "Reduces the damage taken from enemy champions by #",
            rankInfo: [1, 2],
        },
        {
            index: 10,
            name: "Relentless",
            icon: "632",
            ranks: 2,
            desc: "Reduces the effectiveness of slows by #%",
            rankInfo: [7.5, 15],
        },
        {
            index: 11,
            name: "Veteran's Scars",
            icon: "633",
            parent: 2,
            ranks: 1,
            desc: "+30 Health",
            rankInfo: [],
        },
        {
            index: 12,
            name: "Safeguard",
            icon: "634",
            ranks: 1,
            desc: "Reduces damage taken from turrets by 5%",
            rankInfo: [],
        },
        {
            index: 13,
            name: "Block",
            icon: "641",
            parent: 7,
            ranks: 1,
            desc: "Reduces damage taken from champion basic attacks by 3",
            rankInfo: [],
        },
        {
            index: 14,
            name: "Tenacious",
            icon: "642",
            ranks: 3,
            desc: "Reduces the duration of crowd control effects by #% (stacks multiplicatively with Tenacity)",
            rankInfo: [5, 10, 15],
        },
        {
            index: 15,
            name: "Juggernaut",
            icon: "643",
            ranks: 3,
            desc: "Increases your maximum Health by #%",
            rankInfo: [1.5, 2.75, 4],
        },
        {
            index: 17,
            name: "Defender",
            icon: "651",
            ranks: 1,
            desc: "Grants +1 Armor and Magic Resist for each nearby enemy champion",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Legendary Armor",
            icon: "652",
            ranks: 3,
            desc: "Increases bonus Armor and Magic Resist by +#%",
            rankInfo: [2, 4, 6],
        },
        {
            index: 19,
            name: "Good Hands",
            icon: "653",
            ranks: 1,
            desc: "Reduce time spent dead by 10%",
            rankInfo: [],
        },
        {
            index: 20,
            name: "Reinforced Armor",
            icon: "654",
            ranks: 1,
            desc: "Reduce damage taken from critical strikes by 10%",
            rankInfo: [],
        },
        {
            index: 22,
            name: "Honor Guard",
            icon: "662",
            ranks: 1,
            desc: "Reduces damage taken from all sources by 3%",
            rankInfo: [],
        },
    ],
    [
        {
            index: 1,
            name: "Summoner's Insight",
            icon: "711",
            ranks: 1,
            desc: "Improves the following Summoner Spells:\n\n|Teleport:| Reduces cast time by # second\n|Revive:| Grants bonus Health on Revive for 2 minutes\n|Flash:| Reduces cooldown by 15 seconds\n|Clarity:| Increases Mana restored by 25%\n|Clairvoyance:| Grants additional vision of enemy units revealed",
            rankInfo: [0.5],
        },
        {
            index: 2,
            name: "Wanderer",
            icon: "712",
            ranks: 3,
            desc: "Grants +#% increased Movement Speed when out of combat",
            rankInfo: [0.66, 1.33, 2],
        },
        {
            index: 3,
            name: "Meditation",
            icon: "713",
            ranks: 3,
            desc: "+# Mana Regen per 5 seconds",
            rankInfo: [1, 2, 3],
        },
        {
            index: 4,
            name: "Improved Recall",
            icon: "714",
            ranks: 1,
            desc: "Reduces the cast time of Recall by 1 second and Enhanced Recall by # seconds",
            rankInfo: [0.5],
        },
        {
            index: 5,
            name: "Scout",
            icon: "721",
            ranks: 1,
            desc: "Wards gain 25% increased vision range for the first 3 seconds after placing them",
            rankInfo: [],
        },
        {
            index: 6,
            name: "Mastermind",
            icon: "722",
            ranks: 3,
            desc: "Reduces the cooldown of Summoner Spells by #%",
            rankInfo: [4, 7, 10],
        },
        {
            index: 7,
            name: "Expanded Mind",
            icon: "723",
            ranks: 3,
            perlevel: 1,
            desc: "+# mana per level (+# at level 18)",
            rankInfo: [4, 7, 10],
        },
        {
            index: 8,
            name: "Artificer",
            icon: "724",
            ranks: 2,
            desc: "Reduces the cooldown of activated items by #%",
            rankInfo: [7.5, 15],
        },
        {
            index: 9,
            name: "Greed",
            icon: "731",
            ranks: 4,
            desc: "Grants an additional +# gold every 10 seconds",
            rankInfo: [0.5, 1, 1.5, 2],
        },
        {
            index: 10,
            name: "Runic Affinity",
            icon: "732",
            ranks: 1,
            desc: "Increases the duration of shrine, relic, quest, and neutral monster buffs by 20%",
            rankInfo: [],
        },
        {
            index: 11,
            name: "Vampirism",
            icon: "733",
            ranks: 3,
            desc: "+#% Lifesteal and Spell Vamp",
            rankInfo: [1, 2, 3],
        },
        {
            index: 12,
            name: "Biscuiteer",
            icon: "734",
            ranks: 1,
            desc: "Start the game with a regenerative biscuit that restores 80 Health and 50 Mana over 10 seconds",
            rankInfo: [],
        },
        {
            index: 13,
            name: "Wealth",
            icon: "741",
            parent: 8,
            ranks: 2,
            desc: "Increases starting gold by #",
            rankInfo: [25, 50],
        },
        {
            index: 14,
            name: "Awareness",
            icon: "742",
            ranks: 4,
            desc: "Increases Experience earned by #%",
            rankInfo: [1.25, 2.5, 3.75, 5],
        },
        {
            index: 15,
            name: "Strength of Spirit",
            icon: "743",
            ranks: 3,
            desc: "Up to +# Health Regen per 5 seconds for each 400 Mana you possess",
            rankInfo: [1, 2, 3],
        },
        {
            index: 16,
            name: "Explorer",
            icon: "744",
            parent: 11,
            ranks: 1,
            desc: "On Summoners Rift, grants a Ward at the start of the game that can be placed to reveal the surrounding area for 60 seconds. On all other maps, grants 25 starting gold.",
            rankInfo: [],
        },
        {
            index: 17,
            name: "Pickpocket",
            icon: "751",
            ranks: 1,
            desc: "Grants 5 gold for melee champions and 3 gold for ranged champions each time you perform a basic attack against an enemy champion (5 second cooldown)",
            rankInfo: [],
        },
        {
            index: 18,
            name: "Intelligence",
            icon: "752",
            ranks: 3,
            desc: "+#% Cooldown Reduction",
            rankInfo: [2, 4, 6],
        },
        {
            index: 22,
            name: "Nimble",
            icon: "762",
            ranks: 1,
            desc: "Grants 3% increased Movement Speed",
            rankInfo: [],
        },
    ]
];

// Versioned registry. Each entry is a season/patch snapshot of the mastery
// trees. The Season + Patch dropdowns iterate this list, and the calculator
// reads from whichever entry is active.
//
// Ordering: newest first within a season, newest season first. This makes the
// most-recent snapshot the default.
// Classic (S1-S5) sets:
//   iconBase  folder of vendored icons; each mastery's `icon` names the file
//             (<iconBase><icon>.png, locked art <iconBase>gray_<icon>.png).
//             S3-S5 = Data Dragon (ids, Riot's own gray_ files); S1 / S2 =
//             the official wiki's 2011 / 2012 client icons (gray = Rec.601
//             luma, Riot's gray_ formula).
//   look      in-client tree art + geometry (calculator.js CLASSIC_LOOKS):
//             "s1" = the 2010 client, "client" = the 2012-2015 client.
//   ddragonVersion  metadata only for classic sets (no runtime fetch).
var masteryDataSets = [
    // ---- Season 7 (final pre-Runes-Reforged keystone snapshot) ----------
    // V7.21 (Oct 25 2017) was the last patch on the Ferocity / Cunning /
    // Resolve keystone tree before V7.22 deleted masteries and shipped
    // Runes Reforged. 30 points total; each tree caps at 18 (5+1+5+1+5+1).
    {
        id: "s7-final",
        season: 7,
        seasonLabel: "Season 7",
        patch: "V7.21",
        patchLabel: "V7.21 (Final pre-Reforged — Keystone)",
        system: "keystone",
        maxPoints: 30,
        data: season7KeystoneData,
        ddragonVersion: "7.21.1",
    },

    // ---- Season 7 preseason (V6.22 "Assassins" update) -------------------
    // Mid-era keystone snapshot: Courage of the Colossus replaced Strength
    // of the Ages, Precision converted to Lethality, Fresh Blood / Battle
    // Trance / Greenfather's Gift / Siegemaster / Fearless added, Oppressor
    // removed. Warlord's is in its missing-health life-steal form.
    {
        id: "s7-preseason",
        season: 7,
        seasonLabel: "Season 7",
        patch: "V6.22",
        patchLabel: "V6.22 (Preseason 7 — Keystone)",
        system: "keystone",
        maxPoints: 30,
        data: preseason7KeystoneData,
        ddragonVersion: "6.22.1",
    },

    // ---- Season 6 (Preseason 6 keystone rework) -------------------------
    // V5.22 (Nov 11 2015) replaced the 30-point Offense/Defense/Utility
    // tree with the 18-point Ferocity / Cunning / Resolve keystone system.
    // This entry uses `system: "keystone"` so the calculator switches to
    // the keystone-calculator.js render path instead of the classic one.
    {
        id: "s6-launch",
        season: 6,
        seasonLabel: "Season 6",
        patch: "V5.22",
        patchLabel: "V5.22 (Preseason 6 — Keystone)",
        system: "keystone",
        maxPoints: 30,
        data: season6KeystoneData,
        ddragonVersion: "5.22.3",
    },

    // ---- Season 5 -------------------------------------------------------
    {
        id: "s5-final",
        season: 5,
        seasonLabel: "Season 5",
        patch: "V5.21",
        patchLabel: "V5.21 (Late Season 5)",
        system: "classic",
        maxPoints: 30,
        data: season5FinalData,
        iconBase: "images/masteries/5.21.1/",
        look: "client",
        ddragonVersion: "5.21.1",
    },
    // ---- Season 4 -------------------------------------------------------
    {
        id: "s4-final",
        season: 4,
        seasonLabel: "Season 4",
        patch: "V4.20",
        patchLabel: "V4.20 (Late Season 4)",
        maxPoints: 30,
        data: season4FinalData,
        iconBase: "images/masteries/4.20.2/",
        look: "client",
        ddragonVersion: "4.20.2",
    },
    // ---- Season 3 -------------------------------------------------------
    {
        id: "s3-pbe",
        season: 3,
        seasonLabel: "Season 3",
        patch: "V1.0.0.152",
        patchLabel: "V1.0.0.152 (Preseason 3)",
        maxPoints: 30,
        data: season3CurrentData,
        iconBase: "images/masteries/3.6.14/",
        look: "client",
        ddragonVersion: "3.6.14",
    },
    // ---- Season 2 -------------------------------------------------------
    {
        id: "s2-ahri",
        season: 2,
        seasonLabel: "Season 2",
        patch: "V1.0.0.131",
        patchLabel: "V1.0.0.131 (Ahri patch)",
        maxPoints: 30,
        data: season2AhriPatchData,
        iconBase: "images/masteries/s2/",
        look: "client",
    },
    // ---- Season 1 -------------------------------------------------------
    {
        id: "s1-final",
        season: 1,
        seasonLabel: "Season 1",
        patch: "V1.0.0.130",
        patchLabel: "V1.0.0.130 (Late Season 1)",
        maxPoints: 30,
        data: season1Data,
        iconBase: "images/masteries/s1/",
        look: "s1",
    },
];

var DEFAULT_DATA_SET_ID = "s3-pbe";

function getDataSet(id) {
    for (var i = 0; i < masteryDataSets.length; i++)
        if (masteryDataSets[i].id === id) return masteryDataSets[i];
    return null;
}

// `data` is what calculator.js reads from. It points at the active set's
// `data` array. switchDataSet() in calculator.js reassigns this.
var data = getDataSet(DEFAULT_DATA_SET_ID).data;
