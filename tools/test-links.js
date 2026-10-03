#!/usr/bin/env node
// tools/test-links.js: check L of DESIGN §7.1. Every legacy share link that
// P0-A froze in tools/fixtures/legacy-links.json (586 records over the 23
// legacy ids) must decode through alias -> legacy codec -> canonical dataset
// to the recorded key->rank map / rune ids / Reforged picks, and the
// canonical link it is rewritten to must round-trip.
//
// The only allowed differences are the documented ones (§7.1 L): the
// Demolisher point of s1-final links (removed in V1.0.0.63) and whatever
// that removal takes with it (tier requirements of the same tree), plus
// value-only corrections, which never change points.
//
// Sections (each reports PASS / FAIL / SKIP; a missing input is a SKIP):
//   L0  the reference codecs reproduce the baseline: every record decodes
//       with the P0 fixture codecs to `expected` and re-encodes to its
//       rewrite (validates this tool against the baseline commit). Plus
//       the ids alone (ID_ALONE and every id the README's "Share links"
//       section names, no "|"): by the spec each opens its patch (listed,
//       alias, unlisted; or the page default for an unknown id) with an
//       empty build; none can be a plain code; and lol-data.js
//       LolPatches.fromHash agrees, while every fixture hash without "|"
//       keeps its old meaning (plain codes stay plain)
//   L1  data/masteries/legacy-codecs.js (T2) equals the P0 fixture codecs
//       position by position (ranks, hashRanks, hashNote, keystone tiers);
//       keys may only be renamed by the curated aliases of §1.7
//   L2  alias -> codec -> canonical import (§4.3-§4.5) per record, over the
//       generated data: the result, its validity and the canonical hash
//       (`m-V…|<code>[|name]`, `preReforged-V…|…`, `rr-v…|…`), which must
//       decode back to the same state
//   L3  --browser: the same records opened in the real pages (headless
//       Edge / Chrome over file://, one fresh tab per record): the page
//       must rewrite the URL to the canonical hash of L2, set the share
//       link to it, and log no console error. The ids alone too: each must
//       become its empty canonical link (m-V4.5 -> m-V4.5|) with no toast.
//       Skipped while the pages still run the pre-rework calculators
//       (html[data-lol-shell="legacy"] or no patch-registry.js)
//
// Usage (from the repo root)
//   node tools/test-links.js [--root <site>] [--only masteries|runes|reforged|<legacy id>|id-alone,…]
//        [--research <scratchpad>\patches] [--reforged-cache <dir>]
//        [--browser [--browser-exe <exe>] [--par N] [--limit N]]
//        [--legacy-baseline <site>] [--json <file>] [--verbose] [--allow-skip]
//   --research        the research folder; its raw/reforged/ holds the Data
//                     Dragon runesReforged-<build>.json catalogs (Reforged L0/L2)
//   --reforged-cache  that catalog folder directly (default <research>/raw/reforged)
//   --browser         run L3 (Node 22+: built-in WebSocket). Runtime catalogs are
//                     served from the cache; every other remote request is
//                     blocked, so the run never touches the network
//   --limit N         at most N records per legacy id in L3
//   --legacy-baseline <site>   run L3 against an exported baseline site with the
//                     P0 expectations instead (a smoke test of the driver)
// Exit code: 0 all ran and passed, 1 a failure, 2 incomplete (skips).
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");
const CP = require("./check-patches.js");
const P = require("./lib/patches.js");

const { World, Reporter } = CP;
const U = CP.util, C = CP.codec, K = CP.carry;
const SPEC = CP.SPEC;

// Documented differences of a legacy import (§4.2, §7.1 L).
const ALLOWED_DROPS = {
    "s1-final": { keys: ["demolisher"], cascade: true,
        why: "Demolisher was removed in V1.0.0.63 (§4.2); points that needed it for a tier requirement go with it" }
};

// The only key renames a legacy codec may carry against the P0 fixture
// (the fixture keys are slugs of the legacy names; DESIGN §1.7 curated aliases).
const ALLOWED_RENAMES = { "stoneborn-pact": "bond-of-stone" };

// Ids alone: share links that are a dataset id with no "|" ([hash, the
// listed id it opens, null = an unknown id: the page default]). Each opens
// with an empty build. Not P0 fixtures: the baseline read a mastery / rune
// hash without "|" as a plain code (index.html#m-V4.5 opened V1.0.0.152
// with bogus points). The ids of the README's "Share links" section are
// added at run time (readmeIds), so every example there is checked as
// written.
const ID_ALONE = {
    masteries: [
        ["m-V4.5", "m-V4.5"], ["m-V1.0.0.118b", "m-V1.0.0.118b"], ["m-V5.23", "m-V5.23"],
        ["m-V4.7", "m-V4.5"], ["s1-final", "m-V1.0.0.128"], ["s4-final", "m-V4.20"], ["s7-final", "m-V7.21"],
        ["m-V1.0.0.152", "m-V1.0.0.152"], ["m-V1.0.0.10", null]
    ],
    runes: [
        ["preReforged-V4.5", "preReforged-V4.5"], ["preReforged-V1.0.0.94b", "preReforged-V1.0.0.94b"],
        ["preReforged-V3.04", "preReforged-V3.04"], ["preReforged-V3.6", "preReforged-V3.04"],
        ["preReforged-V6.24", "preReforged-V6.22"], ["preReforged-V7.21", "preReforged-V7.21"]
    ],
    reforged: [
        ["rr-v8-4", "rr-v8-4"], ["rr-v25-1", "rr-v25-1"], ["rr-v26-19", "rr-v26-19"],
        ["rr-v12-23", "rr-v12-22"], ["rr-v8-17", "rr-v8-16"], ["rr-v7-21", null]
    ]
};
const ID_ALONE_GROUP = "id-alone";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function fixtures(world) {
    const links = world.fixtureLinks(), codecs = world.fixtureCodecs();
    if (!links.value || !codecs.value) return null;
    return { links: links.value, codecs: codecs.value };
}

function reforgedCache(args) {
    if (args["reforged-cache"]) return path.resolve(String(args["reforged-cache"]));
    if (args.research) return path.join(path.resolve(String(args.research)), "raw", "reforged");
    return null;
}
function catalogLoader(dir) {
    const cache = {};
    return function (ver) {
        if (!dir || !ver) return null;
        if (ver in cache) return cache[ver];
        const t = U.readText(path.join(dir, "runesReforged-" + ver + ".json"));
        let v = null;
        try { v = t ? JSON.parse(t) : null; } catch (e) { v = null; }
        cache[ver] = Array.isArray(v) ? v : null;
        return cache[ver];
    };
}

// Shard rows of a registry shard era id from the (reworked) runes-reforged-data.js.
function shardRowsFor(world, era) {
    if (!era) return { rows: null };
    const st = world.shardTables();
    if (st.missing || st.error) return { rows: null, why: "runes-reforged-data.js " + (st.missing ? "missing" : st.error) };
    const t = st.eras[era];
    if (!t) return { rows: null, why: "reforgedShardEras has no " + era + (st.reworked ? "" : " (T7b pending)") };
    return { rows: t.rows || t };
}

function aliasesOf(world) { return (world.aliasesJson().value) || {}; }

// The canonical entry a legacy hash opens (spec resolution: id, alias, plain).
function resolveLegacy(world, page, id) {
    const A = aliasesOf(world);
    const list = world.entries(page).list;
    if (!list) return { why: world.entries(page).why };
    const byId = {};
    list.forEach(function (e) { byId[e.id] = e; });
    if (id == null) {
        const pl = (A.plain || {})[page];
        if (!pl || !byId[pl.to]) return { why: "no plain alias for " + page };
        return { entry: byId[pl.to], alias: pl };
    }
    if (byId[id]) return { entry: byId[id], alias: null };
    const a = (A[page] || {})[id];
    if (a && byId[a.to]) return { entry: byId[a.to], alias: a };
    return { why: id + " does not resolve" };
}

// Position map fixture codec key -> T2 codec key (the curated renames).
function codecKeyMap(fixtureCodec, t2Codec) {
    const map = {}, problems = [];
    if (!t2Codec) return { map: null, problems: ["missing"] };
    if (fixtureCodec.system !== (t2Codec.system || fixtureCodec.system)) problems.push("system " + t2Codec.system + " vs " + fixtureCodec.system);
    if (fixtureCodec.system === "classic") {
        const a = fixtureCodec.trees, b = t2Codec.trees || [];
        if (b.length !== a.length) problems.push(b.length + " trees, expected " + a.length);
        a.forEach(function (tree, t) {
            const bt = b[t] || [];
            if (bt.length !== tree.length) problems.push("tree " + t + ": " + bt.length + " fields, expected " + tree.length);
            tree.forEach(function (m, i) {
                const n = bt[i];
                if (!n) return;
                if (n.ranks !== m.ranks) problems.push("tree " + t + " #" + i + " " + m.key + ": ranks " + n.ranks + ", fixture " + m.ranks);
                if ((n.hashRanks == null ? null : n.hashRanks) !== (m.hashRanks == null ? null : m.hashRanks)) problems.push("tree " + t + " #" + i + " " + m.key + ": hashRanks " + n.hashRanks + ", fixture " + m.hashRanks);
                if ((n.hashNote || null) !== (m.hashNote || null)) problems.push("tree " + t + " #" + i + " " + m.key + ": hashNote " + JSON.stringify(n.hashNote) + ", fixture " + JSON.stringify(m.hashNote));
                (map[t] = map[t] || {})[m.key] = n.key;
            });
        });
    } else {
        const a = fixtureCodec.trees, b = t2Codec.trees || [];
        if (b.length !== a.length) problems.push(b.length + " trees, expected " + a.length);
        a.forEach(function (tree, t) {
            const bt = b[t] || {};
            if (bt.id !== tree.id) problems.push("tree " + t + ": " + bt.id + ", expected " + tree.id);
            const bTiers = bt.tiers || [];
            if (bTiers.length !== tree.tiers.length) problems.push(tree.id + ": " + bTiers.length + " tiers, expected " + tree.tiers.length);
            tree.tiers.forEach(function (keys, j) {
                const bk = (bTiers[j] || []).map(function (k) { return k && typeof k === "object" ? (k.key || k.id) : k; });
                if (bk.length !== keys.length) problems.push(tree.id + " tier " + (j + 1) + ": " + bk.length + " options, expected " + keys.length);
                keys.forEach(function (k, p) { (map[tree.id] = map[tree.id] || {})[k] = bk[p]; });
            });
        });
    }
    return { map: map, problems: problems };
}
function renameClassic(maps, keyMap) {
    return maps.map(function (o, t) {
        const out = {};
        Object.keys(o).forEach(function (k) { out[keyMap && keyMap[t] && keyMap[t][k] ? keyMap[t][k] : k] = o[k]; });
        return out;
    });
}
function renameKeystone(trees, ks, keyMap) {
    const out = {};
    let kOut = ks;
    Object.keys(trees).forEach(function (tid) {
        out[tid] = {};
        Object.keys(trees[tid]).forEach(function (k) {
            const nk = keyMap && keyMap[tid] && keyMap[tid][k] ? keyMap[tid][k] : k;
            out[tid][nk] = trees[tid][k];
            if (k === ks) kOut = nk;
        });
    });
    return { trees: out, keystone: kOut };
}
function totalClassic(maps) { return maps.reduce(function (a, o) { return a + Object.values(o).reduce(function (x, y) { return x + y; }, 0); }, 0); }
function totalKeystone(trees) { let n = 0; Object.keys(trees).forEach(function (t) { Object.values(trees[t]).forEach(function (r) { n += r; }); }); return n; }

// ---------------------------------------------------------------------------
// L0: reference codecs vs the baseline
// ---------------------------------------------------------------------------

function legacyDecodeMasteries(codec, code) {
    if (codec.system === "classic") {
        const spec = C.classicCodecFrom(codec.trees);
        const d = C.classicDecode(spec, code);
        return { system: "classic", spec: spec, maps: C.classicRanksToMaps(spec, d.ranks), notes: d.notes, bad: d.bad };
    }
    const spec = C.keystoneCodecFrom(codec);
    const st = C.keystoneDecode(spec, code);
    const m = C.keystoneToMaps(spec, st);
    return { system: "keystone", spec: spec, trees: m.trees, keystone: m.keystone, state: st };
}
function legacyEncodeMasteries(codec, dec, expected) {
    if (codec.system === "classic") return C.classicEncode(dec.spec, C.classicMapsToRanks(dec.spec, expected.trees));
    return C.keystoneEncode(dec.spec, C.keystoneFromMaps(dec.spec, expected.trees, expected.keystone));
}
function legacyHash(id, codec, code, name) {
    // the baseline link writers with the legacy id (default set s3-pbe)
    if (codec.system === "classic") return C.classicHash(id, code, name, "s3-pbe");
    return C.keystoneHash(id, code, name);
}

function checkL0(world, fx, c, args) {
    const datasets = fx.codecs.datasets;
    let n = 0, bad = 0;
    Object.keys(fx.links.masteries).forEach(function (id) {
        if (!selected(args, "masteries", id)) return;
        const codec = datasets[id];
        fx.links.masteries[id].forEach(function (r, i) {
            n++;
            const h = C.parseMasteryHash(r.hash);
            const dec = legacyDecodeMasteries(codec, h.code);
            const w = id + " #" + i + " (" + r.form + ")";
            if (codec.system === "classic") {
                if (!U.deepEqual(dec.maps, r.expected.trees)) { c.fail(w + ": decodes to " + JSON.stringify(dec.maps) + ", recorded " + JSON.stringify(r.expected.trees)); bad++; return; }
                if (!U.deepEqual(dec.notes, r.expected.notes || [])) { c.fail(w + ": notes " + JSON.stringify(dec.notes) + ", recorded " + JSON.stringify(r.expected.notes || [])); bad++; }
            } else {
                if (!U.deepEqual(dec.trees, r.expected.trees) || (dec.keystone || null) !== (r.expected.keystone || null)) { c.fail(w + ": decodes to " + JSON.stringify(dec.trees) + " ks " + dec.keystone); bad++; return; }
            }
            const code = legacyEncodeMasteries(codec, dec, r.expected);
            const hash = legacyHash(id, codec, code, r.expected.name);
            const want = r.rewrite != null ? r.rewrite : r.hash;
            const wantNorm = codec.system === "keystone" && r.rewrite == null ? C.keystoneHash(id, code, r.expected.name) : want;
            if (hash !== wantNorm && hash !== want) { c.fail(w + ": re-encodes to " + JSON.stringify(hash) + ", the baseline wrote " + JSON.stringify(want)); bad++; }
        });
    });
    if (n && !bad) c.pass("masteries: " + n + " fixture records decode with the reference codec to the recorded state and re-encode to the baseline's own hash");
    // runes: parse + the baseline writer
    let rn = 0, rb = 0;
    Object.keys(fx.links.runes).forEach(function (id) {
        if (!selected(args, "runes", id)) return;
        fx.links.runes[id].forEach(function (r, i) {
            rn++;
            const h = C.parseRuneHash(r.hash);
            const slots = h.slotIds.slice(0, 30).map(function (x) { return !x || x === "_" ? null : x; });
            while (slots.length < 30) slots.push(null);
            const want = r.rewrite != null ? r.rewrite : r.hash;
            const got = C.runeHash(h.id || "preReforged-V7.21", r.expected.slots, r.expected.level, "preReforged-V7.21");
            if (!U.deepEqual(slots, r.expected.slots) || h.level !== r.expected.level) { c.fail(id + " #" + i + " (" + r.form + "): parses to " + JSON.stringify(slots) + " level " + h.level); rb++; }
            else if (got !== want) { c.fail(id + " #" + i + ": writes " + JSON.stringify(got) + ", the baseline wrote " + JSON.stringify(want)); rb++; }
        });
    });
    if (rn && !rb) c.pass("runes: " + rn + " fixture records parse to the recorded slots and re-encode to the baseline hash");
    // reforged: decode against the baseline's own catalogs (cached)
    const load = catalogLoader(reforgedCache(args));
    let fn = 0, fb = 0, fnc = 0;
    Object.keys(fx.links.reforged).forEach(function (id) {
        if (!selected(args, "reforged", id)) return;
        const ver = (fx.links.about.reforgedCatalogs[id] || {}).ddragon;
        const cat = load(ver);
        if (!cat) { fnc++; return; }
        // the baseline's shard tables are not needed: the fixtures only hold valid shards
        fx.links.reforged[id].forEach(function (r, i) {
            fn++;
            const parsed = C.parseReforgedHash(r.hash);
            const st = K.reforgedApply(cat, null, parsed);
            const exp = r.expected;
            if (!U.deepEqual(st, exp)) { c.fail(id + " #" + i + " (" + r.form + "): decodes to " + JSON.stringify(st) + ", recorded " + JSON.stringify(exp)); fb++; return; }
            const want = r.rewrite != null ? r.rewrite : r.hash;
            const got = C.reforgedHash(id, st);
            if (got !== want) { c.fail(id + " #" + i + ": writes " + JSON.stringify(got) + ", the baseline wrote " + JSON.stringify(want)); fb++; }
        });
    });
    if (fnc) c.skip("reforged: no cached catalog for " + fnc + " legacy id(s) (pass --research <dir> or --reforged-cache <dir>)");
    if (fn && !fb) c.pass("reforged: " + fn + " fixture records decode against the cached baseline catalogs and re-encode to the baseline hash");
}

// ---------------------------------------------------------------------------
// L1: T2's legacy-codecs.js vs the fixture codecs
// ---------------------------------------------------------------------------

function checkL1(world, fx, c) {
    const lc = world.legacyCodecs();
    if (lc.missing) { c.skip("data/masteries/legacy-codecs.js missing (T2 pending)"); return null; }
    if (lc.error) { c.fail("data/masteries/legacy-codecs.js: " + lc.error); return null; }
    const maps = {};
    let bad = 0;
    Object.keys(fx.codecs.datasets).forEach(function (id) {
        const r = codecKeyMap(fx.codecs.datasets[id], lc.map[id]);
        if (!r.map) { c.fail(id + ": not in legacy-codecs.js"); bad++; return; }
        r.problems.forEach(function (p) { c.fail(id + ": " + p); bad++; });
        maps[id] = r.map;
        const renames = [];
        Object.keys(r.map).forEach(function (t) { Object.keys(r.map[t]).forEach(function (k) { if (r.map[t][k] !== k) renames.push(k + " -> " + r.map[t][k]); }); });
        const odd = renames.filter(function (r) { const kv = r.split(" -> "); return ALLOWED_RENAMES[kv[0]] !== kv[1]; });
        odd.forEach(function (r) { c.fail(id + ": key renamed " + r + " (not a curated alias of DESIGN §1.7)"); bad++; });
        if (renames.length > odd.length) c.info(id + ": curated key renames " + renames.filter(function (r) { return odd.indexOf(r) < 0; }).join(", "));
    });
    if (!bad) c.pass("legacy-codecs.js holds the 8 fixture codecs field by field (order, ranks, hashRanks, hashNote, keystone tiers)");
    return maps;
}

// ---------------------------------------------------------------------------
// L2: alias -> codec -> canonical
// ---------------------------------------------------------------------------

function selected(args, page, id) {
    if (!args.only || !args.only.length) return true;
    return args.only.some(function (o) { return o === page || o === id; });
}

// Predicted canonical result of one fixture record: {hash, state, problems, info}
function predictMastery(world, fx, keyMaps, legacyId, r) {
    const out = { problems: [], info: [] };
    const h = C.parseMasteryHash(r.hash);
    const codecKey = legacyId;
    const res = resolveLegacy(world, "masteries", h.plain ? null : h.id);
    if (!res.entry) { out.skip = res.why; return out; }
    const ds = world.dataset(res.entry);
    if (!ds) { out.skip = res.entry.id + ": " + (world.payload(res.entry).why || "no data"); return out; }
    const lc = world.legacyCodecs();
    const fixtureCodec = fx.codecs.datasets[codecKey];
    const t2Codec = lc.map && lc.map[codecKey];
    if (!t2Codec) { out.skip = "legacy codec " + codecKey + " not in data/masteries/legacy-codecs.js"; return out; }
    const fam = (SPEC.FAMILIES.filter(function (f) { return f.codecs.indexOf(codecKey) >= 0; })[0] || {}).family;
    if (ds.family !== fam) out.problems.push(res.entry.id + " is family " + ds.family + "; codec " + codecKey + " belongs to " + fam + " (§1.7)");
    const dec = legacyDecodeMasteries(t2Codec, h.code);
    const keyMap = keyMaps && keyMaps[codecKey];
    const name = r.expected.name || null;
    if (dec.system === "classic") {
        const exp = renameClassic(r.expected.trees, keyMap);
        if (!U.deepEqual(dec.maps, exp)) out.problems.push("legacy decode " + JSON.stringify(dec.maps) + " != recorded " + JSON.stringify(exp));
        if (!U.deepEqual(dec.notes, r.expected.notes || [])) out.problems.push("notes " + JSON.stringify(dec.notes) + " != recorded " + JSON.stringify(r.expected.notes || []));
        const carried = K.classicCarry({ family: ds.family, system: "classic", patch: ds.patch }, exp, ds);
        compareImport(out, legacyId, exp, carried.maps, function (t) { return CP.TIER_NAMES[t]; });
        K.classicValid(ds, carried.maps).forEach(function (p) { out.problems.push("imported build invalid in " + res.entry.id + ": " + p); });
        const spec = C.classicSpec(ds);
        const code = C.classicEncode(spec, C.classicMapsToRanks(spec, carried.maps));
        if (code.charAt(0) === "~") out.problems.push("canonical code needs '~' (canonical datasets have no hashRanks)");
        out.hash = C.classicHash(res.entry.id, code, name, SPEC.PAGE_DEFAULTS.masteries);
        const back = C.classicDecode(spec, code);
        if (!U.deepEqual(C.classicRanksToMaps(spec, back.ranks), carried.maps)) out.problems.push("canonical code " + code + " does not decode back");
        if (C.classicEncode(spec, back.ranks) !== code) out.problems.push("canonical code " + code + " is not stable");
        out.state = carried.maps;
        out.dropped = carried.dropped;
    } else {
        const exp = renameKeystone(r.expected.trees, r.expected.keystone, keyMap);
        if (!U.deepEqual(dec.trees, exp.trees) || (dec.keystone || null) !== (exp.keystone || null)) out.problems.push("legacy decode " + JSON.stringify(dec.trees) + " ks " + dec.keystone + " != recorded " + JSON.stringify(exp.trees) + " ks " + exp.keystone);
        const carried = K.keystoneCarry({ family: ds.family, system: "keystone" }, exp.trees, exp.keystone, ds);
        compareImportKs(out, exp, carried.maps);
        K.keystoneValid(ds, carried.maps.trees, carried.maps.keystone).forEach(function (p) { out.problems.push("imported build invalid in " + res.entry.id + ": " + p); });
        const spec = C.keystoneSpec(ds);
        const code = C.keystoneEncode(spec, carried.state);
        out.hash = C.keystoneHash(res.entry.id, code, name);
        const back = C.keystoneToMaps(spec, C.keystoneDecode(spec, code));
        if (!U.deepEqual(back, carried.maps)) out.problems.push("canonical code " + code + " does not decode back (" + JSON.stringify(back) + ")");
        if (C.keystoneEncode(spec, C.keystoneDecode(spec, code)) !== code) out.problems.push("canonical code " + code + " is not stable");
        out.state = carried.maps;
        out.dropped = carried.dropped;
    }
    out.entry = res.entry;
    return out;
}
function compareImport(out, legacyId, exp, got, treeName) {
    const allow = ALLOWED_DROPS[legacyId];
    let allowedHit = false, cascade = 0;
    exp.forEach(function (o, t) {
        if (allow && allow.keys.some(function (k) { return o[k] > 0; })) allowedHit = true;
    });
    exp.forEach(function (o, t) {
        Object.keys(o).forEach(function (k) {
            const g = (got[t] || {})[k] || 0;
            if (g === o[k]) return;
            if (allow && allow.keys.indexOf(k) >= 0 && g === 0) return;
            if (allow && allow.cascade && allowedHit && g < o[k]) { cascade += o[k] - g; return; }
            out.problems.push(treeName(t) + "." + k + ": " + o[k] + " -> " + g + " in the canonical dataset");
        });
        Object.keys(got[t] || {}).forEach(function (k) { if (!(k in o)) out.problems.push(treeName(t) + "." + k + " appears (" + got[t][k] + ")"); });
    });
    if (allowedHit) out.info.push("Demolisher point dropped" + (cascade ? " (+" + cascade + " point(s) that needed it)" : ""));
    out.cascade = cascade;
}
function compareImportKs(out, exp, got) {
    Object.keys(exp.trees).forEach(function (t) {
        Object.keys(exp.trees[t]).forEach(function (k) {
            const g = ((got.trees || {})[t] || {})[k] || 0;
            if (g !== exp.trees[t][k]) out.problems.push(t + "." + k + ": " + exp.trees[t][k] + " -> " + g + " in the canonical dataset");
        });
        Object.keys((got.trees || {})[t] || {}).forEach(function (k) { if (!(k in exp.trees[t])) out.problems.push(t + "." + k + " appears"); });
    });
    if ((got.keystone || null) !== (exp.keystone || null)) out.problems.push("keystone " + exp.keystone + " -> " + got.keystone);
}

function predictRune(world, legacyId, r) {
    const out = { problems: [], info: [] };
    const h = C.parseRuneHash(r.hash);
    const res = resolveLegacy(world, "runes", h.plain ? null : h.id);
    if (!res.entry) { out.skip = res.why; return out; }
    const ds = world.dataset(res.entry);
    if (!ds) { out.skip = res.entry.id + ": " + (world.payload(res.entry).why || "no data"); return out; }
    const slots = h.slotIds.slice(0, 30);
    while (slots.length < 30) slots.push(null);
    const carried = K.runeCarry(ds, slots, h.level);
    if (!U.deepEqual(carried.slots, r.expected.slots)) {
        const diffs = [];
        carried.slots.forEach(function (s, i) { if (s !== r.expected.slots[i]) diffs.push("slot " + i + ": " + r.expected.slots[i] + " -> " + s); });
        out.problems.push(res.entry.id + " drops runes: " + diffs.slice(0, 6).join(", "));
    }
    if (carried.level !== r.expected.level) out.problems.push("level " + r.expected.level + " -> " + carried.level);
    K.runeValid(ds, carried.slots).forEach(function (p) { out.problems.push(p); });
    out.hash = C.runeHash(res.entry.id, carried.slots, carried.level, SPEC.PAGE_DEFAULTS.runes);
    const back = C.parseRuneHash(out.hash);
    if (out.hash && (back.id !== res.entry.id || !U.deepEqual(K.runeCarry(ds, back.slotIds, back.level).slots, carried.slots))) out.problems.push("canonical hash does not round-trip");
    out.state = carried;
    out.entry = res.entry;
    return out;
}

function predictReforged(world, load, legacyId, r) {
    const out = { problems: [], info: [] };
    const parsed = C.parseReforgedHash(r.hash);
    const res = resolveLegacy(world, "reforged", parsed && parsed.id);
    if (!res.entry) { out.skip = res.why; return out; }
    const cat = load(res.entry.ddragonVersion);
    if (!cat) { out.skip = "no cached runesReforged-" + res.entry.ddragonVersion + ".json (pass --research or --reforged-cache)"; return out; }
    const pl = world.payload(res.entry);
    const catalog = K.applyPerkText(cat, pl.payload && pl.payload.perkText);
    const sr = shardRowsFor(world, res.entry.shardEra);
    if (sr.why) out.partial = "shard picks not validated: " + sr.why;
    const st = K.reforgedApply(catalog, sr.rows, parsed);
    if (!U.deepEqual(st, r.expected)) out.problems.push(res.entry.id + " (DDragon " + res.entry.ddragonVersion + ") decodes to " + JSON.stringify(st) + ", recorded " + JSON.stringify(r.expected));
    out.hash = C.reforgedHash(res.entry.id, st);
    const back = K.reforgedApply(catalog, sr.rows, C.parseReforgedHash(out.hash));
    if (!U.deepEqual(back, st)) out.problems.push("canonical hash does not round-trip");
    out.state = st;
    out.entry = res.entry;
    return out;
}

function predictAll(world, fx, keyMaps, args) {
    const load = catalogLoader(reforgedCache(args));
    const out = [];
    ["masteries", "runes", "reforged"].forEach(function (page) {
        Object.keys(fx.links[page]).forEach(function (id) {
            if (!selected(args, page, id)) return;
            fx.links[page][id].forEach(function (r, i) {
                let p;
                try {
                    p = page === "masteries" ? predictMastery(world, fx, keyMaps, id, r)
                        : page === "runes" ? predictRune(world, id, r) : predictReforged(world, load, id, r);
                } catch (e) { p = { problems: ["crashed: " + (e && e.stack || e)], info: [] }; }
                p.page = page; p.legacyId = id; p.index = i; p.record = r;
                out.push(p);
            });
        });
    });
    return out;
}

function checkL2(world, fx, keyMaps, c, args) {
    const preds = predictAll(world, fx, keyMaps, args);
    const by = {};
    preds.forEach(function (p) { (by[p.legacyId] = by[p.legacyId] || []).push(p); });
    Object.keys(by).forEach(function (id) {
        const ps = by[id];
        const skipped = ps.filter(function (p) { return p.skip; });
        const bad = ps.filter(function (p) { return !p.skip && p.problems.length; });
        const ok = ps.length - skipped.length - bad.length;
        bad.slice(0, 4).forEach(function (p) { c.fail(id + " #" + p.index + " (" + p.record.form + ") " + JSON.stringify(p.record.hash) + ": " + p.problems.slice(0, 3).join("; ")); });
        if (bad.length > 4) c.fail(id + ": … " + (bad.length - 4) + " more records fail");
        if (skipped.length) c.skip(id + ": " + skipped.length + " record(s) not checked: " + skipped[0].skip);
        const infos = {}, partial = {};
        ps.forEach(function (p) { (p.info || []).forEach(function (m) { infos[m] = (infos[m] || 0) + 1; }); if (p.partial && !p.skip) partial[p.partial] = (partial[p.partial] || 0) + 1; });
        Object.keys(partial).forEach(function (m) { c.skip(id + ": " + m + " (" + partial[m] + " record(s))"); });
        Object.keys(infos).forEach(function (m) { c.info(id + ": " + m + " (" + infos[m] + " record(s))"); });
        if (ok && !bad.length) {
            const e = ps.filter(function (p) { return p.entry; })[0];
            c.pass(id + " -> " + (e ? e.entry.id : "?") + ": " + ok + " record(s) import with only documented differences and re-export a canonical link that round-trips");
        }
    });
    return preds;
}

// ---------------------------------------------------------------------------
// Ids alone: hashes without "|" that name a dataset (ID_ALONE + README)
// ---------------------------------------------------------------------------

// The page an id-looking token belongs to, by its prefix only (so a typo in
// the README is still checked, and fails, instead of being skipped).
function idPageByPrefix(tok) {
    if (/^m-V/.test(tok) || /^s\d+-/.test(tok)) return "masteries";
    if (/^preReforged-/.test(tok)) return "runes";
    if (/^rr-/.test(tok)) return "reforged";
    return null;
}

// The ids the README's "Share links" section names (`m-V4.5`, `s4-final`,
// `runes.html#preReforged-V3.04` …): {ids: [{page, hash}]} | {why}.
// Templates (`index.html#m-V<patch>|<code>`) and file names are skipped.
function readmeIds(world) {
    const text = U.readText(path.join(world.root, "README.md"));
    if (text === null) return { why: "README.md missing" };
    const lines = text.split(/\r?\n/);
    let start = -1, end = lines.length;
    for (let i = 0; i + 1 < lines.length; i++) if (/^Share links\s*$/.test(lines[i]) && /^-{3,}\s*$/.test(lines[i + 1])) { start = i + 2; break; }
    if (start < 0) return { why: "README.md has no \"Share links\" section" };
    for (let i = start; i + 1 < lines.length; i++) if (lines[i].trim() && /^[-=]{3,}\s*$/.test(lines[i + 1])) { end = i; break; }
    const body = lines.slice(start, end).join("\n"), out = [], seen = {};
    const re = /`([^`]+)`/g;
    let m;
    while ((m = re.exec(body))) {
        const tok = m[1].replace(/^(?:index|runes|runes-reforged)\.html#/, "");
        if (/[<>|\s\/]/.test(tok)) continue;
        const page = idPageByPrefix(tok);
        if (!page || seen[page + " " + tok]) continue;
        seen[page + " " + tok] = true;
        out.push({ page: page, hash: tok });
    }
    return { ids: out };
}

// The spec resolution of an id alone (DESIGN §2.3 resolve: a listed id, an
// alias, an unlisted patch of the page's id pattern inside the listed range;
// an id of the pattern outside it is unknown = the page default):
// {entry, alias, kind} | {plain: true} (no id: the plain form) | {why}
function resolveIdAlone(world, page, id) {
    const ents = world.entries(page);
    if (!ents.list) return { why: ents.why };
    const list = ents.list;
    const r = resolveLegacy(world, page, id);
    if (r.entry) return { entry: r.entry, alias: r.alias, kind: r.alias ? "alias" : "listed" };
    const pid = P.parseId(id);
    // the Reforged page has no plain form: anything else is an unknown id
    if ((!pid || pid.page !== page) && page !== "reforged") return { plain: true };
    if (!pid || pid.page !== page || P.compare(pid.patch, list[0].patch) < 0 || P.compare(pid.patch, list[list.length - 1].patch) > 0) {
        const def = list.filter(function (e) { return e.id === SPEC.PAGE_DEFAULTS[page]; })[0];
        return def ? { entry: def, alias: null, kind: "unknown", unknown: true } : { why: "no page default " + SPEC.PAGE_DEFAULTS[page] };
    }
    let best = null;
    list.forEach(function (e) { if (P.compare(e.patch, pid.patch) <= 0) best = e; });
    return { entry: best, alias: { id: id, to: best.id, unlisted: true }, kind: "unlisted" };
}

// The canonical link of `entry` with an empty build (the page writers:
// classic / keystone updateLink, runes updateLink, buildReforgedHash).
function emptyHashOf(world, page, entry) {
    const def = SPEC.PAGE_DEFAULTS[page];
    if (page === "runes") return { hash: C.runeHash(entry.id, new Array(30).fill(null), 18, def) };
    if (page === "reforged") return { hash: C.reforgedHash(entry.id, { primary: null, secondary: null, shards: [null, null, null], name: null }) };
    const ds = world.dataset(entry);
    if (!ds) return { why: entry.id + ": " + (world.payload(entry).why || "no data") };
    if ((ds.system || entry.system) === "keystone") {
        const ks = C.keystoneSpec(ds);
        return { hash: C.keystoneHash(entry.id, C.keystoneEncode(ks, C.keystoneEmpty(ks)), null) };
    }
    const spec = C.classicSpec(ds);
    return { hash: C.classicHash(entry.id, C.classicEncode(spec, spec.map(function (t) { return t.map(function () { return 0; }); })), null, def) };
}

// The id-alone records: ID_ALONE plus the README's ids, with their spec
// prediction {page, legacyId, index, record: {form, hash}, opens, hash,
// entry, problems, skip}, in the shape of predictAll's (L3 opens both).
function idAlonePreds(world, args) {
    const recs = [], seen = {};
    P.PAGES.forEach(function (page) {
        (ID_ALONE[page] || []).forEach(function (x) {
            seen[page + " " + x[0]] = recs.length;
            recs.push({ page: page, hash: x[0], opens: x[1], fixed: true, readme: false });
        });
    });
    const rd = readmeIds(world);
    (rd.ids || []).forEach(function (x) {
        const k = x.page + " " + x.hash;
        if (k in seen) recs[seen[k]].readme = true;
        else { seen[k] = recs.length; recs.push({ page: x.page, hash: x.hash, opens: undefined, fixed: false, readme: true }); }
    });
    const out = [];
    recs.forEach(function (r) {
        if (!selected(args, r.page, ID_ALONE_GROUP)) return;
        const p = { page: r.page, legacyId: ID_ALONE_GROUP + " " + r.page, index: out.length, problems: [], info: [], readme: r.readme, opens: r.opens };
        const res = resolveIdAlone(world, r.page, r.hash);
        p.record = { form: (res.kind || (res.plain ? "no id" : "?")) + (r.readme ? ", README" : ""), hash: r.hash };
        if (res.why) { p.skip = res.why; out.push(p); return; }
        if (res.plain) p.problems.push("not an id of the " + r.page + " page: a hash without \"|\" that is no id is a plain code");
        else {
            if (r.fixed && (res.unknown ? null : res.entry.id) !== r.opens)
                p.problems.push("opens " + (res.unknown ? "nothing (unknown id)" : res.entry.id) + ", expected " + (r.opens || "nothing (unknown id)"));
            if (r.readme && res.unknown) p.problems.push("the README names it, but it is an unknown id (opens the page default)");
            const eh = emptyHashOf(world, r.page, res.entry);
            if (eh.why) { p.skip = eh.why; out.push(p); return; }
            p.hash = eh.hash;
            p.entry = res.entry;
            p.kind = res.kind;
            p.unknown = !!res.unknown;
        }
        out.push(p);
    });
    return { preds: out, readme: rd };
}

// L0 part: the id-alone records by the spec, "no id alone is a plain code",
// and lol-data.js LolPatches.fromHash on them and on every fixture hash
// without "|" (which must keep its old meaning).
function checkIdAlone(world, fx, c, args) {
    const ia = idAlonePreds(world, args);
    const preds = ia.preds;
    if (ia.readme.why) c.fail("README: " + ia.readme.why);
    let bad = 0;
    const kinds = {};
    preds.forEach(function (p) {
        if (p.skip) return;
        kinds[p.kind || "?"] = (kinds[p.kind || "?"] || 0) + 1;
        if (p.problems.length) { c.fail(p.page + " #" + p.record.hash + " (" + p.record.form + "): " + p.problems.join("; ")); bad++; }
    });
    const skipped = preds.filter(function (p) { return p.skip; });
    if (skipped.length) c.skip("ids alone: " + skipped.length + " not checked: " + skipped[0].skip);
    const nReadme = preds.filter(function (p) { return p.readme; }).length;
    const done = preds.length - skipped.length;
    if (done && !bad) c.pass("ids alone: " + done + " hashes without \"|\" (" + nReadme + " of them the README's Share links examples) open their patch by the spec (" +
        Object.keys(kinds).map(function (k) { return kinds[k] + " " + k; }).join(", ") + ") with an empty build");

    // No id alone can be a plain code. Masteries: the plain writer (the
    // s3-pbe codec) never produces any of them; runes: no rune list.
    const plainKey = (fx.codecs.about || {}).plainCode || "s3-pbe";
    const plainCodec = fx.codecs.datasets[plainKey];
    const A = aliasesOf(world);
    const mIds = {};
    Object.keys(A.masteries || {}).forEach(function (id) { mIds[id] = true; });
    preds.forEach(function (p) { if (p.page === "masteries") mIds[p.record.hash] = true; });
    let pbad = 0;
    if (plainCodec && plainCodec.system === "classic") {
        const spec = C.classicCodecFrom(plainCodec.trees);
        Object.keys(mIds).forEach(function (id) {
            if (C.classicEncode(spec, C.classicDecode(spec, id).ranks) === id) { c.fail("masteries: " + id + " is also a plain code the " + plainKey + " writer produces (ambiguous without \"|\")"); pbad++; }
        });
    } else { c.fail("legacy-codecs.json: no classic plain codec " + plainKey); pbad++; }
    const rIds = Object.keys(A.runes || {}).concat(preds.filter(function (p) { return p.page === "runes"; }).map(function (p) { return p.record.hash; }));
    rIds.forEach(function (id) { if (/^(?:\d+|_)?(?:,(?:\d+|_)?)*$/.test(id)) { c.fail("runes: " + id + " reads as a plain rune list"); pbad++; } });
    if (!pbad) c.pass("no id alone is a plain code: " + Object.keys(mIds).length + " mastery ids (every old id included) are no code the " + plainKey +
        " plain writer produces; " + rIds.length + " rune ids are no rune list");

    // lol-data.js on the same hashes, and on the fixture hashes without "|".
    const rt = world.runtime();
    if (rt.missing || rt.error) { c.skip("lol-data.js fromHash: " + (rt.why || rt.error) + " (T1)"); return; }
    let rbad = 0, rn = 0;
    preds.forEach(function (p) {
        if (p.skip || !p.entry) return;
        rn++;
        let r;
        try { r = rt.LolPatches.fromHash(p.page, "#" + p.record.hash); } catch (e) { c.fail("fromHash(" + p.page + ", #" + p.record.hash + ") throws " + e.message); rbad++; return; }
        const probs = [];
        if (!r.entry || r.entry.id !== p.entry.id) probs.push("opens " + (r.entry && r.entry.id) + ", the spec " + p.entry.id);
        if (!r.bare || r.plain) probs.push("bare " + r.bare + ", plain " + r.plain + " (an id alone is bare, never plain)");
        if (!!r.unknown !== p.unknown) probs.push("unknown " + r.unknown);
        if (probs.length) { c.fail("lol-data.js fromHash(" + p.page + ", #" + p.record.hash + "): " + probs.join("; ")); rbad++; }
    });
    let ln = 0;
    P.PAGES.forEach(function (page) {
        Object.keys(fx.links[page] || {}).forEach(function (id) {
            if (!selected(args, page, id)) return;
            fx.links[page][id].forEach(function (rec, i) {
                if (rec.hash.indexOf("|") >= 0) return;
                ln++;
                const r = rt.LolPatches.fromHash(page, "#" + rec.hash);
                const w = "lol-data.js fromHash(" + page + ", " + JSON.stringify(rec.hash.length > 40 ? rec.hash.slice(0, 40) + "…" : rec.hash) + ") [" + id + " #" + i + " " + rec.form + "]";
                if (page !== "reforged") {
                    const want = (SPEC.PLAIN[page] || {}).to;
                    if (!r.plain || r.bare || !r.entry || r.entry.id !== want) { c.fail(w + ": plain " + r.plain + ", bare " + r.bare + ", opens " + (r.entry && r.entry.id) + "; a legacy plain code must stay plain (" + want + ")"); rbad++; }
                } else {
                    const parsed = C.parseReforgedHash(rec.hash);
                    const res = resolveLegacy(world, page, parsed && parsed.id);
                    let dec = rec.hash;
                    try { dec = decodeURIComponent(rec.hash); } catch (e) { /* keep */ }
                    const isBare = dec.indexOf("|") < 0;            // percent-encoded links decode to a full one
                    if (!res.entry || !r.entry || r.entry.id !== res.entry.id || r.plain || !!r.bare !== !!isBare) { c.fail(w + ": opens " + (r.entry && r.entry.id) + ", bare " + r.bare + "; expected " + (res.entry && res.entry.id) + ", bare " + !!isBare); rbad++; }
                }
            });
        });
    });
    if (!rbad) c.pass("lol-data.js fromHash: " + rn + " ids alone open their patch empty (bare); the " + ln + " fixture hashes without \"|\" keep their meaning (plain codes stay plain, bare Reforged ids stay ids)");
    return preds;
}

// ---------------------------------------------------------------------------
// Browser driver (DevTools protocol; shared with tools/test-carry.js)
// ---------------------------------------------------------------------------

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

function findBrowser(exe) {
    const c = [exe, process.env.LOL_BROWSER,
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    for (const p of c) if (p && p !== true && fs.existsSync(p)) return p;
    return null;
}
function fileUrl(abs) {
    let p = fs.realpathSync.native(abs).replace(/\\/g, "/");
    if (!p.startsWith("/")) p = "/" + p;
    return "file://" + p.split("/").map(encodeURIComponent).join("/").replace(/%3A/g, ":");
}

async function launchBrowser(exe) {
    if (typeof WebSocket !== "function") throw new Error("this Node has no global WebSocket (Node 22+ needed for --browser)");
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), "lmtest-"));
    const child = cp.spawn(exe, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
        "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows", "--disable-features=IntensiveWakeUpThrottling", "--remote-debugging-port=0", "--user-data-dir=" + prof, "--window-size=1440,900", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] });
    const wsUrl = await new Promise(function (resolve, reject) {
        let buf = "";
        const t = setTimeout(function () { reject(new Error("no DevTools endpoint from " + exe)); }, 30000);
        child.stderr.on("data", function (d) {
            buf += d;
            const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
            if (m) { clearTimeout(t); resolve(m[1]); }
        });
        child.on("exit", function () { reject(new Error("browser exited early")); });
    });
    const ws = new WebSocket(wsUrl);
    await new Promise(function (resolve, reject) { ws.onopen = resolve; ws.onerror = function () { reject(new Error("CDP connect failed")); }; });
    let seq = 0;
    const pending = new Map(), listeners = new Set();
    ws.onmessage = function (ev) {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(p.method + ": " + msg.error.message)); else p.resolve(msg.result);
        } else listeners.forEach(function (l) { l(msg); });
    };
    // Every DevTools call gets an answer or fails after 60 s: a starved
    // headless tab on a loaded machine must not stall the whole run.
    const send = function (method, params, sessionId) {
        return new Promise(function (resolve, reject) {
            const id = ++seq;
            const timer = setTimeout(function () {
                if (pending.has(id)) { pending.delete(id); reject(new Error(method + ": no answer in 60 s")); }
            }, 60000);
            pending.set(id, { resolve: function (v) { clearTimeout(timer); resolve(v); }, reject: function (e) { clearTimeout(timer); reject(e); }, method: method });
            ws.send(JSON.stringify(Object.assign({ id: id, method: method, params: params || {} }, sessionId ? { sessionId: sessionId } : {})));
        });
    };
    const ctx = await send("Target.createBrowserContext", {});
    return {
        send: send, contextId: ctx.browserContextId,
        on: function (fn) { listeners.add(fn); }, off: function (fn) { listeners.delete(fn); },
        close: async function () {
            try { await Promise.race([send("Browser.close"), sleep(3000)]); } catch (e) { /* closed */ }
            try { ws.close(); } catch (e) { /* closed */ }
            try { child.kill(); } catch (e) { /* gone */ }
            await sleep(300);
            try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* locked */ }
        }
    };
}

// One tab. opts.catalogDir: serve runesReforged-<ver>.json from it; every
// other http(s) request is blocked (no network in tests).
async function openTab(b, opts) {
    opts = opts || {};
    const { targetId } = await b.send("Target.createTarget", { url: "about:blank", browserContextId: b.contextId });
    const { sessionId } = await b.send("Target.attachToTarget", { targetId: targetId, flatten: true });
    const s = function (m, p) { return b.send(m, p, sessionId); };
    const tab = { errors: [], served: [], blocked: 0 };
    const onMsg = function (msg) {
        if (msg.sessionId !== sessionId) return;
        const p = msg.params || {};
        if (msg.method === "Runtime.exceptionThrown") {
            const x = p.exceptionDetails || {};
            tab.errors.push("exception: " + ((x.exception && x.exception.description) || x.text));
        } else if (msg.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert")) {
            tab.errors.push("console." + p.type + ": " + (p.args || []).map(function (a) { return a.value !== undefined ? a.value : a.description; }).join(" "));
        } else if (msg.method === "Fetch.requestPaused") {
            const url = p.request.url;
            const m = /runesReforged\.json/.test(url) && /\/cdn\/([^/]+)\/data\//.exec(url);
            const file = m && opts.catalogDir ? path.join(opts.catalogDir, "runesReforged-" + m[1] + ".json") : null;
            if (file && fs.existsSync(file)) {
                tab.served.push(m[1]);
                s("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200,
                    responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Access-Control-Allow-Origin", value: "*" }],
                    body: fs.readFileSync(file).toString("base64") }).catch(function () {});
            } else {
                if (m) tab.errors.push("catalog " + m[1] + " not in the cache (not downloaded)");
                tab.blocked++;
                s("Fetch.failRequest", { requestId: p.requestId, errorReason: "BlockedByClient" }).catch(function () {});
            }
        }
    };
    b.on(onMsg);
    await s("Runtime.enable");
    await s("Page.enable");
    await s("Fetch.enable", { patterns: [{ urlPattern: "http://*", requestStage: "Request" }, { urlPattern: "https://*", requestStage: "Request" }] });
    await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await s("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(function () {});
    tab.eval = async function (expr) {
        const r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("evaluate: " + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
        return r.result.value;
    };
    tab.navigate = function (url) { return s("Page.navigate", { url: url }); };
    tab.send = s;                                         // raw DevTools calls (Input.*: tools/test-notes.js)
    tab.close = async function () {
        b.off(onMsg);
        try { await b.send("Target.closeTarget", { targetId: targetId }); } catch (e) { /* gone */ }
    };
    return tab;
}

// When a page counts as drawn (DOM only; P0-A's conditions).
const READY = {
    masteries: "!!(window.jQuery && (document.querySelector('#calculator .button') || document.querySelector('#keystone-calculator .ks-mastery')))",
    runes: "!!(window.jQuery && document.querySelector('#rune-slots .rune-slot') && document.querySelector('#runes-categories .rl-cat'))",
    reforged: "(function(){var l=document.querySelector('#reforged-calculator .rr-loading');return !!(window.jQuery && l && l.style.display === 'none' && document.querySelector('#reforged-calculator .rr-picker, #reforged-calculator .rr-body:not([hidden])'));})()"
};
const LINK_SEL = { masteries: "#exportLink", runes: "#exportLink", reforged: "#reforged-export-link" };
const PAGE_FILE = { masteries: "index.html", runes: "runes.html", reforged: "runes-reforged.html" };

// Wait until the page is drawn and its hash has been stable for `quiet` ms.
async function settle(tab, page, quiet, timeout) {
    const deadline = Date.now() + (timeout || 20000);
    const probe = "(function(){var a=document.querySelector(" + JSON.stringify(LINK_SEL[page]) + ");" +
        "var t=document.getElementById('toast');" +
        "return {ready:" + READY[page] + ",hash:location.hash,link:a?a.getAttribute('href'):null," +
        "toast:t&&t.classList.contains('visible')?t.textContent:null};})()";
    let last = null, since = 0, readyAt = 0, toast = null;
    for (;;) {
        let v = null;
        try { v = await tab.eval(probe); } catch (e) { v = null; }
        if (v && v.toast) toast = v.toast;
        if (v && v.ready) {
            if (!readyAt) readyAt = Date.now();
            const key = v.hash + "\n" + v.link;
            if (key !== last) { last = key; since = Date.now(); }
            else if (Date.now() - since >= quiet && Date.now() - readyAt >= quiet) { v.toast = toast; return v; }
        }
        if (Date.now() > deadline) { if (v) v.toast = toast; return v ? Object.assign(v, { timeout: true }) : { timeout: true }; }
        await sleep(100);
    }
}

// Is the site's page reworked onto the registry (DESIGN §2.1)?
function reworked(siteRoot, page) {
    const t = U.readText(path.join(siteRoot, PAGE_FILE[page]));
    if (t === null) return { ok: false, why: PAGE_FILE[page] + " missing" };
    if (/data-lol-shell\s*=\s*["']?legacy/.test(t)) return { ok: false, why: PAGE_FILE[page] + " still runs the pre-rework calculators (html[data-lol-shell=\"legacy\"], phase 2 pending)" };
    if (!/patch-registry\.js/.test(t)) return { ok: false, why: PAGE_FILE[page] + " does not load patch-registry.js (T1 pending)" };
    return { ok: true };
}

async function pool(items, n, fn) {
    let next = 0;
    async function worker() { while (next < items.length) { const i = next++; await fn(items[i], i); } }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

function stripHash(h) { return String(h == null ? "" : h).replace(/^#/, ""); }
function linkHash(link) { if (link == null) return null; const i = String(link).indexOf("#"); return i < 0 ? "" : String(link).slice(i + 1); }

// idPreds: the id-alone records (checkIdAlone); not in --legacy-baseline
// runs (the baseline read a mastery / rune id without "|" as a plain code).
async function checkL3(world, preds, c, args, idPreds) {
    if (!args.browser && !args["legacy-baseline"]) { c.skip("browser layer not requested (--browser)"); return; }
    const legacy = !!args["legacy-baseline"];
    const site = legacy ? path.resolve(String(args["legacy-baseline"])) : world.root;
    const exe = findBrowser(args["browser-exe"]);
    if (!exe) { c.skip("no Edge / Chrome found (pass --browser-exe <exe>)"); return; }
    const pages = {};
    ["masteries", "runes", "reforged"].forEach(function (p) { pages[p] = legacy ? { ok: fs.existsSync(path.join(site, PAGE_FILE[p])) } : reworked(site, p); });
    if (pages.reforged.ok && !reforgedCache(args)) pages.reforged = { ok: false, why: "the runtime catalogs come from the cache only (pass --research <dir> or --reforged-cache <dir>; nothing is downloaded)" };
    const limit = args.limit ? parseInt(args.limit, 10) : Infinity;
    const counts = {};
    const work = preds.filter(function (p) {
        if (!pages[p.page].ok) return false;
        if (!legacy && (p.skip || !p.hash && p.hash !== "")) return false;
        counts[p.legacyId] = (counts[p.legacyId] || 0) + 1;
        return counts[p.legacyId] <= limit;
    }).concat(legacy ? [] : (idPreds || []).filter(function (p) {
        return pages[p.page].ok && !p.skip && typeof p.hash === "string" && !p.problems.length;
    }));
    ["masteries", "runes", "reforged"].forEach(function (p) { if (!pages[p].ok) c.skip(p + ": " + pages[p].why); });
    if (!work.length) { if (!c.__any) c.skip("no record to open"); return; }
    const b = await launchBrowser(exe);
    const catalogDir = reforgedCache(args);
    const results = [];
    try {
        await pool(work, parseInt(args.par || "4", 10), async function (p) {
            // A page that never settles is retried once in a fresh tab (a
            // loaded machine can starve one headless tab); a second timeout fails.
            // A DevTools call that fails (60 s without an answer) counts the same.
            for (let attempt = 0; attempt < 2; attempt++) {
                let tab = null;
                try {
                    tab = await openTab(b, { catalogDir: catalogDir });
                    const url = fileUrl(path.join(site, PAGE_FILE[p.page])) + "#" + p.record.hash;
                    await tab.navigate(url);
                    const t0 = Date.now();
                    const v = await settle(tab, p.page, 700, 40000);
                    if (v.timeout && attempt === 0) continue;
                    results.push({ p: p, v: v, errors: tab.errors.slice(), ms: Date.now() - t0, retried: attempt > 0 });
                    if (results.length % 50 === 0) process.stderr.write("test-links L3: " + results.length + "/" + work.length + " links opened\n");
                    break;
                } catch (e) {
                    if (attempt === 0) continue;
                    results.push({ p: p, v: { timeout: true }, errors: ["harness: " + (e && e.message || e)], ms: 0, retried: true });
                } finally { if (tab) await tab.close().catch(function () {}); }
            }
        });
    } finally { await b.close(); }
    const by = {};
    results.forEach(function (x) { (by[x.p.legacyId] = by[x.p.legacyId] || []).push(x); });
    Object.keys(by).forEach(function (id) {
        let ok = 0, bad = 0;
        by[id].forEach(function (x) {
            const p = x.p, v = x.v || {};
            const want = legacy ? stripHash(p.record.rewrite != null ? p.record.rewrite : p.record.hash) : stripHash(p.hash);
            const alt = legacy ? stripHash(p.record.hash) : null;     // the keystone page does not rewrite on load
            const got = stripHash(v.hash);
            const link = linkHash(v.link);
            const probs = [];
            if (v.timeout) probs.push("page did not settle" + (v.ready === false ? " (never drawn)" : ""));
            if (got !== want && got !== alt) probs.push("URL #" + got + ", expected #" + want);
            // (baseline quirk: the keystone page sets neither URL nor link on load)
            const ksQuirk = legacy && /^s[67]-/.test(p.legacyId) && (link === "" || link === null);
            if (link !== null && link !== want && link !== alt && !ksQuirk && !(want === "" && (link === "" || link === null))) probs.push("share link #" + link + ", expected #" + want);
            if (!legacy && p.dropped > 0 && !v.toast) probs.push(p.dropped + " point(s) dropped but no toast");
            // an id alone opens empty: nothing to drop, so nothing to report
            if (p.legacyId.indexOf(ID_ALONE_GROUP) === 0 && v.toast) probs.push("toast " + JSON.stringify(v.toast) + " (an id alone holds no build)");
            x.errors.forEach(function (e) { probs.push(e); });
            if (probs.length) { bad++; if (bad <= 4) c.fail(id + " #" + p.index + " (" + p.record.form + ") #" + p.record.hash + ": " + probs.slice(0, 3).join("; ")); }
            else ok++;
        });
        if (bad > 4) c.fail(id + ": … " + (bad - 4) + " more");
        if (!bad) c.pass(id + ": " + ok + " link(s) opened in the page " + (legacy ? "behave as the baseline recorded"
            : id.indexOf(ID_ALONE_GROUP) === 0 ? "open their patch empty: the URL and the share link become its empty canonical link (" +
                by[id].slice().sort(function (a, b) { return a.p.index - b.p.index; }).map(function (x) {
                    return "#" + x.p.record.hash + " -> " + x.p.entry.id + (stripHash(x.p.hash) ? "" : " (no hash: page default)");
                }).join(", ") + "), no toast, no error"
            : "rewrite to the canonical hash, set the share link and log no error"));
    });
}

// ---------------------------------------------------------------------------

async function main(argv) {
    let args;
    try { args = CP.parseArgs(argv); } catch (e) { console.error("test-links: " + e.message); return 1; }
    if (args.only) args.only = [].concat(args.only);
    const world = new World({ root: args.root, research: args.research });
    const rep = new Reporter({ verbose: args.verbose, json: args.json, allowSkip: args["allow-skip"] });
    console.log("test-links (DESIGN §7.1 L)  " + CP.inputsSummary(world).split("\n").join("\n  "));
    console.log("");
    const fx = fixtures(world);
    if (!fx) {
        rep.run("L0", "fixtures", function (c) { c.fail("tools/fixtures/legacy-links.json / legacy-codecs.json missing (P0-A)"); });
        return rep.finish("test-links");
    }
    let keyMaps = null, preds = [], idPreds = [];
    rep.run("L0", "reference codecs reproduce the baseline (" + fx.links.about.total + " records); ids alone without \"|\"", function (c) {
        checkL0(world, fx, c, args);
        idPreds = checkIdAlone(world, fx, c, args) || [];
    });
    rep.run("L1", "legacy-codecs.js equals the P0 fixture codecs", function (c) { keyMaps = checkL1(world, fx, c); });
    rep.run("L2", "legacy link -> alias -> codec -> canonical dataset -> canonical link", function (c) { preds = checkL2(world, fx, keyMaps, c, args); });
    let l3 = null;
    const r3 = { id: "L3", title: "the real pages rewrite each legacy link to its canonical hash (--browser)", items: [] };
    const ctx = { pass: function (m) { r3.items.push({ status: "pass", msg: m }); }, fail: function (m) { r3.items.push({ status: "fail", msg: m }); },
        skip: function (m) { r3.items.push({ status: "skip", msg: m }); }, info: function (m) { r3.items.push({ status: "info", msg: m }); } };
    try { await checkL3(world, preds, ctx, args, idPreds); } catch (e) { ctx.fail("browser run crashed: " + (e && e.stack || e)); }
    rep.run("L3", r3.title, function (c) { r3.items.forEach(function (i) { c[i.status](i.msg); }); });
    return rep.finish("test-links");
}

module.exports = {
    launchBrowser: launchBrowser, openTab: openTab, settle: settle, findBrowser: findBrowser, fileUrl: fileUrl,
    reworked: reworked, pool: pool, READY: READY, LINK_SEL: LINK_SEL, PAGE_FILE: PAGE_FILE, stripHash: stripHash, linkHash: linkHash,
    catalogLoader: catalogLoader, reforgedCache: reforgedCache, shardRowsFor: shardRowsFor, resolveLegacy: resolveLegacy,
    predictAll: predictAll, legacyDecodeMasteries: legacyDecodeMasteries
};

if (require.main === module) main(process.argv.slice(2)).then(function (code) { process.exitCode = code; });
