// air-sheet.js — the AIR profile sheet shell (css/air-sheet.css), shared by
// index.html (classic + keystone AIR masteries) and runes.html (V3.14-V6.24).
// Loaded in <head> right after nav.js; no jQuery, no DOM work at load time.
//
// Keeps the period-dependent sheet chrome in step with the active season:
//   .air-sheet[data-air-season]  "s1" … "s7"
//   .air-sheet[data-air-period]  2010 | 2012 | 2013 | 2014  (client look)
//   nav.air-subtabs              the pill labels of that client; Masteries /
//                                Runes are real links (nav.js seasonNavUrl)
//                                to the current season, the rest are inert
//   .air-page-chips              page chips 1..N (+ "+"), page 1 selected
// The season comes from the header's #season-select, which nav.js
// buildSeasonNav() rebuilds on every dataset switch (in-page included), so
// a MutationObserver on it is enough. The air/lcu flip itself is pure CSS
// (body[data-client]).
//
// Public: AirSheet.boot()     sync + watch now (inline after the sheet markup)
//         AirSheet.refresh()  re-sync now (e.g. after replacing markup).
//         AirMasterySidebar   the Masteries sidebar (second module below).

var AirSheet = window.AirSheet = (function(){
    // Which client look each season's calculator belongs to.
    var PERIOD = {
        masteries: { s1: "2010", s2: "2012", s3: "2012", s4: "2014", s5: "2014", s6: "2014", s7: "2014" },
        runes:     { s3: "2013", s4: "2014", s5: "2014", s6: "2014", s7: "2014" }
    };
    // Sub-tab strips as captured. "@page" = live link, "!" = greyed out.
    var SUBTABS = {
        "2010": ["Profile", "Ranked Stats", "!Achievements", "Match History", "Champions", "@runes", "@masteries", "Spells"],
        "2012": ["Profile", "Ranked Stats", "Match History", "Champions", "@runes", "@masteries", "Spells", "!Achievements"],
        "2013": ["Profile", "Leagues", "Match History", "Champions", "@runes", "@masteries", "Spells", "!Achievements"],
        "2014": ["Profile", "Leagues", "Match History", "Champions", "@runes", "@masteries", "Spells", "Item Sets"]
    };
    // Page chips [count, has "+"] per season, as seen in that season's
    // captures (Dec 2012: 1-10 +; 4.20: 1-20; Apr 2015: 1-6 +; Oct 2015
    // PBE: 1-8 +; 2016: 1-20; rune pages: 3 in 2013, 6 in 2015, 20 late).
    var CHIPS = {
        masteries: { s2: [10, true], s3: [10, true], s4: [20, false], s5: [6, true], s6: [8, true], s7: [20, false] },
        runes:     { s3: [3, false], s4: [6, false], s5: [6, false], s6: [20, false], s7: [20, false] }
    };
    var LABELS = { masteries: "Masteries", runes: "Runes" };

    function sheets() { return document.querySelectorAll(".air-sheet[data-air-page]"); }

    function seasonFromDatasetId(id) {
        var m = /^s(\d+)-/.exec(id || "") || /^preReforged-V(\d+)\./.exec(id || "");
        return m ? "s" + m[1] : null;
    }

    function currentSeason(fromHash) {
        if (fromHash) {
            var key = seasonFromDatasetId(String(location.hash || "").replace(/^#/, "").split("|")[0]);
            if (key && typeof seasonNavFind === "function" && seasonNavFind(key)) return key;
        }
        var sel = document.getElementById("season-select");
        return sel && sel.value ? sel.value : null;
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function renderSubtabs(sheet, page, period, def) {
        var nav = sheet.querySelector(".air-subtabs");
        if (!nav) return;
        var old = nav.querySelectorAll(".air-subtab");
        for (var i = 0; i < old.length; i++) nav.removeChild(old[i]);
        var search = nav.querySelector(".air-search");
        (SUBTABS[period] || SUBTABS["2014"]).forEach(function(item){
            var node;
            if (item.charAt(0) === "@") {
                var target = item.slice(1);
                var url = def && typeof seasonNavUrl === "function" ? seasonNavUrl(def, target) : null;
                if (target === page) {
                    node = el("span", "air-subtab is-active", LABELS[target]);
                    node.setAttribute("aria-current", "page");
                } else if (url) {
                    node = el("a", "air-subtab is-link", LABELS[target]);
                    node.setAttribute("href", url);
                } else {
                    var tip = (typeof SEASON_NAV_DISABLED_TIPS !== "undefined" && SEASON_NAV_DISABLED_TIPS[target])
                        || { title: LABELS[target], body: "No " + LABELS[target].toLowerCase() + " calculator for this season." };
                    node = el("span", "air-subtab is-unavailable", LABELS[target]);
                    node.setAttribute("tabindex", "0");
                    node.setAttribute("aria-disabled", "true");
                    node.setAttribute("data-lol-tip-title", tip.title);
                    node.setAttribute("data-lol-tip", tip.body);
                    node.setAttribute("data-lol-tip-skin", "air-mastery");
                    node.setAttribute("data-lol-tip-pos", "bottom");
                }
                node.setAttribute("data-air-link", target);
            } else {
                var off = item.charAt(0) === "!";
                node = el("span", "air-subtab" + (off ? " is-disabled" : ""), off ? item.slice(1) : item);
                node.setAttribute("aria-hidden", "true");
            }
            nav.insertBefore(node, search || null);
        });
    }

    function renderChips(sheet, page, season) {
        var spec = (CHIPS[page] || {})[season];
        var bars = sheet.querySelectorAll(".air-page-chips");
        sheet.setAttribute("data-air-chips", spec ? String(spec[0]) : "0");
        for (var b = 0; b < bars.length; b++) {
            var bar = bars[b], html = "";
            if (spec) {
                for (var i = 1; i <= spec[0]; i++)
                    html += '<span class="air-chip' + (i === 1 ? " is-selected" : "") + '">' + i + "</span>";
                if (spec[1]) html += '<span class="air-chip air-chip-add"></span>';
            }
            bar.innerHTML = html;
        }
    }

    function sync(season) {
        if (!season) return;
        var def = typeof seasonNavFind === "function" ? seasonNavFind(season) : null;
        var list = sheets();
        for (var i = 0; i < list.length; i++) {
            var sheet = list[i];
            var page = sheet.getAttribute("data-air-page");
            var period = (PERIOD[page] || {})[season] || "2014";
            if (sheet.getAttribute("data-air-season") === season && sheet._airSynced) continue;
            sheet.setAttribute("data-air-season", season);
            sheet.setAttribute("data-air-period", period);
            renderSubtabs(sheet, page, period, def);
            renderChips(sheet, page, season);
            sheet._airSynced = true;
            // The sidebar's Save state depends on the period (2010: always
            // live); repaint it in case it rendered before this sync.
            if (sheet.querySelector(".air-ms") && window.AirMasterySidebar) AirMasterySidebar.update({});
        }
    }

    function refresh() {
        var list = sheets();
        for (var i = 0; i < list.length; i++) list[i]._airSynced = false;
        sync(currentSeason(false));
    }

    var booted = false;
    function init() {
        if (booted || !sheets().length) return;
        booted = true;
        sync(currentSeason(true));             // deep link: right look before first paint
        var sel = document.getElementById("season-select");
        if (sel && window.MutationObserver) {
            new MutationObserver(function(){ sync(currentSeason(false)); })
                .observe(sel, { childList: true });
        }
    }

    // index.html / runes.html call AirSheet.boot() inline right after the
    // sheet markup (first paint already right on a slow load); this is the
    // fallback for pages that do not.
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { boot: init, refresh: refresh, sync: sync, PERIOD: PERIOD, SUBTABS: SUBTABS, CHIPS: CHIPS };
})();

// ---------------------------------------------------------------------------
// AirMasterySidebar — the AIR client's Masteries sidebar (css/air-sheet.css
// §5b, markup: aside.air-ms in index.html). One component for classic
// S1-S5 (calculator.js) and keystone AIR V5.22 / V6.22 (keystone-
// calculator.js): the keystone era kept the S2-S5 sidebar. The calculators
// own the build; this module owns the page name, the "*" unsaved marker
// and the Save / Revert / Delete states. Hidden under body[data-client=lcu].
//
//   AirMasterySidebar.render(cfg)   configure for the active dataset (call
//                                   on every dataset switch); the current
//                                   build becomes the saved baseline.
//     cfg.trees        [{ name, emblem }] in data (= display) order; emblem
//                      offense | defense | utility | ferocity | cunning |
//                      resolve (images/air/ms-emblems.png)
//     cfg.maxPoints    budget, for update() callers that omit `available`
//     cfg.getCode()    -> string, the current build code; drives "dirty"
//     cfg.onReturn()   Return Points
//     cfg.onDelete()   Delete (default: onReturn); the name then resets
//     cfg.onRevert(code)  re-import the saved build `code`
//     cfg.onSave()     Save Masteries (default: click #share, i.e. copy the
//                      share link); then the baseline moves to "now"
//     cfg.onTreeReset(i)  double-click on emblem i (optional)
//   AirMasterySidebar.update({ points: [n, n, n], available: n })
//                                   after every build change
//   AirMasterySidebar.markSaved()   current build + name = saved (on load /
//                                   hashchange import, after Save)
//   AirMasterySidebar.isDirty()     build or name differs from the baseline
//   AirMasterySidebar.pageName([s]) get / set the page name (no "*")
//   AirMasterySidebar.save() / .revert() / .del() / .ret()  = the buttons
//   AirMasterySidebar.element()     the <aside> (null when absent)
//   AirMasterySidebar.DEFAULT_NAME  "Mastery Page 1"
// Dirty state is mirrored on the aside as [data-dirty="true|false"].
// Save / Revert are disabled while the page is clean, except Save in the
// 2010 look (.air-sheet[data-air-period="2010"]), which stays live.
// ---------------------------------------------------------------------------

var AirMasterySidebar = window.AirMasterySidebar = (function(){
    var DEFAULT_NAME = "Mastery Page 1";
    var cfg = {}, root = null, bound = false;
    var name = DEFAULT_NAME;
    var saved = { code: "", name: DEFAULT_NAME };
    var last = { points: [0, 0, 0], available: null };

    function q(sel) { return root ? root.querySelector(sel) : null; }
    function qa(sel) { return root ? root.querySelectorAll(sel) : []; }
    function code() {
        try { return typeof cfg.getCode === "function" ? String(cfg.getCode() || "") : ""; }
        catch (e) { return ""; }
    }
    function isDirty() { return code() !== saved.code || name !== saved.name; }

    function paint() {
        if (!root) return;
        var dirty = isDirty();
        root.setAttribute("data-dirty", dirty ? "true" : "false");
        var t = q(".air-ms-name-text");
        if (t) {
            t.textContent = (dirty ? "*" : "") + name;
            t.setAttribute("title", name);
        }
        var save = q(".air-ms-save"), rev = q(".air-ms-revert");
        if (save) save.disabled = !dirty && !saveAlwaysLive();
        if (rev) rev.disabled = !dirty;
    }

    // The 2010 client keeps Save Masteries live (navy, clickable) on a saved
    // page, like Return Points (wb-riot-2010-masteries.jpg); later clients
    // grey it out until the page changes.
    function saveAlwaysLive() {
        var sheet = root && root.closest ? root.closest(".air-sheet") : null;
        return !!sheet && sheet.getAttribute("data-air-period") === "2010";
    }

    function update(s) {
        s = s || {};
        if (s.points) last.points = s.points.slice(0);
        if (s.available != null) last.available = s.available;
        else if (s.points && cfg.maxPoints != null)
            last.available = cfg.maxPoints - last.points.reduce(function(a, b){ return a + (+b || 0); }, 0);
        var counts = qa(".air-ms-count");
        for (var i = 0; i < counts.length; i++) counts[i].textContent = String(last.points[i] || 0);
        var n = q(".air-ms-points-n");
        if (n && last.available != null) n.textContent = String(last.available);
        paint();
    }

    function markSaved() {
        saved = { code: code(), name: name };
        paint();
    }

    function pageName(v) {
        if (v === undefined) return name;
        v = String(v).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        name = v || DEFAULT_NAME;
        paint();
        return name;
    }

    // --- buttons ---------------------------------------------------------
    function save() {
        if (typeof cfg.onSave === "function") cfg.onSave();
        else {
            var share = document.getElementById("share");
            if (share) share.click();
        }
        markSaved();
    }
    function revert() {
        if (!isDirty()) return;
        var target = saved;
        if (code() !== target.code && typeof cfg.onRevert === "function") cfg.onRevert(target.code);
        name = target.name;
        paint();
    }
    function ret() { if (typeof cfg.onReturn === "function") cfg.onReturn(); }
    function del() {
        if (typeof cfg.onDelete === "function") cfg.onDelete(); else ret();
        name = DEFAULT_NAME;
        paint();
    }

    // --- page-name editing (pencil) --------------------------------------
    function startEdit() {
        var box = q(".air-ms-name"), input = q(".air-ms-name-input");
        if (!box || !input || box.classList.contains("is-editing")) return;
        input.value = name;
        box.classList.add("is-editing");
        input.focus();
        input.select();
    }
    function endEdit(commit) {
        var box = q(".air-ms-name"), input = q(".air-ms-name-input");
        if (!box || !box.classList.contains("is-editing")) return;
        box.classList.remove("is-editing");
        if (commit) pageName(input.value);
    }

    function treeTip() { return "Double click to reset tree"; }

    function bind() {
        if (bound || !root) return;
        bound = true;
        root.addEventListener("click", function(e){
            var btn = e.target.closest ? e.target.closest("button") : null;
            if (!btn || btn.disabled || !root.contains(btn)) return;
            if (btn.classList.contains("air-ms-save")) save();
            else if (btn.classList.contains("air-ms-return")) ret();
            else if (btn.classList.contains("air-ms-delete")) del();
            else if (btn.classList.contains("air-ms-revert")) revert();
            else if (btn.classList.contains("air-ms-pencil")) {
                if (q(".air-ms-name.is-editing")) endEdit(true); else startEdit();
            }
        });
        // mousedown on the pencil would blur (= commit) the input first
        var pencil = q(".air-ms-pencil");
        if (pencil) pencil.addEventListener("mousedown", function(e){
            if (q(".air-ms-name.is-editing")) e.preventDefault();
        });
        var input = q(".air-ms-name-input");
        if (input) {
            input.addEventListener("keydown", function(e){
                if (e.key === "Enter") { e.preventDefault(); endEdit(true); }
                else if (e.key === "Escape") { e.preventDefault(); endEdit(false); }
            });
            input.addEventListener("blur", function(){ endEdit(true); });
        }
        root.addEventListener("dblclick", function(e){
            var tree = e.target.closest ? e.target.closest(".air-ms-tree") : null;
            if (!tree || typeof cfg.onTreeReset !== "function") return;
            if (window.getSelection) { try { window.getSelection().removeAllRanges(); } catch (err) {} }
            cfg.onTreeReset(+tree.getAttribute("data-tree"));
        });
        var trees = qa(".air-ms-tree");
        if (window.LolTooltip) LolTooltip.attach(trees, function(){
            return typeof cfg.onTreeReset === "function" ? treeTip() : null;
        }, "air-mastery");
    }

    function render(c) {
        root = document.querySelector(".air-ms");
        cfg = c || {};
        if (!root) return;
        bind();
        var trees = cfg.trees || [];
        var nodes = qa(".air-ms-tree");
        for (var i = 0; i < nodes.length; i++) {
            var t = trees[i] || {};
            var em = nodes[i].querySelector(".air-ms-emblem");
            if (em) em.setAttribute("data-emblem", t.emblem || "");
            nodes[i].setAttribute("data-tree", String(i));
            nodes[i].setAttribute("aria-label", (t.name || "Tree " + (i + 1)) + " points");
        }
        endEdit(false);
        last = { points: [0, 0, 0], available: cfg.maxPoints != null ? cfg.maxPoints : null };
        update({});
        markSaved();
    }

    return {
        render: render, update: update, markSaved: markSaved, isDirty: isDirty,
        pageName: pageName, save: save, revert: revert, del: del, ret: ret,
        element: function(){ return root || document.querySelector(".air-ms"); },
        DEFAULT_NAME: DEFAULT_NAME
    };
})();
