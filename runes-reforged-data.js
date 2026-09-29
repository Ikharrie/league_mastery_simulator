// Runes Reforged dataset registry. Each entry pairs a (season, patch) label
// with a Riot Data Dragon version. At runtime the page fetches
// `https://ddragon.leagueoflegends.com/cdn/{ddragonVersion}/data/en_US/runesReforged.json`
// and renders the picker from the returned catalog.
//
// Coverage:
//   - V7.22 (Nov 08 2017) — Preseason 8 launch of Runes Reforged. Initial
//     keystones: Press the Attack, Lethal Tempo, Fleet Footwork, Conqueror
//     was NOT yet added (V8.10). Stat shards were NOT present (added V8.23).
//   - V8.23 (Nov 21 2018) — stat shards added; Conqueror present.
//   - V9.23 (Nov 21 2019) — Season 10 preseason.
//   - V10.23 (Nov 11 2020) — Season 11; CDR shard became +8 Ability Haste.
//   - V11.23 (Nov 17 2021) — First Strike + several Inspiration reworks.
//   - V12.23 (Nov 16 2022).
//   - V13.24 (Dec 06 2023).
//   - V14.19 (Sep 25 2024) — late Season 14, final state before Hextech
//     rune subsystem changes.
//
// Riot occasionally tweaks DDragon version numbers; the `ddragonVersion`
// field is the exact patch directory under `/cdn/` that we fetch from. The
// page falls back to the most-recent `versions.json` entry if a hardcoded
// version 404s.
//
// Sources:
//   - Riot Data Dragon — https://ddragon.leagueoflegends.com/
//   - LoL Wiki — https://wiki.leagueoflegends.com/en-us/Rune
//   - Fandom Wiki — https://leagueoflegends.fandom.com/wiki/Rune_(League_of_Legends)
//   - CommunityDragon (stat shard icons) — https://www.communitydragon.org/

// `shardEra` picks which stat-shard table applies (see reforgedShardEras):
//   null      — V7.22–V8.22: no stat shards existed
//   "initial" — V8.23–V10.22: scaling-CDR offense shard; Armor/MR flex and
//               defense rows; 15-140 scaling health
//   "haste"   — V10.23–V14.1: CDR shard became +8 Ability Haste (V10.23);
//               everything else unchanged
//   "modern"  — V14.2–V25.21: flex row gained Move Speed + scaling Health;
//               defense row became flat Health / Tenacity & Slow Resist /
//               scaling Health (V14.2 shard rework)
//   "latest"  — V25.22+: Move Speed up to 2.5%, Tenacity & Slow Resist up
//               to 15%, scaling Health up to 10-200
//
// NOTE on version numbers: Riot renamed live patches to year-based numbers
// in 2025 (25.x, then 26.x), but Data Dragon kept sequential majors — live
// patch 25.x maps to DDragon 15.x and live 26.x maps to DDragon 16.x.
var reforgedDataSets = [
    {
        id: "rr-v26-13",
        season: 2026,
        seasonLabel: "Season 2026",
        patch: "V26.13",
        patchLabel: "V26.13 (Current)",
        ddragonVersion: "16.13.1",
        shardEra: "latest",
    },
    {
        id: "rr-v25-24",
        season: 2025,
        seasonLabel: "Season 2025",
        patch: "V25.24",
        patchLabel: "V25.24 (Late Season 2025)",
        ddragonVersion: "15.24.1",
        shardEra: "latest",
    },
    {
        id: "rr-v14-19",
        season: 14,
        seasonLabel: "Season 14",
        patch: "V14.19",
        patchLabel: "V14.19 (Late Season 14)",
        ddragonVersion: "14.19.1",
        shardEra: "modern",
    },
    {
        id: "rr-v13-24",
        season: 13,
        seasonLabel: "Season 13",
        patch: "V13.24",
        patchLabel: "V13.24 (Late Season 13)",
        ddragonVersion: "13.24.1",
        shardEra: "haste",
    },
    {
        id: "rr-v12-23",
        season: 12,
        seasonLabel: "Season 12",
        patch: "V12.23",
        patchLabel: "V12.23 (Late Season 12)",
        ddragonVersion: "12.23.1",
        shardEra: "haste",
    },
    {
        id: "rr-v11-23",
        season: 11,
        seasonLabel: "Season 11",
        patch: "V11.23",
        patchLabel: "V11.23 (Preseason 12 — First Strike added)",
        ddragonVersion: "11.23.1",
        shardEra: "haste",
    },
    {
        id: "rr-v10-23",
        season: 10,
        seasonLabel: "Season 10",
        patch: "V10.23",
        patchLabel: "V10.23 (Preseason 11 — CDR shard became Ability Haste)",
        ddragonVersion: "10.23.1",
        shardEra: "haste",
    },
    {
        id: "rr-v9-23",
        season: 9,
        seasonLabel: "Season 9",
        patch: "V9.23",
        patchLabel: "V9.23 (Preseason 10)",
        ddragonVersion: "9.23.1",
        shardEra: "initial",
    },
    {
        id: "rr-v8-23",
        season: 8,
        seasonLabel: "Season 8",
        patch: "V8.23",
        patchLabel: "V8.23 (Preseason 9 — Stat shards added)",
        ddragonVersion: "8.23.1",
        shardEra: "initial",
    },
    {
        // Grouped under Season 8 so the season-led nav shows launch +
        // preseason-9 snapshots together in the patch dropdown.
        id: "rr-v7-22",
        season: 8,
        seasonLabel: "Season 8 (2018)",
        patch: "V7.22",
        patchLabel: "V7.22 (Preseason 8 — Runes Reforged launch)",
        ddragonVersion: "7.22.1",
        shardEra: null,
    },
];

var REFORGED_DEFAULT_DATA_SET_ID = "rr-v26-13";

// Stat shards weren't part of Data Dragon's runesReforged.json. Riot ships
// the icons via the LoL game data plugin (CommunityDragon mirrors them).
// Three rows of three picks, one pick per row — but the shard OPTIONS
// changed over time, so each era gets its own table:
//   V8.23  (introduction): Offense AF / AS / 1-10% scaling CDR;
//                          Flex AF / Armor / MR; Defense HP 15-140 / Armor / MR
//   V10.23 (haste):        scaling-CDR shard replaced by +8 Ability Haste
//   V14.2  (rework):       Flex AF / 2% MS / 10-180 HP;
//                          Defense 65 HP / 10% Tenacity & Slow Resist / 10-180 HP
// Sources: wiki.leagueoflegends.com/en-us/Rune (patch history V8.23, V10.23,
// V14.2 entries).
var REFORGED_SHARD_ICON_BASE = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/";

var reforgedShardEras = {
    initial: {
        rows: [
            { id: "offense", label: "Offense", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5005", name: "Attack Speed",       desc: "+10% Attack Speed",                  icon: "statmodsattackspeedicon.png" },
                { id: "5007", name: "Scaling CDR",        desc: "+1-10% CDR (lvl 1-18)",              icon: "statmodscdrscalingicon.png" },
            ]},
            { id: "flex", label: "Flex", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5002", name: "Armor",              desc: "+6 Armor",                           icon: "statmodsarmoricon.png" },
                { id: "5003", name: "Magic Resist",       desc: "+8 Magic Resist",                    icon: "statmodsmagicresicon.png" },
            ]},
            { id: "defense", label: "Defense", shards: [
                { id: "5001", name: "Scaling Health",     desc: "+15-140 Health (lvl 1-18)",          icon: "statmodshealthscalingicon.png" },
                { id: "5002", name: "Armor",              desc: "+6 Armor",                           icon: "statmodsarmoricon.png" },
                { id: "5003", name: "Magic Resist",       desc: "+8 Magic Resist",                    icon: "statmodsmagicresicon.png" },
            ]},
        ],
    },
    haste: {
        rows: [
            { id: "offense", label: "Offense", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5005", name: "Attack Speed",       desc: "+10% Attack Speed",                  icon: "statmodsattackspeedicon.png" },
                { id: "5007", name: "Ability Haste",      desc: "+8 Ability Haste",                   icon: "statmodscdrscalingicon.png" },
            ]},
            { id: "flex", label: "Flex", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5002", name: "Armor",              desc: "+6 Armor",                           icon: "statmodsarmoricon.png" },
                { id: "5003", name: "Magic Resist",       desc: "+8 Magic Resist",                    icon: "statmodsmagicresicon.png" },
            ]},
            { id: "defense", label: "Defense", shards: [
                { id: "5001", name: "Scaling Health",     desc: "+15-140 Health (lvl 1-18)",          icon: "statmodshealthscalingicon.png" },
                { id: "5002", name: "Armor",              desc: "+6 Armor",                           icon: "statmodsarmoricon.png" },
                { id: "5003", name: "Magic Resist",       desc: "+8 Magic Resist",                    icon: "statmodsmagicresicon.png" },
            ]},
        ],
    },
    modern: {
        rows: [
            { id: "offense", label: "Offense", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5005", name: "Attack Speed",       desc: "+10% Attack Speed",                  icon: "statmodsattackspeedicon.png" },
                { id: "5007", name: "Ability Haste",      desc: "+8 Ability Haste",                   icon: "statmodscdrscalingicon.png" },
            ]},
            { id: "flex", label: "Flex", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5010", name: "Movement Speed",     desc: "+2% Movement Speed",                 icon: "statmodsmovementspeedicon.png" },
                { id: "5001", name: "Scaling Health",     desc: "+10-180 Health (lvl 1-18)",          icon: "statmodshealthscalingicon.png" },
            ]},
            { id: "defense", label: "Defense", shards: [
                { id: "5011", name: "Health",             desc: "+65 Health",                         icon: "statmodshealthplusicon.png" },
                { id: "5013", name: "Tenacity & Slow Resist", desc: "+10% Tenacity and Slow Resist",  icon: "statmodstenacityicon.png" },
                { id: "5001", name: "Scaling Health",     desc: "+10-180 Health (lvl 1-18)",          icon: "statmodshealthscalingicon.png" },
            ]},
        ],
    },
    latest: {
        rows: [
            { id: "offense", label: "Offense", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5005", name: "Attack Speed",       desc: "+10% Attack Speed",                  icon: "statmodsattackspeedicon.png" },
                { id: "5007", name: "Ability Haste",      desc: "+8 Ability Haste",                   icon: "statmodscdrscalingicon.png" },
            ]},
            { id: "flex", label: "Flex", shards: [
                { id: "5008", name: "Adaptive Force",     desc: "+9 Adaptive Force (5.4 AD or 9 AP)", icon: "statmodsadaptiveforceicon.png" },
                { id: "5010", name: "Movement Speed",     desc: "+2.5% Movement Speed",               icon: "statmodsmovementspeedicon.png" },
                { id: "5001", name: "Scaling Health",     desc: "+10-200 Health (lvl 1-18)",          icon: "statmodshealthscalingicon.png" },
            ]},
            { id: "defense", label: "Defense", shards: [
                { id: "5011", name: "Health",             desc: "+65 Health",                         icon: "statmodshealthplusicon.png" },
                { id: "5013", name: "Tenacity & Slow Resist", desc: "+15% Tenacity and Slow Resist",  icon: "statmodstenacityicon.png" },
                { id: "5001", name: "Scaling Health",     desc: "+10-200 Health (lvl 1-18)",          icon: "statmodshealthscalingicon.png" },
            ]},
        ],
    },
};

function getReforgedShardRows(dataSet) {
    if (!dataSet || !dataSet.shardEra) return null;
    var era = reforgedShardEras[dataSet.shardEra];
    return era ? era.rows : null;
}

function getReforgedDataSet(id) {
    for (var i = 0; i < reforgedDataSets.length; i++) {
        if (reforgedDataSets[i].id === id) return reforgedDataSets[i];
    }
    return null;
}
