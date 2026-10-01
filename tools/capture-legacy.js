#!/usr/bin/env node
// tools/capture-legacy.js: baseline capture of the legacy share links
// (per-patch datasets design, Phase 0 task P0-A; DESIGN §4.4, §6, §7.2).
//
// Runs the share-link code of the CURRENT calculators (the data files plus
// calculator.js / keystone-calculator.js / runes-calculator.js /
// runes-reforged.js, read from git at the baseline commit) in a Node VM with
// a stub `$` and a null DOM, and writes:
//   tools/fixtures/legacy-codecs.json  the legacy mastery codecs: per legacy
//                                      id the array order, ranks, hashRanks,
//                                      hashNote and the keystone tier lists
//   tools/fixtures/legacy-links.json   seeded random valid builds per legacy
//                                      id ({hash, expected}) plus the 23
//                                      baseline views
// Every record is self-checked: its hash, opened in a fresh VM page with the
// current code, decodes to `expected`, and the page writes back `hash` (or
// the documented `rewrite`).
//
// Usage (from the repo root):
//   node tools/capture-legacy.js fixtures [--rev <commit>|--worktree] --research <dir>
//       (re)generate both fixture files. <dir> = the research folder that
//       holds raw/reforged/runesReforged-<ddragon>.json (Data Dragon catalogs
//       of the 10 Reforged legacy ids; read only, no network)
//   node tools/capture-legacy.js check [--rev <commit>|--worktree] --research <dir>
//       re-run every committed record against the code at <rev>; writes
//       nothing; exit 1 on any mismatch
//   node tools/capture-legacy.js shots --out <dir> [--root <site>|--rev <commit>|--worktree]
//                                     [--browser <exe>] [--size WxH] [--only <re>] [--par N] [--runs N]
//       screenshots of the 23 views (empty, sample build, one tooltip each)
//       with headless Edge/Chrome over file:// (virtual time). Without --root
//       the commit is exported (git archive) to <dir>/site-<short rev> first,
//       so edits in the working tree never leak into a baseline; --worktree
//       (or --root <repo>) shoots a copy of the working tree. Writes
//       <dir>/<page>--<id>--{empty,build,tooltip}.png and <dir>/manifest.json
//       (sha256 per shot, tooltip text). Each view loads in --runs (3)
//       sessions and a shot keeps an image two sessions agree on.
//       --only <regex> re-shoots a subset.
//   node tools/capture-legacy.js verify-browser --out <dir> [--root <site>|--rev <commit>|--worktree]
//       loads each legacy view in the browser and runs all of its records
//       through the real page (hash handler, DOM and all); exit 1 on mismatch
//   node tools/capture-legacy.js compare <shotsA> <shotsB> [--tolerance N] [--max-pixels N]
//       pixel diff of two shot folders with the measured noise allowance
//       (COMPARE_TOLERANCE / COMPARE_MAX_PIXELS); exit 1 on any real change
// shots drive the browser over the DevTools protocol (Node 22+ WebSocket);
// verify-browser drives the pages through temporary copies written next to
// them (__lc-*.html in the site folder, removed afterwards).
//
// The default <rev> is BASELINE_COMMIT: the last commit before the per-patch
// rework. Output is deterministic (seeded PRNG, no timestamps), so a re-run
// gives byte-identical files.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const os = require("os");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..");
const FIX_DIR = path.join(__dirname, "fixtures");
const BASELINE_COMMIT = "9a0c627e3a814a2657fabceaceea34d782f1b2fc";
const SEED = "capture-legacy/v1";
const SIZE = "1440x900";

const PAGES = {
    masteries: { html: "index.html", keepHead: ["air-sheet.js"] },
    runes: { html: "runes.html", keepHead: [] },
    reforged: { html: "runes-reforged.html", keepHead: [] }
};

// The 23 legacy views of DESIGN §6 P0-A, in a fixed order.
const LEGACY_IDS = {
    masteries: ["s1-final", "s2-ahri", "s3-pbe", "s4-final", "s5-final", "s6-launch", "s7-preseason", "s7-final"],
    runes: ["preReforged-V3.14", "preReforged-V4.20", "preReforged-V5.21", "preReforged-V6.24", "preReforged-V7.21"],
    reforged: ["rr-v7-22", "rr-v8-23", "rr-v9-23", "rr-v10-23", "rr-v11-23", "rr-v12-23", "rr-v13-24",
               "rr-v14-19", "rr-v25-24", "rr-v26-13"]
};

const COUNTS = { masteries: 40, runes: 10, reforged: 10 };
const NAMES = ["My Page", "AD Carry 21/9/0", "Jungle - Tank", "Ü & Ö (test)", "Mid 9/21/0"];

// ---------------------------------------------------------------- utilities

function die(msg) { console.error("capture-legacy: " + msg); process.exit(1); }

function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            const k = a.slice(2);
            if (k === "worktree") out.rev = "worktree";
            else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
            else out[k] = true;
        } else out._.push(a);
    }
    return out;
}

function git(args, opts) {
    return cp.execFileSync("git", ["-C", REPO].concat(args),
        Object.assign({ encoding: "utf8", maxBuffer: 256 << 20 }, opts || {}));
}

function makeReader(rev) {
    const cache = new Map();
    return function read(p) {
        if (cache.has(p)) return cache.get(p);
        const text = rev === "worktree" ? fs.readFileSync(path.join(REPO, p), "utf8") : git(["show", rev + ":" + p]);
        cache.set(p, text);
        return text;
    };
}

function revInfo(rev) {
    if (rev === "worktree") return { commit: "worktree" };
    const full = git(["rev-parse", rev]).trim();
    const line = git(["log", "-1", "--format=%cI%x09%s", full]).trim().split("\t");
    return { commit: full, date: line[0], subject: line[1] };
}

// FNV-1a 32-bit, then mulberry32: one deterministic stream per legacy id.
function seedOf(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
}
function makeRng(label) {
    let a = seedOf(SEED + "/" + label);
    const next = function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = function (n) { return Math.floor(next() * n); };          // 0..n-1
    next.pick = function (arr) { return arr[next.int(arr.length)]; };
    next.weighted = function (items, w) {
        let sum = 0;
        for (const it of items) sum += w(it);
        let r = next() * sum;
        for (const it of items) { r -= w(it); if (r < 0) return it; }
        return items[items.length - 1];
    };
    return next;
}

// Mastery key = slug of the name (keystone data already uses such slugs as
// `id`; DESIGN §1.7). Curated identity aliases live in
// data/patches/masteries-families.json (T2), not here.
function slug(name) {
    return String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Order-insensitive for object keys (arrays keep their order).
function canon(x) {
    if (x === null || typeof x !== "object") return JSON.stringify(x === undefined ? null : x);
    if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
    return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}";
}
function deepEqual(a, b) { return canon(a) === canon(b); }
function clone(x) { return JSON.parse(JSON.stringify(x)); }

function retry(label, fn, ok) {
    for (let i = 0; i < 60; i++) { fn(); if (ok()) return; }
    die("no build found for " + label);
}

// Pretty JSON with chosen subtrees on one line (records stay one per line,
// so a regenerated fixture diffs per record).
function pretty(value, inline, pathKeys, indent) {
    pathKeys = pathKeys || [];
    indent = indent || "";
    if (value === null || typeof value !== "object" || inline(pathKeys, value)) return JSON.stringify(value);
    const inner = indent + "  ";
    if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return "[\n" + value.map((v, i) => inner + pretty(v, inline, pathKeys.concat(i), inner)).join(",\n") + "\n" + indent + "]";
    }
    const keys = Object.keys(value);
    if (!keys.length) return "{}";
    return "{\n" + keys.map(k => inner + JSON.stringify(k) + ": " + pretty(value[k], inline, pathKeys.concat(k), inner)).join(",\n") + "\n" + indent + "}";
}

function writeIfChanged(file, text) {
    const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (old === text) { console.log("unchanged " + path.relative(REPO, file)); return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    console.log("wrote     " + path.relative(REPO, file) + " (" + text.length + " bytes)");
}

// ------------------------------------------------------------- VM sandbox
// A null DOM: getElementById / querySelector find nothing, so the page code
// takes its "element absent" paths. `$` is a chainable no-op (every
// property and call yields the same proxy; .length is 0, so .each() and
// friends never call back). Timers are recorded and never fire. Only the
// share-link code paths matter here; the DOM is verified in the browser
// (verify-browser).

function jqStub(readyList) {
    let chain;
    const handler = {
        get(t, prop) {
            if (prop === "length") return 0;
            if (prop === Symbol.iterator) return function* () {};
            if (prop === Symbol.toPrimitive) return function () { return ""; };
            if (prop === "then") return undefined;
            if (prop === "toString" || prop === "valueOf") return function () { return ""; };
            return chain;
        },
        set() { return true; },
        apply() { return chain; },
        construct() { return chain; }
    };
    chain = new Proxy(function () {}, handler);
    const $ = function (arg) {
        if (typeof arg === "function") readyList.push(arg);
        return chain;
    };
    return new Proxy($, {
        get(t, prop) {
            if (prop in t) return t[prop];
            if (prop === "ajax" || prop === "getJSON" || prop === "get")
                return function () { throw new Error("$." + String(prop) + " is not available in the capture VM"); };
            return chain;
        }
    });
}

// The browser percent-encodes these in a fragment (URL spec fragment set).
function fragmentEncode(s) {
    return String(s).replace(/[\u0000-\u0020"<>`\u007f]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

function makeLocation(page, hash) {
    let frag = hash ? fragmentEncode(hash) : "";
    const setUrl = function (u) {
        u = String(u);
        const i = u.indexOf("#");
        frag = i >= 0 ? fragmentEncode(u.slice(i + 1)) : frag;
    };
    return {
        get hash() { return frag ? "#" + frag : ""; },
        set hash(v) { v = String(v); frag = fragmentEncode(v.charAt(0) === "#" ? v.slice(1) : v); },
        pathname: "/" + page,
        protocol: "file:",
        get href() { return "file:///site/" + page + (frag ? "#" + frag : ""); },
        replace(u) { u = String(u); const i = u.indexOf("#"); frag = i >= 0 ? fragmentEncode(u.slice(i + 1)) : ""; },
        assign: setUrl,
        _setUrl: setUrl
    };
}

function fakeElement() {
    const el = {
        style: { setProperty() {}, removeProperty() {} },
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        getAttribute() { return null; }, setAttribute() {}, removeAttribute() {}, hasAttribute() { return false; },
        appendChild(c) { return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
        addEventListener() {}, removeEventListener() {}, contains() { return false; },
        querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
        firstChild: null, children: [], childNodes: [], textContent: "", innerHTML: ""
    };
    return el;
}

function makeContext(page, hash) {
    const readyList = [];
    const location = makeLocation(PAGES[page].html, hash);
    const body = fakeElement();
    const document = {
        location,
        baseURI: "file:///site/" + PAGES[page].html,
        body, head: fakeElement(), documentElement: Object.assign(fakeElement(), { clientWidth: 1440, clientHeight: 900 }),
        readyState: "complete",
        getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
        getElementsByTagName() { return []; }, getElementsByClassName() { return []; },
        createElement() { return fakeElement(); }, createTextNode() { return fakeElement(); },
        addEventListener() {}, removeEventListener() {}, write() {}, execCommand() { return false; }
    };
    let timerId = 0;
    // No host built-ins (Array, Object, ...): the context has its own, and
    // mixing realms would break instanceof / Array.prototype calls.
    const sandbox = {
        console, URL,
        document, location,
        navigator: { userAgent: "capture-legacy", clipboard: null, language: "en-US" },
        history: { replaceState(s, t, u) { if (u != null) location._setUrl(u); }, pushState(s, t, u) { if (u != null) location._setUrl(u); } },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, isSecureContext: false,
        setTimeout() { return ++timerId; }, clearTimeout() {}, setInterval() { return ++timerId; }, clearInterval() {},
        requestAnimationFrame() { return ++timerId; }, cancelAnimationFrame() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
        getComputedStyle() { return { getPropertyValue() { return ""; } }; },
        matchMedia() { return { matches: false, addListener() {}, addEventListener() {} }; },
        Image: function () { this.src = ""; },
        $: jqStub(readyList)
    };
    sandbox.jQuery = sandbox.$;
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    return { ctx: sandbox, readyList, location };
}

// Compiled page scripts per (rev, page): the body scripts after jQuery, in
// page order, plus the head scripts in PAGES[page].keepHead (masteries:
// air-sheet.js for the real AirMasterySidebar page name).
const scriptCache = new Map();
function pageScripts(read, rev, page) {
    const key = rev + ":" + page;
    if (scriptCache.has(key)) return scriptCache.get(key);
    const html = read(PAGES[page].html);
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g)].map(m => m[1]);
    const j = srcs.findIndex(s => /(^|\/)vendor\/jquery[^/]*\.js$/.test(s));
    if (j < 0) die(PAGES[page].html + ": no vendor/jquery script tag at " + rev);
    const list = srcs.slice(0, j).filter(s => PAGES[page].keepHead.indexOf(s) >= 0).concat(srcs.slice(j + 1));
    const compiled = list.map(f => ({ file: f, script: new vm.Script(read(f), { filename: f }) }));
    scriptCache.set(key, compiled);
    return compiled;
}

// A fresh page. runReady: run the jQuery ready handlers (= a fresh tab
// opening `hash`). Masteries and runes boot fully on the null DOM;
// Reforged is driven by reforgedPage (its ready handler needs the stage).
// location.replace("#...") lands at once here; in Chrome it lands a task
// later (same end state; verify-browser waits for it).
function openPage(env, page, hash, runReady) {
    const { ctx, readyList, location } = makeContext(page, hash);
    for (const s of pageScripts(env.read, env.rev, page)) s.script.runInContext(ctx);
    if (runReady) for (const fn of readyList.splice(0)) fn.call(ctx.document, ctx.$);
    return { ctx, location };
}

function frag(location) { return location.hash.replace(/^#/, ""); }

// ------------------------------------------------------------ masteries

function classicCodec(ds) {
    return ds.data.map(function (tree, t) {
        const seen = new Set();
        return tree.map(function (m) {
            const key = slug(m.name);
            if (!key) die(ds.id + " tree " + t + ": empty key for " + JSON.stringify(m.name));
            if (seen.has(key)) die(ds.id + " tree " + t + ": duplicate key " + key);
            seen.add(key);
            const e = { key, name: m.name, ranks: m.ranks, index: m.index };
            if (m.hashRanks != null) e.hashRanks = m.hashRanks;
            if (m.hashNote != null) e.hashNote = m.hashNote;
            if (m.parent != null) e.parentKey = slug(tree[m.parent].name);
            return e;
        });
    });
}

function keystoneCodec(ds) {
    return ds.data.trees.map(function (tree) {
        const masteries = {};
        const tiers = tree.tiers.map(function (td) {
            return td.masteries.map(function (m, i) {
                if (masteries[m.id]) die(ds.id + " " + tree.id + ": duplicate mastery id " + m.id);
                const e = { name: m.name, tier: td.tier, ranks: m.ranks || 1 };
                if (m.slot != null && m.slot !== i) e.slot = m.slot;
                if (m.iconId != null) e.iconId = m.iconId;
                if (slug(m.name) !== m.id) e.nameSlug = slug(m.name);
                masteries[m.id] = e;
                return m.id;
            });
        });
        const pools = tree.tiers.map(td => td.isKeystone ? 1 : td.masteries.reduce((p, m) => Math.max(p, m.ranks || 1), 1));
        const keystoneTier = tree.tiers.findIndex(td => td.isKeystone);
        return { id: tree.id, name: tree.name, tiers, pools, keystoneTier, masteries };
    });
}

function extractCodecs(env) {
    const { ctx } = openPage(env, "masteries", "", false);
    const sets = ctx.masteryDataSets;
    const ids = sets.map(ds => ds.id);
    if (!deepEqual(ids.slice().sort(), LEGACY_IDS.masteries.slice().sort()))
        die("masteryDataSets ids " + ids.join(",") + " differ from the expected legacy ids");
    const datasets = {};
    for (const id of LEGACY_IDS.masteries) {
        const ds = ctx.getDataSet(id);
        const meta = {
            system: ds.system || "classic", season: ds.season, patch: ds.patch, patchLabel: ds.patchLabel,
            maxPoints: ds.maxPoints
        };
        if (ds.ddragonVersion) meta.ddragonVersion = ds.ddragonVersion;
        if (meta.system === "classic") {
            meta.look = ds.look || "client";
            meta.iconBase = ds.iconBase || "";
            meta.treeNames = ctx.treeNames.slice();
            meta.trees = classicCodec(ds);
        } else {
            if (ds.data.airFiveRankLayout) meta.airFiveRankLayout = ds.data.airFiveRankLayout;
            meta.trees = keystoneCodec(ds);
        }
        datasets[id] = meta;
    }
    return {
        defaultId: ctx.DEFAULT_DATA_SET_ID,
        constants: {
            alphabet: ctx.exportChars, maxbits: ctx.maxbits, currentPrefix: ctx.CODE_CURRENT_PREFIX,
            fieldBits: "floor(ranks/2)+1 per mastery in array order; legacy (plain) codes use hashRanks when set; '~'+code uses ranks",
            jumpFlag: "bit 5 (0x20) set = skip (value & 0x1f) masteries; else up to 5 data bits holding as many whole fields as fit",
            keystone: "trees ';'-joined, tiers ','-joined; minor tier = '<idx><ranks>' pairs '+'-joined; keystone tier = 'k<idx>'; idx = position in `tiers` (data order, not `slot`)"
        },
        datasets
    };
}

// Decode `hash` in a fresh page; return what the page holds and writes back.
function masteryDecode(env, codecs, hash) {
    const { ctx, location } = openPage(env, "masteries", hash, true);
    const id = ctx.activeDataSetId;
    const ds = ctx.getDataSet(id);
    const codec = codecs.datasets[id];
    const out = { id, total: 0, trees: null, keystone: null, name: null, notes: [] };
    if (ds.system === "keystone") {
        if (ctx.keystoneActiveDataSetId !== id) throw new Error("keystone dataset not active for " + hash);
        ctx.updateKeystoneLink();                     // the page's own link writer (next change)
        const trees = {};
        for (const tree of ds.data.trees) {
            const s = ctx.keystoneState[tree.id], m = {};
            for (const td of tree.tiers) {
                if (td.isKeystone) { if (s.keystone) m[s.keystone] = 1; continue; }
                for (const mm of td.masteries) { const r = s.tiers[td.tier][mm.id] || 0; if (r) m[mm.id] = r; }
            }
            trees[tree.id] = m;
            for (const k in m) out.total += m[k];
        }
        out.trees = trees;
        const act = ctx.keystoneState.__activeKeystone;
        out.keystone = act ? act.masteryId : null;
        if (ctx.getKeystoneTotalPoints() !== out.total) throw new Error("keystone total mismatch for " + hash);
    } else {
        ctx.updateLink();
        out.trees = codec.trees.map(function (entries, t) {
            const m = {};
            entries.forEach(function (e, i) { const r = ctx.state[t][i] || 0; if (r) { m[e.key] = r; out.total += r; } });
            return m;
        });
        if (ctx.totalPoints !== out.total) throw new Error("classic total mismatch for " + hash + ": " + ctx.totalPoints + " vs " + out.total);
        out.notes = ctx.decodeNotes.slice();
    }
    const name = ctx.AirMasterySidebar.pageName();
    out.name = name === ctx.AirMasterySidebar.DEFAULT_NAME ? null : name;
    out.rewrite = frag(location);
    return out;
}

function classicStateMap(ctx, codec) {
    return codec.trees.map(function (entries, t) {
        const m = {};
        entries.forEach(function (e, i) { const r = ctx.state[t][i] || 0; if (r) m[e.key] = r; });
        return m;
    });
}

// One random valid classic build by legal +1 clicks (the calculator's own
// isValidState). force: [{t, i, rank}] cells raised first whenever legal;
// while one is pending, the other points go to its tree (to unlock it).
function classicBuild(ctx, rng, target, opts) {
    opts = opts || {};
    ctx.resetStates(true);
    const data = ctx.data;
    const treeW = opts.treeW || [0, 1, 2].map(() => Math.pow(rng(), 2) + 0.02);
    const force = opts.force || [];
    let guard = 0;
    while (ctx.totalPoints < target && guard++ < 400) {
        const cands = [];
        for (let t = 0; t < 3; t++)
            for (let i = 0; i < data[t].length; i++) {
                const rank = ctx.state[t][i] || 0;
                if (ctx.isValidState(t, i, rank, +1)) cands.push({ t, i, rank });
            }
        // `exact`: forced cells never go above their rank
        if (opts.exact) for (let k = cands.length - 1; k >= 0; k--)
            if (force.some(f => f.t === cands[k].t && f.i === cands[k].i && cands[k].rank >= f.rank)) cands.splice(k, 1);
        if (!cands.length) break;
        const pending = force.filter(f => (ctx.state[f.t][f.i] || 0) < f.rank);
        let move = null;
        for (const f of pending) {
            const c = cands.find(c => c.t === f.t && c.i === f.i);
            if (c) { move = c; break; }
        }
        if (!move) {
            let from = cands;
            if (pending.length) {
                const sub = cands.filter(c => pending.some(f => f.t === c.t) && !force.some(f => f.t === c.t && f.i === c.i));
                if (sub.length) from = sub;
            }
            move = rng.weighted(from, c => treeW[c.t] * (1 + c.rank));
        }
        ctx.state[move.t][move.i] = move.rank + 1;
        ctx.totalPoints = ctx.totalPoints + 1;
    }
}

// Keystone: legal adds through the page's own click handler.
function keystoneBuild(ctx, rng, target, opts) {
    opts = opts || {};
    ctx.resetKeystones();
    const ds = ctx.keystoneActiveDataSet;
    const treeW = opts.treeW || ds.data.trees.map(() => Math.pow(rng(), 2) + 0.02);
    const favored = {};
    ds.data.trees.forEach(function (tree) {
        tree.tiers.forEach(function (td) {
            if (rng() < 0.7) favored[tree.id + ":" + td.tier] = rng.pick(td.masteries).id;
        });
    });
    const force = opts.force || [];
    let guard = 0;
    while (ctx.getKeystoneTotalPoints() < target && guard++ < 400) {
        const budget = ds.maxPoints - ctx.getKeystoneTotalPoints();
        const cands = [];
        ds.data.trees.forEach(function (tree, ti) {
            const s = ctx.keystoneState[tree.id];
            tree.tiers.forEach(function (td) {
                if (!ctx.isKeystoneTierUnlocked(tree.id, td.tier) || budget <= 0) return;
                td.masteries.forEach(function (m) {
                    let ok;
                    if (td.isKeystone) ok = !ctx.keystoneState.__activeKeystone;
                    else {
                        const pool = ctx.keystoneTierPool(td), total = ctx.keystoneTierTotal(tree.id, td.tier);
                        const cur = s.tiers[td.tier][m.id] || 0;
                        ok = pool === 1 ? total === 0 : (total < pool && cur < (m.ranks || 1));
                    }
                    if (ok) cands.push({ tree, ti, td, m });
                });
            });
        });
        if (!cands.length) break;
        const ranksOf = f => {
            const s = ctx.keystoneState[f.tree];
            if (s.keystone === f.id) return 1;
            for (const t in s.tiers) if (s.tiers[t][f.id]) return s.tiers[t][f.id];
            return 0;
        };
        const pending = force.filter(f => ranksOf(f) < f.rank);
        let move = null;
        for (const f of pending) {
            const c = cands.find(c => c.tree.id === f.tree && c.m.id === f.id);
            if (c) { move = c; break; }
        }
        if (!move) {
            let from = cands;
            if (pending.length) {
                const sub = cands.filter(c => pending.some(f => f.tree === c.tree.id) && !force.some(f => f.tree === c.tree.id && f.id === c.m.id));
                if (sub.length) from = sub;
            }
            move = rng.weighted(from, function (c) {
                const fav = favored[c.tree.id + ":" + c.td.tier];
                return treeW[c.ti] * (fav ? (fav === c.m.id ? 10 : 1) : 1);
            });
        }
        const before = ctx.getKeystoneTotalPoints();
        ctx.handleKeystonePickClick(move.tree.id, move.td, move.m);
        if (ctx.getKeystoneTotalPoints() !== before + 1)
            throw new Error("keystone click did not add a point (" + move.tree.id + "/" + move.m.id + ")");
    }
}

function keystoneStateMap(ctx) {
    const trees = {};
    for (const tree of ctx.keystoneActiveDataSet.data.trees) {
        const s = ctx.keystoneState[tree.id], m = {};
        for (const td of tree.tiers) {
            if (td.isKeystone) { if (s.keystone) m[s.keystone] = 1; continue; }
            for (const mm of td.masteries) { const r = s.tiers[td.tier][mm.id] || 0; if (r) m[mm.id] = r; }
        }
        trees[tree.id] = m;
    }
    const act = ctx.keystoneState.__activeKeystone;
    return { trees, keystone: act ? act.masteryId : null };
}

function totalOf(trees) {
    let n = 0;
    const list = Array.isArray(trees) ? trees : Object.keys(trees).map(k => trees[k]);
    for (const m of list) for (const k in m) n += m[k];
    return n;
}

function randomTarget(rng) {
    const r = rng();
    return r < 0.5 ? 30 : 1 + rng.int(29);
}

function generateMasteries(env, codecs) {
    const out = {};
    for (const id of LEGACY_IDS.masteries) {
        const rng = makeRng("masteries/" + id);
        const codec = codecs.datasets[id];
        const keystone = codec.system === "keystone";
        const { ctx, location } = openPage(env, "masteries", id + "|", true);
        if (ctx.activeDataSetId !== id) die("could not open " + id);
        const recs = [];
        const sb = ctx.AirMasterySidebar;
        const emit = function (form, name, extra) {
            sb.pageName(name || sb.DEFAULT_NAME);
            if (keystone) ctx.updateKeystoneLink(); else ctx.updateLink();
            let hash = frag(location);
            const exp = keystone ? keystoneStateMap(ctx) : { trees: classicStateMap(ctx, codec), keystone: null };
            const rec = { form, hash, expected: { total: totalOf(exp.trees), trees: exp.trees } };
            if (keystone) rec.expected.keystone = exp.keystone;
            if (name) rec.expected.name = name;
            if (hash === "") { rec.hash = id + "|"; rec.rewrite = ""; }       // default set, empty build
            Object.assign(rec, extra || {});
            recs.push(rec);
            return rec;
        };
        const build = function (target, opts) {
            if (keystone) keystoneBuild(ctx, rng, target, opts); else classicBuild(ctx, rng, target, opts);
        };

        // 1. the empty page, then random valid builds (some named)
        build(0); emit("empty");
        for (let n = 0; n < COUNTS.masteries; n++) {
            build(randomTarget(rng));
            emit(n % 9 === 4 ? "named" : "random", n % 9 === 4 ? NAMES[(n / 9 | 0) % NAMES.length] : null);
        }

        // 2. coverage: every mastery at its max rank at least once
        const covered = new Set();
        const mark = function (rec) {
            const trees = rec.expected.trees;
            if (keystone) {
                for (const tree of codec.trees) for (const k in trees[tree.id])
                    if (trees[tree.id][k] >= tree.masteries[k].ranks) covered.add(tree.id + "/" + k);
            } else {
                trees.forEach(function (m, t) {
                    for (const k in m) if (m[k] >= codec.trees[t].find(e => e.key === k).ranks) covered.add(t + "/" + k);
                });
            }
        };
        recs.forEach(mark);
        const todo = [];
        if (keystone) codec.trees.forEach(function (tree, ti) {
            for (const k in tree.masteries) if (!covered.has(tree.id + "/" + k)) todo.push({ ti, tree: tree.id, id: k });
        });
        else codec.trees.forEach(function (entries, t) {
            entries.forEach(function (e, i) { if (!covered.has(t + "/" + e.key)) todo.push({ t, i, key: e.key }); });
        });
        for (const goal of todo) {
            const done = () => covered.has(keystone ? goal.tree + "/" + goal.id : goal.t + "/" + goal.key);
            if (done()) continue;
            let opts, reached;
            if (keystone) {
                const treeW = codec.trees.map((tr, i) => i === goal.ti ? 1 : 0.05);
                const ranks = codec.trees[goal.ti].masteries[goal.id].ranks;
                opts = { treeW, force: [{ tree: goal.tree, id: goal.id, rank: ranks }] };
                reached = () => (keystoneStateMap(ctx).trees[goal.tree][goal.id] || 0) >= ranks;
            } else {
                const treeW = [0, 1, 2].map(t => t === goal.t ? 1 : 0.05);
                const chain = [];
                for (let i = goal.i; i != null; i = ctx.data[goal.t][i].parent)
                    chain.unshift({ t: goal.t, i, rank: ctx.data[goal.t][i].ranks });
                opts = { treeW, force: chain };
                reached = () => (ctx.state[goal.t][goal.i] || 0) >= ctx.data[goal.t][goal.i].ranks;
            }
            retry(id + " coverage " + JSON.stringify(goal), () => build(30, opts), reached);
            mark(emit("coverage"));
            if (!done()) die(id + ": coverage build could not reach " + JSON.stringify(goal));
        }

        // 3. per-codec special forms
        sb.pageName(sb.DEFAULT_NAME);
        if (!keystone) {
            const hasRanks = [];
            codec.trees.forEach((entries, t) => entries.forEach((e, i) => { if (e.hashRanks != null) hasRanks.push({ t, i, e }); }));
            const rankAt = h => ctx.state[h.t][h.i] || 0;
            for (const h of hasRanks) {
                const treeW = [0, 1, 2].map(t => t === h.t ? 1 : 0.3);
                if (h.e.hashRanks > h.e.ranks) {
                    // Old links wrote this field wider (S1 Preservation was
                    // Perseverance, 3 ranks): values above `ranks` clamp, with
                    // the hashNote toast. The legacy writer is encodeMasteries
                    // with the hashRanks widths and the old value poked in;
                    // the build stays valid after the clamp (and <= 30 points
                    // with the old value).
                    for (let v = h.e.ranks + 1; v <= h.e.hashRanks; v++) {
                        for (let k = 0; k < 2; k++) {
                            retry(id + " wide " + h.e.key, () => classicBuild(ctx, rng, 30 - (v - h.e.ranks),
                                { force: [{ t: h.t, i: h.i, rank: h.e.ranks }], treeW, exact: true }), () => rankAt(h) === h.e.ranks);
                            const exp = classicStateMap(ctx, codec);
                            ctx.updateLink();
                            const canonical = frag(location);
                            ctx.state[h.t][h.i] = v;
                            ctx.codecCurrent = false;
                            const code = ctx.encodeMasteries();
                            ctx.state[h.t][h.i] = h.e.ranks;
                            recs.push({ form: "legacy-wide-field", hash: id + "|" + code,
                                expected: { total: totalOf(exp), trees: exp, notes: [h.e.hashNote] }, rewrite: canonical,
                                legacyValue: { tree: h.t, key: h.e.key, value: v } });
                        }
                    }
                } else if (h.e.hashRanks < h.e.ranks) {
                    // A rank the legacy width cannot hold forces "~" + code in
                    // the current widths (S4/S5 Inspiration 2/2).
                    for (let k = 0; k < 3; k++) {
                        const target = k === 2 ? 30 : 16 + rng.int(14);
                        retry(id + " tilde " + h.e.key, () => classicBuild(ctx, rng, target,
                            { force: [{ t: h.t, i: h.i, rank: h.e.ranks }], treeW }), () => rankAt(h) === h.e.ranks);
                        const rec = emit("tilde");
                        if (rec.hash.indexOf("|" + ctx.CODE_CURRENT_PREFIX) < 0) die(id + ": expected a ~ code: " + rec.hash);
                    }
                    // "~" also decodes a code that fits the legacy widths; the
                    // page re-exports it without "~".
                    for (let k = 0; k < 2; k++) {
                        retry(id + " tilde-fits " + h.e.key, () => classicBuild(ctx, rng, 30,
                            { force: [{ t: h.t, i: h.i, rank: h.e.hashRanks }], treeW, exact: true }), () => rankAt(h) === h.e.hashRanks);
                        const exp = classicStateMap(ctx, codec);
                        ctx.updateLink();
                        const canonical = frag(location);
                        ctx.codecCurrent = true;
                        const code = ctx.encodeMasteries();
                        ctx.codecCurrent = false;
                        recs.push({ form: "tilde-fits-legacy", hash: id + "|" + ctx.CODE_CURRENT_PREFIX + code,
                            expected: { total: totalOf(exp), trees: exp }, rewrite: canonical });
                    }
                }
            }
            if (id === codecs.defaultId) {
                // Plain "#<code>" (no pipe) = the default set; "~" no-op.
                for (let k = 0; k < 5; k++) {
                    retry(id + " plain", () => classicBuild(ctx, rng, randomTarget(rng)), () => ctx.totalPoints > 0);
                    const exp = classicStateMap(ctx, codec);
                    ctx.updateLink();
                    const canonical = frag(location);
                    const code = canonical.slice(canonical.indexOf("|") + 1);
                    recs.push({ form: "plain", hash: code, expected: { total: totalOf(exp), trees: exp }, rewrite: canonical });
                    if (k < 2) recs.push({ form: "tilde-noop", hash: id + "|" + ctx.CODE_CURRENT_PREFIX + code,
                        expected: { total: totalOf(exp), trees: exp }, rewrite: canonical });
                }
            }
        }
        // A name that the sidebar normalises (whitespace collapsed, trimmed).
        build(randomTarget(rng));
        sb.pageName(sb.DEFAULT_NAME);
        if (keystone) ctx.updateKeystoneLink(); else ctx.updateLink();
        const base = frag(location);
        const exp = keystone ? keystoneStateMap(ctx) : { trees: classicStateMap(ctx, codec), keystone: null };
        const raw = "  Two   spaces ";
        const expected = { total: totalOf(exp.trees), trees: exp.trees };
        if (keystone) expected.keystone = exp.keystone;
        expected.name = "Two spaces";
        recs.push({ form: "name-normalized", hash: (base || id + "|") + "|" + encodeURIComponent(raw),
            expected, rewrite: (base || id + "|") + "|" + encodeURIComponent("Two spaces") });
        out[id] = recs;
    }
    return out;
}

// ---------------------------------------------------------------- runes

function runeDecode(env, hash) {
    const { ctx, location } = openPage(env, "runes", hash, true);
    return {
        id: ctx.activeRuneDataSetId,
        slots: ctx.runeSlots.map(r => r ? r.id : null),
        level: ctx.championLevel,
        rewrite: frag(location)
    };
}

function generateRunes(env) {
    const out = {};
    for (const id of LEGACY_IDS.runes) {
        const rng = makeRng("runes/" + id);
        const { ctx, location } = openPage(env, "runes", id + "|", true);
        if (ctx.activeRuneDataSetId !== id) die("could not open " + id);
        const ds = ctx.activeRuneDataSet;
        const byCat = {};
        for (const r of ds.runes) (byCat[r.category] = byCat[r.category] || []).push(r);
        const recs = [];
        const emit = function (form, extra) {
            ctx.updateLink();
            const rec = { form, hash: frag(location), expected: { slots: ctx.runeSlots.map(r => r ? r.id : null), level: ctx.championLevel } };
            if (rec.hash === "") { rec.hash = id + "|"; rec.rewrite = ""; }
            Object.assign(rec, extra || {});
            recs.push(rec);
            return rec;
        };
        const fill = function (style, level) {
            ctx.initSlotsForDataSet(ds);
            const pickFor = {};
            for (let i = 0; i < ctx.runeSlots.length; i++) {
                const cat = ctx.slotMeta[i].category;
                let r;
                if (style === "uniform") {
                    // one or two runes per colour, like a real page
                    pickFor[cat] = pickFor[cat] || [rng.pick(byCat[cat]), rng.pick(byCat[cat])];
                    r = ctx.slotMeta[i].indexInCategory < (cat === "quintessence" ? 2 : 6) ? pickFor[cat][0] : pickFor[cat][1];
                } else r = rng() < 0.15 ? null : rng.pick(byCat[cat]);
                ctx.runeSlots[i] = r;
            }
            ctx.setChampionLevel(level);
        };
        ctx.initSlotsForDataSet(ds); ctx.setChampionLevel(18); emit("empty");
        ctx.initSlotsForDataSet(ds); ctx.setChampionLevel(7); emit("empty-level");
        for (let n = 0; n < COUNTS.runes; n++) {
            const style = n % 2 ? "random" : "uniform";
            fill(style, n % 3 === 2 ? 1 + rng.int(17) : 18);
            emit(style);
        }
        // event runes (Snowdown / Harrowing / Razer) in every slot they fit
        const ev = ds.runes.filter(r => r.event);
        if (ev.length) {
            ctx.initSlotsForDataSet(ds);
            for (let i = 0; i < ctx.runeSlots.length; i++) {
                const c = ev.filter(r => r.category === ctx.slotMeta[i].category);
                ctx.runeSlots[i] = c.length ? c[i % c.length] : null;
            }
            ctx.setChampionLevel(18);
            emit("event");
        }
        if (id === ctx.DEFAULT_RUNE_DATA_SET_ID) {
            // plain "#<30 ids>" (no pipe) = the default set at level 18
            for (let k = 0; k < 2; k++) {
                fill(k ? "random" : "uniform", 18);
                const exp = { slots: ctx.runeSlots.map(r => r ? r.id : null), level: 18 };
                ctx.updateLink();
                const canonical = frag(location);
                recs.push({ form: "plain", hash: canonical.slice(canonical.indexOf("|") + 1), expected: exp, rewrite: canonical });
            }
        }
        out[id] = recs;
    }
    return out;
}

// -------------------------------------------------------------- reforged

function loadCatalogs(env, research) {
    const { ctx } = openPage(env, "reforged", "", false);
    const ids = ctx.reforgedDataSets.map(d => d.id);
    if (!deepEqual(ids.slice().sort(), LEGACY_IDS.reforged.slice().sort()))
        die("reforgedDataSets ids " + ids.join(",") + " differ from the expected legacy ids");
    const out = {};
    for (const id of LEGACY_IDS.reforged) {
        const ver = ctx.getReforgedDataSet(id).ddragonVersion;
        const f = path.join(research, "raw", "reforged", "runesReforged-" + ver + ".json");
        if (!fs.existsSync(f)) die("missing Data Dragon catalog " + f + " (fetch https://ddragon.leagueoflegends.com/cdn/" + ver + "/data/en_US/runesReforged.json into the research cache)");
        const text = fs.readFileSync(f, "utf8");
        out[id] = { ver, json: JSON.parse(text), sha256: crypto.createHash("sha256").update(text).digest("hex") };
    }
    return out;
}

// The catalog-loaded half of activateReforgedDataSet (and the same-dataset
// popstate handler): perk texts, client sort, reset, apply the parsed hash.
function reforgedPage(env, id, catalogs) {
    const { ctx } = openPage(env, "reforged", "", false);
    ctx.reforgedState.dataSetId = id;
    ctx.reforgedState.catalog = ctx.sortReforgedCatalog(ctx.rrApplyPerkText(clone(catalogs[id].json), id));
    ctx.resetReforgedSelections();
    ctx.reforgedState.pageName = null;
    return ctx;
}

function reforgedStateOf(ctx) {
    const s = ctx.reforgedState;
    return {
        primary: s.primaryPath ? { path: s.primaryPath.id, picks: s.primaryPicks.slice() } : null,
        secondary: s.secondaryPath ? { path: s.secondaryPath.id, picks: s.secondaryPicks.slice(1) } : null,
        shards: s.shards.slice(),
        name: s.pageName || null
    };
}

function reforgedDecode(env, catalogs, hash) {
    const parsedId = (hash.indexOf("|") < 0 && /%7C/i.test(hash) ? decodeURIComponent(hash) : hash).split("|")[0];
    const { ctx: probe } = openPage(env, "reforged", "", false);
    if (!probe.getReforgedDataSet(parsedId)) throw new Error("unknown rr id in " + hash);
    const ctx = reforgedPage(env, parsedId, catalogs);
    const parsed = ctx.parseReforgedHash(hash);
    if (!parsed) throw new Error("parseReforgedHash rejected " + hash);
    ctx.applyReforgedHashAfterLoad(parsed, true);
    return Object.assign({ id: parsed.dsId }, reforgedStateOf(ctx), { rewrite: ctx.buildReforgedHash() });
}

function generateReforged(env, catalogs) {
    const out = {};
    for (const id of LEGACY_IDS.reforged) {
        const rng = makeRng("reforged/" + id);
        const ctx = reforgedPage(env, id, catalogs);
        const ds = ctx.getReforgedDataSet(id);
        const rows = ctx.getReforgedShardRows(ds);
        const cat = ctx.reforgedState.catalog;
        const recs = [];
        const set = function (opts) {
            ctx.resetReforgedSelections();
            ctx.reforgedState.pageName = opts.name || null;
            const s = ctx.reforgedState;
            if (opts.primary) {
                const p = opts.primary;
                s.primaryPath = p;
                for (let r = 0; r < 4; r++)
                    s.primaryPicks[r] = opts.pFill[r] ? rng.pick(p.slots[r].runes).id : null;
            }
            if (opts.secondary) {
                const sp = opts.secondary;
                s.secondaryPath = sp;
                s.secondaryOrder = [];
                for (const r of opts.sRows) { s.secondaryPicks[r] = rng.pick(sp.slots[r].runes).id; s.secondaryOrder.push(r); }
            }
            if (rows) s.shards = rows.map(row => opts.shards ? String(rng.pick(row.shards).id) : null);
        };
        const emit = function (form, extra) {
            const rec = { form, hash: ctx.buildReforgedHash(), expected: reforgedStateOf(ctx) };
            Object.assign(rec, extra || {});
            recs.push(rec);
            return rec;
        };
        const twoRows = function () { const r = [1, 2, 3]; r.splice(rng.int(3), 1); return r; };
        set({}); emit("empty");
        for (let n = 0; n < COUNTS.reforged; n++) {
            const p = rng.pick(cat);
            const others = cat.filter(x => x.id !== p.id);
            const full = n < 6;
            const opts = { primary: p, secondary: rng.pick(others), pFill: [true, true, true, true], sRows: twoRows(), shards: true };
            if (!full) {
                opts.pFill = [0, 1, 2, 3].map(() => rng() < 0.6);
                opts.sRows = twoRows().filter(() => rng() < 0.6);
                opts.shards = rng() < 0.5;
                if (n === 8) delete opts.primary;
                if (n === 9) delete opts.secondary;
            }
            if (n === 3 || n === 7) opts.name = NAMES[n === 3 ? 0 : 2];
            set(opts);
            emit(opts.name ? "named" : full ? "full" : "partial");
        }
        const full = recs.find(r => r.form === "full");
        // the bare id (a nav link) and a percent-encoded paste of a full link
        recs.push({ form: "bare-id", hash: id, expected: reforgedStateOf((set({}), ctx)), rewrite: ctx.buildReforgedHash() });
        recs.push({ form: "percent-encoded", hash: encodeURIComponent(full.hash), expected: full.expected, rewrite: full.hash });
        out[id] = recs;
    }
    return out;
}

// ------------------------------------------------------------ self-check

function normalizeMasteryGot(got, rec) {
    const e = { total: got.total, trees: got.trees };
    if ("keystone" in rec.expected) e.keystone = got.keystone;
    if (got.name) e.name = got.name;
    if (got.notes && got.notes.length) e.notes = got.notes;
    return e;
}

function checkAll(env, codecs, links, catalogs) {
    let n = 0;
    const fails = [];
    const fail = function (page, id, rec, msg) { fails.push(page + " " + id + " [" + rec.form + "] " + rec.hash + ": " + msg); };
    for (const id of Object.keys(links.masteries)) for (const rec of links.masteries[id]) {
        n++;
        let got;
        try { got = masteryDecode(env, codecs, rec.hash); } catch (e) { fail("masteries", id, rec, e.message); continue; }
        if (got.id !== id) fail("masteries", id, rec, "opened " + got.id);
        const g = normalizeMasteryGot(got, rec);
        if (!deepEqual(g, rec.expected)) fail("masteries", id, rec, "decoded " + JSON.stringify(g) + " expected " + JSON.stringify(rec.expected));
        const want = "rewrite" in rec ? rec.rewrite : rec.hash;
        if (got.rewrite !== want) fail("masteries", id, rec, "page wrote " + JSON.stringify(got.rewrite) + " expected " + JSON.stringify(want));
    }
    for (const id of Object.keys(links.runes)) for (const rec of links.runes[id]) {
        n++;
        let got;
        try { got = runeDecode(env, rec.hash); } catch (e) { fail("runes", id, rec, e.message); continue; }
        if (got.id !== id) fail("runes", id, rec, "opened " + got.id);
        if (!deepEqual({ slots: got.slots, level: got.level }, rec.expected)) fail("runes", id, rec, "decoded " + JSON.stringify(got));
        const want = "rewrite" in rec ? rec.rewrite : rec.hash;
        if (got.rewrite !== want) fail("runes", id, rec, "page wrote " + JSON.stringify(got.rewrite));
    }
    for (const id of Object.keys(links.reforged)) for (const rec of links.reforged[id]) {
        n++;
        let got;
        try { got = reforgedDecode(env, catalogs, rec.hash); } catch (e) { fail("reforged", id, rec, e.message); continue; }
        if (got.id !== id) fail("reforged", id, rec, "opened " + got.id);
        const g = { primary: got.primary, secondary: got.secondary, shards: got.shards, name: got.name };
        if (!deepEqual(g, rec.expected)) fail("reforged", id, rec, "decoded " + JSON.stringify(g));
        const want = "rewrite" in rec ? rec.rewrite : rec.hash;
        if (got.rewrite !== want) fail("reforged", id, rec, "page wrote " + JSON.stringify(got.rewrite));
    }
    // and the codecs re-extract identically
    const again = extractCodecs(env);
    if (!deepEqual(again, codecs.body)) fails.push("legacy-codecs.json differs from a fresh extraction");
    return { n, fails };
}

// ---------------------------------------------------------------- views

// The sample build of a view: among the full (30-point) random builds the
// one that lights the most cells (first such record on a tie).
function richest(recs, ok) {
    let best = null, bestN = -1;
    for (const r of recs) {
        if (!ok(r)) continue;
        const trees = r.expected.trees;
        const list = Array.isArray(trees) ? trees : Object.keys(trees).map(k => trees[k]);
        const n = list.reduce((a, m) => a + Object.keys(m).length, 0) + list.filter(m => Object.keys(m).length).length * 100;
        if (n > bestN) { best = r; bestN = n; }
    }
    return best;
}

function pickViews(codecs, links) {
    const views = [];
    for (const id of LEGACY_IDS.masteries) {
        const c = codecs.datasets[id];
        const recs = links.masteries[id];
        let sample, tip;
        if (c.system === "keystone") {
            sample = richest(recs, r => r.form === "random" && r.expected.total === 30 && r.expected.keystone) ||
                recs.find(r => r.expected.total === 30 && r.expected.keystone);
            // hover: a 5-rank mastery left part-filled, else the keystone
            for (const tree of c.trees) for (const k in sample.expected.trees[tree.id]) {
                const r = sample.expected.trees[tree.id][k];
                if (!tip && r > 0 && r < tree.masteries[k].ranks) tip = { tree: tree.id, key: k, rank: r };
            }
            if (!tip) for (const tree of c.trees) if (tree.masteries[sample.expected.keystone]) tip = { tree: tree.id, key: sample.expected.keystone, rank: 1 };
            tip.selector = '#keystone-calculator .ks-mastery[data-tree="' + tip.tree + '"][data-mastery="' + tip.key + '"]';
        } else {
            sample = richest(recs, r => r.form === "random" && r.expected.total === 30 &&
                r.expected.trees.some((m, t) => Object.keys(m).some(k => m[k] < c.trees[t].find(e => e.key === k).ranks)));
            sample.expected.trees.forEach(function (m, t) {
                c.trees[t].forEach(function (e, i) {
                    const r = m[e.key] || 0;
                    if (!tip && r > 0 && r < e.ranks) tip = { tree: t, index: i, key: e.key, rank: r };
                });
            });
            tip.selector = '#calculator .button[data-tree="' + tip.tree + '"][data-index="' + tip.index + '"]';
        }
        views.push({ page: "masteries", id, empty: "index.html#" + id + "|", sample: "index.html#" + sample.hash, tooltip: tip });
    }
    for (const id of LEGACY_IDS.runes) {
        const sample = links.runes[id].find(r => r.form === "uniform" && r.expected.slots.every(Boolean) && r.expected.level === 18);
        const slot = 27;    // the first quintessence
        views.push({ page: "runes", id, empty: "runes.html#" + id + "|", sample: "runes.html#" + sample.hash,
            tooltip: { slot, rune: sample.expected.slots[slot], selector: '#rune-slots .rune-slot.filled[data-slot="' + slot + '"]' } });
    }
    for (const id of LEGACY_IDS.reforged) {
        const sample = links.reforged[id].find(r => r.form === "full");
        const k = sample.expected.primary.picks[0];
        views.push({ page: "reforged", id, empty: "runes-reforged.html#" + id, sample: "runes-reforged.html#" + sample.hash,
            tooltip: { rune: k, selector: '.rr-perk.is-keystone[data-id="' + k + '"]' } });
    }
    return views;
}

// ------------------------------------------------------------- commands

function makeEnv(args) {
    const rev = args.rev || BASELINE_COMMIT;
    return { rev, read: makeReader(rev), info: revInfo(rev) };
}

function needResearch(args) {
    if (!args.research || args.research === true) die("--research <dir> is required (the folder with raw/reforged/)");
    const dir = path.resolve(String(args.research));
    if (!fs.existsSync(path.join(dir, "raw", "reforged"))) die("no raw/reforged/ under " + dir);
    return dir;
}

function buildAll(env, research) {
    const codecBody = extractCodecs(env);
    const codecs = Object.assign({ body: codecBody }, codecBody);
    const catalogs = loadCatalogs(env, research);
    const links = {
        masteries: generateMasteries(env, codecs),
        runes: generateRunes(env),
        reforged: generateReforged(env, catalogs)
    };
    return { codecs, catalogs, links };
}

function codecsFile(env, codecs) {
    const doc = {
        about: {
            tool: "tools/capture-legacy.js",
            baseline: env.info,
            source: "masteryDataSets of the files index.html loads at the baseline commit (season*-data.js, data.js), " +
                "read in a Node VM; the codec constants come from calculator.js / keystone-calculator.js",
            key: "slug of the mastery name (lowercase, accents and apostrophes dropped, other runs of non-alphanumerics -> '-'); keystone `id` as is",
            plainCode: codecs.defaultId
        },
        constants: codecs.constants,
        datasets: codecs.datasets
    };
    return pretty(doc, function (p) {
        // trees[t][i] entries and keystone tier lists / mastery rows inline
        if (p[0] === "datasets" && p[2] === "trees" && p.length === 5 && typeof p[4] === "number") return true;
        if (p[0] === "datasets" && p[2] === "trees" && p.length === 5 && (p[4] === "tiers" || p[4] === "pools")) return true;
        if (p[0] === "datasets" && p[2] === "trees" && p.length === 6 && p[4] === "masteries") return true;
        if (p[0] === "datasets" && p[2] === "treeNames") return true;
        return false;
    }) + "\n";
}

function linksFile(env, built, views) {
    const { links, catalogs } = built;
    const counts = {};
    let total = 0;
    for (const page of Object.keys(links)) {
        counts[page] = {};
        for (const id of Object.keys(links[page])) { counts[page][id] = links[page][id].length; total += links[page][id].length; }
    }
    const doc = {
        about: {
            tool: "tools/capture-legacy.js",
            baseline: env.info,
            seed: SEED,
            total,
            counts,
            reforgedCatalogs: Object.fromEntries(Object.keys(catalogs).map(id => [id, { ddragon: catalogs[id].ver, sha256: catalogs[id].sha256 }])),
            record: "{form, hash, expected, rewrite?}: opening <page>#<hash> with the baseline code gives `expected`, and the page writes back `rewrite` (or `hash` itself when absent)",
            expected: {
                masteries: "classic: {total, trees: [{key: rank} x3], name?, notes?}; keystone: {total, trees: {treeId: {key: rank}}, keystone: key|null, name?} (the keystone is also in its tree map with rank 1)",
                runes: "{slots: [30 rune ids or null, slot order mark x9, seal x9, glyph x9, quintessence x3], level}",
                reforged: "{primary: {path, picks: [keystone, row1, row2, row3]}|null, secondary: {path, picks: [row1, row2, row3]}|null, shards: [offense, flex, defense], name}"
            },
            forms: {
                empty: "nothing spent", "empty-level": "no runes, champion level != 18", random: "seeded random valid build",
                named: "random build with a page name segment", coverage: "built to put a mastery at its max rank",
                uniform: "rune page with one or two runes per colour", event: "event runes in every slot they fit",
                "legacy-wide-field": "old link: a field wider than the corrected mastery (hashRanks > ranks); the value clamps and `notes` is the toast",
                tilde: "'~' + code in the current widths (a rank the legacy width cannot hold)",
                "tilde-fits-legacy": "'~' code whose build fits the legacy widths; re-exported without '~'",
                "tilde-noop": "'~' on a set without hashRanks", plain: "no '<id>|' prefix: the page's default set",
                "name-normalized": "page name with extra whitespace; the sidebar collapses it",
                full: "keystone + 3 runes, 2 secondary runes, all shards", partial: "some picks missing",
                "bare-id": "the id alone (nav link)", "percent-encoded": "a full link pasted percent-encoded once"
            },
            views: "the 23 baseline views (DESIGN §6 P0-A): empty view, sample build, and a tooltip target per legacy id; shots via `capture-legacy.js shots`"
        },
        views,
        masteries: links.masteries,
        runes: links.runes,
        reforged: links.reforged
    };
    return pretty(doc, function (p) {
        if (p.length === 3 && (p[0] === "masteries" || p[0] === "runes" || p[0] === "reforged")) return true;
        if (p.length === 2 && p[0] === "views") return true;
        if (p[0] === "about" && p.length === 3 && (p[1] === "counts" || p[1] === "reforgedCatalogs")) return true;
        return false;
    }) + "\n";
}

function cmdFixtures(args) {
    const env = makeEnv(args);
    const research = needResearch(args);
    const built = buildAll(env, research);
    const views = pickViews(built.codecs, built.links);
    const res = checkAll(env, built.codecs, built.links, built.catalogs);
    if (res.fails.length) {
        res.fails.slice(0, 40).forEach(f => console.error("FAIL " + f));
        die(res.fails.length + " of " + res.n + " records fail the self-check; nothing written");
    }
    console.log("self-check: " + res.n + " records decode to `expected` and re-export to `hash`/`rewrite` (baseline " + env.info.commit + ")");
    writeIfChanged(path.join(FIX_DIR, "legacy-codecs.json"), codecsFile(env, built.codecs));
    writeIfChanged(path.join(FIX_DIR, "legacy-links.json"), linksFile(env, built, views));
}

function cmdCheck(args) {
    const env = makeEnv(args);
    const research = needResearch(args);
    const links = JSON.parse(fs.readFileSync(path.join(FIX_DIR, "legacy-links.json"), "utf8"));
    const codecDoc = JSON.parse(fs.readFileSync(path.join(FIX_DIR, "legacy-codecs.json"), "utf8"));
    const body = { defaultId: codecDoc.about.plainCode, constants: codecDoc.constants, datasets: codecDoc.datasets };
    const codecs = Object.assign({ body }, body);
    const catalogs = loadCatalogs(env, research);
    for (const id of Object.keys(catalogs)) {
        const want = links.about.reforgedCatalogs[id];
        if (!want || want.sha256 !== catalogs[id].sha256) die("catalog of " + id + " differs from the one the fixtures were made with");
    }
    const res = checkAll(env, codecs, { masteries: links.masteries, runes: links.runes, reforged: links.reforged }, catalogs);
    // the generator is deterministic: regenerate and compare bytes too
    const built = buildAll(env, research);
    const views = pickViews(built.codecs, built.links);
    const freshLinks = linksFile(env, built, views), freshCodecs = codecsFile(env, built.codecs);
    if (env.rev === BASELINE_COMMIT || env.info.commit === links.about.baseline.commit) {
        if (freshLinks !== fs.readFileSync(path.join(FIX_DIR, "legacy-links.json"), "utf8")) res.fails.push("legacy-links.json is not what the generator writes");
        if (freshCodecs !== fs.readFileSync(path.join(FIX_DIR, "legacy-codecs.json"), "utf8")) res.fails.push("legacy-codecs.json is not what the generator writes");
    }
    if (res.fails.length) {
        res.fails.slice(0, 60).forEach(f => console.error("FAIL " + f));
        die(res.fails.length + " failures (" + res.n + " records)");
    }
    console.log("ok: " + res.n + " records re-decode to themselves with " + env.info.commit + "; files regenerate byte-identically");
}

// --------------------------------------------------------------- browser

function findBrowser(args) {
    const c = [args.browser, process.env.LOL_BROWSER,
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    for (const p of c) if (p && p !== true && fs.existsSync(p)) return p;
    die("no Edge / Chrome found; pass --browser <exe>");
}

function fileUrl(dir) {
    let p = fs.realpathSync.native(dir).replace(/\\/g, "/");
    if (!p.startsWith("/")) p = "/" + p;
    return "file://" + p.split("/").map(encodeURIComponent).join("/").replace(/%3A/g, ":") + "/";
}

// The site the browser loads. The tool writes its driven pages next to the
// real ones (see drivenHtml), so the git working tree is never used in
// place: --worktree (or --root <repo>) mirrors it to <out>/site-worktree.
function siteRoot(args, outDir) {
    const rev = args.rev || BASELINE_COMMIT;
    let root = args.root && args.root !== true ? path.resolve(String(args.root)) : null;
    if (rev === "worktree" && !root) root = REPO;
    if (root && path.relative(REPO, root) === "") {
        const dir = path.join(outDir, "site-worktree");
        fs.rmSync(dir, { recursive: true, force: true });
        fs.cpSync(REPO, dir, { recursive: true, filter: src => !/[\\/](\.git|node_modules)([\\/]|$)/.test(path.relative(REPO, src) ? "/" + path.relative(REPO, src) : "") });
        console.log("mirrored the working tree to " + dir);
        return dir;
    }
    if (root) return root;
    const full = git(["rev-parse", rev]).trim();
    const stem = "site-" + full.slice(0, 7);
    const dir = path.join(outDir, stem);
    if (!fs.existsSync(path.join(dir, "index.html"))) {
        fs.mkdirSync(dir, { recursive: true });
        const tar = path.join(outDir, stem + ".tar");
        git(["archive", "--format=tar", "-o", tar, full]);
        // relative archive path: GNU tar would read "C:\..." as host:path
        cp.execFileSync("tar", ["-xf", "../" + stem + ".tar"], { cwd: dir });
        fs.unlinkSync(tar);
        console.log("exported " + full + " to " + dir);
    }
    return dir;
}

function runBrowser(exe, argv, timeoutMs) {
    return new Promise(function (resolve) {
        const prof = fs.mkdtempSync(path.join(os.tmpdir(), "lmcap-"));
        const child = cp.spawn(exe, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
            "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + prof].concat(argv), { stdio: ["ignore", "pipe", "pipe"] });
        let out = "", err = "";
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { err += d; });
        const t = setTimeout(() => { try { child.kill(); } catch (e) {} }, timeoutMs);
        child.on("close", function (code) {
            clearTimeout(t);
            setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} resolve({ code, out, err }); }, 300);
        });
    });
}

function unescapeHtml(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

async function pool(items, n, fn) {
    const res = new Array(items.length);
    let next = 0;
    async function worker() { while (next < items.length) { const i = next++; res[i] = await fn(items[i], i); } }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return res;
}

// A driven copy of a page, written NEXT TO the page (<site>/__lc-<name>.html,
// removed again by cleanupDriven) so every relative URL - and every "#..."
// the page navigates to - resolves exactly as on the real page: the page's
// own HTML plus one script at the end of <body> that, once `ready` holds,
// runs `js` (w = window, d = document; may return a Promise) and puts the
// result in <pre id="__lc_out"> for --dump-dom (an ERR shows in red).
// Top level on purpose: in a file:// iframe Chrome turns the pages'
// location.replace("#...") into a reload of the frame, and a <base href>
// would send those fragments to another URL.
const drivenFiles = [];
function cleanupDriven() {
    while (drivenFiles.length) { try { fs.unlinkSync(drivenFiles.pop()); } catch (e) {} }
}
process.on("exit", cleanupDriven);
function writeDriven(siteDir, name, html, ready, js) {
    const file = path.join(siteDir, "__lc-" + name.replace(/[^A-Za-z0-9_.-]/g, "_") + ".html");
    fs.writeFileSync(file, drivenHtml(siteDir, html, ready, js));
    drivenFiles.push(file);
    return fileUrl(siteDir) + encodeURIComponent(path.basename(file));
}
function drivenHtml(siteDir, html, ready, js) {
    const src = fs.readFileSync(path.join(siteDir, html), "utf8");
    const driver = "(function(){var w=window,d=document;" +
        "function cloneHover(){for(var s=0;s<d.styleSheets.length;s++){var ss=d.styleSheets[s],r;try{r=ss.cssRules}catch(e){continue}" +
        "for(var i=r.length-1;i>=0;i--){var x=r[i];if(x.selectorText&&x.selectorText.indexOf(':hover')>=0){" +
        "try{ss.insertRule(x.selectorText.replace(/:hover/g,'.dbg-hover')+'{'+x.style.cssText+'}',r.length)}catch(e){}}}}}" +
        "function out(t,show){var o=d.getElementById('__lc_out');o.textContent=t;o.style.display=show?'block':'none';}" +
        "function run(){try{Promise.resolve((function(){" + js + "\n})()).then(function(v){out('OK '+JSON.stringify(v===undefined?null:v),false);}," +
        "function(e){out('ERR '+e+' '+(e&&e.stack),true);});}catch(e){out('ERR '+e+' '+(e&&e.stack),true);}}" +
        "var n=0,iv=setInterval(function(){var ok=false;try{ok=(function(){" + ready + "\n})();}catch(e){}" +
        "if(ok||++n>150){clearInterval(iv);setTimeout(run,300);}},100);})();";
    const tail = '<pre id="__lc_out" style="display:none;position:fixed;left:0;top:0;z-index:2147483647;margin:0;font:12px monospace;color:red;background:#fff;pointer-events:none">PENDING</pre>' +
        "<script>" + driver.replace(/<\/(script)/gi, "<\\/$1") + "</script>\n";
    const at = src.lastIndexOf("</body>");
    if (at < 0) die(html + ": no </body>");
    return src.slice(0, at) + tail + src.slice(at);
}

function readOut(dom) {
    const m = /<pre id="__lc_out"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
    return m ? unescapeHtml(m[1]) : "NO-OUT";
}

// When a view counts as drawn. DOM only (no calculator globals), so the
// same conditions hold for the reworked pages in the after-rework shots.
const READY = {
    masteries: "return !!(w.jQuery && (d.querySelector('#calculator .button') || d.querySelector('#keystone-calculator .ks-mastery')));",
    runes: "return !!(w.jQuery && d.querySelector('#rune-slots .rune-slot') && d.querySelector('#runes-categories .rl-cat'));",
    reforged: "var l=d.querySelector('#reforged-calculator .rr-loading');return !!(w.jQuery && l && l.style.display === 'none' && d.querySelector('#reforged-calculator .rr-picker, #reforged-calculator .rr-body:not([hidden])'));"
};

// ---- DevTools-protocol shooter ----------------------------------------------
// Each view opens in a fresh browser context (own storage) of a headless
// Edge/Chrome driven over CDP (Node's built-in WebSocket). Before a capture
// the page must be settled: the view's ready condition holds, web fonts are
// loaded (document.fonts), no request has been in flight for SETTLE_MS, and
// every CSS animation / transition is finished (finite) or parked at t=0
// (infinite). The tooltip shot is the build shot plus a real mouse move to
// the target's centre (CDP Input, so :hover and the pages' own mouseover /
// mouseenter / mousemove handlers fire as for a user).

const SETTLE_MS = 800;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launchCdp(exe, W, H) {
    if (typeof WebSocket !== "function") die("this Node has no global WebSocket (Node 22+ needed for shots)");
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), "lmcap-"));
    const child = cp.spawn(exe, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
        "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + prof,
        "--window-size=" + W + "," + H, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const wsUrl = await new Promise(function (resolve, reject) {
        let buf = "";
        const t = setTimeout(() => reject(new Error("no DevTools endpoint from " + exe)), 30000);
        child.stderr.on("data", function (d) {
            buf += d;
            const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
            if (m) { clearTimeout(t); resolve(m[1]); }
        });
        child.on("exit", () => reject(new Error("browser exited early")));
    });
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("CDP connect failed")); });
    let seq = 0;
    const pending = new Map(), listeners = new Set();
    ws.onmessage = function (ev) {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(p.method + ": " + msg.error.message)); else p.resolve(msg.result);
        } else for (const l of listeners) l(msg);
    };
    const send = (method, params, sessionId) => new Promise(function (resolve, reject) {
        const id = ++seq;
        pending.set(id, { resolve, reject, method });
        ws.send(JSON.stringify(Object.assign({ id, method, params: params || {} }, sessionId ? { sessionId } : {})));
    });
    return {
        send,
        on: fn => listeners.add(fn),
        off: fn => listeners.delete(fn),
        async close() {
            try { await Promise.race([send("Browser.close"), sleep(3000)]); } catch (e) {}
            try { ws.close(); } catch (e) {}
            try { child.kill(); } catch (e) {}
            await sleep(300);
            try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
        }
    };
}

// Finish finite animations / transitions, park infinite ones at 0, twice
// (a finished transition can start another), then two frames.
const SETTLE_JS = "(async function(){var d=document;" +
    "function park(){d.getAnimations().forEach(function(a){try{var t=a.effect&&a.effect.getComputedTiming();" +
    "if(t&&isFinite(t.endTime))a.finish();else{a.pause();a.currentTime=0;}}catch(e){}});}" +
    "await d.fonts.ready;park();await new Promise(function(r){setTimeout(r,250)});park();" +
    "await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});" +
    "return {fonts:d.fonts.status,animations:d.getAnimations().filter(function(a){return a.playState==='running'}).length," +
    "images:Array.prototype.filter.call(d.images,function(i){return !i.complete}).length};})()";

async function cdpView(b, url, W, H, ready, steps) {
    const { browserContextId } = await b.send("Target.createBrowserContext", {});
    const { targetId } = await b.send("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => b.send(m, p, sessionId);
    const inflight = new Set(), errors = [];
    let lastNet = Date.now(), loaded = false;
    const onMsg = function (msg) {
        if (msg.sessionId !== sessionId) return;
        const p = msg.params || {};
        if (msg.method === "Network.requestWillBeSent") { inflight.add(p.requestId); lastNet = Date.now(); }
        else if (msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") {
            inflight.delete(p.requestId); lastNet = Date.now();
            if (msg.method === "Network.loadingFailed" && !p.canceled) errors.push("request failed: " + p.errorText);
        } else if (msg.method === "Page.loadEventFired") loaded = true;
        else if (msg.method === "Runtime.exceptionThrown") {
            const x = p.exceptionDetails || {};
            errors.push("exception: " + ((x.exception && x.exception.description) || x.text));
        } else if (msg.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert"))
            errors.push("console." + p.type + ": " + (p.args || []).map(a => a.value !== undefined ? a.value : a.description).join(" "));
    };
    b.on(onMsg);
    const evalJs = async function (expr) {
        const r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("evaluate: " + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
        return r.result.value;
    };
    const settle = async function (extra) {
        const deadline = Date.now() + 45000;
        const cond = "(function(){var w=window,d=document;try{return !!(function(){" + ready + "\n})()" +
            (extra ? "&&!!(function(){" + extra + "\n})()" : "") + "&&d.fonts.status==='loaded';}catch(e){return false;}})()";
        for (;;) {
            if (loaded && await evalJs(cond) && inflight.size === 0 && Date.now() - lastNet >= SETTLE_MS) break;
            if (Date.now() > deadline) throw new Error("page did not settle (" + inflight.size + " requests in flight, loaded=" + loaded + ")");
            await sleep(100);
        }
        return evalJs(SETTLE_JS);
    };
    const out = [];
    try {
        await s("Page.enable"); await s("Runtime.enable"); await s("Network.enable");
        await s("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
        await s("Page.navigate", { url });
        for (const step of steps) {
            let info = null;
            if (step.hover) {
                const sel = JSON.stringify(step.hover);
                await settle("return !!d.querySelector(" + sel + ");");
                const r = await evalJs("(function(){var el=document.querySelector(" + sel + ");var b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()");
                await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y, button: "none" });
                await sleep(300);
                await settle("return !!(w.LolTooltip&&w.LolTooltip.isVisible());");
                info = await evalJs("(function(){var t=window.LolTooltip,e=t&&t.element&&t.element();return {x:" + r.x + ",y:" + r.y +
                    ",visible:!!(t&&t.isVisible()),text:e?String(e.innerText||e.textContent).replace(/\\s+/g,' ').trim():null};})()");
            } else info = await settle(null);
            // Two consecutive captures must agree: headless now and then
            // composites a stale tile (a duplicated strip of the page).
            let prev = null, png = null;
            for (let k = 0; k < 6 && !png; k++) {
                const shot = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
                const buf = Buffer.from(shot.data, "base64");
                if (prev) {
                    const r = compareImages(decodePngBuf(prev), decodePngBuf(buf), COMPARE_TOLERANCE);
                    if (!r.size && r.changed <= COMPARE_MAX_PIXELS) png = buf;
                }
                prev = buf;
                if (!png) { await sleep(250); await evalJs(SETTLE_JS); }
            }
            if (!png) throw new Error("captures did not agree");
            fs.writeFileSync(step.png, png);
            out.push(info);
        }
    } finally {
        b.off(onMsg);
        try { await b.send("Target.closeTarget", { targetId }); } catch (e) {}
        try { await b.send("Target.disposeBrowserContext", { browserContextId }); } catch (e) {}
    }
    return { out, errors };
}

async function cmdShots(args) {
    if (!args.out || args.out === true) die("--out <dir> is required");
    const out = path.resolve(String(args.out));
    fs.mkdirSync(out, { recursive: true });
    const exe = findBrowser(args);
    const root = siteRoot(args, out);
    const base = fileUrl(root);
    const size = String(args.size || SIZE);
    const [W, H] = size.split("x").map(Number);
    const links = JSON.parse(fs.readFileSync(path.join(FIX_DIR, "legacy-links.json"), "utf8"));
    const only = args.only && args.only !== true ? new RegExp(String(args.only)) : null;
    // one job per page load: the empty view; the sample build + its tooltip
    const jobs = [];
    for (const v of links.views) {
        const stem = v.page + "--" + v.id;
        jobs.push({ view: v.empty, page: v.page, shots: [{ name: stem + "--empty" }] });
        jobs.push({ view: v.sample, page: v.page, shots: [{ name: stem + "--build" }, { name: stem + "--tooltip", hover: v.tooltip.selector }] });
    }
    const todo = jobs.map(j => Object.assign({}, j, { shots: j.shots.filter(x => !only || only.test(x.name)) }))
        .filter(j => j.shots.length);
    const par = Math.max(1, Number(args.par || 3));
    const browsers = [];
    for (let i = 0; i < Math.min(par, todo.length); i++) browsers.push(await launchCdp(exe, W, H));
    const results = [];
    let next = 0;
    // Each view is loaded in `runs` independent sessions; a shot keeps the
    // first image that another session reproduces (compare's allowance).
    // Now and then a session rasterises a few text edges differently.
    const runs = Math.max(1, Number(args.runs || 3));
    const shootJob = async function (b, j) {
        const final = j.shots.map(x => path.join(out, x.name + ".png"));
        final.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        const sessions = [];
        for (let r = 0; r < runs; r++) {
            const steps = j.shots.map((x, k) => ({ hover: x.hover || null, png: runs > 1 ? final[k].replace(/\.png$/, ".run" + r + ".png") : final[k] }));
            sessions.push({ steps, res: await cdpView(b, base + j.view, W, H, READY[j.page], steps) });
        }
        return j.shots.map(function (x, k) {
            let pick = 0, agreed = 1;
            if (runs > 1) {
                const imgs = sessions.map(sn => decodePng(sn.steps[k].png));
                const same = (p, q) => { const c = compareImages(imgs[p], imgs[q], COMPARE_TOLERANCE); return !c.size && c.changed <= COMPARE_MAX_PIXELS; };
                pick = -1;
                for (let p = 0; p < runs && pick < 0; p++) for (let q = p + 1; q < runs; q++) if (same(p, q)) { pick = p; break; }
                if (pick >= 0) agreed = imgs.filter((im, q) => q === pick || same(pick, q)).length;
                if (pick >= 0) fs.copyFileSync(sessions[pick].steps[k].png, final[k]);
                sessions.forEach(sn => { try { fs.unlinkSync(sn.steps[k].png); } catch (e) {} });
            }
            const r = sessions[Math.max(0, pick)].res;
            const res = { name: x.name, view: j.view, ok: pick >= 0 && fs.existsSync(final[k]), sha256: null, agreed: agreed + "/" + runs,
                settled: r.out[k], errors: [].concat.apply([], sessions.map(sn => sn.res.errors)) };
            if (pick < 0) res.error = "no two of " + runs + " sessions agree";
            if (res.ok) res.sha256 = crypto.createHash("sha256").update(fs.readFileSync(final[k])).digest("hex");
            if (x.hover) {
                res.hover = x.hover;
                res.tooltip = { text: r.out[k].text, x: r.out[k].x, y: r.out[k].y };
                delete res.settled;
                if (!r.out[k].visible) res.ok = false;
            }
            return res;
        });
    };
    await Promise.all(browsers.map(async function (b) {
        while (next < todo.length) {
            const j = todo[next++];
            let res;
            for (let attempt = 0; attempt < 2 && !res; attempt++) {
                try { res = await shootJob(b, j); }
                catch (e) { if (attempt) res = j.shots.map(x => ({ name: x.name, view: j.view, ok: false, error: String(e.message || e) })); }
            }
            for (const r of res) {
                console.log((r.ok ? "ok   " : "FAIL ") + r.name + (r.agreed && r.agreed.split("/")[0] !== r.agreed.split("/")[1] ? "  (sessions agreeing " + r.agreed + ")" : "") +
                    (r.error ? "  " + r.error : "") + (r.errors && r.errors.length ? "  [" + r.errors.length + " page errors]" : ""));
                results.push(r);
            }
        }
    }));
    for (const b of browsers) await b.close();
    // manifest in view order; --only updates its entries in an existing one
    const order = jobs.flatMap(j => j.shots.map(x => x.name));
    const mf = path.join(out, "manifest.json");
    const byName = new Map();
    if (only && fs.existsSync(mf)) for (const r of JSON.parse(fs.readFileSync(mf, "utf8")).shots || []) byName.set(r.name, r);
    for (const r of results) byName.set(r.name, r);
    const shots = order.map(n => byName.get(n)).filter(Boolean);
    const manifest = { tool: "tools/capture-legacy.js shots", size, browser: exe, baseline: links.about.baseline.commit, root, settleMs: SETTLE_MS, runs,
        tolerance: COMPARE_TOLERANCE, maxPixels: COMPARE_MAX_PIXELS, shots };
    fs.writeFileSync(mf, JSON.stringify(manifest, null, 1) + "\n");
    const bad = results.filter(r => !r.ok).length;
    const withErrors = results.filter(r => r.errors && r.errors.length).length;
    console.log(results.length - bad + "/" + results.length + " shots in " + out + " (manifest: " + shots.length +
        (withErrors ? "; " + withErrors + " with page errors, see manifest" : "") + ")");
    if (bad) process.exit(1);
}

// ---- compare: pixel diff of two shot folders (no dependencies) -------------
// Two captures of the same page differ by resampling noise on scaled icons
// (dozens of pixels, channel delta <= 10 between baseline runs) and, on the
// League Client mastery page, by the anti-aliased top row of the info-bar
// circle buttons (4-8 pixels, delta 42). A pixel counts as changed when a
// channel differs by more than COMPARE_TOLERANCE; a shot is "same" when at
// most COMPARE_MAX_PIXELS pixels changed (one changed digit is ~40 pixels).
const COMPARE_TOLERANCE = 24;
const COMPARE_MAX_PIXELS = 16;

function decodePng(file) { return decodePngBuf(fs.readFileSync(file), file); }
function decodePngBuf(buf, file) {
    file = file || "png";
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ": not a PNG");
    let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off), kind = buf.toString("latin1", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
        if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
        else if (kind === "IDAT") idat.push(data);
        else if (kind === "IEND") break;
        off += 12 + len;
    }
    const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
    if (depth !== 8 || !bpp || interlace) throw new Error(file + ": unsupported PNG (depth " + depth + ", type " + type + ")");
    const raw = require("zlib").inflateSync(Buffer.concat(idat));
    const stride = w * bpp, px = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
            let v = raw[src + x];
            if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            px[dst + x] = v & 255;
        }
    }
    return { w, h, bpp, px };
}

function comparePng(fa, fb, tol) { return compareImages(decodePng(fa), decodePng(fb), tol); }
function compareImages(A, B, tol) {
    if (A.w !== B.w || A.h !== B.h) return { size: [A.w + "x" + A.h, B.w + "x" + B.h] };
    let changed = 0, maxDelta = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
        let d = 0;
        for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.px[(y * A.w + x) * A.bpp + k] - B.px[(y * B.w + x) * B.bpp + k]));
        if (d > maxDelta) maxDelta = d;
        if (d > tol) { changed++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
    return { changed, maxDelta, box: changed ? [x0, y0, x1, y1] : null };
}

function cmdCompare(args) {
    const [a, b] = args._.slice(1);
    if (!a || !b) die("usage: compare <shotsA> <shotsB> [--tolerance N] [--max-pixels N]");
    const tol = args.tolerance != null && args.tolerance !== true ? Number(args.tolerance) : COMPARE_TOLERANCE;
    const allow = args["max-pixels"] != null && args["max-pixels"] !== true ? Number(args["max-pixels"]) : COMPARE_MAX_PIXELS;
    const names = fs.readdirSync(a).filter(f => f.endsWith(".png")).sort();
    let diff = 0, missing = 0, noiseMax = 0;
    for (const f of names) {
        if (!fs.existsSync(path.join(b, f))) { console.log("MISSING " + f); missing++; continue; }
        const r = comparePng(path.join(a, f), path.join(b, f), tol);
        if (r.size) { console.log("SIZE    " + f + " " + r.size.join(" vs ")); diff++; continue; }
        if (r.changed > allow) { diff++; console.log("DIFF    " + f + " " + r.changed + " px > " + tol + ", box " + r.box.join(",") + ", max delta " + r.maxDelta); }
        else {
            noiseMax = Math.max(noiseMax, r.maxDelta);
            console.log("same    " + f + (r.maxDelta ? " (noise: max delta " + r.maxDelta + (r.changed ? ", " + r.changed + " px > " + tol : "") + ")" : ""));
        }
    }
    console.log(names.length - diff - missing + "/" + names.length + " same (delta <= " + tol + ", at most " + allow + " px over it; largest noise delta " + noiseMax + ")");
    if (diff || missing) process.exit(1);
}

// These run IN THE BROWSER (serialised with toString, so no closures): w / d
// = the view's window and document, hashes = the records of the view.
// Each record goes through the page's own hash handler (masteries, runes)
// or its same-dataset popstate path (Reforged). location.replace() of a
// fragment is asynchronous in Chrome, so each record waits for the page's
// rewrite to land before reading location.hash; `link` is the Link/Share
// href the page set synchronously.
const BROWSER_RUN = {
    masteries: function (w, d, hashes, codecs) {
        var res = [];
        function linkOf(a) { var h = a ? a.getAttribute("href") || "" : "", i = h.indexOf("#"); return i < 0 ? "" : h.slice(i + 1); }
        function one(hash) {
            w.history.replaceState(null, "", "#" + hash);
            w.updateMasteries();
            var ds = w.getDataSet(w.activeDataSetId), g = { id: w.activeDataSetId, total: 0 };
            if (ds.system === "keystone") {
                w.updateKeystoneLink();
                g.trees = {};
                ds.data.trees.forEach(function (t) {
                    var s = w.keystoneState[t.id], m = {};
                    t.tiers.forEach(function (td) {
                        if (td.isKeystone) { if (s.keystone) m[s.keystone] = 1; return; }
                        td.masteries.forEach(function (mm) { var r = s.tiers[td.tier][mm.id] || 0; if (r) m[mm.id] = r; });
                    });
                    g.trees[t.id] = m;
                    for (var k in m) g.total += m[k];
                });
                var a = w.keystoneState.__activeKeystone;
                g.keystone = a ? a.masteryId : null;
                g.dom = d.querySelectorAll("#keystone-calculator .ks-mastery.has-points").length;
            } else {
                w.updateLink();
                g.trees = codecs[g.id].trees.map(function (es, t) {
                    var m = {};
                    es.forEach(function (e, i) { var r = w.state[t][i] || 0; if (r) { m[e.key] = r; g.total += r; } });
                    return m;
                });
                g.notes = w.decodeNotes.slice();
                g.dom = 0;
                d.querySelectorAll("#calculator .button .counter").forEach(function (c) { g.dom += parseInt(c.textContent, 10) || 0; });
            }
            var nm = w.AirMasterySidebar.pageName();
            g.name = nm === w.AirMasterySidebar.DEFAULT_NAME ? null : nm;
            g.link = linkOf(d.getElementById("exportLink"));
            return new Promise(function (r) { setTimeout(r, 80); }).then(function () {
                g.rewrite = w.location.hash.replace(/^#/, "");
                res.push(g);
            });
        }
        var p = Promise.resolve();
        hashes.forEach(function (h) { p = p.then(function () { return one(h); }); });
        return p.then(function () { return res; });
    },
    runes: function (w, d, hashes) {
        var res = [];
        function linkOf(a) { var h = a ? a.getAttribute("href") || "" : "", i = h.indexOf("#"); return i < 0 ? "" : h.slice(i + 1); }
        function one(hash) {
            w.history.replaceState(null, "", "#" + hash);
            w.updateFromHash();
            w.updateLink();
            var g = { id: w.activeRuneDataSetId, slots: w.runeSlots.map(function (r) { return r ? r.id : null; }), level: w.championLevel,
                dom: d.querySelectorAll("#rune-slots .rune-slot.filled").length, link: linkOf(d.getElementById("exportLink")) };
            return new Promise(function (r) { setTimeout(r, 80); }).then(function () {
                g.rewrite = w.location.hash.replace(/^#/, "");
                res.push(g);
            });
        }
        var p = Promise.resolve();
        hashes.forEach(function (h) { p = p.then(function () { return one(h); }); });
        return p.then(function () { return res; });
    },
    reforged: function (w, d, hashes) {
        var res = [];
        function linkOf(a) { var h = a ? a.getAttribute("href") || "" : "", i = h.indexOf("#"); return i < 0 ? "" : h.slice(i + 1); }
        function one(hash) {
            w.history.replaceState(null, "", "#" + hash);
            var p = w.parseReforgedHash(w.location.hash.slice(1));
            if (!p || p.dsId !== w.reforgedState.dataSetId) { res.push({ error: "parse " + hash }); return Promise.resolve(); }
            w.resetReforgedSelections();
            w.reforgedState.pageName = null;
            w.applyReforgedHashAfterLoad(p, true);
            w.reforgedUi.savedHash = w.buildReforgedHash();
            w.renderReforgedStage();
            w.updateReforgedShareLink();
            var s = w.reforgedState;
            var g = { id: s.dataSetId,
                primary: s.primaryPath ? { path: s.primaryPath.id, picks: s.primaryPicks.slice() } : null,
                secondary: s.secondaryPath ? { path: s.secondaryPath.id, picks: s.secondaryPicks.slice(1) } : null,
                shards: s.shards.slice(), name: s.pageName || null,
                link: linkOf(d.getElementById("reforged-export-link")) };
            return new Promise(function (r) { setTimeout(r, 80); }).then(function () {
                g.rewrite = w.location.hash.replace(/^#/, "");
                res.push(g);
            });
        }
        var p = Promise.resolve();
        hashes.forEach(function (h) { p = p.then(function () { return one(h); }); });
        return p.then(function () { return res; });
    }
};

// In the real page: every record of the view's id (see BROWSER_RUN).
async function cmdVerifyBrowser(args) {
    if (!args.out || args.out === true) die("--out <dir> is required");
    const out = path.resolve(String(args.out));
    fs.mkdirSync(out, { recursive: true });
    const exe = findBrowser(args);
    const root = siteRoot(args, out);
    const links = JSON.parse(fs.readFileSync(path.join(FIX_DIR, "legacy-links.json"), "utf8"));
    const codecDoc = JSON.parse(fs.readFileSync(path.join(FIX_DIR, "legacy-codecs.json"), "utf8"));
    const jobs = links.views.map(function (v) {
        const recs = links[v.page][v.id];
        const js = "return (" + BROWSER_RUN[v.page].toString() + ")(w, d, " + JSON.stringify(recs.map(r => r.hash)) + ", " +
            (v.page === "masteries" ? JSON.stringify({ [v.id]: codecDoc.datasets[v.id] }) : "{}") + ");";
        const url = writeDriven(root, "verify--" + v.page + "--" + v.id, PAGES[v.page].html, READY[v.page], js);
        return { v, recs, url: url + v.empty.slice(v.empty.indexOf("#")) };
    });
    let n = 0;
    const fails = [];
    await pool(jobs, Number(args.par || 3), async function (j) {
        const r = await runBrowser(exe, ["--window-size=1440,900", "--enable-logging=stderr", "--v=0",
            "--virtual-time-budget=60000", "--dump-dom", j.url], 120000);
        const txt = readOut(r.out);
        const errs = r.err.split(/\r?\n/).filter(l => /Uncaught|ERR_FILE_NOT_FOUND/.test(l));
        if (!txt.startsWith("OK ")) { fails.push(j.v.page + " " + j.v.id + ": " + txt.slice(0, 400)); console.log("FAIL " + j.v.id); return; }
        const got = JSON.parse(txt.slice(3));
        let bad = 0;
        j.recs.forEach(function (rec, i) {
            n++;
            const g = got[i];
            let e;
            if (j.v.page === "masteries") e = normalizeMasteryGot(g, rec);
            else if (j.v.page === "runes") e = { slots: g.slots, level: g.level };
            else e = { primary: g.primary, secondary: g.secondary, shards: g.shards, name: g.name };
            const want = "rewrite" in rec ? rec.rewrite : rec.hash;
            // the rendered page agrees: classic counters sum to the total,
            // keystone cells with points, filled rune sockets
            let domOk = true;
            if (j.v.page === "masteries") {
                const cells = rec.expected.keystone !== undefined
                    ? Object.keys(rec.expected.trees).reduce((a, t) => a + Object.keys(rec.expected.trees[t]).length, 0)
                    : rec.expected.total;
                domOk = g.dom === cells;
            } else if (j.v.page === "runes") domOk = g.dom === rec.expected.slots.filter(Boolean).length;
            if (g.error || g.id !== j.v.id || !deepEqual(e, rec.expected) || g.rewrite !== want || g.link !== want || !domOk) {
                bad++;
                fails.push(j.v.page + " " + j.v.id + " [" + rec.form + "] " + rec.hash + ": got " + JSON.stringify(g));
            }
        });
        if (errs.length) fails.push(j.v.page + " " + j.v.id + ": console " + errs.slice(0, 3).join(" | "));
        console.log((bad || errs.length ? "FAIL " : "ok   ") + j.v.page + " " + j.v.id + " (" + j.recs.length + " records)");
    });
    if (fails.length) {
        fails.slice(0, 40).forEach(f => console.error("FAIL " + f));
        die(fails.length + " browser mismatches");
    }
    console.log("browser: " + n + " records decode to `expected` and re-export identically in the real pages (" + root + ")");
}

// ------------------------------------------------------------------ main

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (cmd === "fixtures") cmdFixtures(args);
else if (cmd === "check") cmdCheck(args);
else if (cmd === "shots") cmdShots(args).catch(e => die(e.stack || String(e)));
else if (cmd === "verify-browser") cmdVerifyBrowser(args).catch(e => die(e.stack || String(e)));
else if (cmd === "compare") cmdCompare(args);
else {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 40).filter(l => l.startsWith("//")).map(l => l.slice(3)).join("\n"));
    process.exit(cmd ? 1 : 0);
}
