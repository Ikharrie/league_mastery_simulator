#!/usr/bin/env node
// tools/import-reforged.js — copies the Runes Reforged research into the repo (DESIGN §1.3, §1.4, §3.2).
// One-shot and committed for provenance; not part of the build. Reads only local files.
//
// Usage: node tools/import-reforged.js --research <scratchpad>\patches [--reseed]
//
// Reads <research>/reforged/{listed_patches_data,effective_by_patch,changed_patches,noise_log,
// fandom_patch_dates,shard_eras}.json and <research>/raw/cdragon-game/*_perks.cdtb.bin.json.
// Writes:
//   data/sources/reforged/<patch>.json   123 per-patch sources (always rewritten)
//   data/sources/reforged/shard-eras.json the 7 stat-shard eras (always rewritten)
//   data/patches/noise/reforged.json      what the research ignored as noise (always rewritten)
//   data/patches/reforged.json            the listing (curation: written when missing, else only with --reseed)
//   data/patches/reforged-overrides.json  the overrides (curation: written when missing, else only with --reseed)
//
// The research grouped patches by patch number (V8.23 in "Season 8"). The listing is re-cut with
// the binding rule "a preseason patch belongs to the season that follows it" (seasons.json):
// a patch is listed when the research found a calculator-relevant change, or when it is the first
// or last Data Dragon patch of its season. That drops V10.25 and V12.23 (no change, no boundary)
// and adds V9.22, V10.22, V11.22, V12.21 and V12.22 (boundaries, no change; from
// effective_by_patch.json). The result must equal DESIGN §3.2 (build-reforged.js EXPECTED).
// After importing, run: node tools/build-reforged.js

"use strict";

var fs = require("fs");
var path = require("path");
var P = require("./lib/patches.js");
var B = require("./build-reforged.js");

var ROOT = path.resolve(__dirname, "..");
var PAGE = "reforged";

function fail(msg) { throw new Error("import-reforged: " + msg); }
function rel(file) { return path.relative(ROOT, file).split(path.sep).join("/"); }
function readJson(file) { return P.readJson(file); }
function same(a, b) { return P.stableStringify(a) === P.stableStringify(b); }

function parseArgs(argv) {
    var a = { research: null, reseed: false };
    for (var i = 0; i < argv.length; i++) {
        if (argv[i] === "--research") a.research = argv[++i];
        else if (argv[i] === "--reseed") a.reseed = true;
        else fail("unknown argument " + argv[i]);
    }
    if (!a.research) fail("usage: node tools/import-reforged.js --research <scratchpad>\\patches [--reseed]");
    return a;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

function ddragonUrl(ver) { return "https://ddragon.leagueoflegends.com/cdn/" + ver + "/data/en_US/runesReforged.json"; }
function cdragonUrls(branch) {
    var base = "https://raw.communitydragon.org/" + branch + "/plugins/rcp-be-lol-game-data/global/default/v1/";
    return [base + "perks.json", base + "perkstyles.json"];
}
function gameBinUrl(branch) { return "https://raw.communitydragon.org/" + branch + "/game/perks.cdtb.bin.json"; }
var RUNE_HISTORY = "https://leagueoflegends.fandom.com/wiki/Rune_(League_of_Legends) (Patch History)";
function wikiUrl(p) {
    p = P.parse(p);
    return p.major <= 14 ? "https://leagueoflegends.fandom.com/wiki/V" + p.major + "." + p.nums[1]
        : "https://wiki.leagueoflegends.com/en-us/" + P.officialName(p);
}

// Research `sources` strings -> URLs (the CDragon entry was "…perks.json (+perkstyles.json)").
function mapResearchSources(list, carriedFrom) {
    var out = [];
    (list || []).forEach(function(s){
        var m = /^(https:\/\/raw\.communitydragon\.org\/[^ ]+\/perks\.json) \(\+perkstyles\.json\)$/.exec(s);
        if (m) { out.push(m[1], m[1].replace(/perks\.json$/, "perkstyles.json")); return; }
        if (/^CommunityDragon branch .*MISSING/.test(s)) {
            if (carriedFrom) cdragonUrls(carriedFrom).forEach(function(u){ out.push(u); });
            return;
        }
        out.push(s);
    });
    return out.filter(function(s, i){ return out.indexOf(s) === i; });
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

function changeKind(line) {
    if (/^PATH BONUS/.test(line)) return "path-bonus";
    if (/^(STAT SHARDS|SHARD)\b/.test(line)) return "shards";
    if (/^(ADDED|REMOVED|MOVED|REORDER|SLOTS|RENAMED)\b/.test(line)) return "structure";
    if (/ (?:longDesc|shortDesc) \[/.test(line)) return "text";
    fail("unclassified change line: " + line);
}

function changeSources(kind, line, ver, cdBranch, recordSources) {
    var dd = ddragonUrl(ver), cd = cdBranch ? cdragonUrls(cdBranch) : [];
    if (kind === "path-bonus") return cd.slice().reverse();                 // perkstyles.json subStyleBonus -> perks.json
    if (kind === "shards") {
        var s = cd.slice().reverse().concat([RUNE_HISTORY]);
        recordSources.forEach(function(u){ if (/patch-notes|news\/game-updates/.test(u)) s.push(u); });
        return s;
    }
    if (/\(client text\)/.test(line)) return [dd].concat(cd.slice(0, 1));
    return [dd];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    var args = parseArgs(process.argv.slice(2));
    var R = path.resolve(args.research), RR = path.join(R, "reforged"), RAW = path.join(R, "raw");
    var listedData = readJson(path.join(RR, "listed_patches_data.json"));
    var eff = readJson(path.join(RR, "effective_by_patch.json"));
    var changed = readJson(path.join(RR, "changed_patches.json"));
    var noiseLog = readJson(path.join(RR, "noise_log.json"));
    var fandomDates = readJson(path.join(RR, "fandom_patch_dates.json"));
    var researchEras = readJson(path.join(RR, "shard_eras.json"));

    // 1. listed_patches_data.json is a subset of effective_by_patch.json.
    Object.keys(listedData).forEach(function(p){
        if (!same(listedData[p], eff[p])) fail("listed_patches_data.json " + p + " differs from effective_by_patch.json");
    });

    // 2. Re-cut the listing with the season rule.
    var researchBy = {};
    changed.forEach(function(c){ researchBy[P.parse(c.patch).key] = c; });
    var effPatches = Object.keys(eff).sort(P.compare);
    var listing = [];
    effPatches.forEach(function(p){
        var season = P.seasonOf(p);
        if (!season) fail("no season for " + p);
        var b = P.seasonBounds(season, PAGE);
        var first = P.equal(b.first, p), last = P.equal(b.last, p);
        var rc = researchBy[P.parse(p).key];
        var hasChange = !!(rc && (rc.reason === "change" || rc.also_changed));
        if (!hasChange && !first && !last) {
            if (rc) console.log("  dropped " + p + " (research: " + rc.reason + ", no change; not a boundary under the season rule)");
            return;
        }
        var base = first ? "season-start" : last ? "season-end" : "change";
        listing.push({ p: p, season: season, first: first, last: last, rc: rc, hasChange: hasChange,
                       reason: base === "change" ? "change" : base + (hasChange ? "+change" : "") });
    });
    var expected = [];
    Object.keys(B.EXPECTED).forEach(function(s){ B.EXPECTED[s].forEach(function(p){ expected.push(p); }); });
    var got = listing.map(function(x){ return P.parse(x.p).name; });
    if (got.join(" ") !== expected.join(" ")) fail("re-cut listing differs from DESIGN §3.2:\n  got      " + got.join(" ") + "\n  expected " + expected.join(" "));

    // 3. Sources per listed patch.
    var srcDir = path.join(ROOT, "data", "sources", "reforged");
    var written = [], kept = {};
    var records = [], sources = {};
    listing.forEach(function(x){
        var e = eff[x.p], name = P.parse(x.p).name;
        var missing = /^MISSING/.test(e.cdragon_branch || "");
        var carriedFrom = null;
        if (missing) {
            var m = /carried from (V[\d.]+)\)/.exec(e.cdragon_branch);
            if (!m) fail(x.p + ": cannot read " + e.cdragon_branch);
            carriedFrom = P.toDdragon(m[1]);
        }
        var cdBranch = missing ? null : e.cdragon_branch;
        var view = B.sourceViewOf({ paths: e.paths, overrides: e.overrides, unresolved: e.unresolved,
                                    ddRaw: e.dd_raw, bonus: e.bonus, shards: e.shards });
        var unresolvedIds = Object.keys(view.unresolved).sort().join(","), researchIds = Object.keys(e.unresolved).sort().join(",");
        if (unresolvedIds !== researchIds) fail(x.p + ": unresolved " + unresolvedIds + " != research " + researchIds);
        var textBranch = cdBranch || carriedFrom;
        var srcSources = [ddragonUrl(e.ddragon)];
        if (view.perkText || view.subStyleBonus || view.shards) cdragonUrls(textBranch).forEach(function(u){ srcSources.push(u); });
        var src = {
            patch: name,
            ddragon: e.ddragon,
            cdragonBranch: cdBranch,
            cdragonCarriedFrom: carriedFrom,
            perkText: view.perkText,
            subStyleBonus: view.subStyleBonus,
            shards: view.shards,
            unresolved: view.unresolved,
            catalogHash: view.catalogHash,
            sources: srcSources,
            research: listedData[x.p] ? "reforged/listed_patches_data.json" : "reforged/effective_by_patch.json"
        };
        if (missing) src.note = "CommunityDragon has no " + P.toDdragon(x.p) + " branch; the client texts, path bonus and shards are carried from "
            + carriedFrom + " (the research's rule: the Data Dragon text is unchanged, so the client resolved it the same way).";
        sources[name] = src;
        var file = path.join(srcDir, name + ".json");
        if (P.writeIfChanged(file, P.formatJson(src, { width: 160, indent: 1 }) + "\n")) written.push(rel(file));
        kept[name + ".json"] = true;

        // listing record
        var rc = x.rc;
        var date = rc && rc.date ? rc.date : fandomDates[x.p];
        var dateConfidence = null, dateNote = null;
        if (!date || /\?$/.test(date) || !/^\d{4}-\d\d-\d\d/.test(date)) {
            dateConfidence = "medium";
            date = String(date || "").replace(/\?$/, "");
            dateNote = "The fandom patch page has no release date; date from Riot's two-week patch schedule (research EXTRA_DATES).";
        }
        if (!/^\d{4}-\d\d-\d\d$/.test(date)) fail(x.p + ": no release date");
        var season = P.season(x.season);
        if (x.first && season.firstDate !== date) fail(x.p + ": date " + date + " != seasons.json firstDate " + season.firstDate);
        if (x.last && season.lastDate !== date) fail(x.p + ": date " + date + " != seasons.json lastDate " + season.lastDate);
        var recSources = rc ? mapResearchSources(rc.sources, carriedFrom) : [ddragonUrl(e.ddragon), wikiUrl(x.p)];
        var changes = [];
        if (x.hasChange) rc.changes.forEach(function(line){
            var kind = changeKind(line);
            changes.push({ text: line, kind: kind, sources: changeSources(kind, line, e.ddragon, textBranch, recSources), confidence: "high" });
        });
        var rec = {
            id: P.idFor(PAGE, x.p),
            patch: name,
            season: x.season,
            reason: x.reason,
            date: date
        };
        if (dateConfidence) { rec.dateConfidence = dateConfidence; rec.dateNote = dateNote; }
        rec.source = { ddragon: e.ddragon, cdragon: cdBranch };
        rec.shardEra = P.shardEraOf(x.p);
        rec.confidence = "high";
        rec.sources = recSources;
        rec.changes = changes;
        if (rc && rc.ui_flags && rc.ui_flags.length) rec.notes = rc.ui_flags.map(function(f){ return "UI: " + f; });
        records.push(rec);
    });
    // stale source files. Patches listed by hand in the curated listing (e.g.
    // V13.17, added for the Future's Market export fix) are not in the research
    // seed, so keep their sources unless --reseed rebuilds the listing too.
    var curated = {};
    var listingPath = path.join(ROOT, "data", "patches", "reforged.json");
    if (!args.reseed && fs.existsSync(listingPath)) {
        (JSON.parse(fs.readFileSync(listingPath, "utf8")).patches || []).forEach(function(r){ curated[r.patch + ".json"] = true; });
    }
    fs.readdirSync(srcDir).forEach(function(n){
        if (/^V.*\.json$/.test(n) && !kept[n] && !curated[n]) { fs.unlinkSync(path.join(srcDir, n)); written.push("data/sources/reforged/" + n + " (removed)"); }
    });

    // 4. Shard eras (for T7b's runes-reforged-data.js tables).
    var eraList = [];
    B.EXPECTED_SHARD_ERAS.forEach(function(def){
        if (!def[2]) return;
        var inEra = records.filter(function(r){ return r.shardEra === def[2]; });
        if (!inEra.length) fail("no listed patch in shard era " + def[2]);
        var lastSrc = sources[inEra[inEra.length - 1].patch];
        var re = researchEras.filter(function(r){ return P.equal(r.from, def[0]); })[0];
        if (!re) fail("research shard_eras.json has no era starting " + def[0]);
        var shards = lastSrc.shards;
        eraList.push({
            id: def[2], from: def[0], to: def[1],
            firstListed: inEra[0].patch, lastListed: inEra[inEra.length - 1].patch,
            change: re.change || "stat shards added (replace the path-pair bonus)",
            textFrom: lastSrc.patch,
            rows: shards.rows.map(function(row){
                return { label: row.label, shards: row.perks.map(function(id){
                    var q = shards.perks[String(id)];
                    return { id: id, name: q.name, desc: B.stripText(q.desc), numbers: B.numbersIn(q.desc), icon: q.icon };
                }) };
            }),
            sources: cdragonUrls(lastSrc.cdragonBranch || lastSrc.cdragonCarriedFrom).reverse().concat(re.sources)
        });
    });
    var shardFile = path.join(srcDir, "shard-eras.json");
    var shardDoc = {
        _comment: [
            "Runes Reforged stat-shard eras (DESIGN §3.2), as the client had them: CommunityDragon perkstyles.json kStatMod slots + perks.json texts of the era's last listed patch.",
            "Generated by tools/import-reforged.js from the per-patch sources; build-reforged.js (F1) checks that every listed patch of an era has the same rows and numbers.",
            "desc is the client text without markup; numbers are the values in it. Wording-only fixes inside an era (V10.24 dropped '(based on level)' from +8 Ability Haste) are noise."
        ],
        eras: eraList
    };
    if (P.writeIfChanged(shardFile, P.formatJson(shardDoc, { width: 160, indent: 1 }) + "\n")) written.push(rel(shardFile));

    // 5. Noise log.
    var noiseFile = path.join(ROOT, "data", "patches", "noise", "reforged.json");
    var noiseDoc = {
        _comment: [
            "Runes Reforged: every Data Dragon / CommunityDragon difference the research classified as noise, and the rule that dropped it (DESIGN §1.3).",
            "Imported by tools/import-reforged.js from the research's noise_log.json (finalize.py). rule = markup/format, @placeholder@ <-> value, lore quote, spelling fix, icon path, internal key or name, or manual: <reason>.",
            "build-reforged.js --audit (C3) allows an unlisted patch to differ from its predecessor only when it has an entry here."
        ],
        page: PAGE,
        source: "research reforged/noise_log.json",
        items: noiseLog.map(function(n){ return { patch: P.parse(n.patch).name, rule: n.rule, what: n.what }; })
    };
    if (P.writeIfChanged(noiseFile, P.formatJson(noiseDoc, { width: 200, indent: 1 }) + "\n")) written.push(rel(noiseFile));

    // 6. Overrides (curation).
    var bins = effPatches.filter(function(p){ return P.compare(p, "V25.20") >= 0; });
    var override = {
        id: "rro-001", kind: "export-fix", page: PAGE, from: "V25.20", to: null,
        target: "8360", field: "longDesc", op: "fill-placeholder", placeholder: "@f3@", value: "270",
        reason: "Unsealed Spellbook: from 15.20 Data Dragon and the client's perks.json both print 'initial swap cooldown is @f3@ seconds' (the game script fills it in). "
            + "The value is the perk's ShardRechargeMinutes, 4.5 min = 270 s, in every branch 15.19-16.19; Data Dragon 15.19.1 still printed '4.5 mins'. Same value, so the switch is noise (V25.20 is not listed).",
        sources: [gameBinUrl("15.20") + " (mPerkId 8360 mEffectAmount.ShardRechargeMinutes 4.5)",
                  gameBinUrl(P.toDdragon(P.livePatch())) + " (4.5)",
                  ddragonUrl("15.19.1") + " (8360 longDesc: 'initial swap cooldown is at 4.5 mins')"],
        verify: { cdragonGame: "perks.cdtb.bin.json", perkId: 8360, field: "ShardRechargeMinutes", multiply: 60 },
        confidence: "high"
    };
    var v = B.verifyOverrideValue(RAW, override, bins);
    if (v.problems.length) fail(v.problems.join("; "));
    if (!v.checked.length) fail("rro-001: no CommunityDragon game data in " + path.join(RAW, "cdragon-game"));
    var overridesText = "[\n" + [override].map(function(o){ return " " + JSON.stringify(o); }).join(",\n") + "\n]\n";

    // 7. Listing (curation).
    var listingDoc = {
        _comment: [
            "Runes Reforged: the listed patches of the patch dropdown (DESIGN §3.2), chronological. Seeded by tools/import-reforged.js from the research",
            "(changed_patches.json) and re-cut with the season rule: a preseason patch belongs to the season that follows it. Hand-maintained afterwards;",
            "the importer only overwrites it with --reseed. Per record: id (rr-v<major>-<minor>, live numbering), patch (Riot's official name), season,",
            "reason (season-start | season-start+change | change | season-end | season-end+change), date (release; dateConfidence when not exact),",
            "source.ddragon (the Data Dragon build the page fetches), source.cdragon (CommunityDragon branch of the client texts; null = carried, see the",
            "source file), shardEra (runes-reforged-data.js table), confidence, sources (for the reason), changes [{text, kind, sources, confidence}]",
            "against the previous listed patch, notes (UI observations). Labels: tools/lib/patches.js labelFor; data/file/hash: data/reforged/manifest.json."
        ],
        page: PAGE,
        patches: records
    };
    var listingText = P.formatJson(listingDoc, { width: 160, indent: 1 }) + "\n";

    var curated = [
        [path.join(ROOT, "data", "patches", "reforged.json"), listingText],
        [path.join(ROOT, "data", "patches", "reforged-overrides.json"), overridesText]
    ];
    var keptCuration = [];
    curated.forEach(function(c){
        var old = null;
        try { old = fs.readFileSync(c[0], "utf8"); } catch (e) { /* new */ }
        if (old !== null && old.split("\r\n").join("\n") !== c[1] && !args.reseed) { keptCuration.push(rel(c[0])); return; }
        if (P.writeIfChanged(c[0], c[1])) written.push(rel(c[0]));
    });

    console.log("import-reforged: " + records.length + " listed patches ("
        + Object.keys(B.EXPECTED).map(function(s){ return s + " " + B.EXPECTED[s].length; }).join(", ") + ")");
    console.log("  " + records.filter(function(r){ return /change$/.test(r.reason); }).length + " with a change, "
        + records.filter(function(r){ return !/change$/.test(r.reason); }).length + " boundaries without");
    console.log("  added boundaries: " + listing.filter(function(x){ return !x.rc; }).map(function(x){ return x.p; }).join(", "));
    console.log("  rro-001 (8360 @f3@ = 270 s) verified in " + v.checked.length + " CommunityDragon game-data branches: " + v.checked.join(", "));
    console.log("  " + noiseLog.length + " noise items, " + eraList.length + " shard eras");
    if (written.length) { console.log("  wrote " + written.length + " file(s)"); }
    else console.log("  everything up to date");
    keptCuration.forEach(function(f){ console.log("  kept hand-edited " + f + " (differs from the research seed; pass --reseed to overwrite)"); });
    console.log("next: node tools/build-reforged.js");
}

try { main(); }
catch (e) { console.error(e && e.stack || e); process.exit(1); }
