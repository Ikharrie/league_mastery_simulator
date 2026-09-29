// Regenerates runes-data.js from the local Data Dragon rune catalogs under
// data/. Run with:
//
//     node generate-runes-data.js
//
// The catalogs are the machine-readable source of truth for each pre-Reforged
// season we ship: names, tiers, stats, and icon filenames all come straight
// from Riot's data. The final pre-Reforged patch (V7.21) is generated first
// and stays the default; older seasons (V5.21, V4.20) follow. The only values
// not present in a rune's `stats` block are the Lethality amounts (Data Dragon
// never grew a lethality stat key), which we parse out of the description text
// on catalogs new enough to carry them (V6.22+). Older catalogs express
// physical penetration as flat armor penetration (rFlatArmorPenetrationMod),
// which we map to the "arpen" stat rather than lethality.

const fs = require("fs");
const path = require("path");

const OUTPUT = path.join(__dirname, "runes-data.js");

// Datasets to generate, in output order. The first entry is the default the
// calculator loads. Each `catalog` lives under data/ and is a raw Data Dragon
// rune.json for that patch; `ddragonVersion` is read from the catalog itself.
const DATASETS = [
    {
        catalog: "runes-V7.21.1.json",
        id: "preReforged-V7.21",
        season: 7,
        seasonLabel: "Season 7 (Pre-Reforged)",
        patch: "V7.21",
        patchLabel: "V7.21 (Final pre-Reforged)",
    },
    {
        catalog: "runes-V6.24.1.json",
        id: "preReforged-V6.24",
        season: 6,
        seasonLabel: "Season 6",
        patch: "V6.24",
        patchLabel: "V6.24 (Late Season 6)",
    },
    {
        catalog: "runes-V5.21.1.json",
        id: "preReforged-V5.21",
        season: 5,
        seasonLabel: "Season 5",
        patch: "V5.21",
        patchLabel: "V5.21 (Late Season 5)",
    },
    {
        catalog: "runes-V4.20.2.json",
        id: "preReforged-V4.20",
        season: 4,
        seasonLabel: "Season 4",
        patch: "V4.20",
        patchLabel: "V4.20 (Late Season 4)",
    },
    {
        catalog: "runes-V3.14.41.json",
        id: "preReforged-V3.14",
        season: 3,
        seasonLabel: "Season 3",
        patch: "V3.14",
        patchLabel: "V3.14 (Late Season 3)",
    },
];

const CATEGORY_BY_TYPE = {
    red: "mark",
    yellow: "seal",
    blue: "glyph",
    black: "quintessence",
};

// Data Dragon stat key → { key: app stat key, mult, perLevel }.
// Regen stats are stored per-1s in Data Dragon but the game (and this app)
// display per-5s. Percent stats are stored as fractions. Cooldown mods are
// negative fractions ("-0.0083" = 0.83% CDR); time-dead is a positive
// fraction meaning a reduction.
const STAT_MAP = {
    FlatPhysicalDamageMod:          { key: "ad" },
    FlatMagicDamageMod:             { key: "ap" },
    PercentAttackSpeedMod:          { key: "as", mult: 100 },
    FlatCritChanceMod:              { key: "crit", mult: 100 },
    FlatCritDamageMod:              { key: "critDmg", mult: 100 },
    FlatArmorMod:                   { key: "armor" },
    FlatSpellBlockMod:              { key: "mr" },
    FlatHPPoolMod:                  { key: "hp" },
    FlatMPPoolMod:                  { key: "mp" },
    FlatHPRegenMod:                 { key: "hpRegen", mult: 5 },
    FlatMPRegenMod:                 { key: "mpRegen", mult: 5 },
    PercentMovementSpeedMod:        { key: "ms", mult: 100 },
    rPercentCooldownMod:            { key: "cdr", mult: -100 },
    rFlatMagicPenetrationMod:       { key: "mpen" },
    // Pre-V6.22 physical penetration was flat armor penetration (lethality did
    // not exist yet). Flat value → the "arpen" stat, mult 1 like magic pen.
    rFlatArmorPenetrationMod:       { key: "arpen" },
    PercentLifeStealMod:            { key: "ls", mult: 100 },
    PercentSpellVampMod:            { key: "sv", mult: 100 },
    rFlatGoldPer10Mod:              { key: "gold" },
    PercentEXPBonus:                { key: "xp", mult: 100 },
    FlatEnergyPoolMod:              { key: "energy" },
    FlatEnergyRegenMod:             { key: "energyRegen", mult: 5 },
    PercentHPPoolMod:               { key: "hpPercent", mult: 100 },
    rPercentTimeDeadMod:            { key: "timeDead", mult: -100 },

    rFlatPhysicalDamageModPerLevel: { key: "ad", perLevel: true },
    rFlatMagicDamageModPerLevel:    { key: "ap", perLevel: true },
    rFlatArmorModPerLevel:          { key: "armor", perLevel: true },
    rFlatSpellBlockModPerLevel:     { key: "mr", perLevel: true },
    rFlatHPModPerLevel:             { key: "hp", perLevel: true },
    rFlatMPModPerLevel:             { key: "mp", perLevel: true },
    rFlatHPRegenModPerLevel:        { key: "hpRegen", mult: 5, perLevel: true },
    rFlatMPRegenModPerLevel:        { key: "mpRegen", mult: 5, perLevel: true },
    rPercentCooldownModPerLevel:    { key: "cdr", mult: -100, perLevel: true },
    rFlatEnergyModPerLevel:         { key: "energy", perLevel: true },
    rFlatEnergyRegenModPerLevel:    { key: "energyRegen", mult: 5, perLevel: true },
};

// Event / promo runes (Snowdown, Harrowing, Razer). Stat duplicates of
// standard runes with unique art; sorted to the end of each category.
const isEventRune = (id) => Number(id) >= 8000;

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

function convertStats(id, entry) {
    const base = {};
    const perLevel = {};
    for (const [ddKey, raw] of Object.entries(entry.stats || {})) {
        if (!raw) continue;
        const map = STAT_MAP[ddKey];
        if (!map) throw new Error(`Unmapped stat key ${ddKey} on rune ${id} (${entry.name})`);
        const target = map.perLevel ? perLevel : base;
        target[map.key] = round4((target[map.key] || 0) + raw * (map.mult || 1));
    }
    // Some values live only in the description text: Lethality (V6.22+),
    // and in the V3.14 catalog Energy, Energy Regen, Life Steal, and Spell
    // Vamp shipped with empty stats blocks. Regen descs are already per-5s.
    const desc = entry.description;
    const descStat = (re, key, target = base) => {
        const m = re.exec(desc);
        if (m && !(key in target)) target[key] = round4(parseFloat(m[1]));
    };
    descStat(/([\d.]+)\s+lethality/i, "lethality");
    descStat(/\+([\d.]+)%\s+life\s?steal/i, "ls");
    descStat(/\+([\d.]+)%\s+spell\s?vamp/i, "sv");
    descStat(/\+([\d.]+)\s+Energy regen\/5 sec per level/i, "energyRegen", perLevel);
    if (!("energyRegen" in perLevel)) descStat(/\+([\d.]+)\s+Energy regen\/5 sec/i, "energyRegen");
    descStat(/\+([\d.]+)\s+Energy\/level/i, "energy", perLevel);
    if (!("energy" in perLevel)) descStat(/\+([\d.]+)\s+Energy(?!\s*regen|\/level)/i, "energy");
    return { base, perLevel };
}

function parseCatalog(catalog) {
    const runes = [];
    for (const [id, entry] of Object.entries(catalog.data)) {
        const category = CATEGORY_BY_TYPE[entry.rune.type];
        if (!category) throw new Error(`Unknown rune type ${entry.rune.type} on ${id}`);
        const { base, perLevel } = convertStats(id, entry);
        if (!Object.keys(base).length && !Object.keys(perLevel).length)
            throw new Error(`Rune ${id} (${entry.name}) has no stats`);
        runes.push({
            id: id,
            name: entry.name,
            category: category,
            tier: Number(entry.rune.tier),
            icon: entry.image.full,
            desc: entry.description,
            event: isEventRune(id),
            base: base,
            perLevel: perLevel,
        });
    }

    const categoryOrder = { mark: 0, seal: 1, glyph: 2, quintessence: 3 };
    runes.sort((a, b) =>
        categoryOrder[a.category] - categoryOrder[b.category]
        || (a.event ? 1 : 0) - (b.event ? 1 : 0)
        || b.tier - a.tier                       // Greater (T3) first
        || a.name.localeCompare(b.name));
    return runes;
}

function runeLines(runes) {
    const lines = [];
    for (const r of runes) {
        const parts = [
            `id: ${JSON.stringify(r.id)}`,
            `name: ${JSON.stringify(r.name)}`,
            `category: ${JSON.stringify(r.category)}`,
            `tier: ${r.tier}`,
            `icon: ${JSON.stringify(r.icon)}`,
            `desc: ${JSON.stringify(r.desc)}`,
        ];
        if (r.event) parts.push("event: true");
        if (Object.keys(r.base).length) parts.push(`base: ${JSON.stringify(r.base).replace(/"/g, "").replace(/,/g, ", ").replace(/:/g, ": ")}`);
        if (Object.keys(r.perLevel).length) parts.push(`perLevel: ${JSON.stringify(r.perLevel).replace(/"/g, "").replace(/,/g, ", ").replace(/:/g, ": ")}`);
        lines.push(`            { ${parts.join(", ")} },`);
    }
    return lines.join("\n");
}

function dataSetBlock(cfg, catalog, runes) {
    return `    {
        id: ${JSON.stringify(cfg.id)},
        season: ${cfg.season},
        seasonLabel: ${JSON.stringify(cfg.seasonLabel)},
        patch: ${JSON.stringify(cfg.patch)},
        patchLabel: ${JSON.stringify(cfg.patchLabel)},
        slots: { mark: 9, seal: 9, glyph: 9, quintessence: 3 },
        ddragonVersion: ${JSON.stringify(catalog.version)},
        iconBasePath: "images/runes/",
        parchmentImage: "images/runes/summoners_runes_bg.jpg",
        runes: [
${runeLines(runes)}
        ],
    },`;
}

function main() {
    const blocks = [];
    const summary = [];
    for (const cfg of DATASETS) {
        const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "data", cfg.catalog), "utf8"));
        const runes = parseCatalog(catalog);
        blocks.push(dataSetBlock(cfg, catalog, runes));
        const byCat = {};
        for (const r of runes) byCat[r.category] = (byCat[r.category] || 0) + 1;
        summary.push({ id: cfg.id, version: catalog.version, count: runes.length, byCat });
    }

    const out = `// Pre-Runes-Reforged rune catalogs (the system retired with patch V7.22 on
// 2017-11-08). Ships one dataset per pre-Reforged season we support: the final
// pre-Reforged patch (V7.21, the default) plus late-season snapshots of
// Season 5 (V5.21) and Season 4 (V4.20).
//
// GENERATED FILE — do not edit by hand. Regenerate with:
//     node generate-runes-data.js
// Sources of truth: the Riot Data Dragon rune.json catalogs under data/
// (runes-V7.21.1.json, runes-V5.21.1.json, runes-V4.20.2.json). Stats, names,
// tiers, and icon filenames come straight from Riot's data; Lethality values
// are parsed from description text on catalogs that carry them (V6.22+). Older
// catalogs express physical penetration as flat armor penetration and are
// mapped to the "arpen" stat instead.
//
// Each rune entry has:
//   id          Riot's numeric rune id (stable; used in shareable URLs)
//   name        full in-game name
//   category    "mark" | "seal" | "glyph" | "quintessence"
//   tier        1 (Lesser) | 2 (standard) | 3 (Greater)
//   icon        icon filename under images/runes/
//   desc        official tooltip text
//   event       true for limited-event runes (Snowdown / Harrowing / Razer)
//   base        flat stats applied at all levels
//   perLevel    stats added per champion level
//
// Stat keys: ad, ap, as, crit, critDmg, armor, mr, hp, mp, hpRegen, mpRegen,
//   ms, cdr, lethality, arpen, mpen, ls, sv, gold, xp, energy, energyRegen,
//   hpPercent, timeDead.
// as / crit / critDmg / ms / cdr / ls / sv / xp / hpPercent / timeDead are
// percentages (as: 1.7 → +1.7%); hpRegen / mpRegen / energyRegen are per 5s;
// gold is per 10s; arpen / mpen are flat penetration.

var runeDataSets = [
${blocks.join("\n")}
];

var DEFAULT_RUNE_DATA_SET_ID = "preReforged-V7.21";

function getRuneDataSet(id) {
    for (var i = 0; i < runeDataSets.length; i++)
        if (runeDataSets[i].id === id) return runeDataSets[i];
    return null;
}

function getRuneById(dataSet, runeId) {
    if (!dataSet || !runeId) return null;
    for (var i = 0; i < dataSet.runes.length; i++)
        if (dataSet.runes[i].id === runeId) return dataSet.runes[i];
    return null;
}
`;
    fs.writeFileSync(OUTPUT, out);
    for (const s of summary)
        console.log(`${s.id} (DDragon ${s.version}): ${s.count} runes`, s.byCat);
    console.log(`Wrote ${summary.length} datasets to ${OUTPUT}`);
}

main();
