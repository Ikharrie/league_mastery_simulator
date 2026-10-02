#!/usr/bin/env node
// tools/import-ddragon-versions.js — writes data/sources/ddragon-versions.json,
// the committed list of every Data Dragon live patch with its builds
// (DESIGN.md §1.3). Committed for provenance and for the maintenance step
// "a new live patch" (README); it is not part of the build. No network.
//
//     node tools/import-ddragon-versions.js --research <scratchpad>\patches [--check]
//         reads <R>/raw/versions.json (Riot's api/versions.json, saved by the
//         research) and cross-checks the research build tables
//         masteries-ddragon/patch-builds.json, runes-legacy/builds.json and
//         reforged/ddragon_builds.json: each must list exactly the builds of
//         its patches that versions.json has
//     node tools/import-ddragon-versions.js --versions <versions.json> [--check]
//         a newer download of https://ddragon.leagueoflegends.com/api/versions.json
//         (no research tables to cross-check)
//     --check  write nothing; exit 1 when the committed file would change
//
// Output: { _comment, _imported, live: {patch, build},
//           patches: [{patch, ddragon, builds[], last}, …] } — oldest first.
//   patch    the live patch name (V1.0.0.151, V3.6, V25.S1.1, V26.01)
//   ddragon  the DDragon major.minor (0.151, 3.6, 15.1, 16.1)
//   builds   every DDragon build of the patch, ascending
//   last     the last build: the one the generators read for a listed patch
// Riot's "lolpatch_X.Y" tags carry no build of their own and are dropped.
// Read by tools/check-patches.js (G3) and tools/lib/patches.test.js.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const P = require("./lib/patches.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "sources", "ddragon-versions.json");
const GENERATOR = "tools/import-ddragon-versions.js";

function fail(msg) { console.error("import-ddragon-versions: " + msg); process.exit(1); }

function parseArgs(argv) {
    const a = { research: null, versions: null, check: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--research") a.research = argv[++i];
        else if (argv[i] === "--versions") a.versions = argv[++i];
        else if (argv[i] === "--check") a.check = true;
        else fail("unknown argument " + argv[i]);
    }
    if (!a.research && !a.versions) fail("usage: node " + GENERATOR + " --research <scratchpad>\\patches | --versions <versions.json> [--check]");
    return a;
}

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\s+/, "")); }   // \s includes a BOM
    catch (e) { fail("cannot read " + file + ": " + e.message); }
}

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

function cmpBuild(a, b) {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d) return d;
    }
    return 0;
}

// versions.json -> [{patch, ddragon, builds, last}] oldest first
function group(versions) {
    if (!Array.isArray(versions) || !versions.length) fail("versions.json is not a non-empty array");
    const by = new Map();
    versions.forEach(function (v) {
        if (/^lolpatch_/.test(v)) return;
        if (!/^\d+\.\d+\.\d+$/.test(v)) fail("unexpected version " + JSON.stringify(v));
        const p = P.fromDdragon(v);
        if (!by.has(p.key)) by.set(p.key, { p: p, ddragon: v.split(".").slice(0, 2).join("."), builds: [] });
        by.get(p.key).builds.push(v);
    });
    return Array.from(by.values()).sort(function (a, b) { return P.compare(a.p, b.p); }).map(function (g) {
        const builds = g.builds.slice().sort(cmpBuild);
        return { patch: P.officialName(g.p), ddragon: g.ddragon, builds: builds, last: builds[builds.length - 1] };
    });
}

// Each research table must agree with versions.json on every patch it lists.
function crossCheck(patches, R) {
    const byKey = new Map(patches.map(function (e) { return [P.parse(e.patch).key, e]; }));
    const problems = [];
    const same = function (label, key, builds) {
        const e = byKey.get(key);
        if (!e) { problems.push(label + ": not in versions.json"); return; }
        if (builds.slice().sort(cmpBuild).join() !== e.builds.join()) problems.push(label + ": builds " + builds.join(",") + " != versions.json " + e.builds.join(","));
    };
    const tables = [];
    const m = readJson(path.join(R, "masteries-ddragon", "patch-builds.json"));
    Object.keys(m).forEach(function (k) { same("masteries-ddragon/patch-builds.json " + k, P.parse(k).key, m[k]); });
    tables.push("masteries-ddragon/patch-builds.json (" + Object.keys(m).length + ")");
    const r = readJson(path.join(R, "runes-legacy", "builds.json"));
    r.forEach(function (x) { same("runes-legacy/builds.json " + x.patch, P.parse(x.patch).key, x.builds); });
    tables.push("runes-legacy/builds.json (" + r.length + ")");
    const f = readJson(path.join(R, "reforged", "ddragon_builds.json"));
    f.forEach(function (x) {
        same("reforged/ddragon_builds.json " + x.patch, P.fromDdragon(x.patch).key, x.builds);
        const e = byKey.get(P.fromDdragon(x.patch).key);
        if (e && x.last !== e.last) problems.push("reforged/ddragon_builds.json " + x.patch + ": last " + x.last + " != " + e.last);
    });
    tables.push("reforged/ddragon_builds.json (" + f.length + ")");
    if (problems.length) fail("the research build tables disagree with versions.json:\n  " + problems.slice(0, 20).join("\n  "));
    return tables;
}

function render(doc) {
    const lines = ["{"];
    lines.push(" \"_comment\": " + JSON.stringify(doc._comment) + ",");
    lines.push(" \"_imported\": " + JSON.stringify(doc._imported) + ",");
    const row = function (o) { return JSON.stringify(o).replace(/,"/g, ", \"").replace(/":/g, "\": "); };
    lines.push(" \"live\": " + row(doc.live) + ",");
    lines.push(" \"patches\": [");
    doc.patches.forEach(function (e, i) {
        lines.push("  " + row(e) + (i < doc.patches.length - 1 ? "," : ""));
    });
    lines.push(" ]");
    lines.push("}");
    return lines.join("\n") + "\n";
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const R = args.research ? path.resolve(args.research) : null;
    const vfile = args.versions ? path.resolve(args.versions) : path.join(R, "raw", "versions.json");
    const patches = group(readJson(vfile));
    const tables = R ? crossCheck(patches, R) : [];
    const last = patches[patches.length - 1];
    const live = P.livePatch();
    if (!P.equal(last.patch, live)) console.warn("warning: the latest DDragon patch is " + last.patch + " but data/patches/seasons.json live.patch is " + live + " (a new live patch: see README, Maintenance)");
    const doc = {
        _comment: [
            "Every Data Dragon live patch with its builds, oldest first (DESIGN.md 1.3). patch = live name; ddragon = the DDragon major.minor;",
            "builds = every build of the patch, ascending; last = the build the generators read for a listed patch.",
            "Riot's lolpatch_X.Y tags are dropped (no build of their own). Read by tools/check-patches.js G3 and tools/lib/patches.test.js.",
            "Written by " + GENERATOR + "; do not edit by hand."
        ].join(" "),
        _imported: GENERATOR + " from " + (R ? "research raw/versions.json" : path.basename(vfile)) + " (sha256 " + sha256(vfile) + ")" +
            (tables.length ? "; cross-checked against " + tables.join(", ") : ""),
        live: { patch: last.patch, build: last.last },
        patches: patches
    };
    const text = render(doc);
    JSON.parse(text);   // sanity
    const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").split("\r\n").join("\n") : null;
    const summary = patches.length + " patches (" + patches[0].patch + " … " + last.patch + ", live build " + last.last + ")";
    if (args.check) {
        if (old !== text) { console.error("data/sources/ddragon-versions.json is " + (old === null ? "missing" : "out of date") + " (" + summary + ")"); process.exit(1); }
        console.log("data/sources/ddragon-versions.json is up to date: " + summary);
        return;
    }
    if (P.writeIfChanged(OUT, text)) console.log("wrote data/sources/ddragon-versions.json: " + summary);
    else console.log("data/sources/ddragon-versions.json unchanged: " + summary);
}

main();
