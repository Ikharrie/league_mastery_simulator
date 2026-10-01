// tools/lib/patches.js — shared patch helpers for the data generators
// (DESIGN §1.5, §3, §4). Not a CLI. Node only, no dependencies.
//
// Every generator, the registry builder and the checks use this one module,
// so patch order, seasons, ids, labels and the per-patch chrome rules exist
// exactly once. The season table lives in data/patches/seasons.json and the
// legacy ids in data/patches/aliases.json; both are read lazily.
//
// Patch strings
//   parse(s)              -> Patch (throws on anything that is not a live patch)
//   tryParse(s)           -> Patch | null
//   Accepted: "V1.0.0.118b", "V1.0.0.94(b)", "V3.04", "V3.10a", "V4.5",
//   "V25.S1.1", "V26.01", "v4.5", "4.5.4" (DDragon build: patch V4.5 +
//   build [4]), "V0.9.22.15" (beta). Rejected: majors 2 and 15-24 (never live
//   names; DDragon 15.x/16.x are V25/V26: use fromDdragon), other splits than
//   S1, empty or malformed strings.
//   Patch = { input, major, minor, nums, parts, suffix, paren, build, split,
//             key, name, label }
//     nums    patch-level numbers: [1,0,0,118], [3,4], [25,1]
//     major   nums[0]; minor = the last patch-level number (118, 4, 1)
//     build   numbers below patch level: "4.5.4" -> [4], "3.01.0.1" -> [0,1]
//     key     equality key: "1.0.0.118b", "3.4", "25.1"
//     name    URL-safe canonical name (ids):  "V1.0.0.94b", "V3.04", "V25.S1.1"
//     label   display name (dropdowns): "V1.0.0.94(b)" when written so,
//             Riot's official name for 2025+ ("V25.S1.1", "V25.05", "V26.01")
//   Patch level: V0.x and V1.0.0.x keep all four numbers; V3+ is major.minor.
//
// Order
//   compare(a, b)         patch-level order (builds ignored): -1 | 0 | 1.
//                         V3.05 == V3.5, V25.S1.1 == V25.1, V26.01 == V26.1,
//                         "3.14.41" == V3.14, V1.0.0.118 < V1.0.0.118b.
//   compareBuild(a, b)    full order including the build numbers
//   equal(a, b), sortPatches(list), latestAtOrBefore(list, p)
//   fromDdragon("15.1.1") -> Patch V25.1 (build [1]); "0.152.107" -> V1.0.0.152;
//                            "lolpatch_7.20" -> V7.20
//   toDdragon(p)          -> "15.1" for V25.S1.1, "4.5" for V4.5, "0.152" for V1.0.0.152
//   officialName(p)       -> "V25.S1.1" / "V25.05" / "V26.01" / "V4.5"
//
// Seasons (DESIGN §3.1, applied identically to every page)
//   seasons(), season(key), seasonOf(p) -> "s1" … "s14" | "s2025" | "s2026" | null
//   seasonBounds(key, page?), seasonDefault(key, page), pageDefault(page),
//   livePatch(), isSeasonStart(p), isSeasonEnd(p), validateSeasons(obj)
//   seasonOf: first(season) <= p < first(next season); the last season is
//   open within its major (V26.20 -> s2026). Pre-launch beta -> null.
//
// Per-patch chrome (DESIGN §3.5, §3.2)
//   eraOf(p, page?)        "lcu" from V7.1 and for every Reforged patch, else "air"
//   airPeriodOf(p)         "2010" < V1.0.0.129 <= "2012" < V3.01 <= "2013" < V3.7 <= "2014"
//   quintHaloOf(p)         "cream" <= V3.14 < "ember" < V5.21 <= "silver"
//   combinerOf(p)          AIR and V0.9.22.15 <= p < V5.1
//   systemOf(p)            masteries: "classic" < V5.22 <= "keystone" <= V7.21, else null
//   lookOf(p)              classic look: "s1" for Season 1, "client" for S2-S5, else null
//   airFiveRankLayoutOf(p) keystone: "edge" V5.22-V6.21, "pair" from V6.22, else null
//   airIconVersionOf(p)    "5.22.3" for V6.22-V6.24 (Fresh Blood / Double-Edged
//                          Sword AIR art), else null
//   shardEraOf(p)          Reforged shard table id or null (V7.22-V8.22)
//   chromeOf(page, p)      all of the above that apply to the page, as one object
//
// Ids (DESIGN §4.1)
//   idFor(page, p)  masteries "m-V1.0.0.118b", runes "preReforged-V3.04",
//                   reforged "rr-v25-1" (live numbering)
//   parseId(id)     -> { page, patch, canonical } | null (legacy ids -> null).
//                   canonical = the id is spelled exactly as idFor() spells
//                   its patch ("m-V3.4" is not; "m-V3.04" is). Whether the
//                   patch is listed is up to the listing files.
//   ID_PATTERNS, PAGES
//   aliases()       data/patches/aliases.json, validated (validateAliases)
//
// Labels (DESIGN §3.3)
//   tagFor(page, record), labelFor(page, record)
//   record = "V4.5" or { patch, label?, tag?, confidence? }. Precedence:
//   record.label (verbatim) > record.tag ("" = no tag) > curated tag for the
//   page > season start tag > live "Current" > season-end override for the
//   page > "Season end" > none; confidence "low" appends " (approx.)".
//
// Content hash and generated files (DESIGN §1.1, §1.6)
//   stableStringify(v)     JSON with object keys sorted (arrays keep order)
//   contentHash(v)         sha256 hex of stableStringify(v): equal hash = same
//                          payload at calculator level, regardless of key order
//   formatJson(v, {width}) JSON text; width 0 = compact, else containers whose
//                          one-line form exceeds `width` columns are expanded
//   renderGenerated(opts) / writeGenerated(file, opts) -> generated .js text /
//                          { file, changed }; see renderGenerated below
//   writeIfChanged(file, text), writeJson(file, value, {indent})
//
// Everything returns plain data and never touches the network.

"use strict";

var PAGES = ["masteries", "runes", "reforged"];

// ---------------------------------------------------------------------------
// 1. Parsing
// ---------------------------------------------------------------------------

function fail(msg) { throw new Error("patches: " + msg); }

function pad2(n) { return n < 10 ? "0" + n : String(n); }

function officialNameOf(major, minor) {
    if (major === 25) return minor <= 3 ? "V25.S1." + minor : "V25." + pad2(minor);
    if (major >= 26) return "V" + major + "." + pad2(minor);
    return null;
}

function makePatch(input, nums, parts, suffix, paren, build, split) {
    var major = nums[0];
    var minor = major <= 1 ? nums[3] : nums[1];
    var name, label;
    if (major >= 25) {
        name = label = officialNameOf(major, nums[1]);
    } else if (major <= 1) {
        name = "V" + nums.join(".") + suffix;
        label = "V" + nums.join(".") + (suffix ? (paren ? "(" + suffix + ")" : suffix) : "");
    } else {
        // V3.01-V3.04 only existed as two-digit names; V3.05 and V3.5 are two
        // names of one patch, so the written form is kept; elsewhere no zeros.
        var m = nums[1];
        var minorText = major === 3 && m >= 1 && m <= 4 ? pad2(m)
            : major === 3 && m === 5 ? (parts[1].length === 2 ? "05" : "5")
            : String(m);
        name = "V" + major + "." + minorText + suffix;
        label = name;
    }
    return {
        input: input, major: major, minor: minor,
        nums: nums, parts: parts, suffix: suffix, paren: paren,
        build: build, split: split,
        key: nums.join(".") + suffix,
        name: name, label: label
    };
}

function parseString(raw) {
    var s = String(raw).trim();
    var m = /^(?:patch\s+)?[vV]?(.*)$/.exec(s);
    s = m[1];
    if (!s) fail("empty patch string " + JSON.stringify(raw));

    // 2025 split naming: V25.S1.1 = live 25.1 = DDragon 15.1.
    m = /^(\d+)\.[sS](\d+)\.(\d+)$/.exec(s);
    if (m) {
        var major = parseInt(m[1], 10), split = parseInt(m[2], 10), n = parseInt(m[3], 10);
        if (major !== 25 || split !== 1) fail("unknown split patch name " + JSON.stringify(raw) + " (only V25.S1.n is known)");
        if (n < 1 || n > 3) fail("V25.S1." + n + " does not exist (25.S1.1-25.S1.3, then 25.04)");
        return makePatch(String(raw), [25, n], ["25", String(n)], "", false, [], 1);
    }

    m = /^(\d+(?:\.\d+)*)(?:([a-zA-Z])|\(([a-zA-Z])\))?$/.exec(s);
    if (!m) fail("not a patch: " + JSON.stringify(raw));
    var parts = m[1].split(".");
    var nums = parts.map(function(p){ return parseInt(p, 10); });
    var suffix = (m[2] || m[3] || "").toLowerCase();
    var paren = !!m[3];
    var maj = nums[0];
    var level;
    if (maj === 0 || maj === 1) level = 4;
    else if (maj === 2) fail("there is no live patch V2.x: " + JSON.stringify(raw));
    else if (maj >= 15 && maj <= 24) fail(JSON.stringify(raw) + " looks like a DDragon version (live V" + (maj + 10) + "): use fromDdragon()");
    else level = 2;
    if (nums.length < level) fail(JSON.stringify(raw) + " is too short: V" + (level === 4 ? maj + ".x.x.x" : maj + ".x") + " expected");
    if (maj === 1 && (nums[1] !== 0 || nums[2] !== 0)) fail("V1 patches are V1.0.0.<n>: " + JSON.stringify(raw));
    if (level === 2 && nums[1] === 0) fail("there is no V" + maj + ".0 patch: " + JSON.stringify(raw));
    var build = nums.slice(level);
    if (suffix && build.length) fail("a letter suffix belongs on the patch, not on a build: " + JSON.stringify(raw));
    return makePatch(String(raw), nums.slice(0, level), parts.slice(0, level), suffix, paren, build, null);
}

var parseCache = Object.create(null);

function parse(p) {
    if (p && typeof p === "object" && Array.isArray(p.nums)) return p;
    // Strings only: a number like 4.10 would silently read as V4.1.
    if (typeof p !== "string") fail("not a patch string: " + JSON.stringify(p));
    var k = String(p);
    var hit = parseCache[k];
    if (!hit) {
        hit = parseString(k);
        Object.freeze(hit.nums); Object.freeze(hit.parts); Object.freeze(hit.build);
        hit = parseCache[k] = Object.freeze(hit);
    }
    return hit;
}

function tryParse(p) {
    try { return parse(p); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// 2. Order
// ---------------------------------------------------------------------------

function cmpNums(a, b) {
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return a.length === b.length ? 0 : (a.length < b.length ? -1 : 1);
}

function compare(a, b) {
    var pa = parse(a), pb = parse(b);
    var c = cmpNums(pa.nums, pb.nums);
    if (c) return c;
    if (pa.suffix === pb.suffix) return 0;
    return pa.suffix < pb.suffix ? -1 : 1;     // "" < "a" < "b"
}

function compareBuild(a, b) {
    return compare(a, b) || cmpNums(parse(a).build, parse(b).build);
}

function equal(a, b) { return compare(a, b) === 0; }

function sortPatches(list) {
    return list.slice().sort(compare);
}

// The last patch of `list` (any order) that is <= p, or null.
function latestAtOrBefore(list, p) {
    var best = null;
    list.forEach(function(x){
        if (compare(x, p) <= 0 && (best === null || compare(x, best) > 0)) best = x;
    });
    return best;
}

function officialName(p) {
    p = parse(p);
    return officialNameOf(p.major, p.nums[1]) || p.label;
}

// DDragon / CommunityDragon version -> live patch. 15.x and up are V25+;
// 0.151-0.154 are the V1.0.0.151-V1.0.0.154 era exports.
function fromDdragon(version) {
    var s = String(version).trim().replace(/^lolpatch_/, "");
    var m = /^(\d+)\.(\d+)((?:\.\d+)*)$/.exec(s);
    if (!m) fail("not a DDragon version: " + JSON.stringify(version));
    var maj = parseInt(m[1], 10), min = parseInt(m[2], 10), rest = m[3];
    if (maj === 0) return parse("V1.0.0." + min + rest);
    if (maj >= 15) return parse("V" + (maj + 10) + "." + min + rest);
    return parse("V" + maj + "." + min + rest);
}

function toDdragon(p) {
    p = parse(p);
    if (p.major === 1) return "0." + p.nums[3];
    if (p.major === 0) fail("no DDragon export for beta patch " + p.label);
    return (p.major >= 25 ? p.major - 10 : p.major) + "." + p.nums[1];
}

// ---------------------------------------------------------------------------
// 3. Seasons (data/patches/seasons.json)
// ---------------------------------------------------------------------------

var path = require("path");
var DATA_DIR = path.resolve(__dirname, "..", "..", "data", "patches");
var seasonsCache = null, aliasesCache = null;

function readJson(file) {
    var fs = require("fs");
    var text;
    try { text = fs.readFileSync(file, "utf8"); }
    catch (e) { fail("cannot read " + file + ": " + e.message); }
    try { return JSON.parse(text.replace(/^[\s\S]/, function(c){ return c.charCodeAt(0) === 0xFEFF ? "" : c; })); }
    catch (e) { fail("invalid JSON in " + file + ": " + e.message); }
}

// Test hook / alternate data: useSeasons(obj) or useSeasons(null) to reload.
function useSeasons(obj) {
    if (obj) {
        var errors = validateSeasons(obj);
        if (errors.length) fail("invalid seasons table:\n  " + errors.join("\n  "));
    }
    seasonsCache = obj || null;
}

function seasonsData() {
    if (!seasonsCache) useSeasons(readJson(path.join(DATA_DIR, "seasons.json")));
    return seasonsCache;
}

function seasons() { return seasonsData().seasons; }

function season(key) {
    var list = seasons();
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
}

function seasonIndexOf(p) {
    var list = seasons(), pp = parse(p);
    if (compare(pp, list[0].first) < 0) return -1;
    for (var i = list.length - 1; i >= 0; i--) {
        if (compare(pp, list[i].first) >= 0) {
            if (i === list.length - 1 && pp.major !== parse(list[i].last).major) return -1;
            return i;
        }
    }
    return -1;
}

function seasonOf(p) {
    var i = seasonIndexOf(p);
    return i < 0 ? null : seasons()[i].key;
}

function seasonBounds(key, page) {
    var s = season(key);
    if (!s) return null;
    if (!page) return { first: s.first, last: s.last };
    var pg = s.pages && s.pages[page];
    return pg ? { first: pg.first, last: pg.last } : null;
}

function seasonDefault(key, page) {
    var s = season(key);
    var pg = s && s.pages && s.pages[page];
    return pg ? pg["default"] : null;
}

function pageDefault(page) { return seasonsData().pageDefaults[page] || null; }

function livePatch() { return seasonsData().live.patch; }

function isSeasonStart(p) {
    return seasons().some(function(s){ return equal(s.first, p); });
}

function isSeasonEnd(p) {
    return seasons().some(function(s){ return equal(s.last, p); });
}

function validateSeasons(obj) {
    var errors = [];
    var err = function(m){ errors.push(m); };
    var ok = function(p, where){
        if (tryParse(p)) return true;
        err(where + ": not a patch: " + JSON.stringify(p));
        return false;
    };
    if (!obj || !Array.isArray(obj.seasons) || !obj.seasons.length) return ["seasons[] missing"];
    var keys = {};
    var prev = null;
    obj.seasons.forEach(function(s, i){
        var where = "seasons[" + i + "]" + (s && s.key ? " (" + s.key + ")" : "");
        if (!s || typeof s.key !== "string" || !/^s\d+$/.test(s.key)) { err(where + ": bad key"); return; }
        if (keys[s.key]) err(where + ": duplicate key");
        keys[s.key] = true;
        if (typeof s.label !== "string" || !s.label) err(where + ": label missing");
        if (typeof s.startTag !== "string" || !s.startTag) err(where + ": startTag missing");
        if (!ok(s.first, where + ".first") || !ok(s.last, where + ".last")) return;
        if (compare(s.first, s.last) > 0) err(where + ": first after last");
        if (prev && compare(prev.last, s.first) >= 0) err(where + ": overlaps " + prev.key);
        prev = s;
        var pages = s.pages || {};
        Object.keys(pages).forEach(function(page){
            var pg = pages[page], w = where + ".pages." + page;
            if (PAGES.indexOf(page) < 0) { err(w + ": unknown page"); return; }
            if (!ok(pg.first, w + ".first") || !ok(pg.last, w + ".last")) return;
            if (compare(pg.first, s.first) < 0 || compare(pg.last, s.last) > 0) err(w + ": outside the season");
            if (compare(pg.first, pg.last) > 0) err(w + ": first after last");
            if (!(pg.count > 0)) err(w + ": count missing");
            var d = parseId(pg["default"]);
            if (!d || d.page !== page || !d.canonical) err(w + ".default: not a canonical " + page + " id: " + JSON.stringify(pg["default"]));
            else if (compare(d.patch, pg.first) < 0 || compare(d.patch, pg.last) > 0) err(w + ".default: outside the page bounds");
        });
    });
    var last = obj.seasons[obj.seasons.length - 1];
    if (!obj.live || !tryParse(obj.live.patch)) err("live.patch missing");
    else if (last && !equal(obj.live.patch, last.last)) err("live.patch must be the last season's last patch");
    if (obj.live && obj.live.ddragon && tryParse(obj.live.patch) && toDdragon(obj.live.patch) !== obj.live.ddragon.split(".").slice(0, 2).join("."))
        err("live.ddragon does not match live.patch");
    if (!obj.pageDefaults) err("pageDefaults missing");
    else PAGES.forEach(function(page){
        var d = parseId(obj.pageDefaults[page]);
        if (!d || d.page !== page || !d.canonical) err("pageDefaults." + page + ": not a canonical id");
    });
    var labels = obj.labels || {};
    ["curated", "seasonEndOverrides"].forEach(function(k){
        var t = labels[k] || {};
        Object.keys(t).forEach(function(page){
            if (PAGES.indexOf(page) < 0) err("labels." + k + ": unknown page " + page);
            Object.keys(t[page]).forEach(function(p){ ok(p, "labels." + k + "." + page); });
        });
    });
    return errors;
}

// ---------------------------------------------------------------------------
// 4. Per-patch chrome (DESIGN §3.5; shard eras §3.2)
// ---------------------------------------------------------------------------

function before(p, q) { return compare(p, q) < 0; }

function eraOf(p, page) {
    if (page === "reforged") return "lcu";
    return before(p, "V7.1") ? "air" : "lcu";
}

function airPeriodOf(p) {
    if (before(p, "V1.0.0.129")) return "2010";
    if (before(p, "V3.01")) return "2012";
    if (before(p, "V3.7")) return "2013";
    return "2014";
}

function quintHaloOf(p) {
    if (compare(p, "V3.14") <= 0) return "cream";
    if (before(p, "V5.21")) return "ember";
    return "silver";
}

function combinerOf(p) {
    return eraOf(p) === "air" && !before(p, "V0.9.22.15") && before(p, "V5.1");
}

function systemOf(p) {
    if (before(p, "V1.0.0.32") || compare(p, "V7.21") > 0) return null;
    return before(p, "V5.22") ? "classic" : "keystone";
}

function lookOf(p) {
    if (systemOf(p) !== "classic") return null;
    return before(p, "V1.0.0.129") ? "s1" : "client";
}

function airFiveRankLayoutOf(p) {
    if (systemOf(p) !== "keystone") return null;
    return before(p, "V6.22") ? "edge" : "pair";
}

function airIconVersionOf(p) {
    return !before(p, "V6.22") && compare(p, "V6.24") <= 0 ? "5.22.3" : null;
}

var SHARD_ERAS = [   // [first patch, id]; each runs until the next one starts
    ["V8.23", "s8-23"], ["V9.1", "s9-1"], ["V9.2", "s9-2"], ["V10.23", "s10-23"],
    ["V11.21", "s11-21"], ["V14.2", "s14-2"], ["V25.22", "s25-22"]
];

function shardEraOf(p) {
    if (before(p, "V7.22")) fail("no Runes Reforged before V7.22: " + parse(p).label);
    var id = null;
    SHARD_ERAS.forEach(function(e){ if (!before(p, e[0])) id = e[1]; });
    return id;
}

function chromeOf(page, p) {
    var out = { era: eraOf(p, page) };
    if (page === "masteries") {
        out.airPeriod = airPeriodOf(p);
        out.system = systemOf(p);
        if (!out.system) fail("no masteries in " + parse(p).label);
        if (out.system === "classic") out.look = lookOf(p);
        else {
            out.airFiveRankLayout = airFiveRankLayoutOf(p);
            var ai = airIconVersionOf(p);
            if (ai) out.airIconVersion = ai;
        }
    } else if (page === "runes") {
        if (compare(p, "V7.21") > 0) fail("no pre-Reforged runes in " + parse(p).label);
        out.airPeriod = airPeriodOf(p);
        out.combiner = combinerOf(p);
        out.quintHalo = quintHaloOf(p);
    } else if (page === "reforged") {
        out.shardEra = shardEraOf(p);
    } else fail("unknown page " + JSON.stringify(page));
    return out;
}

// ---------------------------------------------------------------------------
// 5. Ids (DESIGN §4.1) and aliases (§4.2)
// ---------------------------------------------------------------------------

var ID_PATTERNS = {
    masteries: /^m-(V[0-9][0-9A-Za-z.]*)$/,
    runes: /^preReforged-(V[0-9][0-9A-Za-z.]*)$/,
    reforged: /^rr-v(\d+)-(\d+)$/
};

function idFor(page, p) {
    p = parse(p);
    if (page === "masteries") return "m-" + p.name;
    if (page === "runes") return "preReforged-" + p.name;
    if (page === "reforged") {
        if (p.major < 7 || p.major === 7 && p.nums[1] < 22) fail("no Runes Reforged in " + p.label);
        return "rr-v" + p.major + "-" + p.nums[1];
    }
    fail("unknown page " + JSON.stringify(page));
}

function parseId(id) {
    if (typeof id !== "string") return null;
    for (var i = 0; i < PAGES.length; i++) {
        var page = PAGES[i], m = ID_PATTERNS[page].exec(id);
        if (!m) continue;
        var patch = tryParse(page === "reforged" ? "V" + m[1] + "." + m[2] : m[1]);
        if (!patch) return null;
        var canonical;
        try { canonical = idFor(page, patch) === id; } catch (e) { return null; }
        return { page: page, patch: patch, canonical: canonical };
    }
    return null;
}

function useAliases(obj) {
    if (obj) {
        var errors = validateAliases(obj);
        if (errors.length) fail("invalid alias table:\n  " + errors.join("\n  "));
    }
    aliasesCache = obj || null;
}

function aliases() {
    if (!aliasesCache) useAliases(readJson(path.join(DATA_DIR, "aliases.json")));
    return aliasesCache;
}

function validateAliases(obj) {
    var errors = [];
    if (!obj) return ["alias table missing"];
    PAGES.forEach(function(page){
        var map = obj[page];
        if (!map || typeof map !== "object") { errors.push(page + ": map missing"); return; }
        Object.keys(map).forEach(function(id){
            var a = map[id], w = page + "." + id;
            if (a && a.to === id) errors.push(w + ": points at itself");
            var t = parseId(a && a.to);
            if (!t || t.page !== page || !t.canonical) errors.push(w + ".to: not a canonical " + page + " id");
            if (page === "masteries" && (typeof a.codec !== "string" || !a.codec)) errors.push(w + ": codec missing");
            if (page !== "masteries" && a.codec) errors.push(w + ": only mastery aliases carry a codec");
        });
    });
    var plain = obj.plain || {};
    Object.keys(plain).forEach(function(page){
        var t = parseId(plain[page] && plain[page].to);
        if (!t || t.page !== page || !t.canonical) errors.push("plain." + page + ".to: not a canonical " + page + " id");
    });
    var keep = obj.keep || {};
    Object.keys(keep).forEach(function(page){
        (keep[page] || []).forEach(function(id){
            var t = parseId(id);
            if (!t || t.page !== page || !t.canonical) errors.push("keep." + page + ": " + id + " is not canonical");
        });
    });
    return errors;
}

// ---------------------------------------------------------------------------
// 6. Labels (DESIGN §3.3)
// ---------------------------------------------------------------------------

function lookupByPatch(table, p) {
    if (!table) return null;
    var keys = Object.keys(table);
    for (var i = 0; i < keys.length; i++) if (equal(keys[i], p)) return table[keys[i]];
    return null;
}

function asRecord(record) {
    return typeof record === "string" ? { patch: record } : (record || {});
}

function tagFor(page, record) {
    var r = asRecord(record);
    if (typeof r.tag === "string") return r.tag;
    var p = parse(r.patch), data = seasonsData(), labels = data.labels || {};
    var curated = lookupByPatch((labels.curated || {})[page], p);
    if (curated) return curated;
    var list = seasons();
    for (var i = 0; i < list.length; i++) if (equal(list[i].first, p)) return list[i].startTag;
    if (equal(data.live.patch, p)) return data.live.tag || "Current";
    if (isSeasonEnd(p)) return lookupByPatch((labels.seasonEndOverrides || {})[page], p) || labels.seasonEnd || "Season end";
    return "";
}

function labelFor(page, record) {
    var r = asRecord(record);
    if (typeof r.label === "string" && r.label) return r.label;
    var p = parse(r.patch);
    var tag = tagFor(page, r);
    var text = p.label + (tag ? " (" + tag + ")" : "");
    if (r.confidence === "low") text += " (" + ((seasonsData().labels || {}).approx || "approx.") + ")";
    return text;
}

// ---------------------------------------------------------------------------
// 7. Content hash, JSON formatting, generated files (DESIGN §1.1, §1.6)
// ---------------------------------------------------------------------------

// Plain-JSON copy of v; throws on values JSON would silently mangle.
function toPlain(v, where) {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") {
        if (!isFinite(v)) fail("non-finite number at " + where);
        return v === 0 ? 0 : v;                       // -0 -> 0
    }
    if (Array.isArray(v)) return v.map(function(x, i){
        if (x === undefined || typeof x === "function") fail("undefined array element at " + where + "[" + i + "]");
        return toPlain(x, where + "[" + i + "]");
    });
    if (typeof v === "object") {
        var out = {};
        Object.keys(v).forEach(function(k){
            if (v[k] === undefined) return;               // as JSON.stringify
            if (typeof v[k] === "function") fail("function at " + where + "." + k);
            out[k] = toPlain(v[k], where + "." + k);
        });
        return out;
    }
    fail("unsupported value (" + typeof v + ") at " + where);
}

function stableStringify(v) {
    var plain = toPlain(v, "$");
    var walk = function(x){
        if (Array.isArray(x)) return "[" + x.map(walk).join(",") + "]";
        if (x && typeof x === "object")
            return "{" + Object.keys(x).sort().map(function(k){ return JSON.stringify(k) + ":" + walk(x[k]); }).join(",") + "}";
        return JSON.stringify(x);
    };
    return walk(plain);
}

function contentHash(v) {
    return require("crypto").createHash("sha256").update(stableStringify(v), "utf8").digest("hex");
}

var LS_RE = new RegExp(String.fromCharCode(0x2028), "g"), PS_RE = new RegExp(String.fromCharCode(0x2029), "g");

function escapeJsonForJs(text) {
    return text.replace(LS_RE, "\\u2028").replace(PS_RE, "\\u2029");
}

// width 0 / undefined: compact (JSON.stringify). Otherwise a container whose
// one-line form does not fit in `width` columns (counting its indentation and
// key) gets one member per line, indented by `indent` spaces (default 1).
function formatJson(v, opts) {
    opts = opts || {};
    var width = opts.width || 0, step = " ".repeat(opts.indent == null ? 1 : opts.indent);
    var plain = toPlain(v, "$");
    if (!width) return escapeJsonForJs(JSON.stringify(plain));
    // `used`: columns already taken on this line, including a trailing comma.
    var fmt = function(x, ind, used){
        var flat = JSON.stringify(x);
        var isContainer = x !== null && typeof x === "object";
        if (!isContainer || used + flat.length <= width) return flat;
        var inner = ind + step;
        if (Array.isArray(x)) {
            if (!x.length) return "[]";
            return "[\n" + x.map(function(e, i){
                return inner + fmt(e, inner, inner.length + (i < x.length - 1 ? 1 : 0));
            }).join(",\n") + "\n" + ind + "]";
        }
        var keys = Object.keys(x);
        if (!keys.length) return "{}";
        return "{\n" + keys.map(function(k, i){
            var head = inner + JSON.stringify(k) + ": ";
            return head + fmt(x[k], inner, head.length + (i < keys.length - 1 ? 1 : 0));
        }).join(",\n") + "\n" + ind + "}";
    };
    return escapeJsonForJs(fmt(plain, "", 0));
}

var EM_DASH = String.fromCharCode(0x2014);

function oneLine(s, what) {
    s = String(s);
    if (/[\r\n]/.test(s)) fail(what + " must be one line: " + JSON.stringify(s));
    return s;
}

// opts:
//   generator  "tools/build-masteries.js"
//   source     "DDragon 4.5.4 mastery.json"            (one line)
//   overrides  ["mo-003", "mo-011"]                     ([] -> "none")
//   patches    ["V4.5"] (patches using this file; strings or Patch objects)
//   kind, key, payload             one LolData.register call, or
//   registrations: [{kind, key, payload}, …]  several (legacy-codecs.js only)
//   width      formatJson width for the payloads (default 300: about one
//              record per line, ~2% larger than compact; 0 = one line)
//   note       optional extra comment line(s) (array of one-line strings)
// Output (LF line ends, trailing newline):
//   // GENERATED by <generator> — do not edit. Source: <source>.
//   // Overrides: <ids|none>. Patches using this file: <patches>.
//   LolData.register("<kind>", "<key>", <payload>);
function renderGenerated(opts) {
    if (!opts || !opts.generator) fail("renderGenerated: generator missing");
    var regs = opts.registrations || [{ kind: opts.kind, key: opts.key, payload: opts.payload }];
    if (!regs.length) fail("renderGenerated: nothing to register");
    var overrides = (opts.overrides || []).map(function(o){ return oneLine(o, "override id"); });
    var patches = (opts.patches || []).map(function(p){ return typeof p === "string" ? p : parse(p).label; });
    if (!patches.length && !opts.registrations) fail("renderGenerated: patches missing");
    var lines = [
        "// GENERATED by " + oneLine(opts.generator, "generator") + " " + EM_DASH + " do not edit. Source: "
            + oneLine(opts.source || "n/a", "source").replace(/\.$/, "") + ".",
        "// Overrides: " + (overrides.length ? overrides.join(", ") : "none") + "."
            + (patches.length ? " Patches using this file: " + patches.map(function(p){ return oneLine(p, "patch"); }).join(", ") + "." : "")
    ];
    (opts.note ? [].concat(opts.note) : []).forEach(function(n){ lines.push("// " + oneLine(n, "note")); });
    regs.forEach(function(r){
        if (typeof r.kind !== "string" || !r.kind) fail("renderGenerated: kind missing");
        if (typeof r.key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.key)) fail("renderGenerated: bad key " + JSON.stringify(r.key));
        if (r.payload === undefined) fail("renderGenerated: payload missing for " + r.key);
        lines.push("LolData.register(" + JSON.stringify(r.kind) + ", " + JSON.stringify(r.key) + ", "
            + formatJson(r.payload, { width: opts.width == null ? 300 : opts.width }) + ");");
    });
    return lines.join("\n") + "\n";
}

var CR = String.fromCharCode(13), LF = String.fromCharCode(10);

function writeIfChanged(file, text) {
    var fs = require("fs");
    var old = null;
    try { old = fs.readFileSync(file, "utf8"); } catch (e) { /* new file */ }
    // A CRLF checkout (core.autocrlf=true) of an unchanged LF file is unchanged.
    if (old !== null && old.split(CR + LF).join(LF) === text) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
    return true;
}

// Writes a generated data file; with a single registration the file name
// (without .js) must equal the key (DESIGN §1.6).
function writeGenerated(file, opts) {
    if (!opts.registrations && path.basename(file, ".js") !== opts.key)
        fail("file " + path.basename(file) + " must be named after its key " + JSON.stringify(opts.key));
    if (!/\.js$/.test(file)) fail("generated data files are .js: " + file);
    var text = renderGenerated(opts);
    return { file: file, changed: writeIfChanged(file, text), bytes: Buffer.byteLength(text, "utf8") };
}

function writeJson(file, value, opts) {
    var indent = opts && opts.indent != null ? opts.indent : 2;
    var text = JSON.stringify(toPlain(value, "$"), null, indent) + "\n";
    return { file: file, changed: writeIfChanged(file, text) };
}

module.exports = {
    PAGES: PAGES,
    DATA_DIR: DATA_DIR,
    // parsing and order
    parse: parse, tryParse: tryParse,
    compare: compare, compareBuild: compareBuild, equal: equal,
    sortPatches: sortPatches, latestAtOrBefore: latestAtOrBefore,
    officialName: officialName, fromDdragon: fromDdragon, toDdragon: toDdragon,
    // seasons
    seasons: seasons, season: season, seasonOf: seasonOf, seasonBounds: seasonBounds,
    seasonDefault: seasonDefault, pageDefault: pageDefault, livePatch: livePatch,
    isSeasonStart: isSeasonStart, isSeasonEnd: isSeasonEnd,
    validateSeasons: validateSeasons, useSeasons: useSeasons,
    // chrome
    eraOf: eraOf, airPeriodOf: airPeriodOf, quintHaloOf: quintHaloOf, combinerOf: combinerOf,
    systemOf: systemOf, lookOf: lookOf, airFiveRankLayoutOf: airFiveRankLayoutOf,
    airIconVersionOf: airIconVersionOf, shardEraOf: shardEraOf, SHARD_ERAS: SHARD_ERAS,
    chromeOf: chromeOf,
    // ids and aliases
    ID_PATTERNS: ID_PATTERNS, idFor: idFor, parseId: parseId,
    aliases: aliases, validateAliases: validateAliases, useAliases: useAliases,
    // labels
    tagFor: tagFor, labelFor: labelFor,
    // hashing and files
    stableStringify: stableStringify, contentHash: contentHash, formatJson: formatJson,
    renderGenerated: renderGenerated, writeGenerated: writeGenerated,
    writeIfChanged: writeIfChanged, writeJson: writeJson, readJson: readJson
};
