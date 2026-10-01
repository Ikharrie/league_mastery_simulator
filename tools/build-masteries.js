#!/usr/bin/env node
// tools/build-masteries.js — per-patch mastery datasets (DESIGN §1.2-§1.7, §4.4, §7 M1-M6).
//
//   node tools/build-masteries.js                 build, run the checks, write data/masteries/*
//   node tools/build-masteries.js --check         build in memory; exit 1 if a file on disk differs
//   node tools/build-masteries.js --audit <raw>   also check C3: every unlisted DDragon patch in
//                                                 <raw>/mastery/mastery-<build>.json builds to the
//                                                 listed patch in effect, up to logged noise
//   --strict-icons   missing icons fail the build even while data/sources/masteries/icon-map.json
//                    does not exist yet (T3); without the map they are reported as pending
//   --quiet          print errors only
//   --icon-map <f>   use <f> instead of data/sources/masteries/icon-map.json (to try a candidate
//                    map; with --check nothing is written)
//
// Reads only committed files:
//   data/patches/masteries.json             listing (42 patches)
//   data/patches/masteries-overrides.json   layers 2-4 (export-fix < wiki-fact < correction)
//   data/patches/masteries-families.json    families, rank totals, key aliases
//   data/patches/noise/masteries.json       noise log (C2 text-only boundaries, C3 audit, M5)
//   data/patches/aliases.json               legacy ids -> canonical ids (via tools/lib/patches.js)
//   data/sources/masteries/ddragon/*.json   trimmed DDragon builds
//   data/sources/masteries/wiki/*.json      wiki-era snapshots
//   data/sources/masteries/icon-map.json    optional (T3): {build: {id: folder}}
//   tools/fixtures/legacy-codecs.json       legacy codecs captured at the baseline (P0-A)
// Writes:
//   data/masteries/m-<patch>.js             one per distinct payload (later identical patches share)
//   data/masteries/legacy-codecs.js         the 8 legacy codecs, keys mapped to canonical keys
//   data/masteries/manifest.json            {id: {data, file, hash}}
//
// Deterministic and offline. Exit 1 on any failed check; nothing is written then.
// require()-able: module.exports = { build, payloadFor, slug, ... } (for tools/check-patches.js).

"use strict";

var fs = require("fs");
var path = require("path");
var P = require("./lib/patches");

var ROOT = path.resolve(__dirname, "..");
var GENERATOR = "tools/build-masteries.js";
var FILES = {
    listing: "data/patches/masteries.json",
    overrides: "data/patches/masteries-overrides.json",
    families: "data/patches/masteries-families.json",
    noise: "data/patches/noise/masteries.json",
    iconMap: "data/sources/masteries/icon-map.json",
    codecs: "tools/fixtures/legacy-codecs.json",
    ddragonDir: "data/sources/masteries/ddragon",
    wikiDir: "data/sources/masteries/wiki",
    outDir: "data/masteries",
    images: "images/masteries"
};
var MAX_POINTS = 30;
var CLASSIC_TREES = ["Offense", "Defense", "Utility"];
var KEYSTONE_TREES = [
    { src: "Ferocity", id: "ferocity", name: "Ferocity", color: "#c83c32" },
    { src: "Cunning", id: "cunning", name: "Cunning", color: "#a060c0" },
    { src: "Resolve", id: "resolve", name: "Resolve", color: "#6a6ad2" }
];
// Wiki-era icon folders (DESIGN §5.1): the 2011 / 2012 client icons, and the
// first DDragon build for the S3 templates.
var WIKI_ICON_FOLDER = { s1: "s1", s2: "s2", s3: "3.6.14" };
// AIR client art that differs from the dataset build (DESIGN §3.5 airIcon):
// V6.22-V6.24 kept the 5.22.3 art for these keys (patches.airIconVersionOf).
var AIR_ICON_KEYS = ["fresh-blood", "double-edged-sword"];
// Fields that only say where an icon lives (ignored for the change rules C1/C2).
var ICON_FIELDS = ["iconBase", "iconVer", "airIcon", "ddragonVersion"];
var TEXT_FIELDS = ["rankDesc", "desc"];

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { return P.readJson(abs(p)); }
function exists(p) { try { fs.accessSync(abs(p)); return true; } catch (e) { return false; } }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

// Same slug as tools/capture-legacy.js (P0-A): lowercase, accents and
// apostrophes dropped, other runs of non-alphanumerics -> "-".
function slug(name) {
    return String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// DDragon text -> calculator text: <br> becomes a line break (as the
// pre-rework S4/S5 data did) and white space is laid out the way the client's
// HTML tooltip drew it: runs of spaces collapsed, none around a line break,
// none at the ends. Any other markup, or an @placeholder@, is an error.
function normalizeSpace(t) {
    return String(t).replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/^ +| +$/g, "");
}

function ddText(s, where, errors) {
    if (s == null) { errors.push(where + ": missing rank text"); return ""; }
    var t = normalizeSpace(String(s).replace(/<br\s*\/?>/gi, "\n"));
    if (/<[^>]+>/.test(t)) errors.push(where + ": markup left in text: " + JSON.stringify(t));
    if (/@[A-Za-z0-9_.]+@/.test(t)) errors.push(where + ": unresolved placeholder: " + JSON.stringify(t));
    return t;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function loadInputs(opts) {
    var listing = readJson(FILES.listing);
    var overrides = readJson(FILES.overrides);
    var families = readJson(FILES.families);
    var noise = readJson(FILES.noise);
    var iconMap = opts && opts.iconMapFile ? normalizeIconMap(P.readJson(path.resolve(opts.iconMapFile)))
        : exists(FILES.iconMap) ? normalizeIconMap(readJson(FILES.iconMap)) : null;
    var codecs = readJson(FILES.codecs);
    var ddCache = {}, wikiCache = {};
    return {
        listing: listing.patches,
        overrides: overrides.overrides,
        families: families,
        noise: noise,
        iconMap: iconMap,
        codecs: codecs,
        aliases: P.aliases(),
        dd: function(build){
            if (!ddCache[build]) ddCache[build] = (opts && opts.rawDd && opts.rawDd[build]) || readJson(FILES.ddragonDir + "/" + build + ".json");
            return ddCache[build];
        },
        wiki: function(patch){
            var name = P.parse(patch).name;
            if (!wikiCache[name]) wikiCache[name] = readJson(FILES.wikiDir + "/" + name + ".json");
            return wikiCache[name];
        }
    };
}

// icon-map.json (T3): {build: {id: folder}}; a folder may be written as
// "4.20.2", "4.20.2/" or "images/masteries/4.20.2/". Normalised to "4.20.2".
function normalizeIconMap(raw) {
    var map = {};
    var src = raw && raw.builds && typeof raw.builds === "object" ? raw.builds : raw;
    Object.keys(src || {}).forEach(function(build){
        if (/^_/.test(build)) return;
        var ids = src[build];
        if (!ids || typeof ids !== "object") return;
        map[build] = {};
        Object.keys(ids).forEach(function(id){
            var v = ids[id];
            if (v && typeof v === "object") v = v.folder || v.dir || v.path;
            if (typeof v !== "string") return;
            map[build][id] = v.replace(/\\/g, "/").replace(/^\.?\/?(images\/masteries\/)?/, "").replace(/\/+$/, "");
        });
    });
    return map;
}

// ---------------------------------------------------------------------------
// Families and keys
// ---------------------------------------------------------------------------

// The family of a patch: the last family that starts at or before it (an
// unlisted patch between two families, like V5.11, belongs to the earlier
// one: its data is that of the listed patch in effect).
function familyOf(inputs, patch) {
    var fams = inputs.families.families, hit = null;
    for (var i = 0; i < fams.length; i++) if (P.compare(patch, fams[i].first) >= 0) hit = fams[i];
    if (hit && P.compare(patch, fams[fams.length - 1].last) > 0) return null;
    return hit;
}

function inRange(patch, from, to) {
    return P.compare(patch, from) >= 0 && P.compare(patch, to) <= 0;
}

// Assign `key` to every mastery of a state: alias (family + patch range +
// cell + raw or fixed name) or the slug of the (fixed) name.
function assignKeys(state, ctx) {
    var aliases = ctx.inputs.families.aliases || [];
    eachMastery(state, function(m, treeIdx){
        var key = null;
        aliases.forEach(function(a, ai){
            if (a.family !== ctx.family.id || !inRange(ctx.patch, a.from, a.to)) return;
            if (a.cell && a.cell !== m.cell) return;
            if (a.name !== m.rawName && a.name !== m.name) return;
            key = a.key;
            ctx.usedAliases[ai] = true;
        });
        m.key = key || slug(m.name);
        if (!m.key) ctx.errors.push(ctx.patch + ": empty key for " + JSON.stringify(m.name));
    });
    // Unique within a tree.
    state.trees.forEach(function(tree, ti){
        var seen = {};
        eachTreeMastery(state, ti, function(m){
            if (seen[m.key]) ctx.errors.push(ctx.patch + ": duplicate key " + m.key + " in tree " + ti);
            seen[m.key] = true;
        });
    });
}

function eachTreeMastery(state, ti, fn) {
    var tree = state.trees[ti];
    if (state.system === "classic") tree.forEach(function(m){ fn(m); });
    else tree.tiers.forEach(function(t){ t.masteries.forEach(function(m){ fn(m, t); }); });
}

function eachMastery(state, fn) {
    state.trees.forEach(function(t, ti){ eachTreeMastery(state, ti, function(m, tier){ fn(m, ti, tier); }); });
}

// ---------------------------------------------------------------------------
// Base states (layer 1)
// ---------------------------------------------------------------------------

// Classic DDragon build -> state. index = (row-1)*4 + column from the tree
// layout; parent by DDragon prereq (cell id), resolved to grid index later.
function classicFromDdragon(dd, ctx) {
    var trees = CLASSIC_TREES.map(function(tname, ti){
        var rows = dd.tree[tname];
        if (!rows) { ctx.errors.push(ctx.patch + ": DDragon " + dd.version + " has no tree " + tname); return []; }
        var list = [];
        if (rows.length > 6) ctx.errors.push(ctx.patch + ": " + tname + " has " + rows.length + " rows");
        rows.forEach(function(row, r){
            if (row.length > 4) ctx.errors.push(ctx.patch + ": " + tname + " row " + (r + 1) + " has " + row.length + " cells");
            row.forEach(function(c, col){
                if (!c) return;
                var id = c.masteryId, d = dd.data[id], where = ctx.patch + " " + id;
                if (!d) { ctx.errors.push(where + ": cell without data"); return; }
                if (String(d.prereq) !== String(c.prereq)) ctx.errors.push(where + ": prereq data " + d.prereq + " != tree " + c.prereq);
                if (d.image.full !== id + ".png") ctx.errors.push(where + ": image " + d.image.full);
                if (d.description.length !== d.ranks) ctx.errors.push(where + ": " + d.description.length + " rank texts for " + d.ranks + " ranks");
                list.push({
                    cell: id, index: r * 4 + col + 1, rawName: d.name, name: d.name, ranks: d.ranks,
                    icon: id, iconId: id,
                    rankDesc: d.description.map(function(s, i){ return ddText(s, where + " rank " + (i + 1), ctx.errors); }),
                    parentCell: c.prereq && c.prereq !== "0" ? String(c.prereq) : null
                });
            });
        });
        return list;
    });
    var cells = {};
    trees.forEach(function(t, ti){ t.forEach(function(m){ cells[m.cell] = { ti: ti, index: m.index }; }); });
    trees.forEach(function(t, ti){
        t.forEach(function(m){
            if (m.parentCell == null) { m.parentIndex = null; return; }
            var p = cells[m.parentCell];
            if (!p || p.ti !== ti) { ctx.errors.push(ctx.patch + " " + m.cell + ": prerequisite " + m.parentCell + " not in the same tree"); m.parentIndex = null; return; }
            m.parentIndex = p.index;
        });
    });
    var n = Object.keys(dd.data).length, placed = Object.keys(cells).length;
    if (n !== placed) ctx.errors.push(ctx.patch + ": DDragon " + dd.version + " has " + n + " masteries, " + placed + " placed in the tree");
    return { system: "classic", trees: trees, build: dd.version };
}

// Wiki snapshot -> state (removed entries dropped; parent = grid index).
function classicFromWiki(src, ctx) {
    var trees = src.data.map(function(tree, ti){
        var list = tree.map(function(m, pos){
            var o = {
                cell: null, srcPos: pos, index: m.index, rawName: m.name, name: m.name, ranks: m.ranks,
                icon: m.icon, desc: m.desc, rankInfo: m.rankInfo || [], removed: !!m.removed
            };
            if (m.perlevel) o.perlevel = m.perlevel;
            if (m.rankInfo2) o.rankInfo2 = m.rankInfo2;
            if (m.parent != null) {
                var p = tree[m.parent];
                if (!p) ctx.errors.push(ctx.patch + " " + m.name + ": parent position " + m.parent + " out of range");
                else if (p.removed) ctx.errors.push(ctx.patch + " " + m.name + ": parent " + p.name + " is removed");
                else o.parentIndex = p.index;
            } else o.parentIndex = null;
            return o;
        });
        return list.filter(function(m){ return !m.removed; });
    });
    if (trees.length !== 3) ctx.errors.push(ctx.patch + ": wiki snapshot has " + trees.length + " trees");
    return { system: "classic", trees: trees, build: null };
}

function keystoneFromDdragon(dd, ctx) {
    var trees = KEYSTONE_TREES.map(function(kt){
        var rows = dd.tree[kt.src];
        if (!rows) { ctx.errors.push(ctx.patch + ": DDragon " + dd.version + " has no tree " + kt.src); return { id: kt.id, tiers: [] }; }
        return {
            id: kt.id, name: kt.name, color: kt.color,
            tiers: rows.map(function(row, r){
                return {
                    tier: r + 1,
                    cells: row.map(function(c){ return c ? c.masteryId : null; }),
                    masteries: row.filter(Boolean).map(function(c){
                        var id = c.masteryId, d = dd.data[id], where = ctx.patch + " " + id;
                        if (!d) { ctx.errors.push(where + ": cell without data"); return null; }
                        if (d.image.full !== id + ".png") ctx.errors.push(where + ": image " + d.image.full);
                        if (d.description.length !== d.ranks) ctx.errors.push(where + ": " + d.description.length + " rank texts for " + d.ranks + " ranks");
                        if (c.prereq !== "0") ctx.errors.push(where + ": keystone masteries have no prerequisites, got " + c.prereq);
                        return {
                            cell: id, rawName: d.name, name: d.name, ranks: d.ranks, iconId: parseInt(id, 10),
                            rankDesc: d.description.map(function(s, i){ return ddText(s, where + " rank " + (i + 1), ctx.errors); })
                        };
                    }).filter(Boolean)
                };
            })
        };
    });
    return { system: "keystone", trees: trees, build: dd.version };
}

// ---------------------------------------------------------------------------
// Overrides (layers 2-4)
// ---------------------------------------------------------------------------

var KIND_ORDER = { "export-fix": 0, "wiki-fact": 1, "correction": 2 };
var OVERRIDE_FIELDS = /^(name|desc|rankInfo|rankInfo2|perlevel|ranks|rankDesc)(\[(\d+)\])?$/;

function findTarget(state, target) {
    var hit = null;
    var slash = target.indexOf("/");
    if (slash > 0 && state.system === "classic") {
        var tname = target.slice(0, slash), name = target.slice(slash + 1);
        var ti = CLASSIC_TREES.indexOf(tname);
        if (ti >= 0) state.trees[ti].forEach(function(m){ if (m.name === name || m.rawName === name) hit = m; });
        return hit;
    }
    eachMastery(state, function(m){ if (m.cell === target) hit = m; });
    return hit;
}

function applyOverrides(state, ctx) {
    var list = ctx.inputs.overrides.filter(function(o){ return inRange(ctx.patch, o.from, o.to); })
        .sort(function(a, b){ return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    list.forEach(function(o){
        var where = ctx.patch + " " + o.id;
        var m = findTarget(state, o.target);
        if (!m) { ctx.errors.push(where + ": target " + o.target + " missing (M4)"); return; }
        var f = OVERRIDE_FIELDS.exec(o.field);
        if (!f) { ctx.errors.push(where + ": unsupported field " + o.field); return; }
        var field = f[1], idx = f[3] != null ? parseInt(f[3], 10) : null;
        if (o.kind === "wiki-fact" && state.build && m[field] !== undefined)
            { ctx.errors.push(where + ": a wiki-fact may not replace a DDragon value (" + o.field + ")"); return; }
        var before = JSON.stringify(idx == null ? m[field] : (m[field] || [])[idx]);
        if (idx == null) m[field] = clone(o.value);
        else {
            if (!Array.isArray(m[field]) || idx >= m[field].length) { ctx.errors.push(where + ": " + o.field + " out of range"); return; }
            m[field][idx] = clone(o.value);
        }
        if (JSON.stringify(o.value) === before) { ctx.errors.push(where + ": stale override, " + o.field + " already " + before + " (M4)"); return; }
        ctx.applied.push(o.id);
        ctx.usedOverrides[o.id] = true;
    });
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

// Folder (under images/masteries/) holding the art of DDragon id `id` as it
// was in `build`: icon-map.json when present, else the build itself (the
// dataset version folder fallback, until T3 writes the map).
function iconFolder(ctx, build, id) {
    var map = ctx.inputs.iconMap;
    if (map && map[build] && map[build][id]) return map[build][id];
    if (map && map[build]) ctx.iconNotes.push(ctx.patch + ": icon-map " + build + " has no id " + id + " (fallback " + build + ")");
    return build;
}

// The folder used by most entries becomes the dataset default (ties: the
// dataset's own build, else the earliest version; the same rule as
// tools/fetch-mastery-icons.js uses for its per-build main folder).
function folderOrder(a, b) {
    var pa = /^\d+(\.\d+)+$/.test(a), pb = /^\d+(\.\d+)+$/.test(b);
    if (pa && pb) return P.compareBuild(a, b);
    if (pa !== pb) return pa ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
}

function dominantFolder(folders, build) {
    var count = {};
    folders.forEach(function(f){ count[f] = (count[f] || 0) + 1; });
    var best = null;
    Object.keys(count).sort(folderOrder).forEach(function(f){
        if (best === null || count[f] > count[best] || (count[f] === count[best] && f === build)) best = f;
    });
    return best;
}

// ---------------------------------------------------------------------------
// Payloads (DESIGN §1.6)
// ---------------------------------------------------------------------------

// Icon folder of a classic mastery. DDragon era: icon-map.json or the build
// (fallback). Wiki era: s1 / s2; the S3 templates use the art of their DDragon
// build (V1.0.0.152 -> 3.6.14, V3.13 -> 3.13.24) when icon-map.json maps it,
// else 3.6.14 ("S3 V3.13 uses 3.6.14 if the hashes match", DESIGN §5.1).
function classicFolder(state, ctx, m) {
    if (state.build) return iconFolder(ctx, state.build, m.icon);
    var season = P.seasonOf(ctx.patch);
    if (season !== "s3") return WIKI_ICON_FOLDER[season];
    var cc = ctx.record.source.crossCheck || [WIKI_ICON_FOLDER.s3];
    var iconBuild = P.compare(ctx.patch, "V3.1") >= 0 ? cc[cc.length - 1] : cc[0];
    var map = ctx.inputs.iconMap;
    return (map && map[iconBuild] && map[iconBuild][m.icon]) || WIKI_ICON_FOLDER.s3;
}

function classicPayload(state, ctx) {
    var look = P.lookOf(ctx.patch);
    var trees = state.trees.map(function(t){ return t.slice().sort(function(a, b){ return a.index - b.index; }); });
    // Icon folders.
    var folders = [];
    trees.forEach(function(t){
        t.forEach(function(m){
            m.folder = classicFolder(state, ctx, m);
            if (!m.folder) ctx.errors.push(ctx.patch + ": no icon folder for " + m.name);
            folders.push(m.folder);
        });
    });
    var base = dominantFolder(folders, state.build || folders[0]);
    var data = trees.map(function(t, ti){
        var pos = {};
        t.forEach(function(m, i){
            if (pos[m.index] != null) ctx.errors.push(ctx.patch + ": two masteries in cell " + m.index + " of tree " + ti);
            pos[m.index] = i;
        });
        return t.map(function(m){
            var o = { key: m.key, index: m.index, name: m.name, icon: m.icon, ranks: m.ranks };
            if (m.rankDesc) o.rankDesc = m.rankDesc;
            else {
                o.desc = m.desc;
                o.rankInfo = m.rankInfo;
                if (m.perlevel) o.perlevel = m.perlevel;
                if (m.rankInfo2) o.rankInfo2 = m.rankInfo2;
            }
            if (m.parentIndex != null) {
                if (pos[m.parentIndex] == null) ctx.errors.push(ctx.patch + " " + m.name + ": parent cell " + m.parentIndex + " is empty");
                else o.parent = pos[m.parentIndex];
            }
            if (m.folder !== base) o.iconBase = "images/masteries/" + m.folder + "/";
            return o;
        });
    });
    return {
        system: "classic", family: ctx.family.id, look: look, maxPoints: MAX_POINTS,
        iconBase: "images/masteries/" + base + "/",
        data: data
    };
}

function keystonePayload(state, ctx) {
    var air = P.eraOf(ctx.patch, "masteries") === "air";
    var airVer = air ? P.airIconVersionOf(ctx.patch) : null;
    var folders = [];
    state.trees.forEach(function(t){
        t.tiers.forEach(function(tier){
            tier.masteries.forEach(function(m){ m.folder = iconFolder(ctx, state.build, m.cell); folders.push(m.folder); });
        });
    });
    var base = dominantFolder(folders, state.build);
    var layout = P.airFiveRankLayoutOf(ctx.patch);
    var trees = state.trees.map(function(t){
        return {
            id: t.id, name: t.name, color: t.color,
            tiers: t.tiers.map(function(tier){
                var isKs = tier.tier === 6;
                var out = { tier: tier.tier };
                if (isKs) out.isKeystone = true;
                out.masteries = tier.masteries.map(function(m){
                    var o = { id: m.key, key: m.key, name: m.name, iconId: m.iconId, ranks: m.ranks,
                              rankDesc: m.rankDesc, desc: m.rankDesc[m.rankDesc.length - 1] };
                    if (isKs) o.keystone = true;
                    if (m.folder !== base) o.iconVer = m.folder;
                    if (airVer && AIR_ICON_KEYS.indexOf(m.key) >= 0) {
                        o.airIcon = { ver: iconFolder(ctx, airVer, String(m.iconId)), id: m.iconId };
                        ctx.airIcons.push(m.key);
                    }
                    return o;
                });
                return out;
            })
        };
    });
    return {
        system: "keystone", family: ctx.family.id, maxPoints: MAX_POINTS,
        ddragonVersion: base,
        data: { airFiveRankLayout: layout, trees: trees }
    };
}

// The payload of one listed record (or of an unlisted DDragon build for the
// audit: record = {patch, source: {ddragon: build}}).
function payloadFor(record, inputs, sink) {
    var patch = record.patch;
    var ctx = {
        inputs: inputs, record: record, patch: patch, family: familyOf(inputs, patch),
        errors: sink.errors, iconNotes: sink.iconNotes, applied: [],
        usedOverrides: sink.usedOverrides, usedAliases: sink.usedAliases, airIcons: []
    };
    if (!ctx.family) { ctx.errors.push(patch + ": no family"); return null; }
    var system = P.systemOf(patch);
    if (system !== ctx.family.system) ctx.errors.push(patch + ": family " + ctx.family.id + " is " + ctx.family.system + ", patch is " + system);
    var state;
    if (record.source.ddragon) {
        var dd = inputs.dd(record.source.ddragon);
        state = system === "keystone" ? keystoneFromDdragon(dd, ctx) : classicFromDdragon(dd, ctx);
    } else if (record.source.wiki) {
        state = classicFromWiki(inputs.wiki(record.source.wiki), ctx);
    } else { ctx.errors.push(patch + ": no source"); return null; }
    state.patch = patch;
    applyOverrides(state, ctx);
    assignKeys(state, ctx);
    var payload = state.system === "classic" ? classicPayload(state, ctx) : keystonePayload(state, ctx);
    return { payload: payload, state: state, applied: ctx.applied.slice().sort(), airIcons: ctx.airIcons };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function tierOf(index) { return Math.floor((index - 1) / 4) + 1; }

// M1 (classic) / M2 (keystone) structure + family rank totals.
function checkStructure(entry, sink) {
    var pl = entry.payload, p = entry.record.patch, err = function(m){ sink.errors.push(p + ": " + m); };
    if (pl.maxPoints !== MAX_POINTS) err("maxPoints " + pl.maxPoints + " (M1)");
    var totals;
    if (pl.system === "classic") {
        if (pl.data.length !== 3) err(pl.data.length + " trees (M1)");
        totals = pl.data.map(function(tree, ti){
            var seen = {}, sum = 0;
            tree.forEach(function(m, i){
                if (!(m.index >= 1 && m.index <= 24) || m.index !== Math.floor(m.index)) err("tree " + ti + " " + m.key + ": index " + m.index + " (M1)");
                if (seen[m.index]) err("tree " + ti + ": index " + m.index + " twice (M1)");
                seen[m.index] = true;
                if (i > 0 && tree[i - 1].index >= m.index) err("tree " + ti + ": not in grid order at " + m.key + " (M1)");
                if (!(m.ranks >= 1 && m.ranks <= 5)) err(m.key + ": ranks " + m.ranks + " (M1)");
                sum += m.ranks;
                if (m.parent != null) {
                    var par = tree[m.parent];
                    if (!par) err(m.key + ": parent " + m.parent + " does not exist (M1)");
                    else if (tierOf(par.index) >= tierOf(m.index)) err(m.key + ": parent " + par.key + " is not in a lower tier (M1)");
                }
                if (m.rankDesc) {
                    if (m.rankDesc.length !== m.ranks) err(m.key + ": " + m.rankDesc.length + " rank texts for " + m.ranks + " ranks");
                } else {
                    if (typeof m.desc !== "string" || !Array.isArray(m.rankInfo)) err(m.key + ": template missing");
                    var holes = (m.desc.match(/#/g) || []).length;
                    var fill = (m.rankInfo.length ? 1 : 0) + (m.perlevel ? 1 : 0) + (m.rankInfo2 ? 1 : 0);
                    if (m.rankInfo.length && m.rankInfo.length !== m.ranks) err(m.key + ": rankInfo has " + m.rankInfo.length + " values for " + m.ranks + " ranks");
                    if (m.rankInfo2 && m.rankInfo2.length !== m.ranks) err(m.key + ": rankInfo2 length");
                    if (holes !== fill) err(m.key + ": template has " + holes + " '#' for " + fill + " value list(s): " + JSON.stringify(m.desc) + " (M1)");
                }
            });
            return sum;
        });
    } else {
        var d = pl.data, keystoneCount = 0;
        if (d.trees.length !== 3) err(d.trees.length + " trees (M2)");
        if (d.airFiveRankLayout !== P.airFiveRankLayoutOf(p)) err("airFiveRankLayout " + d.airFiveRankLayout + " (M2)");
        totals = d.trees.map(function(tree, ti){
            if (tree.tiers.length !== 6) err(tree.id + ": " + tree.tiers.length + " tiers (M2)");
            var sum = 0;
            tree.tiers.forEach(function(tier, i){
                var pool = 1;
                tier.masteries.forEach(function(m){ pool = Math.max(pool, m.ranks); sum += m.ranks; if (m.id !== m.key) err(tree.id + " " + m.key + ": id != key"); });
                var want = [5, 1, 5, 1, 5, 1][i];
                if (tier.tier !== i + 1) err(tree.id + ": tier " + tier.tier + " at position " + i + " (M2)");
                if (pool !== want) err(tree.id + " tier " + tier.tier + ": pool " + pool + ", expected " + want + " (M2)");
                if (want === 5 && (tier.masteries.length !== 2 || tier.masteries.some(function(m){ return m.ranks !== 5; }))) err(tree.id + " tier " + tier.tier + ": a 5-point row holds two 5-rank masteries (M2)");
                if (want === 1 && tier.masteries.some(function(m){ return m.ranks !== 1; })) err(tree.id + " tier " + tier.tier + ": 1-rank row with a multi-rank mastery (M2)");
                if (i === 5) {
                    if (!tier.isKeystone || tier.masteries.length !== 3 || tier.masteries.some(function(m){ return !m.keystone; })) err(tree.id + ": tier 6 must hold 3 keystones (M2)");
                    keystoneCount += tier.masteries.length;
                } else if (tier.isKeystone || tier.masteries.some(function(m){ return m.keystone; })) err(tree.id + " tier " + tier.tier + ": keystone outside tier 6 (M2)");
                tier.masteries.forEach(function(m){
                    if (m.rankDesc.length !== m.ranks) err(m.key + ": " + m.rankDesc.length + " rank texts for " + m.ranks + " ranks");
                    if (m.desc !== m.rankDesc[m.ranks - 1]) err(m.key + ": desc is not the last rank text");
                });
            });
            // Layout vs the DDragon null cells: "edge" <=> every 5-rank row is [x, null, y].
            var st = entry.state.trees[ti];
            st.tiers.forEach(function(tier, i){
                if ([5, 1, 5, 1, 5, 1][i] !== 5) return;
                var edge = tier.cells.length === 3 && tier.cells[1] === null && tier.cells[0] && tier.cells[2];
                var pair = tier.cells.length === 2 && tier.cells[0] && tier.cells[1];
                if (d.airFiveRankLayout === "edge" ? !edge : !pair) err(tree.id + " tier " + tier.tier + ": DDragon cells " + JSON.stringify(tier.cells) + " disagree with layout " + d.airFiveRankLayout + " (M2)");
            });
            return sum;
        });
        if (keystoneCount !== 9) err(keystoneCount + " keystones (M2)");
    }
    // Family rank totals.
    var fam = entry.family, want = null;
    (fam.rankTotals || []).forEach(function(rt){ if (inRange(p, rt.from, rt.to)) want = rt.trees; });
    if (!want) err("families.json: no rankTotals for " + fam.id + " at this patch (M1/M2)");
    else if (JSON.stringify(want) !== JSON.stringify(totals)) err("rank totals " + JSON.stringify(totals) + ", " + fam.id + " expects " + JSON.stringify(want) + " (M1/M2)");
    entry.rankTotals = totals;
}

// M3: every referenced icon exists (gray_ too in the AIR era).
function iconRefs(entry) {
    var pl = entry.payload, refs = [];
    var air = P.eraOf(entry.record.patch, "masteries") === "air";
    var add = function(folder, file){
        refs.push(FILES.images + "/" + folder + "/" + file + ".png");
        if (air) refs.push(FILES.images + "/" + folder + "/gray_" + file + ".png");
    };
    if (pl.system === "classic") {
        pl.data.forEach(function(t){ t.forEach(function(m){
            var base = (m.iconBase || pl.iconBase).replace(/^images\/masteries\//, "").replace(/\/$/, "");
            add(base, m.icon);
        }); });
    } else {
        pl.data.trees.forEach(function(t){ t.tiers.forEach(function(tier){ tier.masteries.forEach(function(m){
            add(m.iconVer || pl.ddragonVersion, String(m.iconId));
            if (m.airIcon) add(m.airIcon.ver, String(m.airIcon.id));
        }); }); });
    }
    return refs;
}

// M5: S3 numeric cross-check of the templates against a DDragon build.
function numbersOf(s) {
    return (String(s).replace(/<[^>]+>/g, " ").match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

function renderTemplate(m, r) {
    var d = m.desc.replace(/#/, m.rankInfo[r]);
    if (m.perlevel) d = d.replace(/#/, Math.round(m.rankInfo[r] * 180) / 10);
    if (m.rankInfo2) d = d.replace(/#/, m.rankInfo2[r]);
    return d;
}

function s3CrossCheck(state, build, inputs, sink, label) {
    var dd = inputs.dd(build), issues = [];
    // Numbers a later S3 build added to a tooltip (logged noise) may be in
    // DDragon without being in the template (data/patches/noise crossCheck).
    var allowed = (inputs.noise.crossCheck || []).filter(function(a){ return P.compare(P.fromDdragon(build), a.from) >= 0; });
    CLASSIC_TREES.forEach(function(tname, ti){
        var cells = {};
        dd.tree[tname].forEach(function(row, r){ row.forEach(function(c, col){ if (c) cells[r * 4 + col + 1] = c; }); });
        var ours = {};
        state.trees[ti].forEach(function(m){ ours[m.index] = m; });
        Object.keys(cells).forEach(function(ix){ if (!ours[ix]) issues.push(tname + " cell " + ix + ": only in DDragon (" + dd.data[cells[ix].masteryId].name + ")"); });
        state.trees[ti].forEach(function(m){
            var c = cells[m.index], w = tname + " " + m.name;
            if (!c) { issues.push(w + ": cell " + m.index + " empty in DDragon"); return; }
            var d = dd.data[c.masteryId];
            if (d.name !== m.name) issues.push(w + ": name " + JSON.stringify(d.name));
            if (d.ranks !== m.ranks) issues.push(w + ": ranks " + d.ranks + " vs " + m.ranks);
            if (String(m.icon) !== String(c.masteryId)) issues.push(w + ": icon " + m.icon + " vs DDragon id " + c.masteryId);
            var ddParent = null;
            if (c.prereq !== "0") Object.keys(cells).forEach(function(ix){ if (cells[ix].masteryId === c.prereq) ddParent = parseInt(ix, 10); });
            if ((m.parentIndex == null ? null : m.parentIndex) !== ddParent) issues.push(w + ": parent cell " + m.parentIndex + " vs DDragon " + ddParent);
            for (var r = 0; r < m.ranks; r++) {
                var extraOk = [];
                allowed.forEach(function(a){ if (a.mastery === m.name && (a.rank == null || a.rank === r + 1)) extraOk = extraOk.concat(a.extraNumbers); });
                var ddNums = numbersOf(d.description[Math.min(r, d.description.length - 1)]);
                var ourNums = numbersOf(m.rankInfo.length ? renderTemplate(m, r) : m.desc);
                // The level-18 total of a per-level mastery is derived
                // (rankInfo x 18, shown to one decimal); DDragon prints it
                // rounded to a whole number (0.17 x 18 = 3.06: "3.1" vs "3").
                var derived = m.perlevel && m.rankInfo.length ? Math.round(m.rankInfo[r] * 180) / 10 : null;
                // Every number we show is in the client text of that rank ...
                var pool = ddNums.slice();
                ourNums.forEach(function(v){
                    var k = -1;
                    for (var i = 0; i < pool.length; i++) if (Math.abs(pool[i] - v) < 0.011) { k = i; break; }
                    if (k < 0 && derived !== null && v === derived)
                        for (var j = 0; j < pool.length; j++) if (pool[j] === Math.round(m.rankInfo[r] * 18)) { k = j; break; }
                    if (k < 0) issues.push(w + " rank " + (r + 1) + ": " + v + " not in DDragon " + JSON.stringify(ddNums));
                    else pool.splice(k, 1);
                });
                // ... and the client text has no number we do not show (unless logged as noise).
                pool.forEach(function(v){
                    var k = extraOk.indexOf(v);
                    if (k >= 0) return;
                    issues.push(w + " rank " + (r + 1) + ": DDragon number " + v + " missing from the template " + JSON.stringify(ourNums));
                });
            }
        });
    });
    issues.forEach(function(i){ sink.errors.push(label + " vs DDragon " + build + ": " + i + " (M5)"); });
    return issues.length;
}

// M6: spot checks (research spotchecks.json + the repo bugs this rework fixes).
var SPOT = [
    // [patch, tree index | tree id, key, test, note]
    ["V3.14", 0, "martial-mastery", /\+5 Attack Damage/, "V3.14 launch value +5"],
    ["V3.15", 0, "martial-mastery", /\+4 Attack Damage/, "V3.15 Martial Mastery +5 -> +4"],
    ["V3.14", 0, "arcane-mastery", /\+8 Ability Power/, "V3.14 launch value +8"],
    ["V3.15", 0, "arcane-mastery", /\+6 Ability Power/, "V3.15 Arcane Mastery +8 -> +6"],
    ["V3.14", 1, "perseverance", /3% of missing Health/, "V3.14 Perseverance 1/2/3%"],
    ["V3.15", 1, "perseverance", /2% of missing Health/, "V3.15 Perseverance 0.7/1.35/2%"],
    ["V3.15", 1, "perseverance", /Regenerates \.7% missing Health/, "V3.15 Perseverance rank 1 (client text '.7%')"],
    ["V4.2", 1, "perseverance", /1% of missing Health/, "V4.2 Perseverance 0.35/0.675/1%"],
    ["V4.2", 1, "perseverance", /0\.35% of missing Health/, "V4.2 Perseverance rank 1"],
    ["V3.14", 1, "legendary-guardian", function(m){ return m.name === "Tenacious" && m.ranks === 4 && m.index === 18; }, "V3.14 swap: cell 4252 shows 'Tenacious', key legendary-guardian (D4)"],
    ["V3.14", 1, "tenacious", function(m){ return m.name === "Legendary Guardian" && m.ranks === 1 && m.index === 22; }, "V3.14 swap: cell 4262 shows 'Legendary Guardian', key tenacious (D4)"],
    ["V3.15", 1, "legendary-guardian", function(m){ return m.name === "Legendary Guardian" && m.ranks === 4 && m.index === 18; }, "V3.15 swap fixed"],
    ["V3.15", 1, "tenacious", function(m){ return m.name === "Tenacious" && m.index === 22; }, "V3.15 swap fixed"],
    ["V3.14", 1, "runic-blessing", function(m){ return m.name === "Runic Blessing"; }, "mo-001 export fix"],
    ["V3.14", 1, "veterans-scars", function(m){ return m.name === "Veteran's Scars"; }, "mo-002 export fix"],
    ["V3.14", 2, "scout", /15%/, "Scout 15% trinket range (live 3.14.20+, not the pre-release 10%)"],
    ["V4.5", 0, "feast", /restores 3 Health/, "V4.5 Feast 2 -> 3"],
    ["V4.2", 0, "feast", /restores 2 Health/, "Feast before V4.5"],
    ["V5.10", 2, "expanded-mind", function(m){ return m.index === 3 && /\+25 Mana/.test(m.rankDesc[0]) && /\+50 Mana/.test(m.rankDesc[1]) && /\+75 Mana/.test(m.rankDesc[2]); }, "V5.10 Expanded Mind 25/50/75 in T1 c3 (repo s5-final had 20)"],
    ["V5.10", 2, "meditation", function(m){ return m.index === 15; }, "V5.10 Meditation moves to T4 c3"],
    ["V4.20", 2, "meditation", function(m){ return m.index === 3; }, "Meditation in T1 c3 before V5.10"],
    ["V5.10", 2, "bandit", /8 gold for Melee|\+8|8 Gold/i, "V5.10 Bandit melee 8 gold (repo desc said 10)"],
    ["V5.12", 1, "legendary-guardian", function(m){ return m.index === 22 && m.ranks === 1 && /\+3 Armor and Magic Resist for each nearby enemy champion/.test(m.rankDesc[0]); }, "V5.12 Legendary Guardian T6 1-rank +3/+3"],
    ["V5.12", 1, "swiftness", function(m){ return m.index === 3 && m.ranks === 2; }, "V5.12 Swiftness T1, 2 ranks"],
    ["V5.12", 1, "enchanted-armor", function(m){ return tierOf(m.index) === 5 && m.ranks === 4; }, "V5.12 Enchanted Armor T5, 4 ranks"],
    ["V5.12", 1, "adaptive-armor", function(m){ return m.index === 14; }, "V5.12 Adaptive Armor added at T4"],
    ["V5.12", 1, "runic-blessing", null, "V5.12 Runic Blessing removed"],
    ["V3.14", 2, "inspiration", function(m){ return m.ranks === 2; }, "Inspiration has 2 ranks in every 2014 build"],
    ["V5.21", 2, "inspiration", function(m){ return m.ranks === 2; }, "Inspiration 2 ranks"],
    ["V5.22", "ferocity", "deathfire-touch", /take 6 \+ 50% of your Bonus Attack Damage/, "V5.22 Deathfire Touch 6 per DDragon (repo s6-launch had 5)"],
    ["V5.22", "ferocity", "sorcery", function(m){ return m.name === "Sorcery"; }, "mo-004 export fix"],
    ["V5.22", "cunning", "thunderlords-decree", /30 second cooldown/, "V5.22 Thunderlord's 30 s"],
    ["V5.23", "cunning", "thunderlords-decree", /20 second cooldown/, "V5.23 Thunderlord's 30 -> 20 s"],
    ["V5.22", "resolve", "perseverance", /below 20%/, "V5.22 client tooltip said 20% (D3: client mistake kept)"],
    ["V5.23", "resolve", "perseverance", /below 25%/, "V5.23 tooltip corrected to 25%"],
    ["V5.24", "resolve", "bond-of-stone", /\+3% Damage Reduction, increased to 6% while near an allied champion\. 6% of the damage/, "V5.24 Bond of Stone 3% / 6% / 6% redirect"],
    ["V5.24", "resolve", "veterans-scars", function(m){ return /\b9\b/.test(m.rankDesc[0]) && /\b45\b/.test(m.rankDesc[4]); }, "V5.24 Veteran's Scars flat 9-45"],
    ["V6.12", "ferocity", "natural-talent", /\+0\.4 Attack Damage|0\.4/, "V6.12 Natural Talent base + per level"],
    ["V6.22", "ferocity", "fresh-blood", /6 second cooldown|6s|\(6 second/, "V6.22 Fresh Blood 6 s (D6)"],
    ["V6.22", "ferocity", "bounty-hunter", /1\.5% increased damage/, "V6.22 Bounty Hunter 1.5% (repo s7-preseason had 1%)"],
    ["V7.4", "ferocity", "bounty-hunter", /Deal 1% increased damage/, "V7.4 Bounty Hunter back to 1%"],
    ["V6.22", "ferocity", "fervor-of-battle", /basic attacks/, "V6.22 Fervor: basic attacks only"],
    ["V6.22", "cunning", "precision", /1\.7 Lethality/, "V6.22 Precision Lethality 1.7-8.5"],
    ["V6.22", "ferocity", "double-edged-sword", function(m){ return m.iconId === 6142 && !!m.airIcon && m.airIcon.ver; }, "Double-Edged Sword at 6142 with the 5.22.3 AIR art"],
    ["V6.22", "ferocity", "fresh-blood", function(m){ return m.iconId === 6121 && !!m.airIcon; }, "Fresh Blood with the 5.22.3 AIR art"],
    ["V6.24", "resolve", "courage-of-the-colossus", function(m){ return /\+ 5%\s+of your maximum health/.test(m.desc) && /45 - 30 second cooldown/.test(m.desc); }, "V6.24 Courage 7% -> 5%, cd 45-30"],
    ["V7.2", "ferocity", "fresh-blood", function(m){ return !m.airIcon; }, "LCU era: no AIR art override"],
    ["V7.5", "resolve", "bond-of-stone", function(m){ return m.name === "Stoneborn Pact" && m.id === "bond-of-stone"; }, "V7.5 Stoneborn Pact keeps the bond-of-stone key"],
    ["V7.5", "ferocity", "deathfire-touch", /45% bonus/i, "V7.5 Deathfire bonus AD 60% -> 45%"],
    ["V1.0.0.61", 0, "demolisher", function(m){ return m.ranks === 1; }, "Demolisher exists until V1.0.0.61"],
    ["V1.0.0.63", 0, "demolisher", null, "Demolisher removed in V1.0.0.63"],
    ["V1.0.0.128", 0, "demolisher", null, "s1-final had Demolisher (repo bug)"],
    ["V1.0.0.152", 1, "legendary-armor", function(m){ return JSON.stringify(m.rankInfo) === "[2,3.5,5]"; }, "S3 Legendary Armor 2/3.5/5 (repo s3-pbe had the PBE 2/4/6)"],
    ["V1.0.0.152", 2, "scout", /first 5 seconds/, "S3 Scout 5 s (PBE 3 s)"],
    ["V1.0.0.152", 1, "bladed-armor", /true damage/, "S3 Bladed Armor true damage"],
    ["V1.0.0.129", 2, "perseverance", function(m){ return m.index === 18; }, "S2 V1.0.0.129 Perseverance has its own key"],
    ["V1.0.0.131", 2, "strength-of-spirit", function(m){ return m.index === 18; }, "V1.0.0.131 Strength of Spirit in the Perseverance cell"]
];
// Pairs whose payloads must be identical (data-wise).
var SPOT_SAME = [
    ["V7.6", "V7.21", "V7.6-V7.21 no change (DDragon 7.6.1 = 7.21.1)"],
    ["V6.12", "V6.21", "DDragon 6.12.1 = 6.21.1"],
    ["V1.0.0.152", "V3.13", "S3 V1.0.0.152 and V3.13 share the templates"],
    ["V1.0.0.133", "V1.0.0.151", "no change V1.0.0.133 -> V1.0.0.151"],
    ["V4.19", "V4.20", "DDragon 4.19.3 = 4.20.2"]
];

function findMastery(payload, tree, key) {
    var hit = null;
    if (payload.system === "classic") {
        (payload.data[tree] || []).forEach(function(m){ if (m.key === key) hit = m; });
    } else {
        payload.data.trees.forEach(function(t){
            if (t.id !== tree) return;
            t.tiers.forEach(function(tier){ tier.masteries.forEach(function(m){ if (m.key === key) hit = m; }); });
        });
    }
    return hit;
}

function runSpotChecks(byPatch, sink) {
    var n = 0;
    SPOT.forEach(function(s){
        var e = byPatch[P.parse(s[0]).key];
        if (!e) { sink.errors.push("spot check: " + s[0] + " not built"); return; }
        var m = findMastery(e.payload, s[1], s[2]), ok;
        if (s[3] === null) ok = !m;
        else if (!m) ok = false;
        else if (s[3] instanceof RegExp) ok = (m.rankDesc || [m.desc]).concat(m.rankInfo ? [m.desc] : []).some(function(t){ return s[3].test(t); }) || (m.desc && s[3].test(m.desc));
        else ok = !!s[3](m);
        n++;
        if (!ok) sink.errors.push("spot check failed (M6): " + s[0] + " " + s[2] + ": " + s[4]);
    });
    SPOT_SAME.forEach(function(s){
        var a = byPatch[P.parse(s[0]).key], b = byPatch[P.parse(s[1]).key];
        n++;
        if (!a || !b || a.dataHash !== b.dataHash) sink.errors.push("spot check failed (M6): " + s[0] + " / " + s[1] + ": " + s[2]);
    });
    // Notes the research keeps outside the tooltips (DESIGN §1.2) must be in the listing.
    [["V3.15", /900 -> 700/], ["V4.5", /900 -> 1100/], ["V6.22", /9 s/]].forEach(function(s){
        var e = byPatch[P.parse(s[0]).key];
        n++;
        if (!e || !e.record.changes.some(function(c){ return s[1].test(c.text); })) sink.errors.push("spot check failed (M6): " + s[0] + " change notes must mention " + s[1]);
    });
    return n;
}

// Payload with the icon location fields removed (C1/C2 compare data, not art folders).
function stripFields(v, fields) {
    if (Array.isArray(v)) return v.map(function(x){ return stripFields(x, fields); });
    if (v && typeof v === "object") {
        var o = {};
        Object.keys(v).forEach(function(k){ if (fields.indexOf(k) < 0) o[k] = stripFields(v[k], fields); });
        return o;
    }
    return v;
}

// ---------------------------------------------------------------------------
// Legacy codecs (DESIGN §1.6, §4.4)
// ---------------------------------------------------------------------------

function buildCodecs(inputs, byId, sink) {
    var fixtures = inputs.codecs.datasets;
    var aliases = inputs.aliases.masteries;
    var regs = [], report = {};
    var codecIds = Object.keys(fixtures);
    codecIds.forEach(function(codecId){
        var fx = fixtures[codecId];
        var aliasIds = Object.keys(aliases).filter(function(a){ return aliases[a].codec === codecId; });
        if (!aliasIds.length) { sink.errors.push("legacy codec " + codecId + ": no alias uses it"); return; }
        var target = aliases[aliasIds[0]].to;
        var entry = byId[target];
        if (!entry) { sink.errors.push("legacy codec " + codecId + ": target " + target + " is not built"); return; }
        var pl = entry.payload, w = "legacy codec " + codecId + " -> " + target;
        if (fx.system !== pl.system) { sink.errors.push(w + ": system " + fx.system + " vs " + pl.system); return; }
        if (entry.family.legacy.indexOf(codecId) < 0) sink.errors.push(w + ": family " + entry.family.id + " does not list it");
        var dropped = [], renamed = [];
        if (fx.system === "classic") {
            var trees = fx.trees.map(function(tree, ti){
                var canon = pl.data[ti];
                return tree.map(function(m){
                    var c = matchCanonical(canon, m);
                    var o = { key: c ? c.key : m.key, ranks: m.ranks };
                    if (m.hashRanks != null) o.hashRanks = m.hashRanks;
                    if (m.hashNote) o.hashNote = m.hashNote;
                    if (!c) {
                        var removedIn = removedPatchOf(inputs, entry, ti, m.key);
                        if (!removedIn) sink.errors.push(w + ": " + m.key + " (tree " + ti + ") has no canonical mastery");
                        o.dropNote = m.name + " was removed in " + removedIn;
                        dropped.push(m.key);
                    } else {
                        if (c.key !== m.key) renamed.push(m.key + " -> " + c.key);
                        if (c.ranks !== m.ranks) sink.codecNotes.push(w + ": " + m.key + " ranks " + m.ranks + " -> " + c.ranks + " (clamped on import)");
                    }
                    return o;
                });
            });
            regs.push({ kind: "masteries-legacy", key: codecId, payload: { system: "classic", family: entry.family.id, to: target, trees: trees } });
        } else {
            var ktrees = fx.trees.map(function(t, ti){
                var canonTree = null;
                pl.data.trees.forEach(function(ct){ if (ct.id === t.id) canonTree = ct; });
                if (!canonTree) { sink.errors.push(w + ": tree " + t.id + " missing"); return { id: t.id, tiers: [] }; }
                var flat = [];
                canonTree.tiers.forEach(function(tier){ tier.masteries.forEach(function(m){ flat.push(m); }); });
                return {
                    id: t.id,
                    tiers: t.tiers.map(function(keys){
                        return keys.map(function(k){
                            var lm = t.masteries[k];
                            var c = matchCanonical(flat, { key: k, name: lm && lm.name });
                            if (!c) { sink.errors.push(w + ": " + t.id + "/" + k + " has no canonical mastery"); return k; }
                            if (c.key !== k) renamed.push(k + " -> " + c.key);
                            return c.key;
                        });
                    })
                };
            });
            regs.push({ kind: "masteries-legacy", key: codecId, payload: { system: "keystone", family: entry.family.id, to: target, trees: ktrees } });
        }
        report[codecId] = { to: target, dropped: dropped, renamed: renamed };
    });
    Object.keys(aliases).forEach(function(a){
        if (!fixtures[aliases[a].codec]) sink.errors.push("alias " + a + ": codec " + aliases[a].codec + " is not in " + FILES.codecs);
        if (!byId[aliases[a].to]) sink.errors.push("alias " + a + ": target " + aliases[a].to + " is not built");
    });
    var plain = inputs.aliases.plain && inputs.aliases.plain.masteries;
    if (plain && (!byId[plain.to] || !fixtures[plain.codec])) sink.errors.push("plain mastery codes: " + JSON.stringify(plain) + " does not resolve");
    return { registrations: regs, report: report };
}

// Canonical mastery for a legacy codec entry: same key, else same name slug.
function matchCanonical(list, legacy) {
    var hit = null;
    list.forEach(function(m){ if (m.key === legacy.key) hit = m; });
    if (!hit && legacy.name) list.forEach(function(m){ if (slug(m.name) === slug(legacy.name)) hit = m; });
    if (!hit) list.forEach(function(m){ if (slug(m.name) === legacy.key) hit = m; });
    return hit;
}

// The first listed patch of the family (up to the target) whose tree lacks
// the key, after one that had it.
function removedPatchOf(inputs, entry, ti, key) {
    var had = false, found = null;
    inputs.built.forEach(function(e){
        if (found || e.family.id !== entry.family.id || P.compare(e.record.patch, entry.record.patch) > 0) return;
        var has = !!findMastery(e.payload, ti, key);
        if (has) had = true;
        else if (had) found = P.parse(e.record.patch).label;
    });
    return found;
}

// ---------------------------------------------------------------------------
// C3 audit: unlisted DDragon patches vs the listed patch in effect
// ---------------------------------------------------------------------------

function diffPayloads(a, b, where, out) {
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { out.push({ path: where, a: a, b: b }); return; }
        for (var i = 0; i < a.length; i++) diffPayloads(a[i], b[i], where + "[" + i + "]", out);
        return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
        var keys = {};
        Object.keys(a).concat(Object.keys(b)).forEach(function(k){ keys[k] = true; });
        Object.keys(keys).sort().forEach(function(k){ diffPayloads(a[k], b[k], where + "." + k, out); });
        return;
    }
    if (a !== b) out.push({ path: where, a: a, b: b });
}

function masteryAtPath(payload, p) {
    var m;
    if (payload.system === "classic") {
        m = /^\.data\[(\d+)\]\[(\d+)\]\.(\w+)(?:\[(\d+)\])?$/.exec(p);
        if (!m) return null;
        return { mastery: payload.data[+m[1]][+m[2]], field: m[3], rank: m[4] != null ? +m[4] + 1 : null };
    }
    m = /^\.data\.trees\[(\d+)\]\.tiers\[(\d+)\]\.masteries\[(\d+)\]\.(\w+)(?:\[(\d+)\])?$/.exec(p);
    if (!m) return null;
    return { mastery: payload.data.trees[+m[1]].tiers[+m[2]].masteries[+m[3]], field: m[4], rank: m[5] != null ? +m[5] + 1 : null };
}

function audit(rawDir, inputs, built, sink) {
    var dir = path.join(path.resolve(rawDir), "mastery");
    var names = fs.readdirSync(dir).filter(function(n){ return /^mastery-[\d.]+\.json$/.test(n); });
    var lastBuild = {};
    names.forEach(function(n){
        var b = n.replace(/^mastery-|\.json$/g, "");
        var p = P.fromDdragon(b);
        if (P.compare(p, "V3.6") < 0 || P.compare(p, "V7.21") > 0) return;
        if (!lastBuild[p.key] || P.compareBuild(b, lastBuild[p.key]) > 0) lastBuild[p.key] = b;
    });
    var listedKeys = {};
    built.forEach(function(e){ listedKeys[P.parse(e.record.patch).key] = e; });
    var rawDd = {};
    var stats = { patches: 0, identical: 0, noiseOnly: 0, s3: 0, failures: 0 };
    var noise = inputs.noise.ddragon || [];
    Object.keys(lastBuild).sort(P.compare).forEach(function(pk){
        var build = lastBuild[pk];
        var patch = P.fromDdragon(build).name;
        var raw = P.readJson(path.join(dir, "mastery-" + build + ".json"));
        rawDd[build] = raw;
        var inEffect = null;
        built.forEach(function(e){ if (P.compare(e.record.patch, patch) <= 0) inEffect = e; });
        if (!inEffect) return;
        // S3 era: templates; audit = the numeric cross-check against this build.
        if (P.seasonOf(patch) === "s3") {
            var tmp = loadInputs({ rawDd: rawDd });
            tmp.noise = inputs.noise;
            stats.s3++;
            stats.failures += s3CrossCheck(inEffect.state, build, tmp, sink, "audit " + patch);
            return;
        }
        if (listedKeys[pk]) {                  // listed: built already; its build must be the patch's last
            var src = listedKeys[pk].record.source.ddragon;
            if (src && src !== build) { sink.errors.push("audit " + patch + ": listed with DDragon " + src + ", the cache's last build is " + build); stats.failures++; }
            return;
        }
        stats.patches++;
        var aInputs = loadInputs({ rawDd: rawDd });
        var local = { errors: [], iconNotes: [], usedOverrides: {}, usedAliases: {} };
        var res = payloadFor({ patch: patch, source: { ddragon: build }, changes: [] }, aInputs, local);
        local.errors.forEach(function(e){ sink.errors.push("audit " + patch + " (" + build + "): " + e); stats.failures++; });
        if (!res) return;
        var diffs = [];
        diffPayloads(stripFields(inEffect.payload, ICON_FIELDS), stripFields(res.payload, ICON_FIELDS), "", diffs);
        if (!diffs.length) { stats.identical++; return; }
        var bad = 0;
        diffs.forEach(function(d){
            var at = masteryAtPath(res.payload, d.path);
            var okText = at && TEXT_FIELDS.indexOf(at.field) >= 0;
            if (okText && at.field === "desc") return;  // keystone desc = last rank text, checked via rankDesc
            var hit = okText && noise.some(function(n){
                return P.compare(n.patch, inEffect.record.patch) > 0 && P.compare(n.patch, patch) <= 0
                    && (n.mastery === at.mastery.name || slug(n.mastery) === at.mastery.key)
                    && (n.rank == null || n.rank === at.rank) && normalizeSpace(n["new"]) === d.b;
            });
            if (!hit) {
                bad++;
                sink.errors.push("audit (C3) " + patch + " (" + build + ") vs listed " + inEffect.record.patch + ": " + d.path
                    + (at ? " [" + at.mastery.key + "]" : "") + " " + JSON.stringify(d.a) + " -> " + JSON.stringify(d.b) + " is not logged noise");
            }
        });
        if (bad) stats.failures += bad; else stats.noiseOnly++;
    });
    return stats;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build(opts) {
    opts = opts || {};
    var inputs = loadInputs({ iconMapFile: opts.iconMap });
    var sink = { errors: [], warnings: [], iconNotes: [], codecNotes: [], usedOverrides: {}, usedAliases: {} };

    // Listing sanity.
    var listing = inputs.listing;
    var counts = {};
    listing.forEach(function(r, i){
        counts[r.season] = (counts[r.season] || 0) + 1;
        if (P.seasonOf(r.patch) !== r.season) sink.errors.push(r.patch + ": season " + r.season + " but seasonOf says " + P.seasonOf(r.patch));
        if (i > 0 && P.compare(listing[i - 1].patch, r.patch) >= 0) sink.errors.push(r.patch + ": listing not in chronological order");
    });
    P.seasons().forEach(function(s){
        var pg = s.pages && s.pages.masteries;
        if (!pg) return;
        if (counts[s.key] !== pg.count) sink.errors.push("season " + s.key + ": " + counts[s.key] + " listed patches, seasons.json/DESIGN §0 says " + pg.count);
        var inSeason = listing.filter(function(r){ return r.season === s.key; });
        if (inSeason.length && (!P.equal(inSeason[0].patch, pg.first) || !P.equal(inSeason[inSeason.length - 1].patch, pg.last)))
            sink.errors.push("season " + s.key + ": listed " + inSeason[0].patch + ".." + inSeason[inSeason.length - 1].patch + ", seasons.json says " + pg.first + ".." + pg.last);
    });
    if (listing.length !== 42) sink.errors.push(listing.length + " listed masteries patches, DESIGN §0 says 42");

    // Payloads.
    var built = [];
    inputs.built = built;
    listing.forEach(function(r){
        var res = payloadFor(r, inputs, sink);
        if (!res) return;
        var e = {
            record: r, id: P.idFor("masteries", r.patch), family: familyOf(inputs, r.patch),
            payload: res.payload, state: res.state, applied: res.applied, airIcons: res.airIcons,
            hash: P.contentHash(res.payload),
            dataHash: P.contentHash(stripFields(res.payload, ICON_FIELDS)),
            textlessHash: P.contentHash(stripFields(res.payload, ICON_FIELDS.concat(TEXT_FIELDS, ["name"])))
        };
        built.push(e);
    });
    var byId = {}, byPatch = {};
    built.forEach(function(e){ byId[e.id] = e; byPatch[P.parse(e.record.patch).key] = e; });
    // airIcon (DESIGN §3.5): every AIR patch with an AIR art version carries it on all AIR_ICON_KEYS.
    built.forEach(function(e){
        var want = e.payload.system === "keystone" && P.eraOf(e.record.patch, "masteries") === "air" && P.airIconVersionOf(e.record.patch);
        var got = e.airIcons.slice().sort().join(",");
        if (want && got !== AIR_ICON_KEYS.slice().sort().join(",")) sink.errors.push(e.record.patch + ": airIcon on [" + got + "], expected " + AIR_ICON_KEYS.join(", "));
        if (!want && got) sink.errors.push(e.record.patch + ": airIcon outside V6.22-V6.24 AIR");
    });
    // Season and page defaults (seasons.json) name built datasets.
    P.seasons().forEach(function(s){
        var d = P.seasonDefault(s.key, "masteries");
        if (d && !byId[d]) sink.errors.push("seasons.json " + s.key + " masteries default " + d + " is not a listed patch");
    });
    if (!byId[P.pageDefault("masteries")]) sink.errors.push("seasons.json masteries page default " + P.pageDefault("masteries") + " is not a listed patch");

    // Unused overrides / aliases (M4).
    inputs.overrides.forEach(function(o){
        if (!sink.usedOverrides[o.id]) sink.errors.push("override " + o.id + " was not applied to any listed patch (M4)");
        if (["export-fix", "wiki-fact", "correction"].indexOf(o.kind) < 0) sink.errors.push("override " + o.id + ": unknown kind " + o.kind);
        if (o.page !== "masteries") sink.errors.push("override " + o.id + ": page " + o.page);
        if (!o.sources || !o.sources.length || !o.reason) sink.errors.push("override " + o.id + ": reason and sources are required");
    });
    var ids = {};
    inputs.overrides.forEach(function(o){ if (ids[o.id]) sink.errors.push("override id " + o.id + " twice"); ids[o.id] = true; });
    (inputs.families.aliases || []).forEach(function(a, i){
        if (!sink.usedAliases[i]) sink.errors.push("families.json alias " + a.name + " -> " + a.key + " matched nothing (stale alias)");
    });
    // Each alias must match in EVERY listed patch of its range.
    (inputs.families.aliases || []).forEach(function(a){
        built.forEach(function(e){
            if (e.family.id !== a.family || !inRange(e.record.patch, a.from, a.to)) return;
            var hit = false;
            eachMastery(e.state, function(m){ if ((!a.cell || m.cell === a.cell) && m.key === a.key && (m.rawName === a.name || m.name === a.name)) hit = true; });
            if (!hit) sink.errors.push(e.record.patch + ": alias " + a.name + " -> " + a.key + " matches nothing (stale alias)");
        });
    });

    // Families cover the listing.
    var famIds = {};
    inputs.families.families.forEach(function(f){ famIds[f.id] = 0; });
    built.forEach(function(e){ famIds[e.family.id]++; });
    Object.keys(famIds).forEach(function(f){ if (!famIds[f]) sink.errors.push("family " + f + " has no listed patch"); });

    // M1 / M2.
    built.forEach(function(e){ checkStructure(e, sink); });

    // M5.
    var m5 = 0;
    built.forEach(function(e){
        var cc = e.record.source.crossCheck;
        if (!cc) return;
        cc.forEach(function(b){ m5 += s3CrossCheck(e.state, b, inputs, sink, e.record.patch); });
    });

    // C1 / C2 (on data hashes; icon folders are not a change).
    built.forEach(function(e, i){
        if (i === 0) return;
        var prev = built[i - 1], r = e.record;
        var changedData = e.dataHash !== prev.dataHash;
        if (/change/.test(r.reason)) {
            if (!changedData) sink.errors.push(r.patch + ": reason " + r.reason + " but the data equals " + prev.record.patch + " (C1)");
        } else if (r.textOnly) {
            if (!changedData) sink.errors.push(r.patch + ": textOnly but the data equals " + prev.record.patch + " (C2)");
            else if (e.textlessHash !== prev.textlessHash) sink.errors.push(r.patch + ": textOnly but more than tooltip text differs from " + prev.record.patch + " (C2)");
        } else if (changedData) sink.errors.push(r.patch + ": " + r.reason + " without a change, but the data differs from " + prev.record.patch + " (C2)");
    });

    // M6.
    var spotCount = runSpotChecks(byPatch, sink);

    // Shared files (DESIGN §1.1.4): later identical payloads point at the earlier file.
    var fileOf = {}, files = [];
    built.forEach(function(e){
        if (!fileOf[e.hash]) {
            fileOf[e.hash] = { key: e.id, file: FILES.outDir + "/" + e.id + ".js", entries: [], source: sourceLine(e) };
            files.push(fileOf[e.hash]);
        }
        var f = fileOf[e.hash];
        f.entries.push(e);
        e.dataKey = f.key;
        e.file = f.file;
    });

    // M3.
    var missing = {}, refsTotal = 0;
    built.forEach(function(e){
        iconRefs(e).forEach(function(r){
            refsTotal++;
            if (!exists(r)) (missing[r] = missing[r] || []).push(e.record.patch);
        });
    });
    var missingList = Object.keys(missing).sort();
    var missingPatches = {};
    missingList.forEach(function(r){ missing[r].forEach(function(p){ missingPatches[p] = (missingPatches[p] || 0) + 1; }); });
    var iconsStrict = !!inputs.iconMap || opts.strictIcons;
    if (missingList.length) {
        var msg = missingList.length + " referenced icon file(s) missing (M3) in " + Object.keys(missingPatches).length + " patch(es): "
            + Object.keys(missingPatches).sort(P.compare).map(function(p){ return p + " (" + missingPatches[p] + ")"; }).join(", ");
        if (iconsStrict) { sink.errors.push(msg); missingList.slice(0, 40).forEach(function(r){ sink.errors.push("  missing " + r + " (" + missing[r].join(", ") + ")"); }); }
        else sink.warnings.push(msg + " — pending T3 (no " + FILES.iconMap + "; dataset version folder fallback)");
    }

    // Legacy codecs.
    var codecs = buildCodecs(inputs, byId, sink);

    // Audit (C3).
    var auditStats = null;
    if (opts.audit) auditStats = audit(opts.audit, inputs, built, sink);

    return {
        inputs: inputs, built: built, files: files, codecs: codecs, sink: sink,
        stats: {
            listed: built.length, files: files.length, counts: counts, m5: m5, spot: spotCount,
            icons: { refs: refsTotal, missing: missingList.length, missingPatches: missingPatches, strict: iconsStrict, map: !!inputs.iconMap },
            audit: auditStats
        }
    };
}

function sourceLine(e) {
    var s = e.record.source;
    if (s.ddragon) return "DDragon " + s.ddragon + " mastery.json";
    var t = "wiki-era snapshot data/sources/masteries/wiki/" + P.parse(s.wiki).name + ".json";
    if (s.crossCheck) t += ", numbers checked against DDragon " + s.crossCheck.join(" and ");
    return t;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function renderAll(result) {
    var outputs = {};
    result.files.forEach(function(f){
        var overrides = [];
        f.entries.forEach(function(e){ e.applied.forEach(function(id){ if (overrides.indexOf(id) < 0) overrides.push(id); }); });
        overrides.sort();
        outputs[f.file] = P.renderGenerated({
            generator: GENERATOR, source: f.source, overrides: overrides,
            patches: f.entries.map(function(e){ return e.record.patch; }),
            kind: "masteries", key: f.key, payload: f.entries[0].payload
        });
    });
    var codecFile = FILES.outDir + "/legacy-codecs.js";
    outputs[codecFile] = P.renderGenerated({
        generator: GENERATOR,
        source: "tools/fixtures/legacy-codecs.json (codecs of the pre-rework mastery datasets, captured at " + String(result.inputs.codecs.about.baseline.commit).slice(0, 7) + ")",
        overrides: [],
        note: ["Legacy share-code layouts: array order = old code order; keys mapped to the canonical keys of the alias target (data/patches/aliases.json).",
               "Loaded only when a legacy mastery id (s1-final ... s7-final, or a plain code) is opened."],
        registrations: result.codecs.registrations
    });
    var manifest = {};
    result.built.forEach(function(e){ manifest[e.id] = { data: e.dataKey, file: e.file, hash: e.hash }; });
    outputs[FILES.outDir + "/manifest.json"] = JSON.stringify(manifest, null, 2) + "\n";
    return outputs;
}

function writeOutputs(outputs, check) {
    var changed = [], stale = [];
    Object.keys(outputs).sort().forEach(function(rel){
        var file = abs(rel), text = outputs[rel], old = null;
        try { old = fs.readFileSync(file, "utf8").split("\r\n").join("\n"); } catch (e) { /* new */ }
        if (old === text) return;
        changed.push(rel);
        if (!check) P.writeIfChanged(file, text);
    });
    // Stale generated files (ours only: they start with the GENERATED header).
    var dir = abs(FILES.outDir);
    var names = [];
    try { names = fs.readdirSync(dir); } catch (e) { /* none */ }
    names.forEach(function(n){
        var rel = FILES.outDir + "/" + n;
        if (outputs[rel] || !/\.js$/.test(n)) return;
        var head = fs.readFileSync(path.join(dir, n), "utf8").slice(0, 80);
        if (head.indexOf("// GENERATED by " + GENERATOR) !== 0) return;
        stale.push(rel);
        if (!check) fs.unlinkSync(path.join(dir, n));
    });
    return { changed: changed, stale: stale };
}

function main() {
    var argv = process.argv.slice(2), opts = { check: false, audit: null, strictIcons: false, quiet: false };
    for (var i = 0; i < argv.length; i++) {
        var a = argv[i];
        if (a === "--check") opts.check = true;
        else if (a === "--audit") opts.audit = argv[++i];
        else if (a === "--strict-icons") opts.strictIcons = true;
        else if (a === "--quiet") opts.quiet = true;
        else if (a === "--icon-map") opts.iconMap = argv[++i];
        else if (a === "-h" || a === "--help") { process.stdout.write("usage: node tools/build-masteries.js [--check] [--audit <raw cache>] [--strict-icons] [--icon-map <file>] [--quiet]\n"); return 0; }
        else { process.stderr.write("build-masteries: unknown argument " + a + "\n"); return 2; }
    }
    var result = build(opts);
    var s = result.sink, st = result.stats;
    var say = function(t){ if (!opts.quiet) process.stdout.write(t + "\n"); };
    if (s.errors.length) {
        s.errors.forEach(function(e){ process.stderr.write("ERROR " + e + "\n"); });
        process.stderr.write("build-masteries: " + s.errors.length + " error(s); nothing written\n");
        return 1;
    }
    var outputs = renderAll(result);
    var w = writeOutputs(outputs, opts.check);
    var bytes = 0;
    Object.keys(outputs).forEach(function(k){ if (/\.js$/.test(k)) bytes += Buffer.byteLength(outputs[k], "utf8"); });
    say("masteries: " + st.listed + " listed patches -> " + st.files + " data files + legacy-codecs.js (" + Math.round(bytes / 1024) + " KB), manifest.json");
    say("  per season: " + P.seasons().filter(function(x){ return st.counts[x.key]; }).map(function(x){ return x.key + " " + st.counts[x.key]; }).join(", "));
    say("  M1/M2 structure ok; M4 " + result.inputs.overrides.length + " overrides applied, none stale; M5 S3 cross-check ok; M6 " + st.spot + " spot checks ok; C1/C2 ok");
    say("  legacy codecs: " + Object.keys(result.codecs.report).map(function(k){
        var r = result.codecs.report[k];
        return k + " -> " + r.to + (r.dropped.length ? " (drops " + r.dropped.join(", ") + ")" : "") + (r.renamed.length ? " (renames " + r.renamed.join(", ") + ")" : "");
    }).join("; "));
    say("  M3 icons: " + st.icons.refs + " references, " + st.icons.missing + " missing" + (st.icons.map ? " (icon-map.json present)" : " (no icon-map.json yet: dataset version folder fallback)"));
    if (st.audit) say("  C3 audit: " + st.audit.patches + " unlisted DDragon patches (" + st.audit.identical + " identical, " + st.audit.noiseOnly + " noise only), " + st.audit.s3 + " S3 builds cross-checked");
    s.warnings.forEach(function(x){ say("  WARNING " + x); });
    s.codecNotes.forEach(function(x){ say("  note " + x); });
    if (s.iconNotes.length) say("  note " + s.iconNotes.length + " icon-map lookups fell back to the build folder");
    if (opts.check) {
        if (w.changed.length || w.stale.length) {
            process.stderr.write("build-masteries --check: out of date: " + w.changed.concat(w.stale.map(function(x){ return x + " (stale)"; })).join(", ") + "\n");
            return 1;
        }
        say("  --check: data/masteries is up to date");
    } else {
        say("  " + w.changed.length + " file(s) written" + (w.stale.length ? ", " + w.stale.length + " stale removed" : "") + (w.changed.length ? ": " + w.changed.join(", ") : ""));
    }
    return 0;
}

module.exports = {
    build: build, payloadFor: payloadFor, loadInputs: loadInputs, renderAll: renderAll,
    slug: slug, stripFields: stripFields, ICON_FIELDS: ICON_FIELDS, FILES: FILES
};

if (require.main === module) {
    var code;
    try { code = main(); }
    catch (e) { process.stderr.write("build-masteries: " + (e && e.stack || e) + "\n"); code = 1; }
    process.exitCode = code;
}
