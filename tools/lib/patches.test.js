// Unit tests for tools/lib/patches.js and data/patches/{seasons,aliases}.json.
//   node tools/lib/patches.test.js
//   node tools/lib/patches.test.js --ddragon <versions.json>
// The DDragon-era season boundaries are checked against Riot's live version
// list: data/sources/ddragon-versions.json, or the file --ddragon names.
// The expectations below are transcribed from DESIGN.md §0, §3.1-§3.5 and
// §4.1-§4.2; they are the spec, not derived from the code under test.

"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");
var vm = require("vm");
var P = require("./patches.js");

// ---------------------------------------------------------------------------
// Spec fixtures
// ---------------------------------------------------------------------------

// §3.1
var BOUNDARIES = [
    ["s1", "V1.0.0.32", "V1.0.0.128"], ["s2", "V1.0.0.129", "V1.0.0.151"],
    ["s3", "V1.0.0.152", "V3.13"], ["s4", "V3.14", "V4.19"], ["s5", "V4.20", "V5.21"],
    ["s6", "V5.22", "V6.21"], ["s7", "V6.22", "V7.21"], ["s8", "V7.22", "V8.22"],
    ["s9", "V8.23", "V9.22"], ["s10", "V9.23", "V10.22"], ["s11", "V10.23", "V11.22"],
    ["s12", "V11.23", "V12.21"], ["s13", "V12.22", "V13.24"], ["s14", "V14.1", "V14.24"],
    ["s2025", "V25.S1.1", "V25.24"], ["s2026", "V26.01", "V26.19"]
];

var LABELS = {   // current SEASON_NAV labels (nav.js)
    s1: "Season 1", s2: "Season 2", s3: "Season 3", s4: "Season 4", s5: "Season 5",
    s6: "Season 6", s7: "Season 7", s8: "Season 8 (2018)", s9: "Season 9 (2019)",
    s10: "Season 10 (2020)", s11: "Season 11 (2021)", s12: "Season 12 (2022)",
    s13: "Season 13 (2023)", s14: "Season 14 (2024)", s2025: "Season 2025",
    s2026: "Season 2026 (Current)"
};

function v1(list) { return list.map(function(n){ return "V1.0.0." + n; }); }

// §3.2
var LISTED = {
    masteries: {
        s1: v1(["32", "52", "61", "63", "72", "101", "109", "110", "118b", "128"]),
        s2: v1(["129", "131", "133", "151"]),
        s3: ["V1.0.0.152", "V3.13"],
        s4: ["V3.14", "V3.15", "V4.2", "V4.5", "V4.19"],
        s5: ["V4.20", "V5.10", "V5.12", "V5.21"],
        s6: ["V5.22", "V5.23", "V5.24", "V6.1", "V6.2", "V6.4", "V6.7", "V6.8", "V6.12", "V6.21"],
        s7: ["V6.22", "V6.24", "V7.2", "V7.4", "V7.5", "V7.6", "V7.21"]
    },
    runes: {
        s1: v1(["63", "72", "94(b)", "103", "105", "107", "110", "128"]),
        s2: v1(["129", "131", "132", "138", "151"]),
        s3: ["V1.0.0.152", "V3.04", "V3.13"],
        s4: ["V3.14", "V4.5", "V4.19"],
        s5: ["V4.20", "V5.21"],
        s6: ["V5.22", "V6.21"],
        s7: ["V6.22", "V7.21"]
    },
    reforged: {
        s8: ["V7.22", "V7.23", "V7.24", "V8.1", "V8.2", "V8.3", "V8.4", "V8.5", "V8.6", "V8.7", "V8.8",
             "V8.9", "V8.10", "V8.11", "V8.12", "V8.13", "V8.14", "V8.15", "V8.16", "V8.20", "V8.22"],
        s9: ["V8.23", "V8.24", "V9.1", "V9.2", "V9.4", "V9.5", "V9.6", "V9.7", "V9.8", "V9.9", "V9.10",
             "V9.11", "V9.16", "V9.22"],
        s10: ["V9.23", "V9.24", "V10.1", "V10.4", "V10.5", "V10.6", "V10.7", "V10.12", "V10.13", "V10.14",
              "V10.15", "V10.16", "V10.18", "V10.20", "V10.21", "V10.22"],
        s11: ["V10.23", "V11.1", "V11.2", "V11.6", "V11.10", "V11.11", "V11.13", "V11.17", "V11.19",
              "V11.21", "V11.22"],
        s12: ["V11.23", "V11.24", "V12.1", "V12.2", "V12.6", "V12.7", "V12.10", "V12.11", "V12.12",
              "V12.14", "V12.15", "V12.20", "V12.21"],
        s13: ["V12.22", "V13.1", "V13.3", "V13.4", "V13.5", "V13.6", "V13.12", "V13.15", "V13.17",
              "V13.20", "V13.21", "V13.24"],   // V13.17: Future's Market client text (rro-004)
        s14: ["V14.1", "V14.2", "V14.4", "V14.10", "V14.11", "V14.12", "V14.13", "V14.14", "V14.15",
              "V14.17", "V14.18", "V14.19", "V14.20", "V14.21", "V14.24"],
        s2025: ["V25.S1.1", "V25.S1.2", "V25.S1.3", "V25.05", "V25.09", "V25.10", "V25.12", "V25.14",
                "V25.19", "V25.21", "V25.22", "V25.24"],
        s2026: ["V26.01", "V26.03", "V26.09", "V26.10", "V26.11", "V26.13", "V26.15", "V26.16",
                "V26.17", "V26.19"]
    }
};

// §0
var COUNTS = {
    masteries: { s1: 10, s2: 4, s3: 2, s4: 5, s5: 4, s6: 10, s7: 7, total: 42 },
    runes: { s1: 8, s2: 5, s3: 3, s4: 3, s5: 2, s6: 2, s7: 2, total: 25 },
    reforged: { s8: 21, s9: 14, s10: 16, s11: 11, s12: 13, s13: 12, s14: 15, s2025: 12, s2026: 10, total: 124 }
};

// §3.4
var DEFAULTS = {
    masteries: { s1: "m-V1.0.0.128", s2: "m-V1.0.0.131", s3: "m-V1.0.0.152", s4: "m-V4.19",
                 s5: "m-V5.21", s6: "m-V5.22", s7: "m-V7.21" },
    runes: { s1: "preReforged-V1.0.0.128", s2: "preReforged-V1.0.0.151", s3: "preReforged-V3.13",
             s4: "preReforged-V4.19", s5: "preReforged-V5.21", s6: "preReforged-V6.21", s7: "preReforged-V7.21" },
    reforged: { s8: "rr-v8-22", s9: "rr-v9-22", s10: "rr-v10-22", s11: "rr-v11-22", s12: "rr-v12-21",
                s13: "rr-v13-24", s14: "rr-v14-19", s2025: "rr-v25-24", s2026: "rr-v26-19" }
};
var PAGE_DEFAULTS = { masteries: "m-V1.0.0.152", runes: "preReforged-V7.21", reforged: "rr-v26-19" };

// §4.2: legacy id -> [canonical id, season now, codec]
var LEGACY = {
    masteries: {
        "s1-final": ["m-V1.0.0.128", "s1", "s1-final"], "s2-ahri": ["m-V1.0.0.131", "s2", "s2-ahri"],
        "s3-pbe": ["m-V1.0.0.152", "s3", "s3-pbe"], "s4-final": ["m-V4.20", "s5", "s4-final"],
        "s5-final": ["m-V5.21", "s5", "s5-final"], "s6-launch": ["m-V5.22", "s6", "s6-launch"],
        "s7-preseason": ["m-V6.22", "s7", "s7-preseason"], "s7-final": ["m-V7.21", "s7", "s7-final"]
    },
    runes: {
        "preReforged-V3.14": ["preReforged-V3.14", "s4"], "preReforged-V4.20": ["preReforged-V4.20", "s5"],
        "preReforged-V5.21": ["preReforged-V5.21", "s5"], "preReforged-V7.21": ["preReforged-V7.21", "s7"],
        "preReforged-V6.24": ["preReforged-V6.22", "s7"]
    },
    reforged: {
        "rr-v7-22": ["rr-v7-22", "s8"], "rr-v13-24": ["rr-v13-24", "s13"], "rr-v14-19": ["rr-v14-19", "s14"],
        "rr-v25-24": ["rr-v25-24", "s2025"], "rr-v26-13": ["rr-v26-13", "s2026"],
        "rr-v8-23": ["rr-v8-23", "s9"], "rr-v9-23": ["rr-v9-23", "s10"], "rr-v10-23": ["rr-v10-23", "s11"],
        "rr-v11-23": ["rr-v11-23", "s12"], "rr-v12-23": ["rr-v12-22", "s13"]
    }
};

function listedOf(page) {
    var out = [];
    Object.keys(LISTED[page]).forEach(function(k){
        LISTED[page][k].forEach(function(p){ out.push({ season: k, patch: p }); });
    });
    return out;
}
function listedIds(page) { return listedOf(page).map(function(e){ return P.idFor(page, e.patch); }); }
function inList(list, p) { return list.some(function(x){ return P.equal(x, p); }); }

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("parse: the four named forms (V1.0.0.118b, V3.04, V25.S1.1, V26.01)", function(){
    var a = P.parse("V1.0.0.118b");
    assert.deepEqual([a.nums, a.suffix, a.key, a.name, a.label, a.major, a.minor],
        [[1, 0, 0, 118], "b", "1.0.0.118b", "V1.0.0.118b", "V1.0.0.118b", 1, 118]);
    var b = P.parse("V3.04");
    assert.deepEqual([b.nums, b.key, b.name, b.label], [[3, 4], "3.4", "V3.04", "V3.04"]);
    var c = P.parse("V25.S1.1");
    assert.deepEqual([c.nums, c.split, c.key, c.name, c.label], [[25, 1], 1, "25.1", "V25.S1.1", "V25.S1.1"]);
    var d = P.parse("V26.01");
    assert.deepEqual([d.nums, d.key, d.name, d.label], [[26, 1], "26.1", "V26.01", "V26.01"]);
});

test("parse: other accepted forms", function(){
    var b94 = P.parse("V1.0.0.94(b)");
    assert.deepEqual([b94.key, b94.name, b94.label, b94.paren], ["1.0.0.94b", "V1.0.0.94b", "V1.0.0.94(b)", true]);
    assert.equal(P.parse("V1.0.0.94b").label, "V1.0.0.94b");
    assert.equal(P.parse("V3.10a").key, "3.10a");
    assert.equal(P.parse("v4.5").name, "V4.5");
    assert.equal(P.parse(" V4.5 ").name, "V4.5");
    assert.equal(P.parse("V3.4").name, "V3.04");          // V3.01-V3.04 were two-digit names
    assert.equal(P.parse("V3.05").name, "V3.05");
    assert.equal(P.parse("V3.5").name, "V3.5");
    assert.equal(P.parse("V25.1").label, "V25.S1.1");     // research spelling -> official name
    assert.equal(P.parse("V25.5").label, "V25.05");
    assert.equal(P.parse("V26.1").label, "V26.01");
    assert.equal(P.parse("V26.19").label, "V26.19");
    var build = P.parse("4.5.4");
    assert.deepEqual([build.nums, build.build, build.name], [[4, 5], [4], "V4.5"]);
    assert.deepEqual(P.parse("3.14.41").build, [41]);
    assert.deepEqual(P.parse("V3.01.0.1").nums, [3, 1]);
    assert.deepEqual(P.parse("V0.9.22.15").nums, [0, 9, 22, 15]);
    assert.equal(P.parse(P.parse("V4.5")), P.parse("V4.5"));   // Patch objects pass through
});

test("parse: rejects what is not a live patch", function(){
    ["", "X", "V", "V4", "V1.0", "V1.2.3.4", "V2.1", "V15.1", "16.19.1", "V24.1", "V25.S2.1", "V25.S1.4",
     "4.5.4b", "V1.0.0.32 Hotfix", "V4.5.", "V4..5"].forEach(function(s){
        assert.throws(function(){ P.parse(s); }, /patches:/, s);
        assert.equal(P.tryParse(s), null, s);
    });
    ["V4.0", "V25.0", "V3.00"].forEach(function(s){ assert.throws(function(){ P.parse(s); }, /no V/, s); });
    assert.throws(function(){ P.parse(4.1); }, /string/);      // 4.10 would read as V4.1
    assert.throws(function(){ P.parse(null); });
    assert.throws(function(){ P.parse(undefined); });
    assert.throws(function(){ P.parse("V15.1"); }, /fromDdragon/);
});

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

test("compare: equal spellings of one patch", function(){
    [["V25.S1.1", "V25.1"], ["V26.01", "V26.1"], ["V3.04", "V3.4"], ["V3.05", "V3.5"],
     ["V1.0.0.94(b)", "V1.0.0.94b"], ["3.14.41", "V3.14"], ["4.5.4", "v4.5"]].forEach(function(pair){
        assert.equal(P.compare(pair[0], pair[1]), 0, pair.join(" vs "));
        assert.ok(P.equal(pair[0], pair[1]));
    });
});

test("compare: chronological order", function(){
    var chain = ["V0.8.21.110", "V0.9.22.15", "V0.9.25.34", "V1.0.0.32", "V1.0.0.94", "V1.0.0.94(b)",
        "V1.0.0.96", "V1.0.0.118", "V1.0.0.118b", "V1.0.0.119", "V1.0.0.128", "V1.0.0.129",
        "V1.0.0.140", "V1.0.0.140b", "V1.0.0.151", "V1.0.0.152", "V1.0.0.154", "V3.01", "V3.02",
        "V3.04", "V3.5", "V3.6", "V3.7", "V3.10", "V3.10a", "V3.11", "V3.13", "V3.14", "V3.15", "V4.1",
        "V4.19", "V4.20", "V5.1", "V5.21", "V5.22", "V6.21", "V6.22", "V7.1", "V7.21", "V7.22", "V8.4",
        "V8.22", "V8.23", "V9.1", "V9.22", "V9.23", "V10.22", "V10.23", "V12.21", "V12.22", "V13.24",
        "V14.1", "V14.24", "V25.S1.1", "V25.S1.3", "V25.05", "V25.24", "V26.01", "V26.09", "V26.19", "V27.01"];
    for (var i = 1; i < chain.length; i++) {
        assert.equal(P.compare(chain[i - 1], chain[i]), -1, chain[i - 1] + " < " + chain[i]);
        assert.equal(P.compare(chain[i], chain[i - 1]), 1, chain[i] + " > " + chain[i - 1]);
    }
    var shuffled = chain.slice().reverse();
    shuffled.push(shuffled.shift());
    assert.deepEqual(P.sortPatches(shuffled), chain);
});

test("compare: all 191 listed patches sort into §3.2 order on each page", function(){
    P.PAGES.forEach(function(page){
        var ordered = listedOf(page).map(function(e){ return e.patch; });
        var scrambled = ordered.slice().sort(function(a, b){ return a.length - b.length || (a < b ? 1 : -1); });
        assert.deepEqual(P.sortPatches(scrambled), ordered, page);
    });
    assert.equal(listedOf("masteries").length + listedOf("runes").length + listedOf("reforged").length, 191);
});

test("compareBuild and latestAtOrBefore", function(){
    assert.equal(P.compareBuild("4.5.3", "4.5.4"), -1);
    assert.equal(P.compareBuild("V4.5", "4.5.1"), -1);
    assert.equal(P.compareBuild("4.5.4", "4.6.1"), -1);
    var listed = LISTED.reforged.s12.concat(LISTED.reforged.s13);
    assert.equal(P.latestAtOrBefore(listed, "V12.23"), "V12.22");   // the rr-v12-23 alias case
    assert.equal(P.latestAtOrBefore(listed, "V12.22"), "V12.22");
    assert.equal(P.latestAtOrBefore(listed, "V11.1"), null);
    assert.equal(P.latestAtOrBefore(LISTED.runes.s7, "V6.24"), "V6.22");  // preReforged-V6.24
});

test("DDragon version mapping", function(){
    assert.equal(P.fromDdragon("15.1.1").label, "V25.S1.1");
    assert.deepEqual(P.fromDdragon("15.1.1").build, [1]);
    assert.equal(P.fromDdragon("16.19.1").label, "V26.19");
    assert.equal(P.fromDdragon("14.24.1").label, "V14.24");
    assert.equal(P.fromDdragon("3.6.14").label, "V3.6");
    assert.equal(P.fromDdragon("0.152.107").label, "V1.0.0.152");
    assert.equal(P.fromDdragon("lolpatch_7.20").label, "V7.20");
    assert.equal(P.toDdragon("V25.S1.1"), "15.1");
    assert.equal(P.toDdragon("V26.19"), "16.19");
    assert.equal(P.toDdragon("V4.5"), "4.5");
    assert.equal(P.toDdragon("V1.0.0.152"), "0.152");
    assert.equal(P.officialName("V25.4"), "V25.04");
    assert.equal(P.officialName("V8.4"), "V8.4");
    assert.throws(function(){ P.fromDdragon("x"); });
});

// ---------------------------------------------------------------------------
// Seasons (§3.1) and seasons.json
// ---------------------------------------------------------------------------

test("seasons.json is valid and matches the §3.1 boundary table", function(){
    assert.deepEqual(P.validateSeasons(P.readJson(path.join(P.DATA_DIR, "seasons.json"))), []);
    var list = P.seasons();
    assert.deepEqual(list.map(function(s){ return s.key; }), BOUNDARIES.map(function(b){ return b[0]; }));
    BOUNDARIES.forEach(function(b){
        var s = P.season(b[0]);
        assert.equal(s.first, b[1], b[0] + " first");
        assert.equal(s.last, b[2], b[0] + " last");
        assert.equal(s.label, LABELS[b[0]], b[0] + " label");
        assert.equal(P.seasonOf(b[1]), b[0], "seasonOf(" + b[1] + ")");
        assert.equal(P.seasonOf(b[2]), b[0], "seasonOf(" + b[2] + ")");
        assert.ok(P.isSeasonStart(b[1]) && P.isSeasonEnd(b[2]));
        assert.deepEqual(P.seasonBounds(b[0]), { first: b[1], last: b[2] });
    });
    assert.equal(P.season("s1").firstDate, "2009-10-21");
    assert.equal(P.season("s1").lastDate, "2011-11-01");
    assert.equal(P.season("s2").firstDate, "2011-11-15");
    assert.equal(P.season("s3").firstDate, "2012-12-04");
    assert.equal(P.livePatch(), "V26.19");
    assert.equal(P.toDdragon(P.livePatch()) + ".1", "16.19.1");
});

test("seasonOf: preseason patches belong to the next season; no gaps", function(){
    var cases = {
        "V1.0.0.52": "s1", "V1.0.0.118b": "s1", "V1.0.0.130": "s2", "V1.0.0.140b": "s2",
        "V1.0.0.153": "s3", "V1.0.0.154": "s3", "V3.01": "s3", "V3.04": "s3", "V3.6": "s3", "3.6.14": "s3",
        "V3.15": "s4", "V4.21": "s5", "V5.1": "s5", "V6.23": "s7", "V7.1": "s7",
        "V8.21": "s8", "V8.24": "s9", "V9.24": "s10", "V10.25": "s11", "V11.24": "s12",
        "V12.23": "s13", "V13.1": "s13", "V14.24": "s14", "V25.1": "s2025", "V25.04": "s2025",
        "V26.1": "s2026", "V26.20": "s2026", "16.19.1": null
    };
    Object.keys(cases).forEach(function(p){
        if (cases[p] === null) return;
        assert.equal(P.seasonOf(p), cases[p], p);
    });
    assert.equal(P.seasonOf(P.fromDdragon("16.19.1")), "s2026");
    assert.equal(P.seasonOf("V0.9.25.34"), null);    // beta: before the launch
    assert.equal(P.seasonOf("V27.01"), null);        // after the open season
    // every boundary pair is adjacent: the previous season ends right before
    for (var i = 1; i < BOUNDARIES.length; i++) {
        assert.equal(P.compare(BOUNDARIES[i - 1][2], BOUNDARIES[i][1]), -1);
        assert.equal(P.seasonOf(BOUNDARIES[i - 1][2]), BOUNDARIES[i - 1][0]);
    }
});

test("every listed patch (§3.2) is in its season; counts and page bounds match §0", function(){
    P.PAGES.forEach(function(page){
        var total = 0;
        Object.keys(LISTED[page]).forEach(function(k){
            var list = LISTED[page][k];
            list.forEach(function(p){ assert.equal(P.seasonOf(p), k, page + " " + p); });
            assert.equal(list.length, COUNTS[page][k], page + " " + k + " count (§0)");
            var pg = P.season(k).pages[page];
            assert.ok(pg, page + " missing in " + k);
            assert.equal(pg.count, list.length, page + " " + k + " seasons.json count");
            assert.deepEqual(P.seasonBounds(k, page), { first: list[0], last: list[list.length - 1] }, page + " " + k);
            total += list.length;
        });
        assert.equal(total, COUNTS[page].total, page + " total");
        // pages that did not exist in a season are absent
        P.seasons().forEach(function(s){
            assert.equal(!!(s.pages && s.pages[page]), !!LISTED[page][s.key], page + " in " + s.key);
        });
    });
    // page bounds equal the season bounds, except the runes S1 start (D2)
    P.seasons().forEach(function(s){
        Object.keys(s.pages).forEach(function(page){
            var pg = s.pages[page];
            if (!(page === "runes" && s.key === "s1")) assert.equal(pg.first, s.first, page + " " + s.key + " first");
            assert.equal(pg.last, s.last, page + " " + s.key + " last");
        });
    });
    assert.equal(P.season("s1").pages.runes.first, "V1.0.0.63");
});

test("season defaults (§3.4)", function(){
    P.PAGES.forEach(function(page){
        Object.keys(DEFAULTS[page]).forEach(function(k){
            var id = P.seasonDefault(k, page);
            assert.equal(id, DEFAULTS[page][k], page + " " + k);
            var parsed = P.parseId(id);
            assert.ok(parsed && parsed.canonical && parsed.page === page, id);
            assert.equal(P.seasonOf(parsed.patch), k, id + " is in " + k);
            assert.ok(listedIds(page).indexOf(id) >= 0, id + " is a listed patch");
        });
        assert.equal(P.pageDefault(page), PAGE_DEFAULTS[page]);
        assert.ok(listedIds(page).indexOf(P.pageDefault(page)) >= 0);
    });
    assert.equal(P.seasonDefault("s8", "masteries"), null);
    assert.equal(P.seasonDefault("s1", "reforged"), null);
});

test("validateSeasons catches broken tables", function(){
    var good = P.readJson(path.join(P.DATA_DIR, "seasons.json"));
    var clone = function(){ return JSON.parse(JSON.stringify(good)); };
    var t = clone(); t.seasons[1].first = "V1.0.0.128";
    assert.ok(P.validateSeasons(t).some(function(e){ return /overlaps/.test(e); }));
    t = clone(); t.seasons[0].pages.masteries["default"] = "m-V1.0.0.129";
    assert.ok(P.validateSeasons(t).some(function(e){ return /outside the page bounds/.test(e); }));
    t = clone(); t.live.patch = "V26.18";
    assert.ok(P.validateSeasons(t).some(function(e){ return /live.patch/.test(e); }));
    t = clone(); t.seasons[2].key = "s2";
    assert.ok(P.validateSeasons(t).some(function(e){ return /duplicate/.test(e); }));
    t = clone(); t.pageDefaults.runes = "s4-final";
    assert.ok(P.validateSeasons(t).some(function(e){ return /pageDefaults.runes/.test(e); }));
    assert.throws(function(){ P.useSeasons(t); }, /invalid seasons table/);
    P.useSeasons(null);   // back to the committed file
    assert.equal(P.seasonOf("V4.20"), "s5");
});

test("DDragon-era boundaries are adjacent live patches (data/sources/ddragon-versions.json or --ddragon)", { skip: !ddragonFile() }, function(){
    var versions = ddragonVersions(ddragonFile());
    var live = [];
    versions.forEach(function(v){
        var m = /^(?:lolpatch_)?(\d+)\.(\d+)(\.\d+)?$/.exec(v);
        if (!m || m[1] === "0") return;
        var p = P.fromDdragon(m[1] + "." + m[2]);
        if (!inList(live, p)) live.push(p);
    });
    live = P.sortPatches(live);
    var idx = function(p){ for (var i = 0; i < live.length; i++) if (P.equal(live[i], p)) return i; return -1; };
    BOUNDARIES.forEach(function(b, i){
        if (P.compare(b[1], "V3.14") < 0) return;    // wiki era: no DDragon
        var at = idx(b[1]);
        assert.ok(at > 0, b[1] + " is a DDragon patch");
        assert.ok(P.equal(live[at - 1], BOUNDARIES[i - 1][2]), "the patch before " + b[1] + " is " + BOUNDARIES[i - 1][2] + " (got " + live[at - 1].label + ")");
    });
    assert.ok(P.equal(live[live.length - 1], P.livePatch()), "latest DDragon patch is live.patch");
    P.PAGES.forEach(function(page){
        listedOf(page).forEach(function(e){
            if (P.compare(e.patch, "V3.6") >= 0) assert.ok(idx(e.patch) >= 0, page + " " + e.patch + " exists in DDragon");
        });
    });
});

// The DDragon versions list: --ddragon <file> (Riot's api/versions.json array,
// or the committed format), default data/sources/ddragon-versions.json.
function ddragonFile() {
    var i = process.argv.indexOf("--ddragon");
    if (i > 0) return process.argv[i + 1];
    var f = path.join(__dirname, "..", "..", "data", "sources", "ddragon-versions.json");
    return fs.existsSync(f) ? f : null;
}
function ddragonVersions(file) {
    var v = P.readJson(file);
    if (Array.isArray(v)) return v;
    var out = [];
    (v.patches || []).forEach(function(e){ (e.builds || []).forEach(function(b){ out.push(b); }); });
    return out;
}

// ---------------------------------------------------------------------------
// Per-patch chrome (§3.5, shard eras §3.2)
// ---------------------------------------------------------------------------

test("eraOf: lcu from V7.1 and for every Reforged patch", function(){
    assert.equal(P.eraOf("V6.24"), "air");
    assert.equal(P.eraOf("V7.1"), "lcu");
    assert.equal(P.eraOf("V7.2"), "lcu");
    listedOf("masteries").forEach(function(e){
        var lcu = ["V7.2", "V7.4", "V7.5", "V7.6", "V7.21"].indexOf(e.patch) >= 0;
        assert.equal(P.eraOf(e.patch, "masteries"), lcu ? "lcu" : "air", e.patch);
    });
    listedOf("runes").forEach(function(e){
        assert.equal(P.eraOf(e.patch, "runes"), e.patch === "V7.21" ? "lcu" : "air", e.patch);
    });
    listedOf("reforged").forEach(function(e){ assert.equal(P.eraOf(e.patch, "reforged"), "lcu"); });
    // the legacy views keep their era (pre-registry rule: only s7-final and preReforged-V7.21 were LCU)
    assert.equal(P.eraOf("V6.22"), "air");    // s7-preseason
    assert.equal(P.eraOf("V5.22"), "air");    // s6-launch
});

test("airPeriodOf: 2010 / 2012 / 2013 / 2014", function(){
    var cases = { "V1.0.0.32": "2010", "V1.0.0.128": "2010", "V1.0.0.129": "2012", "V1.0.0.152": "2012",
        "V1.0.0.154": "2012", "V3.01": "2013", "V3.04": "2013", "V3.6": "2013", "3.6.15": "2013",
        "V3.7": "2014", "V3.13": "2014", "V3.14": "2014", "3.14.41": "2014", "V7.21": "2014" };
    Object.keys(cases).forEach(function(p){ assert.equal(P.airPeriodOf(p), cases[p], p); });
    // the pre-registry season-keyed AIR periods of the legacy views, plus the one documented change
    assert.equal(P.airPeriodOf("V1.0.0.128"), "2010");  // masteries s1
    assert.equal(P.airPeriodOf("V1.0.0.131"), "2012");  // masteries s2
    assert.equal(P.airPeriodOf("V1.0.0.152"), "2012");  // masteries s3 (s3-pbe)
    ["V4.20", "V5.21", "V5.22", "V6.22", "V7.21", "V6.24"].forEach(function(p){ assert.equal(P.airPeriodOf(p), "2014", p); });
    assert.equal(P.airPeriodOf("V3.14"), "2014");       // preReforged-V3.14: was 2013 (DESIGN §3.5)
    listedOf("runes").forEach(function(e){
        var want = e.season === "s1" ? "2010" : e.season === "s2" ? "2012"
            : e.patch === "V1.0.0.152" ? "2012" : e.patch === "V3.04" ? "2013" : "2014";
        assert.equal(P.airPeriodOf(e.patch), want, "runes " + e.patch);
    });
});

test("quintHaloOf and combinerOf (runes)", function(){
    var halo = { "V1.0.0.63": "cream", "V3.13": "cream", "V3.14": "cream", "3.14.41": "cream",
        "V3.15": "ember", "V4.5": "ember", "V4.19": "ember", "V4.20": "ember", "V5.20": "ember",
        "V5.21": "silver", "V6.22": "silver", "V7.21": "silver" };
    Object.keys(halo).forEach(function(p){ assert.equal(P.quintHaloOf(p), halo[p], p); });
    listedOf("runes").forEach(function(e){
        assert.equal(P.combinerOf(e.patch), P.compare(e.patch, "V5.1") < 0, "combiner " + e.patch);
    });
    assert.equal(P.combinerOf("V0.9.22.15"), true);
    assert.equal(P.combinerOf("V0.9.22.9"), false);
    assert.equal(P.combinerOf("V4.21"), true);
    assert.equal(P.combinerOf("V5.1"), false);
    // today's views: combiner on V3.14 / V4.20, not on V5.21 / V6.24 / V7.21
    assert.deepEqual(["V3.14", "V4.20", "V5.21", "V6.24", "V7.21"].map(P.combinerOf), [true, true, false, false, false]);
});

test("masteries: system, look, five-rank layout, AIR icon version", function(){
    listedOf("masteries").forEach(function(e){
        var classic = ["s1", "s2", "s3", "s4", "s5"].indexOf(e.season) >= 0;
        assert.equal(P.systemOf(e.patch), classic ? "classic" : "keystone", e.patch);
        assert.equal(P.lookOf(e.patch), classic ? (e.season === "s1" ? "s1" : "client") : null, e.patch);
        assert.equal(P.airFiveRankLayoutOf(e.patch), classic ? null : (e.season === "s6" ? "edge" : "pair"), e.patch);
        assert.equal(P.airIconVersionOf(e.patch), e.patch === "V6.22" || e.patch === "V6.24" ? "5.22.3" : null, e.patch);
    });
    assert.equal(P.systemOf("V7.22"), null);
    assert.equal(P.systemOf("V0.9.22.15"), null);
});

test("shardEraOf (§3.2)", function(){
    var want = function(p){
        var s = P.seasonOf(p);
        if (s === "s8") return null;
        if (p === "V8.23" || p === "V8.24") return "s8-23";
        if (p === "V9.1") return "s9-1";
        if (s === "s9" || s === "s10") return "s9-2";
        if (s === "s11") return p === "V11.21" || p === "V11.22" ? "s11-21" : "s10-23";
        if (s === "s12" || s === "s13" || p === "V14.1") return "s11-21";
        if (s === "s14") return "s14-2";
        if (s === "s2025") return p === "V25.22" || p === "V25.24" ? "s25-22" : "s14-2";
        if (s === "s2026") return "s25-22";
        throw new Error("unexpected " + p);
    };
    listedOf("reforged").forEach(function(e){ assert.equal(P.shardEraOf(e.patch), want(e.patch), e.patch); });
    assert.equal(P.shardEraOf("V10.22"), "s9-2");
    assert.equal(P.shardEraOf("V11.20"), "s10-23");
    assert.equal(P.shardEraOf("V25.21"), "s14-2");
    assert.throws(function(){ P.shardEraOf("V7.21"); });
});

test("chromeOf bundles the rules per page", function(){
    assert.deepEqual(P.chromeOf("masteries", "V4.5"), { era: "air", airPeriod: "2014", system: "classic", look: "client" });
    assert.deepEqual(P.chromeOf("masteries", "V1.0.0.63"), { era: "air", airPeriod: "2010", system: "classic", look: "s1" });
    assert.deepEqual(P.chromeOf("masteries", "V6.22"), { era: "air", airPeriod: "2014", system: "keystone", airFiveRankLayout: "pair", airIconVersion: "5.22.3" });
    assert.deepEqual(P.chromeOf("masteries", "V7.21"), { era: "lcu", airPeriod: "2014", system: "keystone", airFiveRankLayout: "pair" });
    assert.deepEqual(P.chromeOf("runes", "V4.19"), { era: "air", airPeriod: "2014", combiner: true, quintHalo: "ember" });
    assert.deepEqual(P.chromeOf("runes", "V1.0.0.94(b)"), { era: "air", airPeriod: "2010", combiner: true, quintHalo: "cream" });
    assert.deepEqual(P.chromeOf("reforged", "V8.4"), { era: "lcu", shardEra: null });
    assert.deepEqual(P.chromeOf("reforged", "V26.19"), { era: "lcu", shardEra: "s25-22" });
    assert.throws(function(){ P.chromeOf("masteries", "V8.1"); });
    assert.throws(function(){ P.chromeOf("runes", "V7.22"); });
    assert.throws(function(){ P.chromeOf("nope", "V4.5"); });
});

// ---------------------------------------------------------------------------
// Ids (§4.1) and aliases (§4.2)
// ---------------------------------------------------------------------------

test("idFor: §4.1 examples", function(){
    assert.equal(P.idFor("masteries", "V1.0.0.118b"), "m-V1.0.0.118b");
    assert.equal(P.idFor("masteries", "V4.5"), "m-V4.5");
    assert.equal(P.idFor("masteries", "V6.12"), "m-V6.12");
    assert.equal(P.idFor("masteries", "4.5.4"), "m-V4.5");
    assert.equal(P.idFor("runes", "V1.0.0.94(b)"), "preReforged-V1.0.0.94b");
    assert.equal(P.idFor("runes", "V3.04"), "preReforged-V3.04");
    ["V3.14", "V4.20", "V5.21", "V7.21"].forEach(function(p){ assert.equal(P.idFor("runes", p), "preReforged-" + p); });
    assert.equal(P.idFor("reforged", "V8.4"), "rr-v8-4");
    assert.equal(P.idFor("reforged", "V25.S1.1"), "rr-v25-1");
    assert.equal(P.idFor("reforged", "V25.05"), "rr-v25-5");
    assert.equal(P.idFor("reforged", "V26.01"), "rr-v26-1");
    assert.equal(P.idFor("reforged", "V26.19"), "rr-v26-19");
    assert.throws(function(){ P.idFor("reforged", "15.1.1"); }, /fromDdragon/);   // DDragon numbering is not a patch
    assert.equal(P.idFor("reforged", P.fromDdragon("15.1.1")), "rr-v25-1");
    assert.throws(function(){ P.idFor("reforged", "V7.21"); });
    assert.throws(function(){ P.idFor("nope", "V4.5"); });
});

test("ids: unique, URL-safe, round-trip through parseId for all 191 listed patches", function(){
    P.PAGES.forEach(function(page){
        var ids = listedIds(page), seen = {};
        listedOf(page).forEach(function(e, i){
            var id = ids[i];
            assert.ok(!seen[id], "duplicate " + id); seen[id] = true;
            assert.ok(P.ID_PATTERNS[page].test(id), id);
            assert.equal(encodeURIComponent(id), id, id + " is URL-safe");
            assert.ok(id.indexOf("|") < 0);
            var back = P.parseId(id);
            assert.equal(back.page, page);
            assert.ok(back.canonical, id);
            assert.ok(P.equal(back.patch, e.patch), id);
        });
    });
    assert.equal(P.parseId("s4-final"), null);
    assert.equal(P.parseId("rr-v99"), null);
    assert.equal(P.parseId(null), null);
    assert.equal(P.parseId("m-V3.4").canonical, false);       // canonical spelling is m-V3.04
    assert.equal(P.parseId("preReforged-V6.24").canonical, true);  // well-formed, unlisted
});

test("aliases.json: every legacy id resolves as §4.2 says", function(){
    var A = P.aliases();
    assert.deepEqual(P.validateAliases(A), []);
    var total = 0;
    P.PAGES.forEach(function(page){
        var ids = listedIds(page);
        Object.keys(LEGACY[page]).forEach(function(old){
            var want = LEGACY[page][old], to;
            var keep = ((A.keep || {})[page] || []).indexOf(old) >= 0;
            if (A[page][old]) {
                assert.ok(!keep, old + " is both kept and aliased");
                to = A[page][old].to;
                if (page === "masteries") assert.equal(A[page][old].codec, want[2], old + " codec");
            } else {
                assert.ok(keep, old + " must be aliased or kept");
                to = old;
            }
            assert.equal(to, want[0], old);
            assert.ok(ids.indexOf(to) >= 0, old + " -> " + to + " is listed");
            assert.equal(P.seasonOf(P.parseId(to).patch), want[1], old + " season now");
            total++;
        });
        // nothing extra in the alias or keep tables
        Object.keys(A[page]).forEach(function(old){ assert.ok(LEGACY[page][old], "unexpected alias " + old); });
        ((A.keep || {})[page] || []).forEach(function(id){ assert.ok(LEGACY[page][id], "unexpected keep " + id); });
    });
    assert.equal(A.plain.masteries.to, "m-V1.0.0.152");
    assert.equal(A.plain.masteries.codec, "s3-pbe");
    assert.equal(A.plain.runes.to, "preReforged-V7.21");
    assert.equal(total + 1, 24);   // + the plain mastery code = the 24 legacy ids of check G5
    // the unlisted-patch rule (§2.3 step 3) agrees with the explicit aliases
    assert.equal(P.idFor("runes", P.latestAtOrBefore(LISTED.runes.s7, "V6.24")), A.runes["preReforged-V6.24"].to);
    assert.equal(P.idFor("reforged", P.latestAtOrBefore(LISTED.reforged.s13, "V12.23")), A.reforged["rr-v12-23"].to);
});

test("validateAliases catches broken tables", function(){
    var bad = { masteries: { "s4-final": { to: "m-V4.20" } }, runes: { x: { to: "preReforged-V3.4" } },
                reforged: { "rr-v12-23": { to: "rr-v12-23" } } };
    var errs = P.validateAliases(bad);
    assert.ok(errs.some(function(e){ return /codec missing/.test(e); }));
    assert.ok(errs.some(function(e){ return /runes.x.to/.test(e); }));
    assert.ok(errs.some(function(e){ return /itself/.test(e); }));
});

// ---------------------------------------------------------------------------
// Labels (§3.3)
// ---------------------------------------------------------------------------

test("labels: §3.3 examples and tag rules", function(){
    var L = function(page, rec){ return P.labelFor(page, rec); };
    // examples
    assert.equal(L("runes", { patch: "V1.0.0.63", confidence: "low" }), "V1.0.0.63 (approx.)");
    assert.equal(L("masteries", "V5.22"), "V5.22 (Preseason 6)");
    assert.equal(L("reforged", "V8.4"), "V8.4");
    assert.equal(L("reforged", "V26.19"), "V26.19 (Current)");
    // Preseason N on the first season start with a preseason
    [["masteries", "V1.0.0.129", 2], ["masteries", "V1.0.0.152", 3], ["masteries", "V3.14", 4],
     ["masteries", "V4.20", 5], ["masteries", "V5.22", 6], ["masteries", "V6.22", 7],
     ["runes", "V1.0.0.129", 2], ["runes", "V1.0.0.152", 3], ["runes", "V3.14", 4], ["runes", "V4.20", 5],
     ["runes", "V5.22", 6], ["reforged", "V9.23", 10], ["reforged", "V10.23", 11],
     ["reforged", "V11.23", 12], ["reforged", "V12.22", 13]].forEach(function(c){
        assert.equal(L(c[0], c[1]), c[1] + " (Preseason " + c[2] + ")", c.join(" "));
    });
    assert.equal(L("masteries", "V1.0.0.32"), "V1.0.0.32 (Launch)");
    assert.equal(L("reforged", "V7.22"), "V7.22 (Runes Reforged)");
    assert.equal(L("reforged", "V14.1"), "V14.1 (Season start)");
    assert.equal(L("reforged", "V26.01"), "V26.01 (Season start)");
    assert.equal(L("reforged", "V26.1"), "V26.01 (Season start)");      // research spelling
    // season ends
    assert.equal(L("masteries", "V7.21"), "V7.21 (Final masteries)");
    assert.equal(L("runes", "V7.21"), "V7.21 (Final pre-Reforged)");
    ["V1.0.0.151", "V3.13", "V4.19", "V5.21", "V6.21"].forEach(function(p){
        assert.equal(L("masteries", p), p + " (Season end)", p);
        assert.equal(L("runes", p), p + " (Season end)", p);
    });
    ["V8.22", "V9.22", "V10.22", "V11.22", "V12.21", "V13.24", "V14.24", "V25.24"].forEach(function(p){
        assert.equal(L("reforged", p), p + " (Season end)", p);
    });
    assert.equal(L("runes", "V1.0.0.128"), "V1.0.0.128 (Season end)");
    assert.equal(L("masteries", { patch: "V1.0.0.128", confidence: "low" }), "V1.0.0.128 (Season end) (approx.)");
    // curated tags, per page
    assert.equal(L("masteries", "V5.10"), "V5.10 (Utility rework)");
    assert.equal(L("masteries", "V5.12"), "V5.12 (Defense rework)");
    assert.equal(L("runes", "V4.5"), "V4.5 (Rune rework)");
    assert.equal(L("masteries", "V4.5"), "V4.5");
    assert.equal(L("runes", "V6.22"), "V6.22 (Lethality)");
    assert.equal(L("masteries", "V6.22"), "V6.22 (Preseason 7)");
    assert.equal(L("reforged", "V8.6"), "V8.6 (Conqueror)");
    assert.equal(L("reforged", "V8.23"), "V8.23 (Preseason 9 · Stat shards)");
    assert.equal(L("reforged", "V14.10"), "V14.10 (Rune rework)");
    assert.equal(L("reforged", "V25.S1.1"), "V25.S1.1 (Season start · Domination rework)");
    assert.equal(L("reforged", "V25.1"), "V25.S1.1 (Season start · Domination rework)");
    assert.equal(L("reforged", "V26.09"), "V26.09 (Deathfire Touch)");
    // plain patches, display names
    assert.equal(L("runes", "V1.0.0.94(b)"), "V1.0.0.94(b)");
    assert.equal(L("masteries", "V1.0.0.118b"), "V1.0.0.118b");
    assert.equal(L("runes", "V3.04"), "V3.04");
    assert.equal(L("reforged", "V25.05"), "V25.05");
    assert.equal(L("runes", { patch: "V1.0.0.72", confidence: "medium" }), "V1.0.0.72");
    // listing fields win
    assert.equal(L("masteries", { patch: "V4.5", tag: "Custom" }), "V4.5 (Custom)");
    assert.equal(L("masteries", { patch: "V5.22", tag: "" }), "V5.22");
    assert.equal(L("masteries", { patch: "V5.22", tag: "", confidence: "low" }), "V5.22 (approx.)");
    assert.equal(L("masteries", { patch: "V5.22", label: "Anything", confidence: "low" }), "Anything");
    assert.equal(P.tagFor("reforged", "V8.4"), "");
});

test("labels: every listed patch gets a short, unique label", function(){
    var longest = "";
    P.PAGES.forEach(function(page){
        var seen = {};
        listedOf(page).forEach(function(e){
            var label = P.labelFor(page, e.patch);
            assert.ok(/^V\d/.test(label), label);
            assert.ok(!seen[label], "duplicate label " + label); seen[label] = true;
            if (label.length > longest.length) longest = label;
        });
    });
    // "about 30 characters" (§3.3); the longest is the curated V25.S1.1 tag
    assert.equal(longest, "V25.S1.1 (Season start · Domination rework)");
    assert.ok(longest.length <= 44);
});

// ---------------------------------------------------------------------------
// Content hash, JSON formatting, generated files
// ---------------------------------------------------------------------------

test("contentHash: key order does not matter, values and array order do", function(){
    var a = { runes: [{ id: "5245", base: { ad: 0.95, ap: 1 } }, { id: "5246" }], v: 1 };
    var b = { v: 1, runes: [{ base: { ap: 1, ad: 0.95 }, id: "5245" }, { id: "5246" }] };
    assert.match(P.contentHash(a), /^[0-9a-f]{64}$/);
    assert.equal(P.contentHash(a), P.contentHash(b));
    assert.notEqual(P.contentHash(a), P.contentHash({ v: 1, runes: [a.runes[1], a.runes[0]] }));
    assert.notEqual(P.contentHash(a), P.contentHash({ v: 1, runes: [{ id: "5245", base: { ad: 0.951, ap: 1 } }, { id: "5246" }] }));
    assert.notEqual(P.contentHash({ x: "1" }), P.contentHash({ x: 1 }));
    assert.equal(P.contentHash({ x: 1, y: undefined }), P.contentHash({ x: 1 }));
    assert.equal(P.contentHash({ x: -0 }), P.contentHash({ x: 0 }));
    assert.equal(P.contentHash(null), P.contentHash(null));
    assert.throws(function(){ P.contentHash({ x: NaN }); }, /non-finite/);
    assert.throws(function(){ P.contentHash([1, undefined]); }, /undefined/);
    assert.equal(P.stableStringify({ b: [2, { d: 1, c: 0 }], a: "x" }), '{"a":"x","b":[2,{"c":0,"d":1}]}');
});

test("formatJson: compact by default, width-wrapped otherwise, always valid JSON", function(){
    var v = { system: "classic", data: [[{ key: "a", ranks: 4, rankDesc: ["x", "y"] }, { key: "b", ranks: 1 }], []], n: null, e: {} };
    assert.equal(P.formatJson(v), JSON.stringify(v));
    [20, 40, 80, 300].forEach(function(w){
        var text = P.formatJson(v, { width: w });
        assert.deepEqual(JSON.parse(text), v, "width " + w);
        // a line may only overflow when it holds one scalar (e.g. a long string)
        text.split("\n").forEach(function(line){
            var value = line.replace(/^\s*("[^"]*": )?/, "");
            assert.ok(line.length <= w || !/^[\[{]./.test(value), "width " + w + ": " + line);
        });
    });
    var long = { a: ["x".repeat(50), 1] };
    assert.deepEqual(P.formatJson(long, { width: 30 }).split("\n").map(function(l){ return l.length; }), [1, 7, 55, 3, 2, 1]);
    assert.equal(P.formatJson(v, { width: 300 }).split("\n").length, 1);
    assert.ok(P.formatJson(v, { width: 20 }).split("\n").length > 5);
    var ls = String.fromCharCode(0x2028);
    var esc = P.formatJson({ s: "a" + ls + "b" });
    assert.ok(esc.indexOf(ls) < 0 && esc.indexOf("\\u2028") > 0);
    assert.equal(JSON.parse(esc).s, "a" + ls + "b");
});

function runGenerated(text) {
    var calls = [];
    var sandbox = { LolData: { register: function(kind, key, payload){ calls.push([kind, key, payload]); } } };
    vm.createContext(sandbox);
    vm.runInContext(text, sandbox);
    return JSON.parse(JSON.stringify(calls));
}

test("renderGenerated: §1.6 header and one register call", function(){
    var payload = { system: "classic", maxPoints: 30, data: [[{ key: "double-edged-sword", ranks: 1 }]] };
    var text = P.renderGenerated({
        generator: "tools/build-masteries.js", source: "DDragon 4.5.4 mastery.json",
        overrides: ["mo-003", "mo-011"], patches: ["V4.5"],
        kind: "masteries", key: "m-V4.5", payload: payload
    });
    var lines = text.split("\n");
    assert.equal(lines[0], "// GENERATED by tools/build-masteries.js — do not edit. Source: DDragon 4.5.4 mastery.json.");
    assert.equal(lines[1], "// Overrides: mo-003, mo-011. Patches using this file: V4.5.");
    assert.ok(/^LolData\.register\("masteries", "m-V4\.5", \{/.test(lines[2]));
    assert.equal(lines[lines.length - 1], "");
    assert.ok(text.indexOf("\r") < 0);
    assert.equal((text.match(/LolData\.register\(/g) || []).length, 1);
    assert.ok(!/\bfetch\b|XMLHttpRequest/.test(text));
    assert.deepEqual(runGenerated(text), [["masteries", "m-V4.5", payload]]);

    var none = P.renderGenerated({ generator: "g.js", source: "x.", patches: [P.parse("V5.21"), "V5.22"],
        kind: "runes", key: "catalog-V5.21", payload: { runes: [] } });
    assert.equal(none.split("\n")[1], "// Overrides: none. Patches using this file: V5.21, V5.22.");
    assert.equal(none.split("\n")[0], "// GENERATED by g.js — do not edit. Source: x.");

    var multi = P.renderGenerated({ generator: "tools/build-masteries.js", source: "tools/fixtures/legacy-codecs.json",
        registrations: [{ kind: "masteries-legacy", key: "s4-final", payload: { system: "classic", trees: [] } },
                        { kind: "masteries-legacy", key: "s6-launch", payload: { system: "keystone", trees: [] } }] });
    assert.equal(runGenerated(multi).length, 2);

    assert.throws(function(){ P.renderGenerated({ generator: "g", source: "a\nb", patches: ["V4.5"], kind: "k", key: "x", payload: {} }); }, /one line/);
    assert.throws(function(){ P.renderGenerated({ generator: "g", patches: ["V4.5"], kind: "k", key: "bad key", payload: {} }); }, /bad key/);
    assert.throws(function(){ P.renderGenerated({ generator: "g", patches: ["V4.5"], kind: "k", key: "x" }); }, /payload missing/);
    assert.throws(function(){ P.renderGenerated({ generator: "g", kind: "k", key: "x", payload: {} }); }, /patches missing/);
});

test("writeGenerated / writeJson: named after the key, idempotent", function(){
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "patches-test-"));
    try {
        var opts = { generator: "t.js", source: "test", patches: ["V8.4"], kind: "reforged", key: "rr-v8-4",
                     payload: { perkText: { 8005: ["short", null] }, subStyleBonus: null } };
        var file = path.join(dir, "sub", "rr-v8-4.js");
        var r1 = P.writeGenerated(file, opts);
        assert.equal(r1.changed, true);
        assert.ok(r1.bytes > 0);
        assert.equal(P.writeGenerated(file, opts).changed, false);
        var LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").split(LF).join(CRLF));   // a CRLF checkout
        assert.equal(P.writeGenerated(file, opts).changed, false);
        assert.deepEqual(runGenerated(fs.readFileSync(file, "utf8")), [["reforged", "rr-v8-4", opts.payload]]);
        opts.payload = { perkText: null, subStyleBonus: null };
        assert.equal(P.writeGenerated(file, opts).changed, true);
        assert.throws(function(){ P.writeGenerated(path.join(dir, "other.js"), opts); }, /named after its key/);
        var jf = path.join(dir, "manifest.json");
        assert.equal(P.writeJson(jf, { b: 1, a: [1] }).changed, true);
        assert.equal(P.writeJson(jf, { b: 1, a: [1] }).changed, false);
        assert.equal(fs.readFileSync(jf, "utf8"), '{\n  "b": 1,\n  "a": [\n    1\n  ]\n}\n');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
