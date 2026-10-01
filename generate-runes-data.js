// generate-runes-data.js — pre-Runes-Reforged rune catalogs, one per listed
// patch (DESIGN.md §1.2-§1.6, task T5). Node only, offline, deterministic.
//
//     node generate-runes-data.js              build data/runes/catalog-*.js and
//                                              data/runes/manifest.json, run R1-R7
//     node generate-runes-data.js --check      build in memory only; exit 1 when an
//                                              output (or runes-data.js) would change
//     node generate-runes-data.js --audit <raw cache>
//                                              C3: every DDragon patch in <raw>/rune
//                                              equals the listed patch in effect,
//                                              apart from listed noise
//     node generate-runes-data.js --legacy     write runes-data.js exactly as the
//                                              pre-per-patch generator did (kept
//                                              until phase 2 drops runes-data.js)
//
// Inputs (all committed):
//   data/patches/runes.json             the 25 listed patches (season, reason, source, changes)
//   data/patches/runes-overrides.json   layers 2-4 (export-fix, wiki-fact, correction)
//   data/patches/noise/runes.json       differences ignored as noise (with audit scopes)
//   data/sources/runes/ddragon/<build>.json   trimmed Riot Data Dragon rune.json
//   data/sources/runes/wiki/<patch>.json      wiki-era reconstructions, same schema
//   data/sources/runes/wiki/confidence.json   per-rune confidence below "high"
//   data/sources/runes/cdragon-7.21-extra.json  LCU game data for 5401 (D7 cross-check)
//   tools/lib/patches.js                patch order, seasons, ids, hash, writer
//
// Pipeline per listed patch: layer 1 = the source catalog converted to the
// calculator's rune shape (stats block, then values the description carries
// and the stats block lacks: lethality, life steal, spell vamp, energy);
// layers 2-4 = overrides whose patch range contains the patch, applied in
// layer order and then file order. An override fails the run when its target
// is missing, when its `was` guard does not match, or when it changes nothing
// in a listed patch of its range (stale). Equal payloads (patches.contentHash)
// share one file, named after the first patch that uses it.

"use strict";

const fs = require("fs");
const path = require("path");
const P = require("./tools/lib/patches.js");

const ROOT = __dirname;
const SOURCES = path.join(ROOT, "data", "sources", "runes");
const LISTING_FILE = path.join(ROOT, "data", "patches", "runes.json");
const OVERRIDES_FILE = path.join(ROOT, "data", "patches", "runes-overrides.json");
const NOISE_FILE = path.join(ROOT, "data", "patches", "noise", "runes.json");
const OUT_DIR = path.join(ROOT, "data", "runes");
const MANIFEST_FILE = path.join(OUT_DIR, "manifest.json");
const IMAGE_DIR = path.join(ROOT, "images", "runes");
const LEGACY_OUTPUT = path.join(ROOT, "runes-data.js");

const GENERATOR = "generate-runes-data.js";
const KIND = "runes";
const PAGE = "runes";

// Constant per-entry chrome the registry copies into every runes entry.
const SLOTS = { mark: 9, seal: 9, glyph: 9, quintessence: 3 };
const ICON_BASE_PATH = "images/runes/";
const PARCHMENT_IMAGE = "images/runes/summoners_runes_bg.jpg";

const CATEGORY_BY_TYPE = {
    red: "mark",
    yellow: "seal",
    blue: "glyph",
    black: "quintessence",
};
const CATEGORY_ORDER = { mark: 0, seal: 1, glyph: 2, quintessence: 3 };

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
    // Dodge chance (removed in V1.0.0.132): Seals/Quintessences of Evasion and
    // three event runes. A fraction like the other percent stats.
    rFlatDodgeMod:                  { key: "dodge", mult: 100 },

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

// Every stat key a catalog may carry (R1): the mapped keys plus lethality,
// which only the description text carries (Data Dragon never grew the key).
const APP_STAT_KEYS = new Set(Object.values(STAT_MAP).map((m) => m.key).concat(["lethality"]));

// Event / promo runes (Snowdown, Harrowing, Winter Games, Razer, Studio
// Rumble). Stat duplicates of standard runes with unique art; sorted to the
// end of each category.
const isEventRune = (id) => Number(id) >= 8000;

const OVERRIDE_LAYERS = ["export-fix", "wiki-fact", "correction"];

function fail(msg) { throw new Error(msg); }

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function relPath(file) {
    return path.relative(ROOT, file).split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

// Trimmed rune.json (DESIGN §1.3): per rune only {name, description,
// image.full, rune.tier, rune.type, non-zero stats}. `extra` (provenance
// fields) goes between `version` and `data`. Used by tools/import-runes.js and
// by --audit, so the committed sources and the audit see the same shape.
function trimCatalog(raw, extra) {
    if (!raw || !raw.data) fail("trimCatalog: not a rune.json catalog");
    const data = {};
    for (const id of Object.keys(raw.data)) {
        const e = raw.data[id];
        const stats = {};
        for (const [k, v] of Object.entries(e.stats || {})) if (v) stats[k] = v;
        data[id] = {
            name: e.name,
            description: e.description,
            image: { full: e.image.full },
            rune: { tier: e.rune.tier, type: e.rune.type },
            stats: stats,
        };
    }
    return Object.assign({ type: raw.type || "rune", version: raw.version }, extra || {}, { data: data });
}

const sourceCache = new Map();

function sourceFile(source) {
    if (source && typeof source.ddragon === "string") return path.join(SOURCES, "ddragon", source.ddragon + ".json");
    if (source && typeof source.wiki === "string") return path.join(SOURCES, "wiki", source.wiki + ".json");
    fail("bad source " + JSON.stringify(source));
}

function sourceName(source) {
    return source.ddragon ? "DDragon " + source.ddragon : "wiki " + source.wiki;
}

function loadSource(source) {
    const file = sourceFile(source);
    if (!sourceCache.has(file)) {
        if (!fs.existsSync(file)) fail("missing source " + relPath(file) + " (run tools/import-runes.js)");
        sourceCache.set(file, readJson(file));
    }
    return sourceCache.get(file);
}

let confidenceCache = null;
function wikiConfidence(name) {
    if (!confidenceCache) confidenceCache = readJson(path.join(SOURCES, "wiki", "confidence.json")).states || {};
    const st = confidenceCache[name];
    if (!st) fail("wiki/confidence.json has no state " + name);
    return st.runes || {};
}

// ---------------------------------------------------------------------------
// Layer 1: convert one source rune to the calculator shape
// ---------------------------------------------------------------------------

function convertRune(id, entry, where) {
    const category = CATEGORY_BY_TYPE[entry.rune && entry.rune.type];
    if (!category) fail(`${where}: rune ${id}: unknown rune type ${JSON.stringify(entry.rune && entry.rune.type)}`);
    const base = {};
    const perLevel = {};
    for (const [ddKey, raw] of Object.entries(entry.stats || {})) {
        if (!raw) continue;
        const map = STAT_MAP[ddKey];
        if (!map) fail(`${where}: unmapped stat key ${ddKey} on rune ${id} (${entry.name})`);      // R1
        const target = map.perLevel ? perLevel : base;
        target[map.key] = round4((target[map.key] || 0) + raw * (map.mult || 1));
    }
    // Values only the description carries fill a stat the stats block lacks:
    // Lethality (V6.22+), and in the V3.6-V3.15 catalogs Energy, Energy Regen,
    // Life Steal and Spell Vamp shipped with empty stats blocks. Regen texts
    // are already per 5 s. Short stat text ("Leth") is never parsed: the one
    // case seen was stale (5401), so such a rune must get its value from an
    // override, checked after the overrides ran.
    const desc = entry.description;
    const shortLeth = /\bLeth\b/i.test(desc);
    const descStat = (re, key, target = base) => {
        const m = re.exec(desc);
        if (m && !(key in target)) target[key] = round4(parseFloat(m[1]));
    };
    descStat(/\+([\d.]+)\s+lethality\b/i, "lethality");
    descStat(/\+([\d.]+)\s+magic\s+penetration\b/i, "mpen");
    descStat(/\+([\d.]+)%\s+life\s?steal/i, "ls");
    descStat(/\+([\d.]+)%\s+spell\s?vamp/i, "sv");
    descStat(/\+([\d.]+)\s+Energy regen\/5 sec per level/i, "energyRegen", perLevel);
    if (!("energyRegen" in perLevel)) descStat(/\+([\d.]+)\s+Energy regen\/5 sec/i, "energyRegen");
    descStat(/\+([\d.]+)\s+Energy\/level/i, "energy", perLevel);
    if (!("energy" in perLevel)) descStat(/\+([\d.]+)\s+Energy(?!\s*regen|\/level)/i, "energy");
    return {
        rune: {
            id: id,
            name: entry.name,
            category: category,
            tier: Number(entry.rune.tier),
            icon: entry.image.full,
            desc: desc,
            event: isEventRune(id),
            base: base,
            perLevel: perLevel,
        },
        shortLeth: shortLeth,
    };
}

function convertCatalog(catalog, where) {
    const runes = [];
    const shortLeth = new Set();
    for (const id of Object.keys(catalog.data)) {
        const c = convertRune(id, catalog.data[id], where);
        runes.push(c.rune);
        if (c.shortLeth) shortLeth.add(id);
    }
    return { runes: runes, shortLeth: shortLeth };
}

// Client order: marks, seals, glyphs, quints; standard runes before event
// runes; Greater (T3) first; then by name (fixed "en" collation).
function sortRunes(runes) {
    runes.sort((a, b) =>
        CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
        || (a.event ? 1 : 0) - (b.event ? 1 : 0)
        || b.tier - a.tier
        || a.name.localeCompare(b.name, "en")
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return runes;
}

function finalRune(r) {
    const o = { id: r.id, name: r.name, category: r.category, tier: r.tier, icon: r.icon, desc: r.desc };
    if (r.event) o.event = true;
    if (Object.keys(r.base).length) o.base = r.base;
    if (Object.keys(r.perLevel).length) o.perLevel = r.perLevel;
    if (r.confidence) o.confidence = r.confidence;
    return o;
}

// ---------------------------------------------------------------------------
// Curation files
// ---------------------------------------------------------------------------

function loadListing() {
    const listing = readJson(LISTING_FILE);
    const records = listing.patches;
    if (!Array.isArray(records) || !records.length) fail("runes.json: patches missing");
    const errors = [];
    const seen = new Set();
    records.forEach((rec, i) => {
        const w = `runes.json patches[${i}] ${rec && rec.patch}`;
        let p;
        try { p = P.parse(rec.patch); } catch (e) { errors.push(`${w}: ${e.message}`); return; }
        rec._p = p;
        rec._id = P.idFor(PAGE, p);
        if (seen.has(rec._id)) errors.push(`${w}: duplicate id ${rec._id}`);
        seen.add(rec._id);
        if (i && P.compare(records[i - 1]._p || records[i - 1].patch, p) >= 0) errors.push(`${w}: not in ascending patch order`);
        if (rec.season !== P.seasonOf(p)) errors.push(`${w}: season ${rec.season} but seasonOf() = ${P.seasonOf(p)}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date || "")) errors.push(`${w}: date must be YYYY-MM-DD`);
        if (!/^(season-start|season-end|change)(\+change)?$/.test(rec.reason || "") || rec.reason === "change+change")
            errors.push(`${w}: bad reason ${JSON.stringify(rec.reason)}`);
        if (!["high", "medium", "low"].includes(rec.confidence)) errors.push(`${w}: confidence missing`);
        if (!Array.isArray(rec.sources) || !rec.sources.length) errors.push(`${w}: the reason needs at least one source (G4)`);
        if (!Array.isArray(rec.changes)) errors.push(`${w}: changes must be an array`);
        else rec.changes.forEach((c, j) => {
            if (!c || typeof c.text !== "string" || !c.text) errors.push(`${w}: changes[${j}].text missing`);
            if (!c || !Array.isArray(c.sources) || !c.sources.length) errors.push(`${w}: changes[${j}] needs a source (G4)`);
            if (!c || !["high", "medium", "low"].includes(c.confidence)) errors.push(`${w}: changes[${j}].confidence missing`);
        });
        try { sourceFile(rec.source); } catch (e) { errors.push(`${w}: ${e.message}`); }
    });
    if (errors.length) fail("runes.json is invalid:\n  " + errors.join("\n  "));
    return records;
}

function loadOverrides() {
    const doc = readJson(OVERRIDES_FILE);
    const list = doc.overrides;
    if (!Array.isArray(list)) fail("runes-overrides.json: overrides missing");
    const errors = [];
    const ids = new Set();
    list.forEach((o, i) => {
        const w = `runes-overrides.json overrides[${i}] ${o && o.id}`;
        if (!o || !/^ro-\d{3}$/.test(o.id)) { errors.push(`${w}: id must look like ro-001`); return; }
        if (ids.has(o.id)) errors.push(`${w}: duplicate id`);
        ids.add(o.id);
        o._order = i;
        if (!OVERRIDE_LAYERS.includes(o.kind)) errors.push(`${w}: kind must be one of ${OVERRIDE_LAYERS.join(", ")}`);
        if (o.page !== PAGE) errors.push(`${w}: page must be "runes"`);
        try {
            if (P.compare(o.from, o.to) > 0) errors.push(`${w}: from after to`);
        } catch (e) { errors.push(`${w}: ${e.message}`); }
        if (typeof o.target !== "string" || !(o.target === "*" || /^\d+$/.test(o.target))) errors.push(`${w}: target must be a rune id or "*"`);
        if (!/^(name|desc|stats|(base|perLevel)\.[A-Za-z]+)$/.test(o.field || "")) errors.push(`${w}: unsupported field ${JSON.stringify(o.field)}`);
        const m = /^(base|perLevel)\.(.+)$/.exec(o.field || "");
        if (m && !APP_STAT_KEYS.has(m[2])) errors.push(`${w}: unknown stat key ${m[2]}`);
        if (o.field === "stats") {
            if (!o.valueFrom || !(o.valueFrom.ddragon || o.valueFrom.wiki)) errors.push(`${w}: field "stats" needs valueFrom {ddragon|wiki}`);
            if (o.guard !== undefined && o.guard !== "round4") errors.push(`${w}: unknown guard ${JSON.stringify(o.guard)}`);
        } else if (!("value" in o)) errors.push(`${w}: value missing`);
        if (o.target === "*" && o.field !== "stats") errors.push(`${w}: target "*" is only allowed for field "stats"`);
        if (typeof o.reason !== "string" || !o.reason) errors.push(`${w}: reason missing`);
        if (!Array.isArray(o.sources) || !o.sources.length) errors.push(`${w}: sources missing`);
        if (!["high", "medium", "low"].includes(o.confidence)) errors.push(`${w}: confidence missing`);
    });
    if (errors.length) fail("runes-overrides.json is invalid:\n  " + errors.join("\n  "));
    return list;
}

function loadNoise() {
    const doc = readJson(NOISE_FILE);
    const items = doc.items;
    if (!Array.isArray(items)) fail("noise/runes.json: items missing");
    const byId = new Map();
    for (const n of items) {
        if (!n || !/^rn-\d{3}$/.test(n.id)) fail("noise/runes.json: bad id " + JSON.stringify(n && n.id));
        if (byId.has(n.id)) fail("noise/runes.json: duplicate id " + n.id);
        if (n.audit) {
            const a = n.audit;
            if (!a.from || !a.to || !Array.isArray(a.runes) || !Array.isArray(a.fields)) fail(`noise ${n.id}: audit needs from, to, runes[], fields[]`);
            P.parse(a.from); P.parse(a.to);
        }
        byId.set(n.id, n);
    }
    return byId;
}

function inRange(p, o) {
    return P.compare(o.from, p) <= 0 && P.compare(p, o.to) <= 0;
}

// ---------------------------------------------------------------------------
// Layers 2-4: overrides
// ---------------------------------------------------------------------------

// True when every value of `a` is `b` rounded to 4 decimals: a has at most 4
// decimals and lies within half a unit of b (either way at an exact half,
// since 0.72115 became 0.7211).
function sameStatsUpToRound4(a, b) {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.join() !== kb.join()) return false;
    return ka.every((k) => Math.abs(a[k] * 1e4 - Math.round(a[k] * 1e4)) < 1e-6
        && Math.abs(a[k] - b[k]) <= 0.00005 + 1e-12);
}

// Applies one override to `state` (the patch's working catalog). Throws when
// the target is missing or a `was` guard does not hold; returns nothing.
function applyOverride(o, state, where) {
    const byId = state.byId;
    const fromSource = state.layerOneSource;
    if (o.field === "stats") {
        const other = loadSource(o.valueFrom);
        const otherName = sourceName(o.valueFrom);
        const targets = o.target === "*" ? state.runes.map((r) => r.id) : [o.target];
        for (const id of targets) {
            const r = byId.get(id);
            if (!r) fail(`${where}: override ${o.id}: rune ${id} missing`);
            const e = other.data[id];
            if (!e) fail(`${where}: override ${o.id}: rune ${id} missing in ${otherName}`);
            if (o.guard === "round4") {
                const mine = (fromSource.data[id] || {}).stats || {};
                if (!sameStatsUpToRound4(mine, e.stats || {}))
                    fail(`${where}: override ${o.id}: rune ${id} stats ${JSON.stringify(mine)} are not the 4-decimal rounding of ${otherName} ${JSON.stringify(e.stats)}`);
                if (e.description !== fromSource.data[id].description)
                    fail(`${where}: override ${o.id}: rune ${id} description differs from ${otherName}; not a rounding-only difference`);
            }
            const conv = convertRune(id, e, otherName).rune;
            r.base = conv.base;
            r.perLevel = conv.perLevel;
        }
        return;
    }
    const r = byId.get(o.target);
    if (!r) fail(`${where}: override ${o.id}: rune ${o.target} missing`);
    const m = /^(base|perLevel)\.(.+)$/.exec(o.field);
    const holder = m ? r[m[1]] : r;
    const key = m ? m[2] : o.field;
    const current = holder[key];
    if ("was" in o && current !== (o.was === null ? undefined : o.was))
        fail(`${where}: override ${o.id}: ${o.target}.${o.field} is ${JSON.stringify(current)}, expected ${JSON.stringify(o.was)}`);
    if (o.kind === "wiki-fact" && current !== undefined && state.source.ddragon)
        fail(`${where}: override ${o.id}: a wiki-fact never replaces a Data Dragon value (${o.target}.${o.field} = ${JSON.stringify(current)})`);
    if (o.value === null) delete holder[key];
    else holder[key] = o.value;
}

// ---------------------------------------------------------------------------
// Build one listed patch (or, for --audit, any catalog)
// ---------------------------------------------------------------------------

function buildCatalog(p, source, catalog, overrides, opts) {
    opts = opts || {};
    const where = (opts.label || P.parse(p).label) + " (" + sourceName(source) + ")";
    const conv = convertCatalog(catalog, where);
    const state = { runes: conv.runes, byId: new Map(conv.runes.map((r) => [r.id, r])), source: source, layerOneSource: catalog };
    const inEffect = overrides.filter((o) => inRange(p, o))
        .sort((a, b) => OVERRIDE_LAYERS.indexOf(a.kind) - OVERRIDE_LAYERS.indexOf(b.kind) || a._order - b._order);
    const applied = [];
    for (const o of inEffect) {
        const before = JSON.stringify(state.runes);
        applyOverride(o, state, where);
        if (JSON.stringify(state.runes) === before) {
            if (opts.allowStale) continue;
            fail(`${where}: stale override ${o.id}: it changes nothing`);
        }
        applied.push(o.id);
    }
    for (const id of conv.shortLeth) {
        const r = state.byId.get(id);
        if (!("lethality" in r.base))
            fail(`${where}: rune ${id} (${r.name}) has short lethality text and no lethality value; add an override`);
    }
    // A description that states a lethality amount must agree with the value.
    for (const r of state.runes) {
        const m = /\+([\d.]+)\s+lethality\b/i.exec(r.desc);
        if (m && round4(parseFloat(m[1])) !== r.base.lethality)
            fail(`${where}: rune ${r.id} says +${m[1]} Lethality but carries ${r.base.lethality}`);
        if (!Object.keys(r.base).length && !Object.keys(r.perLevel).length)
            fail(`${where}: rune ${r.id} (${r.name}) has no stats`);
    }
    if (source.wiki) {
        const conf = wikiConfidence(source.wiki);
        for (const r of state.runes) {
            const c = conf[r.id];
            if (c === "low" || c === "medium") r.confidence = c;
            else if (c !== undefined && c !== "high") fail(`${where}: rune ${r.id}: bad confidence ${JSON.stringify(c)}`);
        }
    }
    const runes = sortRunes(state.runes).map(finalRune);
    return { payload: { runes: runes }, applied: applied };
}

// ---------------------------------------------------------------------------
// Payload diff (change rule and audit)
// ---------------------------------------------------------------------------

function diffPayloads(a, b) {
    const out = [];
    const am = new Map(a.runes.map((r) => [r.id, r]));
    const bm = new Map(b.runes.map((r) => [r.id, r]));
    for (const [id, r] of am) {
        const q = bm.get(id);
        if (!q) { out.push({ id: id, field: "removed" }); continue; }
        for (const f of ["name", "category", "tier", "icon", "desc", "event", "confidence"])
            if (r[f] !== q[f]) out.push({ id: id, field: f });
        for (const g of ["base", "perLevel"]) {
            const x = r[g] || {}, y = q[g] || {};
            for (const k of new Set(Object.keys(x).concat(Object.keys(y))))
                if (x[k] !== y[k]) out.push({ id: id, field: g + "." + k });
        }
    }
    for (const id of bm.keys()) if (!am.has(id)) out.push({ id: id, field: "added" });
    return out;
}

function coveredByNoise(diff, p, noiseIds, noise) {
    return diff.filter((d) => !noiseIds.some((nid) => {
        const n = noise.get(nid);
        const a = n && n.audit;
        return a && inRange(p, a) && a.runes.includes(d.id) && a.fields.includes(d.field);
    }));
}

function hasStat(payload, keys) {
    return payload.runes.some((r) => keys.some((k) => (r.base && k in r.base) || (r.perLevel && k in r.perLevel)));
}

// ---------------------------------------------------------------------------
// Build all listed patches, check, and render the outputs (in memory)
// ---------------------------------------------------------------------------

function buildAll() {
    const records = loadListing();
    const overrides = loadOverrides();
    const noise = loadNoise();
    const errors = [];
    const check = (ok, msg) => { if (!ok) errors.push(msg); };

    const entries = records.map((rec) => {
        const catalog = loadSource(rec.source);
        const built = buildCatalog(rec._p, rec.source, catalog, overrides);
        return { rec: rec, payload: built.payload, applied: built.applied, hash: P.contentHash(built.payload) };
    });

    // Overrides must touch at least one listed patch.
    for (const o of overrides)
        check(entries.some((e) => e.applied.includes(o.id)), `override ${o.id} applies to no listed patch`);

    // Per catalog: R1 stat keys, R2 categories/tiers/ids, R3 icons.
    for (const e of entries) {
        const w = e.rec._p.label;
        const ids = new Set();
        for (const r of e.payload.runes) {
            check(!ids.has(r.id), `R2 ${w}: duplicate rune id ${r.id}`);
            ids.add(r.id);
            check(/^\d+$/.test(r.id), `R2 ${w}: bad rune id ${r.id}`);
            check(CATEGORY_ORDER[r.category] !== undefined, `R2 ${w}: rune ${r.id}: bad category ${r.category}`);
            check([1, 2, 3].includes(r.tier), `R2 ${w}: rune ${r.id}: bad tier ${r.tier}`);
            for (const g of ["base", "perLevel"])
                for (const [k, v] of Object.entries(r[g] || {})) {
                    check(APP_STAT_KEYS.has(k), `R1 ${w}: rune ${r.id}: unknown stat key ${k}`);
                    check(typeof v === "number" && isFinite(v) && v !== 0, `R1 ${w}: rune ${r.id}: bad value ${g}.${k} = ${v}`);
                }
            check(typeof r.icon === "string" && fs.existsSync(path.join(IMAGE_DIR, r.icon)), `R3 ${w}: rune ${r.id}: icon images/runes/${r.icon} missing`);
            check(typeof r.name === "string" && r.name && typeof r.desc === "string" && r.desc, `R2 ${w}: rune ${r.id}: name/desc missing`);
        }
        for (const cat of Object.keys(SLOTS))
            check(e.payload.runes.some((r) => r.category === cat && !r.event), `R2 ${w}: no standard ${cat}s`);
    }

    // Per entry: R4 lethality, R5 dodge, R6 energy.
    for (const e of entries) {
        const p = e.rec._p, w = p.label;
        if (P.compare(p, "V6.22") >= 0) {
            const r = e.payload.runes.find((x) => x.id === "5401");
            check(r && r.base && r.base.lethality === 0.88, `R4 ${w}: 5401 lethality is ${r && r.base && r.base.lethality}, expected 0.88`);
        }
        const dodge = hasStat(e.payload, ["dodge"]);
        check(dodge === P.compare(p, "V1.0.0.132") < 0, `R5 ${w}: dodge ${dodge ? "present" : "absent"} (dodge exists exactly before V1.0.0.132)`);
        const energy = hasStat(e.payload, ["energy", "energyRegen"]);
        check(energy === P.compare(p, "V1.0.0.94(b)") >= 0, `R6 ${w}: energy runes ${energy ? "present" : "absent"} (they exist from V1.0.0.94(b) on)`);
    }

    // D7: the corrected 5401 text and value are the client's (CDragon 7.21).
    const extra = readJson(path.join(SOURCES, "cdragon-7.21-extra.json"));
    const lcu = extra.runes && extra.runes["5401"];
    for (const o of overrides.filter((x) => x.target === "5401")) {
        if (o.field === "desc") check(lcu && lcu.description === o.value, `D7 ${o.id}: text differs from CDragon 7.21 (${lcu && lcu.description})`);
        if (o.field === "base.lethality") check(lcu && lcu.stats && lcu.stats.rPhysicalLethality === o.value, `D7 ${o.id}: value differs from CDragon 7.21 rPhysicalLethality`);
    }

    // Change rule (C1/C2) between consecutive listed patches.
    for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1], cur = entries[i];
        const w = cur.rec._p.label;
        const isChange = /(^|\+)change$/.test(cur.rec.reason);
        if (isChange) {
            check(cur.hash !== prev.hash, `C1 ${w}: reason "${cur.rec.reason}" but the catalog equals ${prev.rec._p.label}`);
            check(cur.rec.changes.length > 0, `C1 ${w}: reason "${cur.rec.reason}" but no changes listed`);
        } else {
            check(cur.rec.changes.length === 0, `C2 ${w}: reason "${cur.rec.reason}" lists changes; use "${cur.rec.reason}+change"`);
            if (cur.hash !== prev.hash) {
                const left = coveredByNoise(diffPayloads(prev.payload, cur.payload), cur.rec._p, cur.rec.noise || [], noise);
                check((cur.rec.noise || []).length > 0 && left.length === 0,
                    `C2 ${w}: no change listed, but it differs from ${prev.rec._p.label}: ${left.slice(0, 6).map((d) => d.id + " " + d.field).join(", ")}${left.length > 6 ? " …" : ""}`);
            } else check(!(cur.rec.noise || []).length, `C2 ${w}: lists noise ${cur.rec.noise} but equals ${prev.rec._p.label}`);
        }
        for (const nid of cur.rec.noise || []) check(noise.has(nid), `${w}: unknown noise id ${nid}`);
    }

    // Seasons: counts, bounds and defaults agree with data/patches/seasons.json.
    for (const s of P.seasons()) {
        const pg = s.pages && s.pages.runes;
        const list = entries.filter((e) => e.rec.season === s.key);
        if (!pg) { check(!list.length, `season ${s.key} has runes entries but no runes page`); continue; }
        check(list.length === pg.count, `G2 ${s.key}: ${list.length} runes entries, seasons.json says ${pg.count}`);
        if (!list.length) continue;
        check(P.equal(list[0].rec._p, pg.first) && P.equal(list[list.length - 1].rec._p, pg.last),
            `G3 ${s.key}: runes ${list[0].rec._p.label}-${list[list.length - 1].rec._p.label}, seasons.json says ${pg.first}-${pg.last}`);
        check(list.some((e) => e.rec._id === pg.default), `G5 ${s.key}: default ${pg.default} is not listed`);
        const r0 = list[0].rec, r1 = list[list.length - 1].rec;
        check(/^season-start/.test(r0.reason), `${s.key}: first entry ${r0.patch} must have reason season-start`);
        check(/^season-end/.test(r1.reason) || P.equal(r1._p, P.livePatch()), `${s.key}: last entry ${r1.patch} must have reason season-end`);
        if (P.equal(r0._p, s.first) && s.firstDate) check(r0.date === s.firstDate, `${s.key}: ${r0.patch} date ${r0.date}, seasons.json says ${s.firstDate}`);
        if (P.equal(r1._p, s.last) && s.lastDate) check(r1.date === s.lastDate, `${s.key}: ${r1.patch} date ${r1.date}, seasons.json says ${s.lastDate}`);
    }
    check(entries.length === 25, `G2: ${entries.length} runes entries, expected 25`);
    check(entries.some((e) => e.rec._id === P.pageDefault(PAGE)), `G5: page default ${P.pageDefault(PAGE)} is not listed`);

    // Shared files: the first patch with a given payload names the file.
    const files = new Map();     // hash -> file record
    for (const e of entries) {
        let f = files.get(e.hash);
        if (!f) {
            f = { key: "catalog-" + e.rec._p.name, payload: e.payload, hash: e.hash, entries: [], sources: [], overrides: new Set() };
            files.set(e.hash, f);
        }
        f.entries.push(e);
        const sn = sourceName(e.rec.source);
        if (!f.sources.includes(sn)) f.sources.push(sn);
        e.applied.forEach((id) => f.overrides.add(id));
        e.file = f;
    }
    const byId = new Map(entries.map((e) => [e.rec._id, e]));
    // R7 (D8): V7.21 shares V6.22's catalog.
    check(byId.get("preReforged-V7.21") && byId.get("preReforged-V6.22") && byId.get("preReforged-V7.21").file === byId.get("preReforged-V6.22").file,
        "R7: preReforged-V7.21 does not share preReforged-V6.22's catalog");
    // Aliases: every runes alias target is listed, every kept id is listed.
    const al = P.aliases();
    for (const [id, a] of Object.entries(al.runes || {})) check(byId.has(a.to), `G5 alias ${id} -> ${a.to} is not listed`);
    for (const id of (al.keep && al.keep.runes) || []) check(byId.has(id), `G5 kept id ${id} is not listed`);
    if (al.plain && al.plain.runes) check(byId.has(al.plain.runes.to), `G5 plain runes link -> ${al.plain.runes.to} is not listed`);

    if (errors.length) fail("rune checks failed:\n  " + errors.join("\n  "));

    // Render.
    const outputs = [];
    const overrideOrder = new Map(overrides.map((o, i) => [o.id, i]));
    for (const f of files.values()) {
        const file = path.join(OUT_DIR, f.key + ".js");
        const sources = f.sources[0] + " rune catalog"
            + (f.sources.length > 1 ? " (same payload from " + f.sources.slice(1).join(", ") + ")" : "");
        const text = P.renderGenerated({
            generator: GENERATOR,
            source: sources,
            overrides: Array.from(f.overrides).sort((a, b) => overrideOrder.get(a) - overrideOrder.get(b)),
            patches: f.entries.map((e) => e.rec._p),
            kind: KIND,
            key: f.key,
            payload: f.payload,
        });
        outputs.push({ file: file, text: text });
    }
    const manifest = {};
    for (const e of entries) {
        manifest[e.rec._id] = {
            data: e.file.key,
            file: "data/runes/" + e.file.key + ".js",
            hash: e.hash,
            ddragonVersion: e.rec.source.ddragon || null,
            runes: e.payload.runes.length,
            overrides: e.applied,
            slots: SLOTS,
            iconBasePath: ICON_BASE_PATH,
            parchmentImage: PARCHMENT_IMAGE,
        };
    }
    outputs.push({ file: MANIFEST_FILE, text: JSON.stringify(manifest, null, 2) + "\n" });
    return { entries: entries, files: Array.from(files.values()), outputs: outputs };
}

function normalizeEol(text) {
    return text.split("\r\n").join("\n");
}

function staleOutputs(outputs) {
    if (!fs.existsSync(OUT_DIR)) return [];
    const keep = new Set(outputs.map((o) => path.resolve(o.file)));
    return fs.readdirSync(OUT_DIR).filter((n) => /^catalog-.*\.js$/.test(n))
        .map((n) => path.join(OUT_DIR, n)).filter((f) => !keep.has(path.resolve(f)));
}

function summarize(result) {
    let bytes = 0;
    for (const o of result.outputs) if (/\.js$/.test(o.file)) bytes += Buffer.byteLength(o.text, "utf8");
    console.log(`${result.entries.length} listed patches, ${result.files.length} catalog files (${(bytes / 1024).toFixed(1)} KB):`);
    for (const f of result.files) {
        const pats = f.entries.map((e) => e.rec._p.label).join(", ");
        const ov = Array.from(f.overrides).sort();
        console.log(`  ${f.key}.js  ${f.payload.runes.length} runes  [${pats}]${ov.length ? "  overrides " + ov.join(", ") : ""}`);
    }
}

function runBuild() {
    const result = buildAll();
    let changed = 0;
    for (const o of result.outputs) if (P.writeIfChanged(o.file, o.text)) { changed++; console.log("wrote " + relPath(o.file)); }
    for (const f of staleOutputs(result.outputs)) { fs.unlinkSync(f); changed++; console.log("removed stale " + relPath(f)); }
    summarize(result);
    console.log(changed ? `${changed} file(s) changed.` : "No changes.");
}

function runCheck() {
    const result = buildAll();
    const problems = [];
    for (const o of result.outputs) {
        const old = fs.existsSync(o.file) ? normalizeEol(fs.readFileSync(o.file, "utf8")) : null;
        if (old !== o.text) problems.push((old === null ? "missing " : "out of date ") + relPath(o.file));
    }
    for (const f of staleOutputs(result.outputs)) problems.push("stale " + relPath(f));
    if (fs.existsSync(LEGACY_OUTPUT)) {
        const legacy = renderLegacy().text;
        if (normalizeEol(fs.readFileSync(LEGACY_OUTPUT, "utf8")) !== legacy) problems.push("runes-data.js differs from the --legacy output");
        else console.log("runes-data.js matches the --legacy output byte for byte.");
    }
    summarize(result);
    if (problems.length) {
        console.error("Check failed:\n  " + problems.join("\n  "));
        process.exitCode = 1;
    } else console.log("All rune outputs are up to date; R1-R7, C1/C2, G2/G3/G5 hold.");
}

// ---------------------------------------------------------------------------
// --audit: every DDragon patch equals the listed patch in effect (C3)
// ---------------------------------------------------------------------------

function runAudit(rawDir) {
    if (!rawDir) fail("--audit needs the raw cache directory (…/scratchpad/patches/raw)");
    const dir = fs.existsSync(path.join(rawDir, "rune")) ? path.join(rawDir, "rune") : rawDir;
    const builds = fs.readdirSync(dir).map((n) => /^rune-(\d+\.\d+\.\d+)\.json$/.exec(n)).filter(Boolean).map((m) => m[1]);
    if (!builds.length) fail("no rune-<build>.json files in " + dir);
    const lastByPatch = new Map();
    for (const b of builds) {
        const p = P.fromDdragon(b);
        const k = p.key;
        if (!lastByPatch.has(k) || P.compareBuild(lastByPatch.get(k).build, b) < 0) lastByPatch.set(k, { patch: p, build: b });
    }
    const patchesInOrder = Array.from(lastByPatch.values()).sort((a, b) => P.compare(a.patch, b.patch));
    const result = buildAll();
    const listed = result.entries;
    const overrides = loadOverrides();
    const noise = loadNoise();
    const allNoise = Array.from(noise.keys());
    let identical = 0, noiseOnly = 0;
    const failures = [];
    const noiseHits = new Map();
    for (const { patch: p, build } of patchesInOrder) {
        if (P.compare(p, "V7.21") > 0) continue;
        const eff = listed.filter((e) => P.compare(e.rec._p, p) <= 0).pop();
        if (!eff) { failures.push(`${p.label}: no listed patch in effect`); continue; }
        const raw = readJson(path.join(dir, "rune-" + build + ".json"));
        let built;
        try { built = buildCatalog(p, { ddragon: build }, trimCatalog(raw), overrides, { allowStale: true, label: p.label }); }
        catch (e) { failures.push(e.message); continue; }
        const isListed = P.equal(eff.rec._p, p);
        const diff = diffPayloads(eff.payload, built.payload);
        if (!diff.length) { identical++; continue; }
        if (isListed) { failures.push(`${p.label}: DDragon ${build} differs from the committed source (${diff.length} differences)`); continue; }
        const left = coveredByNoise(diff, p, allNoise, noise);
        if (left.length) failures.push(`${p.label} (DDragon ${build}) differs from ${eff.rec._p.label}: ${left.slice(0, 8).map((d) => d.id + " " + d.field).join(", ")}${left.length > 8 ? " …" : ""}`);
        else {
            noiseOnly++;
            for (const nid of allNoise) {
                const a = noise.get(nid).audit;
                if (a && inRange(p, a) && diff.some((d) => a.runes.includes(d.id) && a.fields.includes(d.field)))
                    noiseHits.set(nid, (noiseHits.get(nid) || []).concat(p.label));
            }
        }
    }
    const audited = identical + noiseOnly + failures.length;
    console.log(`Audited ${audited} DDragon patches (V3.6-V7.21, last build each): ${identical} equal the listed patch in effect, ${noiseOnly} differ only by listed noise, ${failures.length} fail.`);
    for (const [nid, list] of noiseHits) console.log(`  ${nid}: ${list.join(", ")}`);
    if (failures.length) {
        console.error("Audit failed:\n  " + failures.join("\n  "));
        process.exitCode = 1;
    }
}

// ---------------------------------------------------------------------------
// Legacy runes-data.js (until phase 2 removes it). Byte-identical to the
// output of the generator at commit 9a0c627; the catalogs now come from
// data/sources/runes/ddragon/. The V6.24 dataset reads 6.22.1: the 6.24.1
// catalog it used is identical at calculator level (the V6.22-V7.2 state), so
// only its version string is carried over.
// ---------------------------------------------------------------------------

const LEGACY_DATASETS = [
    {
        source: "7.21.1",
        catalog: "runes-V7.21.1.json",
        id: "preReforged-V7.21",
        season: 7,
        seasonLabel: "Season 7 (Pre-Reforged)",
        patch: "V7.21",
        patchLabel: "V7.21 (Final pre-Reforged)",
    },
    {
        source: "6.22.1",
        version: "6.24.1",
        catalog: "runes-V6.24.1.json",
        id: "preReforged-V6.24",
        season: 6,
        seasonLabel: "Season 6",
        patch: "V6.24",
        patchLabel: "V6.24 (Late Season 6)",
    },
    {
        source: "5.21.1",
        catalog: "runes-V5.21.1.json",
        id: "preReforged-V5.21",
        season: 5,
        seasonLabel: "Season 5",
        patch: "V5.21",
        patchLabel: "V5.21 (Late Season 5)",
    },
    {
        source: "4.20.2",
        catalog: "runes-V4.20.2.json",
        id: "preReforged-V4.20",
        season: 4,
        seasonLabel: "Season 4",
        patch: "V4.20",
        patchLabel: "V4.20 (Late Season 4)",
    },
    {
        source: "3.14.41",
        catalog: "runes-V3.14.41.json",
        id: "preReforged-V3.14",
        season: 3,
        seasonLabel: "Season 3",
        patch: "V3.14",
        patchLabel: "V3.14 (Late Season 3)",
    },
];

// Legacy description fixes (the per-patch catalogs use runes-overrides.json
// ro-001/ro-003 instead). 5401 Mark of Precision (V6.22-V7.21 catalogs):
// "+0.7 Leth / +0.48 M.Pen" is stale short text; the client data says
// "+0.88 Lethality / +0.48 Magic Penetration".
const LEGACY_DESC_FIXES = {
    "5401": { was: "+0.7 Leth / +0.48 M.Pen", desc: "+0.88 Lethality / +0.48 Magic Penetration" },
};

function legacyRuneDescription(id, entry) {
    const fix = LEGACY_DESC_FIXES[id];
    return fix && entry.description === fix.was ? fix.desc : entry.description;
}

function legacyConvertStats(id, entry) {
    const base = {};
    const perLevel = {};
    for (const [ddKey, raw] of Object.entries(entry.stats || {})) {
        if (!raw) continue;
        const map = STAT_MAP[ddKey];
        if (!map) throw new Error(`Unmapped stat key ${ddKey} on rune ${id} (${entry.name})`);
        const target = map.perLevel ? perLevel : base;
        target[map.key] = round4((target[map.key] || 0) + raw * (map.mult || 1));
    }
    const desc = legacyRuneDescription(id, entry);
    if (/\bLeth\b/i.test(desc))
        throw new Error(`Rune ${id} (${entry.name}): short lethality text "${desc}"; check it against the client data and add a DESC_FIXES entry`);
    const descStat = (re, key, target = base) => {
        const m = re.exec(desc);
        if (m && !(key in target)) target[key] = round4(parseFloat(m[1]));
    };
    descStat(/\+([\d.]+)\s+lethality\b/i, "lethality");
    descStat(/\+([\d.]+)\s+magic\s+penetration\b/i, "mpen");
    descStat(/\+([\d.]+)%\s+life\s?steal/i, "ls");
    descStat(/\+([\d.]+)%\s+spell\s?vamp/i, "sv");
    descStat(/\+([\d.]+)\s+Energy regen\/5 sec per level/i, "energyRegen", perLevel);
    if (!("energyRegen" in perLevel)) descStat(/\+([\d.]+)\s+Energy regen\/5 sec/i, "energyRegen");
    descStat(/\+([\d.]+)\s+Energy\/level/i, "energy", perLevel);
    if (!("energy" in perLevel)) descStat(/\+([\d.]+)\s+Energy(?!\s*regen|\/level)/i, "energy");
    return { base, perLevel };
}

function legacyParseCatalog(catalog) {
    const runes = [];
    for (const [id, entry] of Object.entries(catalog.data)) {
        const category = CATEGORY_BY_TYPE[entry.rune.type];
        if (!category) throw new Error(`Unknown rune type ${entry.rune.type} on ${id}`);
        const { base, perLevel } = legacyConvertStats(id, entry);
        if (!Object.keys(base).length && !Object.keys(perLevel).length)
            throw new Error(`Rune ${id} (${entry.name}) has no stats`);
        runes.push({
            id: id,
            name: entry.name,
            category: category,
            tier: Number(entry.rune.tier),
            icon: entry.image.full,
            desc: legacyRuneDescription(id, entry),
            event: isEventRune(id),
            base: base,
            perLevel: perLevel,
        });
    }
    runes.sort((a, b) =>
        CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
        || (a.event ? 1 : 0) - (b.event ? 1 : 0)
        || b.tier - a.tier                       // Greater (T3) first
        || a.name.localeCompare(b.name));
    return runes;
}

function legacyRuneLines(runes) {
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

function legacyDataSetBlock(cfg, version, runes) {
    return `    {
        id: ${JSON.stringify(cfg.id)},
        season: ${cfg.season},
        seasonLabel: ${JSON.stringify(cfg.seasonLabel)},
        patch: ${JSON.stringify(cfg.patch)},
        patchLabel: ${JSON.stringify(cfg.patchLabel)},
        slots: { mark: 9, seal: 9, glyph: 9, quintessence: 3 },
        ddragonVersion: ${JSON.stringify(version)},
        iconBasePath: "images/runes/",
        parchmentImage: "images/runes/summoners_runes_bg.jpg",
        runes: [
${legacyRuneLines(runes)}
        ],
    },`;
}

function renderLegacy() {
    const blocks = [];
    const summary = [];
    for (const cfg of LEGACY_DATASETS) {
        const catalog = loadSource({ ddragon: cfg.source });
        const version = cfg.version || catalog.version;
        const runes = legacyParseCatalog(catalog);
        blocks.push(legacyDataSetBlock(cfg, version, runes));
        const byCat = {};
        for (const r of runes) byCat[r.category] = (byCat[r.category] || 0) + 1;
        summary.push({ id: cfg.id, version: version, count: runes.length, byCat });
    }
    const wrap = (text, prefix) => {
        const lines = [];
        let line = prefix;
        for (const word of text.split(" ")) {
            if (line.length + word.length + 1 > 79 && line.trim() !== "//") { lines.push(line); line = "//"; }
            line += " " + word;
        }
        lines.push(line);
        return lines.join("\n");
    };
    const andList = (items) => items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
    const snapshots = LEGACY_DATASETS.map((cfg) => cfg.patchLabel);
    const catalogs = LEGACY_DATASETS.map((cfg) => cfg.catalog);
    const fixedIds = Object.keys(LEGACY_DESC_FIXES).join(", ");
    const text = `// Pre-Runes-Reforged rune catalogs (the system retired with patch V7.22 on
// 2017-11-08). Ships one dataset per pre-Reforged snapshot we support, the
${wrap(`first being the default: ${andList(snapshots)}.`, "//")}
//
// GENERATED FILE — do not edit by hand. Regenerate with:
//     node generate-runes-data.js
// Sources of truth: the Riot Data Dragon rune.json catalogs under data/
${wrap(`(${catalogs.join(", ")}). Stats, names, tiers, and icon filenames come straight from Riot's data; Lethality values are parsed from description text on catalogs that carry them (V6.22+). Older catalogs express physical penetration as flat armor penetration and are mapped to the "arpen" stat instead. Description text Data Dragon gets wrong is replaced by a cited fix in the generator's DESC_FIXES before parsing (rune ${fixedIds}).`, "//")}
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
    return { text: text, summary: summary };
}

function runLegacy() {
    const out = renderLegacy();
    fs.writeFileSync(LEGACY_OUTPUT, out.text);
    for (const s of out.summary)
        console.log(`${s.id} (DDragon ${s.version}): ${s.count} runes`, s.byCat);
    console.log(`Wrote ${out.summary.length} datasets to ${LEGACY_OUTPUT}`);
}

// ---------------------------------------------------------------------------

function main(argv) {
    if (argv.includes("--legacy")) return runLegacy();
    if (argv.includes("--check")) return runCheck();
    const ai = argv.indexOf("--audit");
    if (ai >= 0) return runAudit(argv[ai + 1]);
    if (argv.length) fail("unknown arguments: " + argv.join(" ") + " (use --check, --audit <raw>, or --legacy)");
    return runBuild();
}

module.exports = {
    STAT_MAP: STAT_MAP, APP_STAT_KEYS: APP_STAT_KEYS, CATEGORY_BY_TYPE: CATEGORY_BY_TYPE,
    trimCatalog: trimCatalog, convertRune: convertRune, convertCatalog: convertCatalog,
    buildCatalog: buildCatalog, diffPayloads: diffPayloads, buildAll: buildAll,
    renderLegacy: renderLegacy, loadOverrides: loadOverrides,
};

if (require.main === module) {
    try { main(process.argv.slice(2)); }
    catch (e) { console.error(e.message); process.exitCode = 1; }
}
