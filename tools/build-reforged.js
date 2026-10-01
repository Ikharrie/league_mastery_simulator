#!/usr/bin/env node
// tools/build-reforged.js — Runes Reforged per-patch extras (DESIGN §1.3-§1.6, §3.2, §7 F1-F5).
//
// Reads (committed, offline):
//   data/patches/reforged.json            the 123 listed patches (curation, seeded by tools/import-reforged.js)
//   data/patches/reforged-overrides.json  layer 2-4 records (DESIGN §1.2), one JSON object per line
//   data/sources/reforged/<patch>.json    per listed patch: CommunityDragon client texts (perkText),
//                                         the V7.22-V8.22 path-pair bonus, the stat shards, the
//                                         placeholders left unresolved, and the catalog hash
//   data/sources/reforged/shard-eras.json the 7 stat-shard eras as the client had them
//   data/patches/seasons.json             via tools/lib/patches.js
// Writes:
//   data/reforged/rr-<patch>.js           one LolData.register("reforged", key, {perkText, subStyleBonus})
//                                         per distinct payload; later patches share the earlier file
//   data/reforged/manifest.json           { id: { data, file, hash, stateHash } } for all 123 entries;
//                                         data/file/hash are null when a patch has no extras
//
// Usage:
//   node tools/build-reforged.js                  build, then run the checks (exit 1 on any failure)
//   node tools/build-reforged.js --check          write nothing; fail when an output is stale
//   node tools/build-reforged.js --audit <raw>    also re-derive every Data Dragon patch from the
//                                                 download cache (<scratchpad>\patches\raw: reforged/,
//                                                 cdragon/, cdragon-game/) and run F3 + C3 (offline)
//   --quiet                                       print failures only
//
// Checks (§7): L listing shape, counts and lists per season (§0/§3.2); F1 shard eras; F2 path-pair
// bonus; F4 official 2025/2026 labels; F5 default rr-v26-19; C1/C2 change rule on stateHash; G1 the
// generated files. --audit adds F3 (perkText ids exist in the patch's catalog, no rendered @…@),
// A (the committed sources equal a fresh derivation from the raw cache) and C3 (every unlisted
// patch equals its predecessor unless data/patches/noise/reforged.json lists noise for it).
//
// stateHash (manifest) is the calculator-level state of a listed patch: the Data Dragon catalog
// (catalogHash: structure, names and texts not covered by perkText), the client texts after
// overrides, the path-pair bonus and the stat shards, all text-normalized the way the research
// classified noise (markup, number format, flavour quote, icons and internal keys ignored). Two
// listed patches with an equal stateHash look the same in the calculator. C1/C2 compare it.

"use strict";

var fs = require("fs");
var path = require("path");
var P = require("./lib/patches.js");

var ROOT = path.resolve(__dirname, "..");
var FILES = {
    sources: path.join(ROOT, "data", "sources", "reforged"),
    shardEras: path.join(ROOT, "data", "sources", "reforged", "shard-eras.json"),
    listing: path.join(ROOT, "data", "patches", "reforged.json"),
    overrides: path.join(ROOT, "data", "patches", "reforged-overrides.json"),
    noise: path.join(ROOT, "data", "patches", "noise", "reforged.json"),
    out: path.join(ROOT, "data", "reforged"),
    manifest: path.join(ROOT, "data", "reforged", "manifest.json"),
    shardTable: path.join(ROOT, "runes-reforged-data.js")
};
var GENERATOR = "tools/build-reforged.js";
var KIND = "reforged";
var PAGE = "reforged";
var PATH_ORDER = [8000, 8100, 8200, 8400, 8300];   // client order (Precision, Domination, Sorcery, Resolve, Inspiration)
var FIELDS = ["shortDesc", "longDesc"];
var REASONS = ["season-start", "season-start+change", "change", "season-end", "season-end+change"];

// ---------------------------------------------------------------------------
// Expectations from the design (§0, §3.2, §3.3, §3.4). Hard-coded on purpose:
// the checks compare the listing against them, not against itself.
// ---------------------------------------------------------------------------

var EXPECTED = {
    s8: ["V7.22", "V7.23", "V7.24", "V8.1", "V8.2", "V8.3", "V8.4", "V8.5", "V8.6", "V8.7", "V8.8", "V8.9", "V8.10",
         "V8.11", "V8.12", "V8.13", "V8.14", "V8.15", "V8.16", "V8.20", "V8.22"],
    s9: ["V8.23", "V8.24", "V9.1", "V9.2", "V9.4", "V9.5", "V9.6", "V9.7", "V9.8", "V9.9", "V9.10", "V9.11", "V9.16", "V9.22"],
    s10: ["V9.23", "V9.24", "V10.1", "V10.4", "V10.5", "V10.6", "V10.7", "V10.12", "V10.13", "V10.14", "V10.15",
          "V10.16", "V10.18", "V10.20", "V10.21", "V10.22"],
    s11: ["V10.23", "V11.1", "V11.2", "V11.6", "V11.10", "V11.11", "V11.13", "V11.17", "V11.19", "V11.21", "V11.22"],
    s12: ["V11.23", "V11.24", "V12.1", "V12.2", "V12.6", "V12.7", "V12.10", "V12.11", "V12.12", "V12.14", "V12.15",
          "V12.20", "V12.21"],
    s13: ["V12.22", "V13.1", "V13.3", "V13.4", "V13.5", "V13.6", "V13.12", "V13.15", "V13.20", "V13.21", "V13.24"],
    s14: ["V14.1", "V14.2", "V14.4", "V14.10", "V14.11", "V14.12", "V14.13", "V14.14", "V14.15", "V14.17", "V14.18",
          "V14.19", "V14.20", "V14.21", "V14.24"],
    s2025: ["V25.S1.1", "V25.S1.2", "V25.S1.3", "V25.05", "V25.09", "V25.10", "V25.12", "V25.14", "V25.19", "V25.21",
            "V25.22", "V25.24"],
    s2026: ["V26.01", "V26.03", "V26.09", "V26.10", "V26.11", "V26.13", "V26.15", "V26.16", "V26.17", "V26.19"]
};
var EXPECTED_COUNTS = { s8: 21, s9: 14, s10: 16, s11: 11, s12: 13, s13: 11, s14: 15, s2025: 12, s2026: 10 };
var EXPECTED_TOTAL = 123;
// Boundary patches: ° = no change, * = with a change (§3.2).
var EXPECTED_NO_CHANGE = ["V7.22", "V9.22", "V10.22", "V11.22", "V12.21", "V12.22", "V13.24", "V14.24", "V26.19"];
var EXPECTED_BOUNDARY_CHANGE = ["V8.22", "V8.23", "V9.23", "V10.23", "V11.23", "V14.1", "V25.S1.1", "V25.24", "V26.01"];
// Shard eras (§3.2): [first, last (null = open), id].
var EXPECTED_SHARD_ERAS = [
    ["V7.22", "V8.22", null], ["V8.23", "V8.24", "s8-23"], ["V9.1", "V9.1", "s9-1"], ["V9.2", "V10.22", "s9-2"],
    ["V10.23", "V11.20", "s10-23"], ["V11.21", "V14.1", "s11-21"], ["V14.2", "V25.21", "s14-2"], ["V25.22", null, "s25-22"]
];
// F4: the 2025 and 2026 dropdown labels (Riot's official names, §3.2/§3.3).
var EXPECTED_LABELS = {
    "V25.S1.1": "V25.S1.1 (Season start · Domination rework)", "V25.S1.2": "V25.S1.2", "V25.S1.3": "V25.S1.3",
    "V25.05": "V25.05", "V25.09": "V25.09", "V25.10": "V25.10", "V25.12": "V25.12", "V25.14": "V25.14",
    "V25.19": "V25.19", "V25.21": "V25.21", "V25.22": "V25.22", "V25.24": "V25.24 (Season end)",
    "V26.01": "V26.01 (Season start)", "V26.03": "V26.03", "V26.09": "V26.09 (Deathfire Touch)", "V26.10": "V26.10",
    "V26.11": "V26.11", "V26.13": "V26.13", "V26.15": "V26.15", "V26.16": "V26.16", "V26.17": "V26.17",
    "V26.19": "V26.19 (Current)"
};
var EXPECTED_DEFAULT = "rr-v26-19";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fail(msg) { throw new Error("build-reforged: " + msg); }
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function same(a, b) { return P.stableStringify(a) === P.stableStringify(b); }
function readJson(file) { return P.readJson(file); }
function rel(file) { return path.relative(ROOT, file).split(path.sep).join("/"); }
function sourceFile(patch) { return path.join(FILES.sources, P.parse(patch).name + ".json"); }

var PH_RE = /@[^@\s]+@|\{\{[^}]*\}\}/g;   // @Var@ placeholders and {{ template }} keys
function placeholdersIn(s) {
    var m = String(s == null ? "" : s).match(PH_RE);
    return m ? m : [];
}
function hasPlaceholder(s) { return placeholdersIn(s).length > 0; }
function uniqSorted(list) {
    var seen = {}, out = [];
    list.forEach(function(x){ if (!seen[x]) { seen[x] = true; out.push(x); } });
    return out.sort();
}

// ---------------------------------------------------------------------------
// Text normalization (mirrors the research's noise rules: rrdiff.py strip/canon/norm)
// ---------------------------------------------------------------------------

var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
function unescapeHtml(s) {
    return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, function(m, e){
        if (e.charAt(0) === "#") {
            var n = /^#[xX]/.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
        }
        var k = e.toLowerCase();
        return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
    });
}

// Visible body text: no tags, no inline icon tokens, no flavour quote after <hr>.
function stripText(s) {
    if (s == null) return "";
    s = String(s);
    var hr = /<hr\s*\/?>/i.exec(s);
    if (hr) s = s.slice(0, hr.index);
    s = s.replace(/<br\s*\/?>|<\/?li>/gi, " ");
    s = s.replace(/<[^>]+>/g, "");
    s = s.replace(/%i:[^%\s]+%/g, " ");
    s = unescapeHtml(s);
    s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[–—]/g, "-").replace(/ /g, " ");
    return s.replace(/\s+/g, " ").trim();
}

var SYNONYMS = [
    [/\bmaximum\b/g, "max"], [/\bminimum\b/g, "min"], [/\bmovement speed\b/g, "ms"], [/\bmove speed\b/g, "ms"],
    [/\battack damage\b/g, "ad"], [/\bability power\b/g, "ap"], [/\bcooldown reduction\b/g, "cdr"],
    [/\bmagic resistance\b/g, "mr"], [/\bmagic resist\b/g, "mr"], [/\bhealth\b/g, "hp"]
];

// Normalized text key: equal keys = no calculator-relevant difference (markup, number format,
// "5 seconds"/"5s", common abbreviations, punctuation).
function textKey(s) {
    var t = stripText(s).toLowerCase();
    t = t.replace(/(\d)\s*(?:seconds|second|secs|sec|s)\b/g, "$1s");
    t = t.replace(/(\d)\s*%/g, "$1%");
    t = t.replace(/(?<![A-Za-z@_])\d+(?:\.\d+)?/g, function(n){ return String(parseFloat(n)); });
    SYNONYMS.forEach(function(r){ t = t.replace(r[0], r[1]); });
    return t.replace(/(?:[\s,;:!'"()\-+]|(?<!\d)\.|\.(?!\d))+/g, " ").trim();
}

function numbersIn(s) {
    var m = stripText(s).match(/\d+(?:\.\d+)?/g);
    return m ? m.map(parseFloat) : [];
}

// ---------------------------------------------------------------------------
// Catalog and state hashes
// ---------------------------------------------------------------------------

// Data Dragon runesReforged.json (array of paths) -> { pathId: { id, name, slots: [[rune]] } }.
function ddragonPaths(json) {
    var out = {};
    (json || []).forEach(function(p){
        out[p.id] = {
            id: p.id, key: p.key, name: p.name, icon: p.icon,
            slots: (p.slots || []).map(function(s){
                return (s.runes || []).map(function(r){
                    return { id: r.id, key: r.key, name: r.name, icon: r.icon,
                             shortDesc: r.shortDesc == null ? null : r.shortDesc,
                             longDesc: r.longDesc == null ? null : r.longDesc };
                });
            })
        };
    });
    return out;
}

// covered(id, fieldIndex) -> true when the field's text comes from perkText / an override.
function coveredBy(perkText, unresolved) {
    return function(id, i){
        var t = perkText && perkText[id];
        if (t && t[i] != null) return true;
        var u = unresolved && unresolved[id];
        return !!(u && u.text && u.text[i] != null);
    };
}

// Hash of the catalog as the calculator sees it, with the covered fields left out (they are
// hashed from perkText in stateHash). Path/rune icons and internal keys are ignored (noise).
function catalogHashOf(paths, covered) {
    var out = [];
    PATH_ORDER.forEach(function(pid){
        var p = paths[pid];
        if (!p) return;
        out.push({
            id: pid, name: p.name,
            slots: p.slots.map(function(row){
                return row.map(function(r){
                    return { id: r.id, name: r.name,
                             s: covered(r.id, 0) ? "*" : textKey(r.shortDesc),
                             l: covered(r.id, 1) ? "*" : textKey(r.longDesc) };
                });
            })
        });
    });
    return P.contentHash(out);
}

function mapValues(obj, fn) {
    if (!obj) return null;
    var out = {};
    Object.keys(obj).forEach(function(k){ out[k] = fn(obj[k], k); });
    return out;
}

function stateHashOf(catalogHash, perkText, subStyleBonus, shards) {
    return P.contentHash({
        catalog: catalogHash,
        perkText: mapValues(perkText, function(pair){ return pair.map(function(x){ return x == null ? null : textKey(x); }); }),
        subStyleBonus: mapValues(subStyleBonus, function(row){ return mapValues(row, textKey); }),
        shards: shards ? {
            rows: shards.rows.map(function(r){ return r.perks; }),
            desc: mapValues(shards.perks, function(x){ return textKey(x.desc); })
        } : null
    });
}

// Shard era signature: rows + the numbers of every shard text (wording noise such as
// "(based on level)" is ignored; any value change shows).
function shardSignature(shards) {
    if (!shards) return null;
    return P.stableStringify({
        rows: shards.rows.map(function(r){ return r.perks; }),
        numbers: mapValues(shards.perks, function(x){ return numbersIn(x.desc); })
    });
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function readListing() {
    var data = readJson(FILES.listing);
    if (!data || !Array.isArray(data.patches)) fail(rel(FILES.listing) + ": patches[] missing");
    return data;
}

function readOverrides() {
    var list = readJson(FILES.overrides);
    if (!Array.isArray(list)) fail(rel(FILES.overrides) + ": must be a JSON array of override records");
    return list;
}

function readNoise() {
    var data = readJson(FILES.noise);
    if (!data || !Array.isArray(data.items)) fail(rel(FILES.noise) + ": items[] missing");
    return data;
}

function validateOverrides(list, errors) {
    var ids = {};
    list.forEach(function(o, i){
        var w = "override[" + i + "]" + (o && o.id ? " " + o.id : "");
        if (!isObj(o)) { errors.push(w + ": not an object"); return; }
        if (!/^rro-\d{3}$/.test(o.id || "")) errors.push(w + ": id must be rro-NNN");
        if (ids[o.id]) errors.push(w + ": duplicate id");
        ids[o.id] = true;
        if (["export-fix", "wiki-fact", "correction"].indexOf(o.kind) < 0) errors.push(w + ": bad kind");
        if (o.page !== PAGE) errors.push(w + ": page must be reforged");
        if (!P.tryParse(o.from)) errors.push(w + ": bad from");
        if (o.to != null && !P.tryParse(o.to)) errors.push(w + ": bad to");
        if (o.op !== "fill-placeholder") errors.push(w + ": unknown op " + JSON.stringify(o.op) + " (fill-placeholder)");
        if (FIELDS.indexOf(o.field) < 0) errors.push(w + ": field must be shortDesc or longDesc");
        if (!/^\d+$/.test(String(o.target || ""))) errors.push(w + ": target must be a rune id");
        if (typeof o.placeholder !== "string" || !hasPlaceholder(o.placeholder)) errors.push(w + ": placeholder missing");
        if (typeof o.value !== "string" || hasPlaceholder(o.value)) errors.push(w + ": value must be a resolved string");
        if (!o.reason) errors.push(w + ": reason missing");
        if (!Array.isArray(o.sources) || !o.sources.length) errors.push(w + ": sources missing");
        if (["high", "medium", "low"].indexOf(o.confidence) < 0) errors.push(w + ": confidence missing");
    });
}

function inRange(patch, o) {
    return P.compare(patch, o.from) >= 0 && (o.to == null || P.compare(patch, o.to) <= 0);
}

// Applies the overrides whose range covers `patch` to a source's perkText / unresolved.
// Fails when a target is missing (DESIGN §1.2). Returns { perkText|null, unresolved, applied }.
function applyOverrides(patch, perkText, unresolved, overrides) {
    var pt = clone(perkText) || {};
    var un = clone(unresolved) || {};
    var applied = [];
    overrides.forEach(function(o){
        if (!inRange(patch, o)) return;
        var fi = FIELDS.indexOf(o.field);
        var u = un[o.target];
        if (!u || !u.text || u.text[fi] == null || u.text[fi].indexOf(o.placeholder) < 0)
            fail(o.id + ": target " + o.target + " " + o.field + " has no " + o.placeholder + " in " + P.parse(patch).label
                 + " (override range " + o.from + "-" + (o.to || "open") + ")");
        u.text[fi] = u.text[fi].split(o.placeholder).join(o.value);
        u.placeholders = uniqSorted(placeholdersIn(u.text[0]).concat(placeholdersIn(u.text[1])));
        if (!u.placeholders.length) {
            var cur = pt[o.target] || [null, null];
            pt[o.target] = [u.text[0] != null ? u.text[0] : cur[0], u.text[1] != null ? u.text[1] : cur[1]];
            delete un[o.target];
        }
        applied.push(o.id);
    });
    return { perkText: Object.keys(pt).length ? pt : null, unresolved: un, applied: applied };
}

// ---------------------------------------------------------------------------
// Listing and source validation
// ---------------------------------------------------------------------------

function validateRecord(rec, errors) {
    var w = rec && rec.patch ? rec.patch : JSON.stringify(rec).slice(0, 40);
    var p = P.tryParse(rec && rec.patch);
    if (!p) { errors.push(w + ": bad patch"); return; }
    if (rec.patch !== p.name) errors.push(w + ": write the patch as " + p.name);
    if (rec.id !== P.idFor(PAGE, p)) errors.push(w + ": id must be " + P.idFor(PAGE, p));
    var season = P.seasonOf(p);
    if (rec.season !== season) errors.push(w + ": season must be " + season);
    if (REASONS.indexOf(rec.reason) < 0) errors.push(w + ": bad reason " + JSON.stringify(rec.reason));
    var b = P.seasonBounds(season, PAGE);
    var first = b && P.equal(b.first, p), last = b && P.equal(b.last, p);
    var hasChange = /change$/.test(rec.reason || "");
    var base = first ? "season-start" : last ? "season-end" : "change";
    var want = base === "change" ? "change" : base + (hasChange ? "+change" : "");
    if (rec.reason !== want) errors.push(w + ": reason " + rec.reason + " but the patch is " + (first ? "the season start" : last ? "the season end" : "inside its season"));
    if (!Array.isArray(rec.changes)) errors.push(w + ": changes[] missing");
    else {
        if (hasChange !== rec.changes.length > 0) errors.push(w + ": reason " + rec.reason + " with " + rec.changes.length + " changes");
        rec.changes.forEach(function(c, i){
            if (!c || typeof c.text !== "string" || !c.text) errors.push(w + ": changes[" + i + "].text missing");
            if (!c || !Array.isArray(c.sources) || !c.sources.length) errors.push(w + ": changes[" + i + "] has no source");
            if (!c || ["high", "medium", "low"].indexOf(c.confidence) < 0) errors.push(w + ": changes[" + i + "] confidence missing");
        });
    }
    if (!/^\d{4}-\d\d-\d\d$/.test(rec.date || "")) errors.push(w + ": date must be YYYY-MM-DD");
    if (!rec.source || !rec.source.ddragon) errors.push(w + ": source.ddragon missing");
    else if (!P.equal(P.fromDdragon(rec.source.ddragon), p)) errors.push(w + ": source.ddragon " + rec.source.ddragon + " is another patch");
    if (rec.shardEra !== P.shardEraOf(p)) errors.push(w + ": shardEra must be " + P.shardEraOf(p));
    if (["high", "medium", "low"].indexOf(rec.confidence) < 0) errors.push(w + ": confidence missing");
    if (!Array.isArray(rec.sources) || !rec.sources.length) errors.push(w + ": sources[] missing (the reason needs a source)");
}

function validateSource(rec, src, errors) {
    var w = rel(sourceFile(rec.patch));
    if (!src) { errors.push(w + ": missing"); return; }
    if (src.patch !== rec.patch) errors.push(w + ": patch " + src.patch + " != " + rec.patch);
    if (src.ddragon !== rec.source.ddragon) errors.push(w + ": ddragon " + src.ddragon + " != listing " + rec.source.ddragon);
    if ((src.cdragonBranch || null) !== (rec.source.cdragon || null)) errors.push(w + ": cdragonBranch != listing source.cdragon");
    if (src.perkText !== null && !isObj(src.perkText)) errors.push(w + ": perkText must be an object or null");
    Object.keys(src.perkText || {}).forEach(function(id){
        var t = src.perkText[id];
        if (!/^\d+$/.test(id) || !Array.isArray(t) || t.length !== 2 || (t[0] == null && t[1] == null)
            || t.some(function(x){ return x != null && typeof x !== "string"; }))
            errors.push(w + ": perkText." + id + " must be [short|null, long|null] with one text");
        else t.forEach(function(x){ if (hasPlaceholder(x)) errors.push(w + ": perkText." + id + " still has " + placeholdersIn(x).join(" ")); });
    });
    if (src.subStyleBonus !== null && !isObj(src.subStyleBonus)) errors.push(w + ": subStyleBonus must be an object or null");
    if (src.shards !== null && !(isObj(src.shards) && Array.isArray(src.shards.rows) && isObj(src.shards.perks))) errors.push(w + ": shards must be {rows, perks} or null");
    if (!isObj(src.unresolved)) errors.push(w + ": unresolved must be an object");
    Object.keys(src.unresolved || {}).forEach(function(id){
        var u = src.unresolved[id];
        if (!u || !Array.isArray(u.placeholders) || !Array.isArray(u.text) || u.text.length !== 2) errors.push(w + ": unresolved." + id + " must be {placeholders, text: [short|null, long|null]}");
    });
    if (!/^[0-9a-f]{64}$/.test(src.catalogHash || "")) errors.push(w + ": catalogHash missing");
    if (!Array.isArray(src.sources) || !src.sources.length) errors.push(w + ": sources missing");
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function payloadKeyOrder(obj) {
    // Rune / path ids as numbers, ascending (what a JS object does anyway).
    if (!obj) return null;
    var out = {};
    Object.keys(obj).sort(function(a, b){ return Number(a) - Number(b); }).forEach(function(k){
        out[k] = isObj(obj[k]) ? payloadKeyOrder(obj[k]) : obj[k];
    });
    return out;
}

function headerSource(f) {
    var e = f.entries[0], src = e.src;
    var parts = [];
    if (f.payload.perkText) parts.push("CommunityDragon " + (src.cdragonBranch || src.cdragonCarriedFrom || "?") + " perks.json client texts");
    if (f.payload.subStyleBonus) parts.push("CommunityDragon " + (src.cdragonBranch || src.cdragonCarriedFrom || "?") + " perkstyles.json path-pair bonus");
    return rel(sourceFile(e.rec.patch)) + " (" + parts.join(", ") + "; catalog: Data Dragon " + src.ddragon + " runesReforged.json, fetched at runtime)";
}

function manifestText(manifest) {
    var keys = Object.keys(manifest);
    return "{\n" + keys.map(function(k, i){
        return " " + JSON.stringify(k) + ": " + JSON.stringify(manifest[k]) + (i < keys.length - 1 ? "," : "");
    }).join("\n") + "\n}\n";
}

function normalizeEol(s) { return s.split("\r\n").join("\n"); }

function readText(file) {
    try { return fs.readFileSync(file, "utf8"); } catch (e) { return null; }
}

// Returns the context used by the checks; writes the outputs unless opts.check.
function build(opts) {
    opts = opts || {};
    var errors = [];
    var listing = readListing();
    var overrides = readOverrides();
    validateOverrides(overrides, errors);
    if (errors.length) return { errors: errors };

    var entries = [];
    listing.patches.forEach(function(rec){
        validateRecord(rec, errors);
        var src = null;
        try { src = readJson(sourceFile(rec.patch)); } catch (e) { errors.push(e.message); }
        validateSource(rec, src, errors);
        if (!src) return;
        var st;
        try { st = applyOverrides(rec.patch, src.perkText, src.unresolved, overrides); }
        catch (e) { errors.push(e.message); return; }
        Object.keys(st.unresolved).forEach(function(id){
            errors.push(rec.patch + ": rune " + id + " still shows " + st.unresolved[id].placeholders.join(" ") + " (no override fills it)");
        });
        var perkText = payloadKeyOrder(st.perkText);
        var bonus = payloadKeyOrder(src.subStyleBonus);
        var payload = perkText || bonus ? { perkText: perkText, subStyleBonus: bonus } : null;
        entries.push({
            rec: rec, src: src, payload: payload, applied: st.applied,
            hash: payload ? P.contentHash(payload) : null,
            stateHash: stateHashOf(src.catalogHash, st.perkText, src.subStyleBonus, src.shards)
        });
    });
    if (errors.length) return { errors: errors, listing: listing };

    // Share byte-identical payloads: the later patch points at the earlier file (§1.1.4).
    var files = [], byHash = {};
    entries.forEach(function(e){
        if (!e.payload) { e.data = null; return; }
        var f = byHash[e.hash];
        if (!f) {
            f = byHash[e.hash] = { key: e.rec.id, payload: e.payload, hash: e.hash, entries: [], overrides: {} };
            files.push(f);
        }
        f.entries.push(e);
        e.applied.forEach(function(id){ f.overrides[id] = true; });
        e.data = f.key;
    });
    files.forEach(function(f){
        f.file = path.join(FILES.out, f.key + ".js");
        f.text = P.renderGenerated({
            generator: GENERATOR,
            source: headerSource(f),
            overrides: Object.keys(f.overrides).sort(),
            patches: f.entries.map(function(e){ return e.rec.patch; }),
            kind: KIND, key: f.key, payload: f.payload
        });
    });

    var manifest = {};
    entries.forEach(function(e){
        manifest[e.rec.id] = {
            data: e.data,
            file: e.data ? "data/reforged/" + e.data + ".js" : null,
            hash: e.hash,
            stateHash: e.stateHash
        };
    });
    var mText = manifestText(manifest);

    // Write (or compare, with --check). Generated rr-*.js files that are no longer produced go.
    var wanted = {};
    files.forEach(function(f){ wanted[path.basename(f.file)] = true; });
    var existing = [];
    try { existing = fs.readdirSync(FILES.out).filter(function(n){ return /^rr-.*\.js$/.test(n); }); } catch (e) { /* no dir yet */ }
    var stale = existing.filter(function(n){ return !wanted[n]; });
    var changed = [];
    files.forEach(function(f){
        var old = readText(f.file);
        if (old === null || normalizeEol(old) !== f.text) {
            changed.push(rel(f.file));
            if (!opts.check) P.writeIfChanged(f.file, f.text);
        }
    });
    var oldManifest = readText(FILES.manifest);
    if (oldManifest === null || normalizeEol(oldManifest) !== mText) {
        changed.push(rel(FILES.manifest));
        if (!opts.check) P.writeIfChanged(FILES.manifest, mText);
    }
    stale.forEach(function(n){
        var file = path.join(FILES.out, n), text = readText(file) || "";
        if (text.indexOf("// GENERATED by " + GENERATOR) !== 0) { errors.push(rel(file) + ": unknown file in the generated folder"); return; }
        changed.push(rel(file) + " (removed)");
        if (!opts.check) fs.unlinkSync(file);
    });
    if (opts.check && changed.length) errors.push("outputs are stale (run node tools/build-reforged.js): " + changed.join(", "));

    return {
        errors: errors, listing: listing, overrides: overrides, entries: entries, files: files,
        manifest: manifest, changed: changed, stale: stale
    };
}

// ---------------------------------------------------------------------------
// Checks (§7: L, F1, F2, F4, F5, C1, C2, G1)
// ---------------------------------------------------------------------------

function check(name, ok, detail, results) {
    results.push({ name: name, ok: !!ok, detail: detail });
}

function checkListing(ctx, results) {
    var recs = ctx.listing.patches, problems = [];
    if (recs.length !== EXPECTED_TOTAL) problems.push(recs.length + " entries, expected " + EXPECTED_TOTAL);
    var ids = {};
    recs.forEach(function(r, i){
        if (ids[r.id]) problems.push("duplicate id " + r.id);
        ids[r.id] = true;
        if (i && P.compare(recs[i - 1].patch, r.patch) >= 0) problems.push("not chronological at " + r.patch);
    });
    var bySeason = {};
    recs.forEach(function(r){ (bySeason[r.season] = bySeason[r.season] || []).push(r.patch); });
    Object.keys(EXPECTED).forEach(function(s){
        var got = bySeason[s] || [];
        if (got.join(" ") !== EXPECTED[s].join(" ")) problems.push(s + ": " + got.join(" ") + " != DESIGN " + EXPECTED[s].join(" "));
        if (got.length !== EXPECTED_COUNTS[s]) problems.push(s + ": " + got.length + " entries, expected " + EXPECTED_COUNTS[s]);
        var pg = (P.season(s) || {}).pages || {};
        var sp = pg.reforged;
        if (!sp) problems.push(s + ": seasons.json has no reforged page");
        else {
            if (sp.count !== got.length) problems.push(s + ": seasons.json count " + sp.count + " != " + got.length);
            if (got.length && (!P.equal(sp.first, got[0]) || !P.equal(sp.last, got[got.length - 1]))) problems.push(s + ": seasons.json bounds " + sp.first + "-" + sp.last + " != listing " + got[0] + "-" + got[got.length - 1]);
        }
    });
    Object.keys(bySeason).forEach(function(s){ if (!EXPECTED[s]) problems.push("unexpected season " + s); });
    var byPatch = {};
    recs.forEach(function(r){ byPatch[r.patch] = r; });
    EXPECTED_NO_CHANGE.forEach(function(p){
        var r = byPatch[p];
        if (!r || /change$/.test(r.reason) || r.reason === "change") problems.push(p + " must be a boundary with no change, is " + (r && r.reason));
    });
    EXPECTED_BOUNDARY_CHANGE.forEach(function(p){
        var r = byPatch[p];
        if (!r || !/^season-(start|end)\+change$/.test(r.reason)) problems.push(p + " must be a boundary with a change, is " + (r && r.reason));
    });
    var changes = recs.filter(function(r){ return /change$/.test(r.reason); }).length;
    if (changes !== 114) problems.push(changes + " patches with a change, expected 114");
    if (recs.length - changes !== 9) problems.push((recs.length - changes) + " boundaries with no change, expected 9");
    // dropped by the re-cut (§0)
    ["V10.25", "V12.23"].forEach(function(p){ if (byPatch[p]) problems.push(p + " must not be listed"); });
    // every source file belongs to a listed patch
    var names = {};
    recs.forEach(function(r){ names[P.parse(r.patch).name + ".json"] = true; });
    fs.readdirSync(FILES.sources).forEach(function(n){
        if (/^V.*\.json$/.test(n) && !names[n]) problems.push("data/sources/reforged/" + n + " is not a listed patch");
    });
    check("L listing", !problems.length, problems.length ? problems.join("; ")
        : recs.length + " entries (" + Object.keys(EXPECTED).map(function(s){ return s + " " + bySeason[s].length; }).join(", ")
          + "); " + changes + " with a change, " + (recs.length - changes) + " boundaries without", results);
}

function checkF1(ctx, results) {
    var problems = [];
    var expectedEra = function(patch){
        var id = null;
        EXPECTED_SHARD_ERAS.forEach(function(e){
            if (P.compare(patch, e[0]) >= 0 && (e[1] == null || P.compare(patch, e[1]) <= 0)) id = e[2];
        });
        return id;
    };
    var eras = {}, order = [];
    ctx.entries.forEach(function(e){
        var p = e.rec.patch, want = expectedEra(p);
        if (e.rec.shardEra !== want) problems.push(p + ": shardEra " + e.rec.shardEra + ", DESIGN says " + want);
        if (P.shardEraOf(p) !== want) problems.push(p + ": patches.shardEraOf gives " + P.shardEraOf(p) + ", DESIGN says " + want);
        if ((want === null) !== (e.src.shards === null)) problems.push(p + ": " + (want ? "stat shards missing" : "stat shards before V8.23"));
        if (!want) return;
        var sig = shardSignature(e.src.shards);
        if (!eras[want]) { eras[want] = { sig: sig, first: p, last: p, src: e.src.shards }; order.push(want); }
        else if (eras[want].sig !== sig) problems.push(p + ": shard values differ inside era " + want + " (first " + eras[want].first + ")");
        eras[want].last = p;
    });
    for (var i = 1; i < order.length; i++)
        if (eras[order[i]].sig === eras[order[i - 1]].sig) problems.push(order[i] + " has the same shards as " + order[i - 1]);
    var last = eras["s25-22"];
    var hp = last && last.src.perks["5001"];
    if (!hp || numbersIn(hp.desc).join("-") !== "10-180") problems.push("s25-22 scaling Health (5001) is " + (hp ? stripText(hp.desc) : "missing") + ", expected 10-180");
    // shard-eras.json (for T7b) agrees with the per-patch sources
    var table = null;
    try { table = readJson(FILES.shardEras); } catch (e) { problems.push(e.message); }
    if (table) {
        var list = table.eras || [];
        if (list.map(function(x){ return x.id; }).join(" ") !== order.join(" ")) problems.push("shard-eras.json ids " + list.map(function(x){ return x.id; }).join(" ") + " != " + order.join(" "));
        list.forEach(function(x){
            var era = eras[x.id];
            if (!era) return;
            if (!P.equal(x.firstListed, era.first) || !P.equal(x.lastListed, era.last)) problems.push("shard-eras.json " + x.id + " listed range " + x.firstListed + "-" + x.lastListed + " != " + era.first + "-" + era.last);
            var rows = x.rows.map(function(r){ return r.shards.map(function(s){ return s.id; }); });
            if (!same(rows, era.src.rows.map(function(r){ return r.perks; }))) problems.push("shard-eras.json " + x.id + " rows differ from the sources");
            x.rows.forEach(function(r){ r.shards.forEach(function(s){
                var cd = era.src.perks[s.id];
                if (!cd || numbersIn(cd.desc).join(",") !== s.numbers.join(",")) problems.push("shard-eras.json " + x.id + " " + s.id + " numbers differ from the sources");
            }); });
        });
    }
    // T7b's table in runes-reforged-data.js, once it carries the 7 era ids (read-only cross-check).
    var note = crossCheckShardTable(eras, order, problems);
    check("F1 shard eras", !problems.length, problems.length ? problems.join("; ")
        : order.map(function(id){ return id + " " + eras[id].first + "-" + eras[id].last; }).join(", ")
          + "; s25-22 scaling Health 10-180 (CommunityDragon); " + note, results);
}

function crossCheckShardTable(eras, order, problems) {
    var text = readText(FILES.shardTable);
    if (text === null) return "runes-reforged-data.js not found";
    var table;
    try {
        var vm = require("vm"), sandbox = {};
        vm.createContext(sandbox);
        vm.runInContext(text + "\n;this.__eras = typeof reforgedShardEras !== 'undefined' ? reforgedShardEras : null;", sandbox, { timeout: 2000 });
        table = sandbox.__eras;
    } catch (e) { return "runes-reforged-data.js not evaluated (" + e.message + ")"; }
    if (!table || !order.every(function(id){ return table[id]; })) return "runes-reforged-data.js table still uses the old era ids (T7b pending)";
    order.forEach(function(id){
        var era = eras[id], rows = table[id].rows || [];
        var ids = rows.map(function(r){ return (r.shards || []).map(function(s){ return Number(s.id); }); });
        if (!same(ids, era.src.rows.map(function(r){ return r.perks; }))) { problems.push("runes-reforged-data.js " + id + " rows differ from CommunityDragon"); return; }
        rows.forEach(function(r){ r.shards.forEach(function(s){
            var want = numbersIn(era.src.perks[s.id].desc), got = numbersIn(s.desc);
            if (got.slice(0, want.length).join(",") !== want.join(",")) problems.push("runes-reforged-data.js " + id + " " + s.id + " \"" + s.desc + "\" != CommunityDragon \"" + stripText(era.src.perks[s.id].desc) + "\"");
        }); });
    });
    return "runes-reforged-data.js tables agree";
}

function checkF2(ctx, results) {
    var problems = [], n = 0;
    ctx.entries.forEach(function(e){
        var p = e.rec.patch, b = e.payload && e.payload.subStyleBonus;
        if (P.compare(p, "V8.22") <= 0) {
            n++;
            if (!b) { problems.push(p + ": subStyleBonus missing"); return; }
            var prim = Object.keys(b).map(Number).sort();
            if (prim.join(",") !== "8000,8100,8200,8300,8400") problems.push(p + ": primaries " + prim.join(","));
            prim.forEach(function(pid){
                var sec = Object.keys(b[pid]).map(Number).sort();
                var want = [8000, 8100, 8200, 8300, 8400].filter(function(x){ return x !== pid; });
                if (sec.join(",") !== want.join(",")) problems.push(p + ": " + pid + " secondaries " + sec.join(","));
                sec.forEach(function(s){ if (typeof b[pid][s] !== "string" || !stripText(b[pid][s])) problems.push(p + ": " + pid + "+" + s + " empty"); });
            });
        } else if (b) problems.push(p + ": subStyleBonus after V8.22");
    });
    // It changed in V7.24, V8.1, V8.4, V8.5, V8.7 and V8.13 (§3.2).
    var changedAt = [], prev = null;
    ctx.entries.forEach(function(e){
        var b = e.payload && e.payload.subStyleBonus;
        if (!b) return;
        var k = P.stableStringify(mapValues(b, function(row){ return mapValues(row, textKey); }));
        if (prev !== null && k !== prev) changedAt.push(e.rec.patch);
        prev = k;
    });
    if (changedAt.join(" ") !== "V7.24 V8.1 V8.4 V8.5 V8.7 V8.13") problems.push("path-pair bonus changes at " + changedAt.join(" ") + ", DESIGN says V7.24 V8.1 V8.4 V8.5 V8.7 V8.13");
    check("F2 path-pair bonus", !problems.length, problems.length ? problems.join("; ")
        : n + " patches V7.22-V8.22 with all 5x4 pairs; null from V8.23; changes at " + changedAt.join(", "), results);
}

function checkF4(ctx, results) {
    var problems = [], n = 0;
    ctx.entries.forEach(function(e){
        var p = P.parse(e.rec.patch);
        if (p.major < 25) return;
        n++;
        if (e.rec.patch !== P.officialName(p)) problems.push(e.rec.patch + " is not the official name " + P.officialName(p));
        var label = P.labelFor(PAGE, e.rec);
        if (EXPECTED_LABELS[e.rec.patch] !== label) problems.push(e.rec.patch + ": label \"" + label + "\", expected \"" + EXPECTED_LABELS[e.rec.patch] + "\"");
    });
    if (n !== Object.keys(EXPECTED_LABELS).length) problems.push(n + " entries from 2025 on, expected " + Object.keys(EXPECTED_LABELS).length);
    var labels = {};
    ctx.entries.forEach(function(e){
        var l = P.labelFor(PAGE, e.rec);
        if (labels[l]) problems.push("duplicate label " + l);
        labels[l] = true;
    });
    check("F4 official labels", !problems.length, problems.length ? problems.join("; ")
        : n + " labels from V25.S1.1 to V26.19 (Current) are Riot's official names; all 123 labels unique", results);
}

function checkF5(ctx, results) {
    var problems = [];
    var last = ctx.entries[ctx.entries.length - 1].rec;
    if (P.pageDefault(PAGE) !== EXPECTED_DEFAULT) problems.push("pageDefaults.reforged is " + P.pageDefault(PAGE));
    if (P.seasonDefault("s2026", PAGE) !== EXPECTED_DEFAULT) problems.push("s2026 default is " + P.seasonDefault("s2026", PAGE));
    if (last.id !== EXPECTED_DEFAULT) problems.push("the last listed entry is " + last.id);
    if (!P.equal(P.livePatch(), last.patch)) problems.push("live patch " + P.livePatch() + " is not the last listed " + last.patch);
    var ids = {};
    ctx.entries.forEach(function(e){ ids[e.rec.id] = true; });
    P.seasons().forEach(function(s){
        var d = P.seasonDefault(s.key, PAGE);
        if (d && !ids[d]) problems.push(s.key + " default " + d + " is not listed");
    });
    var al = P.aliases();
    Object.keys(al.reforged).forEach(function(id){ if (!ids[al.reforged[id].to]) problems.push("alias " + id + " -> " + al.reforged[id].to + " is not listed"); });
    (al.keep.reforged || []).forEach(function(id){ if (!ids[id]) problems.push("kept id " + id + " is not listed"); });
    check("F5 default", !problems.length, problems.length ? problems.join("; ")
        : "page and 2026 default " + EXPECTED_DEFAULT + " = live " + P.livePatch() + "; all 9 season defaults, 1 alias and 9 kept ids are listed", results);
}

// C1: a change patch differs from the previous listed patch; C2: a boundary with no change equals it.
function checkC(ctx, results) {
    var c1 = [], c2 = [], n1 = 0, n2 = 0;
    ctx.entries.forEach(function(e, i){
        if (!i) return;
        var prev = ctx.entries[i - 1];
        var eq = e.stateHash === prev.stateHash;
        if (/change$/.test(e.rec.reason)) { n1++; if (eq) c1.push(e.rec.patch + " = " + prev.rec.patch); }
        else { n2++; if (!eq) c2.push(e.rec.patch + " != " + prev.rec.patch); }
    });
    check("C1 change patches differ", !c1.length, c1.length ? c1.join("; ") : n1 + "/" + n1 + " differ from the previous listed patch (stateHash)", results);
    check("C2 no-change boundaries equal", !c2.length, c2.length ? c2.join("; ") : n2 + "/" + n2 + " equal the previous listed patch (V7.22 is the first)", results);
}

function checkG1(ctx, results) {
    var problems = [], bytes = 0;
    ctx.files.forEach(function(f){
        var text = f.text;
        bytes += Buffer.byteLength(text, "utf8");
        var calls = text.match(/LolData\.register\(/g) || [];
        if (calls.length !== 1) problems.push(f.key + ": " + calls.length + " register calls");
        if (/\bfetch\s*\(|XMLHttpRequest/.test(text)) problems.push(f.key + ": fetch/XHR in a data file");
        var seen = null;
        try {
            require("vm").runInNewContext(text, { LolData: { register: function(kind, key, payload){ seen = { kind: kind, key: key, payload: payload }; } } });
        } catch (e) { problems.push(f.key + ": does not run (" + e.message + ")"); return; }
        if (!seen || seen.kind !== KIND || seen.key !== f.key) problems.push(f.key + ": registers " + (seen && seen.kind) + "/" + (seen && seen.key));
        else if (P.contentHash(seen.payload) !== f.hash) problems.push(f.key + ": payload hash differs after a round trip");
    });
    Object.keys(ctx.manifest).forEach(function(id){
        var m = ctx.manifest[id];
        if (m.data && !ctx.files.some(function(f){ return f.key === m.data; })) problems.push(id + ": data " + m.data + " not generated");
    });
    var withData = ctx.entries.filter(function(e){ return e.data; }).length;
    check("G1 generated files", !problems.length, problems.length ? problems.join("; ")
        : ctx.files.length + " files (" + (bytes / 1024).toFixed(1) + " KB) for " + withData + " entries; "
          + (ctx.entries.length - withData) + " entries have no extras (data: null); one register call each", results);
}

function runChecks(ctx) {
    var results = [];
    checkListing(ctx, results);
    checkF1(ctx, results);
    checkF2(ctx, results);
    checkF4(ctx, results);
    checkF5(ctx, results);
    checkC(ctx, results);
    checkG1(ctx, results);
    return results;
}

// ---------------------------------------------------------------------------
// Re-derivation from the raw download cache (mirrors the research's rrdiff2.effective)
// ---------------------------------------------------------------------------

function rawDdragonBuilds(rawDir) {
    var dir = path.join(rawDir, "reforged"), best = {};
    fs.readdirSync(dir).forEach(function(n){
        var m = /^runesReforged-(\d+\.\d+\.\d+)\.json$/.exec(n);
        if (!m) return;
        var p = P.fromDdragon(m[1]), k = p.key;
        if (!best[k] || P.compareBuild(P.fromDdragon(best[k]), p) < 0) best[k] = m[1];
    });
    return Object.keys(best).map(function(k){ return best[k]; })
        .sort(function(a, b){ return P.compare(P.fromDdragon(a), P.fromDdragon(b)); });
}

function loadCdragon(rawDir, branch) {
    var fs1 = path.join(rawDir, "cdragon", branch + "_perkstyles.json");
    var fp = path.join(rawDir, "cdragon", branch + "_perks.json");
    if (!fs.existsSync(fs1)) return null;
    var st = readJson(fs1);
    var perks = {};
    readJson(fp).forEach(function(q){ perks[q.id] = q; });
    return { styles: Array.isArray(st) ? st : st.styles, perks: perks };
}

function derive(rawDir, ver, prev) {
    var patch = P.fromDdragon(ver);
    var branch = ver.split(".").slice(0, 2).join(".");
    var dd = ddragonPaths(readJson(path.join(rawDir, "reforged", "runesReforged-" + ver + ".json")));
    var cd = loadCdragon(rawDir, branch);
    var out = { patch: patch, ddragon: ver, cdragonBranch: cd ? branch : null, cdragonCarriedFrom: null,
                paths: {}, overrides: {}, unresolved: {}, ddRaw: {}, bonus: null, shards: null };
    var perks = cd ? cd.perks : {};
    PATH_ORDER.forEach(function(pid){
        var p = dd[pid];
        if (!p) return;
        out.paths[pid] = { id: pid, key: p.key, name: p.name, icon: p.icon, slots: p.slots.map(function(row){
            return row.map(function(r){
                var sd = r.shortDesc, ld = r.longDesc;
                out.ddRaw[r.id] = [sd, ld];
                var ph = hasPlaceholder((sd || "") + " " + (ld || ""));
                if (ph && !cd && prev && same(prev.ddRaw[r.id], [sd, ld]) && prev.overrides[r.id]) {
                    var o = prev.overrides[r.id];
                    out.overrides[r.id] = o;
                    sd = o[0] != null ? o[0] : sd;
                    ld = o[1] != null ? o[1] : ld;
                } else if (ph) {
                    var q = perks[r.id];
                    if (q) {
                        var nsd = hasPlaceholder(sd || "") ? (q.shortDesc == null ? null : q.shortDesc) : sd;
                        var nld = hasPlaceholder(ld || "") ? (q.longDesc == null ? null : q.longDesc) : ld;
                        out.overrides[r.id] = [nsd === sd ? null : nsd, nld === ld ? null : nld];
                        sd = nsd; ld = nld;
                    }
                    var left = uniqSorted(placeholdersIn((sd || "") + " " + (ld || "")));
                    if (left.length) out.unresolved[r.id] = left;
                }
                return { id: r.id, key: r.key, name: r.name, icon: r.icon, shortDesc: sd, longDesc: ld };
            });
        }) };
    });
    if (!cd && prev) {
        out.bonus = prev.bonus;
        out.shards = prev.shards;
        out.cdragonCarriedFrom = prev.cdragonBranch || prev.cdragonCarriedFrom;
    }
    if (cd) {
        var bonus = {}, shardSlots = null;
        cd.styles.forEach(function(s){
            (s.subStyleBonus || []).forEach(function(sb){
                var q = perks[sb.perkId];
                if (q) (bonus[String(s.id)] = bonus[String(s.id)] || {})[String(sb.styleId)] = q.longDesc == null ? null : q.longDesc;
            });
        });
        for (var i = 0; i < cd.styles.length && !shardSlots; i++) {
            var ss = (cd.styles[i].slots || []).filter(function(sl){ return sl.type === "kStatMod"; })
                .map(function(sl){ return { label: sl.slotLabel == null ? null : sl.slotLabel, perks: sl.perks }; });
            if (ss.length) shardSlots = ss;
        }
        if (shardSlots) {
            var ids = {};
            shardSlots.forEach(function(sl){ sl.perks.forEach(function(id){ ids[id] = true; }); });
            var sp = {};
            Object.keys(ids).map(Number).sort(function(a, b){ return a - b; }).forEach(function(id){
                var q = perks[id];
                if (q) sp[String(id)] = { name: q.name, desc: q.longDesc == null ? null : q.longDesc,
                                          icon: String(q.iconPath || "").split("/").pop() };
            });
            out.shards = { rows: shardSlots, perks: sp };
        } else out.bonus = bonus;
    }
    return out;
}

// The committed-source view of a derivation (what tools/import-reforged.js writes):
//   perkText[id]   = the client texts that replace a Data Dragon field ([short|null, long|null])
//   unresolved[id] = { placeholders, text } for fields that still show a placeholder after the
//                    client text (the effective text, so an override can fill it)
// `d` = { paths, overrides: {id: [s|null, l|null]}, unresolved: {id: [...]}, ddRaw: {id: [s, l]}, bonus, shards }.
function sourceViewOf(d) {
    var perkText = {}, unresolved = {};
    uniqSorted(Object.keys(d.overrides).concat(Object.keys(d.unresolved))).forEach(function(id){
        var o = d.overrides[id] || [null, null], raw = d.ddRaw[id] || [null, null];
        var pt = [null, null], ut = [null, null];
        [0, 1].forEach(function(i){
            var eff = o[i] != null ? o[i] : raw[i];
            if (hasPlaceholder(eff)) ut[i] = eff;
            else if (o[i] != null) pt[i] = o[i];
        });
        if (pt[0] != null || pt[1] != null) perkText[id] = pt;
        if (ut[0] != null || ut[1] != null)
            unresolved[id] = { placeholders: uniqSorted(placeholdersIn(ut[0]).concat(placeholdersIn(ut[1]))), text: ut };
    });
    var pt = Object.keys(perkText).length ? perkText : null;
    var bonus = d.bonus && Object.keys(d.bonus).length ? d.bonus : null;
    return {
        perkText: pt, subStyleBonus: bonus, shards: d.shards || null, unresolved: unresolved,
        catalogHash: catalogHashOf(d.paths, coveredBy(pt, unresolved))
    };
}

// ---------------------------------------------------------------------------
// Audit (§7 F3, C3; provenance of the committed sources)
// ---------------------------------------------------------------------------

function readGameBinValue(rawDir, branch, perkId, field) {
    var file = path.join(rawDir, "cdragon-game", branch + "_perks.cdtb.bin.json");
    if (!fs.existsSync(file)) return undefined;
    var bin = readJson(file), keys = Object.keys(bin);
    for (var i = 0; i < keys.length; i++) {
        var v = bin[keys[i]];
        if (v && v.mPerkId === perkId) {
            var amt = v.mScript && v.mScript.mSpellScriptData && v.mScript.mSpellScriptData.mEffectAmount;
            return amt ? amt[field] : null;
        }
    }
    return null;
}

// Checks an override's `verify` record against CommunityDragon game data in the cache.
// Returns { checked: [branches], problems: [] }.
function verifyOverrideValue(rawDir, o, patches) {
    var res = { checked: [], missing: [], problems: [] };
    if (!o.verify) return res;
    patches.forEach(function(p){
        if (!inRange(p, o)) return;
        var branch = P.toDdragon(p);
        var v = readGameBinValue(rawDir, branch, o.verify.perkId, o.verify.field);
        if (v === undefined) { res.missing.push(branch); return; }
        var want = v == null ? null : String(Math.round(v * (o.verify.multiply || 1) * 1000) / 1000);
        if (want !== o.value) res.problems.push(o.id + ": " + branch + " " + o.verify.field + " = " + v + " -> " + want + ", override says " + o.value);
        else res.checked.push(branch);
    });
    return res;
}

function noisePatches() {
    var seen = {};
    readNoise().items.forEach(function(n){ seen[P.parse(n.patch).key] = true; });
    return seen;
}

function audit(ctx, rawDir) {
    var results = [];
    var builds = rawDdragonBuilds(rawDir);
    var listed = {};
    ctx.entries.forEach(function(e){ listed[P.parse(e.rec.patch).key] = e; });
    var noise = noisePatches();

    var derived = [], prev = null;
    builds.forEach(function(ver){ prev = derive(rawDir, ver, prev); derived.push(prev); });

    // A: committed sources = fresh derivation; listing builds = the last build of each patch.
    var aProblems = [], nA = 0;
    derived.forEach(function(d){
        var e = listed[d.patch.key];
        if (!e) return;
        nA++;
        var v = sourceViewOf(d), s = e.src, w = e.rec.patch;
        if (s.ddragon !== d.ddragon) aProblems.push(w + ": ddragon " + s.ddragon + ", the cache's last build is " + d.ddragon);
        if ((s.cdragonBranch || null) !== d.cdragonBranch) aProblems.push(w + ": cdragonBranch " + s.cdragonBranch + " != " + d.cdragonBranch);
        if ((s.cdragonCarriedFrom || null) !== (d.cdragonCarriedFrom || null)) aProblems.push(w + ": cdragonCarriedFrom " + s.cdragonCarriedFrom + " != " + d.cdragonCarriedFrom);
        ["perkText", "subStyleBonus", "shards", "unresolved", "catalogHash"].forEach(function(k){
            if (!same(s[k] == null ? null : s[k], v[k] == null ? null : v[k])) aProblems.push(w + ": " + k + " differs from the raw cache");
        });
    });
    Object.keys(listed).forEach(function(k){
        if (!derived.some(function(d){ return d.patch.key === k; })) aProblems.push(listed[k].rec.patch + ": not in the raw cache");
    });
    check("A sources = raw cache", !aProblems.length, aProblems.length ? aProblems.slice(0, 20).join("; ")
        : nA + "/" + ctx.entries.length + " source files equal a fresh derivation from " + builds.length + " Data Dragon builds + CommunityDragon", results);

    // Override values against CommunityDragon game data.
    var oProblems = [], oNotes = [];
    ctx.overrides.forEach(function(o){
        var r = verifyOverrideValue(rawDir, o, derived.map(function(d){ return d.patch; }));
        oProblems = oProblems.concat(r.problems);
        if (o.verify) oNotes.push(o.id + " verified in " + r.checked.length + " branches" + (r.missing.length ? " (" + r.missing.length + " not cached: " + r.missing.join(", ") + ")" : ""));
    });
    check("A override values", !oProblems.length, oProblems.length ? oProblems.join("; ") : oNotes.join("; ") || "no verifiable overrides", results);

    // F3: perkText ids exist in the patch's catalog; nothing rendered still shows @…@.
    var f3 = [], nTexts = 0;
    ctx.entries.forEach(function(e){
        var dd = ddragonPaths(readJson(path.join(rawDir, "reforged", "runesReforged-" + e.src.ddragon + ".json")));
        var runes = {};
        Object.keys(dd).forEach(function(pid){ dd[pid].slots.forEach(function(row){ row.forEach(function(r){ runes[r.id] = r; }); }); });
        var pt = (e.payload && e.payload.perkText) || {};
        Object.keys(pt).forEach(function(id){
            var r = runes[id];
            if (!r) { f3.push(e.rec.patch + ": perkText " + id + " is not in the Data Dragon " + e.src.ddragon + " catalog"); return; }
            FIELDS.forEach(function(f, i){
                if (pt[id][i] != null && pt[id][i] === r[f]) f3.push(e.rec.patch + ": perkText " + id + " " + f + " equals the Data Dragon text (no-op)");
            });
        });
        Object.keys(runes).forEach(function(id){
            FIELDS.forEach(function(f, i){
                var t = pt[id] && pt[id][i] != null ? pt[id][i] : runes[id][f];
                nTexts++;
                if (hasPlaceholder(t)) f3.push(e.rec.patch + ": " + runes[id].name + " " + f + " shows " + placeholdersIn(t).join(" "));
            });
        });
    });
    check("F3 perkText vs catalog", !f3.length, f3.length ? f3.slice(0, 20).join("; ")
        : "every perkText id is in its patch's catalog; " + nTexts + " rendered texts, none with @...@ or {{...}}", results);

    // C3: every Data Dragon patch vs its predecessor (stateHash, overrides applied).
    var c3 = [], counts = { equal: 0, noise: 0, change: 0, stateEqual: 0 };
    var prevHash = null;
    derived.forEach(function(d, i){
        var v = sourceViewOf(d), st;
        try { st = applyOverrides(d.patch, v.perkText, v.unresolved, ctx.overrides); }
        catch (err) { c3.push(err.message); return; }
        if (Object.keys(st.unresolved).length) c3.push(d.patch.label + ": unresolved " + Object.keys(st.unresolved).join(","));
        var h = stateHashOf(v.catalogHash, st.perkText, v.subStyleBonus, v.shards);
        var e = listed[d.patch.key];
        if (e) { if (h === e.stateHash) counts.stateEqual++; else c3.push(e.rec.patch + ": stateHash from the raw cache differs from the manifest"); }
        if (i) {
            var isChange = e && /change$/.test(e.rec.reason);
            if (isChange) { if (h === prevHash) c3.push(e.rec.patch + " is listed as a change but equals " + derived[i - 1].patch.label); else counts.change++; }
            else if (h === prevHash) counts.equal++;
            else if (noise[d.patch.key]) counts.noise++;
            else c3.push(d.patch.label + (e ? " (listed, no change)" : " (unlisted)") + " differs from " + derived[i - 1].patch.label + " and has no noise entry");
        }
        prevHash = h;
    });
    check("C3 unlisted patches", !c3.length, c3.length ? c3.slice(0, 20).join("; ")
        : derived.length + " Data Dragon patches: " + counts.change + " listed changes differ from their predecessor; "
          + counts.equal + " equal it; " + counts.noise + " differ only by logged noise; "
          + counts.stateEqual + "/" + ctx.entries.length + " manifest stateHashes reproduced", results);
    return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    var a = { check: false, audit: null, quiet: false };
    for (var i = 0; i < argv.length; i++) {
        if (argv[i] === "--check") a.check = true;
        else if (argv[i] === "--quiet") a.quiet = true;
        else if (argv[i] === "--audit") a.audit = argv[++i];
        else fail("unknown argument " + argv[i] + " (use --check, --audit <raw dir>, --quiet)");
    }
    if (a.audit === undefined) fail("--audit needs the raw download cache directory");
    return a;
}

function main() {
    var args = parseArgs(process.argv.slice(2));
    var ctx = build({ check: args.check });
    if (ctx.errors.length) {
        console.error("build-reforged: " + ctx.errors.length + " error(s)");
        ctx.errors.slice(0, 40).forEach(function(e){ console.error("  " + e); });
        process.exit(1);
    }
    if (!args.quiet) {
        console.log("build-reforged: " + ctx.entries.length + " entries, " + ctx.files.length + " data files"
            + (args.check ? " (check only)" : "") + "; " + (ctx.changed.length ? (args.check ? "stale: " : "wrote: ") + ctx.changed.length + " file(s)" : "outputs up to date"));
        if (!args.check) ctx.changed.forEach(function(f){ console.log("  " + f); });
    }
    var results = runChecks(ctx);
    if (args.audit) results = results.concat(audit(ctx, path.resolve(args.audit)));
    var failed = results.filter(function(r){ return !r.ok; });
    results.forEach(function(r){
        if (!args.quiet || !r.ok) console.log((r.ok ? "  ok   " : "  FAIL ") + r.name + ": " + r.detail);
    });
    if (failed.length) { console.error("build-reforged: " + failed.length + " check(s) failed"); process.exit(1); }
}

module.exports = {
    FILES: FILES, PATH_ORDER: PATH_ORDER, EXPECTED: EXPECTED, EXPECTED_SHARD_ERAS: EXPECTED_SHARD_ERAS,
    stripText: stripText, textKey: textKey, numbersIn: numbersIn, placeholdersIn: placeholdersIn,
    ddragonPaths: ddragonPaths, coveredBy: coveredBy, catalogHashOf: catalogHashOf, stateHashOf: stateHashOf,
    shardSignature: shardSignature, applyOverrides: applyOverrides, validateOverrides: validateOverrides,
    derive: derive, sourceViewOf: sourceViewOf, rawDdragonBuilds: rawDdragonBuilds,
    readGameBinValue: readGameBinValue, verifyOverrideValue: verifyOverrideValue,
    build: build, runChecks: runChecks, audit: audit
};

if (require.main === module) {
    try { main(); }
    catch (e) { console.error(e && e.stack || e); process.exit(1); }
}
