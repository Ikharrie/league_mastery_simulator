#!/usr/bin/env node
// tools/check-patch-links.js — the patch-notes links of every listed patch:
// data/patches/notes-links.json. A NETWORK tool, run on demand; it is not
// part of tools/build-all.js (the build never touches the network).
//
// For each distinct patch of the three listings (data/patches/masteries.json,
// runes.json, reforged.json; a patch on two pages appears once):
//   official          Riot's own patch notes page if it is still live: a
//                     www.leagueoflegends.com/en-us/news/game-updates/... URL
//                     that answers 200 itself (no redirect) with a page title
//                     naming the patch and "notes".
//   officialArchived  only when `official` is null: a web.archive.org capture
//                     of the original Riot page (2009-2012 forum threads, the
//                     2013-2019 na.leagueoflegends.com news articles). The
//                     exact capture must answer 200 and name the patch.
//   wiki              wiki.leagueoflegends.com/en-us/<page>: the wiki API must
//                     know the page under exactly that title (not a redirect)
//                     and the page itself must answer 200 with that title.
//                     The wiki answers non-browser clients with a Cloudflare
//                     challenge (403 / 503); then the API answer stands and
//                     the link is reported as "API-verified only (page fetch
//                     gated by Cloudflare)", not as a verified page. Nothing
//                     tries to get past the gate.
//   checked           the date of the run that verified the entry.
//   reason            optional, hand-written: why a link stays null (needed
//                     when wiki is null, or official and officialArchived
//                     both are; tools/check-patches.js N3). --discover keeps it.
// A URL is only ever written after it verified; anything else is null.
//
// Usage (from the repo root)
//   node tools/check-patch-links.js [--only V4.5,V8.6] [--json <file>] [--quiet]
//        verify: re-check every non-null URL of notes-links.json and that the
//        file has exactly one entry per listed patch. Writes nothing.
//   node tools/check-patch-links.js --discover [--write] [--only ...] [--date YYYY-MM-DD]
//        look the links up again and verify them; --write updates
//        notes-links.json (entries outside --only are kept as they are).
//   --delay <ms>     minimum gap between two requests to one host (default
//                    1100; web.archive.org at least 2500)
//   --json <file>    a detailed report: per patch every candidate tried and why
//                    it was accepted or rejected
//
// Where candidates come from (discover):
//   * the wiki's own infobox ("|Related =" of the patch page, read through the
//     wiki API): Riot's live URL, or the Wayback capture the wiki cites;
//   * Riot's en-us sitemap (https://www.leagueoflegends.com/en-us/sitemap_loc.xml),
//     matched against the slugs Riot used per era (patch-4-5-notes,
//     lol-patch-14-13-notes, patch-25-s1-1-notes, patch-2025-s1-3-notes,
//     league-of-legends-patch-26-9-notes); the main slug is probed directly
//     when the sitemap does not list it;
//   * the Wayback CDX index (web.archive.org/cdx/search/cdx) for the original
//     Riot URL: the earliest 200 text/html captures, tried in order; when the
//     index is down (502-504), the capture nearest the patch date (Wayback's
//     redirect names it), verified like any other;
//   * Wayback URLs of the listing's own research sources.
// A forum thread that never writes its version ("End of Season 2 Patch
// Notes", V1.0.0.151) passes when its title is the one the wiki's infobox
// gives that patch's notes.
//
// Politeness: one request at a time, at least --delay ms between requests to
// one host, a User-Agent that names the tool. A 429 (or a 503 with
// Retry-After) waits as long as the server asks, once; a second one aborts
// the run (exit 3) and writes nothing. A 502-504 without Retry-After backs
// off 30 s and is retried once. Only these hosts are contacted:
// www.leagueoflegends.com, web.archive.org, wiki.leagueoflegends.com.
//
// Exit code: 0 = every entry verified; 1 = a URL failed, an entry is missing
// or an entry names a patch that is not listed; 3 = the run was blocked.

"use strict";

const fs = require("fs");
const path = require("path");
const P = require("./lib/patches");

const ROOT = path.resolve(__dirname, "..");
const OUT_REL = "data/patches/notes-links.json";
const OUT = path.join(ROOT, OUT_REL);
const UA = "league_mastery_simulator-check-patch-links/1.0 (fan-made historical LoL calculator; https://github.com/Ikharrie/league_mastery_simulator)";
const RIOT_GU = "https://www.leagueoflegends.com/en-us/news/game-updates/";
const SITEMAP = "https://www.leagueoflegends.com/en-us/sitemap_loc.xml";
const WIKI = "https://wiki.leagueoflegends.com/en-us/";
const WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php";
const WAYBACK = "https://web.archive.org/web/";
const CDX = "https://web.archive.org/cdx/search/cdx";
const ALLOWED = new Set(["www.leagueoflegends.com", "web.archive.org", "wiki.leagueoflegends.com"]);

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const a = { discover: false, write: false, only: null, date: null, json: null, quiet: false, delay: 1100 };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const val = function () { if (i + 1 >= argv.length) usage(k + " needs a value"); return argv[++i]; };
        if (k === "--discover") a.discover = true;
        else if (k === "--write") a.write = true;
        else if (k === "--only") a.only = val().split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        else if (k === "--date") a.date = val();
        else if (k === "--json") a.json = path.resolve(val());
        else if (k === "--delay") a.delay = Math.max(1000, parseInt(val(), 10) || 0);
        else if (k === "--quiet") a.quiet = true;
        else if (k === "--help" || k === "-h") usage(null);
        else usage("unknown argument " + k);
    }
    if (a.write && !a.discover) usage("--write needs --discover (verify mode writes nothing)");
    if (a.date && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) usage("--date is YYYY-MM-DD");
    if (!a.date) a.date = new Date().toISOString().slice(0, 10);
    return a;
}

function usage(msg) {
    if (msg) console.error("check-patch-links: " + msg);
    console.error("usage: node tools/check-patch-links.js [--discover [--write]] [--only V4.5,...] [--date YYYY-MM-DD] [--json <file>] [--delay <ms>] [--quiet]");
    process.exit(msg ? 1 : 0);
}

const args = parseArgs(process.argv.slice(2));
const log = function () { if (!args.quiet) console.log.apply(console, arguments); };

// ---------------------------------------------------------------------------
// HTTP: sequential, throttled per host, 429-aware
// ---------------------------------------------------------------------------

class Blocked extends Error {}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
const lastAt = new Map();
let requests = 0;

function gapFor(host) { return host === "web.archive.org" ? Math.max(2500, args.delay) : args.delay; }

async function throttle(host) {
    const wait = (lastAt.get(host) || 0) + gapFor(host) - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt.set(host, Date.now());
}

function retryAfterSeconds(h) {
    if (!h) return null;
    if (/^\d+$/.test(h.trim())) return parseInt(h, 10);
    const t = Date.parse(h);
    return isNaN(t) ? null : Math.max(0, Math.ceil((t - Date.now()) / 1000));
}

// One request, no redirect following. -> {status, location, text, type, error?}
async function request(url) {
    const host = new URL(url).hostname;
    if (!ALLOWED.has(host)) throw new Error("host not allowed: " + host + " (" + url + ")");
    let waited = false, netRetry = false, overloadRetry = false;
    for (;;) {
        await throttle(host);
        requests++;
        let r;
        try {
            r = await fetch(url, {
                redirect: "manual",
                headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8" },
                signal: AbortSignal.timeout(120000)
            });
        } catch (e) {
            if (!netRetry) { netRetry = true; await sleep(5000); continue; }
            return { status: 0, location: null, text: "", type: "", error: String(e && e.cause ? e.cause.code || e.cause.message || e.message : e) };
        }
        if (r.status === 429 || (r.status === 503 && r.headers.get("retry-after"))) {
            const ra = retryAfterSeconds(r.headers.get("retry-after"));
            try { await r.arrayBuffer(); } catch (e) { /* drained */ }
            if (waited || (ra !== null && ra > 900))
                throw new Blocked(host + " answered " + r.status + " (Retry-After " + ra + ") to " + url + ": stopping, as asked");
            waited = true;
            const s = ra === null ? 60 : ra;
            console.error("  " + host + " answered " + r.status + ": waiting " + s + " s as asked, then one retry");
            await sleep(s * 1000);
            continue;
        }
        // An overloaded server (502-504 without Retry-After): back off 30 s, retry once.
        if (r.status >= 502 && r.status <= 504 && !overloadRetry) {
            overloadRetry = true;
            try { await r.arrayBuffer(); } catch (e) { /* drained */ }
            console.error("  " + host + " answered " + r.status + ": backing off 30 s, then one retry");
            await sleep(30000);
            continue;
        }
        let text = "";
        if (r.status === 200) text = await r.text();
        else { try { await r.arrayBuffer(); } catch (e) { /* drained */ } }
        return { status: r.status, location: r.headers.get("location"), text: text, type: r.headers.get("content-type") || "" };
    }
}

// Follows redirects (each hop throttled). -> request() result + {url: final, chain}
async function get(url) {
    const chain = [];
    let cur = url;
    for (let hop = 0; hop < 8; hop++) {
        if (!ALLOWED.has(new URL(cur).hostname)) return { status: -1, url: cur, chain: chain, text: "", error: "redirected off the allowed hosts to " + cur };
        const r = await request(cur);
        chain.push(r.status + " " + cur);
        if (r.status >= 300 && r.status < 400 && r.location) { cur = new URL(r.location, cur).href; continue; }
        r.url = cur; r.chain = chain;
        return r;
    }
    return { status: -1, url: cur, chain: chain, text: "", error: "too many redirects" };
}

// ---------------------------------------------------------------------------
// Listed patches
// ---------------------------------------------------------------------------

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }

function listedPatches() {
    const by = new Map();
    P.PAGES.forEach(function (page) {
        readJson("data/patches/" + page + ".json").patches.forEach(function (rec) {
            let e = by.get(rec.patch);
            if (!e) by.set(rec.patch, e = { patch: rec.patch, p: P.parse(rec.patch), date: rec.date, pages: [], sources: [] });
            e.pages.push(page);
            const urls = [].concat(rec.sources || []);
            (rec.changes || []).concat(rec.notes || []).forEach(function (c) { (c.sources || []).forEach(function (s) { urls.push(s); }); });
            urls.forEach(function (s) { e.sources.push(String(s).split(" ")[0]); });
        });
    });
    return Array.from(by.values()).sort(function (a, b) { return P.compare(a.p, b.p); });
}

// Link era of a patch (where Riot published its notes at the time).
function linkEra(p) {
    if (p.major <= 1) return "2009-2012 Riot forums (V1.0.0.x)";
    if (p.major < 9 || (p.major === 9 && p.nums[1] < 18)) return "2013-2019 old Riot site (V3.04-V9.17)";
    return "2019+ current Riot site (V9.18+)";
}

// ---------------------------------------------------------------------------
// Patch matching in page titles
// ---------------------------------------------------------------------------

function versionRe(p) {
    if (p.major <= 1) return new RegExp("1\\.0\\.0\\." + p.nums[3] + "(?!\\d)");
    if (p.split) return new RegExp("25\\.S1\\." + p.nums[1] + "(?!\\d)", "i");
    return new RegExp("(^|[^\\d.])" + p.major + "\\.0?" + p.nums[1] + "(?![\\d])");
}

function htmlTitle(text) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
    return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}
function ogTitle(text) {
    const m = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(text)
        || /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i.exec(text);
    return m ? decodeEntities(m[1]).trim() : "";
}
function h1(text) {
    const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text);
    return m ? decodeEntities(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() : "";
}
function decodeEntities(s) {
    return s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'");
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

// Riot live page: the URL itself answers 200 (no redirect) on the en-us
// game-updates path, and its title names the patch and "notes".
async function verifyOfficial(url, p) {
    if (url.indexOf(RIOT_GU) !== 0) return { ok: false, why: "not an en-us game-updates URL" };
    const r = await request(url);
    if (r.status !== 200) return { ok: false, why: "HTTP " + r.status + (r.location ? " -> " + r.location : "") + (r.error ? " " + r.error : "") };
    const titles = [htmlTitle(r.text), ogTitle(r.text)].filter(Boolean);
    const re = versionRe(p);
    const hit = titles.find(function (t) { return re.test(t) && /notes/i.test(t); });
    if (!hit) return { ok: false, why: "200 but the title does not name the patch: " + JSON.stringify(titles) };
    if (r.text.length < 20000) return { ok: false, why: "200 but only " + r.text.length + " bytes" };
    return { ok: true, why: "200 " + JSON.stringify(hit) + " (" + r.text.length + " bytes)" };
}

const FORUM_DEAD = /Invalid Thread specified|No Thread specified|This thread has been (?:deleted|removed)|You are not logged in or you do not have permission/i;

// Wayback capture: the exact capture answers 200 (Wayback redirects to the
// nearest capture when the timestamp is not one) and names the patch: a
// news article by its title ("Patch 4.5 notes"); a forum thread by the patch
// version anywhere in the thread, or by a title equal to the one the wiki's
// infobox gives this patch's notes ("End of Season 2 Patch Notes": Riot did
// not always write the version). opts.labels: those infobox link labels.
// opts.sameCapture (discover): a redirect to the same timestamp under another
// spelling of the URL (https, trailing slash) is followed once and the
// result's `url` is that spelling.
async function verifyArchived(url, p, opts) {
    opts = opts || {};
    const m = /^https:\/\/web\.archive\.org\/web\/(\d{14})\/(https?:\/\/.+)$/.exec(url);
    if (!m) return { ok: false, why: "not a web.archive.org/web/<14-digit timestamp>/<url> capture" };
    const orig = m[2];
    let host;
    try { host = new URL(orig).hostname; } catch (e) { return { ok: false, why: "bad original URL" }; }
    if (!/(^|\.)leagueoflegends\.com$/.test(host)) return { ok: false, why: "not a Riot page: " + host };
    let r = await request(url);
    if (opts.sameCapture && r.status >= 300 && r.status < 400 && r.location) {
        const loc = new URL(r.location, url).href;
        const lm = /^https:\/\/web\.archive\.org\/web\/(\d{14})\/(https?:\/\/.+)$/.exec(loc);
        if (lm && lm[1] === m[1] && lm[2] !== orig) {
            const v = await verifyArchived(loc, p, { labels: opts.labels });
            if (v.ok) v.why += " (same capture, URL as Wayback stores it)";
            return v;
        }
    }
    if (r.status !== 200) return { ok: false, why: "HTTP " + r.status + (r.location ? " -> " + r.location : "") + (r.error ? " " + r.error : "") };
    const re = versionRe(p);
    const title = htmlTitle(r.text), head = h1(r.text);
    if (/showthread\.php/.test(orig)) {
        if (FORUM_DEAD.test(r.text)) return { ok: false, why: "capture of a dead or locked thread: " + JSON.stringify(title) };
        const body = r.text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
        if (body.length < 3000) return { ok: false, why: "thread capture too short (" + body.length + ")" };
        const norm = function (t) { return t.toLowerCase().replace(/\s+/g, " ").trim(); };
        const threadTitle = norm(title.replace(/\s+-\s+League of Legends Community\s*$/i, ""));
        const label = (opts.labels || []).find(function (l) { return l && norm(l) === threadTitle; });
        if (re.test(title) || re.test(body)) return { ok: true, why: "200 thread " + JSON.stringify(title) + " names " + p.label, url: url };
        if (label) return { ok: true, why: "200 thread " + JSON.stringify(title) + " = the wiki's link for " + p.label, url: url };
        return { ok: false, why: "thread capture never names " + p.label + " and is not the thread the wiki cites: " + JSON.stringify(title) };
    }
    const named = [title, head].find(function (t) { return re.test(t) && /notes/i.test(t); });
    if (!named) return { ok: false, why: "capture title does not name the patch notes: " + JSON.stringify([title, head]) };
    if (r.text.length < 15000) return { ok: false, why: "capture is only " + r.text.length + " bytes" };
    return { ok: true, why: "200 " + JSON.stringify(named) + " (" + r.text.length + " bytes)", url: url };
}

function wikiTitleOf(url) {
    if (url.indexOf(WIKI) !== 0) return null;
    try { return decodeURIComponent(url.slice(WIKI.length)).replace(/_/g, " "); } catch (e) { return null; }
}
function wikiUrlOf(title) { return WIKI + encodeURI(title.replace(/ /g, "_")); }

// Wiki API, 50 titles a request: {title -> {exists, redirect, content?}}
async function wikiPages(titles, withContent) {
    const out = new Map();
    for (let i = 0; i < titles.length; i += 50) {
        const batch = titles.slice(i, i + 50);
        let cont = {};
        for (;;) {
            const q = new URLSearchParams(Object.assign({
                action: "query", format: "json", formatversion: "2", prop: withContent ? "info|revisions" : "info",
                titles: batch.join("|")
            }, withContent ? { rvprop: "content", rvslots: "main" } : {}, cont));
            const r = await request(WIKI_API + "?" + q.toString());
            if (r.status !== 200) throw new Error("wiki API answered " + r.status);
            const j = JSON.parse(r.text);
            const norm = new Map(((j.query && j.query.normalized) || []).map(function (n) { return [n.to, n.from]; }));
            ((j.query && j.query.pages) || []).forEach(function (pg) {
                const asked = norm.get(pg.title) || pg.title;
                const prev = out.get(asked) || {};
                const content = pg.revisions && pg.revisions[0] && pg.revisions[0].slots ? pg.revisions[0].slots.main.content : prev.content;
                out.set(asked, { title: pg.title, exists: !pg.missing && !pg.invalid, redirect: !!pg.redirect, content: content });
            });
            if (!j.continue) break;
            cont = j.continue;
        }
    }
    return out;
}

async function verifyWiki(url, p, api) {
    const title = wikiTitleOf(url);
    if (!title) return { ok: false, why: "not a wiki.leagueoflegends.com/en-us/ URL" };
    if (title !== p.label) return { ok: false, why: "page title " + JSON.stringify(title) + " is not the patch label " + JSON.stringify(p.label) };
    const info = api.get(title);
    if (!info || !info.exists) return { ok: false, why: "the wiki API does not know " + JSON.stringify(title) };
    if (info.title !== title) return { ok: false, why: "the wiki API normalises it to " + JSON.stringify(info.title) };
    if (info.redirect) return { ok: false, why: JSON.stringify(title) + " is a redirect" };
    const r = await request(url);
    if (r.status === 200) {
        const t = htmlTitle(r.text);
        if (t === title || t.indexOf(title + " ") === 0) return { ok: true, why: "API: page exists; 200 " + JSON.stringify(t) };
        return { ok: false, why: "200 but the page title is " + JSON.stringify(t) };
    }
    // A bot gate (403 / challenge) on the page itself: the API answer stands,
    // reported as such (gated), never as a verified page.
    if (r.status === 403 || r.status === 503) return { ok: true, gated: true, why: "API-verified only: the wiki API knows the page; the page fetch is gated by Cloudflare (HTTP " + r.status + ")" };
    return { ok: false, why: "API knows the page but it answered HTTP " + r.status + (r.location ? " -> " + r.location : "") };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function riotSlugs(p) {
    if (p.major <= 1) return [];
    const M = p.major, m = p.nums[1], mm = m < 10 ? "0" + m : String(m);
    if (p.split) return ["patch-25-s1-" + m + "-notes", "patch-2025-s1-" + m + "-notes"];
    const minors = M >= 25 ? [mm, String(m)] : [String(m)];
    const out = [];
    minors.forEach(function (x) {
        out.push("patch-" + M + "-" + x + "-notes", "lol-patch-" + M + "-" + x + "-notes", "league-of-legends-patch-" + M + "-" + x + "-notes");
    });
    return Array.from(new Set(out));
}

// The old (2013-2019) news URL: patch-45-notes, patch-304-notes, patch-810-notes.
function oldNewsUrl(p) {
    if (p.major <= 1 || p.major > 9) return null;
    const m = p.parts[1];
    return "http://na.leagueoflegends.com/en/news/game-updates/patch/patch-" + p.major + m + "-notes";
}

// "|Related =" of the infobox: [{url, label}] in order.
function relatedLinks(content) {
    if (!content) return [];
    const m = /\|\s*Related\s*=([\s\S]*?)(?:\n\s*\||\n\}\})/.exec(content);
    if (!m) return [];
    const out = [];
    const re = /\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]*))?\]/g;
    let x;
    while ((x = re.exec(m[1]))) out.push({ url: x[1], label: (x[2] || "").trim() });
    return out;
}

function parseWayback(u) {
    const m = /^https?:\/\/web\.archive\.org\/web\/(\d*)[a-z_]*\/(https?:\/\/.+)$/.exec(u);
    return m ? { ts: m[1], orig: m[2] } : null;
}

function isRiot(u) {
    try { return /(^|\.)leagueoflegends\.com$/.test(new URL(u).hostname); } catch (e) { return false; }
}

function normaliseRiotLive(u) {
    const m = /^https?:\/\/(?:www|na)\.leagueoflegends\.com\/en-us\/news\/game-updates\/([^/?#]+)\/?$/.exec(u);
    return m ? RIOT_GU + m[1] + "/" : null;
}

async function cdxCaptures(orig) {
    const q = new URLSearchParams({ url: orig.replace(/^https?:\/\//, ""), output: "json", fl: "timestamp,original,statuscode,mimetype", limit: "12" });
    const r = await request(CDX + "?" + q.toString() + "&filter=statuscode:200&filter=mimetype:text/html");
    if (r.status !== 200) return { error: "CDX HTTP " + r.status, rows: [] };
    let rows = [];
    try { rows = JSON.parse(r.text || "[]").slice(1); } catch (e) { return { error: "CDX: bad JSON", rows: [] }; }
    return { rows: rows.map(function (row) { return { ts: row[0], orig: row[1] }; }) };
}

function cleanOrig(capturedOrig, asked) {
    // Prefer the URL as asked (no :80, no stray "?") when the capture is of it.
    const strip = function (u) { return u.replace(/^https?:\/\//, "").replace(/:80\//, "/").replace(/\?$/, "").replace(/\/$/, ""); };
    return strip(capturedOrig) === strip(asked) ? asked : capturedOrig;
}

async function discoverOne(e, sitemap, wiki, report) {
    const p = e.p, rep = report[e.patch] = { pages: e.pages, era: linkEra(p), official: [], archived: [], wiki: [] };
    const res = { official: null, officialArchived: null, wiki: null };
    const info = wiki.get(e.patch);
    const related = relatedLinks(info && info.content);

    // wiki
    const wurl = wikiUrlOf(e.patch);
    const w = await verifyWiki(wurl, p, wiki);
    rep.wiki.push({ url: wurl, ok: w.ok, why: w.why });
    if (w.ok) res.wiki = wurl;

    // official (live)
    const cands = [];
    const slugs = riotSlugs(p);
    slugs.forEach(function (s) { if (sitemap.has(RIOT_GU + s + "/")) cands.push({ url: RIOT_GU + s + "/", from: "sitemap" }); });
    related.forEach(function (l) { const n = normaliseRiotLive(l.url); if (n) cands.push({ url: n, from: "wiki infobox" }); });
    if (slugs.length) cands.push({ url: RIOT_GU + slugs[0] + "/", from: "slug probe" });
    const seen = new Set();
    for (const c of cands) {
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        const v = await verifyOfficial(c.url, p);
        rep.official.push({ url: c.url, from: c.from, ok: v.ok, why: v.why });
        if (v.ok) { res.official = c.url; break; }
    }
    if (res.official) return res;

    // archived original Riot page
    const origs = [];
    // Only the wiki's own citation brings a fixed capture time (tried first);
    // everything else goes through the CDX index, earliest capture first.
    const keyOf = function (u) { return u.replace(/^https?:\/\//, "").replace(/:80\//, "/").replace(/\/$/, ""); };
    const addOrig = function (orig, ts, from) {
        if (!orig || !isRiot(orig)) return;
        const k = keyOf(orig);
        const have = origs.find(function (o) { return o.key === k; });
        if (have) { if (ts && !have.ts) have.ts = ts; return; }
        origs.push({ key: k, orig: orig, ts: ts || null, from: from });
    };
    addOrig(oldNewsUrl(p), null, "Riot's 2013-2019 URL pattern");
    if (related.length) {
        const wb = parseWayback(related[0].url);
        const label = "wiki infobox (" + (related[0].label || "first link") + ")";
        if (wb) addOrig(wb.orig, /^\d{14}$/.test(wb.ts) ? wb.ts : null, label);
        else if (isRiot(related[0].url) && !normaliseRiotLive(related[0].url)) addOrig(related[0].url, null, label);
    }
    // The listing's research sources: a Wayback copy of this patch's notes.
    const oldKey = oldNewsUrl(p) && keyOf(oldNewsUrl(p));
    e.sources.forEach(function (s) {
        const wb = parseWayback(s);
        if (wb && oldKey && keyOf(wb.orig).replace(/^[a-z]+\./, "na.") === oldKey) addOrig(wb.orig, null, "listing source");
    });
    const labels = related.map(function (l) { return l.label; });
    const tryCapture = async function (url, from) {
        const v = await verifyArchived(url, p, { labels: labels, sameCapture: true });
        rep.archived.push({ url: v.url || url, from: from, ok: v.ok, why: v.why });
        if (v.ok) res.officialArchived = v.url || url;
        return v.ok;
    };
    for (const o of origs) {
        const tried = new Set();
        if (o.ts) {
            tried.add(o.ts);
            if (await tryCapture(WAYBACK + o.ts + "/" + o.orig, o.from)) return res;
        }
        let cdx = await cdxCaptures(o.orig);
        if (!cdx.error && !cdx.rows.length && !/\/$/.test(o.orig) && !/\?/.test(o.orig)) {
            rep.archived.push({ url: o.orig, from: o.from + " / CDX", ok: false, why: "no 200 text/html capture; trying the trailing-slash spelling" });
            cdx = await cdxCaptures(o.orig + "/");
        }
        if (cdx.error) rep.archived.push({ url: o.orig, from: o.from + " / CDX", ok: false, why: cdx.error });
        if (!cdx.rows.length && !cdx.error) rep.archived.push({ url: o.orig, from: o.from + " / CDX", ok: false, why: "no 200 text/html capture" });
        let attempts = 0;
        for (const row of cdx.rows) {
            if (tried.has(row.ts) || attempts >= 3) continue;
            tried.add(row.ts);
            attempts++;
            if (await tryCapture(WAYBACK + row.ts + "/" + cleanOrig(row.orig, o.orig), o.from + " / CDX")) return res;
        }
        // The index is unavailable: ask Wayback for the capture nearest the
        // patch date (a redirect names its timestamp), then verify that capture.
        if (cdx.error) {
            const near = await request(WAYBACK + e.date.replace(/-/g, "") + "000000/" + o.orig);
            const loc = near.location ? new URL(near.location, WAYBACK).href : null;
            const lm = loc && /^https:\/\/web\.archive\.org\/web\/(\d{14})\/(https?:\/\/.+)$/.exec(loc);
            if (near.status === 200) rep.archived.push({ url: o.orig, from: o.from + " / nearest capture", ok: false, why: "200 without a capture timestamp" });
            else if (lm && !tried.has(lm[1])) {
                tried.add(lm[1]);
                if (await tryCapture(loc, o.from + " / nearest capture")) return res;
            } else rep.archived.push({ url: o.orig, from: o.from + " / nearest capture", ok: false, why: "HTTP " + near.status + (loc ? " -> " + loc : "") });
        }
    }
    return res;
}

async function loadSitemap() {
    const r = await request(SITEMAP);
    if (r.status !== 200) throw new Error("Riot sitemap answered " + r.status);
    const set = new Set();
    const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
    let m;
    while ((m = re.exec(r.text))) set.add(m[1].replace(/\/?$/, "/"));
    return set;
}

// ---------------------------------------------------------------------------
// Verify the committed file
// ---------------------------------------------------------------------------

async function verifyOne(e, entry, wiki, report) {
    const rep = report[e.patch] = { pages: e.pages, era: linkEra(e.p), official: [], archived: [], wiki: [] };
    const fails = [];
    const keys = Object.keys(entry).sort().join(",");
    if (keys !== "checked,official,officialArchived,wiki") fails.push("fields are " + keys);
    if (entry.official && entry.officialArchived) fails.push("officialArchived is only for patches without a live official page");
    if (entry.official) {
        const v = await verifyOfficial(entry.official, e.p);
        rep.official.push({ url: entry.official, ok: v.ok, why: v.why });
        if (!v.ok) fails.push("official " + entry.official + ": " + v.why);
    }
    if (entry.officialArchived) {
        const info = wiki.get(e.patch);
        const labels = relatedLinks(info && info.content).map(function (l) { return l.label; });
        const v = await verifyArchived(entry.officialArchived, e.p, { labels: labels });
        rep.archived.push({ url: entry.officialArchived, ok: v.ok, why: v.why });
        if (!v.ok) fails.push("officialArchived " + entry.officialArchived + ": " + v.why);
    }
    if (entry.wiki) {
        const v = await verifyWiki(entry.wiki, e.p, wiki);
        rep.wiki.push({ url: entry.wiki, ok: v.ok, gated: !!v.gated, why: v.why });
        if (!v.ok) fails.push("wiki " + entry.wiki + ": " + v.why);
    } else fails.push("wiki is null (every listed patch has a wiki page)");
    return fails;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function coverage(listed, entries) {
    const rows = [];
    const add = function (page, era, ent) {
        let r = rows.find(function (x) { return x.page === page && x.era === era; });
        if (!r) rows.push(r = { page: page, era: era, n: 0, official: 0, archived: 0, none: 0, wiki: 0 });
        r.n++;
        if (ent && ent.official) r.official++;
        else if (ent && ent.officialArchived) r.archived++;
        else r.none++;
        if (ent && ent.wiki) r.wiki++;
    };
    listed.forEach(function (e) {
        const ent = entries[e.patch];
        e.pages.forEach(function (page) { add(page, linkEra(e.p), ent); add(page, "all", ent); });
        add("distinct", linkEra(e.p), ent); add("distinct", "all", ent);
    });
    const order = P.PAGES.concat(["distinct"]);
    rows.sort(function (a, b) { return order.indexOf(a.page) - order.indexOf(b.page) || (a.era === "all") - (b.era === "all") || (a.era < b.era ? -1 : a.era > b.era ? 1 : 0); });
    return rows;
}

function printCoverage(rows) {
    console.log("\ncoverage (official live / archived Riot page / neither; wiki)");
    rows.forEach(function (r) {
        console.log("  " + (r.page + "         ").slice(0, 10) + (r.era + "                                         ").slice(0, 42)
            + String(r.n).padStart(4) + " patches: " + String(r.official).padStart(3) + " live, " + String(r.archived).padStart(3) + " archived, "
            + String(r.none).padStart(3) + " none; wiki " + r.wiki + "/" + r.n);
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const COMMENT = [
    "Patch-notes links of every listed patch (one entry per distinct patch of data/patches/masteries.json, runes.json and reforged.json; a patch listed on two pages appears once). Written and verified by tools/check-patch-links.js --discover --write (a network tool, run on demand; not part of tools/build-all.js); re-check with node tools/check-patch-links.js.",
    "official: Riot's own patch notes page, still live (www.leagueoflegends.com/en-us/news/game-updates/...; it answered 200 itself, no redirect, with a title naming the patch). null when Riot no longer hosts it: the 2009-2012 notes were forum threads (forums.na.leagueoflegends.com no longer resolves) and the 2013-2019 notes lived on na.leagueoflegends.com/en/news, which now redirects to the game-updates index (Riot's current site starts at V9.1-V9.3, then V9.18).",
    "officialArchived: only when official is null, a web.archive.org capture of that original Riot page (the capture the wiki cites, else the earliest capture in the Wayback index that answers 200 and names the patch, else the capture nearest the patch date). null when no such capture exists.",
    "wiki: the patch's page on wiki.leagueoflegends.com (title exactly as the wiki writes it, confirmed through the wiki API; the page itself is fetched too, but the wiki gates non-browser clients behind a Cloudflare challenge, so most entries are API-verified only). checked: the date of the run that verified the entry. A URL is only written after it verified; never invented."
];

async function main() {
    const listed = listedPatches();
    const only = args.only ? new Set(args.only) : null;
    if (only) args.only.forEach(function (x) { if (!listed.find(function (e) { return e.patch === x; })) usage(x + " is not a listed patch (write it as the listing does, e.g. V1.0.0.94(b))"); });
    const todo = listed.filter(function (e) { return !only || only.has(e.patch); });
    const report = {};
    let existing = null;
    try { existing = readJson(OUT_REL); } catch (e) { existing = null; }

    if (args.discover) {
        log("discover: " + todo.length + " patches (of " + listed.length + " listed)");
        const wiki = await wikiPages(todo.map(function (e) { return e.patch; }), true);
        const sitemap = await loadSitemap();
        log("  Riot en-us sitemap: " + sitemap.size + " URLs; wiki API: " + wiki.size + " pages");
        const found = {};
        for (const e of todo) {
            const r = await discoverOne(e, sitemap, wiki, report);
            found[e.patch] = { official: r.official, officialArchived: r.officialArchived, wiki: r.wiki, checked: args.date };
            // a hand-written reason for a link that stays null is kept
            const old = existing && existing.patches && existing.patches[e.patch];
            if (old && old.reason && (!r.wiki || (!r.official && !r.officialArchived))) found[e.patch].reason = old.reason;
            log("  " + (e.patch + "              ").slice(0, 14) + (r.official ? "live      " + r.official : r.officialArchived ? "archived  " + r.officialArchived : "none")
                + (r.wiki ? "" : "   [wiki: none]"));
        }
        const merged = {};
        listed.forEach(function (e) {
            if (found[e.patch]) merged[e.patch] = found[e.patch];
            else if (existing && existing.patches && existing.patches[e.patch]) merged[e.patch] = existing.patches[e.patch];
        });
        const doc = { _comment: COMMENT.join(" "), patches: merged };
        printCoverage(coverage(listed, merged));
        if (args.json) fs.writeFileSync(args.json, JSON.stringify({ mode: "discover", date: args.date, requests: requests, report: report, result: found }, null, 1) + "\n");
        if (args.write) {
            const w = P.writeJson(OUT, doc);
            log("\n" + OUT_REL + (w.changed ? " written" : " unchanged") + " (" + Object.keys(merged).length + " entries, " + requests + " requests)");
        } else log("\n(dry run: --write to update " + OUT_REL + "; " + requests + " requests)");
        const missing = listed.filter(function (e) { return !merged[e.patch]; });
        if (missing.length) { console.log("no entry yet: " + missing.map(function (e) { return e.patch; }).join(", ")); }
        return missing.length ? 1 : 0;
    }

    // verify
    if (!existing) { console.error("check-patch-links: " + OUT_REL + " does not exist (run --discover --write)"); return 1; }
    const entries = existing.patches || {};
    const failures = [];
    Object.keys(entries).forEach(function (k) { if (!listed.find(function (e) { return e.patch === k; })) failures.push(k + ": not a listed patch"); });
    listed.forEach(function (e) { if (!entries[e.patch]) failures.push(e.patch + ": no entry"); });
    log("verify: " + todo.length + " entries of " + OUT_REL);
    const wiki = await wikiPages(todo.map(function (e) { return e.patch; }), true);
    for (const e of todo) {
        const ent = entries[e.patch];
        if (!ent) continue;
        const f = await verifyOne(e, ent, wiki, report);
        f.forEach(function (x) { failures.push(e.patch + ": " + x); });
        const w = report[e.patch] && report[e.patch].wiki && report[e.patch].wiki[0];
        log("  " + (e.patch + "              ").slice(0, 14) + (f.length ? "FAIL " + f.join("; ") : "ok   " + (ent.official ? "live" : ent.officialArchived ? "archived" : "no Riot page") + " + wiki" + (w && w.gated ? " (API only, page gated)" : "")));
    }
    // What "verified" covers: Riot / Wayback pages were fetched and named the
    // patch; a wiki link whose page fetch was gated is API-verified only.
    let riotOk = 0, wikiFull = 0, wikiGated = 0;
    Object.keys(report).forEach(function (k) {
        const r = report[k] || {};
        (r.official || []).concat(r.archived || []).forEach(function (x) { if (x.ok) riotOk++; });
        (r.wiki || []).forEach(function (x) { if (x.ok && x.gated) wikiGated++; else if (x.ok) wikiFull++; });
    });
    const verdict = riotOk + " Riot / Wayback page(s) fetched and checked, " + wikiFull + " wiki page(s) fetched and checked"
        + (wikiGated ? ", " + wikiGated + " wiki link(s) API-verified only (page fetch gated by Cloudflare)" : "");
    printCoverage(coverage(listed, entries));
    if (args.json) fs.writeFileSync(args.json, JSON.stringify({ mode: "verify", date: args.date, requests: requests, report: report, failures: failures }, null, 1) + "\n");
    console.log("\n" + (failures.length ? "FAIL: " + failures.length + " problem(s)\n  " + failures.join("\n  ") : "PASS: " + verdict) + " (" + requests + " requests)");
    return failures.length ? 1 : 0;
}

main().then(function (code) { process.exit(code); }, function (err) {
    if (err instanceof Blocked) { console.error("check-patch-links: BLOCKED: " + err.message + ". Nothing written; try again later."); process.exit(3); }
    console.error("check-patch-links: " + (err && err.stack || err));
    process.exit(1);
});
