// 1:1 reconstruction of the legacy LoL client's Runes tab.
//
// Slot order matches the in-game level-unlock progression:
//   0-8   Marks (9, hexagonal)
//   9-17  Seals (9, hexagonal)
//   18-26 Glyphs (9, hexagonal)
//   27-29 Quintessences (3, large square)
//
// Slot positions are CENTER points relative to .rune-grid (which has
// transform: scale(0.75)); each slot has CSS transform: translate(-50%,-50%)
// so it's drawn centered on its (left, top) value.

var CATEGORY_ORDER = ["mark", "seal", "glyph", "quintessence"];
var CATEGORY_LABEL = {
    mark: "Marks",
    seal: "Seals",
    glyph: "Glyphs",
    quintessence: "Quintessences"
};

// Per-category legacy art used for the filled-slot icon. Each rune category
// shares one piece of art (the in-game runes have unique art per stat, but
// the legacy-lol-client uses these as the canonical visuals).
var CATEGORY_ART = {
    mark:         "images/runes/legacy_arrow_mark.png",
    seal:         "images/runes/legacy_trophy_seal.png",
    glyph:        "images/runes/legacy_shell_glyph.png",
    quintessence: "images/runes/legacy_dragon_quint.png"
};

// Slot positions from the legacy DOM (left/top, in px, relative to .rune-grid).
// 30 entries — Marks (0-8), Seals (9-17), Glyphs (18-26), Quintessences (27-29).
// In the legacy these coords sit inside a runeGrid with transform: scale(0.75)
// and transform-origin: 50% 50%. We bake that scale + grid offset into the
// final values by computing absolute parchment-pixel positions here. Slots are
// then placed directly on the parchment with `position: absolute` and
// `transform: translate(-50%, -50%)`, so left/top are the slot's CENTER.
// Array order = in-game fill order (level-based unlock sequence):
//   Marks  1, 4, 7, 11, 14, 17, 21, 24, 27 (bottom-up, L→R)
//   Seals  2, 5, 8, 12, 15, 18, 22, 25, 28 (diagonal up from marks)
//   Glyphs 3, 6, 9, 13, 16, 19, 23, 26, 29 (top-right cluster)
//   Quints 10, 20, 30 (top-left, lower-middle, middle-right)
//
// Positions are EXACT centers of the slot indents painted into the
// parchment background art. Captured by image analysis (detect-indents.py)
// of summoners_runes_bg.jpg in 1024x615 logical coords — set SLOT_OFFSET_X
// and SLOT_OFFSET_Y to 0 and SLOT_SCALE to 1 since these are already final.
var SLOT_LEGACY = [
    // Marks
    [ 279, 530 ], [ 337, 528 ], [ 403, 530 ],
    [ 269, 477 ], [ 325, 473 ], [ 374, 487 ],
    [ 290, 431 ], [ 362, 434 ], [ 327, 396 ],

    // Seals
    [ 294, 356 ], [ 357, 353 ], [ 320, 312 ],
    [ 370, 292 ], [ 398, 251 ], [ 449, 227 ],
    [ 500, 211 ], [ 557, 194 ], [ 582, 239 ],

    // Glyphs
    [ 617, 197 ], [ 647, 240 ], [ 676, 197 ],
    [ 716, 232 ], [ 690, 274 ], [ 751, 197 ],
    [ 794, 227 ], [ 758, 264 ], [ 777, 310 ],

    // Quintessences
    [ 321, 224 ], [ 460, 393 ], [ 664, 345 ]
];

// SLOT_LEGACY positions are now in absolute parchment-logical pixels
// (captured by detect-indents.py), so no offset/scale is needed.
var SLOT_SCALE = 1;
var SLOT_OFFSET_X = 0;
var SLOT_OFFSET_Y = 0;
var SLOT_POSITIONS = SLOT_LEGACY.map(function(p){
    return { x: SLOT_OFFSET_X + p[0] * SLOT_SCALE, y: SLOT_OFFSET_Y + p[1] * SLOT_SCALE };
});

// Parchment-logical canvas dimensions. Slot positions are stored in this
// space; we convert to percentages of the parchment so the layout scales
// fluidly with the responsive container.
var PARCHMENT_LOGICAL_W = 1024;
var PARCHMENT_LOGICAL_H = 615;

function positionToPercent(pos) {
    return {
        left: (pos.x / PARCHMENT_LOGICAL_W * 100) + "%",
        top:  (pos.y / PARCHMENT_LOGICAL_H * 100) + "%"
    };
}

// Per-stat display config — label, suffix, decimals. Order = display order.
var STAT_DISPLAY = [
    { key: "ad",        label: "Attack Damage",       suffix: "",  decimals: 2 },
    { key: "ap",        label: "Ability Power",       suffix: "",  decimals: 2 },
    { key: "as",        label: "Attack Speed",        suffix: "%", decimals: 2 },
    { key: "crit",      label: "Critical Chance",     suffix: "%", decimals: 2 },
    { key: "critDmg",   label: "Critical Damage",     suffix: "%", decimals: 2 },
    { key: "armor",     label: "Armor",               suffix: "",  decimals: 2 },
    { key: "mr",        label: "Magic Resist",        suffix: "",  decimals: 2 },
    { key: "hp",        label: "Health",              suffix: "",  decimals: 1 },
    { key: "hpPercent", label: "Percent Health",      suffix: "%", decimals: 2 },
    { key: "mp",        label: "Mana",                suffix: "",  decimals: 1 },
    { key: "hpRegen",   label: "Health Regen / 5s",   suffix: "",  decimals: 2 },
    { key: "mpRegen",   label: "Mana Regen / 5s",     suffix: "",  decimals: 2 },
    { key: "energy",    label: "Energy",              suffix: "",  decimals: 2 },
    { key: "energyRegen", label: "Energy Regen / 5s", suffix: "",  decimals: 2 },
    { key: "ms",        label: "Movement Speed",      suffix: "%", decimals: 2 },
    { key: "cdr",       label: "Cooldown Reduction",  suffix: "%", decimals: 2 },
    { key: "lethality", label: "Lethality",           suffix: "",  decimals: 2 },
    { key: "arpen",     label: "Armor Penetration",   suffix: "",  decimals: 2 },
    { key: "mpen",      label: "Magic Penetration",   suffix: "",  decimals: 2 },
    { key: "ls",        label: "Life Steal",          suffix: "%", decimals: 2 },
    { key: "sv",        label: "Spell Vamp",          suffix: "%", decimals: 2 },
    { key: "gold",      label: "Gold / 10s",          suffix: "",  decimals: 2 },
    { key: "xp",        label: "Experience",          suffix: "%", decimals: 2 },
    { key: "timeDead",  label: "Time Dead Reduction", suffix: "%", decimals: 2 }
];

var activeRuneDataSetId = null;
var activeRuneDataSet = null;
var runeSlots = [];           // length 30, each null or rune object
var slotMeta = [];            // length 30, { category, indexInCategory }
var selectedSlotIndex = -1;   // which slot is selected for assignment
var championLevel = 18;
var _runeToastTimer = null;
// Sidebar filters — category dropdown + tier checkboxes.
var runeFilters = { category: "all", tiers: { 1: true, 2: true, 3: true } };

// Per-rune icon straight from the legacy Data Dragon art bundled in the
// repo; falls back to the shared category art for any rune without one.
function runeIconSrc(rune) {
    if (rune.icon && activeRuneDataSet && activeRuneDataSet.iconBasePath)
        return activeRuneDataSet.iconBasePath + rune.icon;
    return CATEGORY_ART[rune.category];
}

function categoryOfSlot(slotIndex) { return slotMeta[slotIndex].category; }

function slotIndexFor(category, indexInCategory) {
    var offset = 0;
    for (var i = 0; i < CATEGORY_ORDER.length; i++) {
        if (CATEGORY_ORDER[i] === category) return offset + indexInCategory;
        offset += activeRuneDataSet.slots[CATEGORY_ORDER[i]];
    }
    return -1;
}

function initSlotsForDataSet(dataSet) {
    runeSlots = [];
    slotMeta = [];
    for (var i = 0; i < CATEGORY_ORDER.length; i++) {
        var cat = CATEGORY_ORDER[i];
        var count = dataSet.slots[cat] || 0;
        for (var j = 0; j < count; j++) {
            runeSlots.push(null);
            slotMeta.push({ category: cat, indexInCategory: j });
        }
    }
}

function switchRuneDataSet(id, opts) {
    opts = opts || {};
    var dataSet = getRuneDataSet(id);
    if (!dataSet) return false;
    activeRuneDataSetId = id;
    activeRuneDataSet = dataSet;
    initSlotsForDataSet(dataSet);
    applyParchmentArt(dataSet);

    refreshRunesSeasonNav(dataSet);
    rebuildRunePatchSelect(dataSet.season, dataSet.id);

    drawRuneSlots();
    buildCategoriesSidebar();
    if (!opts.skipUpdates) {
        recomputeStats();
        updateLink();
    }
    return true;
}

// Each dataset can supply a unique parchment background, letting us swap
// the in-game art when we land per-season image assets.
function applyParchmentArt(dataSet) {
    var bg = dataSet.parchmentImage || "images/runes/summoners_runes_bg.jpg";
    $("#parchment").css("background-image", "url(" + bg + ")");
}

// ---------- Slot grid ------------------------------------------------------

function drawRuneSlots() {
    var $area = $("#rune-slots");
    // Wipe slots/glows but preserve the .page-title element.
    $area.find(".rune-slot, .slot-glow").remove();
    for (var i = 0; i < runeSlots.length; i++) {
        appendSlotElements($area, i);
    }
}

function appendSlotElements($area, slotIndex) {
    var rune = runeSlots[slotIndex];
    var cat = categoryOfSlot(slotIndex);
    var pos = SLOT_POSITIONS[slotIndex];
    var isQuint = (cat === "quintessence");

    if (rune) {
        $area.append(
            $("<div>")
                .addClass("slot-glow")
                .addClass("glow-" + cat)
                .toggleClass("large-glow", isQuint)
                .css(positionToPercent(pos))
        );
    }
    var $slot = $("<div>")
        .addClass("rune-slot")
        .addClass("slot-" + cat)
        .toggleClass("large-slot", isQuint)
        .toggleClass("filled", !!rune)
        .attr("data-slot", slotIndex)
        .attr("title", rune
            ? rune.name + " — " + (rune.desc || describeRune(rune)) + " (click to remove)"
            : "Empty " + CATEGORY_LABEL[cat].slice(0, -1) + " — click a rune in the sidebar to fill")
        .css(positionToPercent(pos))
        .on("click", function(){
            var idx = +$(this).attr("data-slot");
            if (runeSlots[idx] !== null) {
                // Filled: click removes the rune from the slot.
                assignRuneToSlot(idx, null);
            } else {
                // Empty: open the matching category in the sidebar so the
                // user can pick a rune. The actual fill happens on a click
                // on the rune item (which auto-finds the next empty slot).
                var slotCat = categoryOfSlot(idx);
                $(".category-group").each(function(){
                    if ($(this).attr("data-category") === slotCat) $(this).addClass("open");
                });
            }
        });
    if (rune) {
        $slot.append(
            $("<img>")
                .addClass("placed-rune")
                .attr("alt", rune.name)
                .attr("src", runeIconSrc(rune))
        );
    } else {
        $slot.append($("<div>").addClass("slot-indicator"));
    }
    $area.append($slot);
}

// Return the array index of the next empty slot of the given category in
// fill order (= SLOT_LEGACY array order). -1 if the category is full.
function nextEmptySlotIndex(category) {
    for (var i = 0; i < runeSlots.length; i++) {
        if (slotMeta[i].category === category && runeSlots[i] === null) return i;
    }
    return -1;
}

function selectSlot(slotIndex) {
    selectedSlotIndex = slotIndex;
    $(".rune-slot").removeClass("selected");
    $(".rune-slot[data-slot='" + slotIndex + "']").addClass("selected");
    // Auto-open the matching category in the sidebar.
    var cat = categoryOfSlot(slotIndex);
    $(".category-group").each(function(){
        var groupCat = $(this).attr("data-category");
        $(this).toggleClass("open", groupCat === cat);
    });
}

function assignRuneToSlot(slotIndex, rune) {
    if (slotIndex < 0 || slotIndex >= runeSlots.length) return;
    if (rune && rune.category !== categoryOfSlot(slotIndex)) return;
    runeSlots[slotIndex] = rune;
    drawRuneSlots();
    recomputeStats();
    updateLink();
    $(".rune-item").removeClass("selected");
    if (rune) $(".rune-item[data-rune='" + rune.id + "']").addClass("selected");
}

// ---------- Sidebar (categories + rune library) ---------------------------

function buildCategoriesSidebar() {
    var $cats = $("#runes-categories").empty();
    for (var c = 0; c < CATEGORY_ORDER.length; c++) {
        var cat = CATEGORY_ORDER[c];
        if (runeFilters.category !== "all" && runeFilters.category !== cat) continue;
        var $group = $("<div>")
            .addClass("category-group")
            .attr("data-category", cat);
        var $header = $("<div>")
            .addClass("category-header")
            .addClass("header-" + cat)
            .append($("<span>").addClass("category-arrow").html("&#9656;"))
            .append(document.createTextNode(CATEGORY_LABEL[cat]))
            .on("click", function(){
                $(this).closest(".category-group").toggleClass("open");
            });
        var $items = $("<div>").addClass("rune-items");
        var runes = activeRuneDataSet.runes.filter(function(r){
            return r.category === cat && runeFilters.tiers[r.tier];
        });
        for (var i = 0; i < runes.length; i++) {
            (function(rune){
                $items.append(
                    $("<div>")
                        .addClass("rune-item")
                        .attr("data-rune", rune.id)
                        .append(
                            $("<img>")
                                .addClass("rune-icon-small")
                                .toggleClass("q", rune.category === "quintessence")
                                .attr("src", runeIconSrc(rune))
                        )
                        .append(
                            $("<div>").addClass("rune-info")
                                .append($("<div>").addClass("rune-name").text(rune.name))
                                .append($("<div>").addClass("rune-stats-inline").text(rune.desc || describeRune(rune)))
                        )
                        .on("click", function(){
                            // Auto-fill the next empty slot of this rune's
                            // category, in the legacy in-game unlock order
                            // (Mark slot 1 first, then 4, then 7, etc.).
                            var nextIdx = nextEmptySlotIndex(rune.category);
                            if (nextIdx >= 0) assignRuneToSlot(nextIdx, rune);
                        })
                );
            })(runes[i]);
        }
        if (!runes.length) {
            $items.append($("<div>").addClass("rune-items-empty")
                .text("No runes match the active tier filter."));
        }
        $group.append($header).append($items);
        $cats.append($group);
    }
}

// ---------- Stats + describe -----------------------------------------------

function describeRune(rune) {
    var parts = [];
    var sources = [rune.base || {}, rune.perLevel || {}];
    var labels = ["", " / lvl"];
    for (var s = 0; s < sources.length; s++) {
        var src = sources[s];
        for (var key in src) {
            var cfg = lookupStatDisplay(key);
            if (!cfg) continue;
            parts.push("+" + formatStatValue(src[key], cfg) + " " + cfg.label + labels[s]);
        }
    }
    return parts.join(", ");
}

function lookupStatDisplay(key) {
    for (var i = 0; i < STAT_DISPLAY.length; i++)
        if (STAT_DISPLAY[i].key === key) return STAT_DISPLAY[i];
    return null;
}

function formatStatValue(val, cfg) {
    return val.toFixed(cfg.decimals).replace(/\.?0+$/, "") + cfg.suffix;
}

function computeTotals(level) {
    var totals = {};
    for (var i = 0; i < runeSlots.length; i++) {
        var r = runeSlots[i];
        if (!r) continue;
        if (r.base) for (var k in r.base) totals[k] = (totals[k] || 0) + r.base[k];
        if (r.perLevel) for (var k2 in r.perLevel) totals[k2] = (totals[k2] || 0) + r.perLevel[k2] * level;
    }
    return totals;
}

function recomputeStats() {
    var totals = computeTotals(championLevel);
    var $list = $("#stats-list").empty();
    var any = false;
    for (var i = 0; i < STAT_DISPLAY.length; i++) {
        var cfg = STAT_DISPLAY[i];
        var v = totals[cfg.key] || 0;
        if (!v) continue;
        any = true;
        $list.append(
            $("<div>").addClass("stat-row")
                .append($("<div>").addClass("stat-name").text(cfg.label))
                .append($("<div>").addClass("stat-value").text("+ " + formatStatValue(v, cfg)))
        );
    }
    if (!any) $list.append($("<div>").addClass("stats-empty").text("No runes placed"));
}

// ---------- Hash / share ---------------------------------------------------

function encodeHash() {
    var parts = [];
    for (var i = 0; i < runeSlots.length; i++) {
        parts.push(runeSlots[i] ? runeSlots[i].id : "_");
    }
    var hash = activeRuneDataSetId + "|" + parts.join(",");
    if (championLevel !== 18) hash += "|" + championLevel;
    return hash;
}

function parseRuneHash(raw) {
    if (!raw) return { id: DEFAULT_RUNE_DATA_SET_ID, slotIds: [], level: 18 };
    var parts = raw.split("|");
    if (parts.length === 1) return { id: DEFAULT_RUNE_DATA_SET_ID, slotIds: parts[0].split(","), level: 18 };
    var level = parseInt(parts[2], 10);
    if (!(level >= 1 && level <= 18)) level = 18;
    return { id: parts[0], slotIds: (parts[1] || "").split(","), level: level };
}

function updateLink() {
    var hash = "";
    var hasAny = runeSlots.some(function(s){ return s !== null; });
    if (hasAny || activeRuneDataSetId !== DEFAULT_RUNE_DATA_SET_ID || championLevel !== 18) {
        hash = "#" + encodeHash();
    }
    $("#exportLink").attr("href", document.location.pathname + hash);
    if (document.location.hash !== hash) {
        document.location.replace(hash || "#");
        $(window).unbind("hashchange");
        setTimeout(function(){ $(window).bind("hashchange", updateFromHash); }, 500);
    }
}

function updateFromHash() {
    var parsed = parseRuneHash(document.location.hash.slice(1));
    if (parsed.id !== activeRuneDataSetId) {
        if (!switchRuneDataSet(parsed.id, { skipUpdates: true })) {
            switchRuneDataSet(DEFAULT_RUNE_DATA_SET_ID, { skipUpdates: true });
        }
    } else {
        initSlotsForDataSet(activeRuneDataSet);
    }
    for (var i = 0; i < parsed.slotIds.length && i < runeSlots.length; i++) {
        var id = parsed.slotIds[i];
        if (!id || id === "_") continue;
        var rune = getRuneById(activeRuneDataSet, id);
        if (rune && rune.category === categoryOfSlot(i)) runeSlots[i] = rune;
    }
    setChampionLevel(parsed.level);
    drawRuneSlots();
    recomputeStats();
}

function setChampionLevel(level) {
    championLevel = level;
    $("#champ-level").val(level);
    $("#champ-level-value").text(level);
}

// ---------- Season / Patch dropdowns --------------------------------------

function rebuildRunePatchSelect(season, selectedId) {
    var $patch = $("#patch-select").empty();
    for (var i = 0; i < runeDataSets.length; i++) {
        var ds = runeDataSets[i];
        if (ds.season !== season) continue;
        $patch.append($("<option>").attr("value", ds.id).text(ds.patchLabel));
    }
    if (selectedId) $patch.val(selectedId);
}

// Season dropdown + tabs come from the shared season-led nav (nav.js); the
// patch dropdown stays page-local and lists this season's snapshots.
function refreshRunesSeasonNav(dataSet) {
    if (typeof setClientEra === "function") setClientEra(clientEraFor(dataSet.id));
    if (typeof buildSeasonNav !== "function") return;
    buildSeasonNav({
        page: "runes",
        seasonSelect: "#season-select",
        currentKey: "s" + dataSet.season,
        onSeason: function(def){
            for (var i = 0; i < runeDataSets.length; i++) {
                if ("s" + runeDataSets[i].season === def.key) {
                    switchRuneDataSet(runeDataSets[i].id);
                    return true;
                }
            }
            return false;
        }
    });
}

function buildRuneSelectors() {
    var active = getRuneDataSet(activeRuneDataSetId) || getRuneDataSet(DEFAULT_RUNE_DATA_SET_ID);
    refreshRunesSeasonNav(active);
    rebuildRunePatchSelect(active.season, active.id);
    $("#patch-select").on("change", function(){
        switchRuneDataSet($(this).val());
    });
}

// ---------- Clipboard / toast ----------------------------------------------

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject){
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); }
        catch (e) { reject(e); }
        finally { document.body.removeChild(ta); }
    });
}

function showToast(msg) {
    if (window.LolToast) return LolToast.show(msg);
    var $t = $("#toast").text(msg).addClass("visible");
    if (_runeToastTimer) clearTimeout(_runeToastTimer);
    _runeToastTimer = setTimeout(function(){ $t.removeClass("visible"); }, 1800);
}

// ---------- Init -----------------------------------------------------------

$(function(){
    var parsed = parseRuneHash(document.location.hash.slice(1));
    var initial = getRuneDataSet(parsed.id) || getRuneDataSet(DEFAULT_RUNE_DATA_SET_ID);
    activeRuneDataSetId = initial.id;
    activeRuneDataSet = initial;
    initSlotsForDataSet(initial);
    applyParchmentArt(initial);
    for (var i = 0; i < parsed.slotIds.length && i < runeSlots.length; i++) {
        var id = parsed.slotIds[i];
        if (!id || id === "_") continue;
        var rune = getRuneById(initial, id);
        if (rune && rune.category === categoryOfSlot(i)) runeSlots[i] = rune;
    }
    setChampionLevel(parsed.level);

    drawRuneSlots();
    buildCategoriesSidebar();
    buildRuneSelectors();
    recomputeStats();
    updateLink();

    // Sidebar filters — category dropdown + tier checkboxes.
    $("#rune-category-filter").on("change", function(){
        runeFilters.category = $(this).val();
        buildCategoriesSidebar();
    });
    $(".tier-filters input[type='checkbox']").on("change", function(){
        runeFilters.tiers[parseInt($(this).val(), 10)] = this.checked;
        buildCategoriesSidebar();
    });

    // Champion level scrubber — scaling runes recompute at the new level.
    $("#champ-level").on("input change", function(){
        var level = parseInt($(this).val(), 10);
        if (!(level >= 1 && level <= 18)) level = 18;
        setChampionLevel(level);
        recomputeStats();
        updateLink();
    });

    $("#action-clear").click(function(){
        initSlotsForDataSet(activeRuneDataSet);
        drawRuneSlots();
        recomputeStats();
        updateLink();
    });
    $("#action-delete").click(function(){
        // Same as clear for now — eventually will delete a saved page.
        $("#action-clear").click();
    });
    $("#action-save").click(function(){
        // Save-pages feature is a future iteration; for now show the toast.
        showToast("Save-pages feature coming soon");
    });

    $("#share").click(function(){
        var href = $("#exportLink").attr("href") || document.location.pathname + document.location.hash;
        var url = new URL(href, document.location.href).toString();
        copyToClipboard(url).then(
            function(){ showToast("URL copied to clipboard"); },
            function(){ showToast("Copy failed — here it is: " + url); }
        );
    });

    $(window).bind("hashchange", updateFromHash);
});
