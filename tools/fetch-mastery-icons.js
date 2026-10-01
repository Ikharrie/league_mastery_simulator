#!/usr/bin/env node
// tools/fetch-mastery-icons.js — one-shot icon fetcher for the mastery pages
// (DESIGN §5.1). Not part of the build: it is the only mastery tool that
// touches the network, and only Riot's Data Dragon CDN.
//
//   node tools/fetch-mastery-icons.js --research <scratchpad>\patches [options]
//   node tools/fetch-mastery-icons.js --check [--research <dir>]
//
// What it does (fetch mode, the default)
//   1. Listed builds: every listed masteries patch with Data Dragon data
//      (V3.13 … V7.21, 27 builds) and its chosen build. Read from
//      data/patches/masteries.json (`source.ddragon`) when that file exists,
//      else from <research>/masteries-ddragon/changed-patches.json
//      (`ddragon_build`). The era comes from tools/lib/patches.js eraOf():
//      AIR patches need the colour icon plus DDragon's pre-baked gray_ icon,
//      LCU patches (V7.1+) need colour only.
//   2. Mastery ids per build: data/sources/masteries/ddragon/<build>.json when
//      it exists, else <research>/raw/mastery/mastery-<build>.json (tree cells
//      and `data`, with image.full as the file name).
//   3. Downloads cdn/<build>/img/mastery/<id>.png (+ gray_<id>.png for AIR)
//      into the shared cache <research>/raw/mastery-img/<build>/, checking the
//      cache first. Sequential, --delay ms apart (default 200). HTTP 429 or
//      403 stops the run at once and is never retried; other failures are
//      retried 3 times with backoff. The cache keeps everything downloaded,
//      so a stopped run resumes where it left off.
//   4. Hashes every image twice: sha256 of the bytes (manifest) and sha256 of
//      the decoded RGBA pixels (dedupe). DDragon re-encoded its mastery PNGs
//      between builds, so equal art does not always have equal bytes. A
//      gray_ icon whose colour twin is pixel-identical also counts as the same
//      art when it differs by at most GRAY_NOISE levels (DDragon re-baked a
//      few gray_ files); every such case is reported. The icons of a
//      (build, id) must come from ONE folder (the calculators use iconBase +
//      id), so a folder qualifies when it holds every needed file of that id
//      with the same art. The existing folders (3.6.14, 4.20.2, 5.21.1,
//      5.22.3, 6.22.1, 7.21.1) are read-only and kept whenever their art
//      matches. Art that no folder holds is
//      vendored into images/masteries/<first listed build with that art>/;
//      when that folder is one of the read-only ones, into the folder of the
//      next listed build with the identical files (reported as a note).
//      DDragon icons are per cell id and the art behind an id changed
//      (V5.10 utility swap, V5.12 defense overhaul, V6.22 tier swaps), so
//      everything is resolved per (build, id), never per id.
//   5. Per build, the folders are chosen greedily (most ids first; ties: the
//      build's own folder, then the earliest version), so each build has a
//      main folder and as few per-mastery exceptions as possible.
//   6. Writes data/sources/masteries/icon-map.json, exactly
//      { "<build>": { "<id>": "<folder>" } } with <folder> relative to
//      images/masteries/ (builds in patch order, ids ascending). The cache
//      gets <cache>/manifest.json (url, sha256, bytes, size per file).
//   7. Copies the S2 V1.0.0.129 Perseverance icons from
//      <research>/raw/icons/{perseverance-2012,gray_perseverance-2012}.png to
//      images/masteries/s2/{perseverance,gray_perseverance}.png.
//   8. Runs the check below and prints the report (new images and bytes).
//
// --check (offline, writes nothing; exit 1 on any failure)
//   Every (build, id) of every listed build maps to a folder holding the
//   colour file, plus gray_ for AIR builds; the map has no other builds; the
//   mapped files show the cached DDragon art (same rule as 4) when the cache
//   is there; no vendored folder holds unreferenced files; every wiki-era
//   snapshot icon exists in s1/, s2/ or 3.6.14/; the Perseverance icons exist.
//
// Options
//   --research <dir>  research root (raw cache, listing and catalog fallbacks)
//   --cache <dir>     download cache (default <research>/raw/mastery-img)
//   --offline         never download; fail when a file is not in the cache
//   --dry-run         compute and report, write nothing in the repo
//   --delay <ms>      pause between downloads (default 200)
//   --quiet           less output
//   --verbose         list every gray_ file accepted within GRAY_NOISE
//
// Idempotent: a second run downloads nothing and rewrites nothing.

"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var P = require("./lib/patches");

var ROOT = path.resolve(__dirname, "..");
var IMG_ROOT = path.join(ROOT, "images", "masteries");
var MAP_FILE = path.join(ROOT, "data", "sources", "masteries", "icon-map.json");
var LISTING_FILE = path.join(ROOT, "data", "patches", "masteries.json");
var SOURCES_DIR = path.join(ROOT, "data", "sources", "masteries", "ddragon");
var CDN = "https://ddragon.leagueoflegends.com/cdn/";
var USER_AGENT = "league_mastery_simulator/fetch-mastery-icons (one-shot, fan-made calculator)";

// The folders that existed before this tool; never written to (DESIGN §5.1).
var PROTECTED = ["3.6.14", "4.20.2", "5.21.1", "5.22.3", "6.22.1", "7.21.1"];
var VERSION_DIR = /^\d+\.\d+\.\d+$/;

var PERSEVERANCE = [
    { from: "perseverance-2012.png", to: "perseverance.png" },
    { from: "gray_perseverance-2012.png", to: "gray_perseverance.png" }
];

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    var o = { research: null, cache: null, offline: false, dryRun: false, check: false, delay: 200, quiet: false, verbose: false };
    for (var i = 0; i < argv.length; i++) {
        var a = argv[i];
        var val = function(){
            if (i + 1 >= argv.length) die("missing value for " + a);
            return argv[++i];
        };
        if (a === "--research") o.research = path.resolve(val());
        else if (a === "--cache") o.cache = path.resolve(val());
        else if (a === "--offline") o.offline = true;
        else if (a === "--dry-run") o.dryRun = true;
        else if (a === "--check") o.check = true;
        else if (a === "--delay") { o.delay = Number(val()); if (!(o.delay >= 0)) die("bad --delay"); }
        else if (a === "--quiet") o.quiet = true;
        else if (a === "--verbose") o.verbose = true;
        else if (a === "-h" || a === "--help") { usage(); process.exit(0); }
        else die("unknown argument " + a);
    }
    if (!o.cache && o.research) o.cache = path.join(o.research, "raw", "mastery-img");
    if (!o.check && !o.research) die("--research <scratchpad>\\patches is required (raw cache and fallbacks)");
    return o;
}

function usage() {
    console.log("usage: node tools/fetch-mastery-icons.js --research <dir> [--cache <dir>] [--offline] [--dry-run] [--delay <ms>]\n"
        + "       node tools/fetch-mastery-icons.js --check [--research <dir>] [--cache <dir>]");
}

function die(msg) {
    console.error("fetch-mastery-icons: " + msg);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function readJsonFile(file) {
    var text = fs.readFileSync(file, "utf8");
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text);
}

function exists(file) {
    try { fs.accessSync(file); return true; } catch (e) { return false; }
}

function cmpBuild(a, b) { return P.compareBuild(a, b); }

function byNumber(a, b) { return Number(a) - Number(b) || (a < b ? -1 : a > b ? 1 : 0); }

// PNG signature + IHDR size; null when the bytes are not a PNG.
function pngInfo(buf) {
    var sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if (!buf || buf.length < 33) return null;
    for (var i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
    if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Decodes a PNG to RGBA (8-bit samples). Handles every colour type at bit
// depth 8, non-interlaced: what Data Dragon serves. Anything else throws.
function decodePng(buf) {
    var zlib = require("zlib");
    if (!pngInfo(buf)) throw new Error("not a PNG");
    var pos = 8, w = 0, h = 0, depth = 0, ctype = -1, interlace = 0, palette = null, trns = null, idat = [];
    while (pos + 8 <= buf.length) {
        var len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
        var body = buf.subarray(pos + 8, pos + 8 + len);
        if (type === "IHDR") {
            w = body.readUInt32BE(0); h = body.readUInt32BE(4);
            depth = body[8]; ctype = body[9]; interlace = body[12];
        } else if (type === "PLTE") palette = body;
        else if (type === "tRNS") trns = body;
        else if (type === "IDAT") idat.push(body);
        else if (type === "IEND") break;
        pos += 12 + len;
    }
    if (depth !== 8 || interlace !== 0) throw new Error("unsupported PNG (bit depth " + depth + ", interlace " + interlace + ")");
    var channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
    if (!channels) throw new Error("unsupported PNG colour type " + ctype);
    if (ctype === 3 && !palette) throw new Error("palette PNG without PLTE");
    var raw = zlib.inflateSync(Buffer.concat(idat));
    var stride = w * channels, bpp = channels;
    if (raw.length < h * (stride + 1)) throw new Error("truncated PNG data");
    var px = Buffer.alloc(h * stride), prev = Buffer.alloc(stride);
    for (var y = 0; y < h; y++) {
        var filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        var out = px.subarray(y * stride, (y + 1) * stride);
        for (var x = 0; x < stride; x++) {
            var a = x >= bpp ? out[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            } else if (filter !== 0) throw new Error("bad PNG filter " + filter);
            out[x] = v & 255;
        }
        prev = out;
    }
    var rgba = Buffer.alloc(w * h * 4);
    for (var i = 0; i < w * h; i++) {
        var r, g, bl, al = 255;
        if (ctype === 0) { r = g = bl = px[i]; if (trns && trns.length >= 2 && trns.readUInt16BE(0) === px[i]) al = 0; }
        else if (ctype === 2) {
            r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2];
            if (trns && trns.length >= 6 && trns.readUInt16BE(0) === r && trns.readUInt16BE(2) === g && trns.readUInt16BE(4) === bl) al = 0;
        } else if (ctype === 3) {
            var k = px[i];
            r = palette[k * 3]; g = palette[k * 3 + 1]; bl = palette[k * 3 + 2];
            if (trns && k < trns.length) al = trns[k];
        } else if (ctype === 4) { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
        else { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
        rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = bl; rgba[i * 4 + 3] = al;
    }
    return { width: w, height: h, rgba: rgba };
}

// Hash of what the image shows: size + decoded RGBA. Data Dragon re-encoded
// its mastery PNGs between builds (3.6.14 -> 3.13.24: every file's bytes
// differ, 108 of 112 decode to the same pixels), so byte hashes alone would
// vendor unchanged art again.
function pixelHash(buf) {
    var img = decodePng(buf);
    var head = Buffer.alloc(8);
    head.writeUInt32BE(img.width, 0); head.writeUInt32BE(img.height, 4);
    return sha256(Buffer.concat([head, img.rgba]));
}

function writeFileAtomic(file, buf) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    var tmp = file + ".part-" + process.pid;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
}

// Writes a binary file only when its bytes differ; returns true when written.
function writeBinaryIfChanged(file, buf) {
    if (exists(file) && fs.readFileSync(file).equals(buf)) return false;
    writeFileAtomic(file, buf);
    return true;
}

function kb(n) { return (n / 1024).toFixed(1) + " KB"; }

function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

// ---------------------------------------------------------------------------
// 1. Listed builds
// ---------------------------------------------------------------------------

// Records of data/patches/masteries.json, whatever the container shape:
// an array, { patches: [...] } / { records: [...] }, or an object of records.
function listingRecords(json) {
    var list = Array.isArray(json) ? json
        : Array.isArray(json.patches) ? json.patches
        : Array.isArray(json.records) ? json.records
        : Array.isArray(json.entries) ? json.entries
        : Object.keys(json).map(function(k){ return json[k]; });
    return list.filter(function(r){ return r && typeof r === "object" && typeof r.patch === "string"; });
}

function researchBuilds(research) {
    var out = {};
    if (!research) return out;
    var file = path.join(research, "masteries-ddragon", "changed-patches.json");
    if (!exists(file)) return out;
    readJsonFile(file).forEach(function(r){
        if (r && r.patch && r.ddragon_build) out[P.parse(r.patch).key] = { patch: r.patch, build: r.ddragon_build };
    });
    return out;
}

// -> { source, builds: [{ patch, build, era, air }] } in patch order.
function loadListedBuilds(opts) {
    var fromResearch = researchBuilds(opts.research);
    var source, rows = [];
    var repo = null;
    if (exists(LISTING_FILE)) {
        try { repo = listingRecords(readJsonFile(LISTING_FILE)); }
        catch (e) { console.warn("warning: cannot read " + path.relative(ROOT, LISTING_FILE) + " (" + e.message + "); using the research listing"); }
        if (repo && !repo.length) {
            console.warn("warning: no records in " + path.relative(ROOT, LISTING_FILE) + "; using the research listing");
            repo = null;
        }
    }
    if (repo) {
        source = path.relative(ROOT, LISTING_FILE).split(path.sep).join("/");
        repo.forEach(function(r){
            var p = P.parse(r.patch);
            var build = r.source && r.source.ddragon;
            // DDragon starts at 3.6.14; V3.13 is listed with its wiki template
            // source (DESIGN §1.6: { wiki, crossCheck: ["3.6.14", "3.13.24"] })
            // and still gets its DDragon build mapped: the crossCheck build of
            // that patch, else the research's chosen build.
            if (!build && P.compare(p, "V3.6") >= 0) {
                var cc = ((r.source && r.source.crossCheck) || []).filter(function(x){
                    var q = P.tryParse(String(x));
                    return q && q.build.length && P.equal(q, p);
                });
                if (cc.length) build = cc.sort(cmpBuild)[cc.length - 1];
                else if (fromResearch[p.key]) build = fromResearch[p.key].build;
            }
            if (!build) {
                if (P.compare(p, "V3.6") >= 0) die("listed patch " + p.label + " has no DDragon build (source.ddragon)");
                return;   // wiki era: images/masteries/s1, s2 and 3.6.14
            }
            rows.push({ patch: p.label, build: String(build) });
        });
    } else {
        if (!opts.research) die("no " + path.relative(ROOT, LISTING_FILE) + " and no --research for the listing");
        source = "research masteries-ddragon/changed-patches.json";
        Object.keys(fromResearch).forEach(function(k){ rows.push({ patch: fromResearch[k].patch, build: fromResearch[k].build }); });
    }
    if (!rows.length) die("no listed DDragon builds found");
    rows.forEach(function(r){
        var bp = P.parse(r.build);
        if (!P.equal(bp, r.patch)) die("build " + r.build + " is not a build of " + r.patch);
        r.era = P.eraOf(r.patch, "masteries");
        r.air = r.era === "air";
    });
    rows.sort(function(a, b){ return cmpBuild(a.build, b.build); });
    var seen = {};
    rows.forEach(function(r){
        if (seen[r.build]) die("build " + r.build + " listed twice (" + seen[r.build] + ", " + r.patch + ")");
        seen[r.build] = r.patch;
    });
    return { source: source, builds: rows };
}

// ---------------------------------------------------------------------------
// 2. Mastery ids per build
// ---------------------------------------------------------------------------

// { id: fileName } from a DDragon-shaped mastery.json (raw or trimmed).
function idsFromCatalog(json) {
    var out = {};
    var data = json && json.data;
    if (data && typeof data === "object") {
        Object.keys(data).forEach(function(k){
            var m = data[k] || {};
            var id = String(m.id != null ? m.id : k);
            var full = m.image && (typeof m.image === "string" ? m.image : m.image.full);
            out[id] = full || (id + ".png");
        });
    }
    var tree = json && json.tree;
    if (tree && typeof tree === "object") {
        Object.keys(tree).forEach(function(t){
            (tree[t] || []).forEach(function(row){
                (Array.isArray(row) ? row : (row && row.masteryTreeItems) || []).forEach(function(c){
                    var id = c && (c.masteryId != null ? String(c.masteryId) : null);
                    if (id && !out[id]) out[id] = id + ".png";
                });
            });
        });
    }
    return out;
}

function loadCatalog(build, opts) {
    var tries = [path.join(SOURCES_DIR, build + ".json")];
    if (opts.research) tries.push(path.join(opts.research, "raw", "mastery", "mastery-" + build + ".json"));
    var found = [];
    tries.forEach(function(f){
        if (!exists(f)) return;
        var ids;
        try { ids = idsFromCatalog(readJsonFile(f)); } catch (e) { die("cannot read " + f + ": " + e.message); }
        if (Object.keys(ids).length) found.push({ file: f, ids: ids });
    });
    if (!found.length) die("no mastery.json for build " + build + " (looked in " + tries.join(", ") + ")");
    // When both the committed trim and the raw export exist they must agree.
    for (var i = 1; i < found.length; i++) {
        var a = Object.keys(found[0].ids).sort().join(","), b = Object.keys(found[i].ids).sort().join(",");
        if (a !== b) die("mastery ids of " + build + " differ between " + found[0].file + " and " + found[i].file);
    }
    var ids = found[0].ids;
    Object.keys(ids).forEach(function(id){
        if (!/^\d+$/.test(id)) die("unexpected mastery id " + JSON.stringify(id) + " in " + build);
        if (!/^[0-9A-Za-z_.-]+\.png$/.test(ids[id])) die("unexpected image name " + JSON.stringify(ids[id]) + " in " + build);
    });
    return { file: found[0].file, ids: ids };
}

// Files a (build, id) needs: colour, plus gray_ for AIR.
function neededFiles(file, air) { return air ? [file, "gray_" + file] : [file]; }

// ---------------------------------------------------------------------------
// 3. Downloads (shared cache)
// ---------------------------------------------------------------------------

var lastRequest = 0;
var downloads = { requested: 0, fetched: 0, cached: 0, bytes: 0 };

function StopError(msg) { this.message = msg; this.stop = true; }
StopError.prototype = Object.create(Error.prototype);

async function httpGet(url, opts) {
    var attempt = 0;
    for (;;) {
        var wait = lastRequest + opts.delay - Date.now();
        if (wait > 0) await sleep(wait);
        lastRequest = Date.now();
        var res, err = null;
        try {
            res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(30000) });
        } catch (e) { err = e; }
        if (!err) {
            if (res.status === 429 || res.status === 403)
                throw new StopError("HTTP " + res.status + " from " + url + ": stopping (never retried). The cache keeps what was downloaded; re-run later.");
            if (res.status === 404) return null;
            if (res.ok) return Buffer.from(await res.arrayBuffer());
            err = new Error("HTTP " + res.status);
            if (res.status < 500) throw new Error(err.message + " for " + url);
        }
        if (++attempt > 3) throw new Error("giving up on " + url + ": " + err.message);
        await sleep(2000 * Math.pow(2, attempt - 1));
    }
}

async function ensureCached(build, file, opts) {
    var local = path.join(opts.cache, build, file);
    downloads.requested++;
    if (exists(local)) {
        var buf = fs.readFileSync(local);
        if (pngInfo(buf)) { downloads.cached++; return buf; }
        if (!opts.quiet) console.warn("warning: cached " + local + " is not a PNG; downloading again");
    }
    if (opts.offline) throw new Error("not in the cache (offline): " + local);
    var url = CDN + build + "/img/mastery/" + file;
    var got = await httpGet(url, opts);
    if (!got) throw new Error("HTTP 404: " + url);
    if (!pngInfo(got)) throw new Error("not a PNG: " + url);
    writeFileAtomic(local, got);
    downloads.fetched++;
    downloads.bytes += got.length;
    if (!opts.quiet && downloads.fetched % 100 === 0) console.log("  … " + downloads.fetched + " downloaded");
    return got;
}

// ---------------------------------------------------------------------------
// 4. Images, repo folders and the "same art" rule
// ---------------------------------------------------------------------------

// Max per-channel difference for a gray_ icon to count as the same art as an
// existing one, and only when its colour twin decodes to identical pixels:
// DDragon re-baked some gray_ icons when it re-encoded the set (3.13.24 vs
// 3.6.14: 4 gray_ files differ by at most 7 levels on <= 234 pixels, their
// colour icons are pixel-identical), and the gray_ files of the existing
// 5.22.3/ and 6.22.1/ folders are not DDragon's (each differs by at most 6
// levels, while all their colour files are DDragon's bytes exactly). Keeping
// them keeps today's views unchanged. Every use is reported (--verbose lists
// them).
var GRAY_NOISE = 8;

function artOf(buf) { return { buf: buf, bytes: sha256(buf), px: pixelHash(buf), img: null }; }

function rgbaOf(art) { return art.img || (art.img = decodePng(art.buf)); }

// { max, pixels } channel difference of two same-size images, or null.
function artDiff(a, b) {
    var x = rgbaOf(a), y = rgbaOf(b);
    if (x.width !== y.width || x.height !== y.height) return null;
    var max = 0, pixels = 0;
    for (var i = 0; i < x.rgba.length; i += 4) {
        var d = 0;
        for (var c = 0; c < 4; c++) d = Math.max(d, Math.abs(x.rgba[i + c] - y.rgba[i + c]));
        if (d) { pixels++; if (d > max) max = d; }
    }
    return { max: max, pixels: pixels };
}

// Does `have` ({file: art}) show the same art as `want` for the files `need`?
// -> null (no) or { noise: [{ file, max, pixels }] } (yes; noise = gray_
// files accepted within GRAY_NOISE).
function sameArt(have, want, need) {
    if (!have) return null;
    var noise = [];
    for (var i = 0; i < need.length; i++) {
        var f = need[i], h = have[f], w = want[f];
        if (!h || !w) return null;
        if (h.px === w.px) continue;
        var colour = f.replace(/^gray_/, "");
        if (f === colour || !have[colour] || !want[colour] || have[colour].px !== want[colour].px) return null;
        var d = artDiff(h, w);
        if (!d || d.max > GRAY_NOISE) return null;
        noise.push({ file: f, max: d.max, pixels: d.pixels });
    }
    return { noise: noise };
}

// { folder: { file: art } } for images/masteries/<x.y.z>/ (colour and gray_).
function indexRepoFolders() {
    var index = {};
    fs.readdirSync(IMG_ROOT, { withFileTypes: true }).forEach(function(d){
        if (!d.isDirectory() || !VERSION_DIR.test(d.name)) return;
        var files = {};
        fs.readdirSync(path.join(IMG_ROOT, d.name)).forEach(function(f){
            if (/^(gray_)?\d+\.png$/.test(f)) files[f] = artOf(fs.readFileSync(path.join(IMG_ROOT, d.name, f)));
        });
        index[d.name] = files;
    });
    return index;
}

// ---------------------------------------------------------------------------
// 5. Resolution
// ---------------------------------------------------------------------------

// builds: [{ patch, build, air, ids: {id: file}, arts: {file: art} }]
// -> { map, vendored: [{ folder, file, bytes, build, id, buf }], conflicts,
//      perBuild, relocated, noise: [{ build, id, folder, file, max, pixels }] }
function resolve(builds, index) {
    var map = {}, vendored = [], conflicts = [], perBuild = [], relocated = [], noiseUsed = [];
    builds.forEach(function(b, bi){
        var ids = Object.keys(b.ids).sort(byNumber);
        var cands = {}, noiseBy = {};
        ids.forEach(function(id){
            var need = neededFiles(b.ids[id], b.air);
            var list = [];
            noiseBy[id] = {};
            Object.keys(index).forEach(function(f){
                var m = sameArt(index[f], b.arts, need);
                if (m) { list.push(f); noiseBy[id][f] = m.noise; }
            });
            if (!list.length) {
                // New art: vendor it into the first listed build that has it.
                // When that build's folder is one of the read-only existing
                // folders, the next listed build with the identical files
                // (and a free folder) takes it instead.
                var target = b.build;
                if (PROTECTED.indexOf(target) >= 0) {
                    target = null;
                    for (var k = bi + 1; k < builds.length && !target; k++) {
                        var c = builds[k];
                        if (PROTECTED.indexOf(c.build) >= 0 || c.ids[id] !== b.ids[id]) continue;
                        if (need.every(function(f){ return c.arts[f] && c.arts[f].px === b.arts[f].px; })) target = c.build;
                    }
                    if (!target) {
                        conflicts.push(b.build + "/" + need.join("+") + " (" + b.patch + "): new art, but images/masteries/"
                            + b.build + "/ is a read-only existing folder and no later listed build has the same files");
                        return;
                    }
                    relocated.push({ build: b.build, id: id, folder: target });
                }
                index[target] = index[target] || {};
                need.forEach(function(f){
                    index[target][f] = b.arts[f];
                    vendored.push({ folder: target, file: f, bytes: b.arts[f].buf.length, build: b.build, id: id, buf: b.arts[f].buf });
                });
                list = [target];
                noiseBy[id][target] = [];
            }
            cands[id] = list;
        });
        // Greedy cover: the folder that serves most of the remaining ids first.
        var left = ids.filter(function(id){ return cands[id]; });
        var out = {}, folders = [];
        while (left.length) {
            var counts = {};
            left.forEach(function(id){ cands[id].forEach(function(f){ counts[f] = (counts[f] || 0) + 1; }); });
            var best = Object.keys(counts).sort(function(x, y){
                return counts[y] - counts[x]
                    || (y === b.build) - (x === b.build)
                    || cmpBuild(x, y);
            })[0];
            folders.push({ folder: best, count: counts[best] });
            left = left.filter(function(id){
                if (cands[id].indexOf(best) >= 0) {
                    out[id] = best;
                    noiseBy[id][best].forEach(function(n){
                        noiseUsed.push({ build: b.build, id: id, folder: best, file: n.file, max: n.max, pixels: n.pixels });
                    });
                    return false;
                }
                return true;
            });
        }
        var sorted = {};
        ids.forEach(function(id){ if (out[id]) sorted[id] = out[id]; });
        map[b.build] = sorted;
        perBuild.push({ build: b.build, patch: b.patch, air: b.air, ids: ids.length, folders: folders });
    });
    return { map: map, vendored: vendored, conflicts: conflicts, perBuild: perBuild, relocated: relocated, noise: noiseUsed };
}

// ---------------------------------------------------------------------------
// Check (also run at the end of a fetch)
// ---------------------------------------------------------------------------

// Wiki-era snapshots: data/sources/masteries/wiki/<patch>.json (T2) when
// present, else the research snapshots (<key>__<patch>.json). The icon folder
// follows the season: S1 s1/, S2 s2/, S3 V1.0.0.152 3.6.14/ (DESIGN §5.1).
function wikiSnapshots(opts) {
    var dirs = [{ dir: path.join(ROOT, "data", "sources", "masteries", "wiki"), source: "data/sources/masteries/wiki" }];
    if (opts.research) dirs.push({ dir: path.join(opts.research, "masteries-wiki", "snapshots"), source: "research masteries-wiki/snapshots" });
    for (var i = 0; i < dirs.length; i++) {
        if (!exists(dirs[i].dir)) continue;
        var files = fs.readdirSync(dirs[i].dir).filter(function(f){ return /\.json$/.test(f); });
        var out = [];
        files.forEach(function(f){
            var name = path.basename(f, ".json").split("__").pop();
            var p = P.tryParse(name);
            if (!p) return;
            var icons = {};
            var walk = function(x){
                if (Array.isArray(x)) x.forEach(walk);
                else if (x && typeof x === "object") Object.keys(x).forEach(function(k){
                    if (k === "icon" && (typeof x[k] === "string" || typeof x[k] === "number")) icons[String(x[k])] = true;
                    else walk(x[k]);
                });
            };
            walk(readJsonFile(path.join(dirs[i].dir, f)));
            var folder = P.compare(p, "V1.0.0.129") < 0 ? "s1" : P.compare(p, "V1.0.0.152") < 0 ? "s2" : "3.6.14";
            out.push({ patch: p.label, folder: folder, icons: Object.keys(icons).sort(), source: dirs[i].source });
        });
        if (out.length) return out.sort(function(a, b){ return P.compare(a.patch, b.patch); });
    }
    return [];
}

function check(listed, catalogs, opts, mapOverride) {
    var errors = [], notes = [];
    var map;
    if (mapOverride) map = mapOverride;
    else {
        if (!exists(MAP_FILE)) return { errors: ["missing " + path.relative(ROOT, MAP_FILE)], notes: notes };
        map = readJsonFile(MAP_FILE);
    }
    var builds = {};
    listed.builds.forEach(function(b){ builds[b.build] = b; });
    Object.keys(map).forEach(function(build){
        if (!builds[build]) errors.push("icon-map has build " + build + ", which no listed patch uses");
    });
    var referenced = {};
    var cacheChecked = 0, noiseCount = 0, haveCache = opts.cache && exists(opts.cache);
    var memo = {};
    var artAt = function(file){ return memo[file] || (memo[file] = artOf(fs.readFileSync(file))); };
    listed.builds.forEach(function(b){
        var m = map[b.build];
        if (!m) { errors.push("icon-map has no entry for " + b.build + " (" + b.patch + ")"); return; }
        var ids = catalogs[b.build].ids;
        Object.keys(ids).forEach(function(id){
            var folder = m[id];
            if (!folder) { errors.push(b.build + " (" + b.patch + "): id " + id + " is not mapped"); return; }
            if (!VERSION_DIR.test(folder)) { errors.push(b.build + "/" + id + ": bad folder " + JSON.stringify(folder)); return; }
            var need = neededFiles(ids[id], b.air), have = {}, want = {}, ok = true;
            need.forEach(function(f){
                var file = path.join(IMG_ROOT, folder, f);
                referenced[folder + "/" + f] = true;
                if (!exists(file)) { ok = false; errors.push(b.build + "/" + id + ": images/masteries/" + folder + "/" + f + " does not exist"); return; }
                try { have[f] = artAt(file); }
                catch (e) { ok = false; errors.push("images/masteries/" + folder + "/" + f + ": " + e.message); return; }
                var cached = haveCache && path.join(opts.cache, b.build, f);
                if (cached && exists(cached)) want[f] = artAt(cached);
            });
            if (!ok || Object.keys(want).length !== need.length) return;
            cacheChecked += need.length;
            var same = sameArt(have, want, need);
            if (!same) errors.push(b.build + "/" + id + ": images/masteries/" + folder + "/" + need.join("+") + " is not the DDragon " + b.build + " art");
            else noiseCount += same.noise.length;
        });
        Object.keys(m).forEach(function(id){
            if (!ids[id]) errors.push(b.build + ": icon-map id " + id + " is not a mastery of that build");
        });
    });
    // Vendored folders hold only referenced files.
    fs.readdirSync(IMG_ROOT, { withFileTypes: true }).forEach(function(d){
        if (!d.isDirectory() || !VERSION_DIR.test(d.name) || PROTECTED.indexOf(d.name) >= 0) return;
        fs.readdirSync(path.join(IMG_ROOT, d.name)).forEach(function(f){
            if (!referenced[d.name + "/" + f]) errors.push("images/masteries/" + d.name + "/" + f + " is vendored but not referenced by icon-map.json");
        });
    });
    // Wiki era (no DDragon): every icon of the S1/S2/S3 snapshots exists in
    // images/masteries/s1, s2 or 3.6.14 (colour + gray_; all AIR).
    var wiki = wikiSnapshots(opts);
    wiki.forEach(function(w){
        w.icons.forEach(function(icon){
            ["", "gray_"].forEach(function(prefix){
                if (!exists(path.join(IMG_ROOT, w.folder, prefix + icon + ".png")))
                    errors.push(w.patch + " (wiki): images/masteries/" + w.folder + "/" + prefix + icon + ".png does not exist");
            });
        });
    });
    if (wiki.length) notes.push(wiki.length + " wiki-era snapshots checked (" + wiki[0].source + ")");
    PERSEVERANCE.forEach(function(p){
        var file = path.join(IMG_ROOT, "s2", p.to);
        if (!exists(file)) { errors.push("missing images/masteries/s2/" + p.to); return; }
        var info = pngInfo(fs.readFileSync(file));
        if (!info || info.width !== 64 || info.height !== 64) errors.push("images/masteries/s2/" + p.to + " is not a 64x64 PNG");
        if (opts.research) {
            var src = path.join(opts.research, "raw", "icons", p.from);
            if (exists(src) && !fs.readFileSync(src).equals(fs.readFileSync(file)))
                errors.push("images/masteries/s2/" + p.to + " differs from raw/icons/" + p.from);
        }
    });
    if (haveCache) notes.push(cacheChecked + " mapped files compared with the DDragon cache by decoded pixels ("
        + noiseCount + " gray_ files within the re-bake tolerance of " + GRAY_NOISE + " levels)");
    else notes.push("no download cache given: images not compared with DDragon");
    return { errors: errors, notes: notes, map: map };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    var opts = parseArgs(process.argv.slice(2));
    var listed = loadListedBuilds(opts);
    var catalogs = {};
    listed.builds.forEach(function(b){ catalogs[b.build] = loadCatalog(b.build, opts); });
    var log = opts.quiet ? function(){} : console.log;
    log("listed builds: " + listed.builds.length + " (" + listed.builds.filter(function(b){ return b.air; }).length
        + " AIR, " + listed.builds.filter(function(b){ return !b.air; }).length + " LCU) from " + listed.source);

    if (opts.check) {
        var r = check(listed, catalogs, opts);
        r.notes.forEach(function(n){ log("note: " + n); });
        if (r.errors.length) {
            console.error("FAIL (" + r.errors.length + "):\n  " + r.errors.join("\n  "));
            process.exit(1);
        }
        var pairs = 0;
        Object.keys(r.map).forEach(function(b){ pairs += Object.keys(r.map[b]).length; });
        log("OK: " + pairs + " (build, id) pairs across " + Object.keys(r.map).length + " builds map to existing files"
            + " (colour, plus gray_ for AIR)");
        return;
    }

    // 3. Downloads.
    var manifest = {};
    var manifestFile = path.join(opts.cache, "manifest.json");
    var builds = [];
    try {
        for (var i = 0; i < listed.builds.length; i++) {
            var b = listed.builds[i];
            var cat = catalogs[b.build];
            var item = { patch: b.patch, build: b.build, air: b.air, ids: cat.ids, arts: {} };
            var ids = Object.keys(cat.ids).sort(byNumber);
            manifest[b.build] = { patch: b.patch, era: b.era, files: {} };
            for (var j = 0; j < ids.length; j++) {
                var need = neededFiles(cat.ids[ids[j]], b.air);
                for (var k = 0; k < need.length; k++) {
                    var buf = await ensureCached(b.build, need[k], opts);
                    var info = pngInfo(buf);
                    var art = item.arts[need[k]] = artOf(buf);
                    manifest[b.build].files[need[k]] = {
                        url: CDN + b.build + "/img/mastery/" + need[k], sha256: art.bytes, pixels: art.px,
                        bytes: buf.length, size: info.width + "x" + info.height
                    };
                }
            }
            builds.push(item);
        }
    } catch (e) {
        console.error("fetch-mastery-icons: " + e.message);
        console.error("downloaded " + downloads.fetched + " files (" + kb(downloads.bytes) + ") before stopping; nothing written to the repo");
        process.exit(1);
    }
    var text = JSON.stringify(manifest, null, 1) + "\n";
    if (!exists(manifestFile) || fs.readFileSync(manifestFile, "utf8") !== text) writeFileAtomic(manifestFile, Buffer.from(text, "utf8"));
    log("images: " + downloads.requested + " needed, " + downloads.cached + " from the cache, "
        + downloads.fetched + " downloaded (" + kb(downloads.bytes) + ")");

    // 4-5. Hash, dedupe, resolve.
    var index = indexRepoFolders();
    var originalIndex = {};
    Object.keys(index).forEach(function(f){
        originalIndex[f] = {};
        Object.keys(index[f]).forEach(function(n){ originalIndex[f][n] = { bytes: index[f][n].bytes, px: index[f][n].px }; });
    });
    var res = resolve(builds, index);
    if (res.conflicts.length) {
        console.error("FAIL: art that would have to go into a read-only folder:\n  " + res.conflicts.join("\n  "));
        process.exit(1);
    }

    // Report: how the existing folders compare with the DDragon build of the same name.
    log("\nexisting folders vs DDragon:");
    PROTECTED.forEach(function(folder){
        var files = originalIndex[folder] || {};
        var names = Object.keys(files);
        var b = builds.filter(function(x){ return x.build === folder; })[0];
        var used = 0;
        Object.keys(res.map).forEach(function(build){
            Object.keys(res.map[build]).forEach(function(id){ if (res.map[build][id] === folder) used++; });
        });
        var line = "  " + folder + ": " + names.length + " files";
        if (b) {
            var sameBytes = names.filter(function(f){ return b.arts[f] && b.arts[f].bytes === files[f].bytes; }).length;
            var samePx = names.filter(function(f){ return b.arts[f] && b.arts[f].px === files[f].px; }).length;
            var missing = Object.keys(b.arts).filter(function(f){ return !files[f]; });
            line += ", " + sameBytes + " byte-identical / " + samePx + " pixel-identical to DDragon " + folder
                + (missing.length ? ", lacks " + missing.join(" ") : "");
        } else line += " (not a listed build)";
        log(line + "; serves " + used + " (build, id) pairs");
    });

    log("\nper build (main folder first; ids served):");
    res.perBuild.forEach(function(p){
        log("  " + p.patch + " " + p.build + " " + (p.air ? "AIR" : "LCU") + " " + p.ids + " ids: "
            + p.folders.map(function(f){ return f.folder + " " + f.count; }).join(", "));
    });

    // 6-7. Write.
    var newFolders = {};
    res.vendored.forEach(function(v){
        newFolders[v.folder] = newFolders[v.folder] || { files: 0, bytes: 0 };
        newFolders[v.folder].files++;
        newFolders[v.folder].bytes += v.bytes;
    });
    var totalNew = res.vendored.reduce(function(s, v){ return s + v.bytes; }, 0);
    log("\nnew art: " + res.vendored.length + " images, " + totalNew + " bytes (" + kb(totalNew) + ") in "
        + Object.keys(newFolders).length + " new folders");
    Object.keys(newFolders).sort(cmpBuild).forEach(function(f){
        log("  images/masteries/" + f + "/: " + newFolders[f].files + " files, " + kb(newFolders[f].bytes));
    });
    if (res.noise.length) {
        // Summary per target folder; --verbose lists every file.
        var byFolder = {};
        res.noise.forEach(function(n){
            var s = byFolder[n.folder] = byFolder[n.folder] || { files: 0, max: 0, builds: {} };
            s.files++; s.max = Math.max(s.max, n.max); s.builds[n.build] = true;
        });
        log("\ngray_ re-bake noise accepted (colour pixel-identical, gray_ within " + GRAY_NOISE + " levels): "
            + res.noise.length + " (build, id) pairs");
        Object.keys(byFolder).sort(cmpBuild).forEach(function(f){
            var s = byFolder[f];
            log("  -> " + f + "/: " + s.files + " pairs, max " + s.max + " levels, builds "
                + Object.keys(s.builds).sort(cmpBuild).join(" "));
        });
        if (opts.verbose) res.noise.forEach(function(n){
            log("    " + n.build + "/" + n.file + " -> " + n.folder + "/ (max " + n.max + " levels, " + n.pixels + " pixels)");
        });
    }
    res.relocated.forEach(function(r){
        log("  note: " + r.build + "/" + r.id + " is new art first seen in " + r.build
            + " (a read-only folder); vendored into " + r.folder + "/, the next listed build with the same files");
    });

    if (opts.dryRun) { log("\n--dry-run: nothing written"); return; }

    var written = 0;
    res.vendored.forEach(function(v){
        if (PROTECTED.indexOf(v.folder) >= 0) die("internal: write into read-only folder " + v.folder);
        if (writeBinaryIfChanged(path.join(IMG_ROOT, v.folder, v.file), v.buf)) written++;
    });
    var pers = 0;
    PERSEVERANCE.forEach(function(p){
        var src = path.join(opts.research, "raw", "icons", p.from);
        if (!exists(src)) die("missing " + src);
        var buf = fs.readFileSync(src);
        var info = pngInfo(buf);
        if (!info || info.width !== 64 || info.height !== 64) die(src + " is not a 64x64 PNG");
        if (writeBinaryIfChanged(path.join(IMG_ROOT, "s2", p.to), buf)) pers++;
        log("  images/masteries/s2/" + p.to + ": " + buf.length + " bytes (from raw/icons/" + p.from + ")");
    });
    var mapOut = {};
    listed.builds.forEach(function(b){ mapOut[b.build] = res.map[b.build]; });
    var wrote = P.writeJson(MAP_FILE, mapOut, { indent: 2 });
    log("\nwrote " + written + " vendored images, " + pers + " Perseverance icons; "
        + path.relative(ROOT, MAP_FILE).split(path.sep).join("/") + (wrote.changed ? " written" : " unchanged"));

    var r2 = check(listed, catalogs, opts);
    r2.notes.forEach(function(n){ log("note: " + n); });
    if (r2.errors.length) {
        console.error("FAIL (" + r2.errors.length + "):\n  " + r2.errors.join("\n  "));
        process.exit(1);
    }
    log("check OK");
}

main().catch(function(e){
    console.error("fetch-mastery-icons: " + (e && e.stack || e));
    process.exit(1);
});
