#!/usr/bin/env node
// tools/build-all.js — the whole per-patch data build and every check, in
// order (DESIGN §1.5, §7.1). Offline: reads committed files only (the
// optional --raw audits read the research download cache, never the network).
//
//   node tools/build-all.js [--check] [--raw <cache>] [--browser [--par N]]
//                           [--keep-going] [--verbose] [--log <dir>]
//
// Steps
//   1. syntax       node --check on every .js of the site (root, tools/, data/)
//   2. builders     tools/build-masteries.js, generate-runes-data.js,
//                   tools/build-reforged.js, tools/build-notes.js (the
//                   patch-notes files; they write only what changed)
//   3. registry     tools/build-registry.js --strict, then --strict --check
//                   (it reads the notes files, so build-notes runs first)
//   4. unit         tools/lib/patches.test.js, tools/fixtures/stub-shell-test.js unit
//   5. checks       tools/check-patches.js, tools/test-links.js, tools/test-carry.js,
//                   tools/test-notes.js (the What changed flyout; browser only)
//   6. audits       only with --raw: build-masteries --check --audit,
//                   generate-runes-data --check --audit, build-reforged --check --audit
//                   (C3 / F3 against every unlisted DDragon patch)
//
//   --check       write nothing: the builders and the registry only compare
//                 (exit 1 when a generated file is out of date)
//   --raw <dir>   the shared download cache (<scratchpad>\patches\raw: mastery/,
//                 rune/, reforged/, cdragon*/). Adds step 6, check-patches
//                 --audit, and the cached Runes Reforged catalogs for
//                 test-links L0/L2 and test-carry X3
//   --browser     also test-links L3, test-carry X4 and test-notes W1-W2
//                 (headless Edge / Chrome over file://; Node 22+). With --raw
//                 the Reforged page is included (its catalogs are served from
//                 the cache)
//   --keep-going  run every step even after a failure
//   --log <dir>   write the full output of every step to <dir>/<nn>-<step>.log
//
// Idempotent: the generated files (data/masteries/, data/runes/,
// data/reforged/, data/notes/, patch-registry.js) are hashed before and
// after; a second run reports "0 generated files changed" and leaves a clean
// git diff.
//
// Skips. The checks report SKIP for input they were not given. The ones that
// only need --raw or --browser are expected in a plain run and listed as
// "optional"; any other skip makes the run INCOMPLETE.
// Exit code: 0 passed (optional skips allowed), 1 a failure, 2 incomplete.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const GENERATED = ["data/masteries", "data/runes", "data/reforged", "data/notes", "patch-registry.js"];
const SYNTAX_DIRS = ["", "tools", "data"];
const SYNTAX_SKIP = /^(vendor|pyro|node_modules|\.git|\.claude|data[\\/]legacy-client-ref)([\\/]|$)/;

// Skip messages that only mean "pass --raw" / "pass --browser".
const NEEDS_RAW = /--audit|--research|--reforged-cache|runtime catalogs|no cached/;
const NEEDS_BROWSER = /--browser\b/;

function parseArgs(argv) {
    const a = { check: false, raw: null, browser: false, par: null, keepGoing: false, verbose: false, log: null };
    for (let i = 0; i < argv.length; i++) {
        const x = argv[i];
        if (x === "--check") a.check = true;
        else if (x === "--raw") a.raw = argv[++i];
        else if (x === "--browser") a.browser = true;
        else if (x === "--par") a.par = argv[++i];
        else if (x === "--keep-going") a.keepGoing = true;
        else if (x === "--verbose") a.verbose = true;
        else if (x === "--log") a.log = argv[++i];
        else if (x === "-h" || x === "--help") { console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1).filter(function (l, i, all) { return all.slice(0, i + 1).every(function (x) { return /^\/\//.test(x); }); }).map(function (l) { return l.replace(/^\/\/ ?/, ""); }).join("\n")); process.exit(0); }
        else { console.error("build-all: unknown argument " + x); process.exit(1); }
    }
    if (a.raw === undefined || a.raw === "") { console.error("build-all: --raw needs the download cache directory"); process.exit(1); }
    if (a.log === undefined || a.log === "") { console.error("build-all: --log needs a directory"); process.exit(1); }
    if (a.log) { a.log = path.resolve(a.log); fs.mkdirSync(a.log, { recursive: true }); }
    if (a.raw) {
        a.raw = path.resolve(a.raw);
        if (!fs.existsSync(a.raw)) { console.error("build-all: --raw " + a.raw + " does not exist"); process.exit(1); }
    }
    return a;
}

// --- generated files: hash map for the idempotence report ------------------
function walk(rel, out) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return out;
    const st = fs.statSync(abs);
    if (st.isFile()) { out.push(rel.split(path.sep).join("/")); return out; }
    fs.readdirSync(abs).sort().forEach(function (n) { walk(path.join(rel, n), out); });
    return out;
}
function snapshot() {
    const map = {};
    GENERATED.forEach(function (g) {
        walk(g, []).forEach(function (f) {
            // a CRLF checkout of an LF file is the same file (core.autocrlf)
            const text = fs.readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
            map[f] = crypto.createHash("sha256").update(text).digest("hex");
        });
    });
    return map;
}
function changedBetween(a, b) {
    const out = [];
    Object.keys(b).forEach(function (f) { if (a[f] !== b[f]) out.push((a[f] ? "changed " : "new ") + f); });
    Object.keys(a).forEach(function (f) { if (!(f in b)) out.push("removed " + f); });
    return out;
}

// --- steps -------------------------------------------------------------------
function jsFiles() {
    const out = [];
    SYNTAX_DIRS.forEach(function (d) {
        const abs = path.join(ROOT, d);
        (function rec(dirAbs, depth) {
            fs.readdirSync(dirAbs, { withFileTypes: true }).forEach(function (e) {
                const full = path.join(dirAbs, e.name), rel = path.relative(ROOT, full);
                if (SYNTAX_SKIP.test(rel)) return;
                if (e.isDirectory()) { if (d !== "" && depth < 6) rec(full, depth + 1); return; }
                if (/\.js$/.test(e.name)) out.push(rel);
            });
        })(abs, 0);
    });
    return Array.from(new Set(out)).sort();
}

function run(label, script, args, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, script)].concat(args || []), {
        cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: opts.timeout || 0
    });
    const out = (r.stdout || "") + (r.stderr || "");
    const shown = (args || []).filter(function (x, i, all) { return x !== "--json" && all[i - 1] !== "--json"; });
    return { label: label, cmd: "node " + [script].concat(shown).join(" "), code: r.status == null ? 1 : r.status,
        out: out, ms: Date.now() - t0, error: r.error ? String(r.error.message || r.error) : null };
}

function tail(text, n) {
    const lines = String(text || "").replace(/\s+$/, "").split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - n));
}

// A checker run with --json: classify its skips.
function judgeJson(file, args) {
    let doc = null;
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; }
    const optional = [], unexpected = [], failed = [];
    (doc.results || []).forEach(function (r) {
        (r.items || []).forEach(function (i) {
            if (i.status === "fail") failed.push(r.id + " " + i.msg);
            if (i.status !== "skip") return;
            const raw = NEEDS_RAW.test(i.msg) && !args.raw;
            const browser = NEEDS_BROWSER.test(i.msg) && !args.browser;
            (raw || browser ? optional : unexpected).push(r.id + " " + i.msg + (raw ? "  [needs --raw]" : browser ? "  [needs --browser]" : ""));
        });
    });
    return { verdict: doc.verdict, summary: doc.summary, optional: optional, unexpected: unexpected, failed: failed };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "build-all-"));
    const before = snapshot();
    const results = [];
    let stop = false;
    const say = function (s) { process.stdout.write(s + "\n"); };
    const report = function (r, extra) {
        const status = r.status || (r.code === 0 ? "ok" : "FAIL");
        say((status === "ok" ? "ok    " : status === "INCOMPLETE" ? "SKIP  " : "FAIL  ") + r.label.padEnd(22) + " " + (r.ms / 1000).toFixed(1).padStart(6) + " s   " + r.cmd);
        const show = status === "ok" && !args.verbose ? [] : tail(r.out, status === "ok" ? 40 : 25);
        show.forEach(function (l) { say("        | " + l); });
        (extra || []).forEach(function (l) { say("        " + l); });
        results.push(Object.assign({ status: status }, r));
        if (args.log) fs.writeFileSync(path.join(args.log, String(results.length).padStart(2, "0") + "-" + r.label.replace(/[^A-Za-z0-9.-]+/g, "_") + ".log"), r.cmd + "\n\n" + (r.out || "") + ((extra || []).length ? "\n" + extra.join("\n") + "\n" : ""));
        if (status === "FAIL" && !args.keepGoing) stop = true;
    };

    say("build-all" + (args.check ? " --check" : "") + (args.raw ? " --raw " + args.raw : "") + (args.browser ? " --browser" : "") + "  (" + ROOT + ")");
    say("");

    // 1. syntax
    {
        const t0 = Date.now(), bad = [];
        const files = jsFiles();
        files.forEach(function (f) {
            const r = cp.spawnSync(process.execPath, ["--check", f], { cwd: ROOT, encoding: "utf8" });
            if (r.status !== 0) bad.push(f + ": " + tail(r.stderr, 4).join(" / "));
        });
        report({ label: "syntax", cmd: "node --check (" + files.length + " .js files)", code: bad.length ? 1 : 0, out: bad.join("\n"), ms: Date.now() - t0 });
    }

    // 2. builders, 3. registry
    const chk = args.check ? ["--check"] : [];
    const steps = [
        ["build-masteries", "tools/build-masteries.js", chk],
        ["generate-runes-data", "generate-runes-data.js", chk],
        ["build-reforged", "tools/build-reforged.js", chk],
        ["build-notes", "tools/build-notes.js", chk],
        ["build-registry", "tools/build-registry.js", ["--strict"].concat(chk)]
    ];
    if (!args.check) steps.push(["registry --check", "tools/build-registry.js", ["--strict", "--check"]]);
    steps.forEach(function (s) { if (!stop) report(run(s[0], s[1], s[2])); });

    // 4. unit tests
    if (!stop) report(run("patches.test", "tools/lib/patches.test.js", []));
    if (!stop) report(run("shell unit", "tools/fixtures/stub-shell-test.js", ["unit"]));

    // 5. checks (each with --json, so the skips can be classified)
    const optionalAll = [];
    let incomplete = false;
    const checker = function (label, script, extra) {
        if (stop) return;
        const json = path.join(tmp, label + ".json");
        const r = run(label, script, extra.concat(["--json", json]), { timeout: 4 * 3600 * 1000 });
        const j = judgeJson(json, args);
        const lines = [];
        if (!j) r.status = r.code === 0 ? "ok" : "FAIL";
        else if (r.code === 1 || j.failed.length) r.status = "FAIL";
        else if (j.unexpected.length) { r.status = "INCOMPLETE"; incomplete = true; }
        else r.status = "ok";
        if (j) {
            const verdict = j.verdict === "INCOMPLETE" && !j.unexpected.length && !j.failed.length ? "PASSED (optional parts skipped)" : j.verdict;
            lines.push(verdict + ": " + j.summary.pass + " passed, " + j.summary.fail + " failed, " + j.summary.skip + " skipped of " + j.summary.total + " checks");
            j.unexpected.forEach(function (m) { lines.push("unexpected skip: " + m); });
            j.optional.forEach(function (m) { optionalAll.push(label + " " + m); });
        }
        report(r, lines);
    };
    const audit = args.raw ? ["--audit", args.raw] : [];
    const cache = args.raw ? ["--reforged-cache", path.join(args.raw, "reforged")] : [];
    const browser = args.browser ? ["--browser"].concat(args.par ? ["--par", args.par] : []) : [];
    checker("check-patches", "tools/check-patches.js", audit);
    checker("test-links", "tools/test-links.js", cache.concat(browser));
    checker("test-carry", "tools/test-carry.js", cache.concat(browser));
    checker("test-notes", "tools/test-notes.js", cache.concat(args.browser ? ["--browser"] : []));

    // 6. audits against the raw download cache
    if (args.raw) {
        if (!stop) report(run("audit masteries", "tools/build-masteries.js", ["--check", "--audit", args.raw]));
        if (!stop) report(run("audit runes", "generate-runes-data.js", ["--check", "--audit", args.raw]));
        if (!stop) report(run("audit reforged", "tools/build-reforged.js", ["--check", "--audit", args.raw]));
    }

    // idempotence report
    const after = snapshot();
    const changed = changedBetween(before, after);
    say("");
    say(changed.length + " generated file(s) changed by this run" + (changed.length ? ":" : " (" + Object.keys(after).length + " files in " + GENERATED.join(", ") + ")"));
    changed.slice(0, 40).forEach(function (l) { say("  " + l); });
    if (optionalAll.length) {
        say("");
        say("optional (not run without " + [args.raw ? null : "--raw <cache>", args.browser ? null : "--browser"].filter(Boolean).join(" / ") + "):");
        const seen = {};
        optionalAll.forEach(function (m) {
            const key = m.replace(/\d+/g, "#");
            seen[key] = (seen[key] || 0) + 1;
            if (seen[key] === 1 || args.verbose) say("  " + m);
        });
        Object.keys(seen).forEach(function (k) { if (seen[k] > 1 && !args.verbose) say("  … " + (seen[k] - 1) + " more like: " + k.slice(0, 90)); });
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* locked */ }

    const failed = results.filter(function (r) { return r.status === "FAIL"; });
    say("");
    if (failed.length) {
        say("build-all: FAILED (" + failed.map(function (r) { return r.label; }).join(", ") + ")" + (stop && !args.keepGoing ? "; later steps not run (--keep-going runs them)" : ""));
        return 1;
    }
    if (incomplete) { say("build-all: INCOMPLETE (unexpected skips above)"); return 2; }
    say("build-all: PASSED (" + results.length + " steps" + (optionalAll.length ? "; optional --raw / --browser checks not run" : "") + ")");
    return 0;
}

process.exitCode = main();
