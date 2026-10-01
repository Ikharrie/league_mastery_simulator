#!/usr/bin/env node
// tools/fixtures/stub-shell-test.js — task T1 acceptance for the shell
// (patch-registry.js, lol-data.js, nav.js, air-sheet.js, the three pages),
// run against STUB data so it works before the data tasks have delivered.
//
//   node tools/fixtures/stub-shell-test.js unit
//       Node VM, no browser: lol-data.js patch order against
//       tools/lib/patches.js, LolPatches.resolve / fromHash on the legacy ids,
//       unlisted ids and odd hashes, nav.js clientEraFor / seasonKeyForDataset
//       in both shell modes, LolData register / get / load / loadCodec /
//       prefetch with a fake <script> loader, fillPatchSelect.
//   node tools/fixtures/stub-shell-test.js browser --out <dir> [--browser <exe>] [--keep]
//       Copies the working tree to <dir>/site, replaces its data with stub
//       data files (data/<page>/manifest.json + one tiny LolData.register
//       file per data key, shared keys and data: null included, and a stub
//       data/masteries/legacy-codecs.js), builds <dir>/site/patch-registry.js
//       with tools/build-registry.js --stub, and opens the pages over file://
//       in headless Edge / Chrome (DevTools protocol, Node 22+):
//         registry mode: the HTML without data-lol-shell and without the
//           calculator / old data scripts, a probe where the calculators
//           would start. Checks that the hash's dataset was preloaded
//           synchronously (document.write), that the header (season, patch
//           list, tabs, title), body[data-client] and the AIR sheet (season,
//           period, chips, links) are right before any calculator runs, then
//           LolData.load / dynamic injection (one <script> per file) / data:
//           null / missing-file rejection / loadCodec / prefetch,
//           fillPatchSelect and an in-page buildSeasonNav({entry}) +
//           AirSheet.sync(entry) switch.
//         legacy mode: the pages as committed (legacy calculators and old data
//           files) with the stub registry: they boot and the preload loads
//           nothing (TRANSITION: data-lol-shell="legacy").
//       No console error, exception or failed file:// request is allowed
//       (except the one deliberately missing file).
//       --real: the same cases on the data tasks' real listings, manifests and
//       generated files (registry built with --strict) instead of stub data.
//   node tools/fixtures/stub-shell-test.js all --out <dir>
//
// The repo is never written to; everything lands in <dir>.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const vm = require("vm");
const assert = require("assert");

const REPO = path.resolve(__dirname, "..", "..");
const P = require(path.join(REPO, "tools", "lib", "patches.js"));

// values from a VM realm compare by JSON (deepStrictEqual checks prototypes)
const plain = x => x === undefined ? x : JSON.parse(JSON.stringify(x));

function die(m) { console.error("stub-shell-test: " + m); process.exit(1); }

function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (/^--/.test(a)) {
            const k = a.slice(2);
            if (i + 1 < argv.length && !/^--/.test(argv[i + 1])) out[k] = argv[++i]; else out[k] = true;
        } else out._.push(a);
    }
    return out;
}

let failures = 0, passes = 0;
function check(name, fn) {
    try { fn(); passes++; }
    catch (e) { failures++; console.error("FAIL " + name + ": " + (e && e.message || e)); }
}

// ---------------------------------------------------------------- registry

function buildStubRegistry(root, extraArgs) {
    const r = cp.spawnSync(process.execPath, [path.join(REPO, "tools", "build-registry.js"), "--root", root, "--stub", "--quiet"].concat(extraArgs || []),
        { encoding: "utf8" });
    if (r.status !== 0) die("build-registry failed:\n" + r.stdout + r.stderr);
}

// Expected values, from tools/lib/patches.js (independent of lol-data.js).
function stubListing(page) {
    const j = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "fixtures", "stub-" + page + ".json"), "utf8"));
    return j.patches;
}

// ---------------------------------------------------------------- unit

function fakeDom(opts) {
    opts = opts || {};
    const listeners = {};
    const elements = [];
    function makeEl(tag) {
        const el = {
            tagName: String(tag).toUpperCase(), nodeType: 1, children: [], attributes: {}, style: {},
            parentNode: null, textContent: "", value: "", selected: false,
            get firstChild() { return this.children[0] || null; },
            get options() { return this.children; },
            appendChild(c) { c.parentNode = this; this.children.push(c); if (c.tagName === "OPTION" && c.selected) this.value = c.value; if (opts.onAppend) opts.onAppend(c, this); return c; },
            removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
            setAttribute(k, v) { this.attributes[k] = String(v); },
            getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
            removeAttribute(k) { delete this.attributes[k]; },
            addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
            classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }
        };
        elements.push(el);
        return el;
    }
    const documentElement = makeEl("html");
    const head = makeEl("head");
    const body = makeEl("body");
    documentElement.appendChild(head);
    const document = {
        readyState: opts.readyState || "complete",
        documentElement, head, body,
        written: [],
        createElement: makeEl,
        getElementsByTagName(t) { return t === "head" ? [head] : []; },
        getElementById() { return null; },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
        dispatchEvent() {},
        write(s) { this.written.push(s); }
    };
    return { document, elements };
}

function vmPage(opts) {
    opts = opts || {};
    const registryText = opts.registryText;
    const ctx = {
        console, setTimeout, clearTimeout, Promise, JSON, Math, Object, Array, String, Number, RegExp, Error,
        location: { hash: opts.hash || "", pathname: opts.pathname || "/index.html" }
    };
    const injected = [];
    const dom = fakeDom({
        readyState: opts.readyState,
        onAppend(c) {
            if (c.tagName !== "SCRIPT") return;
            injected.push(c.src);
            setTimeout(function(){
                const f = opts.files && opts.files[c.src];
                if (f == null) { if (c.onerror) c.onerror(new Error("404")); return; }
                vm.runInContext(f, ctx, { filename: c.src });
                if (c.onload) c.onload();
            }, 1);
        }
    });
    ctx.document = dom.document;
    ctx.window = ctx;
    ctx.CustomEvent = function(){};
    ctx.matchMedia = function(){ return { matches: false }; };
    ctx.addEventListener = function(){};
    if (opts.page) dom.document.documentElement.setAttribute("data-lol-page", opts.page);
    if (opts.legacy) dom.document.documentElement.setAttribute("data-lol-shell", "legacy");
    vm.createContext(ctx);
    vm.runInContext(registryText, ctx, { filename: "patch-registry.js" });
    vm.runInContext(fs.readFileSync(path.join(REPO, "lol-data.js"), "utf8"), ctx, { filename: "lol-data.js" });
    if (opts.nav) vm.runInContext(fs.readFileSync(path.join(REPO, "nav.js"), "utf8"), ctx, { filename: "nav.js" });
    return { ctx, dom, injected };
}

async function cmdUnit() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t1unit-"));
    // a minimal root: the real seasons/aliases + stub listings, no manifests
    fs.mkdirSync(path.join(tmp, "data", "patches"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "tools", "fixtures"), { recursive: true });
    ["seasons.json", "aliases.json"].forEach(f => fs.copyFileSync(path.join(REPO, "data", "patches", f), path.join(tmp, "data", "patches", f)));
    P.PAGES.forEach(p => fs.copyFileSync(path.join(REPO, "tools", "fixtures", "stub-" + p + ".json"), path.join(tmp, "tools", "fixtures", "stub-" + p + ".json")));
    writeStubData(tmp);
    buildStubRegistry(tmp);
    const registryText = fs.readFileSync(path.join(tmp, "patch-registry.js"), "utf8");
    const files = {};
    const walk = d => fs.readdirSync(path.join(tmp, d)).forEach(n => {
        const r = d + "/" + n;
        if (fs.statSync(path.join(tmp, r)).isDirectory()) walk(r);
        else if (/\.js$/.test(n)) files[r] = fs.readFileSync(path.join(tmp, r), "utf8");
    });
    walk("data");
    P.useSeasons(null); P.useAliases(null);

    const page1 = vmPage({ registryText, nav: true, files });
    const ctx = page1.ctx;
    const LP = ctx.LolPatches, LD = ctx.LolData;

    // 1. patch order = tools/lib/patches.js
    check("compare parity", function(){
        const list = [];
        P.PAGES.forEach(pg => stubListing(pg).forEach(r => list.push(r.patch)));
        ["V1.0.0.31", "V1.0.0.94", "V1.0.0.94b", "V1.0.0.118", "V1.0.0.118b", "V3.4", "V3.04", "V3.5", "V3.05", "V3.10",
         "V4.10", "V4.9", "V25.1", "V25.S1.1", "V25.S1.3", "V25.04", "V25.4", "V26.1", "V26.01", "V26.20", "V0.9.22.15"]
            .forEach(p => list.push(p));
        let n = 0;
        list.forEach(a => list.forEach(b => {
            const want = P.compare(a, b), got = LP.compare(a, b);
            if (want !== got) throw new Error(a + " vs " + b + ": patches.js " + want + ", lol-data.js " + got);
            n++;
        }));
        ["V2.1", "V15.1", "V20.3", "V4.0", "V25.S1.4", "V25.S2.1", "x", "", "V1.0.0", "V4"].forEach(function(bad){
            assert.strictEqual(LP.parse(bad), null, "parse(" + JSON.stringify(bad) + ") should fail");
        });
    });

    // 2. resolve: listed ids, the 24 legacy ids, unlisted ids
    const aliases = P.aliases();
    check("resolve listed", function(){
        P.PAGES.forEach(pg => stubListing(pg).forEach(function(r){
            const id = P.idFor(pg, r.patch), got = LP.resolve(pg, id);
            assert.ok(got && got.entry.id === id && got.alias === null, id);
            assert.strictEqual(got.entry.season, P.seasonOf(r.patch), id + " season");
            assert.strictEqual(got.entry.label, P.labelFor(pg, r), id + " label");
            const chrome = P.chromeOf(pg, r.patch);
            Object.keys(chrome).forEach(k => assert.deepStrictEqual(plain(got.entry[k]), chrome[k], id + " " + k));
        }));
    });
    check("resolve legacy ids (24)", function(){
        let n = 0;
        P.PAGES.forEach(function(pg){
            Object.keys(aliases[pg]).forEach(function(id){
                const r = LP.resolve(pg, id);
                assert.ok(r, id);
                assert.strictEqual(r.entry.id, aliases[pg][id].to, id);
                assert.strictEqual(r.alias.id, id);
                assert.strictEqual(r.alias.codec || null, aliases[pg][id].codec || null, id + " codec");
                n++;
            });
            (aliases.keep[pg] || []).forEach(function(id){
                const r = LP.resolve(pg, id);
                assert.ok(r && r.entry.id === id && !r.alias, id);
                n++;
            });
        });
        const plain = LP.fromHash("masteries", "#q75M75JPH1xK");
        assert.ok(plain.plain && plain.entry.id === "m-V1.0.0.152" && plain.alias.codec === "s3-pbe", "plain mastery code");
        n++;
        assert.strictEqual(n, 24, "legacy id count");
        // seasons now (DESIGN §4.2)
        const seasonNow = { "s4-final": "s5", "preReforged-V3.14": "s4", "preReforged-V4.20": "s5", "preReforged-V6.24": "s7",
            "rr-v8-23": "s9", "rr-v9-23": "s10", "rr-v10-23": "s11", "rr-v11-23": "s12", "rr-v12-23": "s13", "rr-v26-13": "s2026" };
        Object.keys(seasonNow).forEach(id => assert.strictEqual(LP.resolve(LP.pageOfId(id), id).entry.season, seasonNow[id], id));
    });
    check("resolve unlisted / unknown", function(){
        const cases = [
            ["masteries", "m-V4.3", "m-V4.2"], ["masteries", "m-V6.23", "m-V6.22"], ["masteries", "m-V1.0.0.40", "m-V1.0.0.32"],
            ["masteries", "m-V5.11", "m-V5.10"], ["masteries", "m-V7.20", "m-V7.6"], ["masteries", "m-V3.04", "m-V1.0.0.152"],
            ["masteries", "m-V1.0.0.118", "m-V1.0.0.110"], ["masteries", "m-V1.0.0.118b", "m-V1.0.0.118b"],
            ["runes", "preReforged-V3.4", "preReforged-V3.04"], ["runes", "preReforged-V3.5", "preReforged-V3.04"],
            ["runes", "preReforged-V1.0.0.94(b)", "preReforged-V1.0.0.94b"], ["runes", "preReforged-V1.0.0.96", "preReforged-V1.0.0.94b"],
            ["runes", "preReforged-V7.2", "preReforged-V6.22"],
            ["reforged", "rr-v8-17", "rr-v8-16"], ["reforged", "rr-v25-1", "rr-v25-1"], ["reforged", "rr-v25-4", "rr-v25-3"],
            ["reforged", "rr-v12-23", "rr-v12-22"], ["reforged", "rr-v26-18", "rr-v26-17"],
            ["masteries", "m-V7.22", null], ["masteries", "m-V1.0.0.31", null], ["runes", "preReforged-V1.0.0.62", null],
            ["runes", "preReforged-V7.22", null], ["reforged", "rr-v7-21", null], ["reforged", "rr-v26-20", null],
            ["reforged", "rr-v15-1", null], ["masteries", "s9-final", null], ["masteries", "constructor", null],
            ["runes", "__proto__", null], ["reforged", "", null], ["masteries", "m-V4.5x", "m-V4.5"]
        ];
        cases.forEach(function(c){
            const r = LP.resolve(c[0], c[1]);
            assert.strictEqual(r ? r.entry.id : null, c[2], c[0] + " " + c[1]);
            if (r && c[1] !== c[2] && !aliases[c[0]][c[1]]) assert.ok(r.alias && r.alias.unlisted, c[1] + " alias.unlisted");
        });
    });
    check("fromHash", function(){
        const cases = [
            ["masteries", "", "m-V1.0.0.152", { empty: true }], ["masteries", "#", "m-V1.0.0.152", { empty: true }],
            ["masteries", "#s4-final|~q75M|Name", "m-V4.20", { codec: "s4-final" }],
            ["masteries", "#nope|abc", "m-V1.0.0.152", { unknown: true }],
            ["masteries", "#abc", "m-V1.0.0.152", { plain: true, codec: "s3-pbe" }],
            ["runes", "", "preReforged-V7.21", { empty: true }], ["runes", "#5245,5245", "preReforged-V7.21", { plain: true }],
            ["runes", "#preReforged-V6.24|5245|12", "preReforged-V6.22", {}],
            ["reforged", "#rr-v8-23", "rr-v8-23", {}], ["reforged", "#rr-v8-4%7C8000%7C8100", "rr-v8-4", {}],
            ["reforged", "#rr-v12-23|8000|8100|5008", "rr-v12-22", {}], ["reforged", "#zzz", "rr-v26-19", { unknown: true }]
        ];
        cases.forEach(function(c){
            const r = LP.fromHash(c[0], c[1]);
            assert.strictEqual(r.entry.id, c[2], c[0] + " " + c[1]);
            ["empty", "unknown", "plain"].forEach(k => assert.strictEqual(r[k], !!c[3][k], c[1] + " " + k));
            if (c[3].codec) assert.strictEqual(r.alias.codec, c[3].codec, c[1] + " codec");
        });
    });
    check("seasons / defaults / list", function(){
        const seasons = P.seasons();
        assert.strictEqual(LP.seasons().length, seasons.length);
        seasons.forEach(function(s){
            P.PAGES.forEach(function(pg){
                const want = P.seasonDefault(s.key, pg), got = LP.seasonDefault(pg, s.key);
                assert.strictEqual(got ? got.id : null, want, s.key + " " + pg);
                const listed = LP.list(pg, s.key).map(e => e.id);
                const exp = stubListing(pg).filter(r => P.seasonOf(r.patch) === s.key).map(r => P.idFor(pg, r.patch));
                assert.deepStrictEqual(plain(listed), exp, s.key + " " + pg + " list");
            });
        });
        P.PAGES.forEach(pg => assert.strictEqual(LP.pageDefault(pg).id, P.pageDefault(pg)));
    });
    check("fillPatchSelect", function(){
        const sel = ctx.document.createElement("select");
        const n = LP.fillPatchSelect(sel, "runes", "s1", "preReforged-V1.0.0.94(b)");
        assert.strictEqual(n, 8);
        assert.strictEqual(sel.value, "preReforged-V1.0.0.94b");
        assert.deepStrictEqual(plain(sel.children.map(o => o.textContent).slice(0, 3)), ["V1.0.0.63 (approx.)", "V1.0.0.72", "V1.0.0.94(b)"]);
        const n2 = LP.fillPatchSelect(sel, "reforged", "s2026", "rr-v26-19");
        assert.strictEqual(n2, 10);
        assert.strictEqual(sel.children[0].textContent, "V26.01 (Season start)");
        assert.strictEqual(sel.children[9].textContent, "V26.19 (Current)");
    });

    // 3. nav.js on the registry: clientEraFor = the legacy rule on legacy ids
    check("clientEraFor / seasonKeyForDataset", function(){
        const LCU = { "s7-final": true, "preReforged-V7.21": true };
        const legacyEra = id => /^rr-/.test(id) ? "lcu" : (LCU[id] ? "lcu" : "air");
        const legacyIds = [].concat(Object.keys(aliases.masteries), Object.keys(aliases.runes), aliases.keep.runes,
            Object.keys(aliases.reforged), aliases.keep.reforged, ["s9-foo", "rr-v99-1", "preReforged-V9.9", "air", "lcu", ""]);
        legacyIds.forEach(id => assert.strictEqual(ctx.clientEraFor(id), id === "lcu" || id === "air" ? id : legacyEra(id), id));
        assert.strictEqual(ctx.clientEraFor("m-V7.2"), "lcu");
        assert.strictEqual(ctx.clientEraFor("m-V6.24"), "air");
        assert.strictEqual(ctx.clientEraFor({ era: "lcu" }), "lcu");
        // registry mode: legacy ids land in their season NOW
        assert.strictEqual(ctx.seasonKeyForDataset("s4-final"), "s5");
        assert.strictEqual(ctx.seasonKeyForDataset("rr-v8-23"), "s9");
        assert.strictEqual(ctx.seasonNavTable(), ctx.SEASON_NAV);
    });
    check("legacy shell mode", function(){
        const { ctx: c2 } = vmPage({ registryText, nav: true, files, legacy: true, page: "masteries" });
        assert.strictEqual(c2.LolPatches.shellMode(), "legacy");
        assert.strictEqual(c2.seasonNavTable(), c2.LOL_LEGACY_SEASON_NAV);
        assert.strictEqual(c2.seasonKeyForDataset("s4-final"), "s4");
        assert.strictEqual(c2.seasonKeyForDataset("rr-v26-13"), "s2026");
        assert.strictEqual(c2.seasonNavFind("s1").runes, null);
        c2.LolPatches.useRegistry();
        assert.strictEqual(c2.LolPatches.shellMode(), "registry");
        assert.strictEqual(c2.seasonNavFind("s1").runes, "preReforged-V1.0.0.128");
    });

    // 4. LolData
    const loaders = [];
    check("LolData sync", function(){
        const e = LP.entry("masteries", "m-V4.5");
        assert.strictEqual(LD.get(e), null);
        const nul = LP.entry("reforged", "rr-v26-19");
        assert.strictEqual(nul.data, null);
        const d = LD.get(nul);
        assert.ok(d && d.id === "rr-v26-19" && d !== nul && LD.get(nul) === d, "data: null -> a stable copy");
    });
    loaders.push(async function(){
        const e = LP.entry("masteries", "m-V4.5");
        const a = await Promise.all([LD.load(e), LD.load(e)]);
        assert.strictEqual(a[0], a[1], "one dataset object");
        assert.strictEqual(a[0].stubKey, "m-V4.5");
        assert.strictEqual(a[0].season, "s4", "entry fields kept");
        assert.strictEqual(LD.get(e), a[0]);
        const shared = LP.entry("masteries", "m-V3.13");
        assert.strictEqual(shared.data, "m-V1.0.0.152");
        const s = await LD.load(shared);
        assert.strictEqual(s.stubKey, "m-V1.0.0.152");
        assert.strictEqual(s.id, "m-V3.13");
        let msg = null;
        try { await LD.load({ id: "m-V9.9", data: "x", file: null }); } catch (err) { msg = err.message; }
        assert.ok(msg && /not built/.test(msg), "file: null rejects");
        msg = null;
        try { await LD.load({ id: "m-V9.9", data: "x", file: "data/none.js" }); } catch (err) { msg = err.message; }
        assert.ok(msg && /Could not load/.test(msg), "missing file rejects: " + msg);
        msg = null;
        try { await LD.load({ id: "m-V9.9", data: "not-in-file", file: e.file }); } catch (err) { msg = err.message; }
        assert.ok(msg && /did not register/.test(msg), "wrong key rejects: " + msg);
        const c = await LD.loadCodec({ codec: "s6-launch" });
        assert.strictEqual(c.stubKey, "s6-launch");
        msg = null;
        try { await LD.loadCodec({ codec: "nope" }); } catch (err) { msg = err.message; }
        assert.ok(msg && /no codec/.test(msg));
        await LD.prefetch(LP.entries("runes"));
        assert.deepStrictEqual(plain(LP.entries("runes").filter(x => !LD.get(x)).map(x => x.id)), [], "prefetch loads every rune file");
    });
    for (const fn of loaders) {
        try { await fn(); passes++; } catch (e) { failures++; console.error("FAIL LolData async: " + (e && e.stack || e)); }
    }
    check("one injection per file", function(){
        const seen = {};
        page1.injected.forEach(function(f){
            if (f === "data/none.js") return;
            assert.ok(!seen[f], f + " injected twice");
            seen[f] = true;
        });
        assert.ok(page1.injected.length >= 10, "injections: " + page1.injected.length);
    });

    // 5. preload: document.write while parsing, injection afterwards
    check("lolPreloadDataset", function(){
        const a = vmPage({ registryText, files, hash: "#s4-final|abc", readyState: "loading", page: "masteries" });
        const r = a.ctx.lolPreloadDataset("masteries");
        assert.strictEqual(r.entry.id, "m-V4.20");
        assert.deepStrictEqual(a.dom.document.written, [
            '<script type="text/javascript" src="data/masteries/m-V4.20.js"></script>',
            '<script type="text/javascript" src="data/masteries/legacy-codecs.js"></script>']);
        const b = vmPage({ registryText, files, hash: "#rr-v26-19", readyState: "loading", page: "reforged" });
        b.ctx.lolPreloadDataset("reforged");
        assert.deepStrictEqual(b.dom.document.written, [], "data: null loads nothing");
        const l = vmPage({ registryText, files, hash: "#s4-final|abc", readyState: "loading", page: "masteries", legacy: true });
        assert.strictEqual(l.ctx.lolPreloadDataset("masteries").entry.id, "m-V4.20");
        assert.deepStrictEqual(l.dom.document.written, [], "legacy shell: nothing written");
        assert.deepStrictEqual(l.injected, [], "legacy shell: nothing injected");
        const c = vmPage({ registryText, files, hash: "#preReforged-V5.22|", readyState: "complete", page: "runes" });
        c.ctx.lolPreloadDataset("runes");
        assert.deepStrictEqual(c.dom.document.written, []);
        assert.deepStrictEqual(c.injected, ["data/runes/catalog-V4.5.js"], "after parsing: injected");
    });

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log((failures ? "FAILED" : "ok") + " unit: " + passes + " passed, " + failures + " failed");
    return failures === 0;
}

// ---------------------------------------------------------------- stub data

// The stub data set: one tiny file per data key. Shared keys as the design
// expects them (masteries V3.13 = V1.0.0.152; runes V4.5-V5.22 one catalog,
// V7.21 = V6.22); Reforged extras only for V7.22-V8.22 (own files) and
// V10.23-V14.18 (one shared file), the rest data: null.
function stubDataPlan() {
    const plan = { masteries: {}, runes: {}, reforged: {} };
    stubListing("masteries").forEach(function(r){
        const id = P.idFor("masteries", r.patch);
        plan.masteries[id] = P.equal(r.patch, "V3.13") ? "m-V1.0.0.152" : id;
    });
    stubListing("runes").forEach(function(r){
        const p = P.parse(r.patch);
        let key = "catalog-" + p.name;
        if (P.compare(p, "V4.5") >= 0 && P.compare(p, "V5.22") <= 0) key = "catalog-V4.5";
        if (P.equal(p, "V7.21")) key = "catalog-V6.22";
        plan.runes[P.idFor("runes", p)] = key;
    });
    stubListing("reforged").forEach(function(r){
        const id = P.idFor("reforged", r.patch);
        if (P.compare(r.patch, "V8.22") <= 0) plan.reforged[id] = id;
        else if (P.compare(r.patch, "V10.23") >= 0 && P.compare(r.patch, "V14.18") <= 0) plan.reforged[id] = "rr-v10-23";
    });
    return plan;
}

function writeStubData(root) {
    const plan = stubDataPlan();
    P.PAGES.forEach(function(page){
        const dir = path.join(root, "data", page);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const manifest = { _comment: "STUB manifest (tools/fixtures/stub-shell-test.js)" };
        const users = {};
        Object.keys(plan[page]).forEach(id => { (users[plan[page][id]] = users[plan[page][id]] || []).push(id); });
        Object.keys(users).forEach(function(key){
            const rel = "data/" + page + "/" + key + ".js";
            fs.writeFileSync(path.join(root, rel), "// STUB data file (tools/fixtures/stub-shell-test.js). Patches using this file: " + users[key].join(", ") + ".\n" +
                "LolData.register(" + JSON.stringify(page) + ", " + JSON.stringify(key) + ", " + JSON.stringify({ stubKey: key, kind: page }) + ");\n");
            users[key].forEach(id => { manifest[id] = { data: key, file: rel, hash: "stub" }; });
        });
        fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
    });
    const codecs = Object.keys(P.aliases().masteries).map(id => P.aliases().masteries[id].codec);
    fs.writeFileSync(path.join(root, "data", "masteries", "legacy-codecs.js"), "// STUB legacy codecs (tools/fixtures/stub-shell-test.js).\n" +
        codecs.map(k => "LolData.register(\"masteries-legacy\", " + JSON.stringify(k) + ", " + JSON.stringify({ stubKey: k }) + ");").join("\n") + "\n");
    return plan;
}

// ---------------------------------------------------------------- browser

function findBrowser(args) {
    const c = [args.browser, process.env.LOL_BROWSER,
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/google-chrome", "/usr/bin/chromium"];
    for (const p of c) if (p && p !== true && fs.existsSync(p)) return p;
    die("no Edge / Chrome found; pass --browser <exe>");
}

function fileUrl(file) {
    let p = fs.realpathSync.native(file).replace(/\\/g, "/");
    if (!p.startsWith("/")) p = "/" + p;
    return "file://" + p.split("/").map(encodeURIComponent).join("/").replace(/%3A/g, ":");
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(exe) {
    if (typeof WebSocket !== "function") die("Node 22+ needed (global WebSocket)");
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), "t1cdp-"));
    const child = cp.spawn(exe, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
        "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + prof,
        "--window-size=1280,900", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const wsUrl = await new Promise(function(resolve, reject){
        let buf = "";
        const t = setTimeout(() => reject(new Error("no DevTools endpoint")), 30000);
        child.stderr.on("data", function(d){
            buf += d;
            const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
            if (m) { clearTimeout(t); resolve(m[1]); }
        });
        child.on("exit", () => reject(new Error("browser exited")));
    });
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP connect failed")); });
    let seq = 0;
    const pending = new Map(), listeners = new Set();
    ws.onmessage = function(ev){
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id); pending.delete(msg.id);
            if (msg.error) p.reject(new Error(p.method + ": " + msg.error.message)); else p.resolve(msg.result);
        } else for (const l of listeners) l(msg);
    };
    const send = (method, params, sessionId) => new Promise(function(resolve, reject){
        const id = ++seq;
        pending.set(id, { resolve, reject, method });
        ws.send(JSON.stringify(Object.assign({ id, method, params: params || {} }, sessionId ? { sessionId } : {})));
    });
    return {
        send, on: f => listeners.add(f), off: f => listeners.delete(f),
        async close() {
            try { await Promise.race([send("Browser.close"), sleep(3000)]); } catch (e) {}
            try { ws.close(); } catch (e) {}
            try { child.kill(); } catch (e) {}
            await sleep(300);
            try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
        }
    };
}

// Opens url in a fresh context, waits for window.__t1Done (or `ready`), returns
// {result, errors, failedRequests}.
async function openCase(b, url, timeoutMs) {
    const { browserContextId } = await b.send("Target.createBrowserContext", {});
    const { targetId } = await b.send("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => b.send(m, p, sessionId);
    const errors = [], failed = [], requests = {};
    const onMsg = function(msg){
        if (msg.sessionId !== sessionId) return;
        const p = msg.params || {};
        if (msg.method === "Network.requestWillBeSent") requests[p.requestId] = p.request.url;
        else if (msg.method === "Network.loadingFailed" && !p.canceled) failed.push((requests[p.requestId] || "?") + " " + p.errorText);
        else if (msg.method === "Runtime.exceptionThrown") {
            const x = p.exceptionDetails || {};
            errors.push("exception: " + ((x.exception && x.exception.description) || x.text));
        } else if (msg.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert"))
            errors.push("console." + p.type + ": " + (p.args || []).map(a => a.value !== undefined ? a.value : a.description).join(" "));
        else if (msg.method === "Log.entryAdded" && p.entry && p.entry.level === "error")
            errors.push("log: " + p.entry.text + (p.entry.url ? " (" + p.entry.url + ")" : ""));
    };
    b.on(onMsg);
    let result = null;
    try {
        await s("Page.enable"); await s("Runtime.enable"); await s("Network.enable"); await s("Log.enable");
        await s("Page.navigate", { url });
        const deadline = Date.now() + (timeoutMs || 30000);
        for (;;) {
            const r = await s("Runtime.evaluate", { expression: "window.__t1Done ? JSON.stringify(window.__t1Result) : null", returnByValue: true });
            if (r.result && r.result.value) { result = JSON.parse(r.result.value); break; }
            if (Date.now() > deadline) { errors.push("timeout: no result"); break; }
            await sleep(100);
        }
        await sleep(300);
    } finally {
        b.off(onMsg);
        try { await b.send("Target.closeTarget", { targetId }); } catch (e) {}
        try { await b.send("Target.disposeBrowserContext", { browserContextId }); } catch (e) {}
    }
    return { result, errors, failed };
}

// The probe: runs where the calculators would start (end of <body>).
const PROBE = String(function(){
    var w = window, d = document, R = { stage: "probe" };
    function txt(sel) { return sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : null; }
    try {
        var page = LolPatches.page(), r = LolPatches.fromHash(page), e = r.entry;
        R.page = page; R.entry = e && e.id; R.alias = r.alias;
        R.flags = { plain: r.plain, empty: r.empty, unknown: r.unknown };
        R.preloaded = !!LolData.get(e);
        R.written = e.file ? LolData._wasWritten(e.file) : null;
        R.codecPreloaded = r.alias && r.alias.codec ? !!LolData.getCodec(r.alias.codec) : null;
        var ss = d.querySelector(".legacy-header select.header-season"), ps = d.querySelector(".legacy-header select.header-patch");
        R.header = {
            season: ss && ss.value, seasonText: txt(ss), seasonCount: ss && ss.options.length,
            patch: ps && ps.value,
            patchOptions: ps ? [].map.call(ps.options, function(o){ return [o.value, o.text]; }) : null,
            tabs: [].map.call(d.querySelectorAll(".header-tabs .header-tab"), function(a){ return [a.textContent, a.getAttribute("href"), /active/.test(a.className)]; }),
            title: d.title
        };
        R.client = { html: d.documentElement.getAttribute("data-client"), body: d.body.getAttribute("data-client") };
        var sh = d.querySelector(".air-sheet[data-air-page]");
        R.sheet = sh ? { season: sh.getAttribute("data-air-season"), period: sh.getAttribute("data-air-period"),
            chips: sh.getAttribute("data-air-chips"),
            links: [].map.call(sh.querySelectorAll(".air-subtab[data-air-link]"), function(a){ return [a.getAttribute("data-air-link"), a.getAttribute("href")]; }) } : null;
    } catch (err) { R.syncError = String(err && err.stack || err); }
    (async function(){
        try {
            var page = R.page, e = LolPatches.entry(page, R.entry);
            var ds = await LolData.load(e);
            R.load = { id: ds.id, key: ds.stubKey || null, same: ds === LolData.get(e) };
            var other = LolPatches.entries(page).filter(function(x){ return x.file && !LolData.get(x); })[0];
            var n0 = d.querySelectorAll('script[src="' + other.file + '"]').length;
            var two = await Promise.all([LolData.load(other), LolData.load(other)]);
            R.dynamic = { id: other.id, key: two[0].stubKey, both: two[0] === two[1],
                injected: d.querySelectorAll('script[src="' + other.file + '"]').length - n0 };
            var nul = LolPatches.entries(page).filter(function(x){ return x.data === null; })[0];
            if (nul) { var dn = await LolData.load(nul); R.nullEntry = dn.id === nul.id && !dn.stubKey; }
            try { await LolData.load({ id: e.id, data: "nope", file: null }); R.noFile = "resolved"; } catch (x) { R.noFile = x.message; }
            try { await LolData.load({ id: e.id, data: "__missing__", file: "data/__missing__.js" }); R.missing = "resolved"; } catch (x) { R.missing = x.message; }
            if (page === "masteries") { var cdc = await LolData.loadCodec({ codec: "s6-launch" }); R.codec = !!cdc && (cdc.stubKey || cdc.system || null); }
            await LolData.prefetch(LolPatches.entries(page));
            R.notLoaded = LolPatches.entries(page).filter(function(x){ return !LolData.get(x); }).map(function(x){ return x.id; });
            var sel = d.createElement("select");
            R.fill = { n: LolPatches.fillPatchSelect(sel, page, e.season, e.id), value: sel.value,
                labels: [].map.call(sel.options, function(o){ return o.text; }) };
            // an in-page season switch the way the reworked calculators do it
            var keys = LolPatches.seasons().filter(function(s){ return s[page]; }).map(function(s){ return s.key; });
            var otherKey = keys[0] === e.season ? keys[1] : keys[0];
            var e2 = LolPatches.seasonDefault(page, otherKey);
            await LolData.load(e2);
            setClientEra(e2.era);
            var ssel = d.querySelector(".legacy-header select.header-season");
            buildSeasonNav({ page: page, seasonSelect: "#" + ssel.id, entry: e2, onSeason: function(){ return true; } });
            if (w.AirSheet) AirSheet.sync(e2);
            LolPatches.fillPatchSelect(d.querySelector(".legacy-header select.header-patch"), page, e2.season, e2.id);
            var sh = d.querySelector(".air-sheet[data-air-page]");
            R.switched = { entry: e2.id, season: ssel.value, seasonCount: ssel.options.length, mode: LolPatches.shellMode(),
                client: d.body.getAttribute("data-client"),
                tabs: [].map.call(d.querySelectorAll(".header-tabs .header-tab"), function(a){ return a.getAttribute("href"); }),
                patch: d.querySelector(".legacy-header select.header-patch").value,
                sheet: sh ? [sh.getAttribute("data-air-season"), sh.getAttribute("data-air-period"), sh.getAttribute("data-air-chips")] : null };
        } catch (err) { R.asyncError = String(err && err.stack || err); }
        w.__t1Result = R; w.__t1Done = true;
    })();
});

// Legacy pages: wait until the calculator drew (P0-A's readiness DOM checks).
const LEGACY_READY = {
    masteries: "!!(window.jQuery && (document.querySelector('#calculator .button') || document.querySelector('#keystone-calculator .ks-mastery')))",
    runes: "!!(window.jQuery && document.querySelector('#rune-slots .rune-slot') && document.querySelector('#runes-categories .rl-cat'))",
    reforged: "(function(){var l=document.querySelector('#reforged-calculator .rr-loading');return !!(window.jQuery && l && l.style.display === 'none' && document.querySelector('#reforged-calculator .rr-picker, #reforged-calculator .rr-body:not([hidden])'));})()"
};
const LEGACY_PROBE = function(page){
    return "(function(){var n=0,iv=setInterval(function(){var ok=false;try{ok=" + LEGACY_READY[page] + ";}catch(e){}" +
        "if(ok||++n>200){clearInterval(iv);setTimeout(function(){var R={stage:'legacy',ready:ok};try{var p=LolPatches.page(),r=LolPatches.fromHash(p);" +
        "R.hash=location.hash;R.page=p;R.entry=r.entry&&r.entry.id;R.hasFile=!!(r.entry&&r.entry.file);R.written=!!(r.entry&&r.entry.file&&LolData._wasWritten(r.entry.file));" +
        "R.loaded=!!(r.entry&&r.entry.data!==null&&LolData.get(r.entry));R.codec=r.alias&&r.alias.codec?!!LolData.getCodec(r.alias.codec):null;" +
        "R.mode=LolPatches.shellMode();var s=document.querySelector('.legacy-header select.header-season');R.season=s&&s.value;R.seasonCount=s&&s.options.length;" +
        "var sh=document.querySelector('.air-sheet[data-air-page]');R.sheet=sh?[sh.getAttribute('data-air-season'),sh.getAttribute('data-air-period')]:null;" +
        "R.client=document.body.getAttribute('data-client');R.tabs=[].map.call(document.querySelectorAll('.header-tabs .header-tab'),function(a){return a.getAttribute('href');});" +
        "}catch(e){R.err=String(e&&e.stack||e);}window.__t1Result=R;window.__t1Done=true;},400);}},100);})();";
};

const PAGE_FILE = { masteries: "index.html", runes: "runes.html", reforged: "runes-reforged.html" };
const PAGE_NAME = { masteries: "Masteries", runes: "Runes", reforged: "Runes Reforged" };

function registryHtml(src, page) {
    let s = src.replace(/\r\n/g, "\n");
    s = s.replace(' data-lol-shell="legacy"', "");
    // drop everything after jQuery that the calculators bring (old data + calculator scripts)
    const lines = s.split("\n");
    const out = [];
    let afterJq = false;
    lines.forEach(function(l){
        if (/src="vendor\/jquery/.test(l)) { afterJq = true; out.push(l); return; }
        if (afterJq && (/<script[^>]+src=/.test(l) || /<!-- (TRANSITION|runes-reforged-data)/.test(l) || /^\s+(Phase 2|deletes)/.test(l))) return;
        out.push(l);
    });
    s = out.join("\n");
    const probe = "<script type=\"text/javascript\">(" + PROBE + ")();</script>\n";
    const at = s.lastIndexOf("</body>");
    return s.slice(0, at) + probe + s.slice(at);
}

function legacyHtml(src, page) {
    const s = src.replace(/\r\n/g, "\n");
    const at = s.lastIndexOf("</body>");
    return s.slice(0, at) + "<script type=\"text/javascript\">" + LEGACY_PROBE(page) + "</script>\n" + s.slice(at);
}

function copySite(dest) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(REPO, dest, { recursive: true, filter: src => !/[\\/](\.git|node_modules)([\\/]|$)/.test(path.relative(REPO, src) ? "/" + path.relative(REPO, src) : "") });
}

function expectFor(page, hash, registry) {
    // independent expectations from tools/lib/patches.js + aliases.json
    const al = P.aliases();
    let raw = hash.replace(/^#/, "");
    if (page === "reforged" && raw.indexOf("|") < 0 && /%7C/i.test(raw)) raw = decodeURIComponent(raw);
    let id;
    if (!raw) id = P.pageDefault(page);
    else if (raw.indexOf("|") < 0 && page !== "reforged") id = al.plain[page].to;
    else {
        const first = raw.split("|")[0];
        if (al[page][first]) id = al[page][first].to;
        else {
            const pid = P.parseId(first);
            const listed = stubListing(page).map(r => r.patch);
            if (pid && pid.page === page) {
                const best = P.latestAtOrBefore(listed, pid.patch);
                id = best && P.compare(pid.patch, listed[listed.length - 1]) <= 0 ? P.idFor(page, best) : P.pageDefault(page);
            } else id = P.pageDefault(page);
        }
    }
    const e = registry[page].filter(x => x.id === id)[0];
    const patch = e.patch;
    const season = P.seasonOf(patch);
    const s = P.season(season);
    const chrome = P.chromeOf(page, patch);
    const def = { key: season };
    P.PAGES.forEach(pg => { if (s.pages[pg]) def[pg] = s.pages[pg]["default"]; });
    const tabs = def.reforged ? [["Runes Reforged", "runes-reforged.html#" + def.reforged, true]]
        : [["Masteries", "index.html#" + def.masteries + "|", page === "masteries"], ["Runes", "runes.html#" + def.runes + "|", page === "runes"]];
    const options = registry[page].filter(x => x.season === season).map(x => [x.id, x.label]);
    const CHIPS = { masteries: { s2: 10, s3: 10, s4: 20, s5: 6, s6: 8, s7: 20 }, runes: { s1: 2, s2: 2, s3: 3, s4: 6, s5: 6, s6: 20, s7: 20 } };
    return { id, season, label: s.label, era: chrome.era, period: chrome.airPeriod || null, tabs, options,
        chips: String((CHIPS[page] || {})[season] || 0),
        title: s.label.replace(/\s*\(.*\)$/, "") + " " + PAGE_NAME[page] + " \u00b7 Legacy LoL Calculator" };
}

async function cmdBrowser(args) {
    if (!args.out || args.out === true) die("--out <dir> is required");
    const out = path.resolve(String(args.out));
    fs.mkdirSync(out, { recursive: true });
    const site = path.join(out, "site");
    copySite(site);
    if (args.real) {
        // the data tasks' real listings, manifests and files (registry --strict)
        const r = cp.spawnSync(process.execPath, [path.join(REPO, "tools", "build-registry.js"), "--root", site, "--strict", "--quiet"], { encoding: "utf8" });
        if (r.status !== 0) die("build-registry --strict failed: " + r.stdout + r.stderr);
    } else {
        writeStubData(site);
        buildStubRegistry(site);
    }
    // the registry the pages see, for the expectations
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(site, "patch-registry.js"), "utf8") + ";this.__P=LOL_PATCHES;", ctx);
    const registry = plain(ctx.__P);

    const REG_CASES = [
        ["masteries", ""], ["masteries", "#m-V4.5|"], ["masteries", "#s4-final|abc"], ["masteries", "#s7-final|"],
        ["masteries", "#m-V1.0.0.40|"], ["masteries", "#zzz|abc"], ["masteries", "#abcDEF"], ["masteries", "#s6-launch|ab"],
        ["runes", ""], ["runes", "#preReforged-V1.0.0.94b|"], ["runes", "#preReforged-V6.24|"], ["runes", "#preReforged-V3.14|"],
        ["runes", "#preReforged-V1.0.0.131|"], ["runes", "#5245,5245"],
        ["reforged", ""], ["reforged", "#rr-v8-23"], ["reforged", "#rr-v12-23|8000|8100|5008"], ["reforged", "#rr-v8-4%7C8000%7C8100"],
        ["reforged", "#rr-v8-17|"], ["reforged", "#rr-v26-13"]
    ];
    const LEGACY_CASES = [
        ["masteries", "#s4-final|"], ["masteries", ""], ["masteries", "#s7-final|"],
        ["runes", "#preReforged-V3.14|"], ["runes", ""],
        ["reforged", "#rr-v7-22"], ["reforged", ""]
    ];
    // write the case pages next to the real ones (relative URLs resolve the same)
    P.PAGES.forEach(function(page){
        const src = fs.readFileSync(path.join(site, PAGE_FILE[page]), "utf8");
        fs.writeFileSync(path.join(site, "__t1-reg-" + PAGE_FILE[page]), registryHtml(src, page));
        fs.writeFileSync(path.join(site, "__t1-leg-" + PAGE_FILE[page]), legacyHtml(src, page));
    });

    const exe = findBrowser(args);
    const b = await launch(exe);
    const report = [];
    let bad = 0;
    try {
        for (const [page, hash] of REG_CASES) {
            const url = fileUrl(path.join(site, "__t1-reg-" + PAGE_FILE[page])) + hash;
            const res = await openCase(b, url, 30000);
            const exp = expectFor(page, hash, registry);
            const R = res.result || {};
            const probs = [];
            const eq = (what, got, want) => { try { assert.deepStrictEqual(got, want); } catch (e) { probs.push(what + ": got " + JSON.stringify(got) + ", want " + JSON.stringify(want)); } };
            if (R.syncError) probs.push("sync: " + R.syncError);
            if (R.asyncError) probs.push("async: " + R.asyncError);
            eq("entry", R.entry, exp.id);
            eq("preloaded (sync, before the calculators)", R.preloaded, true);
            const ee = registry[page].filter(x => x.id === exp.id)[0];
            eq("preloaded through document.write", R.written, ee.file ? true : null);
            if (R.alias && R.alias.codec) eq("codec preloaded", R.codecPreloaded, true);
            if (R.header) {
                eq("header season", [R.header.season, R.header.seasonText, R.header.seasonCount], [exp.season, exp.label, 16]);
                eq("header patch", R.header.patch, exp.id);
                eq("header patch list", R.header.patchOptions, exp.options);
                eq("header tabs", R.header.tabs, exp.tabs);
                eq("title", R.header.title, exp.title);
            } else probs.push("no header");
            eq("client era", R.client, { html: exp.era, body: exp.era });
            if (page !== "reforged") eq("AIR sheet", R.sheet && [R.sheet.season, R.sheet.period, R.sheet.chips], [exp.season, exp.period, exp.chips]);
            if (R.sheet) {
                const other = page === "masteries" ? "runes" : "masteries";
                const link = R.sheet.links.filter(l => l[0] === other)[0];
                eq("AIR sheet link", link && link[1], exp.tabs.filter(t => t[0] === PAGE_NAME[other])[0][1]);
            }
            eq("load", R.load && [R.load.id, R.load.same], [exp.id, true]);
            eq("dynamic load: one <script> for two loads", R.dynamic && [R.dynamic.both, R.dynamic.injected], [true, 1]);
            if (R.nullEntry !== undefined) eq("data: null entry", R.nullEntry, true);
            eq("file: null rejects", /not built/.test(R.noFile || ""), true);
            eq("missing file rejects", /Could not load data\/__missing__\.js/.test(R.missing || ""), true);
            if (page === "masteries") eq("loadCodec", R.codec, args.real ? "keystone" : "s6-launch");
            eq("prefetch loads the page's files", R.notLoaded, []);
            eq("fillPatchSelect", R.fill && [R.fill.n, R.fill.value, R.fill.labels], [exp.options.length, exp.id, exp.options.map(o => o[1])]);
            if (R.switched) {
                eq("switch: registry mode", R.switched.mode, "registry");
                const e2 = registry[page].filter(x => x.id === R.switched.entry)[0];
                const x2 = expectFor(page, "#" + e2.id + "|", registry);
                eq("switch: season", [R.switched.season, R.switched.seasonCount, R.switched.patch], [x2.season, 16, e2.id]);
                eq("switch: tabs", R.switched.tabs, x2.tabs.map(t => t[1]));
                eq("switch: era", R.switched.client, x2.era);
                if (page !== "reforged") eq("switch: AIR sheet", R.switched.sheet, [x2.season, x2.period, x2.chips]);
            } else probs.push("no switch result");
            const failedFiles = res.failed.filter(f => /^file:/.test(f) && !/__missing__/.test(f));
            const missingSeen = res.failed.filter(f => /__missing__/.test(f)).length;
            const errs = res.errors.filter(e => !/__missing__/.test(e));
            if (errs.length) probs.push("console: " + errs.join(" | "));
            if (failedFiles.length) probs.push("failed requests: " + failedFiles.join(" | "));
            if (missingSeen !== 1) probs.push("expected exactly 1 failed request for the missing file, saw " + missingSeen);
            const other = res.failed.filter(f => !/^file:/.test(f));
            report.push({ mode: "registry", page, hash, entry: R.entry, ok: !probs.length, problems: probs, externalFailures: other, result: R });
            if (probs.length) bad++;
            console.log((probs.length ? "FAIL " : "ok   ") + "registry " + page + " " + (hash || "(empty)") + " -> " + R.entry + (probs.length ? "\n       " + probs.join("\n       ") : ""));
        }
        for (const [page, hash] of LEGACY_CASES) {
            const url = fileUrl(path.join(site, "__t1-leg-" + PAGE_FILE[page])) + hash;
            const res = await openCase(b, url, 40000);
            const R = res.result || {};
            const probs = [];
            // the legacy calculators may have rewritten the hash by now
            const exp = expectFor(page, R.hash != null ? R.hash : hash, registry);
            if (R.err) probs.push(R.err);
            if (!R.ready) probs.push("legacy calculator did not draw");
            if (R.mode !== "legacy") probs.push("mode " + R.mode);
            if (R.written || R.loaded) probs.push("a legacy shell must not preload (written " + R.written + ", loaded " + R.loaded + ")");
            if (R.codec === true) probs.push("a legacy shell must not preload the codecs");
            if (R.seasonCount !== 16) probs.push("season count " + R.seasonCount);
            if (R.entry !== exp.id) probs.push("entry " + R.entry + " want " + exp.id);
            const failedFiles = res.failed.filter(f => /^file:/.test(f));
            if (res.errors.length) probs.push("console: " + res.errors.join(" | "));
            if (failedFiles.length) probs.push("failed requests: " + failedFiles.join(" | "));
            report.push({ mode: "legacy", page, hash, entry: R.entry, season: R.season, sheet: R.sheet, client: R.client, tabs: R.tabs, ok: !probs.length, problems: probs,
                externalFailures: res.failed.filter(f => !/^file:/.test(f)) });
            if (probs.length) bad++;
            console.log((probs.length ? "FAIL " : "ok   ") + "legacy   " + page + " " + (hash || "(empty)") + " -> season " + R.season +
                (R.sheet ? " sheet " + R.sheet.join("/") : "") + " era " + R.client + (probs.length ? "\n       " + probs.join("\n       ") : ""));
        }
    } finally {
        await b.close();
        if (!args.keep) P.PAGES.forEach(function(page){
            ["__t1-reg-", "__t1-leg-"].forEach(pre => { try { fs.unlinkSync(path.join(site, pre + PAGE_FILE[page])); } catch (e) {} });
        });
    }
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1) + "\n");
    const ext = report.reduce((n, r) => n + r.externalFailures.length, 0);
    console.log((bad ? "FAILED" : "ok") + " browser" + (args.real ? " (real data)" : " (stub data)") + ": " + (report.length - bad) + "/" + report.length + " cases over file://" +
        (ext ? " (" + ext + " non-file request failures ignored, see report.json)" : "") + "; report " + path.join(out, "report.json"));
    return bad === 0;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cmd = args._[0];
    let ok = true;
    if (cmd === "unit" || cmd === "all") ok = (await cmdUnit()) && ok;
    if (cmd === "browser" || cmd === "all") ok = (await cmdBrowser(args)) && ok;
    if (["unit", "browser", "all"].indexOf(cmd) < 0) die("usage: stub-shell-test.js unit | browser --out <dir> | all --out <dir>");
    process.exit(ok ? 0 : 1);
}

main().catch(e => die(e.stack || String(e)));
