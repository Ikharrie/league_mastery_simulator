#!/usr/bin/env node
// tools/test-carry.js: check X of DESIGN §7.1, the carry-over of a build
// when the patch (or the season) changes on the same page (§2.5, §4.5).
//
// Pairs, per page: every two consecutive listed patches, and every ordered
// pair of season defaults (the Season dropdown lands on the target season's
// default). For each pair, --builds (50) seeded random valid builds on the
// source patch are switched over, and the result must be
//   valid     under the target's rules (tiers, parents, pools, keystone,
//             budget; rune categories; Reforged rows and shard rows),
//   a subset  of what the source held (no point invented),
//   maximal   every point whose key / id still exists and that the target's
//             rules still allow is kept (one more point would be legal
//             nowhere it was dropped), and
//   reset     when the source and target families differ (§1.7: V5.21 ->
//             V5.22, V3.13 -> V3.14, S1 -> S2 …): nothing carries, the page
//             says "Masteries were reworked in V…: page reset".
//
// Sections:
//   X1 masteries, X2 runes, X3 Runes Reforged: the reference carry rules
//      (tools/check-patches.js) over the generated data; this proves the
//      data supports the rules (keys line up inside a family, the catalogs
//      hold the runes) and gives the expected result for X4
//   X4 --browser: a sample of the same switches in the real pages: open the
//      source link, change the Patch (or Season) dropdown, read the URL the
//      page writes, decode it with the target's codec and apply the same
//      four assertions, plus: the toast when something was dropped, the page
//      name / champion level kept. A consecutive pair across a season line
//      (V4.19 -> V4.20) switches through the Patch dropdown's handler (no
//      single UI control reaches it; see runBrowser). A tab that never drew
//      is retried once. Skipped for a page that still runs the pre-rework
//      calculators (an old --root site)
//
// Usage (from the repo root)
//   node tools/test-carry.js [--root <site>] [--only masteries,runes,reforged] [--builds 50]
//        [--research <scratchpad>\patches] [--reforged-cache <dir>]
//        [--browser [--browser-builds 2] [--browser-exe <exe>] [--par N]]
//        [--json <file>] [--verbose] [--allow-skip]
//   Reforged needs the cached runesReforged-<build>.json catalogs
//   (<research>/raw/reforged or --reforged-cache); nothing is downloaded.
// Exit code: 0 all ran and passed, 1 a failure, 2 incomplete (skips).
"use strict";

const path = require("path");
const CP = require("./check-patches.js");
const TL = require("./test-links.js");

const { World, Reporter } = CP;
const U = CP.util, C = CP.codec, K = CP.carry, SPEC = CP.SPEC;
const NAME = "Carry Test";

// ---------------------------------------------------------------------------
// Pairs
// ---------------------------------------------------------------------------

function pairsOf(list, page) {
    const out = [], seen = {};
    const add = function (a, b, kind) {
        if (!a || !b || a.id === b.id) return;
        const k = a.id + ">" + b.id;
        if (seen[k]) { if (seen[k].kind.indexOf(kind) < 0) seen[k].kind += "+" + kind; return; }
        seen[k] = { from: a, to: b, kind: kind };
        out.push(seen[k]);
    };
    for (let i = 1; i < list.length; i++) add(list[i - 1], list[i], "next");
    const byId = {};
    list.forEach(function (e) { byId[e.id] = e; });
    const defs = Object.keys(SPEC.SEASON_DEFAULTS[page]).map(function (s) { return byId[SPEC.SEASON_DEFAULTS[page][s]]; }).filter(Boolean);
    defs.forEach(function (a) { defs.forEach(function (b) { add(a, b, "season"); }); });
    return out;
}

// ---------------------------------------------------------------------------
// Random valid builds (seeded)
// ---------------------------------------------------------------------------

function tierOf(m) { return Math.floor((m.index - 1) / 4); }

function classicRandom(ds, rng) {
    const maps = [{}, {}, {}];
    const max = ds.maxPoints || 30;
    const target = rng() < 0.5 ? max : 1 + rng.int(max);
    const focus = rng() < 0.7 ? rng.int(3) : -1;
    let total = 0;
    const lower = function (t, tier) {
        let n = 0;
        ds.data[t].forEach(function (m) { if (tierOf(m) < tier) n += maps[t][m.key] || 0; });
        return n;
    };
    for (let guard = 0; guard < 200 && total < target; guard++) {
        const cands = [];
        ds.data.forEach(function (tree, t) {
            tree.forEach(function (m) {
                const r = maps[t][m.key] || 0;
                if (r >= m.ranks) return;
                if (lower(t, tierOf(m)) < 4 * tierOf(m)) return;
                if (m.parent != null) { const p = tree[m.parent]; if (!p || (maps[t][p.key] || 0) < p.ranks) return; }
                const w = t === focus ? 6 : 1;
                for (let k = 0; k < w; k++) cands.push([t, m]);
            });
        });
        if (!cands.length) break;
        const pick = rng.pick(cands);
        maps[pick[0]][pick[1].key] = (maps[pick[0]][pick[1].key] || 0) + 1;
        total++;
    }
    return { maps: maps, name: rng() < 0.2 ? NAME : null };
}

function keystoneRandom(ds, rng) {
    const spec = C.keystoneSpec(ds);
    const st = C.keystoneEmpty(spec);
    const max = spec.maxPoints || 30;
    const target = rng() < 0.5 ? max : 1 + rng.int(max);
    const focus = rng() < 0.6 ? spec.trees[rng.int(spec.trees.length)].id : null;
    for (let guard = 0; guard < 200 && C.keystoneToMaps(spec, st) && K.ksTotal(spec, st) < target; guard++) {
        const cands = [];
        spec.trees.forEach(function (t) {
            t.tiers.forEach(function (tier, j) {
                if (!K.ksUnlocked(spec, st, t, j)) return;
                tier.keys.forEach(function (key, idx) {
                    if (!key) return;
                    let ok;
                    if (tier.isKeystone) ok = !st.keystone;
                    else if (tier.pool === 1) ok = K.ksTierTotal(st, t.id, j) === 0;
                    else ok = K.ksTierTotal(st, t.id, j) < tier.pool && (st.trees[t.id][j][key] || 0) < (tier.ranks[idx] || 1);
                    if (!ok) return;
                    const w = t.id === focus ? 6 : 1;
                    for (let k = 0; k < w; k++) cands.push([t, j, key, tier.isKeystone]);
                });
            });
        });
        if (!cands.length) break;
        const p = rng.pick(cands);
        if (p[3]) st.keystone = { tree: p[0].id, key: p[2] };
        else st.trees[p[0].id][p[1]][p[2]] = (st.trees[p[0].id][p[1]][p[2]] || 0) + 1;
    }
    const m = C.keystoneToMaps(spec, st);
    return { trees: m.trees, keystone: m.keystone, state: st, name: rng() < 0.2 ? NAME : null };
}

function runeRandom(ds, rng) {
    const cats = K.slotCategories(ds.slots || { mark: 9, seal: 9, glyph: 9, quintessence: 3 });
    const by = {};
    (ds.runes || []).forEach(function (r) { (by[r.category] = by[r.category] || []).push(r); });
    const uniform = rng() < 0.4;
    const fav = {};
    const slots = cats.map(function (cat) {
        const pool = by[cat] || [];
        if (!pool.length || rng() < 0.12) return null;
        if (uniform) { if (!fav[cat]) fav[cat] = rng.pick(pool); return String(fav[cat].id); }
        return String(rng.pick(pool).id);
    });
    return { slots: slots, level: rng() < 0.7 ? 18 : 1 + rng.int(18) };
}

function reforgedRandom(catalog, rows, rng) {
    const paths = catalog.filter(function (p) { return p.slots && p.slots.length >= 4; });
    const st = { primary: null, secondary: null, shards: [null, null, null], name: rng() < 0.2 ? NAME : null };
    if (!paths.length) return st;
    const p = rng.pick(paths);
    if (rng() < 0.95) st.primary = { path: p.id, picks: [0, 1, 2, 3].map(function (k) { return rng() < 0.9 ? rng.pick(p.slots[k].runes).id : null; }) };
    const others = paths.filter(function (x) { return !st.primary || x.id !== st.primary.path; });
    if (others.length && rng() < 0.9) {
        const s = rng.pick(others);
        const rowsPicked = [1, 2, 3].filter(function () { return true; });
        const chosen = [];
        while (chosen.length < 2 && rowsPicked.length) chosen.push(rowsPicked.splice(rng.int(rowsPicked.length), 1)[0]);
        st.secondary = { path: s.id, picks: [1, 2, 3].map(function (k) { return chosen.indexOf(k) >= 0 && rng() < 0.9 && s.slots[k] ? rng.pick(s.slots[k].runes).id : null; }) };
    }
    if (rows) st.shards = [0, 1, 2].map(function (k) { return rows[k] && rng() < 0.85 ? String(rng.pick(rows[k].shards).id) : null; });
    return st;
}

// ---------------------------------------------------------------------------
// Assertions on a carried result (shared by the reference and the browser)
// ---------------------------------------------------------------------------

function familyOf(ds) { return ds.family || (SPEC.familyOf(ds.patch) || {}).family; }

// Classic / keystone. got = {maps} or {trees, keystone}; src = the source build.
function judgeMasteries(fromDs, toDs, src, got, reset) {
    const probs = [];
    const differ = familyOf(fromDs) !== familyOf(toDs) || fromDs.system !== toDs.system;
    if (toDs.system === "keystone") {
        const ref = K.keystoneCarry(fromDs, src.trees || {}, src.keystone || null, toDs);
        const empty = !Object.keys(got.trees || {}).some(function (t) { return Object.keys(got.trees[t]).length; }) && !got.keystone;
        if (differ) { if (!empty) probs.push("families differ (" + familyOf(fromDs) + " -> " + familyOf(toDs) + ") but points carried"); return { probs: probs, ref: ref }; }
        K.keystoneValid(toDs, got.trees || {}, got.keystone).forEach(function (p) { probs.push("invalid: " + p); });
        K.keystoneSubset(got, ref.candidate).forEach(function (p) { probs.push("not carried: " + p); });
        K.keystoneMaximal(toDs, got, ref.candidate).forEach(function (p) { probs.push("not maximal: " + p); });
        return { probs: probs, ref: ref };
    }
    const fromMaps = src.maps || [{}, {}, {}];
    if (fromDs.system === "keystone") {
        const empty = !(got.maps || []).some(function (o) { return Object.keys(o).length; });
        if (!empty) probs.push("keystone -> classic but points carried");
        return { probs: probs, ref: { dropped: 0 } };
    }
    const ref = K.classicCarry(fromDs, fromMaps, toDs);
    const empty = !(got.maps || []).some(function (o) { return Object.keys(o).length; });
    if (differ) { if (!empty) probs.push("families differ (" + familyOf(fromDs) + " -> " + familyOf(toDs) + ") but points carried"); return { probs: probs, ref: ref }; }
    K.classicValid(toDs, got.maps).forEach(function (p) { probs.push("invalid: " + p); });
    K.classicSubset(got.maps, ref.candidate).forEach(function (p) { probs.push("not carried: " + p); });
    K.classicMaximal(toDs, got.maps, ref.candidate).forEach(function (p) { probs.push("not maximal: " + p); });
    return { probs: probs, ref: ref };
}
function srcFromKeystoneOrClassic(fromDs, b) {
    return fromDs.system === "keystone" ? { trees: b.trees, keystone: b.keystone } : { maps: b.maps };
}

function judgeRunes(toDs, src, got) {
    const probs = [];
    K.runeValid(toDs, got.slots).forEach(function (p) { probs.push("invalid: " + p); });
    const idx = K.runeIndex(toDs), cats = K.slotCategories(toDs.slots || { mark: 9, seal: 9, glyph: 9, quintessence: 3 });
    src.slots.forEach(function (id, i) {
        if (got.slots[i] != null && got.slots[i] !== id) probs.push("slot " + i + ": " + id + " became " + got.slots[i]);
        if (id != null && got.slots[i] == null) {
            const r = idx[String(id)];
            if (r && r.category === cats[i]) probs.push("not maximal: slot " + i + " rune " + id + " exists in the target catalog but was dropped");
        }
    });
    if (got.level !== src.level) probs.push("champion level " + src.level + " -> " + got.level);
    return probs;
}

function judgeReforged(catalogTo, rowsTo, src, got) {
    const probs = [];
    const inSlot = function (pathId, k, id) { return K.rrRuneInSlot(catalogTo, pathId, k, id); };
    if (got.primary) got.primary.picks.forEach(function (id, k) { if (id != null && !inSlot(got.primary.path, k, id)) probs.push("invalid: primary " + id + " not in row " + k); });
    if (got.secondary) {
        if (got.primary && got.secondary.path === got.primary.path) probs.push("invalid: secondary path = primary");
        const n = got.secondary.picks.filter(function (x) { return x != null; }).length;
        if (n > 2) probs.push("invalid: " + n + " secondary picks");
        got.secondary.picks.forEach(function (id, k) { if (id != null && !inSlot(got.secondary.path, k + 1, id)) probs.push("invalid: secondary " + id + " not in row " + (k + 1)); });
    }
    if (rowsTo) got.shards.forEach(function (id, k) { if (id != null && !K.rrShardInRow(rowsTo, k, id)) probs.push("invalid: shard " + id + " not in row " + k); });
    // subset + maximal against the source
    const cmpSide = function (side, off) {
        const a = src[side], b = got[side];
        if (!a) { if (b && b.picks.some(function (x) { return x != null; })) probs.push("not carried: " + side + " appears"); return; }
        if (!b) { if (catalogTo.some(function (p) { return p.id === a.path; }) && !(side === "secondary" && src.primary && src.primary.path === a.path)) probs.push("not maximal: " + side + " path " + a.path + " dropped"); return; }
        if (b.path !== a.path) probs.push(side + " path " + a.path + " became " + b.path);
        a.picks.forEach(function (id, k) {
            const g = b.picks[k];
            if (g != null && g !== id) probs.push(side + " row " + (k + off) + ": " + id + " became " + g);
            if (id != null && g == null && inSlot(a.path, k + off, id)) probs.push("not maximal: " + side + " " + id + " (row " + (k + off) + ") still exists but was dropped");
        });
    };
    cmpSide("primary", 0);
    cmpSide("secondary", 1);
    src.shards.forEach(function (id, k) {
        const g = got.shards[k];
        if (g != null && g !== id) probs.push("shard row " + k + ": " + id + " became " + g);
        if (id != null && g == null && (!rowsTo || K.rrShardInRow(rowsTo, k, id))) probs.push("not maximal: shard " + id + " dropped");
    });
    if ((got.name || null) !== (src.name || null)) probs.push("page name " + JSON.stringify(src.name) + " -> " + JSON.stringify(got.name));
    return probs;
}

// ---------------------------------------------------------------------------
// X1-X3: the reference over the generated data
// ---------------------------------------------------------------------------

function datasetOf(world, e, c, cache) {
    if (cache[e.id] !== undefined) return cache[e.id];
    const ds = world.dataset(e);
    cache[e.id] = ds;
    return ds;
}

function runMasteries(world, c, args, browserPlan) {
    const ents = world.entries("masteries");
    if (!ents.list) { c.skip("masteries: " + ents.why); return; }
    const builds = parseInt(args.builds || "50", 10);
    const cache = {};
    let pairs = 0, n = 0, bad = 0, resets = 0, kept = 0, had = 0, missing = 0;
    pairsOf(ents.list, "masteries").forEach(function (pr) {
        const a = datasetOf(world, pr.from, c, cache), b = datasetOf(world, pr.to, c, cache);
        if (!a || !b) { missing++; if (missing <= 3) c.skip(pr.from.id + " -> " + pr.to.id + ": " + (a ? world.payload(pr.to).why : world.payload(pr.from).why)); return; }
        pairs++;
        const rng = U.makeRng("carry/masteries/" + pr.from.id + ">" + pr.to.id);
        let pairBad = 0;
        for (let i = 0; i < builds; i++) {
            const bld = a.system === "keystone" ? keystoneRandom(a, rng) : classicRandom(a, rng);
            const src = srcFromKeystoneOrClassic(a, bld);
            // the reference result, judged by the independent validators
            let got, ref;
            const total = a.system === "keystone" ? Object.keys(src.trees).reduce(function (s, t) { return s + Object.values(src.trees[t]).reduce(function (x, y) { return x + y; }, 0); }, 0)
                : src.maps.reduce(function (s, o) { return s + Object.values(o).reduce(function (x, y) { return x + y; }, 0); }, 0);
            if (b.system === "keystone") {
                ref = a.system === "keystone" ? K.keystoneCarry(a, src.trees, src.keystone, b) : { maps: { trees: {}, keystone: null }, dropped: total, reset: true };
                got = ref.maps;
            } else {
                ref = a.system === "classic" ? K.classicCarry(a, src.maps, b) : { maps: [{}, {}, {}], dropped: total, reset: true };
                got = { maps: ref.maps };
            }
            const j = judgeMasteries(a, b, src, got);
            // the source link itself must decode back to the build (canonical codec of A)
            const back = decodeOver("masteries", a, sourceHash({ page: "masteries", pair: pr, a: a, build: bld }));
            const backState = a.system === "keystone" ? { trees: back.state.trees, keystone: back.state.keystone } : { maps: back.state.maps };
            if (back.id !== pr.from.id || !U.deepEqual(backState, src) || (back.name || null) !== (bld.name || null)) j.probs.push("the canonical link of the build does not decode back (" + JSON.stringify(backState).slice(0, 120) + ")");
            n++;
            had += total;
            kept += total - (ref.dropped || 0);
            if (ref.reset) resets++;
            if (j.probs.length) { bad++; pairBad++; if (pairBad <= 1) c.fail(pr.from.id + " -> " + pr.to.id + " build " + i + ": " + j.probs.slice(0, 3).join("; ")); }
            if (browserPlan && i < browserPlan.builds) browserPlan.items.push({ page: "masteries", pair: pr, a: a, b: b, build: bld, src: src, ref: ref });
        }
    });
    if (missing > 3) c.skip("masteries: … " + (missing - 3) + " more pairs without data");
    if (pairs && !bad) c.pass("masteries: " + pairs + " pairs x " + builds + " builds = " + n + " switches valid, carried-only and maximal; " + resets + " family resets; " +
        Math.round(100 * kept / Math.max(1, had)) + "% of the points carried overall");
}

function runRunes(world, c, args, browserPlan) {
    const ents = world.entries("runes");
    if (!ents.list) { c.skip("runes: " + ents.why); return; }
    const builds = parseInt(args.builds || "50", 10);
    const cache = {};
    let pairs = 0, n = 0, bad = 0, dropped = 0, placed = 0, missing = 0;
    pairsOf(ents.list, "runes").forEach(function (pr) {
        const a = datasetOf(world, pr.from, c, cache), b = datasetOf(world, pr.to, c, cache);
        if (!a || !b) { missing++; if (missing <= 3) c.skip(pr.from.id + " -> " + pr.to.id + ": no data"); return; }
        pairs++;
        const rng = U.makeRng("carry/runes/" + pr.from.id + ">" + pr.to.id);
        let pairBad = 0;
        for (let i = 0; i < builds; i++) {
            const src = runeRandom(a, rng);
            const got = K.runeCarry(b, src.slots, src.level);
            const probs = judgeRunes(b, src, got);
            const back = decodeOver("runes", a, C.runeHash(pr.from.id, src.slots, src.level, null));
            if (back.id !== pr.from.id || !U.deepEqual(back.state, { slots: src.slots, level: src.level })) probs.push("the canonical link of the page does not decode back");
            n++;
            placed += src.slots.filter(function (x) { return x != null; }).length;
            dropped += got.dropped;
            if (probs.length) { bad++; pairBad++; if (pairBad <= 1) c.fail(pr.from.id + " -> " + pr.to.id + " page " + i + ": " + probs.slice(0, 3).join("; ")); }
            if (browserPlan && i < browserPlan.builds) browserPlan.items.push({ page: "runes", pair: pr, a: a, b: b, src: src, ref: got });
        }
    });
    if (missing > 3) c.skip("runes: … " + (missing - 3) + " more pairs without data");
    if (pairs && !bad) c.pass("runes: " + pairs + " pairs x " + builds + " pages = " + n + " switches valid and maximal, level kept; " + dropped + " of " + placed + " runes dropped (not in the target catalog)");
}

function runReforged(world, c, args, browserPlan) {
    const ents = world.entries("reforged");
    if (!ents.list) { c.skip("reforged: " + ents.why); return; }
    const dir = TL.reforgedCache(args);
    if (!dir) { c.skip("reforged: the runtime catalogs are needed (pass --research <dir> or --reforged-cache <dir>; nothing is downloaded)"); return; }
    const load = TL.catalogLoader(dir);
    const builds = parseInt(args.builds || "50", 10);
    let pairs = 0, n = 0, bad = 0, nocat = 0, noShards = {};
    pairsOf(ents.list, "reforged").forEach(function (pr) {
        const ca = load(pr.from.ddragonVersion), cb = load(pr.to.ddragonVersion);
        if (!ca || !cb) { nocat++; if (nocat <= 3) c.skip(pr.from.id + " -> " + pr.to.id + ": no cached runesReforged-" + (ca ? pr.to.ddragonVersion : pr.from.ddragonVersion) + ".json"); return; }
        const pa = world.payload(pr.from), pb = world.payload(pr.to);
        if (!("payload" in pa) || !("payload" in pb)) { nocat++; return; }
        const catA = K.applyPerkText(ca, pa.payload && pa.payload.perkText), catB = K.applyPerkText(cb, pb.payload && pb.payload.perkText);
        const ra = TL.shardRowsFor(world, pr.from.shardEra), rb = TL.shardRowsFor(world, pr.to.shardEra);
        if (ra.why) noShards[ra.why] = 1;
        if (rb.why) noShards[rb.why] = 1;
        pairs++;
        const rng = U.makeRng("carry/reforged/" + pr.from.id + ">" + pr.to.id);
        let pairBad = 0;
        for (let i = 0; i < builds; i++) {
            const src = reforgedRandom(catA, ra.rows, rng);
            const hash = C.reforgedHash(pr.from.id, src);
            const got = K.reforgedApply(catB, rb.rows, C.parseReforgedHash(hash));
            const probs = judgeReforged(catB, rb.rows, src, got);
            if (!U.deepEqual(K.reforgedApply(catA, ra.rows, C.parseReforgedHash(hash)), src)) probs.push("the link of the build does not decode back on its own patch");
            n++;
            if (probs.length) { bad++; pairBad++; if (pairBad <= 1) c.fail(pr.from.id + " -> " + pr.to.id + " build " + i + ": " + probs.slice(0, 3).join("; ")); }
            if (browserPlan && i < browserPlan.builds) browserPlan.items.push({ page: "reforged", pair: pr, src: src, catB: catB, rowsB: rb.rows, ref: got, hash: hash });
        }
    });
    if (nocat > 3) c.skip("reforged: … " + (nocat - 3) + " more pairs without a cached catalog");
    Object.keys(noShards).forEach(function (w) { c.skip("reforged: shard rows not validated: " + w); });
    if (pairs && !bad) c.pass("reforged: " + pairs + " pairs x " + builds + " builds = " + n + " switches valid, carried-only and maximal");
}

// ---------------------------------------------------------------------------
// X4: the real pages
// ---------------------------------------------------------------------------

const SELECTS = {
    masteries: { patch: "#patch-select", season: "#season-select" },
    runes: { patch: "#patch-select", season: "#season-select" },
    reforged: { patch: "#reforged-patch-select", season: "#reforged-season-select" }
};

function sourceHash(item) {
    const pr = item.pair;
    if (item.page === "masteries") {
        const a = item.a;
        if (a.system === "keystone") {
            const spec = C.keystoneSpec(a);
            return C.keystoneHash(pr.from.id, C.keystoneEncode(spec, C.keystoneFromMaps(spec, item.build.trees, item.build.keystone)), item.build.name);
        }
        const spec = C.classicSpec(a);
        return C.classicHash(pr.from.id, C.classicEncode(spec, C.classicMapsToRanks(spec, item.build.maps)), item.build.name, null);
    }
    if (item.page === "runes") return C.runeHash(pr.from.id, item.src.slots, item.src.level, null);
    return item.hash;
}

// Decode what the page wrote, over the target dataset.
function decodeResult(item, hash) { return decodeOver(item.page, item.b, hash, item.catB, item.rowsB); }
function decodeOver(page, b, hash, catB, rowsB) {
    if (page === "masteries") {
        const h = C.parseMasteryHash(hash);
        if (b.system === "keystone") {
            const spec = C.keystoneSpec(b);
            const m = C.keystoneToMaps(spec, C.keystoneDecode(spec, h.code));
            return { id: h.id, state: { trees: m.trees, keystone: m.keystone }, name: h.name };
        }
        const spec = C.classicSpec(b);
        const d = C.classicDecode(spec, h.code);
        return { id: h.id, state: { maps: C.classicRanksToMaps(spec, d.ranks) }, name: h.name };
    }
    if (page === "runes") {
        const h = C.parseRuneHash(hash);
        const slots = h.slotIds.slice(0, 30).map(function (x) { return !x || x === "_" ? null : x; });
        while (slots.length < 30) slots.push(null);
        return { id: h.id, state: { slots: slots, level: h.level } };
    }
    const p = C.parseReforgedHash(hash);
    return { id: p && p.id, state: K.reforgedApply(catB, rowsB, p) };
}

async function runBrowser(world, plan, c, args) {
    const exe = TL.findBrowser(args["browser-exe"]);
    if (!exe) { c.skip("no Edge / Chrome found (pass --browser-exe <exe>)"); return; }
    const ok = {};
    ["masteries", "runes", "reforged"].forEach(function (p) { ok[p] = TL.reworked(world.root, p); if (!ok[p].ok) c.skip(p + ": " + ok[p].why); });
    const items = plan.items.filter(function (it) { return ok[it.page].ok; });
    if (!items.length) return;
    const b = await TL.launchBrowser(exe);
    const catalogDir = TL.reforgedCache(args);
    const res = [];
    // One switch in a fresh tab. A same-season pair uses the Patch dropdown,
    // a season-default pair the Season dropdown (it lands on the target
    // season's default). A consecutive pair across a season line ("next"
    // only, e.g. V4.19 -> V4.20) has no single control in the UI: the Patch
    // dropdown lists one season, and the Season dropdown opens the season
    // default, not the next patch. It goes through the Patch dropdown's
    // change handler with the target added as an option, which is the code
    // path every in-page switch takes (DESIGN §2.5).
    const one = async function (it) {
        const tab = await TL.openTab(b, { catalogDir: catalogDir });
        try {
            const src = sourceHash(it);
            await tab.navigate(TL.fileUrl(path.join(world.root, TL.PAGE_FILE[it.page])) + "#" + src);
            const before = await TL.settle(tab, it.page, 600, 25000);
            if (before.timeout) return { it: it, src: src, before: before, switched: "page did not settle before the switch", errors: tab.errors.slice(), loadFailed: true };
            const sameSeason = it.pair.from.season === it.pair.to.season;
            const direct = !sameSeason && !/season/.test(it.pair.kind);
            const sel = sameSeason || direct ? SELECTS[it.page].patch : SELECTS[it.page].season;
            const val = sameSeason || direct ? it.pair.to.id : it.pair.to.season;
            const add = direct ? "if(!Array.prototype.some.call(s.options,function(x){return x.value===" + JSON.stringify(val) + "})){var n=document.createElement('option');n.value=" + JSON.stringify(val) + ";n.textContent=" + JSON.stringify(val) + ";s.appendChild(n);}" : "";
            const switched = await tab.eval("(function(){var s=document.querySelector(" + JSON.stringify(sel) + ");if(!s)return 'no select " + sel + "';" + add +
                "var o=Array.prototype.some.call(s.options,function(x){return x.value===" + JSON.stringify(val) + "});if(!o)return 'no option " + val + " in " + sel + "';" +
                "s.value=" + JSON.stringify(val) + ";s.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()");
            if (/^no select/.test(switched)) return { it: it, src: src, before: before, switched: switched, errors: tab.errors.slice(), loadFailed: true };
            // Wait until the URL names the target (the load is async, §2.5),
            // remembering a toast shown on the way, then let it settle.
            let toast = null;
            if (switched === "ok") {
                const want = JSON.stringify("#" + it.pair.to.id + "|"), isDef = JSON.stringify(it.pair.to.id === SPEC.PAGE_DEFAULTS[it.page]);
                for (let t = Date.now(); Date.now() - t < 20000;) {
                    const v = await tab.eval("(function(){var h=location.hash,t=document.getElementById('toast');" +
                        "return {hit:h.indexOf(" + want + ")===0||(" + isDef + "&&(h===''||h==='#')),toast:t&&t.classList.contains('visible')?t.textContent:null};})()").catch(function () { return {}; });
                    if (v.toast) toast = v.toast;
                    if (v.hit) break;
                    await new Promise(function (r) { setTimeout(r, 100); });
                }
            }
            const after = switched === "ok" ? await TL.settle(tab, it.page, 800, 25000) : null;
            if (after && !after.toast && toast) after.toast = toast;
            const patchNow = await tab.eval("(function(){var s=document.querySelector(" + JSON.stringify(SELECTS[it.page].patch) + ");return s?s.value:null;})()").catch(function () { return null; });
            return { it: it, src: src, before: before, switched: switched, after: after, patchNow: patchNow, errors: tab.errors.slice() };
        } finally { await tab.close(); }
    };
    // A tab that never drew the source page (a loaded machine can starve one
    // headless tab) is retried once in a fresh tab; a hung DevTools call
    // fails the item after 120 s instead of stalling the run.
    const guarded = function (it) {
        let timer;
        const hung = new Promise(function (r) { timer = setTimeout(function () { r({ it: it, src: sourceHash(it), switched: "harness: item hung > 120 s (a DevTools call never returned)", errors: [] }); }, 120000); });
        return Promise.race([one(it).catch(function (e) { return { it: it, src: sourceHash(it), switched: "harness: " + (e && e.message || e), errors: [], loadFailed: true }; }), hung])
            .then(function (r) { clearTimeout(timer); return r; });
    };
    try {
        await TL.pool(items, parseInt(args.par || "4", 10), async function (it) {
            let r = await guarded(it);
            if (r.loadFailed) { r = await guarded(it); r.retried = true; }
            res.push(r);
        });
    } finally { await b.close(); }
    const by = {};
    res.forEach(function (r) { (by[r.it.page] = by[r.it.page] || []).push(r); });
    Object.keys(by).forEach(function (page) {
        let good = 0, bad = 0;
        by[page].forEach(function (r) {
            const it = r.it, probs = [];
            if (r.switched !== "ok") probs.push(r.switched);
            else if (!r.after || r.after.timeout) probs.push("page did not settle after the switch");
            else {
                const hash = TL.stripHash(r.after.hash);
                if (r.patchNow !== it.pair.to.id) probs.push("patch dropdown shows " + r.patchNow + ", expected " + it.pair.to.id);
                const isDefaultEmpty = hash === "" && it.pair.to.id === SPEC.PAGE_DEFAULTS[page];
                const dec = isDefaultEmpty ? null : decodeResult(it, hash);
                if (!isDefaultEmpty && dec.id !== it.pair.to.id) probs.push("URL names " + dec.id + ", expected " + it.pair.to.id);
                const state = dec ? dec.state : (page === "runes" ? { slots: new Array(30).fill(null), level: 18 } : page === "masteries" && it.b.system === "keystone" ? { trees: {}, keystone: null } : { maps: [{}, {}, {}] });
                if (page === "masteries") {
                    judgeMasteries(it.a, it.b, it.src, state).probs.forEach(function (p) { probs.push(p); });
                    const nameNow = dec ? dec.name : null;
                    if ((it.build.name || null) !== (nameNow || null)) probs.push("page name " + JSON.stringify(it.build.name) + " -> " + JSON.stringify(nameNow));
                    const reset = U.deepEqual(familyOf(it.a), familyOf(it.b)) ? false : true;
                    if (reset && it.ref.dropped > 0 && !/rework|reset/i.test(r.after.toast || "")) probs.push("family reset without the 'Masteries were reworked …: page reset' toast (toast: " + JSON.stringify(r.after.toast) + ")");
                    else if (!reset && it.ref.dropped > 0 && !r.after.toast) probs.push(it.ref.dropped + " point(s) did not carry but no toast");
                } else if (page === "runes") {
                    judgeRunes(it.b, it.src, state).forEach(function (p) { probs.push(p); });
                    if (it.ref.dropped > 0 && !r.after.toast) probs.push(it.ref.dropped + " rune(s) did not carry but no toast");
                } else {
                    judgeReforged(it.catB, it.rowsB, it.src, state).forEach(function (p) { probs.push(p); });
                }
            }
            r.errors.forEach(function (e) { probs.push(e); });
            if (probs.length) { bad++; if (bad <= 5) c.fail(page + " " + it.pair.from.id + " -> " + it.pair.to.id + " (" + it.pair.kind + ") #" + r.src + ": " + probs.slice(0, 3).join("; ")); }
            else good++;
        });
        if (bad > 5) c.fail(page + ": … " + (bad - 5) + " more switches fail");
        if (!bad) c.pass(page + ": " + good + " switches in the real page are valid, carried-only and maximal, with the toast and page name / level as specified");
    });
}

// ---------------------------------------------------------------------------

async function main(argv) {
    let args;
    try { args = CP.parseArgs(argv); } catch (e) { console.error("test-carry: " + e.message); return 1; }
    const world = new World({ root: args.root, research: args.research });
    const rep = new Reporter({ verbose: args.verbose, json: args.json, allowSkip: args["allow-skip"], only: args.only ? args.only.map(function (o) { return ({ masteries: "X1", runes: "X2", reforged: "X3" })[o] || o; }).concat(args.browser ? ["X4"] : []) : null });
    console.log("test-carry (DESIGN §7.1 X)  " + CP.inputsSummary(world).split("\n").join("\n  "));
    console.log("");
    const plan = args.browser ? { builds: parseInt(args["browser-builds"] || "2", 10), items: [] } : null;
    rep.run("X1", "masteries: patch / season switches carry by key (§4.5)", function (c) { runMasteries(world, c, args, plan); });
    rep.run("X2", "runes: switches keep every rune the target catalog has", function (c) { runRunes(world, c, args, plan); });
    rep.run("X3", "Runes Reforged: switches keep every pick the target offers", function (c) { runReforged(world, c, args, plan); });
    const items = [];
    const ctx = { pass: function (m) { items.push(["pass", m]); }, fail: function (m) { items.push(["fail", m]); }, skip: function (m) { items.push(["skip", m]); }, info: function (m) { items.push(["info", m]); } };
    if (!plan) ctx.skip("browser layer not requested (--browser)");
    else { try { await runBrowser(world, plan, ctx, args); } catch (e) { ctx.fail("browser run crashed: " + (e && e.stack || e)); } }
    rep.run("X4", "the real pages carry the same way (--browser)", function (c) { items.forEach(function (i) { c[i[0]](i[1]); }); });
    return rep.finish("test-carry");
}

module.exports = { pairsOf: pairsOf, classicRandom: classicRandom, keystoneRandom: keystoneRandom, runeRandom: runeRandom, reforgedRandom: reforgedRandom,
    judgeMasteries: judgeMasteries, judgeRunes: judgeRunes, judgeReforged: judgeReforged };

if (require.main === module) main(process.argv.slice(2)).then(function (code) { process.exitCode = code; });
