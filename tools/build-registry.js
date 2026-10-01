#!/usr/bin/env node
// tools/build-registry.js — writes patch-registry.js (DESIGN §1.5, §2.2), the
// generated file every page loads first. It defines:
//   LOL_REGISTRY      {generator, hash, codecs, live, sources}: what it was built from
//   SEASON_NAV        [{key, label, masteries?, runes?, reforged?}]: the season
//                     dropdown, each page's default id per season (§3.4)
//   LOL_PAGE_DEFAULT  {masteries, runes, reforged}: the id an empty hash opens
//   LOL_PATCHES       {page: [entry, …]}, chronological (§3.2)
//   LOL_ALIASES       {masteries, runes, reforged, plain}: the legacy ids (§4.2)
// Runs last in the build (after the three data builders). Deterministic and
// offline: it reads committed files only.
//
// Usage
//   node tools/build-registry.js [--root <site>] [--out <file>] [--strict] [--stub] [--check] [--quiet]
//
//   --root <site>  the site the paths are relative to (default: the repo).
//                  Inputs below are read from it, `file` paths in the output
//                  are relative to it, and it is where they must exist.
//   --out <file>   default <root>/patch-registry.js
//   --strict       fail when a listing or a manifest is missing (the final
//                  build: tools/build-all.js passes it)
//   --stub         always use the stub listings, even where a real one exists
//   --check        write nothing; exit 1 when the output would change
//
// Inputs (relative to --root)
//   data/patches/seasons.json, data/patches/aliases.json (task P0-B)
//   data/patches/<page>.json        listing, one record per listed patch (§1.4):
//                                   {patch, label?, tag?, season?, reason, date,
//                                    source: {ddragon: "4.5.4"} | {wiki: "V1.0.0.63"},
//                                    changes[], confidence, ddragonVersion?, registry?}
//                                   The file is an array of records, or an object
//                                   whose `patches` (or `entries` / `records`)
//                                   array holds them. `registry` (optional object)
//                                   is merged into the entry as is.
//                                   Missing -> tools/fixtures/stub-<page>.json
//                                   (a warning; an error with --strict).
//   data/<page>/manifest.json       {"<id>": {data, file, hash?, ddragonVersion?}},
//                                   or the same map under `entries`. `file` is
//                                   relative to the site root (a bare file name
//                                   is taken as next to the manifest); the file
//                                   must exist and contain
//                                   LolData.register("<page>", "<data>". Reforged
//                                   ids absent from the manifest have no extras
//                                   (data: null). Missing manifest -> masteries /
//                                   runes entries get file: null (LolData.load
//                                   rejects: "not built yet"), Reforged entries
//                                   data: null (warning; error with --strict).
//   data/masteries/legacy-codecs.js LOL_REGISTRY.codecs when it exists, else null
//
// Entry fields (in this order; absent ones are left out):
//   id, season, patch, label, date, reason, confidence,
//   era, airPeriod, system, look, airFiveRankLayout, airIconVersion,   (masteries)
//   era, airPeriod, combiner, quintHalo, slots, iconBasePath, parchmentImage, (runes)
//   era, shardEra,                                                      (reforged)
//   ddragonVersion, data, file
// Chrome fields come from tools/lib/patches.js chromeOf(); the label from
// labelFor(). Checks (any failure exits 1): every patch parses and lies in the
// season it claims; an `id` or chrome field a record repeats (e.g. shardEra)
// agrees with them; no duplicates; per page and season the first / last listed
// patch and the count equal seasons.json; every season default, page default
// and alias target is listed; ids and labels are unique; manifest files exist
// and register their key.
"use strict";

const fs = require("fs");
const path = require("path");
const P = require("./lib/patches.js");

const REPO = path.resolve(__dirname, "..");
const GENERATOR = "tools/build-registry.js";
const EM_DASH = String.fromCharCode(0x2014);
const RUNE_DEFAULTS = {   // what every runes-data.js dataset carries today
    slots: { mark: 9, seal: 9, glyph: 9, quintessence: 3 },
    iconBasePath: "images/runes/",
    parchmentImage: "images/runes/summoners_runes_bg.jpg"
};
const ENTRY_ORDER = ["id", "season", "patch", "label", "date", "reason", "confidence",
    "era", "airPeriod", "system", "look", "airFiveRankLayout", "airIconVersion",
    "combiner", "quintHalo", "shardEra", "slots", "iconBasePath", "parchmentImage",
    "ddragonVersion", "data", "file"];

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!/^--/.test(a)) throw new Error("unexpected argument " + a);
        const k = a.slice(2);
        if (["strict", "stub", "check", "quiet"].indexOf(k) >= 0) out[k] = true;
        else if (["root", "out"].indexOf(k) >= 0) {
            if (i + 1 >= argv.length) throw new Error(a + " needs a value");
            out[k] = argv[++i];
        } else throw new Error("unknown option " + a);
    }
    return out;
}

function rel(root, file) { return path.relative(root, file).split(path.sep).join("/"); }

function readJsonFile(file) {
    const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
    try { return JSON.parse(text); } catch (e) { throw new Error("invalid JSON in " + file + ": " + e.message); }
}

function recordsOf(json, file) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") {
        for (const k of ["patches", "entries", "records"]) if (Array.isArray(json[k])) return json[k];
    }
    throw new Error(file + ": no record array (expected an array, or {patches: [...]})");
}

function manifestMap(json, file) {
    const m = json && typeof json === "object" && json.entries && typeof json.entries === "object" && !Array.isArray(json.entries) ? json.entries : json;
    if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error(file + ": expected an object {id: {data, file}}");
    const out = {};
    Object.keys(m).forEach(function(k){ if (!/^_/.test(k) && k !== "entries") out[k] = m[k]; });
    return out;
}

function ordered(e) {
    const out = {};
    ENTRY_ORDER.forEach(function(k){ if (e[k] !== undefined) out[k] = e[k]; });
    Object.keys(e).forEach(function(k){ if (out[k] === undefined && e[k] !== undefined) out[k] = e[k]; });
    return out;
}

// One record per line inside arrays of records; everything else compact.
function js(v) { return P.formatJson(v, { width: 0 }); }
function jsList(list, indent) {
    if (!list.length) return "[]";
    return "[\n" + list.map(function(x){ return indent + "  " + js(x); }).join(",\n") + "\n" + indent + "]";
}

function build(opts) {
    const root = path.resolve(opts.root || REPO);
    const warnings = [], errors = [];
    const warn = m => warnings.push(m), err = m => errors.push(m);

    // seasons + aliases of this root (patches.js defaults to the repo's)
    const seasonsFile = path.join(root, "data", "patches", "seasons.json");
    const aliasesFile = path.join(root, "data", "patches", "aliases.json");
    P.useSeasons(readJsonFile(seasonsFile));
    P.useAliases(readJsonFile(aliasesFile));
    const seasonsData = readJsonFile(seasonsFile);
    const aliases = P.aliases();

    const sources = {}, patches = {};
    P.PAGES.forEach(function(page){
        // ---- listing
        const real = path.join(root, "data", "patches", page + ".json");
        const stub = path.join(root, "tools", "fixtures", "stub-" + page + ".json");
        let listingFile = real, isStub = false;
        if (opts.stub || !fs.existsSync(real)) {
            if (!opts.stub) (opts.strict ? err : warn)(page + ": no " + rel(root, real) + "; using the stub listing " + rel(root, stub));
            listingFile = stub;
            isStub = true;
        }
        if (!fs.existsSync(listingFile)) { err(page + ": no listing (" + rel(root, listingFile) + ")"); patches[page] = []; return; }
        const json = readJsonFile(listingFile);
        const records = recordsOf(json, rel(root, listingFile));

        // ---- manifest
        const manFile = path.join(root, "data", page, "manifest.json");
        let manifest = null;
        if (fs.existsSync(manFile)) manifest = manifestMap(readJsonFile(manFile), rel(root, manFile));
        else (opts.strict ? err : warn)(page + ": no " + rel(root, manFile) + "; " +
            (page === "reforged" ? "entries get data: null (no extras)" : "entries get file: null (data not built yet)"));
        sources[page] = { listing: rel(root, listingFile), stub: isStub || !!(json && json.stub), manifest: manifest ? rel(root, manFile) : null };

        // ---- entries
        const seen = [];
        const list = [];
        records.forEach(function(rec, i){
            const where = rel(root, listingFile) + " #" + i + (rec && rec.patch ? " (" + rec.patch + ")" : "");
            const p = rec && typeof rec.patch === "string" ? P.tryParse(rec.patch) : null;
            if (!p) { err(where + ": not a patch"); return; }
            const season = P.seasonOf(p);
            if (!season) { err(where + ": outside every season"); return; }
            // `season` may be the key ("s3") or the label ("Season 3"); it must agree with §3.1
            const sd = P.season(season);
            if (rec.season && rec.season !== season && rec.season !== sd.label && rec.season !== sd.label.replace(/\s*\(.*\)$/, ""))
                err(where + ": season " + JSON.stringify(rec.season) + " but the patch is in " + season);
            if (seen.some(q => P.equal(q, p))) { err(where + ": listed twice"); return; }
            seen.push(p);
            let chrome;
            try { chrome = P.chromeOf(page, p); } catch (e) { err(where + ": " + e.message); return; }
            const id = P.idFor(page, p);
            // fields a listing may repeat must agree with the shared rules
            if (rec.id !== undefined && rec.id !== id) err(where + ": id " + JSON.stringify(rec.id) + ", the patch's id is " + id);
            Object.keys(chrome).forEach(function(k){
                if (rec[k] !== undefined && JSON.stringify(rec[k]) !== JSON.stringify(chrome[k]))
                    err(where + ": " + k + " " + JSON.stringify(rec[k]) + ", tools/lib/patches.js says " + JSON.stringify(chrome[k]));
            });
            const e = { id: id, season: season, patch: p.label, label: P.labelFor(page, rec),
                date: rec.date || null, reason: rec.reason || null, confidence: rec.confidence || "high" };
            Object.keys(chrome).forEach(function(k){ e[k] = chrome[k]; });
            if (page === "runes") Object.keys(RUNE_DEFAULTS).forEach(function(k){ e[k] = RUNE_DEFAULTS[k]; });
            const man = manifest ? manifest[id] : null;
            let dd = rec.ddragonVersion || (rec.source && rec.source.ddragon) || (man && man.ddragonVersion) || null;
            if (!dd && page === "reforged") {
                dd = P.toDdragon(p) + ".1";
                (opts.strict ? err : warn)(where + ": no DDragon build; using " + dd);
            }
            if (dd) e.ddragonVersion = dd;
            if (page === "runes" && man) Object.keys(RUNE_DEFAULTS).forEach(function(k){ if (man[k] !== undefined) e[k] = man[k]; });
            if (rec.registry && typeof rec.registry === "object") Object.keys(rec.registry).forEach(function(k){ e[k] = rec.registry[k]; });
            // data / file
            if (!manifest) { e.data = page === "reforged" ? null : id; e.file = null; }
            else if (!man) {
                if (page === "reforged") { e.data = null; e.file = null; }
                else { err(where + ": " + id + " is not in " + rel(root, manFile)); e.data = id; e.file = null; }
            } else {
                e.data = man.data === undefined ? id : man.data;
                e.file = man.file || null;
                if (e.data === null) e.file = null;
                else if (typeof e.data !== "string" || !e.file) err(rel(root, manFile) + " " + id + ": data and file are required (data: null = no file)");
                else {
                    if (!/[\\/]/.test(e.file)) e.file = rel(root, path.join(path.dirname(manFile), e.file));
                    e.file = String(e.file).replace(/\\/g, "/");
                    const abs = path.join(root, e.file);
                    if (!/\.js$/.test(e.file)) err(id + ": " + e.file + " is not a .js file");
                    else if (path.basename(e.file, ".js") !== e.data) err(id + ": " + e.file + " must be named after its key " + e.data);
                    else if (!fs.existsSync(abs)) err(id + ": " + e.file + " does not exist");
                    else {
                        const text = fs.readFileSync(abs, "utf8");
                        const call = "LolData.register(" + JSON.stringify(page) + ", " + JSON.stringify(e.data);
                        if (text.indexOf(call) < 0) err(id + ": " + e.file + " does not contain " + call);
                    }
                }
            }
            list.push(ordered(e));
        });
        list.sort((a, b) => P.compare(a.patch, b.patch));
        patches[page] = list;
        if (manifest) {
            const known = {};
            list.forEach(e => { known[e.id] = true; });
            Object.keys(manifest).forEach(function(id){
                if (!known[id]) warn(rel(root, manFile) + ": " + id + " is not a listed " + page + " id (ignored)");
            });
        }

        // ---- per-season shape = seasons.json
        const labels = {};
        list.forEach(function(e){
            if (labels[e.label]) err(page + ": label " + JSON.stringify(e.label) + " used twice");
            labels[e.label] = true;
        });
        P.seasons().forEach(function(s){
            const pg = s.pages && s.pages[page];
            const inSeason = list.filter(e => e.season === s.key);
            if (!pg) { if (inSeason.length) err(page + " " + s.key + ": " + inSeason.length + " entries, but the page did not exist"); return; }
            if (inSeason.length !== pg.count) err(page + " " + s.key + ": " + inSeason.length + " listed patches, seasons.json says " + pg.count);
            if (!inSeason.length) return;
            if (!P.equal(inSeason[0].patch, pg.first)) err(page + " " + s.key + ": first listed " + inSeason[0].patch + ", seasons.json says " + pg.first);
            if (!P.equal(inSeason[inSeason.length - 1].patch, pg.last)) err(page + " " + s.key + ": last listed " + inSeason[inSeason.length - 1].patch + ", seasons.json says " + pg.last);
        });
    });

    // ---- ids, defaults, aliases
    const ids = {};
    P.PAGES.forEach(page => patches[page].forEach(function(e){
        if (ids[e.id]) err("id " + e.id + " used twice");
        ids[e.id] = page;
    }));
    const listed = (page, id) => ids[id] === page;
    const nav = P.seasons().map(function(s){
        const d = { key: s.key, label: s.label };
        P.PAGES.forEach(function(page){
            const pg = s.pages && s.pages[page];
            if (!pg) return;
            if (!listed(page, pg["default"])) err(s.key + " " + page + " default " + pg["default"] + " is not listed");
            d[page] = pg["default"];
        });
        return d;
    });
    const pageDefault = {};
    P.PAGES.forEach(function(page){
        const id = seasonsData.pageDefaults[page];
        if (!listed(page, id)) err("page default " + page + " " + id + " is not listed");
        pageDefault[page] = id;
    });
    const outAliases = {};
    P.PAGES.forEach(function(page){
        const map = aliases[page] || {}, o = {};
        Object.keys(map).sort().forEach(function(id){
            if (ids[id]) err("alias " + id + " is also a listed id");
            if (!listed(page, map[id].to)) err("alias " + id + " -> " + map[id].to + " is not listed");
            o[id] = map[id].codec ? { to: map[id].to, codec: map[id].codec } : { to: map[id].to };
        });
        outAliases[page] = o;
    });
    outAliases.plain = {};
    Object.keys(aliases.plain || {}).sort().forEach(function(page){
        const a = aliases.plain[page];
        if (!listed(page, a.to)) err("plain " + page + " -> " + a.to + " is not listed");
        outAliases.plain[page] = a.codec ? { to: a.to, codec: a.codec } : { to: a.to };
    });
    (Object.keys(aliases.keep || {})).forEach(function(page){
        (aliases.keep[page] || []).forEach(function(id){ if (!listed(page, id)) err("kept legacy id " + id + " is not listed"); });
    });

    const codecsAbs = path.join(root, "data", "masteries", "legacy-codecs.js");
    let codecs = null;
    if (fs.existsSync(codecsAbs)) {
        codecs = rel(root, codecsAbs);
        if (fs.readFileSync(codecsAbs, "utf8").indexOf('LolData.register("masteries-legacy"') < 0)
            err(codecs + " registers no masteries-legacy codec");
    } else (opts.strict ? err : warn)("no " + rel(root, codecsAbs) + "; LOL_REGISTRY.codecs = null");

    const body = { SEASON_NAV: nav, LOL_PAGE_DEFAULT: pageDefault, LOL_PATCHES: patches, LOL_ALIASES: outAliases };
    const registry = {
        generator: GENERATOR,
        hash: P.contentHash(body).slice(0, 16),
        codecs: codecs,
        live: { patch: seasonsData.live.patch, ddragon: seasonsData.live.ddragon },
        sources: sources
    };
    const counts = P.PAGES.map(p => p + " " + patches[p].length).join(", ");
    const stubbed = P.PAGES.filter(p => sources[p].stub);
    const missing = P.PAGES.filter(p => !sources[p].manifest).map(p => p + " manifest").concat(codecs ? [] : ["legacy codecs"]);
    const text = [
        "// GENERATED by " + GENERATOR + " " + EM_DASH + " do not edit. Sources: data/patches/seasons.json, data/patches/aliases.json, "
            + P.PAGES.map(p => sources[p].listing + (sources[p].manifest ? " + " + sources[p].manifest : "")).join(", ") + ".",
        "// Entries: " + counts + ". Stub listings: " + (stubbed.length ? stubbed.join(", ") : "none")
            + ". Not built yet: " + (missing.length ? missing.join(", ") : "none") + ".",
        "var LOL_REGISTRY = " + js(registry) + ";",
        "var SEASON_NAV = " + jsList(nav, "") + ";",
        "var LOL_PAGE_DEFAULT = " + js(pageDefault) + ";",
        "var LOL_PATCHES = {\n" + P.PAGES.map(p => "  " + JSON.stringify(p) + ": " + jsList(patches[p], "  ")).join(",\n") + "\n};",
        "var LOL_ALIASES = " + js(outAliases) + ";",
        ""
    ].join("\n");
    return { text, errors, warnings, root, counts, registry };
}

function main() {
    let args;
    try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error("build-registry: " + e.message); process.exit(2); }
    let res;
    try { res = build(args); } catch (e) { console.error("build-registry: " + (e.stack || e.message)); process.exit(1); }
    if (!args.quiet) res.warnings.forEach(w => console.warn("warning: " + w));
    if (res.errors.length) {
        res.errors.forEach(e => console.error("error: " + e));
        console.error("build-registry: " + res.errors.length + " error(s); nothing written");
        process.exit(1);
    }
    const out = path.resolve(args.out || path.join(res.root, "patch-registry.js"));
    let old = null;
    try { old = fs.readFileSync(out, "utf8").split("\r\n").join("\n"); } catch (e) { /* new */ }
    if (args.check) {
        if (old === res.text) { if (!args.quiet) console.log("ok: " + rel(process.cwd(), out) + " is up to date (" + res.counts + ")"); return; }
        console.error(rel(process.cwd(), out) + " is out of date: run node tools/build-registry.js");
        process.exit(1);
    }
    const changed = P.writeIfChanged(out, res.text);
    if (!args.quiet) console.log((changed ? "wrote " : "unchanged ") + out + " (" + Buffer.byteLength(res.text) + " bytes; " + res.counts + ")");
}

if (require.main === module) main();

module.exports = { build: build };
