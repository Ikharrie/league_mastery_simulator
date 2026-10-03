#!/usr/bin/env node
// tools/build-notes.js — player-facing patch notes per page and season (the patch-notes
// control next to the Patch dropdown in the site header).
//
// Reads (committed, offline):
//   data/patches/notes/<page>.json   hand-curated, one entry per listed patch of the page:
//                                    { "_comment": [...], "patches": { "<patch>": { summary, items, kind } } }
//                                    (page = masteries | runes | reforged; <patch> as in the listing)
//   data/patches/<page>.json         the listing: patch order, season, reason, confidence
// Writes:
//   data/notes/<page>-<season>.js    LolData.register("notes", "<page>-<season>", { "<patch>": { summary, items, kind } })
//                                    for every season with listed patches of the page, patches in
//                                    listing order. Files in data/notes/ that are no longer produced go.
//
// Usage:
//   node tools/build-notes.js            build (writes only what changed), then run the checks
//   node tools/build-notes.js --check    write nothing; exit 1 when an output is stale
//   --quiet                              print failures only
//
// Checks: N1 every listed patch has exactly one entry and there are no others; N2 entry shape
// (summary: one line, at most 90 characters; items: 1-10 one-line bullets; kind: launch | rework |
// change | season-start | season-end | no-change; no other fields); N3 kind fits the listing
// reason (a season boundary without a change is no-change, a change patch is change or rework,
// the page's first patch is launch or season-start); N4 the summary ends in " (approx.)" exactly
// when the listing's confidence is low; N5 player-facing text (no research markers like [DD],
// no internal terms or research wording such as "reconstructed", "exported", "catalog", arrows
// written as "→", tooltip labels only "Tooltip fix:", "Tooltip only:" and "Tooltip wording:");
// N6 the generated folder holds only this tool's files.
//
// For tools/build-registry.js: require("./build-notes.js").registryNotes(page) returns
// { "<patch>": { file, key, count } } (count = number of items, 0 for kind no-change).

"use strict";

var fs = require("fs");
var path = require("path");
var P = require("./lib/patches.js");

var ROOT = path.resolve(__dirname, "..");
var GENERATOR = "tools/build-notes.js";
var KIND = "notes";
var PAGES = ["masteries", "runes", "reforged"];
var OUT_DIR = path.join(ROOT, "data", "notes");
var KINDS = ["launch", "rework", "change", "season-start", "season-end", "no-change"];
var FIELDS = ["summary", "items", "kind"];
var MAX_SUMMARY = 90, MAX_ITEMS = 10;
var APPROX = " (approx.)";

// Listing reason -> allowed kinds (N3). The page's first listed patch is checked separately.
var KINDS_FOR_REASON = {
    "season-start": ["no-change"],
    "season-end": ["no-change"],
    "season-start+change": ["season-start", "rework"],
    "season-end+change": ["season-end"],
    "change": ["change", "rework"]
};
var KINDS_FOR_FIRST = ["launch", "season-start"];

// N5: research markers, internal terms and build numbers stay out of player-facing text.
var FORBIDDEN = [
    [/\[(?:DD|WP|WM|RN|LC|high|medium|low)\b/, "research marker"],
    [/\b(?:noise|overrides?|ddragon|cdragon|communitydragon|data ?dragon|perkText|stateHash)\b/i, "internal term"],
    [/\b(?:reconstruct\w*|export(?:s|ed)?|research\w*|catalog(?:ue)?s?|listings?|client text)\b/i, "research wording"],
    // the three tooltip labels of the README (a game change the tooltip never
    // shows is written as the change, "(the tooltip still says …)")
    [/(?:^|; )Tooltip (?!(?:fix|only|wording):)[^:;]*:/, "tooltip label other than Tooltip fix: / Tooltip only: / Tooltip wording:"],
    [/\b(?:Client bug|Not shown in the tooltip)\b/i, "label outside Tooltip fix: / Tooltip only: / Tooltip wording:"],
    [/\b(?:mo|ro|rro|rn)-\d{3}\b/, "override or noise id"],
    [/(?:^|[^V.\d])\d+\.\d+\.\d+/, "build number"],
    [/->|=>/, "ASCII arrow (write →)"],
    [/\s{2,}|^\s|\s$/, "stray whitespace"]
];

function listingFile(page) { return path.join(ROOT, "data", "patches", page + ".json"); }
function notesFile(page) { return path.join(ROOT, "data", "patches", "notes", page + ".json"); }
function rel(file) { return path.relative(ROOT, file).split(path.sep).join("/"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function readText(file) { try { return fs.readFileSync(file, "utf8"); } catch (e) { return null; } }
function normalizeEol(s) { return s.split("\r\n").join("\n"); }
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function keyOf(page, season) { return page + "-" + season; }
function fileOf(page, season) { return "data/notes/" + keyOf(page, season) + ".js"; }
function countOf(entry) { return entry.kind === "no-change" ? 0 : entry.items.length; }

function checkText(s, where, errors) {
    FORBIDDEN.forEach(function(f){ if (f[0].test(s)) errors.push(where + ": " + f[1] + " in " + JSON.stringify(s)); });
}

// Reads and checks one page (N1-N5). Returns { listing, notes, seasons: [{ season, patches }], errors }.
function loadPage(page) {
    var errors = [];
    var listing = readJson(listingFile(page)).patches;
    var doc = null;
    try { doc = readJson(notesFile(page)); } catch (e) { errors.push(rel(notesFile(page)) + ": " + e.message); }
    var notes = doc && isObj(doc.patches) ? doc.patches : {};
    if (doc && !isObj(doc.patches)) errors.push(rel(notesFile(page)) + ": patches must be an object");
    if (doc) Object.keys(doc).forEach(function(k){
        if (k !== "_comment" && k !== "patches") errors.push(rel(notesFile(page)) + ": unknown field " + k);
    });

    var seen = {}, seasons = [], bySeason = {};
    listing.forEach(function(rec, i){
        var w = page + " " + rec.patch, e = notes[rec.patch];
        seen[rec.patch] = true;
        if (!e) { errors.push(w + ": N1 no notes entry"); return; }
        if (!isObj(e)) { errors.push(w + ": N2 entry must be an object"); return; }
        Object.keys(e).forEach(function(k){ if (FIELDS.indexOf(k) < 0) errors.push(w + ": N2 unknown field " + k); });
        // N2 shape
        if (typeof e.summary !== "string" || !e.summary) errors.push(w + ": N2 summary missing");
        else {
            if (/[\r\n]/.test(e.summary)) errors.push(w + ": N2 summary must be one line");
            if (e.summary.length > MAX_SUMMARY) errors.push(w + ": N2 summary is " + e.summary.length + " characters (max " + MAX_SUMMARY + ")");
            checkText(e.summary, w + " summary", errors);
        }
        if (!Array.isArray(e.items) || !e.items.length) errors.push(w + ": N2 items must be a non-empty array");
        else {
            if (e.items.length > MAX_ITEMS) errors.push(w + ": N2 " + e.items.length + " items (max " + MAX_ITEMS + ")");
            e.items.forEach(function(it, j){
                var wi = w + " item " + (j + 1);
                if (typeof it !== "string" || !it) { errors.push(wi + ": N2 must be a non-empty string"); return; }
                if (/[\r\n]/.test(it)) errors.push(wi + ": N2 must be one line");
                if (/\.$/.test(it) && !/\b(?:etc|approx)\.$/.test(it)) errors.push(wi + ": N2 no trailing period");
                if (it.indexOf("(approx.)") >= 0) errors.push(wi + ": N4 (approx.) belongs on the summary");
                checkText(it, wi, errors);
            });
            var dup = e.items.filter(function(it, j){ return e.items.indexOf(it) !== j; });
            if (dup.length) errors.push(w + ": N2 duplicate item " + JSON.stringify(dup[0]));
        }
        if (KINDS.indexOf(e.kind) < 0) errors.push(w + ": N2 kind " + JSON.stringify(e.kind) + " (one of " + KINDS.join(", ") + ")");
        // N3 kind vs reason
        var allowed = i === 0 ? KINDS_FOR_FIRST : KINDS_FOR_REASON[rec.reason];
        if (!allowed) errors.push(w + ": N3 unknown listing reason " + JSON.stringify(rec.reason));
        else if (KINDS.indexOf(e.kind) >= 0 && allowed.indexOf(e.kind) < 0)
            errors.push(w + ": N3 kind " + e.kind + " does not fit reason " + rec.reason + (i === 0 ? " (first listed patch)" : "") + " (allowed: " + allowed.join(", ") + ")");
        if (e.kind === "no-change" && Array.isArray(e.items) && typeof e.items[0] === "string" && !/^No /.test(e.items[0]))
            errors.push(w + ": N3 a no-change entry starts with \"No … changes since …\"");
        // N4 confidence flag
        if (typeof e.summary === "string") {
            var low = rec.confidence === "low", flagged = e.summary.slice(-APPROX.length) === APPROX;
            if (low && !flagged) errors.push(w + ": N4 low-confidence listing: summary must end in" + APPROX);
            if (!low && e.summary.indexOf("(approx.)") >= 0) errors.push(w + ": N4 (approx.) only for a low-confidence listing (confidence " + rec.confidence + ")");
        }
        if (!rec.season) errors.push(w + ": listing record has no season");
        else {
            if (!bySeason[rec.season]) { bySeason[rec.season] = []; seasons.push(rec.season); }
            bySeason[rec.season].push(rec.patch);
        }
    });
    Object.keys(notes).forEach(function(p){ if (!seen[p]) errors.push(page + " " + p + ": N1 entry for a patch that is not listed"); });

    return {
        page: page, listing: listing, notes: notes, errors: errors,
        seasons: seasons.map(function(s){ return { season: s, patches: bySeason[s] }; })
    };
}

function payloadOf(ctx, patches) {
    var out = {};
    patches.forEach(function(p){
        var e = ctx.notes[p];
        out[p] = { summary: e.summary, items: e.items.slice(), kind: e.kind };
    });
    return out;
}

function renderFile(ctx, s) {
    var first = s.patches[0], last = s.patches[s.patches.length - 1];
    return P.renderGenerated({
        generator: GENERATOR,
        source: "data/patches/notes/" + ctx.page + ".json (" + s.season + ")",
        overrides: [],
        patches: s.patches,
        kind: KIND,
        key: keyOf(ctx.page, s.season),
        payload: payloadOf(ctx, s.patches),
        note: ["Player-facing change notes, " + s.patches.length + " listed patch" + (s.patches.length === 1 ? "" : "es")
            + " (" + first + (last !== first ? " - " + last : "") + "); loaded on demand by the patch-notes control."]
    });
}

// Builds every page; writes unless opts.check. Returns { pages, files, changed, errors }.
function build(opts) {
    opts = opts || {};
    var errors = [], files = [], pages = {};
    PAGES.forEach(function(page){
        var ctx = loadPage(page);
        pages[page] = ctx;
        errors = errors.concat(ctx.errors);
    });
    if (errors.length) return { pages: pages, files: files, changed: [], errors: errors };

    PAGES.forEach(function(page){
        var ctx = pages[page];
        ctx.seasons.forEach(function(s){
            files.push({ file: path.join(OUT_DIR, keyOf(page, s.season) + ".js"), text: renderFile(ctx, s) });
        });
    });

    var wanted = {};
    files.forEach(function(f){ wanted[path.basename(f.file)] = true; });
    var existing = [];
    try { existing = fs.readdirSync(OUT_DIR); } catch (e) { /* no folder yet */ }
    var changed = [];
    files.forEach(function(f){
        var old = readText(f.file);
        if (old === null || normalizeEol(old) !== f.text) {
            changed.push(rel(f.file));
            if (!opts.check) P.writeIfChanged(f.file, f.text);
        }
    });
    existing.filter(function(n){ return !wanted[n]; }).forEach(function(n){
        var file = path.join(OUT_DIR, n), text = readText(file) || "";
        if (!/\.js$/.test(n) || text.indexOf("// GENERATED by " + GENERATOR) !== 0) {
            errors.push(rel(file) + ": N6 unknown file in the generated folder");
            return;
        }
        changed.push(rel(file) + " (removed)");
        if (!opts.check) fs.unlinkSync(file);
    });
    if (opts.check && changed.length) errors.push("outputs are stale (run node " + GENERATOR + "): " + changed.join(", "));
    return { pages: pages, files: files, changed: changed, errors: errors };
}

// { "<patch>": { file, key, count } } for one page (throws when the notes do not pass N1-N5).
function registryNotes(page) {
    var ctx = loadPage(page);
    if (ctx.errors.length) throw new Error(GENERATOR + ": " + ctx.errors.length + " problem(s) in " + page + " notes, first: " + ctx.errors[0]);
    var out = {};
    ctx.listing.forEach(function(rec){
        out[rec.patch] = { file: fileOf(page, rec.season), key: keyOf(page, rec.season), count: countOf(ctx.notes[rec.patch]) };
    });
    return out;
}

function main(argv) {
    var args = { check: false, quiet: false };
    argv.forEach(function(a){
        if (a === "--check") args.check = true;
        else if (a === "--quiet") args.quiet = true;
        else if (a === "-h" || a === "--help") {
            console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 30).filter(function(l){ return /^\/\//.test(l); })
                .map(function(l){ return l.replace(/^\/\/ ?/, ""); }).join("\n"));
            process.exit(0);
        } else { console.error("build-notes: unknown argument " + a); process.exit(1); }
    });
    var r = build({ check: args.check });
    if (r.errors.length) {
        r.errors.forEach(function(e){ console.error("FAIL " + e); });
        console.error("build-notes: " + r.errors.length + " problem(s)");
        return 1;
    }
    if (!args.quiet) {
        PAGES.forEach(function(page){
            var ctx = r.pages[page], n = ctx.listing.length;
            var counted = ctx.listing.reduce(function(a, rec){ return a + countOf(ctx.notes[rec.patch]); }, 0);
            var none = ctx.listing.filter(function(rec){ return ctx.notes[rec.patch].kind === "no-change"; }).length;
            console.log("ok    " + page + ": " + n + " patches (" + none + " without changes), " + counted + " change notes, " + ctx.seasons.length + " season files");
        });
        console.log("build-notes: " + r.files.length + " files" + (args.check ? " (check only)" : "") + "; "
            + (r.changed.length ? (args.check ? "stale: " : "wrote: ") + r.changed.length + " file(s)" : "outputs up to date"));
        r.changed.forEach(function(c){ console.log("  " + c); });
    }
    return 0;
}

module.exports = { PAGES: PAGES, KINDS: KINDS, loadPage: loadPage, build: build, registryNotes: registryNotes, countOf: countOf, keyOf: keyOf, fileOf: fileOf };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
