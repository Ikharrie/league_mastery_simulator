#!/usr/bin/env node
// tools/check-patches.js: the automated invariants of the per-patch datasets
// (DESIGN §7.1): G registry, C change rule, M masteries, R runes, F Runes
// Reforged. tools/build-all.js runs it last. tools/test-links.js (L) and
// tools/test-carry.js (X) reuse the reference code exported at the bottom
// (World loader, codecs, carry rules, validators, reporter).
//
// Written against the SPECIFICATION, not against the generators: the listed
// patches, counts, season boundaries, defaults, legacy ids, families, rank
// totals and shard eras are hard-coded from DESIGN.md (§0, §1.7, §3.1-§3.5,
// §4.2) and the research, so a generator bug cannot hide behind its own
// output. Inputs (all read from the site root, default the repo):
//   patch-registry.js + lol-data.js                         (T1)
//   data/patches/<page>.json, <page>-overrides.json,
//   data/patches/noise/<page>.json, data/<page>/manifest.json,
//   the generated data files, data/sources/**              (T2 / T5 / T7a)
//   runes-calculator.js CLIENT_STAT, runes-reforged-data.js
//   reforgedShardEras                                       (T6 / T7b)
//   tools/fixtures/spotchecks.json                          (M6)
//
// Every check prints PASS, FAIL or SKIP. A check whose input does not exist
// yet, or still comes from a stub listing or the pre-rework code, is
// SKIPPED with the reason: nothing passes silently. Exit code: 0 = every
// check ran and passed; 1 = something failed; 2 = nothing failed but
// something was skipped (incomplete). --allow-skip turns 2 into 0.
//
// Usage (from the repo root)
//   node tools/check-patches.js [--only G1,M6,...] [--root <site>]
//        [--research <scratchpad>\patches] [--ddragon <versions.json>]
//        [--audit [<raw cache dir>]] [--json <file>] [--verbose] [--allow-skip]
//   --only      run these checks (ids or prefixes: --only G,M6)
//   --root      the site to check (default: the repo)
//   --research  fallbacks while data/sources/** is not committed yet: the
//               DDragon builds <dir>/raw/mastery/mastery-<build>.json (M2,
//               M5) and the versions list <dir>/raw/versions.json (G3). Read
//               only; nothing is ever downloaded
//   --ddragon   the DDragon versions list for G3 (default
//               data/sources/ddragon-versions.json, then --research)
//   --audit     also run the optional audits C3 and F3 against the shared
//               download cache: <raw>/mastery/mastery-<build>.json,
//               <raw>/rune/rune-<build>.json,
//               <raw>/reforged/runesReforged-<build>.json (default
//               <research>/raw). A cache file that is missing is skipped
//   --json      also write the results as JSON
//   --verbose   print every detail line (default: the first 12 per check)
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const P = require("./lib/patches.js");

const REPO = path.resolve(__dirname, "..");
const PAGES = ["masteries", "runes", "reforged"];
const TIER_NAMES = ["offense", "defense", "utility"];
const KEYSTONE_TREES = ["ferocity", "cunning", "resolve"];
const DEFAULT_PAGE_NAME = "Mastery Page 1";

// ===========================================================================
// 1. The specification (DESIGN.md), hard-coded
// ===========================================================================

// §3.2 listed patches. ° = season boundary with no change against the
// previous listed patch (the first listed patch of a page counts as one);
// * = season boundary that has a change; no mark = a change.
const LISTED = {
    masteries: {
        s1: "V1.0.0.32° V1.0.0.52 V1.0.0.61 V1.0.0.63 V1.0.0.72 V1.0.0.101 V1.0.0.109 V1.0.0.110 V1.0.0.118b V1.0.0.128°",
        s2: "V1.0.0.129* V1.0.0.131 V1.0.0.133 V1.0.0.151°",
        s3: "V1.0.0.152* V3.13°",
        s4: "V3.14* V3.15 V4.2 V4.5 V4.19°",
        s5: "V4.20° V5.10 V5.12 V5.21°",
        s6: "V5.22* V5.23 V5.24 V6.1 V6.2 V6.4 V6.7 V6.8 V6.12 V6.21°",
        s7: "V6.22* V6.24 V7.2 V7.4 V7.5 V7.6 V7.21°"
    },
    runes: {
        s1: "V1.0.0.63° V1.0.0.72 V1.0.0.94(b) V1.0.0.103 V1.0.0.105 V1.0.0.107 V1.0.0.110 V1.0.0.128*",
        s2: "V1.0.0.129° V1.0.0.131 V1.0.0.132 V1.0.0.138 V1.0.0.151°",
        s3: "V1.0.0.152* V3.04 V3.13°",
        s4: "V3.14° V4.5 V4.19°",
        s5: "V4.20° V5.21°",
        s6: "V5.22° V6.21°",
        s7: "V6.22* V7.21°"
    },
    reforged: {
        s8: "V7.22° V7.23 V7.24 V8.1 V8.2 V8.3 V8.4 V8.5 V8.6 V8.7 V8.8 V8.9 V8.10 V8.11 V8.12 V8.13 V8.14 V8.15 V8.16 V8.20 V8.22*",
        s9: "V8.23* V8.24 V9.1 V9.2 V9.4 V9.5 V9.6 V9.7 V9.8 V9.9 V9.10 V9.11 V9.16 V9.22°",
        s10: "V9.23* V9.24 V10.1 V10.4 V10.5 V10.6 V10.7 V10.12 V10.13 V10.14 V10.15 V10.16 V10.18 V10.20 V10.21 V10.22°",
        s11: "V10.23* V11.1 V11.2 V11.6 V11.10 V11.11 V11.13 V11.17 V11.19 V11.21 V11.22°",
        s12: "V11.23* V11.24 V12.1 V12.2 V12.6 V12.7 V12.10 V12.11 V12.12 V12.14 V12.15 V12.20 V12.21°",
        s13: "V12.22° V13.1 V13.3 V13.4 V13.5 V13.6 V13.12 V13.15 V13.20 V13.21 V13.24°",
        s14: "V14.1* V14.2 V14.4 V14.10 V14.11 V14.12 V14.13 V14.14 V14.15 V14.17 V14.18 V14.19 V14.20 V14.21 V14.24°",
        s2025: "V25.S1.1* V25.S1.2 V25.S1.3 V25.05 V25.09 V25.10 V25.12 V25.14 V25.19 V25.21 V25.22 V25.24*",
        s2026: "V26.01* V26.03 V26.09 V26.10 V26.11 V26.13 V26.15 V26.16 V26.17 V26.19°"
    }
};
// §0
const EXPECT_TOTALS = {
    masteries: { total: 42, noChange: 9, change: 33, perSeason: { s1: 10, s2: 4, s3: 2, s4: 5, s5: 4, s6: 10, s7: 7 } },
    runes: { total: 25, noChange: 11, change: 14, perSeason: { s1: 8, s2: 5, s3: 3, s4: 3, s5: 2, s6: 2, s7: 2 } },
    reforged: { total: 123, noChange: 9, change: 114, perSeason: { s8: 21, s9: 14, s10: 16, s11: 11, s12: 13, s13: 11, s14: 15, s2025: 12, s2026: 10 } }
};
// §3.1
const SEASONS = [
    ["s1", "V1.0.0.32", "V1.0.0.128"], ["s2", "V1.0.0.129", "V1.0.0.151"], ["s3", "V1.0.0.152", "V3.13"],
    ["s4", "V3.14", "V4.19"], ["s5", "V4.20", "V5.21"], ["s6", "V5.22", "V6.21"], ["s7", "V6.22", "V7.21"],
    ["s8", "V7.22", "V8.22"], ["s9", "V8.23", "V9.22"], ["s10", "V9.23", "V10.22"], ["s11", "V10.23", "V11.22"],
    ["s12", "V11.23", "V12.21"], ["s13", "V12.22", "V13.24"], ["s14", "V14.1", "V14.24"],
    ["s2025", "V25.S1.1", "V25.24"], ["s2026", "V26.01", "V26.19"]
].map(function (s) { return { key: s[0], first: s[1], last: s[2] }; });
const LIVE = { patch: "V26.19", ddragon: "16.19.1" };
// The page bounds that differ from the season bounds (explicit, §3.1 / D2).
const PAGE_BOUND_EXCEPTIONS = { runes: { s1: { first: "V1.0.0.63" } } };
// §3.4
const SEASON_DEFAULTS = {
    masteries: { s1: "m-V1.0.0.128", s2: "m-V1.0.0.131", s3: "m-V1.0.0.152", s4: "m-V4.19", s5: "m-V5.21", s6: "m-V5.22", s7: "m-V7.21" },
    runes: { s1: "preReforged-V1.0.0.128", s2: "preReforged-V1.0.0.151", s3: "preReforged-V3.13", s4: "preReforged-V4.19",
        s5: "preReforged-V5.21", s6: "preReforged-V6.21", s7: "preReforged-V7.21" },
    reforged: { s8: "rr-v8-22", s9: "rr-v9-22", s10: "rr-v10-22", s11: "rr-v11-22", s12: "rr-v12-21", s13: "rr-v13-24",
        s14: "rr-v14-19", s2025: "rr-v25-24", s2026: "rr-v26-19" }
};
const PAGE_DEFAULTS = { masteries: "m-V1.0.0.152", runes: "preReforged-V7.21", reforged: "rr-v26-19" };
// §4.2: [page, legacy id, canonical id, season now, legacy codec]
const LEGACY = [
    ["masteries", "s1-final", "m-V1.0.0.128", "s1", "s1-final"],
    ["masteries", "s2-ahri", "m-V1.0.0.131", "s2", "s2-ahri"],
    ["masteries", "s3-pbe", "m-V1.0.0.152", "s3", "s3-pbe"],
    ["masteries", "s4-final", "m-V4.20", "s5", "s4-final"],
    ["masteries", "s5-final", "m-V5.21", "s5", "s5-final"],
    ["masteries", "s6-launch", "m-V5.22", "s6", "s6-launch"],
    ["masteries", "s7-preseason", "m-V6.22", "s7", "s7-preseason"],
    ["masteries", "s7-final", "m-V7.21", "s7", "s7-final"],
    ["runes", "preReforged-V3.14", "preReforged-V3.14", "s4"],
    ["runes", "preReforged-V4.20", "preReforged-V4.20", "s5"],
    ["runes", "preReforged-V5.21", "preReforged-V5.21", "s5"],
    ["runes", "preReforged-V6.24", "preReforged-V6.22", "s7"],
    ["runes", "preReforged-V7.21", "preReforged-V7.21", "s7"],
    ["reforged", "rr-v7-22", "rr-v7-22", "s8"],
    ["reforged", "rr-v8-23", "rr-v8-23", "s9"],
    ["reforged", "rr-v9-23", "rr-v9-23", "s10"],
    ["reforged", "rr-v10-23", "rr-v10-23", "s11"],
    ["reforged", "rr-v11-23", "rr-v11-23", "s12"],
    ["reforged", "rr-v12-23", "rr-v12-22", "s13"],
    ["reforged", "rr-v13-24", "rr-v13-24", "s13"],
    ["reforged", "rr-v14-19", "rr-v14-19", "s14"],
    ["reforged", "rr-v25-24", "rr-v25-24", "s2025"],
    ["reforged", "rr-v26-13", "rr-v26-13", "s2026"]
].map(function (r) { return { page: r[0], id: r[1], to: r[2], season: r[3], codec: r[4] || null }; });
// The 24th legacy form: a mastery / rune hash without "<id>|".
const PLAIN = { masteries: { to: "m-V1.0.0.152", codec: "s3-pbe", season: "s3" }, runes: { to: "preReforged-V7.21", season: "s7" } };
// §2.3 resolve rule (3) samples: an unlisted patch -> the latest listed patch
// at or before it; null = nothing listed at or before it / not an id.
const UNLISTED_SAMPLES = [
    ["masteries", "m-V1.0.0.60", "m-V1.0.0.52"], ["masteries", "m-V3.6", "m-V1.0.0.152"],
    ["masteries", "m-V4.10", "m-V4.5"], ["masteries", "m-V5.11", "m-V5.10"],
    ["masteries", "m-V6.23", "m-V6.22"], ["masteries", "m-V7.10", "m-V7.6"],
    ["runes", "preReforged-V1.0.0.96", "preReforged-V1.0.0.94b"], ["runes", "preReforged-V3.6", "preReforged-V3.04"],
    ["runes", "preReforged-V5.1", "preReforged-V4.20"], ["runes", "preReforged-V7.2", "preReforged-V6.22"],
    ["reforged", "rr-v8-17", "rr-v8-16"], ["reforged", "rr-v12-5", "rr-v12-2"],
    ["reforged", "rr-v25-4", "rr-v25-3"], ["reforged", "rr-v26-18", "rr-v26-17"],
    ["masteries", "m-V1.0.0.10", null], ["reforged", "rr-v7-21", null], ["masteries", "not-an-id", null]
];
// §1.7 families: [family, first, last, system, legacy codecs]
const FAMILIES = [
    ["classic-2011", "V1.0.0.32", "V1.0.0.128", "classic", ["s1-final"]],
    ["classic-2012", "V1.0.0.129", "V1.0.0.151", "classic", ["s2-ahri"]],
    ["classic-2013", "V1.0.0.152", "V3.13", "classic", ["s3-pbe"]],
    ["classic-2014a", "V3.14", "V5.10", "classic", ["s4-final"]],
    ["classic-2014b", "V5.12", "V5.21", "classic", ["s5-final"]],
    ["keystone-2016", "V5.22", "V6.21", "keystone", ["s6-launch"]],
    ["keystone-2017", "V6.22", "V7.21", "keystone", ["s7-preseason", "s7-final"]]
].map(function (f) { return { family: f[0], first: f[1], last: f[2], system: f[3], codecs: f[4] }; });
// M1: masteries / ranks per tree (offense, defense, utility), from the
// research (wiki snapshots without `removed`; DDragon 3.13.24 … 5.21.1).
const RANK_TOTALS = [
    ["V1.0.0.32", "V1.0.0.61", [[15, 32], [14, 31], [15, 32]]],
    ["V1.0.0.63", "V1.0.0.128", [[14, 31], [14, 31], [15, 32]]],     // Demolisher removed
    ["V1.0.0.129", "V1.0.0.151", [[17, 44], [16, 37], [16, 38]]],
    ["V1.0.0.152", "V3.13", [[18, 42], [19, 37], [19, 41]]],
    ["V3.14", "V5.21", [[20, 38], [19, 34], [18, 33]]]
];
// Key-set changes inside a family (everything else keeps its keys; curated
// aliases of §1.7 applied). From the research: wiki snapshots and DDragon.
const FAMILY_KEY_CHANGES = {
    "V1.0.0.63": [[0, [], ["demolisher"]]],
    "V1.0.0.131": [[2, ["strength-of-spirit"], ["perseverance"]]],
    "V5.24": [["cunning", ["assassin"], []]],
    "V6.4": [["ferocity", ["expose-weakness"], []]]
};
// §3.2 shard eras: [first patch, id]; V7.22-V8.22 have none.
const SHARD_ERAS = [["V8.23", "s8-23"], ["V9.1", "s9-1"], ["V9.2", "s9-2"], ["V10.23", "s10-23"],
    ["V11.21", "s11-21"], ["V14.2", "s14-2"], ["V25.22", "s25-22"]];
// §3.2 Reforged text overrides: perkText must hold these ids in these ranges.
const PERK_TEXT_RANGES = [
    { from: "V7.22", to: "V8.7", count: [58, 59] },
    { from: "V10.23", to: "V14.18", ids: ["8009"] },
    { from: "V14.10", to: null, ids: ["9101", "8463"] },
    { from: "V25.20", to: null, ids: ["8360"], text: { "8360": /270/ } }
];
const REFORGED_PATHS = [8000, 8100, 8200, 8300, 8400];
// §3.3 label examples / curated tags (an " (approx.)" suffix is allowed
// where the listing marks the patch low confidence, except where written).
const LABEL_EXAMPLES = {
    masteries: { "V1.0.0.32": "V1.0.0.32 (Launch)", "V1.0.0.129": "V1.0.0.129 (Preseason 2)", "V5.22": "V5.22 (Preseason 6)",
        "V5.10": "V5.10 (Utility rework)", "V5.12": "V5.12 (Defense rework)", "V7.21": "V7.21 (Final masteries)" },
    runes: { "V1.0.0.63": "=V1.0.0.63 (approx.)", "V4.5": "V4.5 (Rune rework)", "V6.22": "V6.22 (Lethality)",
        "V7.21": "V7.21 (Final pre-Reforged)", "V3.14": "V3.14 (Preseason 4)" },
    reforged: { "V7.22": "V7.22 (Runes Reforged)", "V8.4": "=V8.4", "V8.6": "V8.6 (Conqueror)",
        "V8.23": "V8.23 (Preseason 9 · Stat shards)", "V14.1": "V14.1 (Season start)", "V14.10": "V14.10 (Rune rework)",
        "V25.S1.1": "V25.S1.1 (Season start · Domination rework)", "V26.09": "V26.09 (Deathfire Touch)",
        "V26.19": "=V26.19 (Current)", "V12.22": "V12.22 (Preseason 13)" }
};
const REASONS = ["season-start", "season-end", "change", "season-start+change", "season-end+change"];
const CONFIDENCE = ["high", "medium", "low"];
const RUNE_CATEGORIES = ["mark", "seal", "glyph", "quintessence"];

function listedSpec(page) {
    const out = [];
    Object.keys(LISTED[page]).forEach(function (season) {
        const toks = LISTED[page][season].split(/\s+/);
        toks.forEach(function (t, i) {
            const mark = /[°*]$/.test(t) ? t.slice(-1) : "";
            const patch = mark ? t.slice(0, -1) : t;
            out.push({ season: season, patch: patch, mark: mark, change: mark !== "°",
                position: i === 0 ? "first" : i === toks.length - 1 ? "last" : "middle" });
        });
    });
    return out;
}

function familyOf(patch) {
    for (const f of FAMILIES) if (cmp(patch, f.first) >= 0 && cmp(patch, f.last) <= 0) return f;
    return null;
}
function rankTotalsOf(patch) {
    for (const r of RANK_TOTALS) if (cmp(patch, r[0]) >= 0 && cmp(patch, r[1]) <= 0) return r[2];
    return null;
}

// §3.5 rules, written out again on purpose (independent of patches.js).
const RULES = {
    era: function (page, p) { return page === "reforged" || cmp(p, "V7.1") >= 0 ? "lcu" : "air"; },
    airPeriod: function (p) {
        if (cmp(p, "V1.0.0.129") < 0) return "2010";
        if (cmp(p, "V3.01") < 0) return "2012";
        if (cmp(p, "V3.7") < 0) return "2013";
        return "2014";
    },
    combiner: function (p) { return RULES.era("runes", p) === "air" && cmp(p, "V5.1") < 0; },
    quintHalo: function (p) { return cmp(p, "V3.14") <= 0 ? "cream" : cmp(p, "V5.21") < 0 ? "ember" : "silver"; },
    system: function (p) { return cmp(p, "V5.22") < 0 ? "classic" : "keystone"; },
    look: function (p) { return cmp(p, "V1.0.0.129") < 0 ? "s1" : "client"; },
    fiveRank: function (p) { return cmp(p, "V6.22") < 0 ? "edge" : "pair"; },
    airIconVersion: function (p) { return cmp(p, "V6.22") >= 0 && cmp(p, "V6.24") <= 0 ? "5.22.3" : null; },
    shardEra: function (p) {
        let id = null;
        SHARD_ERAS.forEach(function (e) { if (cmp(p, e[0]) >= 0) id = e[1]; });
        return id;
    }
};

// ===========================================================================
// 2. Small helpers
// ===========================================================================

function cmp(a, b) { return P.compare(a, b); }
function eq(a, b) { return P.tryParse(a) && P.tryParse(b) ? P.equal(a, b) : false; }
function inRange(p, from, to) { return cmp(p, from) >= 0 && (to == null || cmp(p, to) <= 0); }
function isObj(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function readText(abs) {
    try { return fs.readFileSync(abs, "utf8").replace(/^﻿/, ""); } catch (e) { return null; }
}
function canon(x) { return P.stableStringify(x === undefined ? null : x); }
function deepEqual(a, b) { return canon(a) === canon(b); }
function hashOf(x) { return P.contentHash(x === undefined ? null : x); }
function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

// P0-A's key rule: lowercase, accents and apostrophes dropped, other runs of
// non-alphanumerics -> "-".
function slug(name) {
    return String(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Tooltip text for comparisons: tags out, <br> = space, whitespace collapsed.
function normText(s) {
    return String(s == null ? "" : s).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function normSeason(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return "s" + v;
    const s = String(v).trim().toLowerCase();
    if (/^s\d+$/.test(s)) return s;
    const m = /(\d{4}|\d+)/.exec(s);
    return m ? "s" + m[1] : null;
}

// Seeded PRNG (FNV-1a + mulberry32), the same construction as P0-A.
function makeRng(label) {
    let h = 0x811c9dc5;
    const s = "check-patches/v1/" + label;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    let a = h >>> 0;
    const next = function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = function (n) { return Math.floor(next() * n); };
    next.pick = function (arr) { return arr[next.int(arr.length)]; };
    return next;
}

// ===========================================================================
// 3. Reporter
// ===========================================================================

function Reporter(opts) {
    this.opts = opts || {};
    this.results = [];
}
Reporter.prototype.run = function (id, title, fn) {
    if (!this.selected(id)) return null;
    const r = { id: id, title: title, items: [], status: null };
    const add = function (status) { return function (msg) { r.items.push({ status: status, msg: String(msg) }); }; };
    const ctx = { pass: add("pass"), fail: add("fail"), skip: add("skip"), info: add("info") };
    try { fn(ctx); } catch (e) { ctx.fail("check crashed: " + (e && e.stack || e)); }
    const has = function (s) { return r.items.some(function (i) { return i.status === s; }); };
    r.status = has("fail") ? "FAIL" : has("skip") ? "SKIP" : has("pass") ? "PASS" : "SKIP";
    if (!r.items.length) r.items.push({ status: "skip", msg: "nothing to check" });
    this.results.push(r);
    this.print(r);
    return r;
};
Reporter.prototype.selected = function (id) {
    const only = this.opts.only;
    if (!only || !only.length) return true;
    return only.some(function (o) { return id === o || id.indexOf(o) === 0; });
};
Reporter.prototype.print = function (r) {
    const count = function (s) { return r.items.filter(function (i) { return i.status === s; }).length; };
    const parts = [];
    ["pass", "fail", "skip", "info"].forEach(function (s) { const n = count(s); if (n) parts.push(n + " " + s); });
    const out = this.opts.quiet ? function () {} : console.log;
    out(r.status.padEnd(4) + " " + r.id.padEnd(4) + " " + r.title + "  [" + parts.join(", ") + "]");
    const limit = this.opts.verbose ? Infinity : 12;
    ["fail", "skip", "info"].concat(this.opts.verbose ? ["pass"] : []).forEach(function (s) {
        const list = r.items.filter(function (i) { return i.status === s; });
        list.slice(0, limit).forEach(function (i) { out("       " + s.padEnd(4) + " " + i.msg); });
        if (list.length > limit) out("       " + s.padEnd(4) + " … " + (list.length - limit) + " more (--verbose)");
    });
};
Reporter.prototype.summary = function () {
    const n = function (s, list) { return list.filter(function (r) { return r.status === s; }).length; };
    const rs = this.results;
    return { pass: n("PASS", rs), fail: n("FAIL", rs), skip: n("SKIP", rs), total: rs.length };
};
Reporter.prototype.finish = function (name) {
    const s = this.summary();
    const verdict = s.fail ? "FAILED" : s.skip ? "INCOMPLETE" : "PASSED";
    const out = this.opts.quiet ? function () {} : console.log;
    out("");
    out(name + ": " + verdict + " (" + s.pass + " passed, " + s.fail + " failed, " + s.skip + " skipped of " + s.total + ")");
    if (this.opts.json) {
        fs.writeFileSync(this.opts.json, JSON.stringify({ tool: name, verdict: verdict, summary: s, results: this.results }, null, 1) + "\n");
    }
    return s.fail ? 1 : s.skip && !this.opts.allowSkip ? 2 : 0;
};

// ===========================================================================
// 4. World: the site's inputs, loaded lazily and tolerant of missing files
// ===========================================================================

function World(opts) {
    this.opts = opts || {};
    this.root = path.resolve(this.opts.root || REPO);
    this.research = this.opts.research ? path.resolve(this.opts.research) : null;
    this.cache = {};
}
World.prototype.abs = function (rel) { return path.join(this.root, rel); };
World.prototype.exists = function (rel) { return fs.existsSync(this.abs(rel)); };
World.prototype.memo = function (key, fn) {
    if (!(key in this.cache)) this.cache[key] = fn.call(this);
    return this.cache[key];
};
// {file, value} | {file, missing: true} | {file, error}
World.prototype.json = function (rel) {
    return this.memo("json:" + rel, function () {
        const text = readText(this.abs(rel));
        if (text === null) return { file: rel, missing: true };
        try { return { file: rel, value: JSON.parse(text) }; } catch (e) { return { file: rel, error: "invalid JSON: " + e.message }; }
    });
};
// One JSON document, or one JSON object per line (// comments allowed).
World.prototype.jsonOrLines = function (rel) {
    return this.memo("jsonl:" + rel, function () {
        const text = readText(this.abs(rel));
        if (text === null) return { file: rel, missing: true };
        try { return { file: rel, value: JSON.parse(text) }; } catch (e) { /* lines */ }
        const out = [];
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i].trim().replace(/,$/, "");
            if (!l || /^\/\//.test(l) || l === "[" || l === "]") continue;
            try { out.push(JSON.parse(l)); } catch (e) { return { file: rel, error: "line " + (i + 1) + ": " + e.message }; }
        }
        return { file: rel, value: out };
    });
};
World.prototype.seasonsJson = function () { return this.json("data/patches/seasons.json"); };
World.prototype.aliasesJson = function () { return this.json("data/patches/aliases.json"); };

function recordsOf(v) {
    if (Array.isArray(v)) return v;
    if (isObj(v)) for (const k of ["patches", "entries", "records"]) if (Array.isArray(v[k])) return v[k];
    return null;
}

// The data task's listing: {file, records, stub} | {missing} | {error}
World.prototype.listing = function (page) {
    return this.memo("listing:" + page, function () {
        const j = this.json("data/patches/" + page + ".json");
        if (j.missing || j.error) return j;
        const recs = recordsOf(j.value);
        if (!recs) return { file: j.file, error: "no record array (expected an array or {patches: [...]})" };
        return { file: j.file, records: recs, stub: !!(isObj(j.value) && j.value.stub) };
    });
};

World.prototype.manifest = function (page) {
    return this.memo("manifest:" + page, function () {
        const rel = "data/" + page + "/manifest.json";
        const j = this.json(rel);
        if (j.missing || j.error) return j;
        const v = isObj(j.value) && isObj(j.value.entries) ? j.value.entries : j.value;
        if (!isObj(v)) return { file: rel, error: "expected an object {id: {data, file, hash}}" };
        const map = {};
        Object.keys(v).forEach(function (k) { if (!/^_/.test(k)) map[k] = v[k]; });
        return { file: rel, map: map };
    });
};

function evalScript(files, ctx, timeout) {
    vm.createContext(ctx);
    files.forEach(function (f) { vm.runInContext(f.text, ctx, { filename: f.name, timeout: timeout || 10000 }); });
    return ctx;
}

function browserStubs(extra) {
    const noop = function () {};
    const el = function () {
        return { setAttribute: noop, getAttribute: function () { return null; }, appendChild: noop, removeChild: noop,
            addEventListener: noop, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } } };
    };
    const document = {
        readyState: "loading", documentElement: el(), head: el(), body: el(),
        write: noop, writeln: noop, createElement: el, getElementById: function () { return null; },
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getElementsByTagName: function () { return [el()]; }, addEventListener: noop
    };
    const ctx = Object.assign({
        document: document, location: { pathname: "/index.html", hash: "", href: "file:///index.html", search: "" },
        navigator: { userAgent: "node" }, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
        Promise: Promise, JSON: JSON, Math: Math
    }, extra || {});
    ctx.window = ctx; ctx.self = ctx;
    return ctx;
}

// patch-registry.js: {file, SEASON_NAV, LOL_PAGE_DEFAULT, LOL_PATCHES,
// LOL_ALIASES, LOL_REGISTRY, stub: {page: bool}} | {missing} | {error}
World.prototype.registry = function () {
    return this.memo("registry", function () {
        const rel = "patch-registry.js";
        const text = readText(this.abs(rel));
        if (text === null) return { file: rel, missing: true };
        try {
            const ctx = evalScript([{ name: rel, text: text + "\n;this.__reg={SEASON_NAV:typeof SEASON_NAV!=='undefined'?SEASON_NAV:undefined," +
                "LOL_PAGE_DEFAULT:typeof LOL_PAGE_DEFAULT!=='undefined'?LOL_PAGE_DEFAULT:undefined," +
                "LOL_PATCHES:typeof LOL_PATCHES!=='undefined'?LOL_PATCHES:undefined," +
                "LOL_ALIASES:typeof LOL_ALIASES!=='undefined'?LOL_ALIASES:undefined," +
                "LOL_REGISTRY:typeof LOL_REGISTRY!=='undefined'?LOL_REGISTRY:undefined};" }], browserStubs());
            const reg = clone(ctx.__reg);
            const out = Object.assign({ file: rel }, reg);
            const missing = ["SEASON_NAV", "LOL_PAGE_DEFAULT", "LOL_PATCHES", "LOL_ALIASES"].filter(function (k) { return reg[k] === undefined; });
            if (missing.length) return { file: rel, error: "does not define " + missing.join(", ") };
            out.stub = {};
            PAGES.forEach(function (page) {
                const src = reg.LOL_REGISTRY && reg.LOL_REGISTRY.sources && reg.LOL_REGISTRY.sources[page];
                out.stub[page] = !!(src && src.stub);
            });
            out.text = text;
            return out;
        } catch (e) { return { file: rel, error: "does not run: " + e.message }; }
    });
};

// lol-data.js on top of the registry: {LolPatches, LolData} | {missing} | {error}
World.prototype.runtime = function () {
    return this.memo("runtime", function () {
        const reg = this.registry();
        if (reg.missing || reg.error) return { missing: true, why: "patch-registry.js " + (reg.missing ? "missing" : "broken") };
        const rel = "lol-data.js";
        const text = readText(this.abs(rel));
        if (text === null) return { file: rel, missing: true, why: "lol-data.js missing" };
        try {
            const ctx = evalScript([{ name: "patch-registry.js", text: reg.text }, { name: rel, text: text }], browserStubs());
            if (!ctx.LolPatches || typeof ctx.LolPatches.resolve !== "function") return { file: rel, error: "does not define LolPatches.resolve" };
            return { file: rel, LolPatches: ctx.LolPatches, LolData: ctx.LolData || null };
        } catch (e) { return { file: rel, error: "does not run: " + e.message }; }
    });
};

// Entries of a page: the registry's when it was built from the real listing,
// else derived from listing + manifest. {list, source, why, stale}
World.prototype.entries = function (page) {
    return this.memo("entries:" + page, function () {
        const reg = this.registry(), lst = this.listing(page);
        const regOk = !reg.missing && !reg.error && Array.isArray(reg.LOL_PATCHES && reg.LOL_PATCHES[page]);
        if (regOk && !reg.stub[page]) return { list: reg.LOL_PATCHES[page], source: "registry" };
        if (lst.records && !lst.stub) {
            return { list: this.derivedEntries(page), source: "listing", derived: true,
                why: regOk ? "patch-registry.js was built from the stub " + page + " listing (stale; re-run tools/build-registry.js)" : "patch-registry.js " + (reg.missing ? "missing" : "unusable") };
        }
        const why = (lst.missing ? lst.file + " missing" : lst.error ? lst.file + ": " + lst.error : lst.stub ? lst.file + " is a stub" : "no listing") +
            (regOk ? "; patch-registry.js only has the stub " + page + " listing" : "");
        return { list: null, source: null, why: why + " (" + ({ masteries: "T2", runes: "T5", reforged: "T7a" })[page] + " pending)",
            stubList: regOk ? reg.LOL_PATCHES[page] : null };
    });
};
World.prototype.derivedEntries = function (page) {
    const lst = this.listing(page), man = this.manifest(page);
    const map = man.map || {};
    return lst.records.map(function (rec) {
        const p = P.tryParse(rec.patch);
        const id = p ? P.idFor(page, p) : String(rec.patch);
        const m = map[id] || {};
        let file = m.file === undefined ? undefined : m.file;
        if (typeof file === "string" && file.indexOf("/") < 0) file = "data/" + page + "/" + file;
        const e = { id: id, season: normSeason(rec.season) || (p ? P.seasonOf(p) : null), patch: rec.patch,
            label: rec.label || (p ? safe(function () { return P.labelFor(page, rec); }) : null),
            date: rec.date, reason: rec.reason, confidence: rec.confidence,
            data: m.data === undefined ? (page === "reforged" && man.map ? null : undefined) : m.data,
            file: file, derived: true };
        if (page !== "masteries" && rec.source && rec.source.ddragon) e.ddragonVersion = String(rec.source.ddragon);
        if (m.ddragonVersion) e.ddragonVersion = m.ddragonVersion;
        if (rec.ddragonVersion) e.ddragonVersion = rec.ddragonVersion;
        if (isObj(rec.registry)) Object.assign(e, rec.registry);
        return e;
    });
};
function safe(fn) { try { return fn(); } catch (e) { return null; } }

World.prototype.entryByPatch = function (page, patch) {
    const ents = this.entries(page);
    if (!ents.list) return null;
    for (const e of ents.list) if (P.tryParse(e.patch) && eq(e.patch, patch)) return e;
    return null;
};
World.prototype.listingRecord = function (page, patch) {
    const lst = this.listing(page);
    if (!lst.records) return null;
    for (const r of lst.records) if (P.tryParse(r.patch) && eq(r.patch, patch)) return r;
    return null;
};

// A generated data file: {rel, missing} | {rel, error} |
// {rel, text, header: {generator, source, overrides[], patches[]}, calls[]}
World.prototype.dataFile = function (rel) {
    return this.memo("file:" + rel, function () {
        const text = readText(this.abs(rel));
        if (text === null) return { rel: rel, missing: true };
        const out = { rel: rel, text: text, header: parseHeader(text), calls: [], forbidden: [] };
        if (/\bfetch\s*\(|XMLHttpRequest|\$\.(ajax|getJSON|get|post)\s*\(|\bimport\s*\(/.test(text)) out.forbidden.push("network call (fetch / XHR / $.ajax / import())");
        const calls = out.calls;
        const ctx = browserStubs({
            LolData: { register: function (kind, key, payload) { calls.push({ kind: kind, key: key, payload: payload }); } },
            fetch: function () { throw new Error("generated data file calls fetch()"); },
            XMLHttpRequest: function () { throw new Error("generated data file uses XMLHttpRequest"); }
        });
        try { evalScript([{ name: rel, text: text }], ctx); } catch (e) { out.error = "does not run: " + e.message; }
        out.calls = calls.map(function (c) { return { kind: c.kind, key: c.key, payload: clone(c.payload) }; });
        return out;
    });
};

function parseHeader(text) {
    const lines = text.split(/\r?\n/, 4);
    const m1 = /^\/\/ GENERATED by (\S+) — do not edit\. Source: (.*)$/.exec(lines[0] || "");
    if (!m1) return null;
    const m2 = /^\/\/ Overrides: (.*?)\.(?: Patches using this file: (.*)\.)?$/.exec(lines[1] || "");
    const h = { generator: m1[1], source: m1[2].replace(/\.$/, ""), overrides: [], patches: null };
    if (m2) {
        h.overrides = m2[1] === "none" ? [] : m2[1].split(/,\s*/).filter(Boolean);
        h.patches = m2[2] ? m2[2].split(/,\s*/).filter(Boolean) : null;
    }
    return h;
}

// Payload of an entry: {payload} | {missing / error, why}
World.prototype.payload = function (entry) {
    if (!entry) return { error: true, why: "no entry" };
    if (entry.data === null) return { payload: null };
    if (entry.data === undefined) return { missing: true, why: entry.id + ": no data key (manifest missing)" };
    if (!entry.file) return { missing: true, why: entry.id + ": file not built yet" };
    const f = this.dataFile(entry.file);
    if (f.missing) return { missing: true, why: entry.file + " missing" };
    if (f.error) return { error: true, why: entry.file + ": " + f.error };
    const call = f.calls.filter(function (c) { return c.key === entry.data; })[0];
    if (!call) return { error: true, why: entry.file + " does not register " + JSON.stringify(entry.data) };
    return { payload: call.payload, file: f };
};
// {...entry, ...payload} as LolData.load resolves it; null when unavailable.
World.prototype.dataset = function (entry) {
    const r = this.payload(entry);
    if (!("payload" in r)) return null;
    return Object.assign({}, entry, r.payload || {});
};

// data/masteries/legacy-codecs.js -> {codec key: payload} | {missing} | {error}
World.prototype.legacyCodecs = function () {
    return this.memo("legacyCodecs", function () {
        const rel = "data/masteries/legacy-codecs.js";
        const f = this.dataFile(rel);
        if (f.missing) return { rel: rel, missing: true };
        if (f.error) return { rel: rel, error: f.error };
        const map = {};
        f.calls.forEach(function (c) { if (c.kind === "masteries-legacy") map[c.key] = c.payload; });
        return { rel: rel, map: map, file: f };
    });
};
World.prototype.fixtureCodecs = function () {
    return this.json("tools/fixtures/legacy-codecs.json");
};
World.prototype.fixtureLinks = function () {
    return this.json("tools/fixtures/legacy-links.json");
};

// runes-reforged-data.js tables: {eras, reworked} | {missing} | {error}
World.prototype.shardTables = function () {
    return this.memo("shards", function () {
        const rel = "runes-reforged-data.js";
        const text = readText(this.abs(rel));
        if (text === null) return { rel: rel, missing: true };
        try {
            const ctx = evalScript([{ name: rel, text: text + "\n;this.__eras=typeof reforgedShardEras!=='undefined'?reforgedShardEras:null;" +
                "this.__old=typeof reforgedDataSets!=='undefined'||typeof REFORGED_PERK_TEXT!=='undefined';" }], browserStubs());
            const eras = clone(ctx.__eras);
            if (!eras) return { rel: rel, error: "does not define reforgedShardEras" };
            const reworked = SHARD_ERAS.every(function (e) { return eras[e[1]]; });
            return { rel: rel, eras: eras, reworked: reworked, legacyTables: !!ctx.__old };
        } catch (e) { return { rel: rel, error: "does not run: " + e.message }; }
    });
};

// CLIENT_STAT keys of runes-calculator.js (+ whether it is reworked).
World.prototype.runeStatKeys = function () {
    return this.memo("statkeys", function () {
        const text = readText(this.abs("runes-calculator.js"));
        if (text === null) return { missing: true };
        const m = /var CLIENT_STAT\s*=\s*\[([\s\S]*?)\];/.exec(text);
        if (!m) return { error: "no CLIENT_STAT table" };
        const keys = [];
        m[1].replace(/key:\s*"(\w+)"/g, function (_, k) { keys.push(k); return _; });
        return { keys: keys, reworked: /\bLolData\b/.test(text) };
    });
};

// DDragon live patch list: {patches: [Patch], source} | null
World.prototype.ddragonPatches = function () {
    return this.memo("ddragon", function () {
        const cands = [];
        if (this.opts.ddragon) cands.push(path.resolve(this.opts.ddragon));
        cands.push(this.abs("data/sources/ddragon-versions.json"));
        if (this.research) cands.push(path.join(this.research, "raw", "versions.json"));
        for (const abs of cands) {
            const text = readText(abs);
            if (text === null) continue;
            let v;
            try { v = JSON.parse(text); } catch (e) { return { error: abs + ": invalid JSON" }; }
            const set = new Map();
            const visit = function (x, asKey) {
                if (typeof x === "string") {
                    let p = null;
                    if (/^(lolpatch_)?\d+\.\d+(\.\d+)*$/.test(x)) p = safe(function () { return P.fromDdragon(x); });
                    else if (/^V/i.test(x)) p = P.tryParse(x);
                    if (p) set.set(p.key, p);
                    return;
                }
                if (Array.isArray(x)) { x.forEach(function (y) { visit(y); }); return; }
                if (isObj(x)) Object.keys(x).forEach(function (k) {
                    if (/^_/.test(k)) return;
                    visit(k, true);
                    if (["patch", "name", "ddragon", "chosen", "build", "builds", "patches", "versions", "live"].indexOf(k) >= 0 || /^V|^\d/.test(k)) visit(x[k]);
                });
            };
            visit(v);
            const list = Array.from(set.values()).filter(function (p) { return p.major >= 3; });
            const relp = path.relative(this.root, abs);
            return { patches: P.sortPatches(list), source: relp && !/^\.\./.test(relp) ? relp : abs };
        }
        return null;
    });
};

// A DDragon mastery build (committed source first, then the research raw).
World.prototype.masterySource = function (build) {
    return this.memo("msrc:" + build, function () {
        const cands = [this.abs("data/sources/masteries/ddragon/" + build + ".json")];
        if (this.research) cands.push(path.join(this.research, "raw", "mastery", "mastery-" + build + ".json"));
        if (this.opts.audit) cands.push(path.join(this.opts.audit, "mastery", "mastery-" + build + ".json"));
        for (const abs of cands) {
            const text = readText(abs);
            if (text === null) continue;
            try {
                const v = JSON.parse(text);
                const tree = v.tree || (v.data && v.data.tree) || null;
                const data = isObj(v.data) && !v.data.tree ? v.data : isObj(v.masteries) ? v.masteries : null;
                let byId = data;
                if (Array.isArray(v.masteries)) { byId = {}; v.masteries.forEach(function (m) { byId[String(m.id)] = m; }); }
                return { source: path.relative(this.root, abs), tree: tree, data: byId };
            } catch (e) { return { error: abs + ": " + e.message }; }
        }
        return null;
    });
};

World.prototype.noise = function (page) {
    return this.memo("noise:" + page, function () {
        const j = this.json("data/patches/noise/" + page + ".json");
        if (j.missing || j.error) return j;
        const recs = [];
        const walk = function (x) {
            if (Array.isArray(x)) x.forEach(walk);
            else if (isObj(x)) {
                if (x.patch || x.patches || x.vs || x.what || x.item || x.reason || x.why) recs.push(x);
                else Object.keys(x).forEach(function (k) { if (!/^_/.test(k)) walk(x[k]); });
            }
        };
        walk(j.value);
        return { file: j.file, records: recs };
    });
};

World.prototype.overrides = function (page) {
    return this.memo("ovr:" + page, function () {
        const j = this.jsonOrLines("data/patches/" + page + "-overrides.json");
        if (j.missing || j.error) return j;
        const recs = recordsOf(j.value) || (isObj(j.value) && Array.isArray(j.value.overrides) ? j.value.overrides : null);
        if (!recs) return { file: j.file, error: "no override records" };
        return { file: j.file, records: recs.filter(isObj) };
    });
};

// ===========================================================================
// 5. Mastery helpers (payload shapes of DESIGN §1.6)
// ===========================================================================

function isKeystone(ds) { return !!ds && (ds.system === "keystone" || (isObj(ds.data) && Array.isArray(ds.data.trees))); }

// [{tree, treeIndex, tier (1-based), m, key}]
function masteryCells(ds) {
    const out = [];
    if (!ds || !ds.data) return out;
    if (isKeystone(ds)) {
        (ds.data.trees || []).forEach(function (t, ti) {
            (t.tiers || []).forEach(function (tier, j) {
                (tier.masteries || []).forEach(function (m, pos) {
                    if (!m) return;
                    out.push({ tree: t.id, treeIndex: ti, tier: tier.tier || j + 1, tierIndex: j, pos: pos, m: m, key: m.key || m.id, keystone: !!tier.isKeystone });
                });
            });
        });
    } else if (Array.isArray(ds.data)) {
        ds.data.forEach(function (tree, ti) {
            (tree || []).forEach(function (m, i) {
                if (!m) return;
                out.push({ tree: ti, treeIndex: ti, tier: Math.floor(((m.index || 1) - 1) / 4) + 1, arrayIndex: i, m: m, key: m.key });
            });
        });
    }
    return out;
}

function treeIndexOf(ds, tree) {
    if (tree == null) return null;
    if (isKeystone(ds)) return typeof tree === "number" ? tree : KEYSTONE_TREES.indexOf(String(tree).toLowerCase());
    return typeof tree === "number" ? tree : TIER_NAMES.indexOf(String(tree).toLowerCase());
}

// The tooltip text of a mastery at a 1-based rank, as the calculators draw
// it: rankDesc[rank-1] when present, else the S1-S3 template (desc +
// rankInfo / perlevel / rankInfo2, calculator.js masteryTooltipBody), else
// the keystone "a/b/c/d/e" collapse (keystoneDescAt).
function masteryText(m, rank, keystone) {
    const ranks = m.ranks || 1;
    const r = Math.max(1, Math.min(rank || 1, ranks)) - 1;
    if (Array.isArray(m.rankDesc) && m.rankDesc[r] != null) return String(m.rankDesc[r]);
    const desc = String(m.desc == null ? "" : m.desc);
    if (!keystone) {
        const ri = m.rankInfo || [];
        let d = desc.replace(/#/, String(ri[r]));
        d = d.replace(/\|(.+?)\|/g, "$1");
        if (m.perlevel) d = d.replace(/#/, String(Math.round(ri[r] * 180) / 10));
        if (m.rankInfo2) d = d.replace(/#/, String(m.rankInfo2[r]));
        return d;
    }
    if (ranks < 2) return desc;
    return desc.replace(/-?\d+(?:\.\d+)?(?:\/-?\d+(?:\.\d+)?)+/g, function (list) {
        const parts = list.split("/");
        return parts.length === ranks ? parts[r] : list;
    });
}
function placeholderIn(text) {
    const t = String(text);
    if (/#/.test(t)) return "#";
    if (/@[A-Za-z0-9_.]+@/.test(t)) return t.match(/@[A-Za-z0-9_.]+@/)[0];
    if (/\bundefined\b|\bNaN\b/.test(t)) return t.match(/\bundefined\b|\bNaN\b/)[0];
    return null;
}

// ===========================================================================
// 6. Reference codecs (the share-link formats of DESIGN §4.4, replicated
//    from the baseline calculator.js / keystone-calculator.js)
// ===========================================================================

const ALPHABET = "WvlgUCsA7pGZ3zSjakbP2x0mTB6htH8JuKMq1yrnwEQDLY5IVNXdcioe9fF4OR_-";
const ALPHA_INDEX = {};
for (let i = 0; i < ALPHABET.length; i++) ALPHA_INDEX[ALPHABET[i]] = i;
const MAXBITS = 5;

// Classic codec spec: [[{key, ranks, hashRanks?, hashNote?}] x3] (array order).
function classicSpec(ds) {
    return ds.data.map(function (tree) {
        return tree.map(function (m) {
            const o = { key: m.key, ranks: m.ranks };
            if (m.hashRanks != null) o.hashRanks = m.hashRanks;
            if (m.hashNote) o.hashNote = m.hashNote;
            return o;
        });
    });
}
function classicCodecFrom(trees) {   // legacy codec payload / fixture -> spec
    return trees.map(function (tree) {
        return tree.map(function (m) {
            const o = { key: m.key, ranks: m.ranks };
            if (m.hashRanks != null) o.hashRanks = m.hashRanks;
            if (m.hashNote) o.hashNote = m.hashNote;
            return o;
        });
    });
}

function makeBits(spec, current) {
    const bitlen = function (t, i) {
        const m = spec[t] && spec[t][i];
        if (!m) return 0;
        const ranks = !current && m.hashRanks != null ? m.hashRanks : m.ranks;
        return Math.floor(ranks / 2) + 1;
    };
    const bitfit = function (t, i, bits) {
        const start = i;
        for (;;) {
            const len = bitlen(t, i);
            if (len > bits || len === 0) return i - start;
            bits -= len;
            i++;
        }
    };
    return { bitlen: bitlen, bitfit: bitfit };
}

// -> {ranks: [[rank per array index] x3], notes: [], current, bad}
function classicDecode(spec, code) {
    let str = String(code || "");
    const current = str.charAt(0) === "~";
    if (current) str = str.slice(1);
    const b = makeBits(spec, current);
    const ranks = spec.map(function (t) { return t.map(function () { return 0; }); });
    const notes = [];
    let tree = 0, index = 0, bad = false;
    for (let i = 0; i < str.length; i++) {
        const cur = ALPHA_INDEX[str[i]];
        if (cur === undefined) { bad = true; break; }
        if ((cur & 0x20) === 0) {
            const num = b.bitfit(tree, index, MAXBITS);
            const sizes = [0, 1, 2, 3, 4].filter(function (a) { return a < num; }).map(function (a) { return b.bitlen(tree, index + a); });
            for (let j = 0; j < sizes.length; j++, index++) {
                const shift = sizes.slice(j + 1).reduce(function (a, c) { return a + c; }, 0);
                let value = (cur >> shift) & ((1 << sizes[j]) - 1);
                const m = spec[tree][index];
                if (value > m.ranks && m.hashNote && notes.indexOf(m.hashNote) < 0) notes.push(m.hashNote);
                value = Math.min(value, m.ranks);
                ranks[tree][index] = value;
            }
        } else {
            index += cur & 0x1f;
        }
        if (index >= spec[tree].length) {
            tree++;
            index = 0;
            if (tree >= spec.length) break;
        }
    }
    return { ranks: ranks, notes: notes, current: current, bad: bad };
}

function classicEncodeRaw(spec, ranks, current) {
    const b = makeBits(spec, current);
    const st = function (t, i) { return (ranks[t] && ranks[t][i]) || 0; };
    let str = "", bits = 0, collected = 0, jumpStart = -1;
    const flush = function () {
        str += ALPHABET[((jumpStart > -1) ? 1 : 0) << MAXBITS | bits];
        bits = 0; collected = 0; jumpStart = -1;
    };
    for (let tree = 0; tree < 3; tree++) {
        let index;
        const len = (spec[tree] || []).length;
        for (index = 0; index < len; index++) {
            let space = b.bitfit(tree, index, MAXBITS - collected);
            if (space < 1) { flush(); space = b.bitfit(tree, index, MAXBITS); }
            if (jumpStart > -1 && !(st(tree, index) > 0)) continue;
            const any = [0, 1, 2, 3, 4].filter(function (a) { return a < space; }).some(function (a) { return st(tree, index + a) > 0; });
            if (collected > 0 || any) {
                if (jumpStart > -1) { bits = index - jumpStart; flush(); }
                const l = b.bitlen(tree, index);
                bits = (bits << l) | st(tree, index);
                collected += l;
            } else if (jumpStart < 0) {
                if (collected > 0) flush();
                jumpStart = index;
            }
        }
        if (jumpStart > -1) { bits = index - jumpStart; flush(); }
        else if (collected > 0) flush();
    }
    return str;
}

// exportMasteries: legacy widths when the build fits them, else "~" + code.
function classicEncode(spec, ranks) {
    const fits = spec.every(function (tree, t) {
        return tree.every(function (m, i) {
            if (m.hashRanks == null) return true;
            const bits = Math.floor(m.hashRanks / 2) + 1;
            return ((ranks[t] && ranks[t][i]) || 0) <= (1 << bits) - 1;
        });
    });
    return fits ? classicEncodeRaw(spec, ranks, false) : "~" + classicEncodeRaw(spec, ranks, true);
}

function classicRanksToMaps(spec, ranks) {
    return spec.map(function (tree, t) {
        const o = {};
        tree.forEach(function (m, i) { if (ranks[t][i] > 0) o[m.key] = ranks[t][i]; });
        return o;
    });
}
function classicMapsToRanks(spec, maps) {
    return spec.map(function (tree, t) { return tree.map(function (m) { return (maps[t] && maps[t][m.key]) || 0; }); });
}

// Keystone codec spec: {trees: [{id, tiers: [{keys: [key|null], ranks: [n], pool, isKeystone}]}]}
function keystoneSpec(ds) {
    return {
        maxPoints: ds.maxPoints || 30,
        trees: ds.data.trees.map(function (t) {
            return {
                id: t.id,
                tiers: t.tiers.map(function (tier) {
                    const ms = tier.masteries || [];
                    const keys = ms.map(function (m) { return m ? (m.key || m.id) : null; });
                    const ranks = ms.map(function (m) { return m ? (m.ranks || 1) : 0; });
                    return { keys: keys, ranks: ranks, isKeystone: !!tier.isKeystone,
                        pool: tier.isKeystone ? 1 : Math.max.apply(null, [1].concat(ranks)) };
                })
            };
        })
    };
}
// Legacy codec (T2 legacy-codecs.js or the P0 fixture): tiers = [[key…]];
// pools 5/1/5/1/5/1 unless given; the last tier is the keystone tier.
function keystoneCodecFrom(payload) {
    return {
        maxPoints: payload.maxPoints || 30,
        trees: payload.trees.map(function (t) {
            const pools = t.pools || t.tiers.map(function (_, j) { return j === t.tiers.length - 1 ? 1 : j % 2 === 0 ? 5 : 1; });
            const kTier = t.keystoneTier != null ? t.keystoneTier : t.tiers.length - 1;
            return {
                id: t.id,
                tiers: t.tiers.map(function (keys, j) {
                    const ks = Array.isArray(keys) ? keys : (keys.keys || keys.masteries || []);
                    return { keys: ks.map(function (k) { return k && typeof k === "object" ? (k.key || k.id) : k; }),
                        ranks: ks.map(function (k) {
                            if (k && typeof k === "object" && k.ranks) return k.ranks;
                            const m = t.masteries && t.masteries[k];
                            return m && m.ranks ? m.ranks : pools[j];
                        }),
                        isKeystone: j === kTier, pool: pools[j] };
                })
            };
        })
    };
}

// State: {trees: {treeId: [ {key: rank} per tier ]}, keystone: {tree, key} | null}
function keystoneEmpty(spec) {
    const s = { trees: {}, keystone: null };
    spec.trees.forEach(function (t) { s.trees[t.id] = t.tiers.map(function () { return {}; }); });
    return s;
}
function ksTierTotal(state, treeId, j) {
    const o = state.trees[treeId][j];
    let n = 0;
    for (const k in o) n += o[k];
    return n;
}
function ksTotal(spec, state) {
    let n = state.keystone ? 1 : 0;
    spec.trees.forEach(function (t) { t.tiers.forEach(function (tier, j) { if (!tier.isKeystone) n += ksTierTotal(state, t.id, j); }); });
    return n;
}
function ksUnlocked(spec, state, tree, j) {
    if (j === 0) return true;
    const prev = tree.tiers[j - 1];
    if (!prev || prev.isKeystone) return false;
    return ksTierTotal(state, tree.id, j - 1) >= prev.pool;
}

// importKeystones, replicated: unlock, room and budget clamps on the way in.
function keystoneDecode(spec, code) {
    const state = keystoneEmpty(spec);
    const max = spec.maxPoints || 30;
    if (code) {
        const treeParts = String(code).split(";");
        spec.trees.forEach(function (tree, ti) {
            const tierParts = (treeParts[ti] || "").split(",");
            tree.tiers.forEach(function (tier, j) {
                const part = tierParts[j];
                if (!part) return;
                if (!ksUnlocked(spec, state, tree, j)) return;
                if (tier.isKeystone) {
                    if (part.charAt(0) !== "k" || state.keystone) return;
                    const key = tier.keys[parseInt(part.slice(1), 10)];
                    if (!key) return;
                    if (ksTotal(spec, state) >= max) return;
                    state.keystone = { tree: tree.id, key: key };
                    return;
                }
                part.split("+").forEach(function (pair) {
                    if (!/^\d\d$/.test(pair)) return;
                    const idx = +pair.charAt(0);
                    const key = tier.keys[idx];
                    if (!key) return;
                    let r = Math.min(+pair.charAt(1), tier.ranks[idx] || 1);
                    const room = tier.pool - ksTierTotal(state, tree.id, j);
                    const budget = max - ksTotal(spec, state);
                    r = Math.min(r, room, budget);
                    if (r > 0) state.trees[tree.id][j][key] = r;
                });
            });
        });
    }
    return state;
}
function keystoneEncode(spec, state) {
    const code = spec.trees.map(function (tree) {
        return tree.tiers.map(function (tier, j) {
            if (tier.isKeystone) {
                if (!state.keystone || state.keystone.tree !== tree.id) return "";
                const i = tier.keys.indexOf(state.keystone.key);
                return i >= 0 ? "k" + i : "";
            }
            const pairs = [];
            tier.keys.forEach(function (key, idx) {
                if (key == null) return;
                const r = state.trees[tree.id][j][key] || 0;
                if (r > 0) pairs.push(String(idx) + String(r));
            });
            return pairs.join("+");
        }).join(",");
    }).join(";");
    return /[^;,]/.test(code) ? code : "";
}
// {treeId: {key: rank}} with the keystone at rank 1 (the P0 fixture shape)
function keystoneToMaps(spec, state) {
    const out = {};
    spec.trees.forEach(function (t) {
        const o = out[t.id] = {};
        state.trees[t.id].forEach(function (tier) { for (const k in tier) if (tier[k] > 0) o[k] = tier[k]; });
        if (state.keystone && state.keystone.tree === t.id) o[state.keystone.key] = 1;
    });
    return { trees: out, keystone: state.keystone ? state.keystone.key : null };
}
// Place {treeId: {key: rank}} + keystone key onto a spec, key by key, no
// rule applied (the legacy decode = index -> key; validation comes later).
function keystoneFromMaps(spec, maps, keystoneKey) {
    const state = keystoneEmpty(spec);
    spec.trees.forEach(function (t) {
        const src = (maps && maps[t.id]) || {};
        t.tiers.forEach(function (tier, j) {
            tier.keys.forEach(function (key) {
                if (!key || !(src[key] > 0)) return;
                if (tier.isKeystone) { if (key === keystoneKey) state.keystone = { tree: t.id, key: key }; }
                else state.trees[t.id][j][key] = src[key];
            });
        });
    });
    return state;
}

// Share-link hashes (calculator.js parseHash / updateLink, keystone
// updateKeystoneLink, runes encodeHash / updateLink, buildReforgedHash).
function parseMasteryHash(raw) {
    raw = String(raw || "").replace(/^#/, "");
    if (!raw) return { id: null, code: "", name: null, empty: true };
    const pipe = raw.indexOf("|");
    if (pipe < 0) return { id: null, code: raw, name: null, plain: true };
    let rest = raw.slice(pipe + 1), name = null;
    const pipe2 = rest.indexOf("|");
    if (pipe2 >= 0) {
        try { name = decodeURIComponent(rest.slice(pipe2 + 1)); } catch (e) { name = rest.slice(pipe2 + 1); }
        rest = rest.slice(0, pipe2);
    }
    return { id: raw.slice(0, pipe), code: rest, name: name };
}
function normPageName(name) {
    const v = String(name == null ? "" : name).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    return v || DEFAULT_PAGE_NAME;
}
function nameSegment(name) {
    const n = normPageName(name);
    return n === DEFAULT_PAGE_NAME ? "" : "|" + encodeURIComponent(n);
}
function classicHash(id, code, name, defaultId) {
    const seg = nameSegment(name);
    if (code.length <= 3 && !seg) return id === defaultId ? "" : id + "|";
    return id + "|" + (code.length <= 3 ? "" : code) + seg;
}
function keystoneHash(id, code, name) { return id + "|" + code + nameSegment(name); }
function runeHash(id, slots, level, defaultId) {
    const any = slots.some(function (s) { return s != null; });
    if (!any && id === defaultId && level === 18) return "";
    let h = id + "|" + slots.map(function (s) { return s == null ? "_" : s; }).join(",");
    if (level !== 18) h += "|" + level;
    return h;
}
function parseRuneHash(raw) {
    raw = String(raw || "").replace(/^#/, "");
    if (!raw) return { id: null, slotIds: [], level: 18, empty: true };
    const parts = raw.split("|");
    if (parts.length === 1) return { id: null, slotIds: parts[0].split(","), level: 18, plain: true };
    let level = parseInt(parts[2], 10);
    if (!(level >= 1 && level <= 18)) level = 18;
    return { id: parts[0], slotIds: (parts[1] || "").split(","), level: level };
}
function parseReforgedHash(hash) {
    hash = String(hash || "").replace(/^#/, "");
    if (!hash) return null;
    if (hash.indexOf("|") < 0 && /%7C|%2C/i.test(hash)) {
        try { hash = decodeURIComponent(hash); } catch (e) { hash = hash.replace(/%7C/gi, "|").replace(/%2C/gi, ","); }
    }
    const parts = hash.split("|");
    for (let k = 1; k <= 3 && k < parts.length; k++) parts[k] = parts[k].replace(/%2C/gi, ",");
    let name = null;
    if (parts[4]) { try { name = decodeURIComponent(parts[4]).slice(0, 25); } catch (e) { name = null; } }
    return { id: parts[0], primary: parts[1] || "", secondary: parts[2] || "", shards: parts[3] || "", name: name };
}
function reforgedHash(id, st) {
    const parts = [id];
    parts.push(st.primary ? st.primary.path + "," + st.primary.picks.map(function (p) { return p || ""; }).join(",") : "");
    parts.push(st.secondary ? st.secondary.path + "," + [null].concat(st.secondary.picks).map(function (p) { return p || ""; }).join(",") : "");
    parts.push(st.shards.map(function (s) { return s || ""; }).join(","));
    if (st.name) parts.push(encodeURIComponent(st.name));
    return parts.join("|");
}

// ===========================================================================
// 7. Carry-over rules (DESIGN §4.5) and validators
// ===========================================================================

function familyKeyOf(ds) { return ds.family || (familyOf(ds.patch) || {}).family || null; }

// Classic: map by key within the same tree index, clamp, accept bottom-up
// (tier requirement 4 x tier from accepted lower tiers, parent full, budget).
// maps: [{key: rank}] x3. -> {maps, dropped, reset, candidate}
function classicCarry(fromDs, fromMaps, toDs) {
    const total = fromMaps.reduce(function (a, t) { return a + Object.values(t).reduce(function (x, y) { return x + y; }, 0); }, 0);
    const empty = [{}, {}, {}];
    if (familyKeyOf(fromDs) !== familyKeyOf(toDs) || (fromDs.system || "classic") !== (toDs.system || "classic"))
        return { maps: empty, dropped: total, reset: true, candidate: empty };
    const candidate = toDs.data.map(function (tree, t) {
        const o = {};
        tree.forEach(function (m) { const r = Math.min((fromMaps[t] || {})[m.key] || 0, m.ranks); if (r > 0) o[m.key] = r; });
        return o;
    });
    const accepted = [{}, {}, {}];
    let budget = toDs.maxPoints || 30;
    const tiers = [];
    toDs.data.forEach(function (tree, t) { tree.forEach(function (m, i) { tiers.push({ t: t, i: i, m: m, tier: Math.floor((m.index - 1) / 4) }); }); });
    tiers.sort(function (a, b) { return a.tier - b.tier || a.t - b.t || a.i - b.i; });
    tiers.forEach(function (c) {
        const want = candidate[c.t][c.m.key] || 0;
        if (!want) return;
        let lower = 0;
        toDs.data[c.t].forEach(function (m) { if (Math.floor((m.index - 1) / 4) < c.tier) lower += accepted[c.t][m.key] || 0; });
        if (lower < 4 * c.tier) return;
        if (c.m.parent != null) {
            const p = toDs.data[c.t][c.m.parent];
            if (!p || (accepted[c.t][p.key] || 0) < p.ranks) return;
        }
        const take = Math.min(want, budget);
        if (take > 0) { accepted[c.t][c.m.key] = take; budget -= take; }
    });
    const kept = accepted.reduce(function (a, t) { return a + Object.values(t).reduce(function (x, y) { return x + y; }, 0); }, 0);
    return { maps: accepted, dropped: total - kept, reset: false, candidate: candidate };
}

// Independent validity check of a classic build. -> [problems]
function classicValid(ds, maps) {
    const errs = [];
    let total = 0;
    ds.data.forEach(function (tree, t) {
        const src = maps[t] || {};
        const byKey = {};
        tree.forEach(function (m) { byKey[m.key] = m; });
        Object.keys(src).forEach(function (k) { if (src[k] > 0 && !byKey[k]) errs.push(TIER_NAMES[t] + ": unknown key " + k); });
        const tierPts = function (below) {
            let n = 0;
            tree.forEach(function (m) { if (Math.floor((m.index - 1) / 4) < below) n += src[m.key] || 0; });
            return n;
        };
        tree.forEach(function (m) {
            const r = src[m.key] || 0;
            if (!r) return;
            total += r;
            const tier = Math.floor((m.index - 1) / 4);
            if (r > m.ranks) errs.push(m.key + " " + r + "/" + m.ranks);
            if (tierPts(tier) < 4 * tier) errs.push(m.key + ": tier " + (tier + 1) + " needs " + 4 * tier + " points below, has " + tierPts(tier));
            if (m.parent != null) {
                const p = tree[m.parent];
                if (!p || (src[p.key] || 0) < p.ranks) errs.push(m.key + ": parent " + (p ? p.key : "#" + m.parent) + " not full");
            }
        });
    });
    if (total > (ds.maxPoints || 30)) errs.push("total " + total + " > " + (ds.maxPoints || 30));
    return errs;
}
// Every point the source had (key present, clamped) and that could still be
// added to the result is kept. -> [problems]
function classicMaximal(ds, result, candidate) {
    const errs = [];
    ds.data.forEach(function (tree, t) {
        tree.forEach(function (m) {
            const have = result[t][m.key] || 0, want = candidate[t][m.key] || 0;
            if (have >= want) return;
            const probe = result.map(function (x) { return Object.assign({}, x); });
            probe[t][m.key] = have + 1;
            if (!classicValid(ds, probe).length) errs.push(TIER_NAMES[t] + "." + m.key + ": " + have + " kept of " + want + ", but one more point is valid");
        });
    });
    return errs;
}
function classicSubset(result, candidate) {
    const errs = [];
    result.forEach(function (tree, t) {
        Object.keys(tree).forEach(function (k) {
            if ((tree[k] || 0) > ((candidate[t] || {})[k] || 0)) errs.push(TIER_NAMES[t] + "." + k + ": " + tree[k] + " > carried " + ((candidate[t] || {})[k] || 0));
        });
    });
    return errs;
}

// Keystone: map by key within the tree (into whatever tier it lives in now),
// cap each tier at its pool (radio row: first match in tier order), then
// walk tiers 1-6 (a tier counts only when the previous one is full; the
// keystone needs tier 5 full), one keystone at most, total capped at 30.
// maps: {treeId: {key: rank}} incl. the keystone at 1; ks = keystone key.
function keystoneCarry(fromDs, fromMaps, fromKs, toDs) {
    const spec = keystoneSpec(toDs);
    let total = 0;
    Object.keys(fromMaps || {}).forEach(function (t) { Object.values(fromMaps[t]).forEach(function (r) { total += r; }); });
    if (familyKeyOf(fromDs) !== familyKeyOf(toDs) || fromDs.system !== toDs.system) {
        return { state: keystoneEmpty(spec), maps: keystoneToMaps(spec, keystoneEmpty(spec)), dropped: total, reset: true, candidate: keystoneToMaps(spec, keystoneEmpty(spec)) };
    }
    const cand = keystoneEmpty(spec);
    spec.trees.forEach(function (t) {
        const src = (fromMaps && fromMaps[t.id]) || {};
        t.tiers.forEach(function (tier, j) {
            tier.keys.forEach(function (key, idx) {
                if (!key || !(src[key] > 0)) return;
                if (tier.isKeystone) { if (key === fromKs && !cand.keystone) cand.keystone = { tree: t.id, key: key }; return; }
                cand.trees[t.id][j][key] = Math.min(src[key], tier.ranks[idx] || 1);
            });
        });
    });
    const out = keystoneEmpty(spec);
    let budget = spec.maxPoints || 30;
    spec.trees.forEach(function (t) {
        let open = true;
        t.tiers.forEach(function (tier, j) {
            if (j > 0) {
                const prev = t.tiers[j - 1];
                open = open && !prev.isKeystone && ksTierTotal(out, t.id, j - 1) >= prev.pool;
            }
            if (!open) return;
            if (tier.isKeystone) {
                if (cand.keystone && cand.keystone.tree === t.id && !out.keystone && budget > 0) { out.keystone = cand.keystone; budget--; }
                return;
            }
            let room = tier.pool;
            tier.keys.forEach(function (key) {
                const want = key ? cand.trees[t.id][j][key] || 0 : 0;
                if (!want || room <= 0 || budget <= 0) return;
                if (tier.pool === 1 && ksTierTotal(out, t.id, j) > 0) return;
                const take = Math.min(want, room, budget);
                out.trees[t.id][j][key] = take;
                room -= take; budget -= take;
            });
        });
    });
    const maps = keystoneToMaps(spec, out);
    let kept = 0;
    Object.keys(maps.trees).forEach(function (t) { Object.values(maps.trees[t]).forEach(function (r) { kept += r; }); });
    return { state: out, maps: maps, dropped: total - kept, reset: false, candidate: keystoneToMaps(spec, cand), spec: spec };
}
function keystoneStateFromMaps(spec, maps, ks) { return keystoneFromMaps(spec, maps, ks); }
function keystoneValid(ds, maps, ks) {
    const spec = keystoneSpec(ds);
    const errs = [];
    let total = 0, keystones = 0;
    const known = {};
    spec.trees.forEach(function (t) { t.tiers.forEach(function (tier) { tier.keys.forEach(function (k) { if (k) known[t.id + "/" + k] = true; }); }); });
    Object.keys(maps || {}).forEach(function (tid) {
        Object.keys(maps[tid]).forEach(function (k) { if (maps[tid][k] > 0 && !known[tid + "/" + k]) errs.push(tid + ": unknown key " + k); });
    });
    spec.trees.forEach(function (t) {
        const src = (maps && maps[t.id]) || {};
        const tierTotals = t.tiers.map(function (tier, j) {
            let n = 0, picked = 0;
            tier.keys.forEach(function (k, idx) {
                const r = k ? src[k] || 0 : 0;
                if (!r) return;
                if (r > (tier.ranks[idx] || 1)) errs.push(t.id + "." + k + " " + r + "/" + tier.ranks[idx]);
                if (tier.isKeystone) { keystones++; if (k !== ks) errs.push(t.id + "." + k + ": keystone point but the keystone is " + ks); }
                n += r; picked++;
            });
            if (n > tier.pool) errs.push(t.id + " tier " + (j + 1) + ": " + n + " points > pool " + tier.pool);
            if (tier.pool === 1 && picked > 1) errs.push(t.id + " tier " + (j + 1) + ": " + picked + " picks in a one-point row");
            return n;
        });
        tierTotals.forEach(function (n, j) {
            total += n;
            if (j > 0 && n > 0 && tierTotals[j - 1] < t.tiers[j - 1].pool)
                errs.push(t.id + " tier " + (j + 1) + " has points but tier " + j + " holds " + tierTotals[j - 1] + "/" + t.tiers[j - 1].pool);
        });
    });
    if (keystones > 1) errs.push(keystones + " keystones");
    if (ks && !keystones) errs.push("keystone " + ks + " not in any keystone row");
    if (total > (ds.maxPoints || 30)) errs.push("total " + total + " > " + (ds.maxPoints || 30));
    return errs;
}
function keystoneMaximal(ds, result, candidate) {
    const spec = keystoneSpec(ds);
    const errs = [];
    spec.trees.forEach(function (t) {
        const have = result.trees[t.id] || {}, want = (candidate.trees || {})[t.id] || {};
        t.tiers.forEach(function (tier) {
            tier.keys.forEach(function (k) {
                if (!k) return;
                const h = have[k] || 0, w = want[k] || 0;
                if (h >= w) return;
                const probe = clone(result.trees);
                probe[t.id] = Object.assign({}, probe[t.id]);
                probe[t.id][k] = h + 1;
                const ks = tier.isKeystone ? k : result.keystone;
                if (tier.isKeystone && result.keystone) return;   // one keystone at most
                if (!keystoneValid(ds, probe, ks).length) errs.push(t.id + "." + k + ": " + h + " kept of " + w + ", but one more point is valid");
            });
        });
    });
    return errs;
}
function keystoneSubset(result, candidate) {
    const errs = [];
    Object.keys(result.trees).forEach(function (t) {
        Object.keys(result.trees[t]).forEach(function (k) {
            const c = ((candidate.trees || {})[t] || {})[k] || 0;
            if (result.trees[t][k] > c) errs.push(t + "." + k + ": " + result.trees[t][k] + " > carried " + c);
        });
    });
    if (result.keystone && result.keystone !== candidate.keystone) errs.push("keystone " + result.keystone + " was not carried");
    return errs;
}

// Runes: keep every slot whose rune id exists in the new catalog with the
// same category; the champion level is kept.
function slotCategories(slots) {
    const out = [];
    RUNE_CATEGORIES.forEach(function (c) { for (let i = 0; i < ((slots || {})[c] || 0); i++) out.push(c); });
    return out;
}
function runeIndex(ds) {
    const m = {};
    ((ds && ds.runes) || []).forEach(function (r) { m[String(r.id)] = r; });
    return m;
}
function runeCarry(toDs, slots, level) {
    const cats = slotCategories(toDs.slots || { mark: 9, seal: 9, glyph: 9, quintessence: 3 });
    const idx = runeIndex(toDs);
    let dropped = 0;
    const out = cats.map(function (cat, i) {
        const id = slots[i];
        if (id == null || id === "_" || id === "") return null;
        const r = idx[String(id)];
        if (r && r.category === cat) return String(id);
        dropped++;
        return null;
    });
    return { slots: out, level: level, dropped: dropped };
}
function runeValid(ds, slots) {
    const cats = slotCategories(ds.slots || { mark: 9, seal: 9, glyph: 9, quintessence: 3 });
    const idx = runeIndex(ds);
    const errs = [];
    slots.forEach(function (id, i) {
        if (id == null) return;
        const r = idx[String(id)];
        if (!r) errs.push("slot " + i + ": rune " + id + " not in the catalog");
        else if (r.category !== cats[i]) errs.push("slot " + i + ": " + id + " is a " + r.category + ", slot is a " + cats[i]);
    });
    return errs;
}

// Reforged: the catalog (runesReforged.json) + the era's shard rows.
function rrRuneInSlot(catalog, pathId, slotIdx, runeId) {
    const p = (catalog || []).filter(function (x) { return x.id === pathId; })[0];
    if (!p || !p.slots || !p.slots[slotIdx] || runeId == null) return false;
    return p.slots[slotIdx].runes.some(function (r) { return r.id === runeId; });
}
function rrShardInRow(rows, row, id) {
    if (!rows || !rows[row] || !id) return false;
    return rows[row].shards.some(function (s) { return String(s.id) === String(id); });
}
// applyReforgedHashAfterLoad, replicated. parsed = parseReforgedHash().
function reforgedApply(catalog, rows, parsed) {
    const st = { primary: null, secondary: null, shards: [null, null, null], name: null };
    if (!parsed) return st;
    const pathOf = function (id) { return (catalog || []).filter(function (x) { return x.id === id; })[0] || null; };
    if (parsed.primary) {
        const pp = parsed.primary.split(",");
        const p = pathOf(parseInt(pp[0], 10));
        if (p) {
            st.primary = { path: p.id, picks: [0, 1, 2, 3].map(function (k) {
                const id = pp[k + 1] ? parseInt(pp[k + 1], 10) : null;
                return rrRuneInSlot(catalog, p.id, k, id) ? id : null;
            }) };
        }
    }
    if (parsed.secondary) {
        const sp = parsed.secondary.split(",");
        const s = pathOf(parseInt(sp[0], 10));
        if (s && (!st.primary || s.id !== st.primary.path)) {
            let taken = 0;
            st.secondary = { path: s.id, picks: [1, 2, 3].map(function (k) {
                const id = sp[k + 1] ? parseInt(sp[k + 1], 10) : null;
                const ok = taken < 2 && rrRuneInSlot(catalog, s.id, k, id);
                if (ok) taken++;
                return ok ? id : null;
            }) };
        }
    }
    if (parsed.shards) {
        const sh = parsed.shards.split(",");
        st.shards = [0, 1, 2].map(function (k) {
            const v = sh[k] ? sh[k] : null;
            return v && (!rows || rrShardInRow(rows, k, v)) ? v : null;
        });
    }
    st.name = parsed.name || null;
    return st;
}

// ===========================================================================
// 8. The checks
// ===========================================================================

function needEntries(world, page, c) {
    const e = world.entries(page);
    if (!e.list) { c.skip(page + ": " + e.why); return null; }
    return e.list;
}
function entryPatch(e) { return P.tryParse(e.patch) ? e.patch : null; }

// ---- G1 ids, files, registrations ------------------------------------------
function checkG1(world, c) {
    const allIds = {};
    PAGES.forEach(function (page) {
        const list = needEntries(world, page, c);
        if (!list) return;
        const ids = {};
        list.forEach(function (e) {
            if (ids[e.id]) c.fail(page + ": duplicate id " + e.id);
            ids[e.id] = true;
            if (allIds[e.id]) c.fail("id " + e.id + " is used by two pages");
            allIds[e.id] = page;
            const p = P.tryParse(e.patch);
            if (!p) c.fail(page + " " + e.id + ": patch " + JSON.stringify(e.patch) + " does not parse");
            else if (P.idFor(page, p) !== e.id) c.fail(page + ": id " + e.id + " is not the canonical id " + P.idFor(page, p) + " of " + e.patch);
            if (!/^[A-Za-z0-9._-]+$/.test(e.id)) c.fail(page + ": id " + e.id + " is not URL-safe");
        });
        const man = world.manifest(page);
        if (man.missing) { c.skip(page + ": " + man.file + " missing (data not built yet)"); return; }
        if (man.error) { c.fail(page + ": " + man.file + ": " + man.error); return; }
        const byFile = {};
        let nullData = 0;
        list.forEach(function (e) {
            if (e.data === null) {
                nullData++;
                if (page !== "reforged") c.fail(page + " " + e.id + ": data null (only Reforged patches without extras may have none)");
                if (e.file) c.fail(page + " " + e.id + ": data null but file " + e.file);
                return;
            }
            if (typeof e.data !== "string" || !e.data) { c.fail(page + " " + e.id + ": no data key"); return; }
            if (typeof e.file !== "string" || !e.file) { c.fail(page + " " + e.id + ": no file for data " + e.data); return; }
            if (path.basename(e.file, ".js") !== e.data) c.fail(page + " " + e.id + ": file " + e.file + " is not named after its key " + e.data);
            (byFile[e.file] = byFile[e.file] || []).push(e);
            const m = man.map[e.id];
            if (!m && page !== "reforged") c.fail(page + " " + e.id + ": not in " + man.file);
            else if (m && (m.data !== e.data || (m.file && path.posix.basename(m.file) !== path.posix.basename(e.file))))
                c.fail(page + " " + e.id + ": registry data/file " + e.data + " / " + e.file + " differ from the manifest " + m.data + " / " + m.file);
        });
        Object.keys(man.map).forEach(function (id) { if (!ids[id]) c.fail(page + ": manifest id " + id + " is not a listed entry"); });
        let okFiles = 0;
        Object.keys(byFile).forEach(function (rel) {
            const users = byFile[rel];
            const f = world.dataFile(rel);
            if (f.missing) { c.fail(page + ": " + rel + " missing (used by " + users.map(function (e) { return e.id; }).join(", ") + ")"); return; }
            if (f.error) { c.fail(page + ": " + rel + ": " + f.error); return; }
            f.forbidden.forEach(function (x) { c.fail(page + ": " + rel + " contains a " + x); });
            if (f.calls.length !== 1) c.fail(page + ": " + rel + " makes " + f.calls.length + " LolData.register calls (exactly 1 expected)");
            const call = f.calls[0];
            if (call) {
                if (call.kind !== page) c.fail(page + ": " + rel + " registers kind " + JSON.stringify(call.kind) + " (expected " + JSON.stringify(page) + ")");
                if (call.key !== users[0].data) c.fail(page + ": " + rel + " registers " + JSON.stringify(call.key) + ", listed as " + JSON.stringify(users[0].data));
            }
            if (!f.header) c.fail(page + ": " + rel + " has no GENERATED header (DESIGN §1.6)");
            else if (f.header.patches) {
                const want = users.map(function (e) { return e.patch; });
                const got = f.header.patches;
                const same = want.length === got.length && want.every(function (p) { return got.some(function (g) { return eq(g, p) || eq(g.replace(/\s*\(.*$/, ""), p); }); });
                if (!same) c.fail(page + ": " + rel + " header says patches " + got.join(", ") + "; the entries using it are " + want.join(", "));
            } else c.fail(page + ": " + rel + " header lists no 'Patches using this file'");
            const m = man.map[users[0].id];
            if (m && m.hash && call && m.hash !== hashOf(call.payload) && m.hash !== hashOf(call.payload).slice(0, m.hash.length))
                c.info(page + ": " + rel + " manifest hash " + m.hash + " is not tools/lib/patches.js contentHash of the payload");
            if (call && call.kind === page) okFiles++;
        });
        // orphans
        const dir = world.abs("data/" + page);
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f) && f !== "legacy-codecs.js"; }).forEach(function (f) {
                const rel = "data/" + page + "/" + f;
                if (!byFile[rel]) c.fail(page + ": " + rel + " is not used by any entry");
            });
        }
        c.pass(page + ": " + list.length + " unique ids, " + Object.keys(byFile).length + " data files (" + okFiles + " register their key)" + (nullData ? ", " + nullData + " without extras" : ""));
    });
    const lc = world.legacyCodecs();
    if (lc.missing) c.skip("data/masteries/legacy-codecs.js missing (T2 pending)");
    else if (lc.error) c.fail("data/masteries/legacy-codecs.js: " + lc.error);
    else {
        const want = Object.keys(world.fixtureCodecs().value ? world.fixtureCodecs().value.datasets : {});
        const got = Object.keys(lc.map);
        const missing = want.filter(function (k) { return got.indexOf(k) < 0; });
        if (missing.length) c.fail("legacy-codecs.js lacks the codecs " + missing.join(", "));
        if (lc.file.calls.some(function (x) { return x.kind !== "masteries-legacy"; })) c.fail("legacy-codecs.js registers a kind other than masteries-legacy");
        lc.file.forbidden.forEach(function (x) { c.fail("legacy-codecs.js contains a " + x); });
        if (!missing.length) c.pass("legacy-codecs.js registers the " + got.length + " legacy codecs");
    }
}

// ---- G2 counts and lists per page and season (§0, §3.2) --------------------
function checkG2(world, c) {
    PAGES.forEach(function (page) {
        const list = needEntries(world, page, c);
        if (!list) return;
        const spec = listedSpec(page), exp = EXPECT_TOTALS[page];
        if (list.length !== exp.total) c.fail(page + ": " + list.length + " entries, expected " + exp.total);
        // chronological order
        for (let i = 1; i < list.length; i++) {
            if (entryPatch(list[i - 1]) && entryPatch(list[i]) && cmp(list[i - 1].patch, list[i].patch) >= 0)
                c.fail(page + ": entries not in chronological order at " + list[i - 1].patch + " / " + list[i].patch);
        }
        const per = {};
        list.forEach(function (e) { per[e.season] = (per[e.season] || 0) + 1; });
        Object.keys(exp.perSeason).forEach(function (s) {
            if ((per[s] || 0) !== exp.perSeason[s]) c.fail(page + " " + s + ": " + (per[s] || 0) + " entries, expected " + exp.perSeason[s]);
        });
        Object.keys(per).forEach(function (s) { if (!(s in exp.perSeason)) c.fail(page + ": unexpected season " + s + " (" + per[s] + " entries)"); });
        let bad = 0;
        spec.forEach(function (s) {
            const e = list.filter(function (x) { return entryPatch(x) && eq(x.patch, s.patch); })[0];
            if (!e) { c.fail(page + ": " + s.patch + " (" + s.season + ") is not listed"); bad++; return; }
            if (e.season !== s.season) { c.fail(page + " " + s.patch + ": season " + e.season + ", expected " + s.season); bad++; }
            const r = String(e.reason || "");
            if (REASONS.indexOf(r) < 0) { c.fail(page + " " + s.patch + ": reason " + JSON.stringify(e.reason) + " is not one of " + REASONS.join(" | ")); bad++; }
            else if (s.mark === "°" && /change/.test(r)) { c.fail(page + " " + s.patch + ": listed as a boundary without change (°), reason " + r); bad++; }
            else if (s.mark === "*" && !/^season-(start|end)\+change$/.test(r)) { c.fail(page + " " + s.patch + ": a season boundary with a change (*), reason " + r); bad++; }
            else if (!s.mark && r !== "change") { c.fail(page + " " + s.patch + ": a change patch, reason " + r); bad++; }
            if (s.mark && /^season-/.test(r)) {
                const want = s.position === "last" ? "season-end" : "season-start";
                if (r.indexOf(want) !== 0 && !(s.position === "first" && r.indexOf("season-start") === 0)) { c.fail(page + " " + s.patch + ": reason " + r + ", expected " + want + "…"); bad++; }
            }
        });
        list.forEach(function (e) {
            if (!spec.some(function (s) { return entryPatch(e) && eq(e.patch, s.patch); })) c.fail(page + ": " + e.patch + " is listed but not in DESIGN §3.2");
        });
        const noChange = list.filter(function (e) { return !/change/.test(String(e.reason)); }).length;
        if (noChange !== exp.noChange) c.fail(page + ": " + noChange + " boundary patches without change, expected " + exp.noChange);
        if (list.length - noChange !== exp.change) c.fail(page + ": " + (list.length - noChange) + " patches with a change, expected " + exp.change);
        if (!bad) c.pass(page + ": " + list.length + " entries match §3.2 (" + Object.keys(exp.perSeason).map(function (s) { return s + " " + (per[s] || 0); }).join(", ") + "; " + noChange + " without change)");
    });
}

// ---- G3 season boundaries (§3.1) -----------------------------------------
function checkG3(world, c) {
    // the seasons table itself
    const sj = world.seasonsJson();
    if (sj.value) {
        const ss = sj.value.seasons || [];
        let ok = ss.length === SEASONS.length;
        SEASONS.forEach(function (s, i) {
            const x = ss[i];
            if (!x || x.key !== s.key || !eq(x.first, s.first) || !eq(x.last, s.last)) {
                ok = false;
                c.fail("data/patches/seasons.json season " + (i + 1) + ": " + (x ? x.key + " " + x.first + "-" + x.last : "missing") + ", §3.1 says " + s.key + " " + s.first + "-" + s.last);
            }
        });
        if (!sj.value.live || !eq(sj.value.live.patch, LIVE.patch)) { ok = false; c.fail("seasons.json live.patch " + (sj.value.live && sj.value.live.patch) + ", expected " + LIVE.patch); }
        if (ok) c.pass("data/patches/seasons.json has the 16 seasons of §3.1, live " + LIVE.patch);
    } else c.fail("data/patches/seasons.json " + (sj.missing ? "missing" : sj.error));
    // adjacency of the spec table (sanity of the hard-coded table)
    PAGES.forEach(function (page) {
        const list = needEntries(world, page, c);
        if (!list) return;
        let bad = 0;
        const seasons = Object.keys(LISTED[page]);
        seasons.forEach(function (key) {
            const s = SEASONS.filter(function (x) { return x.key === key; })[0];
            const es = list.filter(function (e) { return e.season === key && entryPatch(e); });
            if (!es.length) { c.fail(page + " " + key + ": no entries"); bad++; return; }
            const first = es[0].patch, last = es[es.length - 1].patch;
            const ex = (PAGE_BOUND_EXCEPTIONS[page] || {})[key] || {};
            const wantFirst = ex.first || s.first, wantLast = ex.last || s.last;
            if (!eq(first, wantFirst)) { c.fail(page + " " + key + ": first listed " + first + ", §3.1 says " + wantFirst + (ex.first ? " (explicit page exception)" : "")); bad++; }
            if (!eq(last, wantLast)) { c.fail(page + " " + key + ": last listed " + last + ", §3.1 says " + wantLast); bad++; }
            es.forEach(function (e) {
                if (cmp(e.patch, s.first) < 0 || cmp(e.patch, s.last) > 0) { c.fail(page + " " + e.patch + " lies outside " + key + " (" + s.first + "-" + s.last + ")"); bad++; }
            });
        });
        if (!bad) c.pass(page + ": first / last listed patch of every season equal §3.1" + (page === "runes" ? " (S1 starts at V1.0.0.63, the explicit exception)" : ""));
    });
    // DDragon era: the patch before each season start is the previous season's last
    const dd = world.ddragonPatches();
    if (!dd) { c.skip("DDragon boundaries: no versions list (data/sources/ddragon-versions.json has no owner yet; pass --ddragon <versions.json> or --research <dir>)"); return; }
    if (dd.error) { c.fail(dd.error); return; }
    let bad = 0;
    const live = dd.patches.filter(function (p) { return cmp(p, "V3.7") >= 0; });
    SEASONS.forEach(function (s, i) {
        if (i === 0 || cmp(s.first, "V3.14") < 0) return;
        const before = live.filter(function (p) { return cmp(p, s.first) < 0; }).pop();
        if (!before || !eq(before, SEASONS[i - 1].last)) { c.fail("DDragon: the live patch before " + s.first + " (" + s.key + ") is " + (before ? before.label : "none") + ", " + SEASONS[i - 1].key + " ends at " + SEASONS[i - 1].last); bad++; }
        if (!live.some(function (p) { return eq(p, s.first); })) { c.fail("DDragon has no " + s.first); bad++; }
    });
    const latest = live[live.length - 1];
    if (!latest || !eq(latest, LIVE.patch)) { c.fail("DDragon's latest patch is " + (latest && latest.label) + ", §3.1 says " + LIVE.patch + " (a new live patch: re-run the Reforged import, DESIGN §8)"); bad++; }
    PAGES.forEach(function (page) {
        const list = world.entries(page).list;
        if (!list) return;
        list.forEach(function (e) {
            if (entryPatch(e) && cmp(e.patch, "V3.7") >= 0 && !live.some(function (p) { return eq(p, e.patch); })) { c.fail(page + " " + e.patch + " is not a DDragon patch"); bad++; }
        });
    });
    if (!bad) c.pass("DDragon (" + dd.source + ", " + live.length + " patches from V3.7): every DDragon-era season boundary and the live patch " + LIVE.patch + " hold");
}

// ---- G4 sources and confidence in the listings -----------------------------
function checkG4(world, c) {
    PAGES.forEach(function (page) {
        const lst = world.listing(page);
        if (lst.missing || lst.stub) { c.skip(page + ": " + lst.file + (lst.stub ? " is a stub" : " missing") + " (" + ({ masteries: "T2", runes: "T5", reforged: "T7a" })[page] + " pending)"); return; }
        if (lst.error) { c.fail(page + ": " + lst.file + ": " + lst.error); return; }
        let bad = 0, changes = 0;
        lst.records.forEach(function (r, i) {
            const w = page + " " + (r.patch || "#" + i);
            const fail = function (m) { c.fail(w + ": " + m); bad++; };
            if (!P.tryParse(r.patch)) fail("patch does not parse");
            if (REASONS.indexOf(r.reason) < 0) fail("reason " + JSON.stringify(r.reason));
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ""))) fail("date " + JSON.stringify(r.date) + " is not YYYY-MM-DD");
            if (CONFIDENCE.indexOf(r.confidence) < 0) fail("confidence " + JSON.stringify(r.confidence));
            const src = r.source;
            const srcOk = isObj(src) && Object.keys(src).some(function (k) { return src[k] != null && src[k] !== ""; });
            if (!srcOk && !(Array.isArray(r.sources) && r.sources.length)) fail("no source (source: {ddragon} | {wiki})");
            if (isObj(src) && src.ddragon && !/^\d+\.\d+(\.\d+)*$/.test(String(src.ddragon))) fail("source.ddragon " + JSON.stringify(src.ddragon) + " is not a DDragon build");
            if (!Array.isArray(r.changes)) { fail("changes[] missing"); return; }
            if (/change/.test(String(r.reason)) && !r.changes.length) fail("reason " + r.reason + " but no change listed");
            r.changes.forEach(function (ch, j) {
                changes++;
                if (!isObj(ch)) { fail("changes[" + j + "] is not {text, sources, confidence}"); return; }
                if (!String(ch.text || "").trim()) fail("changes[" + j + "] has no text");
                if (!Array.isArray(ch.sources) || !ch.sources.length || ch.sources.some(function (s) { return !String(s || "").trim(); })) fail("changes[" + j + "] has no source");
                if (CONFIDENCE.indexOf(ch.confidence) < 0) fail("changes[" + j + "] confidence " + JSON.stringify(ch.confidence));
            });
        });
        if (!bad) c.pass(page + ": " + lst.records.length + " records and " + changes + " changes all carry sources and a confidence");
    });
}

// ---- G5 aliases, defaults, LolPatches.resolve -----------------------------
function refResolve(list, aliases, page, id) {
    const byId = {};
    list.forEach(function (e) { byId[e.id] = e; });
    if (byId[id]) return { entry: byId[id], alias: null };
    const a = aliases && aliases[page] && aliases[page][id];
    if (a && byId[a.to]) return { entry: byId[a.to], alias: a };
    const pid = P.parseId(id);
    if (!pid || pid.page !== page) return null;
    const ps = list.filter(entryPatch);
    if (!ps.length || cmp(pid.patch, ps[0].patch) < 0 || cmp(pid.patch, ps[ps.length - 1].patch) > 0) return null;
    let best = null;
    ps.forEach(function (e) { if (cmp(e.patch, pid.patch) <= 0) best = e; });
    return best ? { entry: best, alias: { to: best.id, unlisted: true } } : null;
}
function checkG5(world, c) {
    const aj = world.aliasesJson();
    if (!aj.value) { c.fail("data/patches/aliases.json " + (aj.missing ? "missing" : aj.error)); return; }
    const A = aj.value;
    // the alias table against §4.2
    let bad = 0;
    LEGACY.forEach(function (l) {
        const a = (A[l.page] || {})[l.id];
        const kept = ((A.keep || {})[l.page] || []).indexOf(l.id) >= 0;
        if (l.to === l.id) { if (!kept || a) { c.fail("aliases.json: " + l.id + " must stay canonical (keep), not an alias"); bad++; } return; }
        if (!a || a.to !== l.to) { c.fail("aliases.json " + l.page + "." + l.id + " -> " + (a && a.to) + ", §4.2 says " + l.to); bad++; return; }
        if (l.page === "masteries" && a.codec !== l.codec) { c.fail("aliases.json " + l.id + ": codec " + a.codec + ", expected " + l.codec); bad++; }
    });
    ["masteries", "runes"].forEach(function (page) {
        const pl = (A.plain || {})[page];
        if (!pl || pl.to !== PLAIN[page].to || (PLAIN[page].codec && pl.codec !== PLAIN[page].codec)) { c.fail("aliases.json plain." + page + " " + JSON.stringify(pl) + ", expected " + JSON.stringify(PLAIN[page])); bad++; }
    });
    const extra = [];
    PAGES.forEach(function (page) { Object.keys(A[page] || {}).forEach(function (id) { if (!LEGACY.some(function (l) { return l.id === id; })) extra.push(page + "." + id); }); });
    if (extra.length) { c.fail("aliases.json has aliases DESIGN §4.2 does not list: " + extra.join(", ")); bad++; }
    if (!bad) c.pass("aliases.json: the 24 legacy ids of §4.2 (8 mastery codecs, 1 rune + 1 Reforged alias, 13 kept, the plain mastery code)");
    // registry aliases = aliases.json
    const reg = world.registry();
    if (!reg.missing && !reg.error) {
        const strip = function (m) { const o = {}; Object.keys(m || {}).forEach(function (k) { const v = Object.assign({}, m[k]); delete v.note; o[k] = v; }); return o; };
        let rb = 0;
        PAGES.forEach(function (page) {
            if (!deepEqual(strip(reg.LOL_ALIASES[page]), strip(A[page]))) { c.fail("patch-registry.js LOL_ALIASES." + page + " differs from aliases.json"); rb++; }
        });
        if (reg.LOL_ALIASES.plain && !deepEqual(strip(reg.LOL_ALIASES.plain), strip(A.plain))) { c.fail("LOL_ALIASES.plain differs from aliases.json plain"); rb++; }
        if (!rb) c.pass("patch-registry.js LOL_ALIASES equals aliases.json");
        // SEASON_NAV + page defaults (T1 logic; fine on a stub listing)
        let nb = 0;
        SEASONS.forEach(function (s) {
            const nav = (reg.SEASON_NAV || []).filter(function (x) { return x.key === s.key; })[0];
            if (!nav) { c.fail("SEASON_NAV has no " + s.key); nb++; return; }
            PAGES.forEach(function (page) {
                const want = SEASON_DEFAULTS[page][s.key] || null;
                const got = nav[page] || null;
                if (want !== got) { c.fail("SEASON_NAV " + s.key + "." + page + " = " + got + ", §3.4 says " + want); nb++; }
            });
        });
        PAGES.forEach(function (page) {
            if ((reg.LOL_PAGE_DEFAULT || {})[page] !== PAGE_DEFAULTS[page]) { c.fail("LOL_PAGE_DEFAULT." + page + " = " + (reg.LOL_PAGE_DEFAULT || {})[page] + ", expected " + PAGE_DEFAULTS[page]); nb++; }
        });
        if (!nb) c.pass("SEASON_NAV season defaults and LOL_PAGE_DEFAULT equal §3.4");
    } else c.skip("patch-registry.js " + (reg.missing ? "missing" : reg.error) + " (T1)");
    // seasons.json defaults
    const sj = world.seasonsJson().value;
    if (sj) {
        let sb = 0;
        PAGES.forEach(function (page) {
            Object.keys(SEASON_DEFAULTS[page]).forEach(function (key) {
                const s = (sj.seasons || []).filter(function (x) { return x.key === key; })[0];
                const got = s && s.pages && s.pages[page] && s.pages[page]["default"];
                if (got !== SEASON_DEFAULTS[page][key]) { c.fail("seasons.json " + key + "." + page + ".default = " + got + ", expected " + SEASON_DEFAULTS[page][key]); sb++; }
            });
            if ((sj.pageDefaults || {})[page] !== PAGE_DEFAULTS[page]) { c.fail("seasons.json pageDefaults." + page + " = " + (sj.pageDefaults || {})[page]); sb++; }
        });
        if (!sb) c.pass("seasons.json season and page defaults equal §3.4");
    }
    // targets listed + in their season (data)
    PAGES.forEach(function (page) {
        const list = needEntries(world, page, c);
        if (!list) return;
        let tb = 0;
        const check = function (label, id, season) {
            const r = refResolve(list, A, page, id);
            if (!r) { c.fail(page + ": " + label + " " + id + " does not resolve"); tb++; return; }
            if (season && r.entry.season !== season) { c.fail(page + ": " + label + " " + id + " -> " + r.entry.id + " is in " + r.entry.season + ", expected " + season); tb++; }
        };
        LEGACY.filter(function (l) { return l.page === page; }).forEach(function (l) { check("legacy id", l.id, l.season); });
        Object.keys(SEASON_DEFAULTS[page]).forEach(function (k) { check(k + " default", SEASON_DEFAULTS[page][k], k); });
        check("page default", PAGE_DEFAULTS[page], null);
        if (PLAIN[page]) check("plain form", PLAIN[page].to, PLAIN[page].season);
        if (!tb) c.pass(page + ": every legacy id, season default and the page default resolves to a listed entry of the right season");
    });
    // the runtime (lol-data.js)
    const rt = world.runtime();
    if (rt.missing || rt.error) { c.skip("LolPatches.resolve: " + (rt.why || rt.error) + " (T1)"); return; }
    let rbad = 0, n = 0;
    const stubNote = PAGES.filter(function (p) { return reg.stub && reg.stub[p]; });
    LEGACY.forEach(function (l) {
        n++;
        let r;
        try { r = rt.LolPatches.resolve(l.page, l.id); } catch (e) { c.fail("LolPatches.resolve(" + l.page + ", " + l.id + ") throws " + e.message); rbad++; return; }
        if (!r || !r.entry || r.entry.id !== l.to) { c.fail("LolPatches.resolve(" + l.page + ", " + l.id + ") -> " + (r && r.entry && r.entry.id) + ", expected " + l.to); rbad++; return; }
        if (r.entry.season !== l.season) { c.fail("LolPatches.resolve(" + l.id + ").entry.season " + r.entry.season + ", expected " + l.season); rbad++; }
        if ((l.to !== l.id) !== !!r.alias) { c.fail("LolPatches.resolve(" + l.id + ").alias " + JSON.stringify(r.alias)); rbad++; }
        if (l.codec && (!r.alias || r.alias.codec !== l.codec)) { c.fail("LolPatches.resolve(" + l.id + ").alias.codec " + (r.alias && r.alias.codec) + ", expected " + l.codec); rbad++; }
    });
    UNLISTED_SAMPLES.forEach(function (s) {
        n++;
        let r;
        try { r = rt.LolPatches.resolve(s[0], s[1]); } catch (e) { c.fail("LolPatches.resolve(" + s[0] + ", " + s[1] + ") throws " + e.message); rbad++; return; }
        const got = r && r.entry ? r.entry.id : null;
        if (got !== s[2]) { c.fail("LolPatches.resolve(" + s[0] + ", " + s[1] + ") -> " + got + ", expected " + s[2]); rbad++; }
    });
    PAGES.forEach(function (page) {
        const ents = (reg.LOL_PATCHES || {})[page] || [];
        ents.forEach(function (e) {
            n++;
            const r = rt.LolPatches.resolve(page, e.id);
            if (!r || !r.entry || r.entry.id !== e.id || r.alias) { c.fail("LolPatches.resolve(" + page + ", " + e.id + ") is not the entry itself"); rbad++; }
        });
        Object.keys(SEASON_DEFAULTS[page]).forEach(function (k) {
            n++;
            const d = rt.LolPatches.seasonDefault(page, k);
            const id = d && (d.id || d);
            if (id !== SEASON_DEFAULTS[page][k]) { c.fail("LolPatches.seasonDefault(" + page + ", " + k + ") -> " + id); rbad++; }
            const ids = (rt.LolPatches.list(page, k) || []).map(function (e) { return e.id; });
            const want = listedSpec(page).filter(function (x) { return x.season === k; }).map(function (x) { return P.idFor(page, x.patch); });
            if (!reg.stub[page] && ids.join() !== want.join()) { c.fail("LolPatches.list(" + page + ", " + k + ") = " + ids.join(" ") + "; expected " + want.join(" ") + " (oldest first, D10)"); rbad++; }
        });
        n++;
        const pd = rt.LolPatches.pageDefault(page);
        if (!pd || (pd.id || pd) !== PAGE_DEFAULTS[page]) { c.fail("LolPatches.pageDefault(" + page + ") -> " + (pd && (pd.id || pd))); rbad++; }
    });
    if (!rbad) c.pass("lol-data.js: " + n + " LolPatches lookups (24 legacy ids, " + UNLISTED_SAMPLES.length + " unlisted ids, every listed id, defaults, season lists) as specified" +
        (stubNote.length ? " (registry built from the stub listing for " + stubNote.join(", ") + ")" : ""));
}

// ---- G6 era / airPeriod / combiner / quintHalo per entry (§3.5) -----------
function checkG6(world, c) {
    const reg = world.registry();
    if (reg.missing || reg.error) { c.skip("patch-registry.js " + (reg.missing ? "missing" : reg.error) + " (T1): the chrome fields live in the registry"); return; }
    PAGES.forEach(function (page) {
        const list = reg.LOL_PATCHES[page] || [];
        let bad = 0, crossBad = 0;
        list.forEach(function (e) {
            const p = entryPatch(e);
            if (!p) return;
            const want = { era: RULES.era(page, p) };
            if (page === "masteries") {
                if (want.era === "air") want.airPeriod = RULES.airPeriod(p);
                want.system = RULES.system(p);
                if (want.system === "classic") want.look = RULES.look(p);
                else want.airFiveRankLayout = RULES.fiveRank(p);
            } else if (page === "runes") {
                if (want.era === "air") want.airPeriod = RULES.airPeriod(p);
                want.combiner = RULES.combiner(p);
                want.quintHalo = RULES.quintHalo(p);
            } else want.shardEra = RULES.shardEra(p);
            Object.keys(want).forEach(function (k) {
                let got = e[k];
                if (got === undefined && k === "shardEra") got = null;
                if (got === undefined && (k === "look" || k === "airFiveRankLayout" || k === "system")) return;   // may live in the payload (M1/M2)
                if (got !== want[k]) { c.fail(page + " " + e.id + "." + k + " = " + JSON.stringify(got) + ", §3.5 says " + JSON.stringify(want[k])); bad++; }
            });
            if (page !== "reforged" && want.era === "lcu" && e.airPeriod !== undefined && e.airPeriod !== "2014") { c.fail(page + " " + e.id + ": LCU entry with airPeriod " + e.airPeriod); bad++; }
            if (page === "masteries") {
                const ai = RULES.airIconVersion(p);
                if (e.airIconVersion !== undefined && (e.airIconVersion || null) !== ai) { c.fail(page + " " + e.id + ".airIconVersion " + e.airIconVersion + ", expected " + ai); bad++; }
            }
            // cross-check the shared library (P0-B) against the rules here
            const ch = safe(function () { return P.chromeOf(page, p); });
            if (ch) Object.keys(want).forEach(function (k) {
                if (ch[k] !== undefined && ch[k] !== want[k] && !(k === "airPeriod")) { crossBad++; c.fail("tools/lib/patches.js chromeOf(" + page + ", " + p + ")." + k + " = " + ch[k] + " disagrees with §3.5 (" + want[k] + ")"); }
            });
        });
        if (!list.length) c.skip(page + ": no registry entries");
        else if (!bad && !crossBad) c.pass(page + ": era" + (page === "masteries" ? ", airPeriod, system, look, airFiveRankLayout" : page === "runes" ? ", airPeriod, combiner, quintHalo" : ", shardEra") +
            " of " + list.length + " entries follow §3.5" + (reg.stub[page] ? " (stub listing)" : ""));
    });
}

// ---- G7 labels (§3.3) -------------------------------------------------------
function checkG7(world, c) {
    PAGES.forEach(function (page) {
        const list = needEntries(world, page, c);
        if (!list) return;
        let bad = 0;
        const seen = {};
        list.forEach(function (e) {
            const p = P.tryParse(e.patch);
            if (!e.label) { c.fail(page + " " + e.id + ": no label"); bad++; return; }
            if (seen[e.label]) { c.fail(page + ": label " + e.label + " used twice"); bad++; }
            seen[e.label] = true;
            if (p && e.label.indexOf(p.label) !== 0 && e.label.indexOf(P.officialName(p)) !== 0) { c.fail(page + " " + e.id + ": label " + JSON.stringify(e.label) + " does not start with " + p.label); bad++; }
            if (e.label.length > 45) { c.fail(page + " " + e.id + ": label " + JSON.stringify(e.label) + " has " + e.label.length + " characters (the select is 320 px)"); bad++; }
        });
        Object.keys(LABEL_EXAMPLES[page]).forEach(function (patch) {
            const e = list.filter(function (x) { return entryPatch(x) && eq(x.patch, patch); })[0];
            if (!e) return;
            let want = LABEL_EXAMPLES[page][patch];
            const exact = want.charAt(0) === "=";
            if (exact) want = want.slice(1);
            const ok = e.label === want || (!exact && e.label === want + " (approx.)");
            if (!ok) { c.fail(page + " " + patch + ": label " + JSON.stringify(e.label) + ", §3.3 gives " + JSON.stringify(want)); bad++; }
        });
        if (!bad) c.pass(page + ": " + list.length + " unique labels; the §3.3 examples and curated tags hold");
    });
}

// ---- C1 / C2 change rule (payload hashes) ----------------------------------
// Boundary patches marked ° in §3.2 whose data may still differ, because
// DESIGN.md itself says what differs ("unless its reason says otherwise").
const C2_DOCUMENTED = {
    masteries: { "V1.0.0.128": "Reinforce text only, low confidence" }
};
// The listing's text-only marker for a no-change boundary: {why} | {bad} | {}.
function textOnlyMarker(world, page, rec) {
    if (!isObj(rec)) return {};
    if (rec.textOnly) return { why: "textOnly: " + (typeof rec.textOnly === "string" ? rec.textOnly : "true") };
    if (Array.isArray(rec.noise) && rec.noise.length) {
        const noise = world.noise(page);
        const ids = {};
        (noise.records || []).forEach(function (r) { if (r && r.id) ids[r.id] = 1; });
        const unknown = rec.noise.filter(function (id) { return !ids[id]; });
        if (unknown.length) return { bad: "listing names noise " + unknown.join(", ") + " that " + (noise.file || "the noise file") + " does not define" };
        return { why: "noise " + rec.noise.join(", ") };
    }
    return {};
}
// The first changed string whose numbers differ ("path: [2.5] -> [3]"), else null.
function textNumberDiff(a, b) {
    const nums = function (s) { return (String(s).match(/\d+(?:\.\d+)?/g) || []).map(Number).join(","); };
    let out = null;
    const walk = function (x, y, p) {
        if (out || canon(x) === canon(y)) return;
        if (typeof x === "string" && typeof y === "string") { if (nums(x) !== nums(y)) out = p + ": [" + nums(x) + "] -> [" + nums(y) + "]"; return; }
        if (x && y && typeof x === "object" && typeof y === "object") {
            Array.from(new Set(Object.keys(x).concat(Object.keys(y)))).forEach(function (k) { walk(x[k], y[k], p ? p + "." + k : k); });
        }
    };
    walk(a, b, "");
    return out;
}
// The first differing paths of two payloads ("data.1.12.desc: a -> b").
function payloadDiff(a, b, max) {
    const out = [];
    const walk = function (x, y, p) {
        if (out.length >= max) return;
        if (canon(x) === canon(y)) return;
        if (x && y && typeof x === "object" && typeof y === "object" && Array.isArray(x) === Array.isArray(y)) {
            const ks = Array.from(new Set(Object.keys(x).concat(Object.keys(y))));
            ks.forEach(function (k) { walk(x[k], y[k], p ? p + "." + k : k); });
            return;
        }
        const s = function (v) { const t = v === undefined ? "(none)" : JSON.stringify(v); return t.length > 70 ? t.slice(0, 67) + "…" : t; };
        out.push((p || "(root)") + ": " + s(x) + " -> " + s(y));
    };
    walk(a, b, "");
    return out;
}
// What kind of difference payloadDiff found: icon folder / text / values.
function diffKinds(lines) {
    const k = {};
    lines.forEach(function (l) {
        const p = l.split(":")[0];
        if (/(^|\.)(iconBase|ddragonVersion|iconVer|icon|iconId|image)$/.test(p)) k["icon folder"] = 1;
        else if (/(^|\.)(desc|rankDesc(\.\d+)?|name|tooltip|shortDesc|longDesc)$/.test(p)) k["text"] = 1;
        else if (/^DDragon/.test(p)) k["runtime catalog"] = 1;
        else k["values / structure"] = 1;
    });
    return Object.keys(k).join(", ");
}
function calcHash(world, page, e, audit) {
    const r = world.payload(e);
    if (!("payload" in r)) return { why: r.why };
    if (page !== "reforged") return { hash: hashOf(r.payload) };
    const base = { extras: r.payload, shardEra: e.shardEra === undefined ? RULES.shardEra(e.patch) : e.shardEra };
    if (!audit) return { hash: hashOf(base), local: true };
    const cat = audit.reforgedCatalog(e.ddragonVersion);
    if (!cat) return { hash: hashOf(base), local: true, why: "no cached runesReforged-" + e.ddragonVersion + ".json" };
    return { hash: hashOf({ base: base, catalog: normalizeReforgedCatalog(applyPerkText(cat, r.payload && r.payload.perkText)) }) };
}
function checkC(world, c, which, audit) {
    PAGES.forEach(function (page) {
        const list = needEntries(world, page, c);
        if (!list) return;
        const spec = listedSpec(page);
        let ok = 0, bad = 0, unverifiable = 0, missing = 0;
        for (let i = 1; i < list.length; i++) {
            const e = list[i], prev = list[i - 1];
            const s = spec.filter(function (x) { return entryPatch(e) && eq(x.patch, e.patch); })[0];
            const isChange = /change/.test(String(e.reason));
            if (which === "C1" && !isChange) continue;
            if (which === "C2" && (isChange || !/^season-(start|end)$/.test(String(e.reason)))) continue;
            const a = calcHash(world, page, prev, audit), b = calcHash(world, page, e, audit);
            if (!a.hash || !b.hash) { missing++; if (missing <= 3) c.skip(page + " " + e.patch + ": " + (a.why || b.why)); continue; }
            const same = a.hash === b.hash;
            if (which === "C1") {
                if (!same) { ok++; continue; }
                if (page === "reforged" && (a.local || b.local)) { unverifiable++; continue; }
                c.fail(page + " " + e.patch + " is listed as a change (" + e.reason + ") but its data equals " + prev.patch); bad++;
            } else {
                if (same) {
                    if (page === "reforged" && (a.local || b.local)) unverifiable++;
                    else ok++;
                    continue;
                }
                const pa = world.payload(prev).payload, pb = world.payload(e).payload;
                let d = payloadDiff(pa, pb, 4);
                const allowed = (C2_DOCUMENTED[page] || {})[P.parse(e.patch).label];
                if (allowed) { c.info(page + " " + e.patch + " differs from " + prev.patch + " as DESIGN §3.2 documents (" + allowed + "): " + d.join("; ")); ok++; continue; }
                // "Unless its reason says otherwise": the listing record marks a
                // text-only boundary (D3, the client text of its own patch) with
                // `textOnly` (masteries) or `noise: [ids]` naming records of
                // data/patches/noise/<page>.json (runes). Accepted only when the
                // full payload diff is text; numbers and structure must be equal.
                const marker = textOnlyMarker(world, page, world.listingRecord(page, e.patch));
                if (marker.bad) { c.fail(page + " " + e.patch + ": " + marker.bad); bad++; continue; }
                if (marker.why) {
                    const full = payloadDiff(pa, pb, 100000);
                    const nums = textNumberDiff(pa, pb);
                    if (nums) { c.fail(page + " " + e.patch + " is marked text-only (" + marker.why + ") but a number in its text differs from " + prev.patch + ": " + nums); bad++; continue; }
                    if (full.length && diffKinds(full) === "text") {
                        c.info(page + " " + e.patch + " differs from " + prev.patch + " in text only, as its listing record says (" + marker.why + "): " + full.length + " text field(s), e.g. " + d[0]); ok++; continue;
                    }
                }
                if (page === "reforged" && !d.length && audit) {
                    // Only the runtime DDragon catalog differs. The page fetches
                    // it per patch, so listed text noise cannot be kept out.
                    const ca = normalizeReforgedCatalog(applyPerkText(audit.reforgedCatalog(prev.ddragonVersion), pa && pa.perkText));
                    const cb = normalizeReforgedCatalog(applyPerkText(audit.reforgedCatalog(e.ddragonVersion), pb && pb.perkText));
                    const ia = {}, ib = {};
                    ca.forEach(function (p) { p.slots.forEach(function (sl) { sl.forEach(function (r) { ia[r.id] = r; }); }); });
                    cb.forEach(function (p) { p.slots.forEach(function (sl) { sl.forEach(function (r) { ib[r.id] = r; }); }); });
                    const ids = diffKeys(ia, ib);
                    const noise = world.noise(page);
                    const between = (noise.records ? [e.patch] : []).some(function (x) { return noiseCovers(noise, P.parse(x)); });
                    d = ["DDragon " + prev.ddragonVersion + " -> " + e.ddragonVersion + " catalog: " + ids.length + " rune(s) differ (" + ids.slice(0, 5).join(", ") + ")"];
                    if (between) { c.info(page + " " + e.patch + " differs from " + prev.patch + " only by runtime catalog text that " + noise.file + " lists as noise: " + d[0]); ok++; continue; }
                }
                const kinds = diffKinds(d);
                c.fail(page + " " + e.patch + " (" + e.reason + ", no change per §3.2" + (s && s.mark === "°" ? " °" : "") + ") differs from " + prev.patch +
                    (e.data && prev.data ? " (" + e.data + " vs " + prev.data + ")" : "") + (kinds ? " [" + kinds + "]" : "") + ": " + d.join("; ")); bad++;
            }
        }
        if (missing > 3) c.skip(page + ": … " + (missing - 3) + " more pairs without data");
        if (unverifiable) c.skip(page + ": " + unverifiable + " Reforged pair(s) have the same local extras; the catalog is fetched from DDragon at runtime, so only --audit <raw cache> can compare them");
        if (!bad && ok) c.pass(page + ": " + ok + (which === "C1" ? " change patches differ from the previous listed patch" : " season boundaries without change equal the previous listed patch"));
        if (!bad && !ok && !missing && !unverifiable) c.pass(page + ": nothing of this kind (first listed patch only)");
    });
}

// ---- C3 audit: unlisted DDragon patches carry only listed noise -------------
function Audit(dir) { this.dir = dir; this.cache = {}; }
Audit.prototype.read = function (rel) {
    if (rel in this.cache) return this.cache[rel];
    const t = readText(path.join(this.dir, rel));
    let v = null;
    if (t !== null) { try { v = JSON.parse(t); } catch (e) { v = null; } }
    this.cache[rel] = v;
    return v;
};
Audit.prototype.builds = function (sub, re) {
    const dir = path.join(this.dir, sub);
    if (!fs.existsSync(dir)) return null;
    const by = new Map();
    fs.readdirSync(dir).forEach(function (f) {
        const m = re.exec(f);
        if (!m || m[1].split(".").some(function (x) { return +x > 9999; })) return;
        const p = safe(function () { return P.fromDdragon(m[1]); });
        if (!p) return;
        const cur = by.get(p.key);
        if (!cur || P.compareBuild(p, cur.p) > 0) by.set(p.key, { p: p, build: m[1], file: sub + "/" + f });
    });
    return Array.from(by.values()).sort(function (a, b) { return P.compare(a.p, b.p); });
};
Audit.prototype.reforgedCatalog = function (ver) {
    if (!ver) return null;
    const v = this.read("reforged/runesReforged-" + ver + ".json");
    return Array.isArray(v) ? v : null;
};
function applyPerkText(catalog, perkText) {
    const cat = clone(catalog);
    if (!perkText) return cat;
    cat.forEach(function (p) {
        (p.slots || []).forEach(function (s) {
            (s.runes || []).forEach(function (r) {
                const o = perkText[r.id] || perkText[String(r.id)];
                if (!o) return;
                if (o[0] != null) r.shortDesc = o[0];
                if (o[1] != null) r.longDesc = o[1];
            });
        });
    });
    return cat;
}
function normalizeReforgedCatalog(cat) {
    return (cat || []).map(function (p) {
        return { id: p.id, key: p.key, name: p.name, slots: (p.slots || []).map(function (s) {
            return (s.runes || []).map(function (r) { return { id: r.id, key: r.key, name: r.name, shortDesc: normText(r.shortDesc), longDesc: normText(r.longDesc) }; });
        }) };
    }).sort(function (a, b) { return a.id - b.id; });
}
function normalizeMasteryBuild(v) {
    const out = { tree: {}, m: {} };
    Object.keys(v.tree || {}).forEach(function (t) {
        out.tree[t] = (v.tree[t] || []).map(function (row) { return (row || []).map(function (c) { return c ? String(c.masteryId) : null; }); });
    });
    Object.keys(v.data || {}).forEach(function (id) {
        const m = v.data[id];
        out.m[id] = { name: String(m.name || "").trim(), ranks: m.ranks, desc: (m.description || []).map(normText), prereq: String(m.prereq || "0") };
    });
    return out;
}
function normalizeRuneBuild(v) {
    const out = {};
    Object.keys(v.data || {}).forEach(function (id) {
        const r = v.data[id];
        const stats = {};
        Object.keys(r.stats || {}).forEach(function (k) { if (r.stats[k]) stats[k] = r.stats[k]; });
        out[id] = { name: r.name, desc: normText(r.description), tier: r.rune && r.rune.tier, type: r.rune && r.rune.type, stats: stats };
    });
    return out;
}
function diffKeys(a, b) {
    const out = [];
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach(function (k) { if (!deepEqual(a[k], b[k])) out.push(k); });
    return out;
}
function noiseCovers(noise, p) {
    const variants = [p.label, p.name, "V" + p.nums.join("."), p.nums.join(".")];
    const res = variants.map(function (v) { return new RegExp("(^|[^0-9.])" + v.replace(/^V/, "V?").replace(/[.()]/g, function (x) { return "\\" + x; }) + "(?![0-9])"); });
    return noise.records.some(function (r) {
        const where = [r.patch, r.patches, r.to, r.listed === false ? r.patch : null].filter(Boolean).map(String).join(" ");
        const hay = where || JSON.stringify(r);
        return res.some(function (re) { return re.test(hay); });
    });
}
function checkC3(world, c, audit) {
    if (!audit) { c.skip("optional audit; run with --audit [<raw cache>] (C3 compares every unlisted DDragon patch)"); return; }
    const plans = {
        masteries: { sub: "mastery", re: /^mastery-(\d+\.\d+(?:\.\d+)*)\.json$/, norm: normalizeMasteryBuild, from: "V3.6", to: "V7.21" },
        runes: { sub: "rune", re: /^rune-(\d+\.\d+(?:\.\d+)*)\.json$/, norm: normalizeRuneBuild, from: "V3.6", to: "V7.21" },
        reforged: { sub: "reforged", re: /^runesReforged-(\d+\.\d+(?:\.\d+)*)\.json$/, norm: function (v) { return normalizeReforgedCatalog(v); }, from: "V7.22", to: null }
    };
    PAGES.forEach(function (page) {
        const list = world.entries(page).list;
        if (!list) { c.skip(page + ": " + world.entries(page).why); return; }
        const noise = world.noise(page);
        if (noise.missing || noise.error) { c.skip(page + ": " + noise.file + " " + (noise.missing ? "missing" : noise.error)); return; }
        const plan = plans[page];
        const builds = audit.builds(plan.sub, plan.re);
        if (!builds) { c.skip(page + ": no " + plan.sub + "/ folder in the cache " + audit.dir); return; }
        let prev = null, checked = 0, bad = 0, withDiff = 0;
        builds.forEach(function (b) {
            if (!inRange(b.p, plan.from, plan.to)) return;
            const v = audit.read(b.file);
            if (!v) return;
            const cur = plan.norm(v);
            const listed = list.some(function (e) { return entryPatch(e) && eq(e.patch, b.p); });
            if (prev && !listed) {
                checked++;
                let items;
                if (page === "masteries") items = diffKeys(prev.m, cur.m).concat(deepEqual(prev.tree, cur.tree) ? [] : ["tree layout"]);
                else if (page === "runes") items = diffKeys(prev, cur);
                else {
                    const ia = {}, ib = {};
                    prev.forEach(function (p) { p.slots.forEach(function (s) { s.forEach(function (r) { ia[r.id] = r; }); }); });
                    cur.forEach(function (p) { p.slots.forEach(function (s) { s.forEach(function (r) { ib[r.id] = r; }); }); });
                    items = diffKeys(ia, ib);
                }
                if (items.length) {
                    withDiff++;
                    if (!noiseCovers(noise, b.p)) {
                        bad++;
                        c.fail(page + " " + b.p.label + " (unlisted, " + b.build + "): " + items.length + " changed item(s) vs the previous patch (" + items.slice(0, 6).join(", ") + (items.length > 6 ? ", …" : "") + ") and no noise record names " + b.p.label);
                    } else c.info(page + " " + b.p.label + " (unlisted): " + items.length + " changed item(s) (" + items.slice(0, 4).join(", ") + (items.length > 4 ? ", …" : "") + "), covered by a noise record");
                }
            }
            prev = cur;
        });
        if (!checked) c.skip(page + ": no unlisted DDragon build of " + plan.from + "-" + (plan.to || "now") + " in " + audit.dir + "/" + plan.sub);
        else if (!bad) c.pass(page + ": " + checked + " unlisted DDragon patches checked; the " + withDiff + " with a calculator-level difference are all named in " + noise.file);
    });
}

// ---- M1 / M2 structure -----------------------------------------------------
function masteryDatasets(world, c) {
    const list = needEntries(world, "masteries", c);
    if (!list) return null;
    const out = [];
    let missing = 0;
    list.forEach(function (e) {
        const r = world.payload(e);
        if (!("payload" in r)) { missing++; if (missing <= 3) c.skip("masteries " + e.id + ": " + r.why); return; }
        out.push({ entry: e, ds: Object.assign({}, e, r.payload) });
    });
    if (missing > 3) c.skip("masteries: … " + (missing - 3) + " more entries without data");
    return out;
}
function checkM1(world, c) {
    const sets = masteryDatasets(world, c);
    if (!sets) return;
    let n = 0, prevKeys = null, prevFamily = null;
    sets.forEach(function (x) {
        const e = x.entry, ds = x.ds, p = e.patch;
        const fam = familyOf(p);
        if (fam && ds.family !== fam.family) c.fail(e.id + ": family " + ds.family + ", §1.7 says " + fam.family);
        if (RULES.system(p) !== "classic") { prevKeys = null; prevFamily = ds.family; return; }
        n++;
        if (ds.system !== "classic") c.fail(e.id + ": system " + ds.system + ", expected classic");
        if (ds.look !== RULES.look(p)) c.fail(e.id + ": look " + ds.look + ", §3.5 says " + RULES.look(p));
        if (ds.maxPoints !== 30) c.fail(e.id + ": maxPoints " + ds.maxPoints);
        if (!Array.isArray(ds.data) || ds.data.length !== 3) { c.fail(e.id + ": data is not 3 trees"); return; }
        const totals = rankTotalsOf(p);
        const keys = [];
        ds.data.forEach(function (tree, t) {
            const w = e.id + " " + TIER_NAMES[t];
            const seen = {}, seenKey = {};
            let ranks = 0, lastIndex = 0;
            tree.forEach(function (m, i) {
                if (!m) { c.fail(w + "[" + i + "]: empty cell in the array"); return; }
                if (m.removed) c.fail(w + "." + m.key + ": removed entries must be dropped from the output (§1.6)");
                if (typeof m.key !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.key)) c.fail(w + "[" + i + "]: key " + JSON.stringify(m.key) + " is not a slug");
                if (seenKey[m.key]) c.fail(w + ": key " + m.key + " twice");
                seenKey[m.key] = true;
                if (!(m.index >= 1 && m.index <= 24) || m.index !== Math.floor(m.index)) c.fail(w + "." + m.key + ": index " + m.index + " outside 1-24");
                if (seen[m.index]) c.fail(w + ": index " + m.index + " twice");
                seen[m.index] = true;
                if (m.index <= lastIndex) c.fail(w + "." + m.key + ": array order is not grid order (index " + m.index + " after " + lastIndex + ")");
                lastIndex = m.index;
                if (!(m.ranks >= 1 && m.ranks <= 5)) c.fail(w + "." + m.key + ": ranks " + m.ranks);
                ranks += m.ranks || 0;
                if (m.parent != null) {
                    const par = tree[m.parent];
                    if (!par) c.fail(w + "." + m.key + ": parent " + m.parent + " does not exist");
                    else if (!(m.parent < i) || Math.floor((par.index - 1) / 4) >= Math.floor((m.index - 1) / 4)) c.fail(w + "." + m.key + ": parent " + par.key + " is not in a lower tier");
                }
                if (!m.name) c.fail(w + "." + m.key + ": no name");
                if (!m.icon) c.fail(w + "." + m.key + ": no icon");
                if (m.hashRanks != null || m.hashNote) c.fail(w + "." + m.key + ": canonical datasets carry no hashRanks / hashNote (§4.4)");
                for (let r = 1; r <= (m.ranks || 1); r++) {
                    const t2 = masteryText(m, r, false);
                    const ph = placeholderIn(t2);
                    if (ph) { c.fail(w + "." + m.key + " rank " + r + ": tooltip still holds " + JSON.stringify(ph) + ": " + JSON.stringify(normText(t2))); break; }
                    if (!normText(t2)) { c.fail(w + "." + m.key + " rank " + r + ": empty tooltip"); break; }
                }
            });
            if (totals && (tree.length !== totals[t][0] || ranks !== totals[t][1]))
                c.fail(w + ": " + tree.length + " masteries / " + ranks + " ranks, expected " + totals[t][0] + " / " + totals[t][1]);
            keys.push(Object.keys(seenKey));
        });
        familyKeyCheck(c, e, ds.family, prevFamily, prevKeys, keys, function (t) { return t; });
        prevKeys = keys; prevFamily = ds.family;
    });
    if (n) c.pass(n + " classic datasets checked (3 trees, grid order, index 1-24, parents, rank totals, families, tooltips)");
}
function familyKeyCheck(c, e, family, prevFamily, prevKeys, keys, treeKey) {
    if (!prevKeys || family !== prevFamily) return;
    const doc = FAMILY_KEY_CHANGES[P.parse(e.patch).label] || FAMILY_KEY_CHANGES[e.patch] || [];
    keys.forEach(function (ks, t) {
        const added = ks.filter(function (k) { return prevKeys[t].indexOf(k) < 0; }).sort();
        const removed = prevKeys[t].filter(function (k) { return ks.indexOf(k) < 0; }).sort();
        const d = doc.filter(function (x) { return x[0] === t || x[0] === treeKey(t); })[0] || [t, [], []];
        if (added.join() !== d[1].slice().sort().join() || removed.join() !== d[2].slice().sort().join())
            c.fail(e.id + " " + (typeof treeKey(t) === "string" ? treeKey(t) : TIER_NAMES[t]) + ": keys +" + JSON.stringify(added) + " -" + JSON.stringify(removed) +
                " against the previous " + family + " patch; documented: +" + JSON.stringify(d[1]) + " -" + JSON.stringify(d[2]) + " (curated aliases, §1.7)");
    });
}
function checkM2(world, c) {
    const sets = masteryDatasets(world, c);
    if (!sets) return;
    let n = 0, layoutChecked = 0, prevKeys = null, prevFamily = null;
    sets.forEach(function (x) {
        const e = x.entry, ds = x.ds, p = e.patch;
        if (RULES.system(p) !== "keystone") return;
        n++;
        if (ds.system !== "keystone") c.fail(e.id + ": system " + ds.system + ", expected keystone");
        if (ds.maxPoints !== 30) c.fail(e.id + ": maxPoints " + ds.maxPoints);
        if (!isObj(ds.data) || !Array.isArray(ds.data.trees) || ds.data.trees.length !== 3) { c.fail(e.id + ": data.trees is not 3 trees"); return; }
        const layout = ds.data.airFiveRankLayout || ds.airFiveRankLayout;
        if (layout !== RULES.fiveRank(p)) c.fail(e.id + ": airFiveRankLayout " + layout + ", §3.5 says " + RULES.fiveRank(p));
        const keys = [];
        ds.data.trees.forEach(function (t, ti) {
            const w = e.id + " " + t.id;
            if (t.id !== KEYSTONE_TREES[ti]) c.fail(w + ": tree " + ti + " is " + t.id + ", expected " + KEYSTONE_TREES[ti]);
            const tiers = t.tiers || [];
            if (tiers.length !== 6) { c.fail(w + ": " + tiers.length + " tiers"); return; }
            const seen = {};
            tiers.forEach(function (tier, j) {
                const ms = (tier.masteries || []).filter(Boolean);
                if ((tier.masteries || []).some(function (m) { return !m; })) c.info(w + " tier " + (j + 1) + ": null cells in masteries[] (the code index counts them)");
                if (tier.tier !== undefined && tier.tier !== j + 1) c.fail(w + ": tier " + j + " has tier " + tier.tier);
                const pool = j === 5 ? 1 : Math.max.apply(null, [1].concat(ms.map(function (m) { return m.ranks || 1; })));
                const wantPool = [5, 1, 5, 1, 5, 1][j];
                if (pool !== wantPool) c.fail(w + " tier " + (j + 1) + ": pool " + pool + ", expected " + wantPool);
                if (j === 5) {
                    if (!tier.isKeystone) c.fail(w + " tier 6: isKeystone missing");
                    if (ms.length !== 3) c.fail(w + " tier 6: " + ms.length + " keystones, expected 3");
                    ms.forEach(function (m) { if (!m.keystone) c.fail(w + "." + (m.key || m.id) + ": keystone flag missing"); if (m.ranks !== 1) c.fail(w + "." + (m.key || m.id) + ": a keystone with " + m.ranks + " ranks"); });
                } else if (tier.isKeystone) c.fail(w + " tier " + (j + 1) + ": isKeystone");
                if (wantPool === 5 && ms.length !== 2) c.fail(w + " tier " + (j + 1) + ": " + ms.length + " masteries in a 5-point row (2 expected)");
                if (wantPool === 1 && j < 5 && (ms.length < 2 || ms.length > 3)) c.fail(w + " tier " + (j + 1) + ": " + ms.length + " options in a one-point row");
                ms.forEach(function (m) {
                    const k = m.key || m.id;
                    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(k))) c.fail(w + ": key " + JSON.stringify(k) + " is not a slug");
                    if (seen[k]) c.fail(w + ": key " + k + " twice");
                    seen[k] = true;
                    if (!m.name || /displayname/i.test(m.name) || m.name !== m.name.trim()) c.fail(w + "." + k + ": name " + JSON.stringify(m.name));
                    if (!m.iconId) c.fail(w + "." + k + ": no iconId");
                    if ((m.ranks || 1) > 1 && (!Array.isArray(m.rankDesc) || m.rankDesc.length !== m.ranks)) c.fail(w + "." + k + ": rankDesc has " + (m.rankDesc ? m.rankDesc.length : 0) + " of " + m.ranks + " ranks (D5: DDragon per-rank text)");
                    for (let r = 1; r <= (m.ranks || 1); r++) {
                        const ph = placeholderIn(masteryText(m, r, true));
                        if (ph) { c.fail(w + "." + k + " rank " + r + ": tooltip holds " + JSON.stringify(ph)); break; }
                    }
                });
            });
            keys.push(Object.keys(seen));
        });
        familyKeyCheck(c, e, ds.family, prevFamily, prevKeys, keys, function (t) { return KEYSTONE_TREES[t]; });
        prevKeys = keys; prevFamily = ds.family;
        // airIcon for Fresh Blood / Double-Edged Sword in V6.22-V6.24 (AIR)
        const ai = RULES.airIconVersion(p);
        if (ai) {
            const cells = masteryCells(ds);
            ["fresh-blood", "double-edged-sword"].forEach(function (k) {
                const cell = cells.filter(function (x) { return x.key === k; })[0];
                if (!cell) { c.fail(e.id + ": no " + k); return; }
                const a = cell.m.airIcon;
                if (!a || a.ver !== ai) c.fail(e.id + "." + k + ": airIcon " + JSON.stringify(a) + ", §3.5 says the " + ai + " art in AIR");
            });
        }
        // layout against the DDragon tree (null cells)
        const rec = world.listingRecord("masteries", p);
        const build = rec && rec.source && rec.source.ddragon;
        const src = build ? world.masterySource(build) : null;
        if (!build) c.skip(e.id + ": no source.ddragon build in the listing; DDragon layout not compared");
        else if (!src || !src.tree) c.skip(e.id + ": DDragon " + build + " tree layout not found (data/sources/masteries/ddragon/" + build + ".json; or pass --research)");
        else {
            layoutChecked++;
            const names = Object.keys(src.tree);
            ds.data.trees.forEach(function (t, ti) {
                const dt = src.tree[names.filter(function (nm) { return nm.toLowerCase() === t.id; })[0] || names[ti]] || [];
                let hasNull = false;
                (t.tiers || []).forEach(function (tier, j) {
                    const row = (dt[j] || []);
                    if (row.length === 3 && row[1] === null) hasNull = true;
                    const want = row.filter(Boolean).map(function (cell) { return String(cell.masteryId); });
                    const got = (tier.masteries || []).filter(Boolean).map(function (m) { return String(m.iconId); });
                    if (want.join() !== got.join()) c.fail(e.id + " " + t.id + " tier " + (j + 1) + ": order " + got.join(",") + ", DDragon " + build + " has " + want.join(","));
                });
                const wantLayout = hasNull ? "edge" : "pair";
                if (layout !== wantLayout) c.fail(e.id + " " + t.id + ": airFiveRankLayout " + layout + ", DDragon " + build + " null cells say " + wantLayout);
            });
        }
    });
    if (n) c.pass(n + " keystone datasets checked (6 tiers, pools 5/1/5/1/5/1, 3 keystones, keys, rankDesc" + (layoutChecked ? ", DDragon order and null-cell layout on " + layoutChecked : "") + ")");
}

// ---- M3 icons -------------------------------------------------------------
function checkM3(world, c) {
    const sets = masteryDatasets(world, c);
    if (!sets) return;
    let files = 0;
    const seen = {}, missing = [];
    const need = function (rel, who) {
        if (seen[rel] !== undefined) return;
        seen[rel] = world.exists(rel);
        files++;
        if (!seen[rel]) missing.push(who + ": " + rel + " missing");
    };
    sets.forEach(function (x) {
        const ds = x.ds, e = x.entry;
        const air = (e.era || RULES.era("masteries", e.patch)) === "air";
        masteryCells(ds).forEach(function (cell) {
            const m = cell.m, who = e.id + " " + cell.key;
            if (isKeystone(ds)) {
                const base = m.iconBase || (m.iconVer ? "images/masteries/" + m.iconVer + "/" : null) || ds.iconBase || "images/masteries/" + ds.ddragonVersion + "/";
                need(base + m.iconId + ".png", who);
                if (air) need(base + "gray_" + m.iconId + ".png", who);
                if (air && m.airIcon) {
                    need("images/masteries/" + m.airIcon.ver + "/" + m.airIcon.id + ".png", who + " (AIR art)");
                    need("images/masteries/" + m.airIcon.ver + "/gray_" + m.airIcon.id + ".png", who + " (AIR art)");
                }
            } else {
                const base = m.iconBase || ds.iconBase || "";
                need(base + m.icon + ".png", who);
                if (air) need(base + "gray_" + m.icon + ".png", who);
            }
        });
    });
    // Before T3 has run (no icon map), T2 points at the dataset's own build
    // folder (DESIGN §6 T3 note): report, but do not fail yet.
    const t3Pending = !world.exists("data/sources/masteries/icon-map.json");
    if (missing.length && t3Pending) {
        c.skip("data/sources/masteries/icon-map.json missing (T3 pending; T2 re-runs after it): " + missing.length + " of " + files +
            " referenced icon files missing, e.g. " + missing.slice(0, 3).join("; "));
    } else missing.forEach(function (m) { c.fail(m); });
    if (!missing.length && files) c.pass(files + " icon files referenced by " + sets.length + " mastery datasets exist (gray_ for AIR)");
}

// ---- M4 / R8 / F6 overrides -----------------------------------------------
function lookupTarget(payload, target) {
    const hits = [];
    const t = String(target);
    const walk = function (x, depth) {
        if (!x || typeof x !== "object" || depth > 8) return;
        if (Array.isArray(x)) { x.forEach(function (y) { walk(y, depth + 1); }); return; }
        if ([x.id, x.key, x.icon, x.iconId, x.name].some(function (v) { return v != null && String(v) === t; })) hits.push(x);
        Object.keys(x).forEach(function (k) { if (k === t && x[k] && typeof x[k] === "object") hits.push(x[k]); walk(x[k], depth + 1); });
    };
    walk(payload, 0);
    return hits;
}
function getField(obj, field) {
    const parts = String(field).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    let cur = obj;
    for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
    return cur;
}
function checkOverrides(world, c, page) {
    const ov = world.overrides(page);
    if (ov.missing) { c.skip(page + ": " + ov.file + " missing (" + ({ masteries: "T2", runes: "T5", reforged: "T7a" })[page] + " pending)"); return; }
    if (ov.error) { c.fail(page + ": " + ov.file + ": " + ov.error); return; }
    const list = needEntries(world, page, c);
    if (!list) return;
    const ids = {};
    let applied = 0, verified = 0, bad = 0;
    ov.records.forEach(function (o, i) {
        const w = page + " override " + (o.id || "#" + i);
        const fail = function (m) { c.fail(w + ": " + m); bad++; };
        if (!o.id) fail("no id");
        if (ids[o.id]) fail("duplicate id");
        ids[o.id] = true;
        if (["export-fix", "wiki-fact", "correction"].indexOf(o.kind) < 0) fail("kind " + JSON.stringify(o.kind));
        if (o.page && o.page !== page && !(page === "reforged" && /reforged/.test(o.page))) fail("page " + o.page);
        if (!P.tryParse(o.from) || (o.to != null && !P.tryParse(o.to))) { fail("from/to do not parse"); return; }
        if (!o.reason) fail("no reason");
        if (!Array.isArray(o.sources) || !o.sources.length) fail("no sources");
        if (CONFIDENCE.indexOf(o.confidence) < 0) fail("confidence " + JSON.stringify(o.confidence));
        const inR = list.filter(function (e) { return entryPatch(e) && inRange(e.patch, o.from, o.to); });
        if (!inR.length) { fail("its range " + o.from + "-" + (o.to || "…") + " covers no listed patch (dead)"); return; }
        inR.forEach(function (e) {
            if (!e.file) return;
            const f = world.dataFile(e.file);
            if (f.missing || f.error || !f.header) return;
            if (f.header.overrides.indexOf(o.id) < 0) fail(e.id + ": " + e.file + " header does not list it as applied");
            else applied++;
            if (o.target != null && o.field && o.value !== undefined) {
                const call = f.calls.filter(function (x) { return x.key === e.data; })[0];
                const hits = call ? lookupTarget(call.payload, o.target) : [];
                const vals = hits.map(function (h) { return getField(h, o.field); }).filter(function (v) { return v !== undefined; });
                if (vals.length) {
                    verified++;
                    if (!vals.some(function (v) { return deepEqual(v, o.value) || (typeof v === "number" && typeof o.value === "number" && Math.abs(v - o.value) < 1e-9); }))
                        fail(e.id + ": " + o.target + "." + o.field + " = " + JSON.stringify(vals[0]) + ", the override sets " + JSON.stringify(o.value));
                }
            }
        });
    });
    if (!bad) c.pass(page + ": " + ov.records.length + " overrides well-formed and listed as applied in " + applied + " entry header(s)" + (verified ? "; " + verified + " values found in the payloads" : ""));
}

// ---- M5 S3 numeric cross-check ---------------------------------------------
function nums(t) { return (String(t).match(/\d+(?:\.\d+)?/g) || []).map(Number); }
function checkM5(world, c) {
    const builds = ["3.6.14", "3.13.24"];
    const srcs = builds.map(function (b) { return world.masterySource(b); });
    if (srcs.some(function (s) { return !s || !s.data; })) {
        c.skip("DDragon " + builds.filter(function (b, i) { return !srcs[i] || !srcs[i].data; }).join(" / ") + " not found (data/sources/masteries/ddragon/<build>.json, or --research)");
        return;
    }
    const sets = masteryDatasets(world, c);
    if (!sets) return;
    const s3 = sets.filter(function (x) { return x.entry.season === "s3" || (entryPatch(x.entry) && inRange(x.entry.patch, "V1.0.0.152", "V3.13")); });
    if (!s3.length) { c.skip("no S3 mastery dataset yet"); return; }
    s3.forEach(function (x) {
        srcs.forEach(function (src, si) {
            const byName = {};
            Object.keys(src.data).forEach(function (id) { byName[String(src.data[id].name).trim().toLowerCase()] = src.data[id]; });
            let ranksChecked = 0, bad = 0;
            masteryCells(x.ds).forEach(function (cell) {
                const m = cell.m, d = byName[String(m.name).trim().toLowerCase()];
                if (!d) { c.fail(x.entry.id + "." + cell.key + ": not in DDragon " + builds[si] + " (by name)"); bad++; return; }
                if (d.ranks !== m.ranks) { c.fail(x.entry.id + "." + cell.key + ": " + m.ranks + " ranks, DDragon " + builds[si] + " has " + d.ranks); bad++; }
                const desc = d.description || d.desc || [];
                const staticNums = nums(String(m.desc || "").replace(/#/g, " ").replace(/\|/g, ""));
                for (let r = 0; r < (m.ranks || 1); r++) {
                    ranksChecked++;
                    const dn = nums(desc[r]);
                    let want = [];
                    if (Array.isArray(m.rankDesc)) want = nums(m.rankDesc[r]);
                    else {
                        if (m.rankInfo && m.rankInfo[r] != null) want.push(m.rankInfo[r]);
                        if (m.rankInfo2 && m.rankInfo2[r] != null) want.push(m.rankInfo2[r]);
                        want = want.concat(staticNums);
                    }
                    const miss = want.filter(function (v) { return dn.indexOf(v) < 0; });
                    if (miss.length) { c.fail(x.entry.id + "." + cell.key + " rank " + (r + 1) + ": " + miss.join(", ") + " not in DDragon " + builds[si] + " " + JSON.stringify(normText(desc[r]))); bad++; }
                }
            });
            if (!bad) c.pass(x.entry.id + ": every number of " + ranksChecked + " ranks agrees with DDragon " + builds[si] + " (" + src.source + ")");
        });
    });
}

// ---- M6 spot checks ----------------------------------------------------------
function findCell(ds, target) {
    const cells = masteryCells(ds);
    const ti = treeIndexOf(ds, target.tree);
    return cells.filter(function (c) { return c.key === target.key && (ti == null || c.treeIndex === ti); });
}
function textMatches(text, spec) {
    const t = normText(text), errs = [];
    [].concat(spec.contains || []).forEach(function (s) { if (t.indexOf(normText(s)) < 0) errs.push("lacks " + JSON.stringify(s)); });
    [].concat(spec.notContains || []).forEach(function (s) { if (t.indexOf(normText(s)) >= 0) errs.push("contains " + JSON.stringify(s)); });
    if (spec.equals != null && t !== normText(spec.equals)) errs.push("is not " + JSON.stringify(spec.equals));
    [].concat(spec.matches || []).forEach(function (s) { if (!new RegExp(s, "i").test(t)) errs.push("does not match /" + s + "/"); });
    return errs;
}
function runSpotcheck(world, sc, patch) {
    const page = sc.page || "masteries";
    const e = world.entryByPatch(page, patch);
    if (!e) return { skip: page + " " + patch + " not listed (yet)" };
    const ds = world.dataset(e);
    const x = sc.expect || {};
    const errs = [];
    if (x.date && e.date !== x.date) errs.push("date " + e.date + ", expected " + x.date);
    if (x.note) {
        const rec = world.listingRecord(page, patch);
        if (!rec || world.listing(page).stub) return { skip: "listing record of " + patch + " not available", errs: errs };
        const texts = (rec.changes || []).map(function (ch) { return String(ch && ch.text || ch); });
        const ok = texts.some(function (t) { return [].concat(x.note).every(function (re) { return new RegExp(re, "i").test(t); }); });
        if (!ok) errs.push("no change note matches " + [].concat(x.note).map(function (r) { return "/" + r + "/"; }).join(" + "));
    }
    const needsData = Object.keys(x).some(function (k) { return ["date", "note"].indexOf(k) < 0; });
    if (!needsData) return { errs: errs };
    if (!ds) return { skip: e.id + ": " + (world.payload(e).why || "no data"), errs: errs };
    if (x.sameDataAs) {
        const o = world.entryByPatch(page, x.sameDataAs);
        const od = o && world.payload(o);
        if (!od || !("payload" in od)) return { skip: x.sameDataAs + " has no data", errs: errs };
        if (hashOf(od.payload) !== hashOf(world.payload(e).payload)) errs.push("data differs from " + x.sameDataAs + " (" + e.data + " vs " + o.data + ")");
    }
    if (x.keysAbsent) {
        const keys = masteryCells(ds).map(function (cl) { return cl.key; });
        [].concat(x.keysAbsent).forEach(function (k) { if (keys.indexOf(k) >= 0) errs.push("has key " + k); });
    }
    if (sc.key) {
        const cells = findCell(ds, sc);
        if (x.absent) { if (cells.length) errs.push(sc.key + " is present"); return { errs: errs }; }
        if (!cells.length) { errs.push("no mastery with key " + sc.key + (sc.tree != null ? " in " + sc.tree : "")); return { errs: errs }; }
        if (cells.length > 1) { errs.push("key " + sc.key + " in " + cells.length + " trees; name the tree"); return { errs: errs }; }
        const cell = cells[0], m = cell.m, ks = isKeystone(ds);
        if (x.name != null && m.name !== x.name) errs.push("name " + JSON.stringify(m.name) + ", expected " + JSON.stringify(x.name));
        if (x.ranks != null && m.ranks !== x.ranks) errs.push("ranks " + m.ranks + ", expected " + x.ranks);
        if (x.icon != null && String(ks ? m.iconId : m.icon) !== String(x.icon)) errs.push("icon " + (ks ? m.iconId : m.icon) + ", expected " + x.icon);
        if (x.tier != null && cell.tier !== x.tier) errs.push("tier " + cell.tier + ", expected " + x.tier);
        if (x.index != null && m.index !== x.index) errs.push("index " + m.index + ", expected " + x.index);
        if (x.rankDesc) {
            const got = [];
            for (let r = 1; r <= (m.ranks || 1); r++) got.push(normText(masteryText(m, r, ks)));
            const want = x.rankDesc.map(normText);
            if (got.join(" | ") !== want.join(" | ")) errs.push("rank texts " + JSON.stringify(got) + ", expected " + JSON.stringify(want));
        }
        if (x.placeholders === false) {
            for (let r = 1; r <= (m.ranks || 1); r++) {
                const ph = placeholderIn(masteryText(m, r, ks));
                if (ph) { errs.push("rank " + r + " tooltip holds " + JSON.stringify(ph) + ": " + JSON.stringify(normText(masteryText(m, r, ks)))); break; }
            }
        }
        if (x.text) {
            Object.keys(x.text).forEach(function (rk) {
                const ranks = rk === "all" ? Array.from({ length: m.ranks || 1 }, function (_, i) { return i + 1; }) : [rk === "last" ? (m.ranks || 1) : +rk];
                ranks.forEach(function (r) {
                    textMatches(masteryText(m, r, ks), x.text[rk]).forEach(function (er) {
                        errs.push("rank " + r + " text " + er + " (" + JSON.stringify(normText(masteryText(m, r, ks))) + ")");
                    });
                });
            });
        }
    }
    return { errs: errs };
}
function checkM6(world, c) {
    const j = world.json("tools/fixtures/spotchecks.json");
    if (!j.value) { c.fail("tools/fixtures/spotchecks.json " + (j.missing ? "missing" : j.error)); return; }
    const checks = j.value.checks || [];
    if (!world.entries("masteries").list) { c.skip("masteries: " + world.entries("masteries").why + "; " + checks.length + " spot checks not run"); return; }
    let ok = 0, bad = 0, skipped = 0;
    checks.forEach(function (sc) {
        [].concat(sc.patch || sc.patches || []).forEach(function (patch) {
            const r = runSpotcheck(world, sc, patch);
            const label = sc.id + " " + patch + (sc.key ? " " + (sc.tree != null ? sc.tree + "." : "") + sc.key : "") + " (" + sc.what + ")";
            if (r.errs && r.errs.length) { bad++; c.fail(label + ": " + r.errs.join("; ")); }
            else if (r.skip) { skipped++; c.skip(label + ": " + r.skip); }
            else ok++;
        });
    });
    if (ok) c.pass(ok + " spot check assertions hold (" + checks.length + " checks in tools/fixtures/spotchecks.json)");
}

// ---- R runes -----------------------------------------------------------------
function runeDatasets(world, c) {
    const list = needEntries(world, "runes", c);
    if (!list) return null;
    const out = [];
    let missing = 0;
    list.forEach(function (e) {
        const r = world.payload(e);
        if (!("payload" in r)) { missing++; if (missing <= 3) c.skip("runes " + e.id + ": " + r.why); return; }
        out.push({ entry: e, ds: Object.assign({}, e, r.payload) });
    });
    if (missing > 3) c.skip("runes: … " + (missing - 3) + " more entries without data");
    return out;
}
function runeStats(r) { return Object.assign({}, r.base || {}); }
function hasStat(ds, keys) {
    return (ds.runes || []).filter(function (r) {
        return keys.some(function (k) { return (r.base && r.base[k]) || (r.perLevel && r.perLevel[k]); });
    });
}
function checkR1(world, c) {
    const sets = runeDatasets(world, c);
    if (!sets) return;
    const sk = world.runeStatKeys();
    const known = (sk.keys || []).slice();
    if (sk.missing || sk.error) c.skip("runes-calculator.js CLIENT_STAT " + (sk.missing ? "missing" : sk.error));
    if (known.indexOf("dodge") < 0) {
        if (sk.reworked) c.fail("runes-calculator.js CLIENT_STAT has no dodge row (DESIGN §1.6 / T6)");
        else c.skip("runes-calculator.js not reworked yet (T6): its CLIENT_STAT has no dodge row; dodge counted as mapped (§1.6)");
        known.push("dodge");
    }
    let bad = 0, runes = 0;
    sets.forEach(function (x) {
        const rec = world.listingRecord("runes", x.entry.patch);
        let src = null;
        if (rec && rec.source) {
            const rel = rec.source.ddragon ? "data/sources/runes/ddragon/" + rec.source.ddragon + ".json" : rec.source.wiki ? "data/sources/runes/wiki/" + P.parse(rec.source.wiki).name + ".json" : null;
            const sj = rel ? world.json(rel) : null;
            if (sj && sj.value) src = sj.value.data || sj.value;
        }
        (x.ds.runes || []).forEach(function (r) {
            runes++;
            const keys = Object.keys(r.base || {}).concat(Object.keys(r.perLevel || {}));
            keys.forEach(function (k) { if (known.indexOf(k) < 0) { c.fail(x.entry.id + " rune " + r.id + " (" + r.name + "): stat key " + k + " is not mapped in CLIENT_STAT"); bad++; } });
            if (!keys.length) { c.fail(x.entry.id + " rune " + r.id + " (" + r.name + "): no stats"); bad++; }
            if (src) {
                const s = Array.isArray(src) ? src.filter(function (y) { return String(y.id) === String(r.id); })[0] : src[r.id];
                if (s && s.stats) {
                    const n = Object.keys(s.stats).filter(function (k) { return s.stats[k]; }).length;
                    if (keys.length < n) { c.fail(x.entry.id + " rune " + r.id + ": " + n + " non-zero source stats but " + keys.length + " mapped"); bad++; }
                }
            }
        });
    });
    if (!bad && sets.length) c.pass(runes + " runes in " + sets.length + " entries use only mapped stat keys (" + known.length + " known)");
}
function checkR2(world, c) {
    const sets = runeDatasets(world, c);
    if (!sets) return;
    let bad = 0;
    sets.forEach(function (x) {
        const ds = x.ds, ids = {};
        const slotSum = RUNE_CATEGORIES.reduce(function (a, k) { return a + (((ds.slots || {})[k]) || 0); }, 0);
        if (ds.slots && slotSum !== 30) { c.fail(x.entry.id + ": slots add up to " + slotSum + " (the share link holds 30 ids)"); bad++; }
        if (!Array.isArray(ds.runes) || !ds.runes.length) { c.fail(x.entry.id + ": no runes[]"); bad++; return; }
        ds.runes.forEach(function (r) {
            const w = x.entry.id + " rune " + r.id;
            if (ids[r.id]) { c.fail(w + ": id twice"); bad++; }
            ids[r.id] = true;
            if (!/^\d+$/.test(String(r.id))) { c.fail(w + ": id is not numeric"); bad++; }
            if (RUNE_CATEGORIES.indexOf(r.category) < 0) { c.fail(w + ": category " + r.category); bad++; }
            if ([1, 2, 3].indexOf(r.tier) < 0) { c.fail(w + ": tier " + r.tier); bad++; }
            if (!r.name) { c.fail(w + ": no name"); bad++; }
            if (r.confidence !== undefined && ["low", "medium"].indexOf(r.confidence) < 0) { c.fail(w + ": confidence " + r.confidence + " (only below high is set)"); bad++; }
        });
        RUNE_CATEGORIES.forEach(function (cat) {
            if (!ds.runes.some(function (r) { return r.category === cat; })) { c.fail(x.entry.id + ": no " + cat); bad++; }
        });
    });
    if (!bad && sets.length) c.pass(sets.length + " rune catalogs: valid ids, categories, tiers and names");
}
function checkR3(world, c) {
    const sets = runeDatasets(world, c);
    if (!sets) return;
    const seen = {};
    let bad = 0;
    sets.forEach(function (x) {
        const base = x.entry.iconBasePath || x.ds.iconBasePath || "images/runes/";
        if (!x.entry.iconBasePath && !x.ds.iconBasePath && !seen.__noted) { seen.__noted = true; c.info("no iconBasePath on the entries; images/runes/ assumed"); }
        (x.ds.runes || []).forEach(function (r) {
            if (!r.icon) { c.fail(x.entry.id + " rune " + r.id + ": no icon"); bad++; return; }
            const rel = base + r.icon;
            if (!(rel in seen)) seen[rel] = world.exists(rel);
            if (!seen[rel]) { c.fail(x.entry.id + " rune " + r.id + " (" + r.name + "): " + rel + " missing"); bad++; }
        });
    });
    if (!bad && sets.length) c.pass("every rune icon of " + sets.length + " entries exists");
}
function checkR4to7(world, c, which) {
    const sets = runeDatasets(world, c);
    if (!sets) return;
    let bad = 0, n = 0;
    const at = function (patch) { return sets.filter(function (x) { return eq(x.entry.patch, patch); })[0]; };
    if (which === "R4") {
        sets.filter(function (x) { return inRange(x.entry.patch, "V6.22", "V7.21"); }).forEach(function (x) {
            n++;
            const r = (x.ds.runes || []).filter(function (y) { return String(y.id) === "5401"; })[0];
            const v = r && r.base && r.base.lethality;
            if (!(typeof v === "number" && Math.abs(v - 0.88) < 1e-9)) { c.fail(x.entry.id + ": rune 5401 lethality " + v + ", expected 0.88 (D7)"); bad++; }
        });
        if (!n) c.skip("no V6.22-V7.21 rune data yet");
        else if (!bad) c.pass("5401 Mark of Precision lethality 0.88 in " + n + " entries (V6.22-V7.21)");
    } else if (which === "R5") {
        sets.forEach(function (x) {
            n++;
            const d = hasStat(x.ds, ["dodge"]);
            if (cmp(x.entry.patch, "V1.0.0.132") < 0 && !d.length) { c.fail(x.entry.id + ": no dodge rune before V1.0.0.132"); bad++; }
            if (cmp(x.entry.patch, "V1.0.0.132") >= 0 && d.length) { c.fail(x.entry.id + ": dodge runes " + d.map(function (r) { return r.id; }).join(", ") + " after V1.0.0.132"); bad++; }
        });
        if (!bad && n) c.pass("dodge only before V1.0.0.132 (" + n + " entries)");
    } else if (which === "R6") {
        sets.forEach(function (x) {
            n++;
            const d = hasStat(x.ds, ["energy", "energyRegen"]);
            if (cmp(x.entry.patch, "V1.0.0.94b") < 0 && d.length) { c.fail(x.entry.id + ": energy runes before V1.0.0.94(b)"); bad++; }
            if (cmp(x.entry.patch, "V1.0.0.94b") >= 0 && !d.length) { c.fail(x.entry.id + ": no energy rune"); bad++; }
        });
        if (!bad && n) c.pass("energy runes from V1.0.0.94(b) on (" + n + " entries)");
    } else if (which === "R7") {
        const a = at("V6.22"), b = at("V7.21");
        if (!a || !b) { c.skip("V6.22 / V7.21 rune data not built yet"); return; }
        if (a.entry.data !== b.entry.data && hashOf(world.payload(a.entry).payload) !== hashOf(world.payload(b.entry).payload)) c.fail("V7.21 catalog " + b.entry.data + " differs from V6.22 " + a.entry.data + " (D8)");
        else c.pass("V7.21 shares the V6.22 catalog (" + b.entry.data + ")");
    }
}

// ---- F Reforged ----------------------------------------------------------------
function checkF1(world, c) {
    const list = needEntries(world, "reforged", c);
    if (list) {
        let bad = 0;
        list.forEach(function (e) {
            if (!entryPatch(e)) return;
            const want = RULES.shardEra(e.patch);
            const got = e.shardEra === undefined ? (e.derived ? want : undefined) : e.shardEra;
            if ((got === undefined ? "(missing)" : got) !== want) { c.fail(e.id + ".shardEra " + JSON.stringify(got) + ", §3.2 says " + JSON.stringify(want)); bad++; }
        });
        if (!bad) c.pass(list.length + " Reforged entries carry the §3.2 shard era" + (world.entries("reforged").derived ? " (derived entries: rule applied)" : ""));
    }
    const st = world.shardTables();
    if (st.missing || st.error) { c.fail("runes-reforged-data.js " + (st.missing ? "missing" : st.error)); return; }
    if (!st.reworked) { c.skip("runes-reforged-data.js not reworked yet (T7b): reforgedShardEras has " + Object.keys(st.eras).join(", ") + ", not the 7 eras " + SHARD_ERAS.map(function (e) { return e[1]; }).join(", ")); return; }
    let bad = 0;
    SHARD_ERAS.forEach(function (e) {
        const rows = st.eras[e[1]].rows || st.eras[e[1]];
        if (!Array.isArray(rows) || rows.length !== 3 || rows.some(function (r) { return !r.shards || r.shards.length !== 3; })) { c.fail("reforgedShardEras." + e[1] + ": not 3 rows of 3 shards"); bad++; }
    });
    const latest = st.eras["s25-22"].rows || st.eras["s25-22"];
    const sh = [].concat.apply([], (latest || []).map(function (r) { return r.shards || []; })).filter(function (s) { return String(s.id) === "5001"; });
    if (!sh.length || sh.some(function (s) { return !/10\s*-\s*180/.test(s.desc || ""); })) { c.fail("reforgedShardEras.s25-22 scaling Health: " + sh.map(function (s) { return s.desc; }).join(" / ") + " (expected 10-180, a correction)"); bad++; }
    if (st.legacyTables) { c.fail("runes-reforged-data.js still defines reforgedDataSets / REFORGED_PERK_TEXT (moved to the registry and the extras files, §1.6)"); bad++; }
    if (!bad) c.pass("runes-reforged-data.js: the 7 shard eras, s25-22 scaling Health 10-180");
}
function checkF2(world, c) {
    const list = needEntries(world, "reforged", c);
    if (!list) return;
    let bad = 0, n = 0, missing = 0;
    list.forEach(function (e) {
        const r = world.payload(e);
        if (!("payload" in r)) { missing++; if (missing <= 3) c.skip(e.id + ": " + r.why); return; }
        n++;
        const pl = r.payload || {};
        const ssb = pl.subStyleBonus || null;
        if (cmp(e.patch, "V8.22") <= 0) {
            REFORGED_PATHS.forEach(function (a) {
                REFORGED_PATHS.forEach(function (b) {
                    if (a === b) return;
                    const v = ssb && ssb[a] && ssb[a][b];
                    if (!v || !String(v).trim()) { c.fail(e.id + ": subStyleBonus " + a + "/" + b + " missing"); bad++; }
                });
            });
        } else if (ssb) { c.fail(e.id + ": subStyleBonus set after V8.22"); bad++; }
        const pt = pl.perkText || null;
        PERK_TEXT_RANGES.forEach(function (rg) {
            if (!inRange(e.patch, rg.from, rg.to)) return;
            if (rg.count) {
                const k = pt ? Object.keys(pt).length : 0;
                if (k < rg.count[0] || k > rg.count[1]) { c.fail(e.id + ": perkText has " + k + " runes, §3.2 says " + rg.count.join("-")); bad++; }
            }
            (rg.ids || []).forEach(function (id) {
                const t = pt && (pt[id] || pt[+id]);
                if (!t) { c.fail(e.id + ": perkText lacks " + id + " (§3.2 text overrides " + rg.from + "-" + (rg.to || "…") + ")"); bad++; return; }
                if (rg.text && rg.text[id] && !rg.text[id].test(String(t[0]) + " " + String(t[1]))) { c.fail(e.id + ": perkText " + id + " does not hold " + rg.text[id]); bad++; }
            });
        });
        if (pt) Object.keys(pt).forEach(function (id) {
            const t = pt[id];
            if (!Array.isArray(t) || t.length !== 2) { c.fail(e.id + ": perkText " + id + " is not [short|null, long|null]"); bad++; return; }
            t.forEach(function (s) { if (s != null && placeholderIn(s) && /@/.test(placeholderIn(s))) { c.fail(e.id + ": perkText " + id + " still holds " + placeholderIn(s)); bad++; } });
        });
        if (e.data === null && (pt || ssb)) { c.fail(e.id + ": data null but extras"); bad++; }
    });
    if (missing > 3) c.skip("reforged: … " + (missing - 3) + " more entries without data");
    if (!bad && n) c.pass(n + " Reforged entries: path-pair bonus 5x4 up to V8.22 and none after; perkText ranges of §3.2");
}
function checkF3(world, c, audit) {
    if (!audit) { c.skip("optional audit; run with --audit [<raw cache>] (F3 checks perkText against the cached DDragon catalogs)"); return; }
    const list = needEntries(world, "reforged", c);
    if (!list) return;
    let n = 0, bad = 0, nocache = 0;
    list.forEach(function (e) {
        const r = world.payload(e);
        if (!("payload" in r)) return;
        const cat = audit.reforgedCatalog(e.ddragonVersion);
        if (!cat) { nocache++; if (nocache <= 3) c.skip(e.id + ": no runesReforged-" + e.ddragonVersion + ".json in " + audit.dir); return; }
        n++;
        const ids = {};
        cat.forEach(function (p) { (p.slots || []).forEach(function (s) { (s.runes || []).forEach(function (x) { ids[x.id] = x; }); }); });
        const pt = (r.payload && r.payload.perkText) || {};
        Object.keys(pt).forEach(function (id) { if (!ids[id]) { c.fail(e.id + ": perkText id " + id + " is not in the " + e.ddragonVersion + " catalog"); bad++; } });
        applyPerkText(cat, pt).forEach(function (p) {
            (p.slots || []).forEach(function (s) {
                (s.runes || []).forEach(function (x) {
                    [x.shortDesc, x.longDesc].forEach(function (t) {
                        const m = /@[A-Za-z0-9_.*]+@/.exec(String(t || ""));
                        if (m) { c.fail(e.id + ": " + x.id + " " + x.name + " still shows " + m[0]); bad++; }
                    });
                });
            });
        });
    });
    if (nocache > 3) c.skip("… " + (nocache - 3) + " more entries without a cached catalog");
    if (!bad && n) c.pass(n + " Reforged catalogs: every perkText id exists and no rendered text holds @…@");
}
function checkF4(world, c) {
    const list = needEntries(world, "reforged", c);
    if (!list) return;
    let bad = 0, n = 0;
    listedSpec("reforged").filter(function (s) { return /^V2[56]\./.test(s.patch); }).forEach(function (s) {
        const e = list.filter(function (x) { return entryPatch(x) && eq(x.patch, s.patch); })[0];
        if (!e) return;
        n++;
        if (!e.label || !(e.label === s.patch || e.label.indexOf(s.patch + " (") === 0)) { c.fail(e.id + ": label " + JSON.stringify(e.label) + " does not start with the official name " + s.patch); bad++; }
    });
    if (!bad && n) c.pass(n + " 2025 / 2026 labels use Riot's official names");
}
function checkF5(world, c) {
    let bad = 0;
    const reg = world.registry();
    if (reg.missing || reg.error) c.skip("patch-registry.js " + (reg.missing ? "missing" : reg.error));
    else {
        if ((reg.LOL_PAGE_DEFAULT || {}).reforged !== "rr-v26-19") { c.fail("LOL_PAGE_DEFAULT.reforged = " + (reg.LOL_PAGE_DEFAULT || {}).reforged); bad++; }
        const nav = (reg.SEASON_NAV || []).filter(function (x) { return x.key === "s2026"; })[0];
        if (!nav || nav.reforged !== "rr-v26-19") { c.fail("SEASON_NAV s2026.reforged = " + (nav && nav.reforged)); bad++; }
    }
    const sj = world.seasonsJson().value;
    if (!sj) c.fail("data/patches/seasons.json missing");
    else if ((sj.pageDefaults || {}).reforged !== "rr-v26-19") { c.fail("seasons.json pageDefaults.reforged = " + (sj.pageDefaults || {}).reforged); bad++; }
    const e = world.entries("reforged").list;
    if (!e) c.skip("reforged: " + world.entries("reforged").why);
    else if (!e.some(function (x) { return x.id === "rr-v26-19"; })) { c.fail("rr-v26-19 is not listed"); bad++; }
    const checked = [(!reg.missing && !reg.error) ? "patch-registry.js" : null, sj ? "seasons.json" : null, e ? "the listed entries" : null].filter(Boolean);
    if (!bad && checked.length) c.pass("the Reforged default is rr-v26-19 (Current) in " + checked.join(", "));
}

// ===========================================================================
// 9. CLI
// ===========================================================================

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!/^--/.test(a)) { (out._ = out._ || []).push(a); continue; }
        const k = a.slice(2);
        if (["verbose", "allow-skip", "quiet", "browser"].indexOf(k) >= 0) { out[k] = true; continue; }
        if (k === "audit") {
            if (argv[i + 1] && !/^--/.test(argv[i + 1])) out.audit = argv[++i];
            else out.audit = true;
            continue;
        }
        if (i + 1 >= argv.length || /^--/.test(argv[i + 1])) throw new Error(a + " needs a value");
        out[k] = argv[++i];
    }
    if (out.only) out.only = String(out.only).split(/[,\s]+/).filter(Boolean);
    return out;
}

function auditFrom(args) {
    if (!args.audit) return null;
    const dir = args.audit === true ? (args.research ? path.join(path.resolve(args.research), "raw") : null) : path.resolve(String(args.audit));
    if (!dir) throw new Error("--audit needs a cache folder (or --research <dir>, whose raw/ is used)");
    if (!fs.existsSync(dir)) throw new Error("audit cache " + dir + " does not exist");
    return new Audit(dir);
}

function inputsSummary(world) {
    const st = function (ok, label) { return label + (ok ? "" : " (missing)"); };
    const reg = world.registry();
    const lines = [];
    lines.push("site " + world.root);
    lines.push("inputs: " + [
        reg.missing ? "patch-registry.js (missing)" : reg.error ? "patch-registry.js (" + reg.error + ")" : "patch-registry.js" +
            (PAGES.some(function (p) { return reg.stub[p]; }) ? " [stub listing: " + PAGES.filter(function (p) { return reg.stub[p]; }).join(", ") + "]" : ""),
        st(world.exists("lol-data.js"), "lol-data.js")
    ].join(", "));
    lines.push("        " + PAGES.map(function (p) {
        const l = world.listing(p), m = world.manifest(p);
        return p + ": listing " + (l.missing ? "missing" : l.error ? "broken" : l.stub ? "stub" : l.records.length) + ", manifest " + (m.missing ? "missing" : m.error ? "broken" : Object.keys(m.map).length);
    }).join("; "));
    PAGES.forEach(function (p) {
        const e = world.entries(p);
        lines.push("entries " + p + ": " + (e.source === "registry" ? "patch-registry.js" : e.source === "listing" ? "derived from the listing + manifest (" + e.why + ")" : "none (" + e.why + ")"));
    });
    return lines.join("\n");
}

function main(argv) {
    let args;
    try { args = parseArgs(argv); } catch (e) { console.error("check-patches: " + e.message); return 1; }
    const world = new World({ root: args.root, research: args.research, ddragon: args.ddragon, audit: null });
    let audit;
    try { audit = auditFrom(args); } catch (e) { console.error("check-patches: " + e.message); return 1; }
    if (audit) world.opts.audit = audit.dir;
    const rep = new Reporter({ only: args.only, verbose: args.verbose, json: args.json, allowSkip: args["allow-skip"] });
    console.log("check-patches (DESIGN §7.1)  " + inputsSummary(world).split("\n").join("\n  "));
    console.log("");
    rep.run("G1", "ids unique; every file exists and registers its data key once; no fetch / XHR", function (c) { checkG1(world, c); });
    rep.run("G2", "counts and listed patches per page and season (§0, §3.2)", function (c) { checkG2(world, c); });
    rep.run("G3", "season boundaries (§3.1; DDragon era from the versions list)", function (c) { checkG3(world, c); });
    rep.run("G4", "every reason and change has a source; confidence set", function (c) { checkG4(world, c); });
    rep.run("G5", "aliases and defaults resolve; LolPatches.resolve on the 24 legacy ids", function (c) { checkG5(world, c); });
    rep.run("G6", "era / airPeriod / combiner / quintHalo per entry (§3.5)", function (c) { checkG6(world, c); });
    rep.run("G7", "labels (§3.3)", function (c) { checkG7(world, c); });
    rep.run("C1", "every change patch differs from the previous listed patch", function (c) { checkC(world, c, "C1", audit); });
    rep.run("C2", "season boundaries without change equal the previous listed patch", function (c) { checkC(world, c, "C2", audit); });
    rep.run("C3", "audit: unlisted DDragon patches carry only listed noise", function (c) { checkC3(world, c, audit); });
    rep.run("M1", "classic datasets: trees, grid, parents, rank totals, families", function (c) { checkM1(world, c); });
    rep.run("M2", "keystone datasets: tiers, pools, keystones, DDragon layout", function (c) { checkM2(world, c); });
    rep.run("M3", "mastery icons exist (gray_ for AIR)", function (c) { checkM3(world, c); });
    rep.run("M4", "mastery overrides applied, none dead", function (c) { checkOverrides(world, c, "masteries"); });
    rep.run("M5", "S3 numbers agree with DDragon 3.6.14 and 3.13.24", function (c) { checkM5(world, c); });
    rep.run("M6", "mastery spot checks (tools/fixtures/spotchecks.json)", function (c) { checkM6(world, c); });
    rep.run("R1", "rune stat keys are all mapped", function (c) { checkR1(world, c); });
    rep.run("R2", "rune categories and tiers", function (c) { checkR2(world, c); });
    rep.run("R3", "rune icons exist", function (c) { checkR3(world, c); });
    rep.run("R4", "5401 lethality 0.88 in V6.22-V7.21", function (c) { checkR4to7(world, c, "R4"); });
    rep.run("R5", "dodge only before V1.0.0.132", function (c) { checkR4to7(world, c, "R5"); });
    rep.run("R6", "energy runes from V1.0.0.94(b) on", function (c) { checkR4to7(world, c, "R6"); });
    rep.run("R7", "V7.21 shares the V6.22 catalog (D8)", function (c) { checkR4to7(world, c, "R7"); });
    rep.run("R8", "rune overrides applied, none dead", function (c) { checkOverrides(world, c, "runes"); });
    rep.run("F1", "shard eras (§3.2); s25-22 scaling Health 10-180", function (c) { checkF1(world, c); });
    rep.run("F2", "path-pair bonus V7.22-V8.22 only; perkText ranges", function (c) { checkF2(world, c); });
    rep.run("F3", "audit: perkText ids exist, no @…@ left", function (c) { checkF3(world, c, audit); });
    rep.run("F4", "2025 / 2026 labels are the official names", function (c) { checkF4(world, c); });
    rep.run("F5", "the Reforged default is rr-v26-19", function (c) { checkF5(world, c); });
    rep.run("F6", "Reforged overrides applied, none dead", function (c) { checkOverrides(world, c, "reforged"); });
    return rep.finish("check-patches");
}

module.exports = {
    REPO: REPO, PAGES: PAGES, TIER_NAMES: TIER_NAMES, KEYSTONE_TREES: KEYSTONE_TREES, DEFAULT_PAGE_NAME: DEFAULT_PAGE_NAME,
    SPEC: { LISTED: LISTED, EXPECT_TOTALS: EXPECT_TOTALS, SEASONS: SEASONS, SEASON_DEFAULTS: SEASON_DEFAULTS, PAGE_DEFAULTS: PAGE_DEFAULTS,
        LEGACY: LEGACY, PLAIN: PLAIN, FAMILIES: FAMILIES, RULES: RULES, SHARD_ERAS: SHARD_ERAS, listedSpec: listedSpec, familyOf: familyOf },
    World: World, Reporter: Reporter, Audit: Audit, parseArgs: parseArgs, auditFrom: auditFrom, inputsSummary: inputsSummary,
    runSpotcheck: runSpotcheck, payloadDiff: payloadDiff,
    util: { cmp: cmp, eq: eq, inRange: inRange, clone: clone, canon: canon, deepEqual: deepEqual, hashOf: hashOf, slug: slug,
        normText: normText, makeRng: makeRng, readText: readText, isObj: isObj, safe: safe, plural: plural },
    mastery: { isKeystone: isKeystone, masteryCells: masteryCells, masteryText: masteryText, placeholderIn: placeholderIn },
    codec: { ALPHABET: ALPHABET, classicSpec: classicSpec, classicCodecFrom: classicCodecFrom, classicDecode: classicDecode,
        classicEncode: classicEncode, classicEncodeRaw: classicEncodeRaw, classicRanksToMaps: classicRanksToMaps, classicMapsToRanks: classicMapsToRanks,
        keystoneSpec: keystoneSpec, keystoneCodecFrom: keystoneCodecFrom, keystoneDecode: keystoneDecode, keystoneEncode: keystoneEncode,
        keystoneEmpty: keystoneEmpty, keystoneToMaps: keystoneToMaps, keystoneFromMaps: keystoneFromMaps,
        parseMasteryHash: parseMasteryHash, normPageName: normPageName, nameSegment: nameSegment, classicHash: classicHash,
        keystoneHash: keystoneHash, runeHash: runeHash, parseRuneHash: parseRuneHash, parseReforgedHash: parseReforgedHash, reforgedHash: reforgedHash },
    carry: { classicCarry: classicCarry, classicValid: classicValid, classicMaximal: classicMaximal, classicSubset: classicSubset,
        keystoneCarry: keystoneCarry, keystoneValid: keystoneValid, keystoneMaximal: keystoneMaximal, keystoneSubset: keystoneSubset,
        keystoneStateFromMaps: keystoneStateFromMaps, ksUnlocked: ksUnlocked, ksTierTotal: ksTierTotal, ksTotal: ksTotal,
        slotCategories: slotCategories, runeIndex: runeIndex, runeCarry: runeCarry, runeValid: runeValid,
        rrRuneInSlot: rrRuneInSlot, rrShardInRow: rrShardInRow, reforgedApply: reforgedApply, applyPerkText: applyPerkText }
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
