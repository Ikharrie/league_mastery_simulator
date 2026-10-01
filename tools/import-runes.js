// tools/import-runes.js — one-shot import of the pre-Reforged rune research
// into data/sources/runes/ (DESIGN.md §1.3, task T5). Committed for
// provenance, not part of the build. It reads only the research folder; it
// never touches the network.
//
//     node tools/import-runes.js --research <scratchpad>\patches
//     node tools/import-runes.js --research <scratchpad>\patches --check
//
// --check rebuilds everything in memory and exits 1 when a committed source
// differs from the research (or an icon from data/sources/runes/icons.json).
//
// Writes
//   data/sources/runes/ddragon/<build>.json   12 builds, from raw/rune/rune-<build>.json
//   data/sources/runes/wiki/<patch>.json      12 states, from runes-legacy/reconstructed/rune-<state>.json
//   data/sources/runes/wiki/confidence.json   from runes-legacy/reconstructed/prov-<state>.json
//   data/sources/runes/cdragon-7.21-extra.json  from raw/cdragon/runes-7.21.json (5401, 8004, 8010, 8018)
// All rune catalogs are trimmed to {name, description, image.full, rune.tier,
// rune.type, non-zero stats} (generate-runes-data.js trimCatalog), plus the
// provenance fields source/research and sha256 of the file they came from.
//
// Checks
//   - the wiki V3.04 reconstruction equals DDragon 3.6.15 at calculator level
//     (the V3.04 entry uses 3.6.15 as its source);
//   - every reconstructed state has the rune count of runes-legacy/reconstructed/_index.json;
//   - images/runes/8004.png, 8010.png, 8018.png match data/sources/runes/icons.json.
//
// Hand-curated, never written here: data/patches/runes.json,
// data/patches/runes-overrides.json, data/patches/noise/runes.json and
// data/sources/runes/icons.json.

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const P = require("./lib/patches.js");
const gen = require("../generate-runes-data.js");

const ROOT = path.join(__dirname, "..");
const SOURCES = path.join(ROOT, "data", "sources", "runes");

// The DDragon builds the listed patches read (last build of each patch;
// 3.6.15 serves V3.04, 7.2.1 is the full-precision stats source of ro-002).
const DDRAGON_BUILDS = ["3.6.15", "3.13.24", "3.14.41", "4.5.4", "4.19.3", "4.20.2",
    "5.21.1", "5.22.3", "6.21.1", "6.22.1", "7.2.1", "7.21.1"];

// [file name = first listed patch that uses the state, research state key]
const WIKI_STATES = [
    ["V1.0.0.63", "V1.0.0.63"],
    ["V1.0.0.72", "V1.0.0.72"],
    ["V1.0.0.94b", "V1.0.0.96"],     // the V1.0.0.94(b) energy-rune state; .96 (Season One start) is not listed
    ["V1.0.0.103", "V1.0.0.103"],
    ["V1.0.0.105", "V1.0.0.105"],
    ["V1.0.0.107", "V1.0.0.107"],
    ["V1.0.0.110", "V1.0.0.110"],
    ["V1.0.0.128", "V1.0.0.124"],    // D9: the 2011 Razer promo runes (no patch) are folded into V1.0.0.128
    ["V1.0.0.131", "V1.0.0.131"],
    ["V1.0.0.132", "V1.0.0.132"],
    ["V1.0.0.138", "V1.0.0.138"],
    ["V1.0.0.152", "V1.0.0.152"],
];

const CDRAGON_721_URL = "https://raw.communitydragon.org/7.21/plugins/rcp-be-lol-game-data/global/default/v1/runes.json";
const CDRAGON_RUNES = ["5401", "8004", "8010", "8018"];

function fail(msg) { throw new Error(msg); }

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function readRaw(file) {
    if (!fs.existsSync(file)) fail("missing research file " + file);
    const buf = fs.readFileSync(file);
    return { buf: buf, json: JSON.parse(buf.toString("utf8")), sha256: sha256(buf) };
}

function jsonText(value) {
    return P.formatJson(value, { width: 300 }) + "\n";
}

function relPath(file) { return path.relative(ROOT, file).split(path.sep).join("/"); }

function plan(research) {
    const out = [];
    // DDragon builds
    for (const b of DDRAGON_BUILDS) {
        const raw = readRaw(path.join(research, "raw", "rune", "rune-" + b + ".json"));
        if (raw.json.version !== b) fail(`rune-${b}.json says version ${raw.json.version}`);
        const trimmed = gen.trimCatalog(raw.json, {
            source: `https://ddragon.leagueoflegends.com/cdn/${b}/data/en_US/rune.json`,
            sha256: raw.sha256,
        });
        out.push({ file: path.join(SOURCES, "ddragon", b + ".json"), text: jsonText(trimmed), value: trimmed });
    }
    // Wiki-era reconstructions
    const index = readRaw(path.join(research, "runes-legacy", "reconstructed", "_index.json")).json;
    const confidence = {};
    for (const [name, state] of WIKI_STATES) {
        const rel = "runes-legacy/reconstructed/rune-" + state + ".json";
        const raw = readRaw(path.join(research, rel));
        const prov = readRaw(path.join(research, "runes-legacy", "reconstructed", "prov-" + state + ".json")).json;
        const idx = index.find((s) => s.key === state);
        if (!idx) fail("_index.json has no state " + state);
        if (Object.keys(raw.json.data).length !== idx.count) fail(`${state}: ${Object.keys(raw.json.data).length} runes, _index.json says ${idx.count}`);
        const p = P.parse(prov.patchWindow[0]);
        if (p.name !== name && !(name === "V1.0.0.128" && state === "V1.0.0.124"))
            fail(`${state}: window starts at ${p.label}, expected ${name}`);
        const trimmed = gen.trimCatalog(raw.json, {
            research: rel,
            sha256: raw.sha256,
            state: state,
            label: prov.label,
            window: prov.patchWindow,
        });
        out.push({ file: path.join(SOURCES, "wiki", name + ".json"), text: jsonText(trimmed), value: trimmed });
        const runes = {};
        const counts = {};
        for (const id of Object.keys(prov.runeConfidence)) {
            const c = prov.runeConfidence[id];
            counts[c] = (counts[c] || 0) + 1;
            if (c !== "high") runes[id] = c;
            if (!raw.json.data[id]) fail(`${state}: prov names rune ${id} the catalog lacks`);
        }
        for (const id of Object.keys(raw.json.data)) if (!(id in prov.runeConfidence)) fail(`${state}: rune ${id} has no confidence`);
        confidence[name] = {
            research: "runes-legacy/reconstructed/prov-" + state + ".json",
            state: state,
            label: prov.label,
            window: prov.patchWindow,
            counts: counts,
            runes: runes,
        };
    }
    const conf = {
        _comment: "Per-rune confidence of the wiki-era rune states (DESIGN.md 1.3), condensed from the research provenance: only runes below \"high\" are listed. Written by tools/import-runes.js; read by generate-runes-data.js (catalog field `confidence`).",
        states: confidence,
    };
    out.push({ file: path.join(SOURCES, "wiki", "confidence.json"), text: jsonText(conf), value: conf });
    // CDragon 7.21 extras
    const cd = readRaw(path.join(research, "raw", "cdragon", "runes-7.21.json"));
    const list = Array.isArray(cd.json) ? cd.json : Object.values(cd.json);
    const runes = {};
    for (const id of CDRAGON_RUNES) {
        const e = list.find((x) => String(x.id) === id);
        if (!e) fail("CDragon 7.21 runes.json has no rune " + id);
        runes[id] = e;
    }
    const extra = {
        _comment: [
            "League Client (LCU) game data for patch 7.21, from CommunityDragon. Only what the rune generator needs (DESIGN.md 1.3, D7):",
            "5401 Mark of Precision: description \"+0.88 Lethality / +0.48 Magic Penetration\" and rPhysicalLethality 0.88 (the Data Dragon text \"+0.7 Leth\" is stale; runes-overrides.json ro-001/ro-003 are checked against this entry).",
            "8004, 8010, 8018: the dodge event runes. The client names their art (image) but CommunityDragon 7.21 hosts no rune images; see icons.json for the art actually used.",
        ],
        source: CDRAGON_721_URL,
        sha256: cd.sha256,
        runes: runes,
    };
    out.push({ file: path.join(SOURCES, "cdragon-7.21-extra.json"), text: jsonText(extra), value: extra });
    return out;
}

// V3.04 reads DDragon 3.6.15: prove the wiki reconstruction of V3.04 is the
// same catalog at calculator level.
function v304Check(research) {
    const raw = readRaw(path.join(research, "runes-legacy", "reconstructed", "rune-V3.04.json")).json;
    const dd = readRaw(path.join(research, "raw", "rune", "rune-3.6.15.json")).json;
    const norm = (cat) => gen.convertCatalog(gen.trimCatalog(cat), "V3.04 cross-check").runes
        .sort((a, b) => Number(a.id) - Number(b.id));
    const a = JSON.stringify(norm(raw)), b = JSON.stringify(norm(dd));
    return a === b ? null : "the wiki V3.04 reconstruction differs from DDragon 3.6.15 at calculator level";
}

function iconCheck() {
    const errors = [];
    const file = path.join(SOURCES, "icons.json");
    if (!fs.existsSync(file)) return ["data/sources/runes/icons.json missing"];
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [name, rec] of Object.entries(doc.icons || {})) {
        const img = path.join(ROOT, "images", "runes", name);
        if (!fs.existsSync(img)) { errors.push("images/runes/" + name + " missing"); continue; }
        const h = sha256(fs.readFileSync(img));
        if (h !== rec.sha256) errors.push(`images/runes/${name}: sha256 ${h}, icons.json says ${rec.sha256}`);
    }
    return errors;
}

function main(argv) {
    const ri = argv.indexOf("--research");
    const research = ri >= 0 ? argv[ri + 1] : null;
    if (!research) fail("usage: node tools/import-runes.js --research <scratchpad>\\patches [--check]");
    const check = argv.includes("--check");
    const outputs = plan(research);
    const errors = [];
    const v304 = v304Check(research);
    if (v304) errors.push(v304);
    errors.push(...iconCheck());
    let changed = 0;
    for (const o of outputs) {
        const old = fs.existsSync(o.file) ? fs.readFileSync(o.file, "utf8").split("\r\n").join("\n") : null;
        if (old === o.text) continue;
        if (check) { errors.push((old === null ? "missing " : "differs from the research: ") + relPath(o.file)); continue; }
        fs.mkdirSync(path.dirname(o.file), { recursive: true });
        fs.writeFileSync(o.file, o.text, "utf8");
        changed++;
        console.log("wrote " + relPath(o.file) + " (" + (Buffer.byteLength(o.text) / 1024).toFixed(1) + " KB)");
    }
    const bytes = outputs.reduce((n, o) => n + Buffer.byteLength(o.text), 0);
    console.log(`${outputs.length} source files, ${(bytes / 1024).toFixed(1)} KB; ${check ? "checked" : changed + " written"}.`);
    console.log("V3.04 reconstruction = DDragon 3.6.15 at calculator level: " + (v304 ? "NO" : "yes"));
    if (errors.length) {
        console.error("Import check failed:\n  " + errors.join("\n  "));
        process.exitCode = 1;
    }
}

try { main(process.argv.slice(2)); }
catch (e) { console.error(e.message); process.exitCode = 1; }
