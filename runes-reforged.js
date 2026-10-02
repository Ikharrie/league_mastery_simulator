// Runes Reforged — the League Client rune page editor, V7.22 through today.
//
// The listed patches come from the registry (patch-registry.js through
// lol-data.js: LolPatches.entry / resolve / list, 124 entries). Per patch
// the page loads the entry's extras file (LolData.load: the client texts
// that fill Data Dragon's @Variable@ gaps, and the V7.22-V8.22 path-pair
// bonus) together with runesReforged.json from Riot Data Dragon, and
// renders Riot's perks editor (rcp-fe-lol-perks / rcp-fe-lol-collections)
// as one fixed 1055x635 stage: per-path scene art, the primary column
// (style row, keystone row, three minor rows, progress spine), the
// secondary column (four path options, three rows, stat shards from V8.23,
// runes-reforged-data.js), the page-name row and the list/grid settings.
// css/runes-reforged.css has the geometry; this file only builds markup
// and toggles state classes.
//
// Rules (as in the client):
//   - One primary path: 1 keystone (row 0) + 1 rune per row 1/2/3.
//   - One secondary path (not the primary): 2 runes from rows 1-3, at most
//     one per row. Nothing locks: picking in a third row drops the OLDEST
//     pick (the client's setSplashedPerk: push, then shift past 2).
//   - Three stat shards, one per row (V8.23+; V7.22 had none).
//
// Share hash (unchanged, old links decode to the same build):
//   <dataset>|<primaryId>,k,m1,m2,m3|<secondaryId>,,s1,s2,s3|sh1,sh2,sh3[|<name>]
// The optional 5th field is the URI-encoded page name (only when renamed).
// <dataset> is a registry id (rr-v<major>-<minor>); aliases (rr-v12-23 ->
// rr-v12-22) and ids of unlisted patches resolve through LolPatches.resolve
// and are rewritten to the canonical id once the page has loaded.
//
// Patch / season switch (DESIGN §2.5, §4.5): the picks carry over, each one
// kept only where the target patch still offers it (runeInSlot /
// shardInRow); whatever is dropped is reported once with LolToast.

var reforgedState = {
    dataSetId: null,
    dataSet: null,           // the patch on screen: registry entry + extras (LolData)
    catalog: null,           // [{id, key, name, icon, slots:[{runes:[]}]}] in client order
    primaryPath: null,
    primaryPicks: [null, null, null, null],   // [keystone, row1, row2, row3]
    secondaryPath: null,
    // Indexed by row (index 0 unused — no keystone on the secondary).
    secondaryPicks: [null, null, null, null],
    secondaryOrder: [],      // rows of the secondary picks, oldest first
    shards: [null, null, null],               // offense / flex / defense
    pageName: null           // null = the default "New Runes Page N"
};

var reforgedUi = {
    mode: "grid",            // "grid" | "list" (bottom-left toggle)
    detailed: true,          // "Show detailed descriptions…" checkbox
    shift: false,            // SHIFT held → long descriptions
    savedHash: null,         // hash at the last load / SAVE (SAVE disabled when equal)
    loadToken: 0,
    pending: null,           // registry entry being loaded (null when idle)
    opening: null,           // the link the first load applies (until a view exists)
    built: { primary: null, secondary: null, shards: null }
};

var REFORGED_DD_BASE = "https://ddragon.leagueoflegends.com/cdn/";
// Rune / path icons are served from the VERSIONLESS cdn/img/ root — the
// versioned cdn/{patch}/img/ path 403s for perk images.
var REFORGED_IMG_BASE = "https://ddragon.leagueoflegends.com/cdn/img/";
var RR_ART = "images/runes-reforged/";

// Client order of the paths (style picker and path options).
var RR_PATH_ORDER = [8000, 8100, 8200, 8400, 8300];
var RR_STYLE = { 8000: "precision", 8100: "domination", 8200: "sorcery", 8300: "inspiration", 8400: "resolve" };
// perks_<style>_short_desc_1 / _2 (rcp-fe-lol-perks en_US trans.json).
var RR_SHORT_DESC = {
    precision:   ["Become a legend", "Improved attacks and sustained damage"],
    domination:  ["Hunt and eliminate prey", "Burst damage and target access"],
    sorcery:     ["Unleash destruction", "Empowered abilities and resource manipulation"],
    resolve:     ["Live forever", "Durability and crowd control"],
    inspiration: ["Outwit mere mortals", "Creative tools and rule bending"]
};
// Keystone glyph overlays vendored under construct/<path>/keystones/.
var RR_SCENE_KEYSTONES = {
    8000: [8005, 8008, 8010, 8021],
    8100: [8112, 8124, 8128, 9923],
    8200: [8214, 8229, 8230, 8992],
    8300: [8326, 8351, 8358, 8359, 8360, 8369],
    8400: [8437, 8439, 8465]
};
var RR_TEXT = {
    keystones: "Keystones",
    save: "Save",
    newPage: "New Runes Page ",
    edit: "Edit page name",
    add: "Add New Page",
    del: "Delete page",
    noChanges: "No new changes",
    saveChanges: "Save your changes",
    selectKeystone: "Select a keystone",
    selectRune: "Select a rune",
    selectStat: "Select a stat",
    secondaryPath: "Secondary path",
    selectSecondaryPath: "Select a secondary path",
    selectSecondary: "Select two runes from your secondary path",
    longDesc: "Show detailed descriptions during comparison (or hold SHIFT)",
    listMode: "List mode",
    gridMode: "Grid mode"
};

// Resolve a catalog icon reference to a fetchable URL. Modern catalogs use
// "perk-images/..." paths served by DDragon's versionless img root. The
// V7.22-era catalog instead carries raw game-asset paths
// ("ASSETS/Perks/....dds") that DDragon never served as images —
// CommunityDragon archives those patches and mirrors ASSETS/Perks under
// v1/perk-images with lowercased paths and .png extensions.
function reforgedIconUrl(icon) {
    if (!icon) return "";
    if (icon.indexOf("perk-images/") === 0) return REFORGED_IMG_BASE + icon;
    var ds = rrDs();
    var branch = ds && ds.ddragonVersion ? ds.ddragonVersion.split(".").slice(0, 2).join(".") : "latest";
    return "https://raw.communitydragon.org/" + branch +
        "/plugins/rcp-be-lol-game-data/global/default/v1/" +
        icon.toLowerCase()
            .replace(/^assets\/perks\//, "perk-images/")
            .replace(/\.dds$/, ".png");
}

function rrStyleOf(path) { return path ? (RR_STYLE[path.id] || String(path.key || "").toLowerCase()) : ""; }

// The patch on screen (registry entry + extras), or null before the first load.
function rrDs() { return reforgedState.dataSet; }

// The client-era switches below go by the Data Dragon version of the entry
// (live 25.x / 26.x = DDragon 15.x / 16.x, so "major >= 13" holds for them).
function rrVersionOf(ds) {
    var p = String(ds && ds.ddragonVersion || "0.0").split(".");
    return { major: parseInt(p[0], 10) || 0, minor: parseInt(p[1], 10) || 0 };
}
// Tooltip frame: #010a13 up to V13.8, #1a1c21 from V13.10 (uikit colour change).
function rrTooltipVariant() {
    var v = rrVersionOf(rrDs());
    return (v.major > 13 || (v.major === 13 && v.minor >= 10)) ? "v13" : null;
}
// Page-name row: the 2017 dropdown (name + chevron) until V12, the inset
// text field with SAVE attached from V13 (perks-body-header, collections
// CSS 12.23 -> 13.1).
// Noted, not built: V13.4 is the candidate for the page-editor footer
// (page-editor-footer / -footer-keystone-container / -recommendations-
// container added, perks-edit-btn removed; collections CSS 13.1 -> 13.4,
// no 13.3 build to compare). V13.1-V13.3 may still have the pre-footer
// V13 layout. This page keeps one V13 layout for V13.1+.
function rrPageVariant() {
    return rrVersionOf(rrDs()).major >= 13 ? "v13" : "v7";
}

// Grid-mode rune buttons: 47px at launch, 38px from V8.5. V8.4 is the one
// patch with a four-rune minor row at 47px (Resolve row 2: Iron Skin,
// Mirror Shell, Conditioning, Second Wind): 4 x 47 = 188px fits the 198px
// track, as in the client.
function rrRuneSize() {
    var v = rrVersionOf(rrDs());
    return (v.major > 8 || (v.major === 8 && v.minor >= 5)) ? "38" : "47";
}

function rrStore(key, value) {
    try {
        if (value === undefined) return window.localStorage.getItem("rr." + key);
        window.localStorage.setItem("rr." + key, value);
    } catch (e) { /* private mode / blocked storage: per-session only */ }
    return null;
}

function rrEl(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k) && attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
}
function rrEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

// ---------- Descriptions and tooltip templates ---------------------------------

// The catalog descriptions carry client-only markup (<lol-uikit-*> keyword
// wrappers, <scaleAD>…) and, in the V7.22-era files, unresolved @Variable@
// placeholders. Keep basic formatting tags, turn keywords into bold spans,
// drop everything else. %i:<name>% is an inline stat-icon token (V10.23
// Revitalize "%i:scaleHealShield% 5%", V14.19 Lethal Tempo "%i:OnHit%");
// there is no icon art for it here, so it is dropped rather than printed.
function sanitizeReforgedDesc(html) {
    return String(html || "")
        .replace(/@[A-Za-z0-9_.*%\-]+@/g, "?")
        .replace(/%i:[A-Za-z0-9_]+%\s*/g, "")
        .replace(/<lol-uikit-tooltipped-keyword[^>]*>/gi, '<span class="rr-kw">')
        .replace(/<\/lol-uikit-tooltipped-keyword>/gi, "</span>")
        .replace(/<rules>/gi, '<span class="rr-rules">').replace(/<\/rules>/gi, "</span>")
        .replace(/<li>/gi, "<br>&bull; ").replace(/<\/li>/gi, "")
        .replace(/<hr><\/hr>/gi, "<hr>")
        .replace(/<(?!\/?(b|i|u|br|hr|font|span)\b)[^>]*>/gi, "")
        .replace(/<span(?! class="rr-(kw|rules)")[^>]*>/gi, "<span>")
        .replace(/(<br>\s*)+$/i, "");
}

function rrShowLong() { return reforgedUi.detailed || reforgedUi.shift; }

function rrTipHtml(title, bodyHtml, locked) {
    return (locked ? '<div class="rr-tt-locked">' + rrEsc(locked) + "</div>" : "") +
        '<div class="rr-tt-head"><div class="tt-title">' + rrEsc(title) + "</div></div>" +
        (bodyHtml ? '<div class="rr-tt-desc">' + bodyHtml + "</div>" : "");
}

function rrRuneTip(rune) {
    var d = rrShowLong() ? (rune.longDesc || rune.shortDesc) : (rune.shortDesc || rune.longDesc);
    return rrTipHtml(rune.name, sanitizeReforgedDesc(d));
}

// One anchored LCU tooltip at a time; re-rendered when SHIFT flips.
var rrTip = { node: null, render: null, width: 280 };
function rrShowTip(node, render, width) {
    if (!window.LolTooltip) return;
    rrTip.node = node; rrTip.render = render; rrTip.width = width || 280;
    LolTooltip.show(node, render(), "lcu", {
        position: "right",
        variant: rrTooltipVariant(),
        width: rrTip.width,
        className: "rr-tt"
    });
}
function rrHideTip() {
    rrTip.node = null; rrTip.render = null;
    if (window.LolTooltip) LolTooltip.hide();
}
function rrRefreshTip() {
    if (rrTip.node && rrTip.render && document.body.contains(rrTip.node)) rrShowTip(rrTip.node, rrTip.render, rrTip.width);
}
function rrBindTip(node, render, width) {
    node.addEventListener("mouseenter", function(){ rrShowTip(node, render, width); });
    node.addEventListener("focus", function(){ rrShowTip(node, render, width); });
    node.addEventListener("mouseleave", rrHideTip);
    node.addEventListener("blur", rrHideTip);
}
// Short one-line hints on the page-name row buttons (LCU system tooltip).
function rrBindHint(node, textFn) {
    var show = function(){
        if (!window.LolTooltip) return;
        rrTip.node = null;
        LolTooltip.show(node, rrEsc(textFn()), "lcu", {
            position: "bottom", system: true, variant: rrTooltipVariant(), className: "is-hint"
        });
    };
    node.addEventListener("mouseenter", show);
    node.addEventListener("focus", show);
    node.addEventListener("mouseleave", rrHideTip);
    node.addEventListener("blur", rrHideTip);
}

function reforgedToast(msg) {
    if (window.LolToast) return LolToast.show(msg);
}

// ---------- Catalog loading ---------------------------------------------------

// Fetch the runesReforged.json for a given DDragon version.
function fetchRunesReforged(version) {
    var url = REFORGED_DD_BASE + version + "/data/en_US/runesReforged.json";
    return $.ajax({ url: url, dataType: "json" });
}

// DDragon leaves some @Variable@ placeholders unfilled (V7.22-V8.7: nearly
// every rune; later patches one to three) and drops a few client lines
// (Future's Market's debt limit, V8.8-V14.4). Swap in the client's own
// texts for that patch (the extras' perkText: {runeId: [short|null,
// long|null]}, null = keep the DDragon text) before anything renders.
function rrApplyPerkText(catalog, ds) {
    var t = ds && ds.perkText;
    if (!t) return catalog;
    catalog.forEach(function(path){
        (path.slots || []).forEach(function(slot){
            (slot.runes || []).forEach(function(r){
                var o = t[r.id];
                if (!o) return;
                if (o[0] != null) r.shortDesc = o[0];
                if (o[1] != null) r.longDesc = o[1];
            });
        });
    });
    return catalog;
}

// V7.22-V8.22 path-pair set bonus for primary + secondary (null when none):
// the extras' subStyleBonus {primaryId: {secondaryId: longDesc}}.
function rrSubStyleBonus(primary, secondaryId) {
    var ds = rrDs(), t = ds && ds.subStyleBonus;
    var row = t && primary ? t[primary.id] : null;
    return row && row[secondaryId] ? row[secondaryId] : null;
}

function sortReforgedCatalog(catalog) {
    return catalog.slice().sort(function(a, b){
        var ia = RR_PATH_ORDER.indexOf(a.id), ib = RR_PATH_ORDER.indexOf(b.id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}

// The registry entry a dataset id opens: canonical, alias (rr-v12-23 ->
// rr-v12-22) or an unlisted patch (the listed patch in effect), or null.
function rrEntryOf(id) {
    var r = id && window.LolPatches ? LolPatches.resolve("reforged", String(id)) : null;
    return r ? r.entry : null;
}

// The picks on screen as a parseReforgedHash() result (the carry state).
function rrCarryState() { return rrDs() ? parseReforgedHash(buildReforgedHash()) : null; }

function rrNotNull(x) { return x != null; }
function rrPickCounts() {
    return {
        runes: (reforgedState.primaryPath ? reforgedState.primaryPicks.filter(rrNotNull).length : 0) +
               (reforgedState.secondaryPath ? reforgedState.secondaryPicks.filter(rrNotNull).length : 0),
        shards: reforgedState.shards.filter(rrNotNull).length
    };
}
// "2 runes and 1 shard could not carry over to V14.2" (null: nothing lost).
// A carry only ever drops picks, so the counts before and after tell.
function rrDropMessage(before, after, entry) {
    var runes = before.runes - after.runes, shards = before.shards - after.shards, parts = [];
    if (runes > 0) parts.push(runes + (runes === 1 ? " rune" : " runes"));
    if (shards > 0) parts.push(shards + (shards === 1 ? " shard" : " shards"));
    return parts.length ? parts.join(" and ") + " could not carry over to " + entry.patch : null;
}

// Header: era, Season dropdown + tabs (nav.js, from the registry) and this
// season's patches in the Patch dropdown, oldest first.
function rrSyncHeader(entry) {
    if (typeof setClientEra === "function") setClientEra(entry.era || "lcu");
    if (typeof buildSeasonNav === "function") {
        buildSeasonNav({
            page: "reforged",
            seasonSelect: "#reforged-season-select",
            entry: entry,
            onSeason: function(def){
                var e = LolPatches.seasonDefault("reforged", def.key);
                if (!e) return false;
                activateReforgedDataSet(e);
                return true;
            }
        });
    }
    LolPatches.fillPatchSelect("#reforged-patch-select", "reforged", entry.season, entry.id);
}

function rrFetchCatalog(version) {
    return new Promise(function(resolve, reject){
        fetchRunesReforged(version).done(function(catalog){ resolve(catalog); })
            .fail(function(){ var e = new Error("catalog " + version); e.catalog = true; reject(e); });
    });
}

// Show a registry entry. parsed: a parseReforgedHash() result to apply once
// the catalog is in (a link, Back / Forward; null = an empty page), or
// undefined to carry the picks on screen over (patch / season switch).
// The current view stays up while the extras file and the DDragon catalog
// load (the loading text only after 150 ms; at once on the first load).
// A failed switch restores the dropdowns and keeps the view.
function activateReforgedDataSet(entry, parsed) {
    if (!entry) return;
    // No view yet (the first load is still running): a switch carries the
    // link that load was opening instead of an empty page.
    if (parsed === undefined && !reforgedState.catalog) parsed = reforgedUi.opening || null;
    reforgedUi.opening = reforgedState.catalog ? null : parsed;
    var token = ++reforgedUi.loadToken;
    var prev = reforgedState.catalog ? rrDs() : null;
    var root = document.getElementById("reforged-calculator");
    reforgedUi.pending = entry;
    rrSyncHeader(entry);
    rrHideTip();
    var loading = function(){ rrSetLoading("Loading runes for " + entry.label + "…"); };
    var timer = null;
    if (prev) timer = setTimeout(function(){ if (token === reforgedUi.loadToken) loading(); }, 150);
    else loading();
    Promise.all([LolData.load(entry), rrFetchCatalog(entry.ddragonVersion)]).then(function(res){
        if (token !== reforgedUi.loadToken) return;
        clearTimeout(timer);
        reforgedUi.pending = null;
        var ds = res[0];
        // The view stayed live during the load: carry what is on screen now.
        var carrying = parsed === undefined;
        var carry = carrying ? rrCarryState() : parsed;
        var before = carrying && prev ? rrPickCounts() : null;
        reforgedState.dataSetId = entry.id;
        reforgedState.dataSet = ds;
        root.setAttribute("data-page-variant", rrPageVariant());
        root.setAttribute("data-rune-size", rrRuneSize());
        reforgedState.catalog = sortReforgedCatalog(rrApplyPerkText(res[1], ds));
        resetReforgedSelections();
        if (carry) applyReforgedHashAfterLoad(carry, true);
        reforgedUi.built = { primary: null, secondary: null, shards: null };
        // A loaded page starts clean. Set before rendering: a render with a
        // stale savedHash would run SAVE's 300ms disabled transition.
        reforgedUi.savedHash = buildReforgedHash();
        rrSetLoading(null);
        renderReforgedStage();
        updateReforgedShareLink();          // canonical id in the URL
        var lost = before ? rrDropMessage(before, rrPickCounts(), entry) : null;
        if (lost) reforgedToast(lost);
        LolData.prefetch(LolPatches.list("reforged", entry.season));
    }, function(err){
        if (token !== reforgedUi.loadToken) return;
        clearTimeout(timer);
        reforgedUi.pending = null;
        if (prev) {
            rrSyncHeader(prev);
            rrSetLoading(null);
            renderReforgedStage();
            updateReforgedShareLink();
            reforgedToast("Could not load " + entry.patch + " data");
        } else if (err && err.catalog) {
            rrSetLoading("Failed to load runes catalog for " + entry.label +
                ". Riot's CDN may have retired this DDragon version — try a different patch.", true);
        } else {
            rrSetLoading("Could not load " + entry.patch + " data.", true);
        }
    });
}

function rrSetLoading(text, isError) {
    var root = document.getElementById("reforged-calculator");
    var box = root.querySelector(".rr-loading"), body = root.querySelector(".rr-body");
    var picker = root.querySelector(".rr-picker"), settings = root.querySelector(".rr-settings");
    if (text) {
        box.textContent = text;
        box.style.display = "";
        box.classList.toggle("is-error", !!isError);
        if (body) body.setAttribute("hidden", "hidden");
        if (picker) picker.setAttribute("hidden", "hidden");
        if (settings) settings.setAttribute("hidden", "hidden");
    } else {
        box.style.display = "none";
    }
}

function resetReforgedSelections() {
    reforgedState.primaryPath = null;
    reforgedState.primaryPicks = [null, null, null, null];
    reforgedState.secondaryPath = null;
    reforgedState.secondaryPicks = [null, null, null, null];
    reforgedState.secondaryOrder = [];
    reforgedState.shards = [null, null, null];
}

function findPathById(id) {
    if (!reforgedState.catalog) return null;
    for (var i = 0; i < reforgedState.catalog.length; i++) {
        if (reforgedState.catalog[i].id === id) return reforgedState.catalog[i];
    }
    return null;
}
function findPathByKey(key) {
    if (!reforgedState.catalog) return null;
    for (var i = 0; i < reforgedState.catalog.length; i++) {
        if (reforgedState.catalog[i].key === key) return reforgedState.catalog[i];
    }
    return null;
}

// ---------- Stage skeleton (built once) -----------------------------------------

function rrBuildSkeleton(root) {
    root.classList.add("rr");
    root.setAttribute("data-mode", reforgedUi.mode);
    root.innerHTML = "";
    var scene = rrEl("div", "rr-scene", { "aria-hidden": "true" });
    ["env", "splash", "construct", "keystone"].forEach(function(n){
        scene.appendChild(rrEl("div", "rr-layer rr-" + n + " is-empty"));
    });
    root.appendChild(scene);
    root.appendChild(rrEl("div", "rr-loading", { role: "status" }));

    var body = rrEl("div", "rr-body", { hidden: "hidden" });
    body.appendChild(rrBuildTopRow());
    body.appendChild(rrEl("section", "rr-col rr-col--primary", { "aria-label": "Primary path" }));
    body.appendChild(rrEl("section", "rr-col rr-col--secondary", { "aria-label": "Secondary path" }));
    root.appendChild(body);
    root.appendChild(rrBuildSettings());
    root.appendChild(rrEl("div", "rr-picker", { hidden: "hidden", role: "group", "aria-label": "Choose a primary path" }));
}

function rrBuildTopRow() {
    var row = rrEl("div", "rr-toprow");
    var edit = rrEl("button", "lcu-circle-btn rr-btn-edit", { type: "button", "aria-label": RR_TEXT.edit });
    var name = rrEl("div", "rr-name");
    var text = rrEl("span", "rr-name-text");
    var input = rrEl("input", "rr-name-input", { type: "text", maxlength: "25", "aria-label": "Page name", spellcheck: "false" });
    name.appendChild(text); name.appendChild(input);
    // Starts disabled: a fresh / loaded page has nothing to save (and the
    // uikit disabled transition would otherwise flash an enabled SAVE).
    var save = rrEl("button", "lcu-btn rr-save disabled", { type: "button", disabled: "disabled" });
    save.textContent = RR_TEXT.save;
    var add = rrEl("button", "lcu-circle-btn rr-btn-add", { type: "button", "aria-label": RR_TEXT.add });
    var del = rrEl("button", "lcu-circle-btn rr-btn-delete", { type: "button", "aria-label": RR_TEXT.del });
    [edit, name, save, add, del].forEach(function(n){ row.appendChild(n); });

    rrBindHint(edit, function(){ return RR_TEXT.edit; });
    rrBindHint(add, function(){ return RR_TEXT.add; });
    rrBindHint(del, function(){ return RR_TEXT.del; });
    rrBindHint(save, function(){ return save.disabled ? RR_TEXT.noChanges : RR_TEXT.saveChanges; });

    var startEdit = function(){
        rrHideTip();
        name.classList.add("is-editing");
        input.value = rrPageName();
        input.focus();
        input.select();
    };
    var commit = function(keep){
        if (!name.classList.contains("is-editing")) return;
        name.classList.remove("is-editing");
        if (keep) {
            var v = input.value.replace(/\s+/g, " ").replace(/^\s|\s$/g, "");
            reforgedState.pageName = (v && v !== rrDefaultPageName()) ? v : null;
            rrUpdateTopRow();
            updateReforgedShareLink();
        }
    };
    edit.addEventListener("click", startEdit);
    text.addEventListener("dblclick", startEdit);
    input.addEventListener("keydown", function(e){
        if (e.keyCode === 13) { commit(true); input.blur(); }
        else if (e.keyCode === 27) { commit(false); input.blur(); }
    });
    input.addEventListener("blur", function(){ commit(true); });
    save.addEventListener("click", function(){ rrSavePage(); });
    add.addEventListener("click", function(){
        var m = /^New Runes Page (\d+)$/.exec(rrPageName());
        rrNewPage(m ? parseInt(m[1], 10) + 1 : 2);
    });
    del.addEventListener("click", function(){ rrNewPage(1); });
    return row;
}

function rrDefaultPageName() { return RR_TEXT.newPage + 1; }
function rrPageName() { return reforgedState.pageName || rrDefaultPageName(); }

function rrBuildSettings() {
    var box = rrEl("div", "rr-settings", { hidden: "hidden" });
    var modes = rrEl("div", "rr-modes", { role: "radiogroup", "aria-label": "Layout" });
    var icons = {
        list: ['14', '12', "M0,0h3v2H0V0z M5,0h9v2H5V0z M0,5h3v2H0V5z M5,5h9v2H5V5z M0,10h3v2H0V10z M5,10h9v2H5V10z"],
        grid: ['13', '12', "M0,0h3v2H0V0z M5,0h3v2H5V0z M10,0h3v2h-3V0z M0,5h3v2H0V5z M5,5h3v2H5V5z M10,5h3v2h-3V5z M0,10 h3v2H0V10z M5,10h3v2H5V10z M10,10h3v2h-3V10z"]
    };
    ["list", "grid"].forEach(function(m){
        var b = rrEl("button", "rr-mode", { type: "button", role: "radio", "data-mode": m,
            "aria-label": m === "list" ? RR_TEXT.listMode : RR_TEXT.gridMode });
        b.innerHTML = '<svg width="' + icons[m][0] + '" height="' + icons[m][1] + '" viewBox="0 0 ' + icons[m][0] + " " +
            icons[m][1] + '" aria-hidden="true"><path d="' + icons[m][2] + '"/></svg>';
        b.addEventListener("click", function(){ rrSetMode(m); });
        modes.appendChild(b);
    });
    box.appendChild(modes);
    var label = rrEl("label", "rr-check");
    var cb = rrEl("input", null, { type: "checkbox" });
    cb.checked = reforgedUi.detailed;
    cb.addEventListener("change", function(){
        reforgedUi.detailed = cb.checked;
        rrStore("detailed", cb.checked ? "1" : "0");
        rrRefreshTip();
    });
    label.appendChild(cb);
    label.appendChild(rrEl("span", "rr-check-box", { "aria-hidden": "true" }));
    var t = rrEl("span"); t.textContent = RR_TEXT.longDesc;
    label.appendChild(t);
    box.appendChild(label);
    return box;
}

function rrSetMode(mode) {
    reforgedUi.mode = mode === "list" ? "list" : "grid";
    rrStore("mode", reforgedUi.mode);
    var root = document.getElementById("reforged-calculator");
    root.setAttribute("data-mode", reforgedUi.mode);
    rrCloseDrawers();
    renderReforgedStage();
}

// ---------- Rendering -----------------------------------------------------------

function renderReforgedStage() {
    var root = document.getElementById("reforged-calculator");
    if (!reforgedState.catalog) return;
    var body = root.querySelector(".rr-body"), picker = root.querySelector(".rr-picker");
    var settings = root.querySelector(".rr-settings");
    var primary = reforgedState.primaryPath, secondary = reforgedState.secondaryPath;
    root.setAttribute("data-primary", rrStyleOf(primary));
    root.setAttribute("data-page-variant", rrPageVariant());
    rrHideTip();
    rrFitStage(!primary);
    if (!primary) {
        body.setAttribute("hidden", "hidden");
        settings.setAttribute("hidden", "hidden");
        rrBuildPicker(picker);
        picker.removeAttribute("hidden");
        rrUpdateScene();
        return;
    }
    picker.setAttribute("hidden", "hidden");
    body.removeAttribute("hidden");
    settings.removeAttribute("hidden");
    var ds = rrDs();
    var key = [reforgedUi.mode, primary.id].join(":");
    if (reforgedUi.built.primary !== key) {
        rrBuildPrimary(root.querySelector(".rr-col--primary"), primary);
        reforgedUi.built.primary = key;
    }
    var skey = [reforgedUi.mode, primary.id, secondary ? secondary.id : 0, ds ? ds.shardEra : ""].join(":");
    if (reforgedUi.built.secondary !== skey) {
        rrBuildSecondary(root.querySelector(".rr-col--secondary"), primary, secondary, ds);
        reforgedUi.built.secondary = skey;
    }
    Array.prototype.forEach.call(root.querySelectorAll(".rr-mode"), function(b){
        var on = b.getAttribute("data-mode") === reforgedUi.mode;
        b.classList.toggle("is-checked", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
    });
    rrUpdatePicks();
    rrUpdateTopRow();
    rrUpdateScene();
}

// Narrow screens: the editor pans at the shared 0.5 floor (both columns,
// x 0-635, still fit a phone column), but the five-column style picker
// is one composition — let it shrink to fit the width instead.
var RR_PICKER_MIN_SCALE = "0.3";
function rrFitStage(picker) {
    var root = document.getElementById("reforged-calculator");
    var stage = root && root.closest ? root.closest(".lol-stage") : null;
    if (!stage) return;
    var cur = stage.getAttribute("data-stage-min-scale");
    if (picker ? cur === RR_PICKER_MIN_SCALE : cur === null) return;
    if (picker) stage.setAttribute("data-stage-min-scale", RR_PICKER_MIN_SCALE);
    else stage.removeAttribute("data-stage-min-scale");
    stage.scrollLeft = 0;
    if (window.LolStage && LolStage.fit) LolStage.fit();
}

// --- style picker (no primary yet) ---
function rrBuildPicker(picker) {
    if (picker.getAttribute("data-built") === reforgedState.dataSetId) return;
    picker.innerHTML = "";
    picker.setAttribute("data-built", reforgedState.dataSetId);
    reforgedState.catalog.forEach(function(path){
        var style = rrStyleOf(path), x = style.charAt(0);
        var col = rrEl("button", "rr-pcol", { type: "button", "data-style": style, "aria-label": path.name });
        col.innerHTML =
            '<div class="rr-pcol-bg rr-pcol-lines"></div><div class="rr-pcol-bg rr-pcol-glow"></div>' +
            '<div class="rr-pcol-content">' +
              '<div class="rr-pcol-lockup">' +
                '<img class="rr-pcol-ring" alt="" src="' + RR_ART + 'style-picker/ring.png">' +
                '<img class="rr-pcol-logo" alt="" src="' + RR_ART + "style-picker/icon-" + x + '.png">' +
                '<img class="rr-pcol-vfx" alt="" src="' + RR_ART + "style-picker/vfx-" + x + '.png">' +
                '<div class="rr-pcol-header"><div class="rr-pcol-name">' + rrEsc(path.name) + "</div>" +
                  '<div class="rr-pcol-summary rr-desc-fade">' + rrEsc((RR_SHORT_DESC[style] || [""])[0]) + "</div></div>" +
              "</div>" +
              '<div class="rr-pcol-keystones">' + path.slots[0].runes.map(function(r){
                    return '<img alt="" src="' + reforgedIconUrl(r.icon) + '">';
                }).join("") + "</div>" +
              '<p class="rr-pcol-desc rr-desc-fade">' + rrEsc((RR_SHORT_DESC[style] || ["", ""])[1]) + "</p>" +
            "</div>";
        col.addEventListener("click", function(){ handlePathPick("primary", path); });
        picker.appendChild(col);
    });
}

// --- builders ---
function rrBuildBigIcon(style, glyph) {
    var n = rrEl("div", "rr-bigicon", { "data-style": style || "neutral", "data-glyph": glyph || null });
    var html = "";
    if (glyph) html += '<i class="rr-glyph"></i>';
    for (var i = 0; i < 3; i++) html += '<i class="rr-arcring"><i class="rr-arc"></i><i class="rr-comet"></i></i>';
    n.innerHTML = html;
    return n;
}

function rrBuildStyleRow(col, side, current) {
    var row = rrEl("div", "rr-row rr-row--style");
    var style = rrStyleOf(current);
    var big = rrBuildBigIcon(style || null, style || null);
    if (!current) big.classList.add("is-spinning");
    row.appendChild(big);
    var track = rrEl("div", "rr-track");
    reforgedState.catalog.forEach(function(path){
        if (side === "secondary" && reforgedState.primaryPath && path.id === reforgedState.primaryPath.id) return;
        var ps = rrStyleOf(path);
        var b = rrEl("button", "rr-styleopt" + (current && current.id === path.id ? " is-selected" : ""),
            { type: "button", "data-style": ps, "data-glyph": ps, "aria-label": path.name,
              "aria-pressed": current && current.id === path.id ? "true" : "false" });
        b.innerHTML = "<i><b></b><s></s></i>";   // #hover > #icon + gradient ring
        b.addEventListener("click", function(){ rrHideTip(); handlePathPick(side, path); });
        rrBindTip(b, function(){
            var d = RR_SHORT_DESC[ps] || ["", ""];
            // Splashed options also list the set bonus they would grant (V7.22).
            var bonus = side === "secondary" ? rrSubStyleBonus(reforgedState.primaryPath, path.id) : null;
            return rrTipHtml(path.name, '<div class="rr-tt-line">' + rrEsc(d[0]) + '</div><div class="rr-tt-line">' + rrEsc(d[1]) + "</div>" +
                (bonus ? '<div class="rr-tt-line rr-tt-bonus">' + sanitizeReforgedDesc(bonus) + "</div>" : ""));
        });
        track.appendChild(b);
    });
    row.appendChild(track);
    // List mode: path name + slogan/tagline, the options open on hover.
    var text = rrEl("div", "rr-text");
    // V7.22: the secondary header shows the path-pair set bonus instead
    // (splashed-style-selector: page.subStyleBonus.longDesc).
    var bonus = side === "secondary" && current ? rrSubStyleBonus(reforgedState.primaryPath, current.id) : null;
    if (current) {
        var d = RR_SHORT_DESC[style] || ["", ""];
        text.innerHTML = '<div class="rr-text-title">' + rrEsc(current.name) + '</div><div class="rr-text-desc">' +
            (bonus ? sanitizeReforgedDesc(bonus) : rrEsc(d[0]) + "<br>" + rrEsc(d[1])) + "</div>";
    } else {
        text.classList.add("is-hint");
        text.innerHTML = '<div class="rr-text-title">' + rrEsc(RR_TEXT.secondaryPath) + '</div><div class="rr-text-desc">' +
            rrEsc(RR_TEXT.selectSecondaryPath) + "</div>";
    }
    row.appendChild(text);
    row.appendChild(rrBuildDrawerFx());
    rrBindDrawer(row);
    return row;
}

function rrBuildSpine(style, cls) {
    var sp = rrEl("div", "rr-spine" + (cls ? " " + cls : ""), { "data-style": style || "neutral" });
    sp.innerHTML = '<i class="rr-smile"></i><div class="rr-fill"><div class="rr-glow"><div class="rr-progress">' +
        '<div class="rr-pulse"></div></div><div class="rr-cmask"><div class="rr-cmover"><div class="rr-cometbar"></div>' +
        '</div></div></div><div class="rr-flash"></div></div>';
    return sp;
}

function rrBuildNode(style, top, large) {
    var n = rrEl("div", "rr-node" + (large ? " is-large" : ""), { "data-style": style || "neutral" });
    n.style.top = top + "px";
    n.innerHTML = "<i></i>";
    return n;
}

function rrBuildDrawerFx() {
    var fx = rrEl("div", "rr-drawer-fx");
    fx.innerHTML = '<b class="rr-radial"></b>';
    return fx;
}

function rrBuildSep(extra) {
    var s = rrEl("div", "rr-sep" + (extra ? " " + extra : ""));
    s.innerHTML = "<i></i>";
    return s;
}

// One rune button. side: "primary" | "secondary" | "shard".
function rrBuildPerk(opts) {
    var b = rrEl("button", "rr-perk" + (opts.keystone ? " is-keystone" : "") + (opts.shard ? " is-shard" : ""), {
        type: "button",
        "data-id": opts.id,
        "data-row": opts.row,
        "aria-label": opts.name
    });
    // Every option carries its path's style-name, so rings and the hover
    // ring are always in the path colours; unpicked siblings are greyed by
    // the fade, not by a neutral ring.
    if (opts.style) b.setAttribute("data-style", opts.style);
    b.innerHTML = "<i><u></u><s></s><b></b></i>";
    b.querySelector("b").style.backgroundImage = 'url("' + opts.icon + '")';
    if (opts.onPick) b.addEventListener("click", function(){ opts.onPick(); });
    if (opts.tip) rrBindTip(b, opts.tip, opts.shard ? 200 : 280);
    return b;
}

function rrBuildPrimary(col, path) {
    col.innerHTML = "";
    var style = rrStyleOf(path);
    col.setAttribute("data-style", style);
    col.appendChild(rrBuildStyleRow(col, "primary", path));
    var spine = rrBuildSpine(style);
    col.appendChild(spine);
    var tops = [184.5, 282, 370, 458];
    var rowCls = ["rr-row--keystone", "rr-row--m1", "rr-row--m2", "rr-row--m3"];
    path.slots.forEach(function(slot, r){
        if (r > 3) return;
        col.appendChild(rrBuildNode(style, tops[r], r === 0)).setAttribute("data-node", r);
        var row = rrEl("div", "rr-row rr-row--rune " + rowCls[r], { "data-row": r });
        if (r === 0) {
            var label = rrEl("div", "rr-ks-label"); label.textContent = RR_TEXT.keystones;
            row.appendChild(label);
        }
        if (r >= 2) row.appendChild(rrBuildSep());
        var track = rrEl("div", "rr-track");
        slot.runes.forEach(function(rune){
            track.appendChild(rrBuildPerk({
                id: rune.id, row: r, name: rune.name, icon: reforgedIconUrl(rune.icon), keystone: r === 0, style: style,
                onPick: function(){ rrHideTip(); handleRunePick("primary", r, rune); },
                tip: function(){ return rrRuneTip(rune); }
            }));
        });
        row.appendChild(track);
        row.appendChild(rrEl("div", "rr-pick"));
        row.appendChild(rrEl("div", "rr-text"));
        var fx = rrBuildDrawerFx();
        if (r >= 1) { fx.appendChild(rrBuildSep("rr-sep--top")); fx.appendChild(rrBuildSep("rr-sep--bottom")); }
        row.appendChild(fx);
        rrBindDrawer(row);
        col.appendChild(row);
    });
}

function rrBuildSecondary(col, primary, path, ds) {
    col.innerHTML = "";
    var style = rrStyleOf(path);
    if (style) col.setAttribute("data-style", style); else col.removeAttribute("data-style");
    col.classList.remove("is-open");
    col.appendChild(rrBuildStyleRow(col, "secondary", path));
    col.appendChild(rrBuildSpine(style || null));
    col.appendChild(rrBuildNode(style || null, 184.5, false)).setAttribute("data-node", 0);
    col.appendChild(rrBuildNode(style || null, 282, false)).setAttribute("data-node", 1);
    if (path) {
        // List mode: the two pick slots; hovering them opens the three rows.
        [1, 2].forEach(function(k){
            var slot = rrEl("div", "rr-slot rr-slot--" + k, { "data-slot": k - 1 });
            slot.appendChild(rrEl("div", "rr-pick"));
            slot.appendChild(rrEl("div", "rr-text"));
            col.appendChild(slot);
        });
        var hit = rrEl("div", "rr-slot-hit");
        col.appendChild(hit);
        var rowCls = ["", "rr-row--s1", "rr-row--s2", "rr-row--s3"];
        path.slots.forEach(function(slot, r){
            if (r === 0 || r > 3) return;       // no keystone on the secondary
            var row = rrEl("div", "rr-row rr-row--rune rr-row--grid " + rowCls[r], { "data-row": r });
            if (r >= 2) row.appendChild(rrBuildSep());
            var track = rrEl("div", "rr-track");
            slot.runes.forEach(function(rune){
                track.appendChild(rrBuildPerk({
                    id: rune.id, row: r, name: rune.name, icon: reforgedIconUrl(rune.icon), style: style,
                    onPick: function(){ rrHideTip(); handleRunePick("secondary", r, rune); },
                    tip: function(){ return rrRuneTip(rune); }
                }));
            });
            row.appendChild(track);
            col.appendChild(row);
        });
        var open = function(){ if (reforgedUi.mode === "list") { rrCloseDrawers(col); col.classList.add("is-open"); } };
        var close = function(e){
            if (reforgedUi.mode !== "list") return;
            var to = e && e.relatedTarget;
            if (to && (to.closest ? to.closest(".rr-row--grid, .rr-slot-hit") : null) && col.contains(to)) return;
            col.classList.remove("is-open");
        };
        hit.addEventListener("mouseenter", open);
        hit.addEventListener("click", open);
        Array.prototype.forEach.call(col.querySelectorAll(".rr-row--grid, .rr-slot-hit"), function(n){
            n.addEventListener("mouseleave", close);
        });
    }
    // Stat shards (V8.23+): 3 rows of 28px circles on their own mini spine.
    var rows = getReforgedShardRows(ds);
    if (rows) {
        var mini = rrBuildSpine("stat-shard", "no-ring rr-spine--shards");
        col.appendChild(mini);
        [370, 414, 458].forEach(function(t, i){
            col.appendChild(rrBuildNode("stat-shard", t, false)).setAttribute("data-shard-node", i);
        });
        var shCls = ["rr-row--sh1", "rr-row--sh2", "rr-row--sh3"];
        rows.forEach(function(srow, i){
            var row = rrEl("div", "rr-row rr-row--shard " + shCls[i], { "data-shard-row": i, "data-style": "stat-shard" });
            if (i >= 1) row.appendChild(rrBuildSep());
            var track = rrEl("div", "rr-track");
            srow.shards.forEach(function(shard){
                track.appendChild(rrBuildPerk({
                    id: shard.id, row: i, name: shard.name, icon: getReforgedShardIconUrl(ds, shard.icon), shard: true, style: "stat-shard",
                    onPick: function(){ rrHideTip(); handleShardPick(i, shard.id); },
                    tip: function(){ return rrTipHtml(shard.name, rrEsc(shard.desc)); }
                }));
            });
            row.appendChild(track);
            row.appendChild(rrEl("div", "rr-pick"));
            row.appendChild(rrEl("div", "rr-text"));
            row.appendChild(rrBuildDrawerFx());
            rrBindDrawer(row);
            col.appendChild(row);
        });
    }
}

// List mode drawers: one open row at a time, opened by hover (or tap).
function rrCloseDrawers(except) {
    var root = document.getElementById("reforged-calculator");
    Array.prototype.forEach.call(root.querySelectorAll(".rr-row.is-open, .rr-col.is-open"), function(n){
        if (n !== except) n.classList.remove("is-open");
    });
}
function rrBindDrawer(row) {
    row.addEventListener("mouseenter", function(){
        if (reforgedUi.mode !== "list") return;
        rrCloseDrawers(row);
        row.classList.add("is-open");
    });
    row.addEventListener("mouseleave", function(){ row.classList.remove("is-open"); });
    row.addEventListener("click", function(e){
        if (reforgedUi.mode !== "list" || row.classList.contains("is-open")) return;
        rrCloseDrawers(row);
        row.classList.add("is-open");
        e.stopPropagation();
    });
}

// --- state → classes ---
function rrPerkIn(col, row) {
    return col ? col.querySelectorAll('.rr-row[data-row="' + row + '"] .rr-track .rr-perk') : [];
}

function rrSetPick(holder, perk, keystone, shard, style) {
    // The selected rune shown on the spine / in list-mode slots.
    holder.innerHTML = "";
    if (!perk) return;
    var b = rrBuildPerk({ id: perk.id, row: -1, name: perk.name, icon: perk.iconUrl, keystone: keystone, shard: shard,
        tip: perk.tip, style: style });
    b.tabIndex = -1;
    holder.appendChild(b);
}

function rrSetText(holder, title, desc, hint) {
    holder.classList.toggle("is-hint", !!hint);
    holder.innerHTML = '<div class="rr-text-title">' + rrEsc(title) + '</div>' +
        (desc ? '<div class="rr-text-desc">' + desc + "</div>" : "");
}

function rrUpdatePicks() {
    var root = document.getElementById("reforged-calculator");
    var pcol = root.querySelector(".rr-col--primary"), scol = root.querySelector(".rr-col--secondary");
    var primary = reforgedState.primaryPath, secondary = reforgedState.secondaryPath;
    var pStyle = rrStyleOf(primary), sStyle = rrStyleOf(secondary);
    var r, i;

    // Primary rows: selected ring in the path colour, siblings faded.
    for (r = 0; r < 4; r++) {
        var pick = reforgedState.primaryPicks[r];
        Array.prototype.forEach.call(rrPerkIn(pcol, r), function(b){
            var sel = pick != null && String(pick) === b.getAttribute("data-id");
            b.classList.toggle("is-selected", sel);
            b.classList.toggle("is-faded", pick != null && !sel);
            b.setAttribute("aria-pressed", sel ? "true" : "false");
        });
        var node = pcol.querySelector('.rr-node[data-node="' + r + '"]');
        if (node) node.classList.toggle("is-filled", pick != null);
        var rowEl = pcol.querySelector('.rr-row[data-row="' + r + '"]');
        if (rowEl && primary) {
            var rune = rrRuneById(primary, r, pick);
            rrSetPick(rowEl.querySelector(".rr-pick"), rune ? rrPickInfo(rune) : null, r === 0, false, pStyle);
            if (rune) rrSetText(rowEl.querySelector(".rr-text"), rune.name, sanitizeReforgedDesc(rune.shortDesc));
            else rrSetText(rowEl.querySelector(".rr-text"), r === 0 ? RR_TEXT.selectKeystone : RR_TEXT.selectRune, "", true);
            rowEl.querySelector(".rr-text").classList.toggle("is-keystone", r === 0);
        }
    }
    // Primary progress: 1 (path) + the unbroken run of picked rows.
    var progress = 1;
    for (i = 0; i < 4 && reforgedState.primaryPicks[i] != null; i++) progress++;
    rrSetProgress(pcol.querySelector(".rr-spine"), progress, 5, "main");

    // Secondary rows: nothing locks; once two rows are picked the third fades.
    var sPicked = reforgedState.secondaryOrder.length;
    for (r = 1; r < 4; r++) {
        var sp = reforgedState.secondaryPicks[r];
        Array.prototype.forEach.call(rrPerkIn(scol, r), function(b){
            var sel = sp != null && String(sp) === b.getAttribute("data-id");
            b.classList.toggle("is-selected", sel);
            b.classList.toggle("is-faded", (sp != null && !sel) || (sp == null && sPicked >= 2));
            b.setAttribute("aria-pressed", sel ? "true" : "false");
        });
    }
    var order = reforgedState.secondaryOrder;
    for (i = 0; i < 2; i++) {
        var n2 = scol.querySelector('.rr-node[data-node="' + i + '"]');
        if (n2) n2.classList.toggle("is-filled", !!secondary && order[i] != null);
        var slot = scol.querySelector('.rr-slot[data-slot="' + i + '"]');
        if (slot && secondary) {
            var srune = order[i] != null ? rrRuneById(secondary, order[i], reforgedState.secondaryPicks[order[i]]) : null;
            rrSetPick(slot.querySelector(".rr-pick"), srune ? rrPickInfo(srune) : null, false, false, sStyle);
            if (srune) rrSetText(slot.querySelector(".rr-text"), srune.name, sanitizeReforgedDesc(srune.shortDesc));
            else if (i === 0) rrSetText(slot.querySelector(".rr-text"), RR_TEXT.selectRune, rrEsc(RR_TEXT.selectSecondary), true);
            else rrSetText(slot.querySelector(".rr-text"), RR_TEXT.selectRune, "", true);
        }
    }
    rrSetProgress(scol.querySelector(".rr-spine:not(.rr-spine--shards)"), secondary ? 1 + order.length : 0, 3, "main");

    // Shards.
    var ds = rrDs();
    var srows = getReforgedShardRows(ds);
    if (srows) {
        var count = 0;
        srows.forEach(function(srow, k){
            var cur = reforgedState.shards[k];
            if (cur != null) count++;
            Array.prototype.forEach.call(scol.querySelectorAll('.rr-row[data-shard-row="' + k + '"] .rr-track .rr-perk'), function(b){
                var sel = cur != null && String(cur) === b.getAttribute("data-id");
                b.classList.toggle("is-selected", sel);
                b.classList.toggle("is-faded", cur != null && !sel);
                b.setAttribute("aria-pressed", sel ? "true" : "false");
            });
            var sn = scol.querySelector('.rr-node[data-shard-node="' + k + '"]');
            if (sn) sn.classList.toggle("is-filled", cur != null);
            var rowEl2 = scol.querySelector('.rr-row[data-shard-row="' + k + '"]');
            if (rowEl2) {
                var shard = null;
                srow.shards.forEach(function(s){ if (String(s.id) === String(cur)) shard = s; });
                rrSetPick(rowEl2.querySelector(".rr-pick"), shard ? {
                    id: shard.id, name: shard.name, iconUrl: getReforgedShardIconUrl(ds, shard.icon),
                    tip: function(){ return rrTipHtml(shard.name, rrEsc(shard.desc)); }
                } : null, false, true, "stat-shard");
                if (shard) rrSetText(rowEl2.querySelector(".rr-text"), "", rrEsc(shard.desc));
                else rrSetText(rowEl2.querySelector(".rr-text"), "", rrEsc(RR_TEXT.selectStat), true);
            }
        });
        rrSetProgress(scol.querySelector(".rr-spine--shards"), count, 3, "shards");
    }
}

function rrRuneById(path, row, id) {
    if (id == null || !path || !path.slots[row]) return null;
    var runes = path.slots[row].runes;
    for (var i = 0; i < runes.length; i++) if (String(runes[i].id) === String(id)) return runes[i];
    return null;
}
function rrPickInfo(rune) {
    return { id: rune.id, name: rune.name, iconUrl: reforgedIconUrl(rune.icon), tip: function(){ return rrRuneTip(rune); } };
}

// lol-perks-progress-bar _intToHeight: row heights 131 / 107 / 88, offset 42
// (shards: 44 everywhere, offset 0). Fill = height(max-1), progress =
// height(min(current, max-1)); reaching max flashes the bar ("shoot").
function rrIntToHeight(e, kind) {
    var row = 88, r0 = 131, r1 = 107, off = 42;
    if (kind === "shards") { row = 44; r0 = 44; r1 = 44; off = 0; }
    var s = Math.max(0, e - 2) * row;
    if (e > 0) s += 0.5 * r0 + 0.5 * r1 - off;
    if (e > 1) s += 0.5 * r1 + 0.5 * row;
    return s;
}
function rrSetProgress(spine, current, max, kind) {
    if (!spine) return;
    var fill = spine.querySelector(".rr-fill"), prog = spine.querySelector(".rr-progress");
    var pulse = spine.querySelector(".rr-pulse");
    var full = rrIntToHeight(max - 1, kind);
    fill.style.height = full + "px";
    pulse.style.height = (full + 180) + "px";
    prog.style.height = rrIntToHeight(Math.min(current, max - 1), kind) + "px";
    var was = spine.getAttribute("data-current");
    spine.setAttribute("data-current", current);
    fill.classList.toggle("is-complete", current === max);
    if (current === max && was !== null && String(max) !== was) {
        fill.classList.remove("is-shoot"); void fill.offsetWidth; fill.classList.add("is-shoot");
    } else if (current !== max) fill.classList.remove("is-shoot");
}

// --- top row ---
function rrUpdateTopRow() {
    var root = document.getElementById("reforged-calculator");
    var text = root.querySelector(".rr-name-text"), save = root.querySelector(".rr-save");
    if (!text) return;
    text.textContent = rrPageName();
    var dirty = buildReforgedHash() !== reforgedUi.savedHash;
    save.disabled = !dirty;
    save.classList.toggle("disabled", !dirty);
}

// --- scene: environment + second + construct + keystone glyph ---
function rrSetLayer(root, name, url) {
    var el = root.querySelector(".rr-" + name);
    var cur = el.getAttribute("data-src") || "";
    if (cur === (url || "")) return;
    el.setAttribute("data-src", url || "");
    if (!url) { el.classList.add("is-empty"); el.classList.remove("is-in"); el.style.backgroundImage = ""; return; }
    el.style.backgroundImage = 'url("' + url + '")';
    el.classList.remove("is-empty", "is-in");
    void el.offsetWidth;                       // restart the intro
    el.classList.add("is-in");
}
function rrUpdateScene() {
    var root = document.getElementById("reforged-calculator");
    var p = reforgedState.primaryPath, s = reforgedState.secondaryPath;
    var base = p ? RR_ART + "construct/" + p.id + "/" : null;
    var ks = p ? reforgedState.primaryPicks[0] : null;
    var hasKs = ks != null && (RR_SCENE_KEYSTONES[p.id] || []).indexOf(parseInt(ks, 10)) >= 0;
    rrSetLayer(root, "env", base ? base + "environment.jpg" : null);
    rrSetLayer(root, "splash", base && s ? base + "second/" + s.id + ".webp" : null);
    rrSetLayer(root, "construct", base ? base + "construct.webp" : null);
    rrSetLayer(root, "keystone", base && hasKs ? base + "keystones/" + ks + ".webp" : null);
}

// ---------- Interaction -------------------------------------------------------

function handlePathPick(side, path) {
    if (side === "primary") {
        if (reforgedState.primaryPath && reforgedState.primaryPath.id === path.id) return;
        reforgedState.primaryPath = path;
        reforgedState.primaryPicks = [null, null, null, null];
        // A secondary that collides with the new primary is cleared.
        if (reforgedState.secondaryPath && reforgedState.secondaryPath.id === path.id) {
            reforgedState.secondaryPath = null;
            reforgedState.secondaryPicks = [null, null, null, null];
            reforgedState.secondaryOrder = [];
        }
    } else {
        if (reforgedState.primaryPath && reforgedState.primaryPath.id === path.id) return;
        if (reforgedState.secondaryPath && reforgedState.secondaryPath.id === path.id) return;
        reforgedState.secondaryPath = path;
        reforgedState.secondaryPicks = [null, null, null, null];
        reforgedState.secondaryOrder = [];
    }
    renderReforgedStage();
    updateReforgedShareLink();
}

function handleRunePick(side, row, rune) {
    if (side === "primary") {
        var picks = reforgedState.primaryPicks;
        picks[row] = (picks[row] === rune.id) ? null : rune.id;     // click again = unselect
    } else {
        var sp = reforgedState.secondaryPicks, order = reforgedState.secondaryOrder;
        var at = order.indexOf(row);
        if (sp[row] === rune.id) {                                   // unselect
            sp[row] = null;
            if (at >= 0) order.splice(at, 1);
        } else {
            // Grid mode: a sibling in a picked row re-picks that row as the
            // newest; a third row drops the oldest pick.
            if (at >= 0) order.splice(at, 1);
            sp[row] = rune.id;
            order.push(row);
            while (order.length > 2) sp[order.shift()] = null;
        }
    }
    renderReforgedStage();
    updateReforgedShareLink();
}

function handleShardPick(row, id) {
    reforgedState.shards[row] = String(reforgedState.shards[row]) === String(id) ? null : id;
    renderReforgedStage();
    updateReforgedShareLink();
}

// SAVE = the header's Share (copy the link) and marks the page clean.
function rrSavePage() {
    var url = new URL($("#reforged-export-link").attr("href") || (location.pathname + location.hash), location.href).toString();
    // Saving marks the page clean whether or not the clipboard copy works,
    // same as the masteries and runes pages.
    reforgedUi.savedHash = buildReforgedHash();
    rrUpdateTopRow();
    copyToClipboardReforged(url).then(function(){
        reforgedToast(LolToast && LolToast.COPIED || "URL copied");
    }, function(){ reforgedToast(LolToast && LolToast.COPY_FAILED || "Copy failed"); });
}

// "+" (next page number) and trash (back to page 1): a fresh page. The
// old build stays one Back away (pushState).
function rrNewPage(no) {
    rrHideTip();
    var before = buildReforgedHash();
    resetReforgedSelections();
    // "New Runes Page N" (the client's perks_new_page_name); page 1 is the
    // default and stays out of the hash.
    reforgedState.pageName = no > 1 ? RR_TEXT.newPage + no : null;
    if (before && window.history && history.pushState) history.pushState({ rr: 1 }, "", "#" + before);
    reforgedUi.savedHash = buildReforgedHash();
    renderReforgedStage();
    updateReforgedShareLink();
}

// --- URL hash sharing ----------------------------------------------------
// Format: <dataset-id>|primaryPathId,k,m1,m2,m3|secondaryPathId,,sm1,sm2,sm3|s1,s2,s3[|name]
function buildReforgedHash() {
    var ds = rrDs();
    if (!ds) return "";
    var parts = [ds.id];
    if (reforgedState.primaryPath) {
        parts.push(reforgedState.primaryPath.id + "," + reforgedState.primaryPicks.map(function(p){return p||"";}).join(","));
    } else parts.push("");
    if (reforgedState.secondaryPath) {
        parts.push(reforgedState.secondaryPath.id + "," + reforgedState.secondaryPicks.map(function(p){return p||"";}).join(","));
    } else parts.push("");
    parts.push(reforgedState.shards.map(function(s){return s||"";}).join(","));
    if (reforgedState.pageName) parts.push(encodeURIComponent(reforgedState.pageName));
    return parts.join("|");
}

function parseReforgedHash(hash) {
    if (!hash) return null;
    // Links pasted through chat apps / share sheets often arrive percent-
    // encoded ("|" as %7C, "," as %2C). With no literal "|" the whole hash
    // was encoded once: decode it (a page name inside stays encoded one
    // level, as buildReforgedHash wrote it). The id fields never hold a
    // legitimate escape, so a stray %2C there is always a comma.
    if (hash.indexOf("|") < 0 && /%7C|%2C/i.test(hash)) {
        try { hash = decodeURIComponent(hash); } catch (e) { hash = hash.replace(/%7C/gi, "|").replace(/%2C/gi, ","); }
    }
    var parts = hash.split("|");
    for (var k = 1; k <= 3 && k < parts.length; k++) parts[k] = parts[k].replace(/%2C/gi, ",");
    // The id resolves through the registry: listed, alias or unlisted patch
    // (dsId is then the canonical id the page rewrites the URL to).
    var entry = rrEntryOf(parts[0]);
    if (!entry) return null;
    var name = null;
    if (parts[4]) { try { name = decodeURIComponent(parts[4]).slice(0, 25); } catch (e) { name = null; } }
    return {
        dsId: entry.id,
        entry: entry,
        primary: parts[1] || "",
        secondary: parts[2] || "",
        shards: parts[3] || "",
        name: name
    };
}

// True when `runeId` is one of the runes offered in `path`'s slot row
// `slotIdx` — used to drop stale/foreign ids from shared hashes.
function runeInSlot(path, slotIdx, runeId) {
    if (runeId == null || !path || !path.slots[slotIdx]) return false;
    var runes = path.slots[slotIdx].runes;
    for (var i = 0; i < runes.length; i++)
        if (runes[i].id === runeId) return true;
    return false;
}

// Shard ids valid for the dataset's shard table (row-wise).
function shardInRow(ds, row, id) {
    var rows = getReforgedShardRows(ds);
    if (!rows || !rows[row] || !id) return false;
    for (var i = 0; i < rows[row].shards.length; i++) if (String(rows[row].shards[i].id) === String(id)) return true;
    return false;
}

function applyReforgedHashAfterLoad(parsed, silent) {
    if (!parsed || !reforgedState.catalog) return;
    if (parsed.primary) {
        var pParts = parsed.primary.split(",");
        var pPath = findPathById(parseInt(pParts[0], 10));
        if (pPath) {
            reforgedState.primaryPath = pPath;
            for (var p = 0; p < 4; p++) {
                var pId = pParts[p + 1] ? parseInt(pParts[p + 1], 10) : null;
                reforgedState.primaryPicks[p] = runeInSlot(pPath, p, pId) ? pId : null;
            }
        }
    }
    if (parsed.secondary) {
        var sParts = parsed.secondary.split(",");
        var sPath = findPathById(parseInt(sParts[0], 10));
        if (sPath && (!reforgedState.primaryPath || sPath.id !== reforgedState.primaryPath.id)) {
            reforgedState.secondaryPath = sPath;
            reforgedState.secondaryPicks[0] = null;         // no keystone for secondary
            reforgedState.secondaryOrder = [];
            var taken = 0;
            for (var s = 1; s < 4; s++) {
                var sId = sParts[s + 1] ? parseInt(sParts[s + 1], 10) : null;
                var ok = taken < 2 && runeInSlot(sPath, s, sId);
                reforgedState.secondaryPicks[s] = ok ? sId : null;
                if (ok) { taken++; reforgedState.secondaryOrder.push(s); }
            }
        }
    }
    if (parsed.shards) {
        var shParts = parsed.shards.split(",");
        var ds = rrDs();
        reforgedState.shards = [0, 1, 2].map(function(k){
            var v = shParts[k] ? shParts[k] : null;
            // Keep unknown ids only when the table has no such row (old
            // behaviour); drop ids the era's table does not offer.
            return v && (!getReforgedShardRows(ds) || shardInRow(ds, k, v)) ? v : null;
        });
    }
    if (parsed.name !== undefined) reforgedState.pageName = parsed.name || null;
    if (!silent) renderReforgedStage();
}

function updateReforgedShareLink() {
    var hash = buildReforgedHash();
    var url = location.pathname + (hash ? "#" + hash : "");
    $("#reforged-export-link").attr("href", url);
    if (hash && location.hash.slice(1) !== hash) history.replaceState(null, "", "#" + hash);
    rrUpdateTopRow();
}

function copyToClipboardReforged(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var $ta = $("<textarea>").val(text).css({position:"fixed",top:0,left:0,opacity:0}).appendTo("body");
    $ta[0].select();
    try { document.execCommand("copy"); $ta.remove(); return $.Deferred().resolve(); }
    catch (e) { $ta.remove(); return $.Deferred().reject(); }
}

$(function(){
    var mode = rrStore("mode"), detailed = rrStore("detailed");
    if (mode === "list" || mode === "grid") reforgedUi.mode = mode;
    if (detailed === "0" || detailed === "1") reforgedUi.detailed = detailed === "1";
    var root = document.getElementById("reforged-calculator");
    rrBuildSkeleton(root);

    // The hash's dataset (canonical, alias or unlisted patch); an empty or
    // unknown hash opens the page default (rr-v26-19, the live patch) empty.
    var parsed = parseReforgedHash(location.hash.slice(1));
    var entry = (parsed && parsed.entry) || LolPatches.pageDefault("reforged");
    $("#reforged-patch-select").on("change", function(){
        activateReforgedDataSet(LolPatches.entry("reforged", $(this).val()));
    });
    activateReforgedDataSet(entry, parsed);

    // Back / Forward (+ and trash push the previous page).
    window.addEventListener("popstate", function(){
        var p = parseReforgedHash(location.hash.slice(1));
        if (!p) return;
        if (p.dsId !== reforgedState.dataSetId || !reforgedState.catalog) { activateReforgedDataSet(p.entry, p); return; }
        if (reforgedUi.pending) {                   // back on the patch on screen: drop the load
            ++reforgedUi.loadToken;
            reforgedUi.pending = null;
            rrSyncHeader(rrDs());
            rrSetLoading(null);
        }
        resetReforgedSelections();
        reforgedState.pageName = null;
        applyReforgedHashAfterLoad(p, true);
        reforgedUi.savedHash = buildReforgedHash();
        renderReforgedStage();
        updateReforgedShareLink();
    });

    // SHIFT shows the long descriptions while held.
    var setShift = function(on){
        if (reforgedUi.shift === on) return;
        reforgedUi.shift = on;
        rrRefreshTip();
    };
    document.addEventListener("keydown", function(e){ if (e.keyCode === 16) setShift(true); });
    document.addEventListener("keyup", function(e){ if (e.keyCode === 16) setShift(false); });
    window.addEventListener("blur", function(){ setShift(false); });
    // Tap outside closes list-mode drawers.
    document.addEventListener("click", function(e){
        if (reforgedUi.mode === "list" && !root.contains(e.target)) rrCloseDrawers();
    });

    $("#reforged-share").click(function(){
        var url = new URL($("#reforged-export-link").attr("href") || (location.pathname + location.hash), location.href).toString();
        copyToClipboardReforged(url).then(function(){ reforgedToast(LolToast && LolToast.COPIED || "URL copied"); },
            function(){ reforgedToast(LolToast && LolToast.COPY_FAILED || "Copy failed"); });
    });
});
