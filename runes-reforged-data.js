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

// The shard icons were redrawn twice, so each era loads its own set,
// vendored from CommunityDragon's statmods folder of that branch:
//   "2018"   V8.23-V12.19  axe-with-speed-lines attack speed, pink magic resist
//   "2022"   V12.20-V15.x  cyan magic resist (statmodsmagicresicon.magicresist_fix,
//                          12.20+); move speed / health / tenacity as of 14.19
//   "latest" V15.24+       sword attack speed and the re-drawn set
// (Attack speed: 8.23 through 15.12 share the axe; 15.24 has the sword.)
var REFORGED_SHARD_ICON_DIR = "images/runes-reforged/statmods/";
function getReforgedShardIconUrl(dataSet, icon) {
    var p = String(dataSet && dataSet.ddragonVersion || "").split(".");
    var major = parseInt(p[0], 10) || 99, minor = parseInt(p[1], 10) || 0;
    var set = (major < 12 || (major === 12 && minor < 20)) ? "2018"
        : (major < 15 || (major === 15 && minor < 24)) ? "2022" : "latest";
    return REFORGED_SHARD_ICON_DIR + set + "/" + icon;
}

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

// Resolved rune texts. Data Dragon's runesReforged.json leaves some
// @Variable@ placeholders unfilled (V7.22: 58 of 60 runes; later patches
// one to three). The client's own game data for the same branch
// (CommunityDragon <branch>/plugins/rcp-be-lol-game-data/global/default/
// v1/perks.json) has the numbers filled in. Per dataset id:
// { runeId: [shortDesc, longDesc] }, null = keep the DDragon text.
// Unsealed Spellbook (8360) from V25.x: DDragon and perks.json both carry
// @f3@ (the swap cooldown the game script fills in). The value is the
// perk's ShardRechargeMinutes in CommunityDragon <branch>/game/
// perks.cdtb.bin.json: 4.5 min = 270 s in 15.24 and 16.13 (5.0 in 14.19,
// where DDragon still printed "5 mins").
var REFORGED_PERK_TEXT = {
    "rr-v7-22": {
        8112: ["Hitting a champion with 3 <b>separate</b> attacks or abilities in 3s deals bonus <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_AdaptiveDmg\">adaptive damage</lol-uikit-tooltipped-keyword>.", "Hitting a champion with 3 <b>separate</b> attacks or abilities within 3s deals bonus <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>adaptive damage</font></lol-uikit-tooltipped-keyword>.<br><br>Damage: 50 - 220 (+0.50 bonus AD, +0.3 AP) damage.<br><br>Cooldown: 50 - 25s<br><br><hr></hr><i>'We called them the Thunderlords, for to speak of their lightning was to invite disaster.'</i>"],
        8124: ["Add an active effect to your boots that grants a large boost of <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_MS\">MS</lol-uikit-tooltipped-keyword> and causes your next attack or ability to deal bonus <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_AdaptiveDmg\">adaptive damage</lol-uikit-tooltipped-keyword>.", "Enchants your boots with the active effect '<font color='#c60300'>Predator</font>.'<br><br>Channel for 1.5s out of combat to gain 45% movement speed for 15s. Damaging attacks or abilities end this effect, dealing 60 - 140 (+<scaleAD>0.4</scaleAD> bonus AD)(+<scaleAP>0.25</scaleAP> AP) bonus <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>adaptive damage</font></lol-uikit-tooltipped-keyword>.<br><br>Cooldown: 180s - 120s. Starts the game on cooldown and goes on cooldown if interrupted while channeling."],
        8128: ["Champions, large minions, and large monsters drop soul essence on death. Touch souls to absorb them and deal bonus <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_AdaptiveDmg\">adaptive damage</lol-uikit-tooltipped-keyword> on your next attack based on total soul essence collected.", "Champions, large minions, and large monsters drop soul essence on death. Collect souls to become <font color='#c60300'>Soul Charged</font>. Your next attack on a champion or structure consumes <font color='#c60300'>Soul Charged</font> to deal bonus <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>adaptive damage</font></lol-uikit-tooltipped-keyword>.<br><br><font color='#c60300'>Soul Charged</font> lasts 20s, increased to 300s after collecting 150 soul essence.<br><br>Bonus damage: 40 - 80 (+<scaleAD>0.25 bonus AD</scaleAD>) (+<scaleAP>0.2 AP</scaleAP>) + soul essence collected.<br><rules><br>Champions - 6 soul essence.<br>Monsters - 2 soul essence.<br>Minions - 4 soul essence.</rules>"],
        8126: ["Deal bonus true damage to enemies with <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_ImpairAct\">impaired movement or actions</lol-uikit-tooltipped-keyword>.", "Damaging champions with <b>impaired movement or actions</b> deals 12 - 30 bonus true damage (based on level).<br><br>Cooldown: 4s<br><rules>Activates on damage occurring after the impairment.</rules>"],
        8139: ["Heal when you damage an enemy champion.", "Heal when you damage an enemy champion.<br><br>Healing: 18-35 (+0.20 bonus AD, +0.1 AP) health (based on level)<br><br>Cooldown: 20s"],
        8143: ["Gain a burst of Lethality and Magic Penetration after using a dash, leap, blink, teleport, or when leaving stealth.", "After exiting stealth or using a dash, leap, blink, or teleport, dealing any damage to a champion grants you 10 Lethality and 8 Magic Penetration for 5s.<br><br>Cooldown: 4s"],
        8136: ["After killing a ward, a friendly Zombie Ward is raised in its place. When your wards expire, they also reanimate as Zombie Wards.", "After killing a ward, a friendly Zombie Ward is raised in its place. Additionally, when your wards expire, they reanimate as Zombie Wards.<br><br>Zombie Wards are visible, last for 180s and don't count towards your ward limit."],
        8120: ["When you enter brush, a poro appears. It will stay behind to give you vision.", "Enter a brush to summon a poro after a brief channel. The poro will stay behind to give you vision until you summon a new one.<br><br>If an enemy enters brush with a poro in it, they scare it away, putting Ghost Poro on a 3s cooldown.<br><br>Poro channel is interrupted if you enter combat with a champion."],
        8138: ["Collect eyeballs for champion and ward <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">takedowns</lol-uikit-tooltipped-keyword>. Gain permanent AD or AP, <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Adaptive\">adaptive</lol-uikit-tooltipped-keyword> for each eyeball plus bonus upon collection completion.", "Collect eyeballs for champion and ward takedowns. Gain an <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> bonus of 0.6 Attack Damage or 1 Ability Power, per eyeball collected. <br><br>Upon completing your collection at 20 eyeballs, additionally gain an <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> bonus of 6 attack damage, or 10 ability power.<br><br>Collect 2 eyeballs per champion takedown, 1 eyeball per ward takedown."],
        8135: ["<b>Unique</b> <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">takedowns</lol-uikit-tooltipped-keyword> grant permanent healing from ability damage.", "Heal for a percentage of the damage dealt by your abilities.<br>Healing: 2.5% + 2.5% per <i>Bounty Hunter</i> stack. <br><br>Earn a <i>Bounty Hunter</i> stack the first time you get a takedown on each enemy champion.<br><rules><br>Healing reduced to one third for Area of Effect abilities.</rules><br>"],
        8134: ["<b>Unique</b> <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">takedowns</lol-uikit-tooltipped-keyword> grant permanent Active Item <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_CDR\">CDR</lol-uikit-tooltipped-keyword> (includes Trinkets).", "Gain 10% <b>Active Item CDR</b> plus an additional 6% per <i>Bounty Hunter</i> stack (includes Trinkets).<br><br>Earn a <i>Bounty Hunter</i> stack the first time you get a takedown on each enemy champion."],
        8105: ["<b>Unique</b> champion <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">takedowns</lol-uikit-tooltipped-keyword> grant permanent <b>out of combat <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_MS\">MS</lol-uikit-tooltipped-keyword></b>.", "Gain 8 <b>out of combat Movement Speed</b> plus 8 per <i>Bounty Hunter</i> stack.<br><br>Earn a <i>Bounty Hunter</i> stack the first time you get a takedown on each enemy champion."],
        8326: ["Get Summoner Shards and exchange them at the shop to change your Summoner Spells during game. Your Summoner Spells have reduced cooldown. <br>", "Gain a Summoner Shard at 2 min and another every 6 min after (Max 2 shards).<br><br>While near the shop, you can exchange 1 Summoner Shard to replace a Summoner Spell with a different one. <br><br>Additionally, your Summoner Spell Cooldowns are reduced by 25%.<br><br><rules><i>Smite:</i> Buying Smite won't grant access to Smite items<br>You cannot have two of the same Summoner Spell</rules>"],
        8351: ["Your first attack against an enemy champion slows them (per unit cooldown). Slowing champions with active items shoots a freeze ray at them, creating a lingering slow zone.", "Basic attacking a champion slows them for 2s. The slow increases in strength over its duration.<li><i>Ranged</i>: Ranged attacks slow by up to 20% - 40%</li> <li><i>Melee</i>: Melee attacks slow by up to 40% - 50%</li><br>Slowing a champion with active items shoots a freeze ray through them, freezing the nearby ground for 5s, slowing all units inside by 50%.<br><br>Cooldown: 7-4s per unit"],
        8359: ["Your first attack after using an ability grants gold and sometimes consumables.", "After using an ability, your next attack on a champion grants bonus gold. There's a chance you'll also gain a consumable."],
        8306: ["While Flash is on cooldown it is replaced by <i>Hexflash</i>.<br><br><i>Hexflash</i>: Channel, then blink to a new location.", "While Flash is on cooldown it is replaced by <i>Hexflash</i>.<br><br><i>Hexflash</i>: Channel for 2s to blink to a new location.<br><br>Cooldown: 20s. Goes on a 10s cooldown when you enter champion combat."],
        8345: ["Gain a free Biscuit every 3 min, until 12 min. Biscuits restore health and mana. Consuming a Biscuit permanently increases your max mana.", "Biscuit Delivery: Gain a Total Biscuit of Everlasting Will every 3 mins, until 12 min.<br><br>Biscuits restore 15% of your missing health and mana. Consuming any Biscuit increases your mana cap by 40 mana permanently. <br><br><i>Manaless:</i> Champions without mana restore 20% missing health instead."],
        8313: ["Gain a free Stopwatch. Stopwatch has a one time use <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Stasis\">Stasis</lol-uikit-tooltipped-keyword> effect.", "Start the game with a Commencing Stopwatch that transforms into a Stopwatch after 6 min. Stopwatch has a one time use Stasis effect.<br><br>Reduces the cooldown of Zhonya's Hourglass, Guardian Angel, and Gargoyle Stoneplate by 15%."],
        8304: ["You get free boots at 10 min but you cannot buy boots before then. Each <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">takedown</lol-uikit-tooltipped-keyword> you get makes your boots come 30s sooner.", "You get free Slightly Magical Boots at 10 min, but you cannot buy boots before then. For each takedown you acquire the boots 30s sooner.<br><br>Slightly Magical Boots give you an additional +10 Movement Speed and upgrade for 50 gold less."],
        8321: ["You can enter debt to buy items.", "You can enter debt to buy items. The amount you can borrow increases over time.<br><br>Lending Fee: 50 gold<br>Debt limit: 150 + 5/min<br>(Debt doesn't become available until 2 minutes)"],
        8316: ["Start the game with 6 Minion Dematerializers. Killing minions with the item gives permanent bonus damage vs. that minion type.", "Start the game with 6 Minion Dematerializers that kill and absorb lane minions instantly. Minion Dematerializers are on cooldown for the first 155s of the game.<br><br>Absorbing a minion increases your damage by +4% against that type of minion permanently, and an extra +1% for each additional minion of that type absorbed.<br>"],
        8347: ["+5% <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_CDR\">CDR</lol-uikit-tooltipped-keyword><br>+5% Max CDR<br>+5% Summoner Spell CDR<br>+5% Item CDR", "+5% CDR<br>+5% Max CDR<br>+5% Summoner Spell CDR<br>+5% Item CDR"],
        8410: ["Bonus <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_MS\">MS</lol-uikit-tooltipped-keyword> towards nearby ally champions that are <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_ImpairMov\">movement impaired</lol-uikit-tooltipped-keyword> or enemy champions that you impair.", "Gain 10% Movement Speed towards nearby ally champions that are movement impaired or enemy champions that you impair. <br><br>Range: 1000"],
        8339: ["+ 100 Health permanently<br>- 10% damage to champions and monster until 10 min", "+ 100 Health permanently<br>- 10% damage to champions and monster until 10 min<br><br><hr></hr><br><i>'The greatest legends live on in the stars.' <br>—Daphna the Dreamer</i>"],
        8005: ["Hitting an enemy champion 3 consecutive times makes them vunerable, dealing bonus damage and causing them to take more damage from all sources for 6s.", "Hitting an enemy champion with 3 consecutive basic attacks deals 30 - 120 bonus <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>adaptive damage</font></lol-uikit-tooltipped-keyword> (based on level) and makes them vulnerable, increasing the damage they take by 12% from all sources for 6s."],
        8008: ["1.5s after damaging a champion gain a large amount of attack speed. Lethal Tempo allows you to temporarily exceed the attack speed limit.", "1.5s after damaging a champion gain 30 - 80% Attack Speed (based on level) for 3s. Attacking a champion extends the effect to 6s.<br><br>Cooldown: 10s<br><br>Lethal Tempo allows you to temporarily exceed the attack speed limit."],
        8021: ["Attacking and moving builds Energy stacks. At 100 stacks, your next attack heals you and grants increased <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_MS\">MS</lol-uikit-tooltipped-keyword>.", "Attacking and moving builds Energy stacks. At 100 stacks, your next attack is Energized.<br><br>Energized attacks heal you for 5 - 50 (+0.10 Bonus AD, +0.20 AP) and grant +30% Movement Speed for 1s.<br><rules>Healing is 60% as effective when used on a minion.</rules>"],
        9101: ["Excess healing on you becomes a shield.", "Excess healing on you becomes a shield, for up to 10% of your total health + 10.<br><br>Shield is built up from 30% of excess self-healing, or 300% of excess healing from allies."],
        9111: ["<lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">Takedowns</lol-uikit-tooltipped-keyword> restore 15% of your missing health and grant an additional 25 gold.", "Takedowns restore 15% of your missing health and grant an additional 25 gold. <br><br><hr></hr><br><i>'The most dangerous game brings the greatest glory.' <br>—Noxian Reckoner</i>"],
        8009: ["For 5s after gaining a level or takedown any mana you spend is fully restored.", "For 5s after gaining a level or takedown any mana you spend is fully restored."],
        9104: ["<lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">Takedowns</lol-uikit-tooltipped-keyword> on enemies grant permanent <b>Attack Speed</b>.", "Gain 3% attack speed plus an additional 1.5% for every <i>Legend</i> stack (max 10 stacks).<br><br>Earn progress toward <i>Legend</i> stacks for every champion takedown, epic monster takedown, large monster kill, and minion kill."],
        9105: ["<lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">Takedowns</lol-uikit-tooltipped-keyword> on enemies grant permanent <b>Tenacity</b>.", "Gain 5% tenacity plus an additional 1.5% for every <i>Legend</i> stack (max 10 stacks).<br><br>Earn progress toward <i>Legend</i> stacks for every champion takedown, epic monster takedown, large monster kill, and minion kill."],
        9103: ["<lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Takedown\">Takedowns</lol-uikit-tooltipped-keyword> on enemies grant permanent<b> Lifesteal</b>.", "Gain 0.8% life steal for every <i>Legend</i> stack (max 10 stacks).<br><br>Earn progress toward <i>Legend</i> stacks for every champion takedown, epic monster takedown, large monster kill, and minion kill."],
        8014: ["Deal more damage to low health enemy champions.", "Deal 10% more damage to champions who have less than 40% health.<br><br>Additionally, takedowns on champions grant an <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> bonus of 9 Attack Damage or 15 Ability Power for 10s."],
        8017: ["Deal more damage to champions with more maximum health than you.", "Deal 4% more damage to champions with 150 more max health than you, increasing to 10% at 2000 more max health."],
        8299: ["Deal more damage to champions while you are low on health.", "Deal 5%-12% increased damage to champions while you are below 60% health. Max damage gained at 30% health."],
        8437: ["Every 4s your next attack on a champion deals bonus magic damage, heals you, and permanently increases your health.", "Every 4s in combat, your next basic attack on a champion will: <li>Deal bonus magic damage equal to 4% of your max health</li><li>Heal you for 2% of your max health</li><li>Permanently increase your health by 5</li><br><rules><i>Ranged Champions:</i> Damage and healing are halved and gain 2 permanent health instead.</rules>"],
        8439: ["After <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Immobilize\">immobilizing</lol-uikit-tooltipped-keyword> an enemy champion gain defenses and later deal a burst of <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_AdaptiveDmg\">adaptive damage</lol-uikit-tooltipped-keyword> around you.", "After immobilizing an enemy champion, increase your Armor and Magic Resist by 20 + 30% for 2.5s. Then explode, dealing magic damage to nearby enemies.<br><br>Damage: 40 - 140 (+3.5% of your maximum health)<br>Cooldown: 20s"],
        8465: ["Guard allies you cast spells on and those that are very nearby. If you or a guarded ally would take damage, you're both hasted and granted a shield.", "<i>Guard</i> allies within 175 units of you, and allies you target with spells for 2.5s. While <i>Guarding</i>, if you or the ally take damage, both of you gain a shield and are hasted for 1.5s.<br><br>Cooldown: 45s<br>Shield: 60 - 150 +(<scaleAP>0.20 AP</scaleAP>) + (<scalehealth>+10% bonus health</scalehealth>).<br>Haste: +20% Movement Speed."],
        8242: ["After casting a Summoner Spell, gain Tenacity and Slow Resistance for a short duration. Additionally, gain Tenacity and Slow Resistance for each Summoner Spell on cooldown.", "After casting a Summoner Spell, gain 15% Tenacity and Slow Resistance for 10s. Additionally, gain 10% Tenacity and Slow Resistance for each Summoner Spell on cooldown."],
        8446: ["Charge up a powerful attack against a tower while near it.", "Charge up a powerful attack against a tower over 4s, while within 600 range of it. The charged attack deals 125 (+30% of your max health) bonus physical damage.<br><br>Cooldown: 45s"],
        8463: ["<lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_ImpairMov\">Impairing</lol-uikit-tooltipped-keyword> the movement of an enemy champion marks them. Your allies heal when attacking champions you've marked.", "Impairing the movement of an enemy champion marks them for 4s.<br><br>Ally champions who attack marked enemies heal for 5 + 1.0% of your max health over 2s."],
        8430: ["Gain +5 Armor. <br>Heals, including consumables, increase your Armor by 5% temporarily.", "Gain +5 Armor. <br><br>Heal effects from consumables, heals for at least 20 health and shields increase your Armor by 5% for 3s."],
        8435: ["Gain +5 Magic Resist. <br>Heals, including consumables, increase your Magic Resist by 5% temporarily.<br>", "Gain +5 Magic Resist. <br><br>Heal effects from consumables, heals for at least 20 health and shields increase your Magic Resist by 5% for 3s."],
        8429: ["After 10 min gain +8 Armor and +8 Magic Resist and increase your Armor and Magic Resist by 5%.", "After 10 min gain +8 Armor and +8 Magic Resist and increase your Armor and Magic Resist by 5%."],
        8451: ["Gain additional permanent max health when minions or monsters die near you.", "Permanently gain 0.2% maximum health for every 8 monsters or enemy minions that die near you."],
        8453: ["Heals and shields are 5% stronger and increased by an additional 10% on low health targets.", "Heals and shields are 5% stronger and increased by an additional 10% on targets below 40% health."],
        8444: ["After taking damage from an enemy champion heal back some of your missing health over time.", "After taking damage from an enemy champion, heal for 4% of your missing health +6 over 10s."],
        8214: ["Your attacks and abilities send Aery to a target, damaging enemies or shielding allies.", "Your attacks and abilities send Aery to a target, damaging enemies or shielding allies.<br><br>Damage: 20 - 60 based on level (+<scaleAP>0.10 AP</scaleAP> and +<scaleAD>0.15 bonus AD</scaleAD>)<br>Shield: 30 - 80 based on level (+<scaleAP>0.25 AP</scaleAP> and +<scaleAD>0.40 bonus AD</scaleAD>) <br><br>Aery cannot be sent out again until she returns to you."],
        8229: ["Damaging a champion with an ability hurls a damaging comet at their location, or, if Arcane Comet is on cooldown, reduces its remaining cooldown.", "Damaging a champion with an ability hurls a comet at their location, or, if Arcane Comet is on cooldown, reduces its remaining cooldown.<br><br><lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>Adaptive Damage</font></lol-uikit-tooltipped-keyword>: 30 - 100 based on level (<scaleAP>+0.20 AP</scaleAP> and <scaleAD>+0.35 bonus AD</scaleAD>)<br>Cooldown: 20 - 8s<br><rules><br>Cooldown Reduction:<br>Single Target: 20%.<br>Area of Effect: 10%.<br>Damage over Time: 5%.<br></rules>"],
        8230: ["Hitting an enemy champion with 3 <b>separate</b> attacks or abilities grants a burst of <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_MS\">MS</lol-uikit-tooltipped-keyword>.", "Hitting an enemy champion with 3 attacks or <b>separate</b> abilities within 3s grants 15 - 40% Movement Speed based on level.<br><br>Duration: 3s<br>Cooldown: 15s<br><i>Melee:</i> Additionally, gain 75% Slow Resistance for the duration."],
        8224: ["Gain a magic damage shield when taken to low health by magic damage.", "When you take magic damage that would reduce your Health below 30%, gain a shield that absorbs 40 - 120 magic damage based on level (<scaleAP>+0.10 AP</scaleAP> and <scaleAD>+0.15 bonus AD</scaleAD>) for 4s.<br><br>Cooldown: 60s"],
        8226: ["Periodically your next ability used has its mana or energy cost refunded and restores some of your missing mana or energy.", "Every 60s, your next ability used has its mana or energy cost refunded, and restores 8% of your missing mana or energy."],
        8243: ["Your ultimate's cooldown is reduced. Each time you cast your ultimate, its cooldown is further reduced.", "Your ultimate's cooldown is reduced by 5%. Each time you cast your ultimate, its cooldown is further reduced by 2%. Stacks up to 5 times."],
        8210: ["Gain 10% <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_CDR\">CDR</lol-uikit-tooltipped-keyword> when you reach level 10. Excess CDR becomes AP or AD, <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Adaptive\">adaptive</lol-uikit-tooltipped-keyword>.", "Gain 10% CDR when you reach level 10.<br><br>Each percent of CDR exceeding the CDR limit is converted to an <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> bonus of 1.2 Attack Damage or 2 Ability Power."],
        8234: ["Gain 4% extra <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_MS\">MS</lol-uikit-tooltipped-keyword>. Gain extra AP or AD, <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Adaptive\">adaptive</lol-uikit-tooltipped-keyword> based on your bonus MS.", "Gain 4% increased Movement Speed and add 8% of your Bonus Movement Speed to your AP or AD, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> (based on level)."],
        8233: ["While above 70% health, gain extra <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_AdaptiveDmg\">adaptive damage</lol-uikit-tooltipped-keyword>.", "While above 70% health, gain an <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> bonus of up to 24 attack damage or 40 ability power (based on level)."],
        8237: ["Your first ability hit every 20s burns champions.", "Your next ability hit sets champions on fire dealing 30 - 60 bonus magic damage based on level after 1s.<br><br>Cooldown: 20s"],
        8232: ["Gain <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_MS\">MS</lol-uikit-tooltipped-keyword> and AP or AD, <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Adaptive\">adaptive</lol-uikit-tooltipped-keyword> in the river.", "Gain 25 Movement Speed and an <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> bonus of up to 18 attack damage or 30 ability power (based on level) when in the river.<br><br><hr></hr><br><i>May you be as swift as the rushing river and agile as a startled Rift Scuttler.</i><br>"],
        8236: ["Gain increasing amounts of AD or AP, <lol-uikit-tooltipped-keyword key=\"LinkTooltip_Description_Adaptive\">adaptive</lol-uikit-tooltipped-keyword> over the course of the game.", "Every 10 min gain AP or AD, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>.<br><br><i>10 min</i>: + 8 AP or 5 AD <br><i>20 min</i>: + 24 AP or 14 AD<br><i>30 min</i>: + 48 AP or 29 AD<br><i>40 min</i>: + 80 AP or 48 AD<br><i>50 min</i>: + 120 AP or 72 AD<br><i>60 min</i>: + 168 AP or 101 AD<br>etc..."]
    },
    "rr-v10-23": { 8009: [null, "Damaging an enemy champion increases your mana regeneration by 1.5-11 (80% for ranged) mana per second for 4 seconds. All energy users gain 1.5 energy per second, instead.<br><br>Takedowns restore 15% of your maximum mana or energy."] },
    "rr-v11-23": { 8009: [null, "Damaging an enemy champion increases your mana regeneration by 1.5-11 (80% for ranged) mana per second for 4 seconds. All energy users gain 1.5 energy per second, instead.<br><br>Takedowns restore 15% of your maximum mana or energy."] },
    "rr-v12-23": { 8009: [null, "Damaging an enemy champion increases your mana regeneration by 1.5-11 (80% for ranged) mana per second for 4 seconds. All energy users gain 1.5 energy per second, instead.<br><br>Takedowns restore 15% of your maximum mana or energy."] },
    "rr-v13-24": { 8009: [null, "Damaging an enemy champion increases your mana regeneration by 1.5-11 (80% for ranged) mana per second for 4 seconds. All energy users gain 1.5 energy per second, instead.<br><br>Takedowns restore 15% of your maximum mana or energy."] },
    "rr-v14-19": { 9101: [null, "Killing a target restores 1 - 23 Health based on level."], 8463: [null, "Impairing the movement of an enemy champion restores Health to you and the lowest health nearby allied champion.<br><br>70% effect for Ranged Users.<br><br>Cooldown: 20s"] },
    "rr-v25-24": { 9101: [null, "Killing a target restores 1 - 23 Health based on level."], 8463: [null, "Impairing the movement of an enemy champion restores Health to you and the lowest health nearby allied champion.<br><br>70% effect for Ranged Users.<br><br>Cooldown: 20s"], 8360: [null, "Swap one of your equipped Summoner Spells to a new, single use Summoner Spell. Each unique Summoner Spell you swap to permanently decreases your swap cooldown by 25s (initial swap cooldown is 270 seconds). <br><br>Your first swap becomes available at 6 mins. <br><rules><br>Summoner Spells can only be swapped while out of combat. <br>After using a swapped Summoner Spell you must swap 3 more times before the first can be selected again.<br>Smite damage increases after two Summoner Spell swaps. </rules>"] },
    "rr-v26-13": { 9101: [null, "Killing a target restores 1 - 23 Health based on level."], 8463: [null, "Impairing the movement of an enemy champion restores Health to you and the lowest health nearby allied champion.<br><br>70% effect for Ranged Users.<br><br>Cooldown: 20s"], 8360: [null, "Swap one of your equipped Summoner Spells to a new, single use Summoner Spell. Each unique Summoner Spell you swap to permanently decreases your swap cooldown by 25s (initial swap cooldown is 270 seconds). <br><br>Your first swap becomes available at 6 mins. <br><rules><br>Summoner Spells can only be swapped while out of combat. <br>After using a swapped Summoner Spell you must swap 3 more times before the first can be selected again.<br>Smite damage increases after two Summoner Spell swaps. </rules>"] }
};

// V7.22-V8.22 path-pair set bonus, shown under the secondary path (list
// mode) and in the secondary path tooltips. The client reads
// primaryStyle.subStyleBonus[styleId = secondary] -> perks[perkId].longDesc
// (rcp-fe-lol-perks 7.22 bundle.js; 7.22 perkstyles.json + perks.json).
// Per dataset id: { primaryId: { secondaryId: longDesc } }.
var REFORGED_SUBSTYLE_BONUS = {
    "rr-v7-22": {
        8000: { 8100: "+18% Attack Speed", 8200: "+18% Attack Speed", 8400: "+18% Attack Speed", 8300: "+18% Attack Speed" },
        8100: { 8000: "+11 attack damage or +18 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8200: "+11 attack damage or +18 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8400: "+11 attack damage or +18 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8300: "+11 attack damage or +18 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>" },
        8200: { 8000: "+15 attack damage or +25 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8100: "+15 attack damage or +25 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8400: "+15 attack damage or +25 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8300: "+15 attack damage or +25 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>" },
        8400: { 8000: "+130 Health", 8100: "+130 Health", 8200: "+130 Health", 8300: "+130 Health" },
        8300: { 8000: "+20% Potion and Elixir Duration<br>+20% Attack Speed", 8100: "+20% Potion and Elixir Duration<br>+16 attack damage or +27 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8200: "+20% Potion and Elixir Duration<br>+16 attack damage or +27 ability power, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>", 8400: "+20% Potion and Elixir Duration<br>+145 Health" }
    }
};
