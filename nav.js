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
//   LolPatchNotes.open() / .close() / .isOpen() / .entry()   header "What changed"
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
        // a control whose own flyout is open (What changed) shows no hint
        if (node.getAttribute("aria-expanded") === "true") return;
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
// 8. LolPatchNotes — the header's "What changed" / patch-notes control.
// button.header-notes (each page's header markup, right after the Patch
// dropdown, with a "Changes" label.header-notes-label beside it that
// base.css shows only where the bar has room) carries a gold dot when the
// patch on screen changed this page (registry entry.notes.count > 0) and
// opens an LCU flyout (base.css §9): "<patch> · What changed", the page's
// change notes for that patch (summary + bullets from
// data/notes/<page>-<season>.js, LolData.loadNotes: loaded when the flyout
// first opens, or prefetched on idle after the page load) and links to
// Riot's patch notes (official, else the archived copy) and to the wiki
// page, in a new tab. A dot, not a number: the bullets are a digest (a
// rework of 39 runes is a few lines), so their count is not a change count.
//
// It follows the header's Patch dropdown: lol-data.js fillPatchSelect fires
// "lol:patch-select" whenever a page (re)fills it, so an in-page switch
// updates the button, pulses it when the new patch has changes (.is-pulse)
// and re-renders an open flyout. The flyout stays open while the Season and
// Patch dropdowns are used, so stepping through patches shows each one's
// notes in place: a click on either dropdown (or on its LCU option list)
// does not count as outside, and Shift+Tab from the flyout's first stop
// goes to the button and on to the dropdowns with the flyout still open.
//
// Non-modal (no focus trap): opening moves focus into the flyout; Tab from
// the open button enters it; Esc closes it (focus back on the button when
// it was in the flyout or on the button); Tab past the last link closes it
// and moves on to the next header control. Focus or a click anywhere but
// the flyout, the button and its label and the two dropdowns closes it, as
// does the button again. A click in the header (a tab, Link, Share) then
// also does its own job; anywhere else the click only closes the flyout
// (its press, release, click and context menu are swallowed), so the click
// that dismisses the notes never also adds a mastery point or places a
// rune. A body that overflows is a scroller and the flyout's first Tab stop
// (tabindex 0, role region, also in browsers that would not make it
// focusable on their own): opening focuses it, so the arrow / Page / Home /
// End keys scroll the notes, not the page behind, and Shift+Tab from it
// goes back to the button like from any first stop. Notes that fit leave
// focus on the dialog, where those keys (and Space) do nothing: with focus
// anywhere in the flyout they never scroll the page behind it.
// Phones (≤559px viewport, or ≤480px tall with the two-row header: a phone
// held sideways, where the flyout under the button would show a line or
// two): a bottom sheet over a scrim that leaves the header uncovered
// (html.lol-notes-sheet lifts it over the scrim; the sheet stops 8px under
// it), so the Season and Patch dropdowns stay usable with the sheet open.
//
// No toast on a patch switch: LolToast is the one, non-interactive status
// line, and a switch already uses it for what did not carry over ("3 points
// could not carry over to V4.20", "page reset"); a second message would hide
// those or be hidden by them. The dot + pulse next to the dropdown carry the
// hint instead.
// ---------------------------------------------------------------------------

var LolPatchNotes = window.LolPatchNotes = (function(){
    var SHEET_MAX = 559, SHEET_MAX_H = 480, TWO_ROW_MAX = 959, WIDTH = 360, MARGIN = 8, GAP = 14, CARET = 24;
    var PAGE_NAMES = { masteries: "Masteries", runes: "Runes", reforged: "Runes Reforged" };
    var KINDS = { launch: "Launch", rework: "Rework", "season-start": "Season start", "season-end": "Season end", "no-change": "No changes" };
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // Clicks / focus on these keep the flyout open (with the button and the flyout itself).
    var KEEP_OPEN = ".legacy-header .header-notes-label, .legacy-header select.header-season, .legacy-header select.header-patch, .lcu-dropdown-list";
    var TIP_TITLE = "What changed · Patch notes";
    var SCROLL_KEYS = { ArrowDown: 1, ArrowUp: 1, PageDown: 1, PageUp: 1, Home: 1, End: 1, " ": 1, Spacebar: 1 };
    var current = null, btn = null, pop = null, scrim = null, open = false, sheet = false;
    var token = 0, pulseTimer = null, inited = false;

    function button() {
        if (!btn || !document.documentElement.contains(btn)) btn = document.querySelector(".legacy-header .header-notes");
        return btn;
    }
    function countOf(e) { return e && e.notes ? (e.notes.count | 0) : 0; }
    function pageOf(e) { return (e && LolPatches.pageOfId(e.id)) || LolPatches.page(); }

    // The button's accessible name and hover hint (the dot is aria-hidden).
    function labelOf(e, n) {
        if (!e) return "What changed, with patch notes";
        return "What changed in " + e.patch + (n ? "" : ": no changes on this page") + ", with patch notes";
    }
    function hintOf(e, n) {
        return n ? "What " + e.patch + " changed on this page, with links to its patch notes"
            : "No changes on this page in " + e.patch + "; links to its patch notes";
    }

    function syncButton() {
        var b = button();
        if (!b) return;
        var e = current, n = countOf(e);
        var dot = b.querySelector(".header-notes-badge");
        if (dot) {
            if (dot.textContent) dot.textContent = "";
            if (n) dot.removeAttribute("hidden"); else dot.setAttribute("hidden", "hidden");
        }
        b.classList.toggle("has-changes", n > 0);
        b.setAttribute("aria-label", labelOf(e, n));
        b.setAttribute("data-lol-tip-title", TIP_TITLE);
        if (e) b.setAttribute("data-lol-tip", hintOf(e, n));
    }

    function pulse() {
        var b = button();
        if (!b) return;
        b.classList.remove("is-pulse");
        void b.offsetWidth;                                   // restart the animation
        b.classList.add("is-pulse");
        clearTimeout(pulseTimer);
        pulseTimer = setTimeout(function(){ b.classList.remove("is-pulse"); }, 1500);
    }

    function prefetch() {
        if (current && window.LolData && LolData.prefetchNotes) LolData.prefetchNotes([current]);
    }

    function setEntry(e) {
        var prev = current;
        current = e || null;
        syncButton();
        if (prev && current && prev.id !== current.id) {
            if (countOf(current)) pulse();
            if (prev.season !== current.season && document.readyState === "complete") prefetch();
        }
        if (open) render();
    }

    // The header's Patch dropdown was (re)filled: follow the patch it shows.
    function onPatchSelect(ev) {
        var d = ev && ev.detail || {};
        var sel = d.select;
        if (!sel || sel.nodeType !== 1 || !sel.classList.contains("header-patch") || !lolClosest(sel, ".legacy-header")) return;
        setEntry(d.entry || null);
    }

    // --- flyout --------------------------------------------------------------
    // Built once, hidden, at init: aria-controls / aria-describedby point at a
    // real element from the start.
    function ensure() {
        if (pop) return pop;
        scrim = document.createElement("div");
        scrim.className = "lol-notes-scrim";
        scrim.setAttribute("hidden", "hidden");
        pop = document.createElement("div");
        pop.id = "lol-notes";
        pop.className = "lol-notes";
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-modal", "false");
        pop.setAttribute("aria-labelledby", "lol-notes-title");
        pop.setAttribute("aria-describedby", "lol-notes-body");
        pop.setAttribute("tabindex", "-1");
        pop.setAttribute("hidden", "hidden");
        pop.innerHTML = '<div class="lol-notes-frame">'
            + '<div class="lol-notes-head"><h2 class="lol-notes-title" id="lol-notes-title"></h2><p class="lol-notes-meta"></p></div>'
            + '<div class="lol-notes-body" id="lol-notes-body"></div>'
            + '<div class="lol-notes-foot"></div>'
            + '<button type="button" class="lcu-circle-btn lol-notes-close" aria-label="Close"></button>'
            + '</div><span class="lol-notes-sub" aria-hidden="true"></span><span class="lol-notes-caret" aria-hidden="true"></span>';
        document.body.appendChild(scrim);
        document.body.appendChild(pop);
        pop.addEventListener("keydown", onKey);
        // Focus goes back to the button for keyboard use only (click detail 0):
        // after a tap it would only raise the button's hint over the page.
        pop.querySelector(".lol-notes-close").addEventListener("click", function(e){ close(!e.detail); });
        scrim.addEventListener("click", function(){ close(false); });
        var body = pop.querySelector(".lol-notes-body");
        body.addEventListener("scroll", function(){ syncMore(body); }, { passive: true });
        var b = button();
        if (b) b.setAttribute("aria-controls", pop.id);
        return pop;
    }

    function formatDate(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
        return m ? (+m[3]) + " " + MONTHS[+m[2] - 1] + " " + m[1] : "";
    }

    function linkHtml(href, text, label) {
        return '<a class="lcu-link lol-notes-link" href="' + lolEscapeHtml(href) + '" target="_blank" rel="noopener noreferrer" aria-label="'
            + lolEscapeHtml(label) + '"><span class="lcu-link-text">' + lolEscapeHtml(text) + "</span></a>";
    }

    function footHtml(e) {
        var n = e.notes || {}, out = [];
        if (n.official) out.push(linkHtml(n.official, "Patch notes", "Riot's " + e.patch + " patch notes (opens in a new tab)"));
        else if (n.officialArchived) out.push(linkHtml(n.officialArchived, "Patch notes", "Riot's " + e.patch
            + " patch notes, archived copy on the Wayback Machine (opens in a new tab)") + '<span class="lol-notes-via">archived</span>');
        if (n.wiki) out.push(linkHtml(n.wiki, "Wiki", e.patch + " on the League of Legends Wiki (opens in a new tab)"));
        return out.join("");
    }

    function metaText(e, rec) {
        var parts = [PAGE_NAMES[pageOf(e)] || ""];
        if (rec && KINDS[rec.kind] && rec.kind !== "no-change") parts.push(KINDS[rec.kind]);
        var d = formatDate(e.date);
        if (d) parts.push(d);
        return parts.filter(Boolean).join(" · ");
    }

    // For the "said twice" test: case, spacing, punctuation (",", ";", ":",
    // ".", brackets, quotes; a list "and" reads as a comma) and the approx.
    // flag do not count. Kept: letters, digits and the signs that carry a
    // value (% + / – — → ×); hyphen variants read as "-". The result is
    // padded with spaces so containment is checked on whole words. points:
    // a point inside a word stays (as "\u2024": "3.62", "v11.18"), so
    // restates reads a value or a patch whole.
    function sameText(s, points) {
        var t = String(s || "").replace(/\s*\(approx\.\)\s*$/i, "").toLowerCase().replace(/[\u2010\u2011\u2012\u2212]/g, "-");
        if (points) t = t.replace(/([0-9a-z])\.(?=[0-9a-z])/g, "$1\u2024");
        return " " + t.replace(/[^0-9a-z\u00c0-\u024f%+\/\u2013\u2014\u2192\u00d7\u2024-]+/g, " ")
            .replace(/ and /g, " ").replace(/\s+/g, " ").trim() + " ";
    }
    function wordsOf(s, points) { return sameText(s, points).split(" ").filter(Boolean); }

    // Line a says what line b says: every word of b that holds a digit
    // ("150", "2-17", "8%") is a word of a too, and so are at least 80% of
    // b's words ("shield cap" covers "shield"; "based on level" covers all
    // of "by level" but "by").
    function covers(a, b) {
        var have = {}, need = wordsOf(b), hit = 0;
        wordsOf(a).forEach(function(w){ have[w] = 1; });
        for (var i = 0; i < need.length; i++) {
            if (have[need[i]]) hit++;
            else if (/\d/.test(need[i])) return false;        // a value the other line does not hold
        }
        return need.length > 0 && hit >= 0.8 * need.length;
    }

    // The labels a line can lead with (README: "Tooltip fix: …"), and the
    // season-end clause that the meta line already says ("Season end").
    var LABEL = /^\s*(tooltip (?:fix|only|wording)|event runes? only)\s*:\s*/i;
    var SEASON_END = /\s*[;,]?\s*\blast patch of Season \d+\b\s*(?=[;,]|$)/i;
    var PATCH_REF = /^v\d+(?:\u2024[0-9a-z]+)+$/;             // "V11.18" names a patch, not a value

    // Summary s says bullet b's change in other framing: with a leading
    // label ("Tooltip fix:", "Event rune only:"; one on both lines must be
    // the same) and the rune name b starts with set aside, every number of
    // s is in b, and each part of s (between "," and ";") that holds a value
    // reads in b word for word from that value on ("3.62 → 3.08 armor
    // penetration", "60% Movement Speed over 1s"), with the words before it
    // in b too. A part that only names a patch ("shows its V11.18 buff")
    // needs that patch in b; one with no number, 80% of its words. At least
    // one part holds a value.
    function restates(b, s) {
        var lb = LABEL.exec(b), ls = LABEL.exec(s);
        if (lb && ls && lb[1].toLowerCase() !== ls[1].toLowerCase()) return false;
        var bw = wordsOf(lb ? b.slice(lb[0].length) : b, true), bs = " " + bw.join(" ") + " ";
        var have = {}, name = {}, i;
        bw.forEach(function(w){ have[w] = 1; });
        for (i = 0; i < bw.length && !/\d/.test(bw[i]); i++) name[bw[i]] = 1;
        var parts = (ls ? s.slice(ls[0].length) : s).split(/[,;](?=\s|$)/).map(function(p){ return wordsOf(p, true); }).filter(function(p){ return p.length; });
        if (parts.length) { for (i = 0; i < parts[0].length && name[parts[0][i]]; i++); parts[0] = parts[0].slice(i); }
        var values = 0;
        for (var k = 0; k < parts.length; k++) {
            var p = parts[k], at = -1, num = false, hit = 0;
            for (i = 0; i < p.length; i++) {
                if (have[p[i]]) hit++;
                if (!/\d/.test(p[i])) continue;
                if (!have[p[i]]) return false;                // a number b does not hold
                num = true;
                if (at < 0 && !PATCH_REF.test(p[i])) at = i;
            }
            if (at >= 0) {
                values++;
                if (bs.indexOf(" " + p.slice(at).join(" ") + " ") < 0) return false;
                for (i = 0; i < at; i++) if (!have[p[i]]) return false;
            } else if (!num && hit < 0.8 * p.length) return false;
        }
        return values > 0;
    }

    // What the body shows: { summary, items }. A single bullet that says
    // what the summary says (covers, or restates in other framing) is shown
    // once: the bullet (it has the detail), or the summary when that is the
    // line that says more, or when it carries the approx. flag (the flag
    // stays on screen). On a season-end record the summary's "last patch of
    // Season N" does not count: the meta line says "Season end".
    function shownOf(rec) {
        var summary = rec.summary || "", items = (rec.items || []).slice();
        if (items.length === 1 && summary) {
            var approx = /\(approx\.\)\s*$/i.test(summary);
            var said = rec.kind === "season-end" ? summary.replace(SEASON_END, "") : summary;
            if (!approx && (covers(items[0], said) || restates(items[0], said))) summary = "";   // the bullet says it, and maybe more
            else if (covers(summary, items[0])) items = [];             // the summary says it all
        }
        return { summary: summary, items: items };
    }

    // One note line as HTML: escaped, with these kept on one line (span.lol-
    // notes-nb): every token that holds an en dash ("30–90", "100–70s",
    // "(2–17"), so a range never wraps after its dash; every "Season 14", so
    // a season number never starts a line; and every arrow with the value
    // after it ("→ 6%", "→ +50", "→ 6 min", "→ 15% AP"), so "5% →" may end a
    // line but the new value never sits alone at the start of the next. A unit
    // joins only a value that does not end a clause ("\u2192 45\u2013180; AP \u2026" keeps
    // the "AP" of the next clause out of the span).
    var NB = /\u2192\s+(?:[Ss]eason \d+[^\s<>]*|[^\s<>]*[^\s<>,;:](?:\s+(?:min|gold|AP|AD)(?=[\s,;:.)]|$)[,;:.)]*)?|[^\s<>]+)|[^\s<>]*[Ss]eason \d+[^\s<>]*|[^\s<>]*\u2013[^\s<>]*/g;
    function lineHtml(t) {
        return lolEscapeHtml(t).replace(NB, function(m){ return '<span class="lol-notes-nb">' + m + "</span>"; });
    }

    // rec: the notes record, null = none for this patch (or no file to load
    // it from); state: "loading" | "error" | null
    function bodyHtml(e, rec, state) {
        if (state === "loading") return '<p class="lol-notes-status">Loading the change notes…</p>';
        if (state === "error") return '<p class="lol-notes-status">Could not load the change notes.</p>';
        if (!rec) return '<p class="lol-notes-status">No change notes for this patch yet.</p>';
        // no-change: its first item already says it ("No mastery changes
        // since V4.5 — last patch of Season 4"); the summary would repeat it.
        // Any further item (a tooltip-only edit, a store change) is a bullet
        // under it, as under a summary.
        if (rec.kind === "no-change" && rec.items && rec.items.length) {
            var rest = rec.items.slice(1);
            return '<p class="lol-notes-none">' + lineHtml(rec.items[0]) + "</p>"
                + (rest.length ? '<ul class="lol-notes-list">' + rest.map(function(t){ return "<li>" + lineHtml(t) + "</li>"; }).join("") + "</ul>" : "");
        }
        var shown = shownOf(rec);
        var html = shown.summary ? '<p class="lol-notes-summary">' + lineHtml(shown.summary) + "</p>" : "";
        if (shown.items.length) {
            html += '<ul class="lol-notes-list">' + shown.items.map(function(t){ return "<li>" + lineHtml(t) + "</li>"; }).join("") + "</ul>";
        }
        return html;
    }

    // .has-more: the body scrolls and is not at its end (a fade at the
    // bottom edge says there is more; overlay scrollbars show no thumb).
    // A body that scrolls is a Tab stop (see the header comment); one that
    // stops scrolling while focused hands focus to the dialog.
    function syncMore(body) {
        if (!body) return;
        var scrolls = body.scrollHeight - body.clientHeight > 1;
        body.classList.toggle("has-more", body.scrollHeight - body.clientHeight - body.scrollTop > 2);
        if (scrolls === (body.getAttribute("tabindex") === "0")) return;
        if (scrolls) {
            body.setAttribute("tabindex", "0");
            body.setAttribute("role", "region");
            body.setAttribute("aria-label", "Change notes");
        } else {
            var had = document.activeElement === body;
            body.removeAttribute("tabindex");
            body.removeAttribute("role");
            body.removeAttribute("aria-label");
            if (had && open) focusDialog();
        }
    }
    function scroller() {
        var body = pop && pop.querySelector(".lol-notes-body");
        return body && body.getAttribute("tabindex") === "0" ? body : null;
    }
    // Focus into the flyout: its scrolling body, else the dialog itself.
    function focusDialog() {
        var t = scroller() || pop;
        try { t.focus({ preventScroll: true }); } catch (err) { t.focus(); }
    }

    function fill(e, rec, state) {
        if (!pop) return;
        pop.querySelector(".lol-notes-title").innerHTML = '<span class="lol-notes-patch">' + lolEscapeHtml(e.patch) + "</span> · What changed";
        pop.querySelector(".lol-notes-meta").textContent = metaText(e, rec);
        var body = pop.querySelector(".lol-notes-body");
        body.innerHTML = bodyHtml(e, rec, state);
        body.scrollTop = 0;
        pop.querySelector(".lol-notes-foot").innerHTML = footHtml(e);
        if (state === "loading") pop.setAttribute("aria-busy", "true"); else pop.removeAttribute("aria-busy");
        position();
        // the notes came in after the open and they scroll: into the body
        if (open && document.activeElement === pop && scroller()) focusDialog();
    }

    function render() {
        var e = current;
        if (!pop || !e) return;
        var t = ++token;
        var rec = window.LolData && LolData.getNotes ? LolData.getNotes(e) : null;
        if (rec !== undefined) { fill(e, rec, null); return; }
        if (!e.notes || !e.notes.file) { fill(e, null, null); return; }
        fill(e, null, "loading");
        LolData.loadNotes(e).then(function(r){
            if (t === token && open) fill(e, r, null);
        }, function(){
            if (t === token && open) fill(e, null, "error");
        });
    }

    function position() {
        var b = button();
        if (!pop || !b || !open) return;
        var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
        var body = pop.querySelector(".lol-notes-body");
        // a phone: portrait (narrow), or landscape (short, with the two-row header)
        sheet = vw <= SHEET_MAX || (vh <= SHEET_MAX_H && vw <= TWO_ROW_MAX);
        pop.classList.toggle("is-sheet", sheet);
        document.documentElement.classList.toggle("lol-notes-sheet", sheet);
        if (sheet) scrim.removeAttribute("hidden"); else scrim.setAttribute("hidden", "hidden");
        if (sheet) {
            pop.style.left = pop.style.top = pop.style.width = "";
            pop.style.removeProperty("--notes-caret");
            // at most 80% of the screen and 560px, and 8px of scrim under
            // the header while it is on screen, so its dropdowns stay usable
            var hdr = document.querySelector(".legacy-header");
            var hb = hdr ? hdr.getBoundingClientRect().bottom : 0;
            var room = Math.min(vh * 0.8, 560, hb > 0 ? vh - hb - MARGIN : vh);
            pop.style.setProperty("--notes-max-h", Math.round(Math.max(160, room)) + "px");
            syncMore(body);
            return;
        }
        var r = b.getBoundingClientRect();
        var w = Math.min(WIDTH, vw - 2 * MARGIN);
        var cx = r.left + r.width / 2;
        var x = Math.min(Math.max(MARGIN, cx - w / 2), vw - w - MARGIN);
        var top = r.bottom + GAP;
        pop.style.width = w + "px";
        pop.style.left = Math.round(x + (window.pageXOffset || 0)) + "px";
        pop.style.top = Math.round(top + (window.pageYOffset || 0)) + "px";
        pop.style.setProperty("--notes-caret", Math.round(Math.min(Math.max(10, cx - x - CARET / 2), w - CARET - 10)) + "px");
        pop.style.setProperty("--notes-max-h", Math.round(Math.max(200, vh - r.bottom - GAP - 16)) + "px");
        syncMore(body);
    }

    function show() {
        var b = button();
        if (!b || !current) return;
        ensure();
        if (window.LolTooltip) LolTooltip.hide();
        if (window.LolDropdown) LolDropdown.close();
        open = true;
        pop.removeAttribute("hidden");
        b.setAttribute("aria-expanded", "true");
        render();
        pop.classList.remove("is-open");
        void pop.offsetWidth;                                 // restart the intro
        pop.classList.add("is-open");
        focusDialog();
    }

    function close(returnFocus) {
        if (!open) return;
        open = false;
        token++;
        pop.setAttribute("hidden", "hidden");
        pop.classList.remove("is-open");
        scrim.setAttribute("hidden", "hidden");
        document.documentElement.classList.remove("lol-notes-sheet");
        var b = button();
        if (b) {
            b.setAttribute("aria-expanded", "false");
            if (returnFocus) b.focus();
        }
    }

    // Part of the control: a click or focus here leaves the flyout open.
    function keepsOpen(t) {
        if (!t || t.nodeType !== 1) return false;
        var b = button();
        return (pop && pop.contains(t)) || (b && b.contains(t)) || t === scrim || !!lolClosest(t, KEEP_OPEN);
    }

    function focusables(root) {
        var sel = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.prototype.filter.call(root.querySelectorAll(sel), function(n){
            return n.offsetWidth > 0 || n.offsetHeight > 0 || n.getClientRects().length > 0;
        });
    }

    // Tab past the flyout: on to whatever follows the button in the page.
    function focusAfterButton() {
        var b = button();
        if (!b) return;
        var all = focusables(document).filter(function(n){ return !pop.contains(n); });
        var next = all[all.indexOf(b) + 1];
        (next || b).focus();
    }

    function onKey(e) {
        if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); e.stopPropagation(); close(true); return; }
        // A scroll key in the flyout never scrolls the page behind it (the
        // flyout hangs from the header and would move with the page). On the
        // dialog itself (notes that fit, or focused before the notes came
        // in): it scrolls the notes when they scroll, and moves into them,
        // else it does nothing. On a link or the close button it does nothing
        // (Space still presses the button). The scrolling notes take the keys
        // themselves (overscroll-behavior: contain).
        if (SCROLL_KEYS[e.key] && !e.altKey && !e.ctrlKey && !e.metaKey) {
            var sc = scroller(), k = e.key;
            if (e.target === pop) {
                e.preventDefault();
                if (!sc) return;
                var page = Math.max(40, sc.clientHeight - 40);
                if (k === "Home") sc.scrollTop = 0;
                else if (k === "End") sc.scrollTop = sc.scrollHeight;
                else sc.scrollTop += k === "ArrowDown" ? 40 : k === "ArrowUp" ? -40 : k === "PageUp" || e.shiftKey ? -page : page;
                focusDialog();
                return;
            }
            if (e.target !== sc && !(e.target.tagName === "BUTTON" && (k === " " || k === "Spacebar"))) { e.preventDefault(); return; }
        }
        if (e.key !== "Tab") return;
        var f = focusables(pop), at = document.activeElement;
        if (e.shiftKey) {
            // back onto the button, still open: one more Shift+Tab reaches the
            // Patch dropdown, whose arrow keys then switch patches in place
            if (at === pop || at === f[0]) { e.preventDefault(); var b = button(); if (b) b.focus(); }
        } else if (!f.length || at === f[f.length - 1]) {
            e.preventDefault();
            close(false);
            focusAfterButton();
        }
    }

    function init() {
        if (inited) return;
        inited = true;
        var b = button();
        if (!b) return;
        ensure();
        if (!current) {                                       // no fill yet (boot header failed)
            var sel = document.querySelector(".legacy-header select.header-patch");
            if (sel && sel.value) setEntry(LolPatches.entry(LolPatches.page(), sel.value));
        }
        syncButton();
        b.addEventListener("click", function(){ if (open) close(false); else show(); });
        // Tab from the open button enters the flyout (it sits at the end of the document).
        b.addEventListener("keydown", function(e){
            if (!open || e.key !== "Tab" || e.shiftKey) return;
            e.preventDefault();
            var f = focusables(pop);
            (f[0] || pop).focus();
        });
        // Light dismiss: a press outside the flyout closes it. In the header
        // it also does its own job (a tab, Link, Share; the dropdowns and the
        // button keep it open). Anywhere else it only closes it: the rest of
        // that gesture (the press itself, release, click, middle click,
        // context menu; a tap's mouse events) is swallowed, up to its click
        // or the next pointerdown or key, so the click that dismisses the
        // notes does not also add a mastery point. (A phone's sheet has the
        // scrim for that.)
        var swallow = false, swallowAt = 0;
        function dismiss(e, mouse) {
            if (!open || keepsOpen(e.target)) return;
            close(false);
            if (lolClosest(e.target, ".legacy-header")) return;
            swallow = true;
            swallowAt = Date.now();
            if (window.LolDropdown) LolDropdown.close();      // its own outside press is swallowed too
            if (mouse) { e.preventDefault(); e.stopPropagation(); }
        }
        function eat(e) {
            if (!swallow) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.type === "click") swallow = false;          // the gesture's end
        }
        if (window.PointerEvent) document.addEventListener("pointerdown", function(){ swallow = false; }, true);
        document.addEventListener("keydown", function(){ swallow = false; }, true);
        document.addEventListener("mousedown", function(e){
            // a tap's mouse events, after its touchstart closed the flyout
            if (swallow && (window.PointerEvent || Date.now() - swallowAt < 1000)) { eat(e); return; }
            swallow = false;
            dismiss(e, true);
        }, true);
        document.addEventListener("touchstart", function(e){
            if (!window.PointerEvent) swallow = false;
            dismiss(e, false);
        }, { capture: true, passive: true });
        ["mouseup", "click", "auxclick", "contextmenu"].forEach(function(t){ document.addEventListener(t, eat, true); });
        document.addEventListener("focusin", function(e){ if (open && !keepsOpen(e.target)) close(false); });
        // Esc outside the flyout (on the button or a dropdown); an Esc that
        // closed the LCU option list (defaultPrevented) leaves it open.
        document.addEventListener("keydown", function(e){
            if (!open || (e.key !== "Escape" && e.key !== "Esc") || e.defaultPrevented || pop.contains(e.target)) return;
            close(document.activeElement === button());
        });
        window.addEventListener("resize", position);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(position);
        if (document.readyState === "complete") prefetch();
        else window.addEventListener("load", prefetch);
    }

    // Registered at load time (no DOM work): lolBootHeader's fill, inline
    // after </header>, already updates the button before the first paint.
    document.addEventListener("lol:patch-select", onPatchSelect);

    return {
        init: init, open: show, close: close,
        isOpen: function(){ return open; },
        entry: function(){ return current; },
        shown: function(rec){ return rec ? shownOf(rec) : null; },     // tests: what the body shows for a record
        line: lineHtml                                                  // tests: a note line as HTML
    };
})();

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
    LolPatchNotes.init();
});
