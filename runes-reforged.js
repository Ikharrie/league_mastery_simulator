// Runes Reforged picker — V7.22 through V14.19+.
//
// Loads runesReforged.json from Riot Data Dragon for the active patch and
// renders the two-column primary/secondary picker plus stat shards (V8.23+).
//
// Rules:
//   - One primary path. Pick 1 keystone (slot 0) + 1 minor per slot 1/2/3.
//   - One secondary path (different from primary). Pick 2 minor runes from
//     slots 1/2/3, but no two from the SAME slot.
//   - Three stat shards (one per row of three: offense / flex / defense).
//   - V7.22 had no stat shards; the shards block hides automatically.

var reforgedState = {
    dataSetId: null,
    catalog: null,           // [{id, key, name, icon, slots:[{slot, runes:[]}]}]
    primaryPath: null,
    primaryPicks: [null, null, null, null],   // [keystone, slot1, slot2, slot3]
    secondaryPath: null,
    // Indexed by slot row (index 0 unused — the secondary path has no
    // keystone). At most 2 non-null across slots 1-3.
    secondaryPicks: [null, null, null, null],
    shards: [null, null, null],               // offense/flex/defense
};

var REFORGED_DD_BASE = "https://ddragon.leagueoflegends.com/cdn/";
// Rune / path icons are served from the VERSIONLESS cdn/img/ root — the
// versioned cdn/{patch}/img/ path 403s for perk images.
var REFORGED_IMG_BASE = "https://ddragon.leagueoflegends.com/cdn/img/";

// Resolve a catalog icon reference to a fetchable URL. Modern catalogs use
// "perk-images/..." paths served by DDragon's versionless img root. The
// V7.22-era catalog instead carries raw game-asset paths
// ("ASSETS/Perks/....dds") that DDragon never served as images —
// CommunityDragon archives those patches and mirrors ASSETS/Perks under
// v1/perk-images with lowercased paths and .png extensions.
function reforgedIconUrl(icon) {
    if (!icon) return "";
    if (icon.indexOf("perk-images/") === 0) return REFORGED_IMG_BASE + icon;
    var ds = getReforgedDataSet(reforgedState.dataSetId);
    var branch = ds ? ds.ddragonVersion.split(".").slice(0, 2).join(".") : "latest";
    return "https://raw.communitydragon.org/" + branch +
        "/plugins/rcp-be-lol-game-data/global/default/v1/" +
        icon.toLowerCase()
            .replace(/^assets\/perks\//, "perk-images/")
            .replace(/\.dds$/, ".png");
}

// ---------- Tooltip (original client style) ----------------------------------

function reforgedTooltipEl() {
    var $tip = $("#reforged-tooltip");
    if (!$tip.length) {
        $tip = $("<div>").attr("id", "reforged-tooltip").addClass("lol-tooltip")
            .append($("<div>").addClass("lol-tooltip-title"))
            .append($("<div>").addClass("lol-tooltip-sub"))
            .append($("<div>").addClass("lol-tooltip-body"))
            .appendTo("body");
    }
    return $tip;
}

function positionReforgedTooltip($tip, e) {
    var w = $tip.outerWidth(), h = $tip.outerHeight();
    var x = e.clientX + 18, y = e.clientY + 18;
    if (x + w > window.innerWidth - 8)  x = e.clientX - w - 12;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 12;
    $tip.css({ left: Math.max(4, x) + "px", top: Math.max(4, y) + "px" });
}

// The catalog descriptions carry client-only markup (<lol-uikit-*> keyword
// wrappers) and, in the V7.22-era files, unresolved @Variable@ placeholders.
// Keep basic formatting tags, drop everything else.
function sanitizeReforgedDesc(html) {
    return String(html || "")
        .replace(/@[A-Za-z0-9_.*%\-]+@/g, "?")
        .replace(/<(?!\/?(b|i|u|br|hr|font)\b)[^>]*>/gi, "");
}

function showReforgedTooltip(e, title, sub, descHtml) {
    var $tip = reforgedTooltipEl();
    $tip.find(".lol-tooltip-title").text(title);
    $tip.find(".lol-tooltip-sub").text(sub || "").toggle(!!sub);
    $tip.find(".lol-tooltip-body").html(sanitizeReforgedDesc(descHtml)).toggle(!!descHtml);
    $tip.show();
    positionReforgedTooltip($tip, e);
}

function hideReforgedTooltip() {
    $("#reforged-tooltip").hide();
}

function attachReforgedTooltip($el, title, sub, descHtml) {
    $el.on("mouseenter mousemove", function(e){
        showReforgedTooltip(e, title, sub, descHtml);
    });
    $el.on("mouseleave", hideReforgedTooltip);
    return $el;
}

function reforgedToast(msg) {
    if (window.LolToast) return LolToast.show(msg);
    var $t = $("#reforged-toast");
    if (!$t.length) return;
    $t.text(msg).addClass("show");
    setTimeout(function(){ $t.removeClass("show"); }, 1400);
}

// Fetch the runesReforged.json for a given DDragon version. Riot's CDN
// occasionally retires old version directories so we fall back to the
// closest patch on the major-version list returned by `versions.json`.
function fetchRunesReforged(version) {
    var url = REFORGED_DD_BASE + version + "/data/en_US/runesReforged.json";
    return $.ajax({ url: url, dataType: "json" });
}

function activateReforgedDataSet(id) {
    var ds = getReforgedDataSet(id);
    if (!ds) return;
    reforgedState.dataSetId = id;
    if (typeof setClientEra === "function") setClientEra(clientEraFor(id));
    refreshReforgedSeasonNav(ds);
    rebuildReforgedPatchSelect(ds.season, ds.id);
    $(".reforged-page").attr("hidden", "hidden");
    $(".reforged-loading").show().text("Loading runes for " + ds.patchLabel + "…");
    fetchRunesReforged(ds.ddragonVersion).done(function(catalog){
        reforgedState.catalog = catalog;
        resetReforgedSelections();
        $(".reforged-loading").hide();
        $(".reforged-page").removeAttr("hidden");
        renderReforgedPaths();
        renderReforgedShards(ds);
        updateReforgedShareLink();
    }).fail(function(){
        $(".reforged-loading").text(
            "Failed to load runes catalog for " + ds.patchLabel +
            ". Riot's CDN may have retired this DDragon version — try a different patch."
        );
    });
}

function resetReforgedSelections() {
    reforgedState.primaryPath = null;
    reforgedState.primaryPicks = [null, null, null, null];
    reforgedState.secondaryPath = null;
    reforgedState.secondaryPicks = [null, null, null, null];
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

function renderReforgedPaths() {
    var $primary = $("#reforged-primary-strip").empty();
    var $secondary = $("#reforged-secondary-strip").empty();
    reforgedState.catalog.forEach(function(path){
        $primary.append(buildPathButton(path, "primary"));
        $secondary.append(buildPathButton(path, "secondary"));
    });
    renderPrimarySlots();
    renderSecondarySlots();
}

function buildPathButton(path, side) {
    var iconUrl = reforgedIconUrl(path.icon);
    var active = (side === "primary" && reforgedState.primaryPath && reforgedState.primaryPath.id === path.id)
              || (side === "secondary" && reforgedState.secondaryPath && reforgedState.secondaryPath.id === path.id);
    var disabled = (side === "secondary" && reforgedState.primaryPath && reforgedState.primaryPath.id === path.id);
    var $btn = $("<div>")
        .addClass("reforged-path-btn")
        .attr("data-path", path.key)
        .toggleClass("active", !!active)
        .toggleClass("disabled", !!disabled)
        .append($("<img>").attr("src", iconUrl).attr("alt", path.name))
        .append($("<span>").addClass("reforged-path-name").text(path.name));
    attachReforgedTooltip($btn, path.name,
        disabled ? "Already your primary path" : ("Set as " + side + " path"),
        null);
    $btn.on("click", function(){
        if (disabled) return;
        hideReforgedTooltip();
        handlePathPick(side, path);
    });
    return $btn;
}

function handlePathPick(side, path) {
    if (side === "primary") {
        if (reforgedState.primaryPath && reforgedState.primaryPath.id === path.id) return;
        reforgedState.primaryPath = path;
        reforgedState.primaryPicks = [null, null, null, null];
        // If secondary collides with new primary, clear secondary.
        if (reforgedState.secondaryPath && reforgedState.secondaryPath.id === path.id) {
            reforgedState.secondaryPath = null;
            reforgedState.secondaryPicks = [null, null, null, null];
        }
    } else {
        if (reforgedState.primaryPath && reforgedState.primaryPath.id === path.id) return;
        if (reforgedState.secondaryPath && reforgedState.secondaryPath.id === path.id) return;
        reforgedState.secondaryPath = path;
        reforgedState.secondaryPicks = [null, null, null, null];
    }
    renderReforgedPaths();
    updateReforgedShareLink();
}

function renderPrimarySlots() {
    var $slots = $("#reforged-primary-slots").empty();
    var path = reforgedState.primaryPath;
    if (!path) {
        $slots.append($("<div>").addClass("reforged-hint").text("Pick a primary path above."));
        return;
    }
    path.slots.forEach(function(slot, slotIdx){
        var $row = $("<div>").addClass("reforged-slot-row");
        if (slotIdx === 0) $row.addClass("reforged-keystone-row");
        slot.runes.forEach(function(rune){
            $row.append(buildRuneTile(rune, "primary", slotIdx, slotIdx === 0));
        });
        $slots.append($row);
    });
}

function renderSecondarySlots() {
    var $slots = $("#reforged-secondary-slots").empty();
    var path = reforgedState.secondaryPath;
    if (!path) {
        $slots.append($("<div>").addClass("reforged-hint").text("Pick a secondary path above (different from primary)."));
        return;
    }
    // Secondary skips slot 0 (no keystone). Slots 1/2/3 are pickable.
    path.slots.forEach(function(slot, slotIdx){
        if (slotIdx === 0) return; // no keystone on secondary
        var $row = $("<div>").addClass("reforged-slot-row");
        slot.runes.forEach(function(rune){
            $row.append(buildRuneTile(rune, "secondary", slotIdx, false));
        });
        $slots.append($row);
    });
}

function buildRuneTile(rune, side, slotIdx, isKeystone) {
    var iconUrl = reforgedIconUrl(rune.icon);
    var picks = (side === "primary") ? reforgedState.primaryPicks : reforgedState.secondaryPicks;
    var selected = (picks[slotIdx] === rune.id);

    // Secondary lockout rules:
    //   - At most 2 picks total in the secondary
    //   - No two picks in the same row
    //   - Row slotIdx is locked if a different rune in this same row is selected
    var rowLocked = false;
    if (side === "secondary") {
        var picksMade = picks.filter(function(p){ return p !== null; }).length;
        if (!selected && picksMade >= 2) rowLocked = true;
        // If a different rune in THIS row is already picked, this one is mutex-blocked.
        if (!selected && picks[slotIdx] != null) rowLocked = true;
    }

    var $tile = $("<div>")
        .addClass("reforged-rune")
        .toggleClass("reforged-rune-keystone", isKeystone)
        .toggleClass("selected", selected)
        .toggleClass("locked", rowLocked)
        .attr("data-rune-id", rune.id)
        .append($("<img>").attr("src", iconUrl).attr("alt", rune.name))
        .append($("<div>").addClass("reforged-rune-name").text(rune.name));
    attachReforgedTooltip($tile, rune.name,
        isKeystone ? "Keystone" : null,
        rune.longDesc || rune.shortDesc);
    $tile.on("click", function(){
        if (rowLocked) return;
        hideReforgedTooltip();
        handleRunePick(side, slotIdx, rune);
    });
    return $tile;
}

function handleRunePick(side, slotIdx, rune) {
    var picks = (side === "primary") ? reforgedState.primaryPicks : reforgedState.secondaryPicks;
    if (picks[slotIdx] === rune.id) {
        picks[slotIdx] = null;     // toggle off
    } else {
        picks[slotIdx] = rune.id;
    }
    if (side === "primary") renderPrimarySlots();
    else renderSecondarySlots();
    updateReforgedShareLink();
}

function renderReforgedShards(dataSet) {
    var $box = $("#reforged-shards").empty();
    var rows = getReforgedShardRows(dataSet);
    if (!rows) { $box.hide(); return; }
    $box.show();
    $box.append($("<div>").addClass("reforged-shards-label").text("Stat Shards"));
    rows.forEach(function(row, rowIdx){
        var $row = $("<div>").addClass("reforged-shard-row");
        row.shards.forEach(function(shard){
            var selected = reforgedState.shards[rowIdx] === shard.id;
            var $tile = $("<div>")
                .addClass("reforged-shard")
                .toggleClass("selected", selected)
                .append($("<img>").attr("src", REFORGED_SHARD_ICON_BASE + shard.icon).attr("alt", shard.name))
                .append($("<div>").addClass("reforged-shard-name").text(shard.name));
            attachReforgedTooltip($tile, shard.name, row.label + " shard", shard.desc);
            $tile.on("click", function(){
                hideReforgedTooltip();
                reforgedState.shards[rowIdx] = selected ? null : shard.id;
                renderReforgedShards(dataSet);
                updateReforgedShareLink();
            });
            $row.append($tile);
        });
        $box.append($row);
    });
}

// --- URL hash sharing ----------------------------------------------------
// Format: <dataset-id>|primaryPathId,k,m1,m2,m3|secondaryPathId,sm1,sm2|s1,s2,s3
function buildReforgedHash() {
    var ds = getReforgedDataSet(reforgedState.dataSetId);
    if (!ds) return "";
    var parts = [ds.id];
    if (reforgedState.primaryPath) {
        parts.push(reforgedState.primaryPath.id + "," + reforgedState.primaryPicks.map(function(p){return p||"";}).join(","));
    } else parts.push("");
    if (reforgedState.secondaryPath) {
        parts.push(reforgedState.secondaryPath.id + "," + reforgedState.secondaryPicks.map(function(p){return p||"";}).join(","));
    } else parts.push("");
    parts.push(reforgedState.shards.map(function(s){return s||"";}).join(","));
    return parts.join("|");
}

function parseReforgedHash(hash) {
    if (!hash) return null;
    var parts = hash.split("|");
    var dsId = parts[0];
    if (!getReforgedDataSet(dsId)) return null;
    return {
        dsId: dsId,
        primary: parts[1] || "",
        secondary: parts[2] || "",
        shards: parts[3] || "",
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

function applyReforgedHashAfterLoad(parsed) {
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
            var taken = 0;
            for (var s = 1; s < 4; s++) {
                var sId = sParts[s + 1] ? parseInt(sParts[s + 1], 10) : null;
                var ok = taken < 2 && runeInSlot(sPath, s, sId);
                reforgedState.secondaryPicks[s] = ok ? sId : null;
                if (ok) taken++;
            }
        }
    }
    if (parsed.shards) {
        var shParts = parsed.shards.split(",");
        reforgedState.shards = [
            shParts[0] ? shParts[0] : null,
            shParts[1] ? shParts[1] : null,
            shParts[2] ? shParts[2] : null,
        ];
    }
    renderReforgedPaths();
    renderReforgedShards(getReforgedDataSet(reforgedState.dataSetId));
}

function updateReforgedShareLink() {
    var hash = buildReforgedHash();
    var url = location.pathname + (hash ? "#" + hash : "");
    $("#reforged-export-link").attr("href", url);
    if (hash) history.replaceState(null, "", "#" + hash);
}

// Season dropdown + tabs come from the shared season-led nav (nav.js); the
// patch dropdown stays page-local and lists this season's snapshots.
function refreshReforgedSeasonNav(dataSet) {
    if (typeof buildSeasonNav !== "function") return;
    buildSeasonNav({
        page: "reforged",
        seasonSelect: "#reforged-season-select",
        currentKey: "s" + dataSet.season,
        onSeason: function(def){
            for (var i = 0; i < reforgedDataSets.length; i++) {
                if ("s" + reforgedDataSets[i].season === def.key) {
                    activateReforgedDataSet(reforgedDataSets[i].id);
                    return true;
                }
            }
            return false;
        }
    });
}

function buildReforgedSelectors() {
    var active = getReforgedDataSet(reforgedState.dataSetId) || getReforgedDataSet(REFORGED_DEFAULT_DATA_SET_ID);
    refreshReforgedSeasonNav(active);
    rebuildReforgedPatchSelect(active.season, active.id);
    $("#reforged-patch-select").on("change", function(){
        activateReforgedDataSet($(this).val());
    });
}

function rebuildReforgedPatchSelect(season, selectedId) {
    var $patch = $("#reforged-patch-select").empty();
    reforgedDataSets.forEach(function(ds){
        if (String(ds.season) !== String(season)) return;
        $patch.append($("<option>").attr("value", ds.id).text(ds.patchLabel));
    });
    if (selectedId) $patch.val(selectedId);
}

function copyToClipboardReforged(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    var $ta = $("<textarea>").val(text).css({position:"fixed",top:0,left:0,opacity:0}).appendTo("body");
    $ta[0].select();
    try { document.execCommand("copy"); $ta.remove(); return $.Deferred().resolve(); }
    catch (e) { $ta.remove(); return $.Deferred().reject(); }
}

$(function(){
    var parsed = parseReforgedHash(location.hash.slice(1));
    reforgedState.dataSetId = (parsed && parsed.dsId) || REFORGED_DEFAULT_DATA_SET_ID;
    buildReforgedSelectors();
    activateReforgedDataSet(reforgedState.dataSetId);

    // Apply hash state after the catalog has loaded.
    if (parsed) {
        var poll = setInterval(function(){
            if (reforgedState.catalog) {
                clearInterval(poll);
                applyReforgedHashAfterLoad(parsed);
            }
        }, 80);
    }

    $("#reforged-share").click(function(){
        var url = new URL($("#reforged-export-link").attr("href") || (location.pathname + location.hash), location.href).toString();
        copyToClipboardReforged(url).then(function(){ reforgedToast("URL copied"); }, function(){ reforgedToast("Copy failed"); });
    });
});
