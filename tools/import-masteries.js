#!/usr/bin/env node
// tools/import-masteries.js — one-shot copy of the masteries research into the
// repo (DESIGN §1.3). Committed for provenance; NOT part of the build.
//
//   node tools/import-masteries.js --research <scratchpad>\patches [--check]
//
// Reads (read only):
//   <R>/raw/mastery/mastery-<build>.json            Data Dragon mastery.json
//   <R>/masteries-ddragon/changed-patches.json      V3.13 … V7.21 listing research
//   <R>/masteries-ddragon/noise.json                DDragon text noise (121 entries)
//   <R>/masteries-ddragon/discrepancies.json        old repo data vs DDragon / wiki
//   <R>/masteries-wiki/changed-patches.json         V1.0.0.32 … V1.0.0.152 research
//   <R>/masteries-wiki/snapshots/*.json             reconstructed wiki-era trees
//   <R>/masteries-wiki/noise-and-discrepancies.json wiki-era noise + discrepancies
// Writes:
//   data/sources/masteries/ddragon/<build>.json     28 trimmed builds: the 27 listed
//                                                   DDragon-era builds + 3.6.14 (the
//                                                   S3 numeric cross-check, M5)
//   data/sources/masteries/wiki/<patch>.json        15 wiki-era snapshots
//   data/sources/masteries/corrections-vs-legacy.json  what the old repo data got wrong
//   data/patches/masteries.json                     the 42 listed patches (seeded here;
//                                                   hand-maintained afterwards, see --no-listing)
//   data/patches/noise/masteries.json               what was ignored as noise, and why
//
// Options:
//   --check        write nothing; exit 1 when a file would change (idempotence check)
//   --no-listing   leave data/patches/masteries.json alone (after hand edits)
//
// No network access. Output is deterministic (same research in, same bytes out).

"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var P = require("./lib/patches");

var ROOT = path.resolve(__dirname, "..");
var GENERATOR = "tools/import-masteries.js";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    var out = { research: null, check: false, listing: true };
    for (var i = 0; i < argv.length; i++) {
        var a = argv[i];
        if (a === "--research") out.research = argv[++i];
        else if (a === "--check") out.check = true;
        else if (a === "--no-listing") out.listing = false;
        else if (a === "-h" || a === "--help") { out.help = true; }
        else throw new Error("unknown argument " + JSON.stringify(a));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Curation (DESIGN §0, §3.2, §8): the 42 listed patches
// ---------------------------------------------------------------------------

// Season counts (DESIGN §0). The importer refuses to write a listing that
// does not match.
var EXPECTED_COUNTS = { s1: 10, s2: 4, s3: 2, s4: 5, s5: 4, s6: 10, s7: 7 };

// Listed DDragon-era patches and their builds (DESIGN §3.2; the last build of
// each patch, as chosen by the research). 3.6.14 is imported in addition: it
// is the first Data Dragon build and the S3 numeric cross-check needs it.
var CROSS_CHECK_BUILDS = ["3.6.14"];

// Boundaries whose payload differs from the previous listed patch in tooltip
// text only (DESIGN §0 counts them as "no change"; check C2 needs to know).
var TEXT_ONLY = {
    "V1.0.0.128": "Reinforce tooltip names Garrison (Dominion, V1.0.0.125); values unchanged since V1.0.0.118b",
    "V4.19": "V4.10 / V4.13 tooltip rewordings (Reinforced Armor, Legendary Guardian, Enchanted Armor, Resistance); numbers unchanged",
    "V5.21": "V5.13 Oppression spacing fix ('movement(slows' -> 'movement (slows'); numbers unchanged"
};

// Record-level confidence of the wiki-era patches: the lowest confidence of
// the patch's own changes, read from the research brackets ("[high]",
// "[medium]", "[low, text only]"). "[low on old text]" is about the text
// BEFORE the patch, so it does not lower the patch itself. The launch state
// (V1.0.0.32) is a reconstruction with medium-confidence entries.
var LAUNCH_CONFIDENCE = "medium";

// S3: both listed S3 patches use the V1.0.0.152 wiki/dpatti templates (one
// shared file) and are cross-checked against these DDragon builds (M5).
var S3_TEMPLATE = "V1.0.0.152";
var S3_CROSS_CHECK = ["3.6.14", "3.13.24"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(file) {
    var text = fs.readFileSync(file, "utf8");
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text);
}

function sha256File(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function rel(file) { return path.relative(ROOT, file).split(path.sep).join("/"); }

var CONF_ORDER = { low: 0, medium: 1, high: 2 };
function minConf(a, b) { return CONF_ORDER[a] <= CONF_ORDER[b] ? a : b; }

// "[...]" groups of a research change string -> the lowest confidence word
// in them ("[high]", "[medium]", "[low, text only]", "[high value, medium
// wording]"); null when no group names one.
function bracketConfidence(text) {
    var best = null, re = /\[([^\]]*)\]/g, m;
    while ((m = re.exec(text))) {
        var b = m[1].toLowerCase();
        if (/low on old text/.test(b)) b = b.replace(/low on old text/g, "medium");
        ["low", "medium", "high"].forEach(function(w){
            if (new RegExp("\\b" + w + "\\b").test(b)) best = best ? minConf(best, w) : w;
        });
    }
    return best;
}

function out(text) { process.stdout.write(text + "\n"); }

// ---------------------------------------------------------------------------
// Writers (deterministic; --check only compares)
// ---------------------------------------------------------------------------

var changed = [], unchanged = 0, checkMode = false;

function emit(file, text) {
    var old = null;
    try { old = fs.readFileSync(file, "utf8").split("\r\n").join("\n"); } catch (e) { /* new */ }
    if (old === text) { unchanged++; return; }
    changed.push(rel(file));
    if (checkMode) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
}

function emitJson(file, value, width) {
    emit(file, P.formatJson(value, { width: width == null ? 160 : width, indent: 1 }) + "\n");
}

// ---------------------------------------------------------------------------
// 1. Data Dragon builds -> data/sources/masteries/ddragon/<build>.json
// ---------------------------------------------------------------------------

// Trimmed to the tree layout and {id, name, description[], ranks, prereq,
// image.full}; strings are kept byte for byte (the build applies the fixes).
function trimDdragon(raw, build, srcFile) {
    if (raw.type !== "mastery" || raw.version !== build) throw new Error(srcFile + ": not mastery.json " + build);
    var data = {};
    Object.keys(raw.data).forEach(function(id){
        var m = raw.data[id];
        data[id] = {
            id: m.id, name: m.name, description: m.description, ranks: m.ranks,
            prereq: m.prereq, image: { full: m.image && m.image.full }
        };
    });
    var tree = {};
    Object.keys(raw.tree).forEach(function(t){
        tree[t] = raw.tree[t].map(function(row){
            return row.map(function(c){ return c ? { masteryId: c.masteryId, prereq: c.prereq } : null; });
        });
    });
    return {
        _source: "https://ddragon.leagueoflegends.com/cdn/" + build + "/data/en_US/mastery.json",
        _imported: GENERATOR + " from research raw/mastery/mastery-" + build + ".json (sha256 " + sha256File(srcFile) + "); trimmed to tree + {id, name, description, ranks, prereq, image.full}",
        type: raw.type, version: raw.version, tree: tree, data: data
    };
}

// ---------------------------------------------------------------------------
// 2. Wiki-era snapshots -> data/sources/masteries/wiki/<patch>.json
// ---------------------------------------------------------------------------

// Repo-format tree arrays (S1/S2/S3) with `removed` flags. `parent` stays
// what it is in the snapshot: the ARRAY position of the prerequisite in the
// same tree array (removed entries included). The legacy-link fields
// (hashRanks, hashNote) belong to the legacy codecs (tools/fixtures) and the
// icon to-do note to T3, so neither is copied.
var WIKI_FIELDS = ["index", "name", "icon", "ranks", "desc", "rankInfo", "perlevel", "rankInfo2", "parent", "removed"];

function trimWiki(snap, entry, srcFile) {
    var unknown = {};
    var data = snap.data.map(function(tree){
        return tree.map(function(m){
            var o = {};
            WIKI_FIELDS.forEach(function(k){ if (m[k] !== undefined) o[k] = m[k]; });
            Object.keys(m).forEach(function(k){
                if (WIKI_FIELDS.indexOf(k) < 0 && ["hashRanks", "hashNote", "iconTodo"].indexOf(k) < 0) unknown[k] = true;
            });
            return o;
        });
    });
    if (Object.keys(unknown).length) throw new Error(srcFile + ": unknown snapshot fields " + Object.keys(unknown).join(", "));
    if (snap.patch !== entry.patch) throw new Error(srcFile + ": patch " + snap.patch + " != listing " + entry.patch);
    return {
        _source: "research masteries-wiki/" + entry.snapshot + " (built by build_deltas.py from base dataset " + entry.base_dataset + " + ops; see ops below)",
        _imported: GENERATOR + " (sha256 " + sha256File(srcFile) + ")",
        patch: snap.patch, season: snap.season, base: snap.base_dataset,
        trees: ["Offense", "Defense", "Utility"],
        ops: (entry.ops_vs_current_dataset || []).map(function(o){
            var r = { op: o.op, tree: o.tree, name: o.name };
            if (o.field) r.field = o.field;
            if (o.value !== undefined) r.value = o.value;
            if (o["with"]) r["with"] = { index: o["with"].index, name: o["with"].name, ranks: o["with"].ranks };
            r.confidence = o.confidence; r.src = o.src;
            if (o.note) r.note = o.note;
            return r;
        }),
        data: data
    };
}

// ---------------------------------------------------------------------------
// 3. Listing records (data/patches/masteries.json)
// ---------------------------------------------------------------------------

// Research source tags -> which of the record's sources back a change.
function tagSources(text, recordSources, build, prevBuild) {
    var m = /\[([^\]]*)\]\s*$/.exec(text);
    var tags = m ? m[1] : "";
    var pick = [];
    var add = function(s){ if (pick.indexOf(s) < 0) pick.push(s); };
    var has = function(t){ return new RegExp("(^|[ ,;(])" + t + "\\b").test(tags); };
    recordSources.forEach(function(s){
        if (/ddragon\.leagueoflegends\.com/.test(s) && has("DD")) add(s);
        else if (/\/wiki\/V\d/.test(s) && has("WP")) add(s);
        else if (/_Mastery\)/.test(s) && has("WM")) add(s);
        else if (/patch-[\d-]+-notes/.test(s) && has("RN")) add(s);
        else if (/communitydragon\.org/.test(s) && has("LC")) add(s);
    });
    if (has("DD") && !pick.some(function(s){ return /ddragon/.test(s); })) {
        add("https://ddragon.leagueoflegends.com/cdn/" + build + "/data/en_US/mastery.json");
        if (prevBuild) add("https://ddragon.leagueoflegends.com/cdn/" + prevBuild + "/data/en_US/mastery.json");
    }
    return pick.length ? pick : recordSources.slice();
}

function ddragonConfidence(text) {
    var m = /\[([^\]]*)\]\s*$/.exec(text);
    var tags = m ? m[1] : "";
    if (/not in DDragon|DDragon text has no/.test(tags)) return "medium";      // wiki only
    if (tags && !/\bDD\b/.test(tags)) return "medium";
    return "high";
}

function ddragonRecords(research) {
    return research.map(function(r, i){
        var prev = i > 0 ? research[i - 1] : null;
        var season = P.seasonOf(r.patch);
        var start = P.isSeasonStart(r.patch), end = P.isSeasonEnd(r.patch);
        var reason = start ? (r.reason === "season-start" && hasChangeVs(r) ? "season-start+change" : "season-start")
            : end ? "season-end" : "change";
        var rec = {
            patch: r.patch, season: season, reason: reason, date: r.date,
            source: { ddragon: r.ddragon_build },
            sources: r.sources.slice(),
            changes: r.changes.map(function(c){
                return { text: c, sources: tagSources(c, r.sources, r.ddragon_build, r.vs_build), confidence: ddragonConfidence(c) };
            }),
            confidence: "high"
        };
        if (TEXT_ONLY[r.patch]) rec.textOnly = TEXT_ONLY[r.patch];
        if (r.patch === "V3.13") {
            rec.source = { wiki: S3_TEMPLATE, crossCheck: S3_CROSS_CHECK.slice() };
            rec.changes.push({
                text: "Shown with the V1.0.0.152 templates (desc + rankInfo), which the build checks number by number against DDragon 3.6.14 and 3.13.24; the V3.12 Summoner's Insight Revive figure is tooltip noise (data/patches/noise/masteries.json).",
                sources: ["https://ddragon.leagueoflegends.com/cdn/3.6.14/data/en_US/mastery.json", "https://ddragon.leagueoflegends.com/cdn/3.13.24/data/en_US/mastery.json"],
                confidence: "high"
            });
        }
        if (prev === null && r.patch !== "V3.13") throw new Error("DDragon research must start at V3.13");
        return rec;
    });
}

// A season-start research record "has a change" when it is a rework
// (V3.14, V5.22, V6.22); V4.20 only restates that nothing changed.
function hasChangeVs(r) {
    return !/no mastery change/i.test(r.changes.join(" "));
}

function wikiRecords(wiki) {
    var srcMap = wiki.sources;
    var cite = function(key){
        if (!srcMap[key]) throw new Error("wiki research: unknown source key " + key);
        return srcMap[key];
    };
    var list = wiki.patches;
    return list.map(function(p, i){
        var prev = i > 0 ? list[i - 1] : null;
        var season = P.seasonOf(p.patch);
        var start = P.isSeasonStart(p.patch), end = P.isSeasonEnd(p.patch);
        var firstOfPage = i === 0;
        var reason = start ? (firstOfPage ? "season-start" : "season-start+change") : end ? "season-end" : "change";
        var pageKey = "fandom-" + p.patch;
        var recordSources = [];
        if (srcMap[pageKey]) recordSources.push(cite(pageKey));
        var ops = (p.ops_vs_current_dataset || []).concat(prev ? prev.ops_vs_current_dataset || [] : []);
        var changes = p.changes_vs_previous_listed.map(function(text){
            var keys = [];
            if (srcMap[pageKey]) keys.push(pageKey);
            ops.forEach(function(o){
                if (o.name && text.indexOf(o.name) >= 0) (o.src || []).forEach(function(k){ if (keys.indexOf(k) < 0) keys.push(k); });
            });
            if (firstOfPage) (p.ops_vs_current_dataset || []).forEach(function(o){
                (o.src || []).forEach(function(k){ if (keys.indexOf(k) < 0) keys.push(k); });
            });
            if (!keys.length) keys.push("fandom-summoner-mastery", "fandom-mastery-pages");
            var conf = bracketConfidence(text) || (firstOfPage ? LAUNCH_CONFIDENCE : "high");
            return { text: text, sources: keys.map(cite), confidence: conf };
        });
        if (!recordSources.length) recordSources.push(cite("fandom-summoner-mastery"));
        var conf = changes.reduce(function(c, ch){ return minConf(c, ch.confidence); }, "high");
        if (firstOfPage) conf = minConf(conf, LAUNCH_CONFIDENCE);
        var rec = {
            patch: p.patch, season: season, reason: reason, date: p.date,
            source: { wiki: p.patch }, sources: recordSources, changes: changes, confidence: conf
        };
        if (p.patch === S3_TEMPLATE) rec.source.crossCheck = S3_CROSS_CHECK.slice();
        if (TEXT_ONLY[p.patch]) rec.textOnly = TEXT_ONLY[p.patch];
        return rec;
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    var args = parseArgs(process.argv.slice(2));
    if (args.help || !args.research) {
        out("usage: node tools/import-masteries.js --research <scratchpad>\\patches [--check] [--no-listing]");
        process.exit(args.help ? 0 : 2);
    }
    checkMode = args.check;
    var R = path.resolve(args.research);
    var dd = readJson(path.join(R, "masteries-ddragon", "changed-patches.json"));
    var wiki = readJson(path.join(R, "masteries-wiki", "changed-patches.json"));

    // --- DDragon builds
    var builds = dd.map(function(r){ return r.ddragon_build; }).concat(CROSS_CHECK_BUILDS);
    builds = builds.filter(function(b, i){ return builds.indexOf(b) === i; }).sort(P.compareBuild);
    var ddDir = path.join(ROOT, "data", "sources", "masteries", "ddragon");
    builds.forEach(function(b){
        var src = path.join(R, "raw", "mastery", "mastery-" + b + ".json");
        emitJson(path.join(ddDir, b + ".json"), trimDdragon(readJson(src), b, src));
    });
    pruneDir(ddDir, builds.map(function(b){ return b + ".json"; }));

    // --- Wiki snapshots
    var wikiDir = path.join(ROOT, "data", "sources", "masteries", "wiki");
    var wikiNames = [];
    wiki.patches.forEach(function(p){
        var src = path.join(R, "masteries-wiki", p.snapshot);
        var name = P.parse(p.patch).name + ".json";
        wikiNames.push(name);
        emitJson(path.join(wikiDir, name), trimWiki(readJson(src), p, src));
    });
    pruneDir(wikiDir, wikiNames);

    // --- Listing
    var records = wikiRecords(wiki).concat(ddragonRecords(dd));
    records.sort(function(a, b){ return P.compare(a.patch, b.patch); });
    var counts = {};
    records.forEach(function(r){ counts[r.season] = (counts[r.season] || 0) + 1; });
    Object.keys(EXPECTED_COUNTS).forEach(function(s){
        if (counts[s] !== EXPECTED_COUNTS[s]) throw new Error("listing: " + s + " has " + counts[s] + " patches, DESIGN §0 says " + EXPECTED_COUNTS[s]);
    });
    if (records.length !== 42) throw new Error("listing: " + records.length + " patches, expected 42");
    records.forEach(function(r){
        if (P.seasonOf(r.patch) !== r.season) throw new Error(r.patch + ": season");
        if (!r.changes.length || r.changes.some(function(c){ return !c.sources.length; })) throw new Error(r.patch + ": change without a source");
    });
    if (args.listing) {
        var listing = {
            _comment: [
                "Masteries listing (DESIGN §1.4): one record per listed patch, chronological. Seeded by " + GENERATOR + " from the research changed-patches.json files; hand-maintained afterwards (re-run the importer with --no-listing).",
                "reason: season-start | change | season-end | season-start+change. source: {ddragon: <build>} (data/sources/masteries/ddragon/<build>.json) or {wiki: <patch>} (data/sources/masteries/wiki/<patch>.json); crossCheck = the DDragon builds the S3 templates are checked against (M5).",
                "textOnly: a season boundary whose payload differs from the previous listed patch in tooltip text only (DESIGN §0 counts it as a boundary with no change; check C2).",
                "changes[].text keeps the research wording; the trailing [..] names the evidence: DD = Data Dragon, WP = wiki patch page, WM = wiki mastery page, RN = Riot patch notes, LC = League Client game data (CommunityDragon).",
                "Labels, ids, era and chrome are not stored here: tools/lib/patches.js computes them (labelFor, idFor, chromeOf)."
            ],
            page: "masteries",
            patches: records
        };
        emitJson(path.join(ROOT, "data", "patches", "masteries.json"), listing, 200);
    }

    // --- Noise
    var ddNoise = readJson(path.join(R, "masteries-ddragon", "noise.json"));
    var wikiNoise = readJson(path.join(R, "masteries-wiki", "noise-and-discrepancies.json"));
    var noise = {
        _comment: [
            "What the masteries research ignored as noise, and why (DESIGN §1.3). Imported by " + GENERATOR + ".",
            "ddragon: Data Dragon text differences between consecutive patches that change no number or mechanic. listed=false entries fall in unlisted patches: the --audit pass of tools/build-masteries.js accepts an unlisted patch only when every text difference to the listed patch in effect is one of these (check C3).",
            "wiki: wiki-era patch-note items with no tree data change.",
            "crossCheck: derived from the S3 ddragon entries. The S3 templates keep the V1.0.0.152 text, so numbers a later S3 build added to a tooltip may be in DDragon without being in the template (S3 numeric cross-check, M5)."
        ],
        ddragon: ddNoise.map(function(e){
            return { patch: e.patch, vs: e.vs, listed: e.listed, mastery: e.mastery, change: e.change, rank: e.rank,
                     kind: e.kind, reason: e.reason, old: e.old, "new": e["new"] };
        }),
        wiki: wikiNoise.noise_ignored,
        crossCheck: crossCheckAllowances(ddNoise)
    };
    emitJson(path.join(ROOT, "data", "patches", "noise", "masteries.json"), noise, 200);

    // --- Corrections against the old repo data (for the screenshot report, T9)
    var ddDisc = readJson(path.join(R, "masteries-ddragon", "discrepancies.json"));
    emitJson(path.join(ROOT, "data", "sources", "masteries", "corrections-vs-legacy.json"), {
        _comment: [
            "Where the pre-rework mastery data files (season*-data.js, data.js, keystone data) disagreed with Data Dragon / the wiki, and which side the per-patch datasets follow. Imported by " + GENERATOR + " from the research discrepancy lists; documentation only (the build does not read it)."
        ],
        ddragonEra: ddDisc,
        wikiEra: wikiNoise.discrepancies
    }, 200);

    out((checkMode ? "check: " : "") + changed.length + " file(s) " + (checkMode ? "would change" : "written") + ", " + unchanged + " unchanged"
        + " (" + builds.length + " DDragon builds, " + wikiNames.length + " wiki snapshots, " + records.length + " listed patches)");
    changed.forEach(function(f){ out("  " + f); });
    if (checkMode && changed.length) process.exit(1);
}

// S3 numeric cross-check (M5): the S3 templates keep the V1.0.0.152 text, so
// a number that a later S3 build ADDED to its tooltip (logged as noise) may
// appear in DDragon without being in the template. One allowance per such
// noise entry: the numbers that the new text has and the old one has not.
function crossCheckAllowances(ddNoise) {
    var nums = function(s){ return (String(s).match(/\d+(?:\.\d+)?/g) || []).map(Number); };
    return ddNoise.filter(function(e){
        return P.seasonOf(e.patch) === "s3" && e.change === "text";
    }).map(function(e){
        var left = nums(e.old);
        var extra = nums(e["new"]).filter(function(v){
            var i = left.indexOf(v);
            if (i >= 0) { left.splice(i, 1); return false; }
            return true;
        });
        return { from: e.patch, mastery: e.mastery, rank: e.rank, extraNumbers: extra,
                 reason: "logged noise " + e.patch + ": " + e.reason };
    });
}

// Remove stale imported files from a directory the importer owns.
function pruneDir(dir, keep) {
    var names;
    try { names = fs.readdirSync(dir); } catch (e) { return; }
    names.forEach(function(n){
        if (!/\.json$/.test(n) || keep.indexOf(n) >= 0) return;
        changed.push(rel(path.join(dir, n)) + " (removed)");
        if (!checkMode) fs.unlinkSync(path.join(dir, n));
    });
}

try { main(); }
catch (e) { process.stderr.write("import-masteries: " + (e && e.message || e) + "\n"); process.exit(1); }
