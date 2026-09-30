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
