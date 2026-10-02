// nav.js — shared shell for all three pages (index.html, runes.html,
// runes-reforged.html). Loaded in <head> after patch-registry.js and
// lol-data.js, before jQuery: nothing here may touch the DOM or `$` at load
// time; DOM work waits for DOMContentLoaded (which fires before jQuery's
// ready handlers in the calculators).
//
// Public API
//   clientEraFor(entryOrId)      -> "air" | "lcu" (registry entry.era)
//   setClientEra(era | entry)    sets body[data-client] (and html[data-client])
//   buildSeasonNav(opts)         season dropdown + header tabs
//   seasonNavFind(key), seasonNavUrl(def, page)
//   lolBootClientEra()           inline after <body>: deep-link era
//   lolBootHeader()              inline after </header>: deep-link prefill
//   lolPageType()                = LolPatches.page()
//   LolTooltip.show(anchorOrEvent, html, skin, opts) / .move(evt) / .hide()
//   LolTooltip.attach(target, htmlOrFn, skin, opts)
//   LolToast.show(msg, opts)
//   LolStage.fit() / LolStage.scale(el)
//   LolDropdown.close()
//
// Seasons, patches, eras and labels come from the registry (patch-registry.js
// via lol-data.js LolPatches); nothing here parses dataset ids any more.

// ---------------------------------------------------------------------------
// 1. Client era (DECISIONS.md §1). The registry entry carries it (DESIGN
// §3.5: lcu for V7.1+ and every Runes Reforged patch, air otherwise).
// ---------------------------------------------------------------------------

function clientEraFor(x) {
    if (x && typeof x === "object") return x.era === "lcu" ? "lcu" : "air";
    var id = String(x || "");
    if (id === "air" || id === "lcu") return id;
    if (window.LolPatches) {
        var page = LolPatches.pageOfId(id), r = page ? LolPatches.resolve(page, id) : null;
        if (r && r.entry.era) return r.entry.era;
    }
    // an id the registry cannot resolve: Runes Reforged is LCU, the rest AIR
    return /^rr-/.test(id) ? "lcu" : "air";
}

function setClientEra(era) {
    era = clientEraFor(era);
    var html = document.documentElement, body = document.body;
    var prev = body ? body.getAttribute("data-client") : html.getAttribute("data-client");
    html.setAttribute("data-client", era);
    if (body) body.setAttribute("data-client", era);
    if (prev !== era && typeof CustomEvent === "function") {
        document.dispatchEvent(new CustomEvent("lol:client-era", { detail: { era: era, previous: prev } }));
    }
    return era;
}

// Called from an inline <script> right after <body>, so the first paint
// already has the right backdrop for deep links: the era of the entry the
// hash opens (the page default for an empty or unknown hash).
function lolBootClientEra() {
    var r = LolPatches.fromHash(LolPatches.page());
    setClientEra(r.entry ? r.entry.era : (document.body && document.body.getAttribute("data-client")) || "air");
}

// ---------------------------------------------------------------------------
// 2. Season-led navigation. The Season dropdown in the header is the primary
// control: it lists every covered season, and the page tabs adapt to what
// existed in that era —
//   Seasons 1-7 (separate systems):  [Masteries] [Runes]
//   Seasons 8+  (combined system):   [Runes Reforged]
// SEASON_NAV (patch-registry.js) carries each page's default id per season,
// so cross-page jumps land on the right season. A page absent from a season
// did not exist then.
// ---------------------------------------------------------------------------

var SEASON_NAV_PAGE_NAMES = { masteries: "Masteries", runes: "Runes", reforged: "Runes Reforged" };

// The season table: the registry's SEASON_NAV (patch-registry.js).
function seasonNavTable() {
    return typeof SEASON_NAV !== "undefined" ? SEASON_NAV : [];
}

function seasonNavFind(key) {
    var table = seasonNavTable();
    for (var i = 0; i < table.length; i++)
        if (table[i].key === key) return table[i];
    return null;
}

// URL that opens `page` pre-selected to this season, or null if the season
// has no such page.
function seasonNavUrl(def, page) {
    if (page === "masteries" && def.masteries) return "index.html#" + def.masteries + "|";
    if (page === "runes" && def.runes) return "runes.html#" + def.runes + "|";
    if (page === "reforged" && def.reforged) return "runes-reforged.html#" + def.reforged;
    return null;
}

function seasonNavPrimaryUrl(def) {
    return seasonNavUrl(def, "masteries")
        || seasonNavUrl(def, "reforged")
        || seasonNavUrl(def, "runes")
        || "index.html";
}

// Header tabs for a season (plain DOM: also used by lolBootHeader before
// jQuery has loaded).
function renderSeasonNavTabs(opts, def) {
    var tabs = document.querySelector(".header-tabs");
    if (!tabs || !def) return;
    while (tabs.firstChild) tabs.removeChild(tabs.firstChild);
    var addTab = function(label, page) {
        var url = seasonNavUrl(def, page), node;
        if (url) {
            node = document.createElement("a");
            node.className = "header-tab" + (opts.page === page ? " active" : "");
            node.setAttribute("href", url);
        } else {
            // A season without this page (none today: every season S1-S7
            // has both pages); the tab stays, greyed, with a hint.
            var tip = { title: label, body: "No " + label.toLowerCase() + " catalog for this season yet." };
            node = document.createElement("span");
            node.className = "header-tab disabled";
            node.setAttribute("aria-disabled", "true");
            node.setAttribute("tabindex", "0");
            node.setAttribute("data-lol-tip-title", tip.title);
            node.setAttribute("data-lol-tip", tip.body);
            node.setAttribute("data-lol-tip-pos", "bottom");
        }
        node.textContent = label;
        tabs.appendChild(node);
    };
    if (def.reforged) {
        addTab("Runes Reforged", "reforged");
    } else {
        addTab("Masteries", "masteries");
        addTab("Runes", "runes");
    }
}

function seasonNavTitle(def, page) {
    document.title = def.label.replace(/\s*\(.*\)$/, "") + " "
        + (SEASON_NAV_PAGE_NAMES[page] || "") + " · Legacy LoL Calculator";
}

// SEASON_NAV key of a dataset id (canonical or legacy: the registry entry's
// season, so "s4-final" -> s5), or null.
function seasonKeyForDataset(id) {
    id = String(id || "");
    var page = LolPatches.pageOfId(id), r = page ? LolPatches.resolve(page, id) : null;
    return r ? r.entry.season : null;
}

function lolPageType() {
    return LolPatches.page();
}

// Inline right after </header>: make the static header match the deep link
// (or the page default) before the calculators (and jQuery) arrive, so a slow
// load never shows "Season 3" over an #m-V5.21 page. Fills the season and
// patch dropdowns, the tabs and the title from the registry; the
// calculator's buildSeasonNav replaces it once it runs.
function lolBootHeader() {
    var page = lolPageType();
    var season = document.querySelector(".legacy-header select.header-season");
    var patch = document.querySelector(".legacy-header select.header-patch");
    var entry = LolPatches.fromHash(page).entry;
    var def = entry ? seasonNavFind(entry.season) : null;
    if (!def || !def[page]) return;
    if (season) {
        while (season.firstChild) season.removeChild(season.firstChild);
        seasonNavTable().forEach(function(d){
            var o = document.createElement("option");
            o.value = d.key; o.textContent = d.label;
            if (d.key === def.key) o.selected = true;
            season.appendChild(o);
        });
        season.value = def.key;
    }
    if (patch) LolPatches.fillPatchSelect(patch, page, def.key, entry.id);
    renderSeasonNavTabs({ page: page }, def);
    seasonNavTitle(def, page);
}

// (Re)build the season dropdown + tabs. `opts`:
//   page          "masteries" | "runes" | "reforged"
//   seasonSelect  selector of this page's season <select>
//   entry         the active registry entry (its season is the current one)
//   onSeason(def) called when the chosen season exists on THIS page type;
//                 switch datasets in-page (LolPatches.seasonDefault(page,
//                 def.key)) and return true. Returning a falsy value falls
//                 back to a cross-page navigation.
function buildSeasonNav(opts) {
    var currentKey = opts.entry ? opts.entry.season : null;
    var $season = $(opts.seasonSelect);
    if (!$season.length) return;
    $season.empty();
    seasonNavTable().forEach(function(def){
        $season.append($("<option>").attr("value", def.key).text(def.label));
    });
    $season.val(currentKey);
    var current = seasonNavFind(currentKey);
    renderSeasonNavTabs(opts, current);
    if (current) seasonNavTitle(current, opts.page);

    $season.off("change.nav").on("change.nav", function(){
        var def = seasonNavFind($(this).val());
        if (!def) return;
        if (def[opts.page] && opts.onSeason && opts.onSeason(def)) return;
        document.location.href = seasonNavPrimaryUrl(def);
    });
}

// ---------------------------------------------------------------------------
// Small DOM helpers (no jQuery: this file runs before it loads).
// ---------------------------------------------------------------------------

function lolClosest(node, selector) {
    while (node && node.nodeType === 1) {
        if ((node.matches || node.msMatchesSelector).call(node, selector)) return node;
        node = node.parentNode;
    }
    return null;
}

function lolEscapeHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function lolOnReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
}

// ---------------------------------------------------------------------------
// 3. LolTooltip — ONE tooltip element for every surface (DECISIONS §5).
//   LolTooltip.show(anchorOrEvent, html, skin, opts)
//     anchorOrEvent  DOM element, jQuery object, or a mouse event (native or
//                    jQuery). AIR skins follow the cursor (+16/+16) when
//                    given an event — pass the event on hover and call
//                    .move(evt) on mousemove; given an element (keyboard
//                    focus) they hang below it, left-aligned. "lcu" always
//                    anchors to the element (event.currentTarget).
//     html           string of HTML (or a DOM node) — the content template.
//     skin           "air-mastery" | "air-rune" | "lcu". Default follows
//                    body[data-client]: lcu → "lcu", air → "air-mastery".
//     opts.position  lcu: "top" (default) | "bottom" | "right" | "left" |
//                    "auto"; flips when it does not fit.
//     opts.variant   "v13" → #1a1c21 background (Reforged V13.10+).
//     opts.system    true → one-line LCU system tooltip (small caret).
//     opts.caret     false → no caret (lcu).
//     opts.width     fixed px width.   opts.className  extra class(es).
//   LolTooltip.move(evt)  reposition a cursor-following tooltip.
//   LolTooltip.hide()
//   LolTooltip.attach(target, htmlOrFn(el), skin, opts) — binds hover/focus.
//   Markup attributes (no JS needed): data-lol-tip="text" [data-lol-tip-title]
//   [data-lol-tip-pos] [data-lol-tip-skin].
// ---------------------------------------------------------------------------

var LolTooltip = window.LolTooltip = (function(){
    var el = null, content = null, caret = null, sub = null;
    var state = { mode: null, anchor: null, visible: false };
    var MARGIN = 8, CURSOR_DX = 16, CURSOR_DY = 16;

    function ensure() {
        if (el) return el;
        el = document.createElement("div");
        el.id = "lol-tt";
        el.className = "lol-tt";
        el.setAttribute("role", "tooltip");
        el.setAttribute("aria-hidden", "true");
        content = document.createElement("div");
        content.className = "lol-tt-content";
        sub = document.createElement("span");
        sub.className = "lol-tt-sub";
        caret = document.createElement("span");
        caret.className = "lol-tt-caret";
        el.appendChild(content);
        el.appendChild(sub);
        el.appendChild(caret);
        document.body.appendChild(el);
        return el;
    }

    function toElement(x) {
        if (!x) return null;
        if (x.jquery) return x[0] || null;
        if (x.nodeType === 1) return x;
        return null;
    }
    function isEvent(x) { return !!x && typeof x.clientX === "number"; }
    function defaultSkin() {
        return document.body && document.body.getAttribute("data-client") === "lcu" ? "lcu" : "air-mastery";
    }
    function viewport() {
        return { w: document.documentElement.clientWidth || window.innerWidth, h: window.innerHeight };
    }

    function placeAtCursor(evt) {
        var vp = viewport(), w = el.offsetWidth, h = el.offsetHeight;
        var x = evt.clientX + CURSOR_DX, y = evt.clientY + CURSOR_DY;
        if (x + w > vp.w - MARGIN) x = evt.clientX - w - 12;
        if (y + h > vp.h - MARGIN) y = evt.clientY - h - 12;
        el.style.left = Math.max(4, Math.round(x)) + "px";
        el.style.top = Math.max(4, Math.round(y)) + "px";
    }

    function placeAnchored(anchor, pref, withCaret, isAir) {
        var vp = viewport(), w = el.offsetWidth, h = el.offsetHeight;
        var r = anchor.getBoundingClientRect();
        if (isAir) {
            // AIR without a cursor (keyboard focus, or a caller that passed
            // an element): hang below the element, left edges aligned, the
            // way the cursor-following tip sits below-right of the pointer.
            // Clamp at the right edge; go above when there is no room below.
            var ax = r.left, ay = r.bottom + 4;
            if (ax + w > vp.w - MARGIN) ax = vp.w - MARGIN - w;
            if (ay + h > vp.h - MARGIN) ay = r.top - h - 4;
            el.style.left = Math.max(4, Math.round(ax)) + "px";
            el.style.top = Math.max(4, Math.round(ay)) + "px";
            return;
        }
        var system = el.classList.contains("is-system");
        var gap = withCaret ? (system ? 10 : 14) : 6;
        var fits = {
            top: r.top - gap - h >= MARGIN,
            bottom: r.bottom + gap + h <= vp.h - MARGIN,
            right: r.right + gap + w <= vp.w - MARGIN,
            left: r.left - gap - w >= MARGIN
        };
        var opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
        var order = (pref === "auto" || !opposite[pref])
            ? ["top", "bottom", "right", "left"]
            : [pref, opposite[pref], "top", "bottom", "right", "left"];
        var pos = order[0];
        for (var i = 0; i < order.length; i++) if (fits[order[i]]) { pos = order[i]; break; }

        var x, y, caretOff;
        var caretLen = system ? 16 : 24;
        if (pos === "top" || pos === "bottom") {
            x = r.left + r.width / 2 - w / 2;
            x = Math.min(Math.max(MARGIN, x), vp.w - w - MARGIN);
            y = pos === "top" ? r.top - gap - h : r.bottom + gap;
            caretOff = r.left + r.width / 2 - x - 2 - caretLen / 2;          // padding-box coords
            caretOff = Math.min(Math.max(6, caretOff), w - 4 - caretLen - 6);
        } else {
            y = r.top + r.height / 2 - h / 2;
            y = Math.min(Math.max(MARGIN, y), vp.h - h - MARGIN);
            x = pos === "right" ? r.right + gap : r.left - gap - w;
            // rotated caret: its box is caretLen wide before rotation; centre on the anchor
            caretOff = r.top + r.height / 2 - y - 2 - (system ? 5.5 : 7.5);
            caretOff = Math.min(Math.max(6, caretOff), h - 4 - caretLen);
        }
        el.setAttribute("data-pos", pos);
        el.style.setProperty("--tt-caret", Math.round(caretOff) + "px");
        el.style.left = Math.round(x) + "px";
        el.style.top = Math.round(y) + "px";
    }

    function show(anchorOrEvent, html, skin, opts) {
        opts = opts || {};
        ensure();
        skin = skin || defaultSkin();
        var anchor = toElement(anchorOrEvent);
        var evt = !anchor && isEvent(anchorOrEvent) ? anchorOrEvent : null;
        var isAir = skin !== "lcu";
        if (!isAir && !anchor && evt) {
            var ct = evt.currentTarget;
            anchor = (ct && ct.nodeType === 1) ? ct : (evt.target && evt.target.nodeType === 1 ? evt.target : null);
        }
        state.mode = (isAir && evt && opts.follow !== false) ? "cursor" : (anchor ? "anchor" : "cursor");
        state.anchor = anchor;

        var withCaret = !isAir && state.mode === "anchor" && opts.caret !== false;
        el.className = "lol-tt" + (opts.system ? " is-system" : "") + (withCaret ? " has-caret" : "")
            + (opts.className ? " " + opts.className : "") + (state.visible ? " is-visible" : "");
        el.setAttribute("data-skin", skin);
        if (opts.variant) el.setAttribute("data-variant", opts.variant); else el.removeAttribute("data-variant");
        el.setAttribute("data-pos", opts.position && opts.position !== "auto" ? opts.position : "top");
        el.style.width = opts.width ? opts.width + "px" : "";
        if (html && html.nodeType) { content.innerHTML = ""; content.appendChild(html); }
        else content.innerHTML = html == null ? "" : String(html);

        if (state.mode === "cursor" && evt) placeAtCursor(evt);
        else if (anchor) placeAnchored(anchor, opts.position || (isAir ? "bottom" : "top"), withCaret, isAir);

        el.classList.add("is-visible");
        el.setAttribute("aria-hidden", "false");
        state.visible = true;
        return el;
    }

    function move(evt) {
        if (!state.visible || state.mode !== "cursor" || !isEvent(evt)) return;
        placeAtCursor(evt);
    }

    function hide() {
        if (!el) return;
        el.classList.remove("is-visible");
        el.setAttribute("aria-hidden", "true");
        state.visible = false;
        state.anchor = null;
    }

    function attach(target, htmlOrFn, skin, opts) {
        var nodes = target && target.jquery ? target.toArray()
            : (target && target.length !== undefined && !target.nodeType ? Array.prototype.slice.call(target) : [target]);
        nodes.forEach(function(node){
            if (!node || node.nodeType !== 1) return;
            var render = function(e){
                var html = typeof htmlOrFn === "function" ? htmlOrFn(node, e) : htmlOrFn;
                if (html == null || html === false) return;
                show(e && e.type !== "focus" ? e : node, html, skin, opts);
            };
            node.addEventListener("mouseenter", render);
            node.addEventListener("focus", render);
            node.addEventListener("mousemove", function(e){ move(e); });
            node.addEventListener("mouseleave", hide);
            node.addEventListener("blur", hide);
        });
    }

    return {
        show: show, move: move, hide: hide, attach: attach,
        element: function(){ return ensure(); },
        isVisible: function(){ return state.visible; }
    };
})();

// data-lol-tip="…" hover hints (header controls, disabled tabs). Markup only.
// lcu skin (default): anchored to the element with a caret. air-* skins
// (data-lol-tip-skin="air-mastery", e.g. the AIR sheet's unavailable Runes
// pill): follow the cursor like every AIR tooltip; on keyboard focus they
// hang below the element, left-aligned.
function lolTipHtmlFor(node) {
    var title = node.getAttribute("data-lol-tip-title");
    var body = node.getAttribute("data-lol-tip");
    if (title) return '<div class="tt-title">' + lolEscapeHtml(title) + '</div><div class="tt-body">' + lolEscapeHtml(body) + "</div>";
    return lolEscapeHtml(body);
}
function lolInitTipAttributes() {
    var current = null, currentAir = false, lastDown = null;
    var skinOf = function(node){ return node.getAttribute("data-lol-tip-skin") || "lcu"; };
    // evt: the mouse event that brought the pointer here (null = keyboard).
    var showFor = function(node, evt){
        var skin = skinOf(node);
        current = node;
        currentAir = /^air/.test(skin);
        LolTooltip.show(currentAir && evt ? evt : node, lolTipHtmlFor(node), skin, {
            position: node.getAttribute("data-lol-tip-pos") || "bottom",
            system: !node.getAttribute("data-lol-tip-title"),
            className: "is-hint"                              // centred, 12px title (LCU hints)
        });
    };
    document.addEventListener("mouseover", function(e){
        var node = lolClosest(e.target, "[data-lol-tip]");
        if (node && node !== current) showFor(node, e);
    });
    document.addEventListener("mousemove", function(e){
        if (current && currentAir) LolTooltip.move(e);      // no-op unless cursor mode
    });
    document.addEventListener("mouseout", function(e){
        if (!current) return;
        var to = e.relatedTarget;
        if (to && current.contains(to)) return;
        if (lolClosest(e.target, "[data-lol-tip]") !== current) return;
        current = null;
        LolTooltip.hide();
    });
    document.addEventListener("focusin", function(e){
        var node = lolClosest(e.target, "[data-lol-tip]");
        if (!node) return;
        // Focus that follows a click re-shows the hint where the pointer is
        // (AIR: at the cursor, not jumping to the keyboard anchor).
        var byPointer = lastDown && Date.now() - lastDown.t < 600;
        showFor(node, byPointer ? lastDown.evt : null);
    });
    document.addEventListener("focusout", function(e){
        if (current && lolClosest(e.target, "[data-lol-tip]") === current) { current = null; LolTooltip.hide(); }
    });
    document.addEventListener("mousedown", function(e){
        lastDown = { t: Date.now(), evt: e };
        if (current) { current = null; LolTooltip.hide(); }
    }, true);
}

// ---------------------------------------------------------------------------
// 4. LolToast — ONE toast for every page. LolToast.show(msg[, {duration}])
// Uses #toast.lol-toast from the page (or creates it). Shared wording:
// LolToast.COPIED / LolToast.COPY_FAILED; older per-page strings are mapped
// onto them so every page says the same thing.
// ---------------------------------------------------------------------------

var LolToast = window.LolToast = (function(){
    var timer = null;
    var COPIED = "URL copied to clipboard", COPY_FAILED = "Copy failed";
    var ALIASES = { "URL copied": COPIED, "Link copied": COPIED, "Copied": COPIED };
    function ensure() {
        var el = document.getElementById("toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "toast";
            el.setAttribute("role", "status");
            el.setAttribute("aria-live", "polite");
            document.body.appendChild(el);
        }
        if (!el.classList.contains("lol-toast")) el.classList.add("lol-toast");
        return el;
    }
    function show(msg, opts) {
        var el = ensure();
        msg = msg == null ? "" : String(msg);
        el.textContent = ALIASES.hasOwnProperty(msg) ? ALIASES[msg] : msg;
        el.classList.add("visible");
        if (timer) clearTimeout(timer);
        timer = setTimeout(function(){ el.classList.remove("visible"); }, (opts && opts.duration) || 2000);
    }
    function hide() {
        var el = document.getElementById("toast");
        if (el) el.classList.remove("visible");
    }
    return { show: show, hide: hide, COPIED: COPIED, COPY_FAILED: COPY_FAILED };
})();

// ---------------------------------------------------------------------------
// 5. LCU framed-dropdown option list. Mouse users get the LCU list instead of
// the native popup for select.lcu-select; the <select> stays the source of
// truth (value + bubbling "change"), so jQuery handlers keep working.
// ---------------------------------------------------------------------------

var LolDropdown = window.LolDropdown = (function(){
    var list = null, openSel = null;
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    function close() {
        if (list && list.parentNode) list.parentNode.removeChild(list);
        if (openSel) openSel.classList.remove("is-open");
        list = null;
        openSel = null;
    }

    function choose(sel, index) {
        var changed = sel.selectedIndex !== index;
        close();
        if (!changed) return;
        sel.selectedIndex = index;
        var ev;
        try { ev = new Event("change", { bubbles: true }); }
        catch (e) { ev = document.createEvent("HTMLEvents"); ev.initEvent("change", true, false); }
        sel.dispatchEvent(ev);
    }

    function open(sel) {
        close();
        var r = sel.getBoundingClientRect();
        list = document.createElement("div");
        list.className = "lcu-dropdown-list";
        list.setAttribute("role", "listbox");
        for (var i = 0; i < sel.options.length; i++) {
            var o = sel.options[i];
            var row = document.createElement("div");
            row.className = "lcu-dropdown-option"
                + (i === sel.selectedIndex ? " is-selected" : "")
                + (o.disabled ? " is-disabled" : "");
            row.setAttribute("role", "option");
            row.setAttribute("data-index", i);
            row.textContent = o.text;
            list.appendChild(row);
        }
        document.body.appendChild(list);
        list.style.minWidth = Math.round(r.width) + "px";
        var vpw = document.documentElement.clientWidth, vph = window.innerHeight;
        var lw = list.offsetWidth, lh = list.offsetHeight;
        var left = Math.min(r.left, vpw - lw - 4);
        var top = r.bottom - 1;
        if (top + lh > vph - 4 && r.top - lh > 4) top = r.top - lh + 1;
        list.style.left = Math.max(4, Math.round(left)) + "px";
        list.style.top = Math.round(top) + "px";
        var selRow = list.querySelector(".is-selected");
        if (selRow && list.scrollHeight > list.clientHeight) {
            // Centre the selected row, snapped to a row edge so a long list
            // (Season, S8) shows whole rows: scroll to the top of a row's
            // text, past its separator line (base.css fits 10 rows).
            var want = selRow.offsetTop - (list.clientHeight - selRow.offsetHeight) / 2, top = 0;
            for (var k = 1; k < list.children.length; k++) {
                var rk = list.children[k], at = rk.offsetTop + rk.clientTop;
                if (at - want > rk.offsetHeight / 2) break;
                top = at;
            }
            list.scrollTop = Math.min(top, list.scrollHeight - list.clientHeight);
        }
        list.addEventListener("mousedown", function(e){ e.preventDefault(); });
        list.addEventListener("click", function(e){
            var row = lolClosest(e.target, ".lcu-dropdown-option");
            if (!row || row.classList.contains("is-disabled")) return;
            choose(sel, parseInt(row.getAttribute("data-index"), 10));
        });
        sel.classList.add("is-open");
        openSel = sel;
    }

    function init() {
        if (coarse) return;                                  // native picker on touch
        document.addEventListener("mousedown", function(e){
            var sel = lolClosest(e.target, "select.lcu-select");
            if (list && !sel && !lolClosest(e.target, ".lcu-dropdown-list")) close();
            if (!sel || e.button !== 0 || sel.disabled || sel.multiple) return;
            e.preventDefault();
            if (openSel === sel) { close(); return; }
            sel.focus();
            open(sel);
        });
        document.addEventListener("keydown", function(e){
            if (!list) return;
            if (e.key === "Escape") { e.preventDefault(); close(); return; }
            close();                                          // keyboard → native behaviour
        });
        window.addEventListener("resize", close);
        window.addEventListener("scroll", function(e){
            if (list && e.target !== list && !(list.contains && list.contains(e.target))) close();
        }, true);
        window.addEventListener("blur", close);
    }

    return { init: init, close: close, isOpen: function(){ return !!list; } };
})();

// ---------------------------------------------------------------------------
// 6. Stage scale-to-fit. <div class="lol-stage" [data-stage-width="1012"]
// [data-stage-height] [data-stage-min-scale="0.5"]
// [data-stage-bleed="air:7 15"]> wraps a fixed-size calculator (no width
// attribute = its own laid-out width). Order of resort when it is too wide:
// spill into the parent's side padding (down to a 4px gutter) at scale 1,
// then scale down (never up), and below the min scale pan horizontally
// inside the column (.is-panning, with .at-start / .at-end for the edge
// fades). base.css §3.
//
// data-stage-bleed="[era:]left[ right]" (px; one value = both sides): the
// outer px of the content are expendable dark margin (the AIR sheet art: 7
// CSS px of #010101-range on the left, 15 on the right). They may run past
// the window edge (.site-main clips them), so only the rest has to keep the
// 4px gutter: an AIR sheet up to 1279px wide stays at scale 1 in a 1265px
// window (1280 minus a classic scrollbar). Centred as before; shifted only
// when centring would put the content inside the gutter. "air:" = only
// while body[data-client="air"] (the same stages hold edge-to-edge LCU
// calculators in the lcu era).
// ---------------------------------------------------------------------------

var LolStage = window.LolStage = (function(){
    var observer = null, pending = false;

    function innerOf(stage) {
        var inner = null;
        for (var c = stage.firstElementChild; c; c = c.nextElementSibling)
            if (c.classList.contains("lol-stage-inner")) { inner = c; break; }
        if (!inner) {
            inner = document.createElement("div");
            inner.className = "lol-stage-inner";
            while (stage.firstChild) inner.appendChild(stage.firstChild);
            stage.appendChild(inner);
        }
        return inner;
    }

    var MIN_GUTTER = 4;          // px kept free at each side before scaling
    var DEFAULT_MIN_SCALE = 0.5; // below this the stage pans instead

    // data-stage-bleed="[era:]left[ right]" → {l, r} px ({0, 0} when absent,
    // malformed or for another era). One value = both sides.
    function bleedOf(stage) {
        var none = { l: 0, r: 0 };
        var m = /^\s*(?:(air|lcu)\s*:\s*)?(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?\s*$/
            .exec(stage.getAttribute("data-stage-bleed") || "");
        if (!m) return none;
        if (m[1] && !(document.body && document.body.getAttribute("data-client") === m[1])) return none;
        var l = parseFloat(m[2]) || 0;
        return { l: l, r: m[3] != null ? (parseFloat(m[3]) || 0) : l };
    }

    // Pan wells: .at-start / .at-end drive the edge fades (base.css §3).
    function panEdges(stage) {
        if (!stage.classList.contains("is-panning")) {
            stage.classList.remove("at-start", "at-end");
            return;
        }
        var x = stage.scrollLeft, max = stage.scrollWidth - stage.clientWidth;
        stage.classList.toggle("at-start", x <= 1);
        stage.classList.toggle("at-end", x >= max - 1);
    }
    function onPanScroll(e) { panEdges(e.currentTarget); }

    function fitOne(stage) {
        var inner = innerOf(stage);
        var W = parseFloat(stage.getAttribute("data-stage-width")) || 0;
        var H = parseFloat(stage.getAttribute("data-stage-height")) || 0;
        var minScale = parseFloat(stage.getAttribute("data-stage-min-scale"));
        if (!(minScale > 0 && minScale <= 1)) minScale = DEFAULT_MIN_SCALE;
        if (W) inner.style.width = W + "px";
        var parent = stage.parentNode;
        var cs = window.getComputedStyle(parent);
        var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
        var full = parent.clientWidth;                       // incl. padding
        var column = full - padL - padR;                     // padded column
        var w = W || inner.offsetWidth;
        var h = Math.max(H, inner.offsetHeight);
        // Gutter first: the stage may spill into the parent's side padding
        // (down to MIN_GUTTER a side) at scale 1; only then does it scale.
        // Bleed px are not content: only w - bleed.l - bleed.r has to fit.
        var bleed = bleedOf(stage);
        if (bleed.l + bleed.r >= w) bleed = { l: 0, r: 0 };
        var room = Math.max(column, full - 2 * MIN_GUTTER);
        var s = w > 0 && room > 0 ? Math.min(1, room / (w - bleed.l - bleed.r)) : 1;
        var panning = s < minScale;
        if (panning) s = minScale;
        var vw = Math.floor(w * s), vh = Math.ceil(h * s);
        inner.style.transform = s < 1 ? "scale(" + s + ")" : "";
        stage.classList.toggle("is-panning", panning);
        if (panning) {
            // Pan well the width of the padded column; the page never h-scrolls.
            stage.style.width = Math.max(0, Math.floor(column)) + "px";
            stage.style.marginLeft = stage.style.marginRight = "";
            stage.style.height = vh + "px";
            var bar = stage.offsetHeight - stage.clientHeight;  // classic scrollbar
            if (bar > 0) stage.style.height = (vh + bar) + "px";
            if (!stage._lolPanBound) {
                stage._lolPanBound = true;
                stage.addEventListener("scroll", onPanScroll, { passive: true });
            }
        } else {
            // Centred. A bled stage may overhang the window (clipped by
            // .site-main); if centring would push its content (inside the
            // bleed) closer than MIN_GUTTER to an edge, shift it just
            // enough — only uneven bleeds (7 left, 15 right) ever need it.
            var spill = Math.max(0, vw - column);
            var dx = 0;
            if (bleed.l || bleed.r) {
                var x0 = (full - vw) / 2;                    // centred box left
                var lo = MIN_GUTTER - bleed.l * s - x0;
                var hi = full - MIN_GUTTER - vw + bleed.r * s - x0;
                dx = lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, 0));
            }
            stage.style.width = vw + "px";
            stage.style.height = vh + "px";
            stage.style.marginLeft = (spill || dx) ? (-spill / 2 + dx) + "px" : "";
            stage.style.marginRight = (spill || dx) ? (-spill / 2 - dx) + "px" : "";
        }
        panEdges(stage);
        stage.style.setProperty("--lol-stage-scale", s);
        stage.setAttribute("data-stage-scale", s.toFixed(4));
        stage.classList.add("is-fitted");
    }

    function fit() {
        pending = false;
        var stages = document.querySelectorAll(".lol-stage");
        for (var i = 0; i < stages.length; i++) fitOne(stages[i]);
    }

    function schedule() {
        if (pending) return;
        pending = true;
        (window.requestAnimationFrame || setTimeout)(fit);
    }

    function init() {
        fit();
        window.addEventListener("resize", schedule);
        document.addEventListener("lol:client-era", schedule);   // era-scoped bleed
        if (window.ResizeObserver) {
            observer = new ResizeObserver(schedule);
            var stages = document.querySelectorAll(".lol-stage");
            for (var i = 0; i < stages.length; i++) observer.observe(innerOf(stages[i]));
        }
        window.addEventListener("load", schedule);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    }

    // Current scale of the stage containing `el` (1 when not staged).
    function scale(el) {
        var stage = el && el.nodeType === 1 ? lolClosest(el, ".lol-stage") : null;
        return stage ? (parseFloat(stage.getAttribute("data-stage-scale")) || 1) : 1;
    }

    return { init: init, fit: fit, scale: scale };
})();

// ---------------------------------------------------------------------------
// 7. LCU flat-button click animation (.is-click for 450ms).
// ---------------------------------------------------------------------------

function lolInitFlatButtons() {
    document.addEventListener("click", function(e){
        var btn = lolClosest(e.target, ".lcu-btn");
        if (!btn || btn.disabled || btn.classList.contains("disabled")) return;
        btn.classList.remove("is-click");
        void btn.offsetWidth;                                  // restart the animation
        btn.classList.add("is-click");
        clearTimeout(btn._lolClickTimer);
        btn._lolClickTimer = setTimeout(function(){ btn.classList.remove("is-click"); }, 450);
    });
}

// ---------------------------------------------------------------------------
// Boot. DOMContentLoaded listeners registered here run before the jQuery
// ready handlers of the calculators (nav.js loads first).
// ---------------------------------------------------------------------------

lolOnReady(function(){
    if (!document.body.getAttribute("data-client")) setClientEra("air");
    LolStage.init();
    LolDropdown.init();
    lolInitTipAttributes();
    lolInitFlatButtons();
});
