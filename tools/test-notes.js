#!/usr/bin/env node
// tools/test-notes.js: the header's What changed flyout (nav.js LolPatchNotes)
// driven through the real UI: mouse, keyboard and touch input sent through
// the DevTools protocol, never a value set by script. The point: stepping
// through patches with the flyout open shows each patch's notes in place.
//
// Sections (each reports PASS / FAIL / SKIP; a missing input is a SKIP):
//   N1  "said once" (no browser): a single bullet that says what the
//       summary says is shown once: it holds every number of the summary
//       and at least 80% of its words, punctuation, spacing, case and a
//       list "and" aside (the bullet; a summary that holds the bullet that
//       way: the summary; a summary with the approx. flag stays); or it
//       restates the summary in other framing: with a leading label
//       ("Event rune only:", "Tooltip fix:"; two different labels keep both)
//       and the bullet's leading rune name set aside, the summary's values
//       read in the bullet word for word (runes V1.0.0.105, Reforged
//       V11.19); on a season-end record the summary's "last patch of Season
//       N" does not count (V25.24, V8.22). A bullet that differs in a
//       number, a stat or a patch, or lacks more of the summary's words,
//       keeps both. The shipped notes show no line twice, and (a check of
//       its own, not the rule) no record shows a summary 70% or more of
//       whose words are in its single bullet.
//   W1  --browser, per page (1440x900): a click opens the flyout (every range
//       in it, "30–90", kept on one line); a click on the Patch
//       dropdown opens its LCU option list and leaves the flyout open; a
//       click on the next option switches the patch and the open flyout
//       shows that patch's notes (title, summary and bullets as in
//       data/patches/notes/<page>.json); the Season dropdown too (Esc closes
//       only its list); the keyboard path: Enter opens with focus inside,
//       Shift+Tab lands on the button with the flyout open, Tab goes back
//       in, Shift+Tab twice reaches the Patch dropdown (still open), ArrowUp
//       switches and the flyout follows, Esc closes it and leaves focus on
//       the dropdown; focus on another control, or a click on the page,
//       closes it. The page's own "said once" rule (LolPatchNotes.shown)
//       agrees with N1's for every record and N1's cases; a record whose
//       bullet repeats its summary shows one line; a no-change record with
//       more items shows its first item, then the rest as bullets with a
//       gap between them; no "Season 14" breaks before its number; every
//       arrow stays on one line with the value after it ("5% → 6%" never
//       breaks after the arrow: every line of every record through
//       LolPatchNotes.line, and on screen, with Reforged V14.21 and V9.16).
//       The click that closes the flyout does nothing else (a mastery
//       point, a rune category, a Reforged path: unchanged, and the same
//       click again does act; masteries: a right-click too), while a click
//       on Share closes it and copies (its toast shows). No console error.
//   W2  --browser, phones (375x812): a tap opens the bottom sheet; the header
//       stays uncovered by the scrim; a tap on the Patch or Season dropdown
//       leaves the sheet open, and a patch switched there re-renders it; a
//       tap on the scrim (between the header and the sheet) closes it; the
//       permalink keeps its 32px tap box, 8px from the What changed button.
//       Held sideways (812x375) it is a sheet too, ending under the header
//       (both dropdowns stay uncovered); a short desktop window (1366x450)
//       keeps the flyout.
//   W3  --browser, per page (1366x520): keyboard on notes that scroll: the
//       body is a Tab stop (tabindex 0, role region) and has focus after
//       Enter; arrow / End keys scroll it, never the page; Shift+Tab from it
//       goes to the button (flyout open), Tab back to it, Tab on to the
//       links; with the dialog itself focused, ArrowDown scrolls the notes.
//       Notes that fit (a one-bullet record at 1366x620, the page made
//       taller when it does not scroll): the dialog has focus after Enter;
//       arrow / Page / Space / End leave the page where it is, on the dialog
//       and on a link; with the flyout closed ArrowDown does scroll the page.
//   W4  --browser, header strip per width (1920 … 375): the CHANGES label
//       shows from 1400 up, with a divider and at least 20px before LINK;
//       the Patch dropdown holds the longest patch label from 1400 up;
//       nothing runs under SHARE; the strip is the same on all three pages.
//
// Usage (from the repo root)
//   node tools/test-notes.js [--root <site>] [--only masteries,runes,reforged]
//        [--research <scratchpad>\patches] [--reforged-cache <dir>]
//        [--browser [--browser-exe <exe>]] [--json <file>] [--verbose] [--allow-skip]
//   The Runes Reforged page needs the cached runesReforged-<build>.json
//   catalogs (<research>/raw/reforged or --reforged-cache); every other remote
//   request is blocked, so the run never touches the network.
// Exit code: 0 all ran and passed, 1 a failure, 2 incomplete (skips).
"use strict";

const fs = require("fs");
const path = require("path");
const CP = require("./check-patches.js");
const TL = require("./test-links.js");

const { Reporter } = CP;
const PAGES = ["masteries", "runes", "reforged"];
// a patch with changes and neighbours in its season, per page (share-link hash)
const START = { masteries: "m-V4.5|", runes: "preReforged-V4.5|", reforged: "rr-v14-10" };
// a patch with long notes, per page (W3: they scroll at 1366x520)
const LONG = { masteries: "m-V6.22|", runes: "preReforged-V1.0.0.152|", reforged: "rr-v14-10" };
// the longest patch label ("V25.S1.1 (Season start · Domination rework)") in px of select text,
// measured with the shipped web fonts (Inter 12px; 1px more than canvas measureText says)
const LONGEST_LABEL = 260;
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

const STATE = "(function(){var b=document.querySelector('.legacy-header .header-notes'),p=document.getElementById('lol-notes'),a=document.activeElement;" +
    "var sel=document.querySelector('.legacy-header select.header-patch'),open=!!(p&&!p.hidden),body=p&&p.querySelector('.lol-notes-body');" +
    "return {btn:!!b,open:open,expanded:b&&b.getAttribute('aria-expanded'),busy:!!(p&&p.getAttribute('aria-busy'))," +
    "title:open?(p.querySelector('.lol-notes-patch')||{}).textContent:null,entry:window.LolPatchNotes&&LolPatchNotes.entry()?LolPatchNotes.entry().patch:null," +
    "sel:sel&&sel.value,list:!!document.querySelector('.lcu-dropdown-list'),sheet:!!(p&&p.classList.contains('is-sheet'))," +
    "focus:!a?null:a===b?'button':a===body?'body':p&&p.contains(a)?(a.tagName==='A'?'link':'flyout'):a===sel?'patch':a.classList&&a.classList.contains('header-season')?'season':a.tagName.toLowerCase()," +
    "summary:open&&p.querySelector('.lol-notes-summary')?p.querySelector('.lol-notes-summary').textContent:null," +
    "items:open?[].map.call(p.querySelectorAll('.lol-notes-list li, .lol-notes-none'),function(x){return x.textContent}):null," +
    "scrollY:Math.round(window.scrollY),scrollTop:body?Math.round(body.scrollTop):0,scrolls:!!(body&&body.scrollHeight-body.clientHeight>1)," +
    "tabindex:body&&body.getAttribute('tabindex'),role:body&&body.getAttribute('role')," +
    "href:location.href.split('#')[0]};})()";

function notesOf(root, page) {
    try { return JSON.parse(fs.readFileSync(path.join(root, "data", "patches", "notes", page + ".json"), "utf8")).patches; }
    catch (e) { return null; }
}

// What the flyout body must show for a notes record (no-change: its items,
// the first as a line and the rest as bullets; a single bullet that says
// what the summary says: once). The same rule as nav.js sameText / covers /
// shownOf, written out again here so a change on either side shows up (W1
// compares them).
// points: a point inside a word stays ("3.62", "v11.18" read whole)
function sameText(s, points) {
    let t = String(s || "").replace(/\s*\(approx\.\)\s*$/i, "").toLowerCase().replace(/[\u2010\u2011\u2012\u2212]/g, "-");
    if (points) t = t.replace(/([0-9a-z])\.(?=[0-9a-z])/g, "$1\u2024");
    return " " + t.replace(/[^0-9a-z\u00c0-\u024f%+\/\u2013\u2014\u2192\u00d7\u2024-]+/g, " ")
        .replace(/ and /g, " ").replace(/\s+/g, " ").trim() + " ";
}
const words = function (s, points) { return sameText(s, points).split(" ").filter(Boolean); };
// a says what b says: every word of b with a digit is in a, and 80% of b's words
function covers(a, b) {
    const have = new Set(words(a)), need = words(b);
    if (need.some(function (w) { return /\d/.test(w) && !have.has(w); })) return false;
    return need.length > 0 && need.filter(function (w) { return have.has(w); }).length >= 0.8 * need.length;
}
const LABEL = /^\s*(tooltip (?:fix|only|wording)|event runes? only)\s*:\s*/i;
const SEASON_END = /\s*[;,]?\s*\blast patch of Season \d+\b\s*(?=[;,]|$)/i;
// bullet b restates summary s in other framing: labels (the same one if both
// have one) and b's leading rune name set aside, s's numbers are all in b;
// each part of s (between "," and ";") with a value reads in b word for word
// from that value on, with the words before it in b; a part that only names
// a patch needs just that; one without a number, 80% of its words; one value
// at least.
function restates(b, s) {
    const lb = LABEL.exec(b), ls = LABEL.exec(s);
    if (lb && ls && lb[1].toLowerCase() !== ls[1].toLowerCase()) return false;
    const bw = words(lb ? b.slice(lb[0].length) : b, true), bs = " " + bw.join(" ") + " ", have = new Set(bw);
    const name = new Set();
    for (const w of bw) { if (/\d/.test(w)) break; name.add(w); }
    const parts = (ls ? s.slice(ls[0].length) : s).split(/[,;](?=\s|$)/).map(function (p) { return words(p, true); }).filter(function (p) { return p.length; });
    if (parts.length) { let i = 0; while (i < parts[0].length && name.has(parts[0][i])) i++; parts[0] = parts[0].slice(i); }
    let values = 0;
    for (const p of parts) {
        if (p.some(function (w) { return /\d/.test(w) && !have.has(w); })) return false;
        const at = p.findIndex(function (w) { return /\d/.test(w) && !/^v\d+(?:\u2024[0-9a-z]+)+$/.test(w); });
        if (at >= 0) {
            values++;
            if (bs.indexOf(" " + p.slice(at).join(" ") + " ") < 0) return false;
            if (p.slice(0, at).some(function (w) { return !have.has(w); })) return false;
        } else if (!p.some(function (w) { return /\d/.test(w); }) && p.filter(function (w) { return have.has(w); }).length < 0.8 * p.length) return false;
    }
    return values > 0;
}
function expectedBody(rec) {
    if (rec.kind === "no-change") return { summary: null, items: rec.items.slice() };
    let summary = rec.summary || null, items = (rec.items || []).slice();
    if (items.length === 1 && summary) {
        const approx = /\(approx\.\)\s*$/i.test(summary);
        const said = rec.kind === "season-end" ? summary.replace(SEASON_END, "") : summary;
        if (!approx && (covers(items[0], said) || restates(items[0], said))) summary = null; else if (covers(summary, items[0])) items = [];
    }
    return { summary: summary, items: items };
}
// The rule before punctuation counted (exact text up to closing punctuation):
// W1 looks for a record only the new rule shows once.
function oldSame(rec) {
    const f = function (s) { return String(s || "").replace(/\s*\(approx\.\)$/, "").replace(/[\s.;:,]+$/, "").replace(/\s+/g, " ").toLowerCase(); };
    if (rec.kind === "no-change" || !rec.summary || (rec.items || []).length !== 1) return false;
    const s = f(rec.summary), t = f(rec.items[0]);
    return t.indexOf(s) >= 0 || s.indexOf(t) >= 0;
}

// N1's cases: [summary, bullet, shows the summary, shows the bullet, why(, kind: "change")].
const SAID_ONCE = [
    ["Predator: damage 30–90 → 40–120, cooldown 100–70s → 90–60s", "Predator: damage 30–90 → 40–120; cooldown 100–70s → 90–60s", false, true, "comma vs semicolon"],
    ["Time Warp Tonic: instant restore 50% → 30%, Movement Speed 5% → 4%", "Time Warp Tonic: instant restore 50% → 30%; Movement Speed 5% → 4%", false, true, "comma vs semicolon"],
    ["Haste: Ghost  Movement Speed bonus 8% → 6%.", "haste: ghost movement speed bonus 8% → 6%", false, true, "case, spacing, closing full stop"],
    ["Feast: 2 → 3 health (approx.)", "Feast: 2 → 3 health", true, false, "the approx. flag stays on screen"],
    ["Guardian: shield ratios 25% → 15% AP, 12% → 9% bonus health", "Guardian: shield ratios 25% → 15% AP and 12% → 9% bonus health", false, true, "a list \"and\" for a comma"],
    ["Tooltip fix: Guardian's shield AP ratio prints 25% (was 0.25%)", "Tooltip fix: Guardian's shield AP ratio prints 25% (was 0.25%; the ratio has been 25% since V8.2)", false, true, "the bullet says it and more"],
    ["Lethal Tempo: Attack Speed 30–80% → 40–110%; last patch of Season 8", "Lethal Tempo: Attack Speed 30–80% → 40–110%", true, false, "the summary says it and more"],
    ["Predator: damage 30–90 → 40–120", "Predator: damage 30–90 → 40–130", true, true, "a different number"],
    ["Hail of Blades: 110% → 140% Attack Speed", "Hail of Blades: melee 110% → 140% Attack Speed (ranged unchanged)", false, true, "the bullet adds words in between"],
    ["Treasure Hunter: 70 → 50 gold, cap 150 → 130", "Treasure Hunter: first bonus 70 → 50 gold; cap 150 → 130 gold", false, true, "V13.4: the bullet adds words"],
    ["Jack Of All Trades: 10 / 25 → 8 / 20 Adaptive Force", "Jack Of All Trades: bonus Adaptive Force at 5 / 10 stacks 10 / 25 → 8 / 20", false, true, "V26.15: the same words in another order"],
    ["Unsealed Spellbook: first swap cooldown 4 → 4.5 min", "Unsealed Spellbook: initial swap cooldown 4 → 4.5 min", false, true, "one word of nine put differently"],
    ["Event rune only: Headless Horseman 3.62 → 3.08 armor penetration", "Quintessence of the Headless Horseman: 3.62 → 3.08 armor penetration", false, true, "runes V1.0.0.105: a label and a shorter rune name, the same values"],
    ["Tooltip fix: Predator shows its V11.18 buff, 60% Movement Speed over 1s", "Tooltip fix: Predator ramps up to 60% Movement Speed over 1s (was shown as 45% over 1.5s); the change itself came in V11.18", false, true, "Reforged V11.19: the same label, rune and values, framed otherwise"],
    ["Legend: Bloodline 0.40% → 0.45%; last patch of Season 2025", "Legend: Bloodline: 0.40% → 0.45% Life Steal per stack", false, true, "Reforged V25.24: a season end, which the meta line says", "season-end"],
    ["Time Warp Tonic reworked; last patch of Season 8", "Time Warp Tonic reworked: potions and biscuits restore 50% at once, then go on a short cooldown (was: 20% longer duration)", false, true, "Reforged V8.22: a season end, no values", "season-end"],
    ["Legend: Bloodline 0.40% → 0.45%; last patch of Season 2025", "Legend: Bloodline: 0.40% → 0.45% Life Steal per stack", true, true, "the V25.24 lines on a record that is not a season end"],
    ["Tooltip only: Predator shows its V11.18 buff, 60% Movement Speed over 1s", "Tooltip fix: Predator ramps up to 60% Movement Speed over 1s (was shown as 45% over 1.5s); the change itself came in V11.18", true, true, "two different labels"],
    ["Tooltip fix: Predator shows its V11.17 buff, 60% Movement Speed over 1s", "Tooltip fix: Predator ramps up to 60% Movement Speed over 1s (was shown as 45% over 1.5s); the change itself came in V11.18", true, true, "a patch the bullet does not name"],
    ["Tooltip fix: Predator damage shows 30–90 → 40–120", "Tooltip fix: Predator ramps its cooldown 30–90 → 40–120 (was shown as 100–70s)", true, true, "the same values for a stat the bullet does not name"],
    ["Event rune only: Headless Horseman 3.62 → 3.08 armor penetration", "Quintessence of the Headless Horseman: 3.62 → 3.08 magic penetration", true, true, "the same values, another stat after them"],
    ["Tooltip fix: Fleet Footwork shows its V26.16 heal buff", "Tooltip fix: Fleet Footwork heal 10–130 → 15–160, the V26.16 buff", false, true, "V26.17: no value in the summary, 80% of its words"],
    ["Lethal Tempo: melee 5% → 6% Attack Speed", "Lethal Tempo: melee Attack Speed 6% → 7%", true, true, "the same words, other numbers"],
    ["Treasure Hunter: 7", "Treasure Hunter: 70 → 50 gold", true, true, "a number inside a longer number"],
    ["Absorb Life: heal 2–17 → 2–20", "Absorb Life: heal 2–17 → 2–20 by level", false, true, "the bullet adds words at the end"]
];
function saidOnceRecords() {
    return SAID_ONCE.map(function (c) { return { kind: c[5] || "change", summary: c[0], items: [c[1]] }; });
}

function n1(c, root) {
    SAID_ONCE.forEach(function (k, i) {
        const got = expectedBody(saidOnceRecords()[i]);
        const sum = got.summary !== null, bul = got.items.length === 1;
        if (sum === k[2] && bul === k[3]) c.pass(k[4] + ": " + (sum && bul ? "both shown" : sum ? "the summary only" : "the bullet only"));
        else c.fail(k[4] + ": expected " + (k[2] ? "summary " : "") + (k[3] ? "bullet" : "") + ", got " + JSON.stringify(got));
    });
    // multi-bullet records are never cut
    const multi = expectedBody({ kind: "change", summary: "A: 1 → 2", items: ["A: 1 → 2", "B: 3 → 4"] });
    if (multi.summary && multi.items.length === 2) c.pass("a record with two bullets keeps its summary and both bullets");
    else c.fail("a record with two bullets was cut: " + JSON.stringify(multi));
    // the shipped notes: records shown once, and none that still shows a line twice
    PAGES.forEach(function (page) {
        const notes = notesOf(root, page);
        if (!notes) { c.fail("data/patches/notes/" + page + ".json missing or broken"); return; }
        let once = 0;
        const twice = [];
        Object.keys(notes).forEach(function (patch) {
            const rec = notes[patch], want = expectedBody(rec);
            const lines = (want.summary ? [want.summary] : []).concat(want.items);
            if (lines.length !== (rec.kind === "no-change" ? rec.items.length : (rec.summary ? 1 : 0) + rec.items.length)) once++;
            const seen = {};
            lines.forEach(function (l) { const k = sameText(l); if (seen[k]) twice.push(patch + ": " + l); seen[k] = 1; });
        });
        if (twice.length) c.fail(page + ": a line shown twice: " + twice.slice(0, 3).join(" | "));
        else c.pass(page + ": no record shows a line twice (" + once + " single-bullet record(s) shown once)");
        // a look of its own (not the rule): a summary shown over its single
        // bullet shares less than 70% of its words with it
        const near = [];
        Object.keys(notes).forEach(function (patch) {
            const rec = notes[patch], want = expectedBody(rec);
            if (rec.kind === "no-change" || !want.summary || want.items.length !== 1) return;
            const sw = words(rec.kind === "season-end" ? want.summary.replace(SEASON_END, "") : want.summary), have = new Set(words(want.items[0]));
            const share = sw.length ? sw.filter(function (w) { return have.has(w); }).length / sw.length : 0;
            if (share >= 0.7) near.push(patch + " (" + Math.round(share * 100) + "%): " + want.summary);
        });
        if (near.length) c.fail(page + ": a summary says its bullet again in other words: " + near.slice(0, 3).join(" | "));
        else c.pass(page + ": no summary shown over its single bullet shares 70% of its words with it");
    });
}

// Input through the DevTools protocol.
function input(tab) {
    const s = tab.send;
    const mouse = function (x, y, type, btn) {
        btn = btn || "left";
        return s("Input.dispatchMouseEvent", { type: type, x: x, y: y, button: type === "mouseMoved" ? "none" : btn, buttons: type === "mousePressed" ? (btn === "right" ? 2 : 1) : 0, clickCount: type === "mouseMoved" ? 0 : 1 });
    };
    const rect = function (sel) {
        return tab.eval("(function(){var el=document.querySelector(" + JSON.stringify(sel) + ");if(!el)return null;var b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,l:b.left,t:b.top,w:b.width,h:b.height,b:b.bottom};})()");
    };
    const KEYS = { Escape: 27, Enter: 13, Tab: 9, ArrowUp: 38, ArrowDown: 40, End: 35, Home: 36, PageDown: 34, PageUp: 33, " ": 32 };
    return {
        rect: rect,
        clickAt: async function (x, y) { await mouse(x, y, "mouseMoved"); await mouse(x, y, "mousePressed"); await mouse(x, y, "mouseReleased"); await sleep(200); },
        rightClickAt: async function (x, y) { await mouse(x, y, "mouseMoved"); await mouse(x, y, "mousePressed", "right"); await mouse(x, y, "mouseReleased", "right"); await sleep(200); },
        click: async function (sel) { const r = await rect(sel); if (!r || !r.w) return false; await this.clickAt(r.x, r.y); return true; },
        tap: async function (sel, at) {
            const r = await rect(sel); if (!r || !r.w) return false;
            const x = at ? at.x : r.x, y = at ? at.y : r.y;
            await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x, y: y }] });
            await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            await sleep(300); return true;
        },
        key: async function (k, shift) {
            const txt = k === "Enter" ? "\r" : k === " " ? " " : null, mod = shift ? 8 : 0, code = k === " " ? "Space" : k;
            await s("Input.dispatchKeyEvent", Object.assign({ type: txt ? "keyDown" : "rawKeyDown", key: k, code: code, windowsVirtualKeyCode: KEYS[k], nativeVirtualKeyCode: KEYS[k], modifiers: mod }, txt ? { text: txt, unmodifiedText: txt } : {}));
            await s("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: code, windowsVirtualKeyCode: KEYS[k], nativeVirtualKeyCode: KEYS[k], modifiers: mod });
            await sleep(200);
        }
    };
}

async function waitFor(tab, expr, ms) {
    const t0 = Date.now();
    for (;;) {
        let v = null;
        try { v = await tab.eval(expr); } catch (e) { v = null; }
        if (v) return v;
        if (Date.now() - t0 > (ms || 20000)) return null;
        await sleep(100);
    }
}
const notBusy = "(function(){var p=document.getElementById('lol-notes');return !p||p.hidden||!p.getAttribute('aria-busy');})()";
// every arrow in the open flyout: in a nowrap span.lol-notes-nb with the value after it, on one line
const ARROWS = "(function(){var w=document.createTreeWalker(document.querySelector('#lol-notes .lol-notes-body'),NodeFilter.SHOW_TEXT),n,loose=[],kept=0;" +
    "while((n=w.nextNode())){var t=n.nodeValue,p=n.parentNode;for(var i=t.indexOf('\\u2192');i>=0;i=t.indexOf('\\u2192',i+1)){" +
    "if(p.classList.contains('lol-notes-nb')&&getComputedStyle(p).whiteSpace==='nowrap'&&/^\\u2192\\s+\\S/.test(t.slice(i))&&p.getClientRects().length===1)kept++;else loose.push(t);}}" +
    "return {loose:loose,kept:kept};})()";
// the light-dismiss check: a click target per page that acts, and the state it changes
const ACT = { masteries: "#calculator .button.available", runes: ".rl-cat-header", reforged: ".rr-pcol" };
const ACT_STATE = "location.hash+'#'+[].map.call(document.querySelectorAll('.rl-cat'),function(c){return c.className;}).join(',')";
// a one-bullet record per page whose notes fit at 1366x620 (W3)
const SHORT = { masteries: "m-V6.7|", runes: "preReforged-V1.0.0.105|", reforged: "rr-v11-11" };
const followed = function (from) { return "(function(){var e=window.LolPatchNotes&&LolPatchNotes.entry(),p=document.getElementById('lol-notes');return !!(e&&e.patch!==" + JSON.stringify(from) + "&&p&&!p.hidden&&!p.getAttribute('aria-busy')&&(p.querySelector('.lol-notes-patch')||{}).textContent===e.patch);})()"; };

async function openPage(tab, root, page, hash, size) {
    const [W, H] = (size || "1440x900").split("x").map(Number);
    await tab.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 768 });
    if (W < 768) await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await tab.navigate("about:blank");                     // a new hash on the same file is a full load, not a hash change
    await sleep(100);
    await tab.navigate(TL.fileUrl(path.join(root, TL.PAGE_FILE[page])) + "#" + hash);
    const drawn = await TL.settle(tab, page, 500, 25000);
    if (!drawn || drawn.timeout) return false;
    return !!(await waitFor(tab, "!!(window.LolPatchNotes&&LolPatchNotes.entry()&&document.querySelector('.legacy-header .header-notes'))", 10000));
}

// W1 for one page. Returns the problems found (empty = pass) and notes (info).
async function desktop(b, root, page, notes, catalogDir) {
    const probs = [], infos = [], ok = function (cond, msg) { if (!cond) probs.push(msg); };
    const tab = await TL.openTab(b, { catalogDir: catalogDir });
    try {
        if (!(await openPage(tab, root, page, START[page]))) return { probs: ["the page did not draw (" + START[page] + ")"], infos: infos };
        const io = input(tab);
        const st = function () { return tab.eval(STATE); };
        const sameNotes = function (v, label) {
            const rec = notes[v.title];
            if (!rec) { probs.push(label + ": no notes record for " + v.title); return; }
            const want = expectedBody(rec);
            if (v.summary !== want.summary || JSON.stringify(v.items) !== JSON.stringify(want.items))
                probs.push(label + ": the flyout shows " + JSON.stringify({ summary: v.summary, items: v.items }).slice(0, 160) + ", the notes say " + JSON.stringify(want).slice(0, 160));
        };
        // the page's "said once" rule agrees with this file's, record by record
        const recs = Object.keys(notes).filter(function (k) { return notes[k].kind !== "no-change"; }).map(function (k) { return [k, notes[k]]; })
            .concat(saidOnceRecords().map(function (r, i) { return ["case " + (i + 1), r]; }));
        const pageShown = await tab.eval("(function(){var r=" + JSON.stringify(recs) + ";return r.map(function(x){var s=LolPatchNotes.shown(x[1]);return {summary:s.summary||null,items:s.items};});})()");
        const disagree = recs.filter(function (r, i) { return JSON.stringify(pageShown[i]) !== JSON.stringify(expectedBody(r[1])); });
        ok(!disagree.length, "nav.js shows " + disagree.length + " record(s) differently from this test's rule: " + disagree.slice(0, 3).map(function (r) { return r[0]; }).join(", "));
        const ids = await tab.eval("(function(){var o={};LolPatches.entries(" + JSON.stringify(page) + ").forEach(function(e){o[e.patch]=e.id;});return o;})()");
        // mouse: the Patch dropdown
        await io.click(".legacy-header .header-notes");
        await waitFor(tab, notBusy, 8000);
        let v = await st();
        ok(v.open && v.expanded === "true" && /flyout|body/.test(v.focus), "a click did not open it with focus inside (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
        const start = v.title;
        sameNotes(v, "opened on " + start);
        // a season number never starts a line: every "Season 14" sits in a nowrap span
        const seasonLoose = await tab.eval("(function(){var w=document.createTreeWalker(document.querySelector('#lol-notes .lol-notes-body'),NodeFilter.SHOW_TEXT),n,out=[];" +
            "while((n=w.nextNode()))if(/[Ss]eason \\d/.test(n.nodeValue)&&!(n.parentNode.classList.contains('lol-notes-nb')&&getComputedStyle(n.parentNode).whiteSpace==='nowrap'))out.push(n.nodeValue);return out;})()");
        ok(!seasonLoose.length, "a season number can wrap away from \"Season\": " + JSON.stringify(seasonLoose).slice(0, 160));
        // a range never wraps after its dash: every en dash sits in a nowrap span
        const loose = await tab.eval("(function(){var w=document.createTreeWalker(document.querySelector('#lol-notes .lol-notes-body'),NodeFilter.SHOW_TEXT),n,out=[];" +
            "while((n=w.nextNode()))if(n.nodeValue.indexOf('\\u2013')>=0&&!(n.parentNode.classList.contains('lol-notes-nb')&&getComputedStyle(n.parentNode).whiteSpace==='nowrap'))out.push(n.nodeValue);return out;})()");
        ok(!loose.length, "a range can wrap after its dash in " + start + ": " + JSON.stringify(loose.slice(0, 2)));
        // an arrow never ends a line with its new value on the next: on screen, and every line of every record
        const arrows = await tab.eval(ARROWS);
        ok(!arrows.loose.length, "an arrow can wrap away from its value in " + start + ": " + JSON.stringify(arrows.loose.slice(0, 2)));
        const lines = [];
        Object.keys(notes).forEach(function (k) { [notes[k].summary].concat(notes[k].items || []).forEach(function (t) { if (t && t.indexOf("\u2192") >= 0) lines.push(t); }); });
        const unglued = await tab.eval("(function(L){return L.filter(function(t){var h=LolPatchNotes.line(t);return (t.match(/\\u2192/g)||[]).length!==(h.match(/<span class=\"lol-notes-nb\">\\u2192\\s+[^\\s<]/g)||[]).length;});})(" + JSON.stringify(lines) + ")");
        ok(!unglued.length, unglued.length + " of " + lines.length + " line(s) with an arrow leave an arrow without its value: " + JSON.stringify(unglued.slice(0, 2)).slice(0, 200));
        if (!unglued.length) infos.push(page + ": " + lines.length + " lines with an arrow keep each arrow with its new value (" + arrows.kept + " on screen in " + start + ")");
        await io.click(".legacy-header select.header-patch");
        v = await st();
        ok(v.open && v.list, "a click on the Patch dropdown closed the flyout or opened no option list (" + JSON.stringify({ open: v.open, list: v.list }) + ")");
        const opt = await tab.eval("(function(){var l=document.querySelector('.lcu-dropdown-list');if(!l)return null;var rows=l.querySelectorAll('.lcu-dropdown-option');" +
            "var cur=[].findIndex.call(rows,function(r){return r.classList.contains('is-selected')});var i=cur+1<rows.length?cur+1:cur-1;rows[i].scrollIntoView({block:'nearest'});" +
            "var r=rows[i].getBoundingClientRect();return {text:rows[i].textContent,x:r.left+r.width/2,y:r.top+r.height/2};})()");
        if (!opt) probs.push("no option list to click");
        else {
            await io.clickAt(opt.x, opt.y);
            const done = await waitFor(tab, followed(start), 20000);
            v = await st();
            ok(done, "after a click on the option " + JSON.stringify(opt.text) + " the open flyout did not follow (" + JSON.stringify({ open: v.open, title: v.title, entry: v.entry }) + ")");
            if (done) sameNotes(v, "after the option click (" + start + " → " + v.title + ")");
        }
        // the Season dropdown keeps it open; Esc closes only its list
        await io.click(".legacy-header select.header-season");
        v = await st();
        ok(v.open && v.list, "a click on the Season dropdown closed the flyout (" + JSON.stringify({ open: v.open, list: v.list }) + ")");
        await io.key("Escape");
        v = await st();
        ok(v.open && !v.list, "Esc on the Season option list did not close just the list (" + JSON.stringify({ open: v.open, list: v.list }) + ")");
        // keyboard
        await io.click(".legacy-header .header-notes");                  // toggles it closed
        v = await st();
        ok(!v.open, "a second click on the button did not close it");
        await tab.eval("document.querySelector('.legacy-header .header-notes').focus();1");
        await io.key("Enter");
        await waitFor(tab, notBusy, 8000);
        v = await st();
        ok(v.open && /flyout|body/.test(v.focus), "Enter on the button did not open it with focus inside (" + v.focus + ")");
        await io.key("Tab", true);
        v = await st();
        ok(v.open && v.focus === "button", "Shift+Tab from the flyout did not land on the button with the flyout open (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
        await io.key("Tab");
        v = await st();
        ok(v.open && /flyout|body|link/.test(v.focus), "Tab from the open button did not go back into the flyout (" + v.focus + ")");
        await io.key("Tab", true); await io.key("Tab", true);
        v = await st();
        ok(v.open && v.focus === "patch", "Shift+Tab twice did not reach the Patch dropdown with the flyout open (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
        const before = v.title;
        await io.key("ArrowUp");
        const moved = await waitFor(tab, followed(before), 20000);
        v = await st();
        ok(moved, "ArrowUp on the Patch dropdown: the open flyout did not follow (" + JSON.stringify({ open: v.open, title: v.title, entry: v.entry }) + ")");
        if (moved) sameNotes(v, "after ArrowUp (" + before + " → " + v.title + ")");
        await io.key("Escape");
        v = await st();
        ok(!v.open && v.focus === "patch", "Esc on the Patch dropdown did not close it with focus kept there (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
        // focus elsewhere / a click on the page closes it
        await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
        await tab.eval("document.querySelector('.legacy-header .header-brand').focus();1"); await sleep(150);
        v = await st();
        ok(!v.open, "focus on the brand link did not close it");
        await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
        await io.clickAt(700, 640);
        v = await st();
        ok(!v.open, "a click on the page did not close it");
        const href = (await st()).href;
        ok(href === TL.fileUrl(path.join(root, TL.PAGE_FILE[page])), "the page navigated away: " + href);
        tab.errors.forEach(function (e) { probs.push(e); });

        // light dismiss: the click that closes the flyout does nothing else; one in the header does its job
        if (!(await openPage(tab, root, page, START[page]))) probs.push("light dismiss: " + START[page] + " did not draw");
        else {
            const tgt = await io.rect(ACT[page]);
            if (!tgt || !tgt.w) probs.push("light dismiss: no " + ACT[page] + " to click");
            else {
                await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
                const hit = await tab.eval("(function(){var el=document.elementFromPoint(" + Math.round(tgt.x) + "," + Math.round(tgt.y) + ");return !!el&&!document.getElementById('lol-notes').contains(el);})()");
                const s0 = await tab.eval(ACT_STATE);
                await io.clickAt(tgt.x, tgt.y);
                v = await st();
                const s1 = await tab.eval(ACT_STATE);
                ok(hit && !v.open && s1 === s0, "light dismiss: the click on " + ACT[page] + " that closed the flyout also acted (" + JSON.stringify({ open: v.open, before: s0.slice(0, 60), after: s1.slice(0, 60) }) + ")");
                await io.clickAt(tgt.x, tgt.y); await sleep(250);
                const s2 = await tab.eval(ACT_STATE);
                ok(s2 !== s0, "light dismiss: a click on " + ACT[page] + " with the flyout closed does not act either (the check proves nothing)");
                if (page === "masteries") {
                    await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
                    await io.rightClickAt(tgt.x, tgt.y);
                    v = await st();
                    const s3 = await tab.eval(ACT_STATE);
                    ok(!v.open && s3 === s2, "light dismiss: the right-click that closed the flyout also took the point back (" + JSON.stringify({ open: v.open, before: s2, after: s3 }) + ")");
                    await io.rightClickAt(tgt.x, tgt.y); await sleep(250);
                    ok((await tab.eval(ACT_STATE)) !== s3, "light dismiss: a right-click with the flyout closed does not take the point back either (the check proves nothing)");
                }
                if (s1 === s0 && s2 !== s0) infos.push(page + ": the click on " + ACT[page] + " that closes the flyout does nothing else" + (page === "masteries" ? " (a right-click neither)" : ""));
            }
            // a click on Share closes it and copies (LolToast)
            await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
            await tab.eval("(function(){var t=document.getElementById('toast');if(t)t.classList.remove('visible');return 1;})()");
            await io.click(".legacy-header .header-share");
            v = await st();
            const toast = await waitFor(tab, "(function(){var t=document.getElementById('toast');return t&&t.classList.contains('visible')?t.textContent:null;})()", 4000);
            ok(!v.open && !!toast, "a click on Share did not close the flyout and copy the link (" + JSON.stringify({ open: v.open, toast: toast }) + ")");
        }
        // Reforged V14.21 / V9.16: "5% → 6%", "+40 → +50", "12 → 6 min" never break after the arrow
        if (page === "reforged") {
            for (const pv of ["V14.21", "V9.16"]) {
                if (!ids[pv]) { probs.push("arrows: no " + pv + " in the registry"); continue; }
                if (!(await openPage(tab, root, page, ids[pv]))) { probs.push("arrows: " + pv + " did not draw"); continue; }
                await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
                const a = await tab.eval(ARROWS);
                ok(a.kept > 0 && !a.loose.length, "arrows: " + pv + " keeps " + a.kept + " arrow(s) with their value, loose: " + JSON.stringify(a.loose.slice(0, 2)));
                if (a.kept && !a.loose.length) infos.push(page + ": " + pv + ": " + a.kept + " arrow(s), each on one line with its new value");
            }
        }

        // said once: a record whose bullet says what its summary says (not word for word)
        const dup = Object.keys(notes).find(function (k) { const w = expectedBody(notes[k]); return ids[k] && notes[k].kind !== "no-change" && !oldSame(notes[k]) && (!w.summary || !w.items.length); });
        if (!dup) infos.push(page + ": no record says its bullet twice in other words (nothing to open)");
        else if (!(await openPage(tab, root, page, ids[dup] + (page === "reforged" ? "" : "|")))) probs.push("said once: " + dup + " did not draw");
        else {
            await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
            v = await st();
            const lines = (v.summary !== null ? [v.summary] : []).concat(v.items || []);
            ok(v.open && v.title === dup && lines.length === 1, "said once: " + dup + " shows " + lines.length + " line(s): " + JSON.stringify(lines).slice(0, 200));
            if (v.open && v.title === dup) sameNotes(v, "said once (" + dup + ")");
            if (lines.length === 1) infos.push(page + ": " + dup + " shows its repeated line once");
        }
        // a no-change record with more items: a line, then bullets, apart
        const nc = Object.keys(notes).find(function (k) { return ids[k] && notes[k].kind === "no-change" && notes[k].items.length > 1; });
        if (!nc) infos.push(page + ": no no-change record with more than one item");
        else if (!(await openPage(tab, root, page, ids[nc] + (page === "reforged" ? "" : "|")))) probs.push("no-change: " + nc + " did not draw");
        else {
            await io.click(".legacy-header .header-notes"); await waitFor(tab, notBusy, 8000);
            v = await st();
            if (v.open && v.title === nc) sameNotes(v, "no-change (" + nc + ")");
            const lay = await tab.eval("(function(){var b=document.querySelector('#lol-notes .lol-notes-body'),k=[].map.call(b.children,function(x){return x.tagName.toLowerCase()+'.'+x.className;});" +
                "var p=b.querySelector('.lol-notes-none'),l=b.querySelector('.lol-notes-list');return {kids:k,li:l?l.children.length:0,gap:p&&l?Math.round(l.getBoundingClientRect().top-p.getBoundingClientRect().bottom):null};})()");
            ok(lay.kids.length === 2 && /^p\.lol-notes-none/.test(lay.kids[0]) && /^ul\.lol-notes-list/.test(lay.kids[1]) && lay.li === notes[nc].items.length - 1,
                "no-change (" + nc + "): expected its first item as a line and the rest as bullets, got " + JSON.stringify(lay));
            ok(lay.gap !== null && lay.gap >= 6, "no-change (" + nc + "): " + lay.gap + "px between the line and the bullets (6 or more expected)");
            if (lay.gap >= 6) infos.push(page + ": " + nc + " (no change, " + notes[nc].items.length + " items): a line, then bullets, " + lay.gap + "px apart");
        }
        tab.errors.forEach(function (e) { if (probs.indexOf(e) < 0) probs.push(e); });
        return { probs: probs, infos: infos };
    } finally { await tab.close(); }
}

// W2 for one page.
async function phone(b, root, page, catalogDir) {
    const probs = [], ok = function (cond, msg) { if (!cond) probs.push(msg); };
    const tab = await TL.openTab(b, { catalogDir: catalogDir });
    try {
        if (!(await openPage(tab, root, page, START[page], "375x812"))) return ["the page did not draw at 375x812"];
        const io = input(tab);
        const btn = await io.rect(".legacy-header .header-notes"), link = await io.rect(".legacy-header .header-link");
        ok(link && link.w >= 32, "the permalink tap box is " + (link && link.w) + "px wide (32 expected)");
        ok(btn && link && link.l - (btn.l + btn.w) >= 8, "the permalink is " + (btn && link ? Math.round(link.l - btn.l - btn.w) : "?") + "px from the What changed button (8 expected)");
        await io.tap(".legacy-header .header-notes");
        await waitFor(tab, notBusy, 8000);
        let v = await tab.eval(STATE);
        ok(v.open && v.sheet, "a tap did not open the bottom sheet (" + JSON.stringify({ open: v.open, sheet: v.sheet }) + ")");
        // the scrim leaves the header uncovered: both dropdowns are what a tap there hits
        const hit = await tab.eval("(function(){return ['select.header-season','select.header-patch'].map(function(s){var el=document.querySelector('.legacy-header '+s),r=el.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el;});})()");
        ok(hit[0] && hit[1], "with the sheet open the scrim covers the " + (!hit[0] ? "Season" : "Patch") + " dropdown");
        // a tap on the Patch dropdown leaves the sheet open; a switch there re-renders it
        await io.tap(".legacy-header select.header-patch");
        v = await tab.eval(STATE);
        ok(v.open && v.focus === "patch", "a tap on the Patch dropdown closed the sheet (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
        const before = v.title;
        await io.key("Escape");                                            // the native picker
        await io.key("ArrowUp");
        const moved = await waitFor(tab, followed(before), 20000);
        v = await tab.eval(STATE);
        ok(moved && v.sheet, "a patch switched on the Patch dropdown did not re-render the open sheet (" + JSON.stringify({ open: v.open, title: v.title, entry: v.entry }) + ")");
        await io.tap(".legacy-header select.header-season");
        v = await tab.eval(STATE);
        ok(v.open, "a tap on the Season dropdown closed the sheet");
        // on the scrim between the header and the sheet (a long sheet covers the scrim's centre)
        const y = await tab.eval("Math.round((document.querySelector('.legacy-header').getBoundingClientRect().bottom+document.getElementById('lol-notes').getBoundingClientRect().top)/2)");
        await io.tap(".lol-notes-scrim", { x: 187, y: y });
        v = await tab.eval(STATE);
        ok(!v.open, "a tap on the scrim (y " + y + ") did not close the sheet");
        const cls = await tab.eval("document.documentElement.classList.contains('lol-notes-sheet')");
        ok(!cls, "html.lol-notes-sheet stayed after the sheet closed");
        // held sideways: a sheet that ends under the two-row header, both dropdowns uncovered
        if (!(await openPage(tab, root, page, START[page], "812x375"))) probs.push("the page did not draw at 812x375");
        else {
            await io.click(".legacy-header .header-notes");
            await waitFor(tab, notBusy, 8000);
            v = await tab.eval(STATE);
            const side = await tab.eval("(function(){var h=document.querySelector('.legacy-header').getBoundingClientRect(),p=document.getElementById('lol-notes').getBoundingClientRect(),b=document.querySelector('#lol-notes .lol-notes-body');" +
                "return {gap:Math.round(p.top-h.bottom),body:b?Math.round(b.clientHeight):0,hit:['select.header-season','select.header-patch'].map(function(s){var el=document.querySelector('.legacy-header '+s),r=el.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el;})};})()");
            ok(v.open && v.sheet, "812x375: the notes did not open as a sheet (" + JSON.stringify({ open: v.open, sheet: v.sheet }) + ")");
            ok(side.gap >= 0 && side.hit[0] && side.hit[1], "812x375: the sheet covers the header (" + JSON.stringify(side) + ")");
            // a short desktop window keeps the flyout under the button
            await tab.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 450, deviceScaleFactor: 1, mobile: false });
            await sleep(300);
            v = await tab.eval(STATE);
            ok(!v.open || !v.sheet, "1366x450: the notes turned into a sheet");
            await io.key("Escape");
        }
        tab.errors.forEach(function (e) { probs.push(e); });
        return probs;
    } finally { await tab.close(); }
}

// W3 for one page: keyboard on notes that scroll.
async function keyboard(b, root, page, catalogDir) {
    const probs = [], infos = [], ok = function (cond, msg) { if (!cond) probs.push(msg); };
    const tab = await TL.openTab(b, { catalogDir: catalogDir });
    try {
        if (!(await openPage(tab, root, page, LONG[page], "1366x520"))) return { probs: ["the page did not draw (" + LONG[page] + ")"], infos: infos };
        const io = input(tab);
        const st = function () { return tab.eval(STATE); };
        await tab.eval("document.querySelector('.legacy-header .header-notes').focus();1");
        await io.key("Enter");
        await waitFor(tab, notBusy, 8000);
        await sleep(150);
        let v = await st();
        const title = v.title;
        if (!v.open) return { probs: ["Enter did not open it on " + LONG[page]], infos: infos };
        if (!v.scrolls) { infos.push(page + ": the notes of " + title + " do not scroll at 1366x520 (nothing to check)"); return { probs: probs, infos: infos }; }
        ok(v.tabindex === "0" && v.role === "region", "the scrolling body is not a Tab stop (" + JSON.stringify({ tabindex: v.tabindex, role: v.role }) + ")");
        ok(v.focus === "body", "Enter did not put focus on the scrolling notes (" + v.focus + ")");
        await io.key("ArrowDown"); await io.key("ArrowDown");
        v = await st();
        ok(v.scrollTop > 0 && v.scrollY === 0, "ArrowDown scrolled " + (v.scrollTop > 0 ? "" : "not the notes ") + (v.scrollY ? "the page (" + v.scrollY + "px)" : "") + " (" + JSON.stringify({ scrollTop: v.scrollTop, scrollY: v.scrollY }) + ")");
        await io.key("End"); await io.key("ArrowDown"); await io.key("ArrowDown");
        v = await st();
        ok(v.scrollY === 0, "past the end of the notes the page scrolled (" + v.scrollY + "px)");
        await io.key("Tab", true);
        v = await st();
        ok(v.open && v.focus === "button", "Shift+Tab from the scrolling notes did not go to the button with the flyout open (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
        await io.key("Tab");
        v = await st();
        ok(v.open && v.focus === "body", "Tab from the open button did not go to the scrolling notes (" + v.focus + ")");
        await io.key("Tab");
        v = await st();
        ok(v.open && v.focus === "link", "Tab from the notes did not go on to the footer links (" + v.focus + ")");
        await io.key("Tab", true); await io.key("Tab", true);
        v = await st();
        ok(v.open && v.focus === "button" && v.scrollY === 0, "Shift+Tab twice from the first link did not reach the button with the flyout open (" + JSON.stringify({ open: v.open, focus: v.focus, scrollY: v.scrollY }) + ")");
        // the dialog itself focused (notes that came in after the open): ArrowDown scrolls the notes
        await io.key("Tab");
        await io.key("Home");
        await tab.eval("document.getElementById('lol-notes').focus();1");
        await io.key("ArrowDown");
        v = await st();
        ok(v.scrollTop > 0 && v.scrollY === 0 && v.focus === "body", "ArrowDown on the focused dialog did not scroll the notes (" + JSON.stringify({ scrollTop: v.scrollTop, scrollY: v.scrollY, focus: v.focus }) + ")");
        await io.key("Escape");
        v = await st();
        ok(!v.open && v.focus === "button", "Esc from the notes did not close it with focus on the button (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
        if (!probs.length) infos.push(page + ": " + title + " scrolls at 1366x520");
        // notes that fit: the dialog has focus, and no scroll key moves the page behind it
        if (!(await openPage(tab, root, page, SHORT[page], "1366x620"))) probs.push("the page did not draw (" + SHORT[page] + ")");
        else {
            if ((await tab.eval("document.documentElement.scrollHeight-innerHeight")) < 120) {
                await tab.eval("(function(){var d=document.createElement('div');d.style.height='1200px';document.body.appendChild(d);return 1;})()");
                infos.push(page + ": " + SHORT[page] + " does not scroll at 1366x620; made 1200px taller for the check");
            }
            await tab.eval("document.querySelector('.legacy-header .header-notes').focus();1");
            await io.key("Enter");
            await waitFor(tab, notBusy, 8000);
            await sleep(150);
            v = await st();
            ok(v.open && !v.scrolls && v.focus === "flyout", SHORT[page] + ": Enter did not open notes that fit with focus on the dialog (" + JSON.stringify({ open: v.open, scrolls: v.scrolls, focus: v.focus }) + ")");
            const moved = [];
            for (const k of ["ArrowDown", "ArrowDown", "PageDown", " ", "End"]) { await io.key(k); v = await st(); if (v.scrollY || !v.open) moved.push(JSON.stringify(k) + " on the dialog: " + JSON.stringify({ scrollY: v.scrollY, open: v.open })); }
            await io.key("Tab");
            v = await st();
            ok(v.focus === "link", SHORT[page] + ": Tab from the dialog did not reach a link (" + v.focus + ")");
            for (const k of ["ArrowDown", "PageDown", " ", "End"]) { await io.key(k); v = await st(); if (v.scrollY || !v.open) moved.push(JSON.stringify(k) + " on a link: " + JSON.stringify({ scrollY: v.scrollY, open: v.open })); }
            ok(!moved.length, SHORT[page] + ": a scroll key moved the page behind the flyout: " + moved.slice(0, 3).join("; "));
            await io.key("Escape");
            v = await st();
            ok(!v.open && v.focus === "button", SHORT[page] + ": Esc did not close it with focus on the button (" + JSON.stringify({ open: v.open, focus: v.focus }) + ")");
            await io.key("ArrowDown"); await io.key("PageDown");
            v = await st();
            ok(v.scrollY > 0, SHORT[page] + ": with the flyout closed ArrowDown / PageDown do not scroll the page either (the check proves nothing)");
            if (!moved.length && v.scrollY > 0) infos.push(page + ": " + SHORT[page] + " fits; the scroll keys leave the page in place (dialog and link), and scroll it once the flyout is closed");
        }
        tab.errors.forEach(function (e) { probs.push(e); });
        return { probs: probs, infos: infos };
    } finally { await tab.close(); }
}

// W4: the header strip per width, on every page; the same on all of them.
const WIDTHS = [1920, 1536, 1519, 1510, 1440, 1423, 1400, 1399, 1280, 1024, 960, 959, 560, 375];
const STRIP = "(function(){var q=function(s){return document.querySelector('.legacy-header '+s)};var R=function(el){if(!el)return null;var b=el.getBoundingClientRect();return b.width?[Math.round(b.left),Math.round(b.top),Math.round(b.width)]:null};" +
    "var sel=q('select.header-patch'),cs=getComputedStyle(sel),lab=q('.header-notes-label'),link=q('.header-link'),div=getComputedStyle(link,'::before');" +
    "return {hdr:Math.round(document.querySelector('.legacy-header').getBoundingClientRect().width),rows:Math.round(document.querySelector('.legacy-header').getBoundingClientRect().height)," +
    "cap:R(q('.header-select-text'))&&R(q('.header-select-text'))[2]>1,season:R(q('select.header-season')),patch:R(sel)," +
    "patchText:Math.round(sel.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)),btn:R(q('.header-notes')),label:R(lab),labelText:lab?lab.textContent:null," +
    "link:R(link),share:R(q('.header-share')),divider:div.content!=='none'&&div.display!=='none'?{w:parseFloat(div.width),left:parseFloat(div.left)}:null};})()";
async function header(b, root, pages, catalogDir) {
    const probs = [], strips = {};
    for (const page of pages) {
        const tab = await TL.openTab(b, { catalogDir: catalogDir });
        try {
            if (!(await openPage(tab, root, page, START[page], "1920x900"))) { probs.push(page + ": the page did not draw"); continue; }
            strips[page] = {};
            for (const W of WIDTHS) {
                await tab.send("Emulation.setDeviceMetricsOverride", { width: W, height: 900, deviceScaleFactor: 1, mobile: false });
                await sleep(150);
                const s = await tab.eval(STRIP);
                strips[page][W] = s;
                const at = page + " at " + W + ": ";
                const oneRow = s.rows < 80, wantLabel = oneRow && W >= 1400;
                if (!!s.label !== wantLabel) probs.push(at + "the CHANGES label is " + (s.label ? "shown" : "hidden") + " (" + (wantLabel ? "shown" : "hidden") + " expected from 1400 up)");
                if (s.label) {
                    if (!/^changes$/i.test(String(s.labelText).trim())) probs.push(at + "the label reads " + JSON.stringify(s.labelText));
                    const gap = s.link[0] - (s.label[0] + s.label[2]);
                    if (gap < 20) probs.push(at + "only " + gap + "px between the label and LINK (20 or more expected)");
                    if (!s.divider || s.divider.w !== 1) probs.push(at + "no 1px divider before LINK (" + JSON.stringify(s.divider) + ")");
                    else {
                        const x = s.link[0] + s.divider.left;
                        if (!(x > s.label[0] + s.label[2] + 4 && x < s.link[0] - 4)) probs.push(at + "the divider (x " + x + ") is not between the label and LINK");
                    }
                    if (s.patchText < LONGEST_LABEL) probs.push(at + "the Patch dropdown holds " + s.patchText + "px of text (" + LONGEST_LABEL + " for the longest label)");
                }
                if (s.share[0] + s.share[2] > s.hdr - 8) probs.push(at + "SHARE runs to " + (s.share[0] + s.share[2]) + " of " + s.hdr);
                if (oneRow && s.link[0] + s.link[2] > s.share[0]) probs.push(at + "LINK runs under SHARE");
            }
            tab.errors.forEach(function (e) { probs.push(page + ": " + e); });
        } finally { await tab.close(); }
    }
    // the same strip on every page (the tabs differ, the controls must not)
    const keys = ["rows", "cap", "season", "patch", "btn", "label", "link", "share", "divider"];
    const done = Object.keys(strips);
    WIDTHS.forEach(function (W) {
        for (let i = 1; i < done.length; i++) {
            const a = strips[done[0]][W], c = strips[done[i]][W];
            const diff = keys.filter(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(c[k]); });
            if (diff.length) probs.push("at " + W + " " + done[i] + " differs from " + done[0] + " in " + diff.join(", "));
        }
    });
    return probs;
}

async function runBrowser(args, root, ctx) {
    const all = [ctx.w1, ctx.w2, ctx.w3, ctx.w4];
    const exe = TL.findBrowser(args["browser-exe"]);
    if (!exe) { all.forEach(function (c) { c.skip("no Edge / Chrome found (pass --browser-exe <exe>; --browser needs one)"); }); return; }
    const only = args.only || PAGES;
    const catalogDir = TL.reforgedCache(args);
    const pages = PAGES.filter(function (p) { return only.indexOf(p) >= 0; }).filter(function (p) {
        const r = TL.reworked(root, p);
        if (!r.ok) { all.forEach(function (c) { c.skip(p + ": " + r.why); }); return false; }
        if (p === "reforged" && !(catalogDir && fs.existsSync(catalogDir))) {
            all.forEach(function (c) { c.skip("reforged: no cached runesReforged catalogs (--reforged-cache <dir> or --research <dir>)"); });
            return false;
        }
        return true;
    });
    if (!pages.length) return;
    const b = await TL.launchBrowser(exe);
    const harness = function (e) { return ["harness: " + (e && e.message || e)]; };
    try {
        for (const page of pages) {
            const notes = notesOf(root, page);
            if (!notes) { ctx.w1.fail(page + ": data/patches/notes/" + page + ".json missing or broken"); continue; }
            let r = await desktop(b, root, page, notes, catalogDir).catch(function (e) { return { probs: harness(e), infos: [] }; });
            r.infos.forEach(function (m) { ctx.w1.info(m); });
            if (r.probs.length) r.probs.slice(0, 6).forEach(function (m) { ctx.w1.fail(page + ": " + m); });
            else ctx.w1.pass(page + ": the flyout stays open and follows the Patch dropdown (mouse and keyboard); Esc, the button, focus elsewhere and a page click close it, and that click does nothing else (Share still copies); said once; no-change items apart; every arrow kept with its value");
            let p = await phone(b, root, page, catalogDir).catch(harness);
            if (p.length) p.slice(0, 6).forEach(function (m) { ctx.w2.fail(page + ": " + m); });
            else ctx.w2.pass(page + ": bottom sheet on a tap; header uncovered; the Patch / Season dropdowns keep it open and a switch re-renders it; closed by the scrim; permalink 32px, 8px from the button");
            r = await keyboard(b, root, page, catalogDir).catch(function (e) { return { probs: harness(e), infos: [] }; });
            r.infos.forEach(function (m) { ctx.w3.info(m); });
            if (r.probs.length) r.probs.slice(0, 6).forEach(function (m) { ctx.w3.fail(page + ": " + m); });
            else ctx.w3.pass(page + ": scrolling notes are a Tab stop between the button and the links; the keys scroll them, not the page; notes that fit: the keys do nothing on the dialog or a link");
        }
        const h = await header(b, root, pages, catalogDir).catch(harness);
        if (h.length) h.slice(0, 10).forEach(function (m) { ctx.w4.fail(m); });
        else ctx.w4.pass(pages.join(", ") + " at " + WIDTHS.join(" / ") + ": CHANGES label + divider from 1400 up, the longest patch label fits there, nothing under SHARE, the same strip on every page");
    } finally { await b.close(); }
}

async function main(argv) {
    let args;
    try { args = CP.parseArgs(argv); } catch (e) { console.error("test-notes: " + e.message); return 1; }
    const root = path.resolve(args.root || path.join(__dirname, ".."));
    const rep = new Reporter({ verbose: args.verbose, json: args.json, allowSkip: args["allow-skip"] });
    console.log("test-notes  site " + root);
    console.log("");
    rep.run("N1", "What changed: a bullet that says what the summary says is shown once", function (c) { n1(c, root); });
    const items = { w1: [], w2: [], w3: [], w4: [] };
    const sink = function (list) { return { pass: function (m) { list.push(["pass", m]); }, fail: function (m) { list.push(["fail", m]); }, skip: function (m) { list.push(["skip", m]); }, info: function (m) { list.push(["info", m]); } }; };
    const ctx = { w1: sink(items.w1), w2: sink(items.w2), w3: sink(items.w3), w4: sink(items.w4) };
    if (!args.browser) Object.keys(ctx).forEach(function (k) { ctx[k].skip("browser layer not requested (--browser)"); });
    else { try { await runBrowser(args, root, ctx); } catch (e) { ctx.w1.fail("browser run crashed: " + (e && e.stack || e)); } }
    rep.run("W1", "What changed: the open flyout follows the real Patch / Season dropdowns (--browser)", function (c) { items.w1.forEach(function (i) { c[i[0]](i[1]); }); });
    rep.run("W2", "What changed on phones: bottom sheet, header over the scrim, tap targets (--browser)", function (c) { items.w2.forEach(function (i) { c[i[0]](i[1]); }); });
    rep.run("W3", "What changed by keyboard: notes that scroll are a Tab stop and take the scroll keys (--browser)", function (c) { items.w3.forEach(function (i) { c[i[0]](i[1]); }); });
    rep.run("W4", "What changed in the header: CHANGES label, divider before LINK, patch room per width (--browser)", function (c) { items.w4.forEach(function (i) { c[i[0]](i[1]); }); });
    return rep.finish("test-notes");
}

module.exports = { expectedBody: expectedBody, sameText: sameText };

if (require.main === module) main(process.argv.slice(2)).then(function (code) { process.exitCode = code; });
