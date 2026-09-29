// Keystone mastery system calculator (Ferocity / Cunning / Resolve,
// V5.22 – V7.21). Runs when the active masteryDataSet has
// `system: "keystone"`. The dataset stores the tree definition in its
// `data` field (an object with `trees`), not the array shape used by the
// classic 30-point system.
//
// Rules implemented (matching the 2016-2017 client):
//   - 18 max points.
//   - Per tree, 5 minor tiers + 1 keystone tier (tier 6, rendered at the
//     BOTTOM of the column like the in-game layout).
//   - Tier 1 always unlocked; tier N unlocks once tier N-1 is FILLED
//     (5 points in a 5-rank row, 1 point in a 1-rank row).
//   - 5-rank rows hold two masteries sharing one 5-point pool — points MAY
//     be split between them (e.g. 3 Fury + 2 Sorcery), exactly like the
//     real client.
//   - 1-rank rows act as a radio group: clicking a different option moves
//     the point.
//   - At most ONE keystone is active across all three trees.
//
// Icons come from Riot Data Dragon's mastery.json for the dataset's
// `ddragonVersion` (masteries shipped in DDragon through 7.23.1), matched
// by normalized name with an optional per-mastery `iconId` override for
// entries whose DDragon name is corrupted (e.g. Sorcery in 5.22.3).

var keystoneActiveDataSetId = null;
var keystoneActiveDataSet = null;
// keystoneState[treeId] = {
//     tiers: { <tierNumber>: { <masteryId>: ranks, ... } },  // minor tiers
//     keystone: masteryId | null
// }
// plus keystoneState.__activeKeystone = { treeId, masteryId } | null.
var keystoneState = {};

function isKeystoneSystem(dataSet) {
    return !!(dataSet && dataSet.system === "keystone");
}

function initKeystoneState(dataSet) {
    keystoneState = { __activeKeystone: null };
    dataSet.data.trees.forEach(function(tree){
        var s = { tiers: {}, keystone: null };
        tree.tiers.forEach(function(t){
            if (!t.isKeystone) s.tiers[t.tier] = {};
        });
        keystoneState[tree.id] = s;
    });
}

// ---------- Lookups ---------------------------------------------------------

function keystoneTreeDef(treeId) {
    var trees = keystoneActiveDataSet.data.trees;
    for (var i = 0; i < trees.length; i++)
        if (trees[i].id === treeId) return trees[i];
    return null;
}

function keystoneTierDef(treeDef, tierNumber) {
    for (var i = 0; i < treeDef.tiers.length; i++)
        if (treeDef.tiers[i].tier === tierNumber) return treeDef.tiers[i];
    return null;
}

// Shared point pool of a minor tier (5 for rank-5 rows, 1 for rank-1 rows).
function keystoneTierPool(tierDef) {
    var pool = 1;
    tierDef.masteries.forEach(function(m){ pool = Math.max(pool, m.ranks || 1); });
    return pool;
}

function keystoneTierTotal(treeId, tierNumber) {
    var tier = keystoneState[treeId].tiers[tierNumber];
    var total = 0;
    for (var id in tier) total += tier[id];
    return total;
}

function keystoneTreePoints(treeId) {
    var s = keystoneState[treeId];
    var total = s.keystone ? 1 : 0;
    for (var t in s.tiers) total += keystoneTierTotal(treeId, +t);
    return total;
}

function getKeystoneTotalPoints() {
    var total = 0;
    keystoneActiveDataSet.data.trees.forEach(function(tree){
        total += keystoneTreePoints(tree.id);
    });
    return total;
}

// Tier N unlocks when tier N-1 is FILLED (its full pool spent).
function isKeystoneTierUnlocked(treeId, tierNumber) {
    if (tierNumber === 1) return true;
    var treeDef = keystoneTreeDef(treeId);
    var prevDef = keystoneTierDef(treeDef, tierNumber - 1);
    if (!prevDef || prevDef.isKeystone) return false;
    return keystoneTierTotal(treeId, tierNumber - 1) >= keystoneTierPool(prevDef);
}

// ---------- Icons ------------------------------------------------------------
// Icons are bundled in the repo under images/masteries/<ddragonVersion>/
// (downloaded from Data Dragon once; see embed-mastery-icon-ids.js). Each
// mastery carries its DDragon `iconId`, so no runtime fetch is needed.

function keystoneIconUrl(mastery) {
    if (!mastery.iconId || !keystoneActiveDataSet || !keystoneActiveDataSet.ddragonVersion)
        return null;
    return "images/masteries/" + keystoneActiveDataSet.ddragonVersion + "/" + mastery.iconId + ".png";
}

// ---------- Tooltip (original client style) ----------------------------------

function keystoneTooltipEl() {
    var $tip = $("#keystone-tooltip");
    if (!$tip.length) {
        $tip = $("<div>").attr("id", "keystone-tooltip").addClass("lol-tooltip")
            .append($("<div>").addClass("lol-tooltip-title"))
            .append($("<div>").addClass("lol-tooltip-sub"))
            .append($("<div>").addClass("lol-tooltip-req"))
            .append($("<div>").addClass("lol-tooltip-body"))
            .appendTo("body");
    }
    return $tip;
}

function positionLolTooltip($tip, e) {
    var w = $tip.outerWidth(), h = $tip.outerHeight();
    var x = e.clientX + 18, y = e.clientY + 18;
    if (x + w > window.innerWidth - 8)  x = e.clientX - w - 12;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 12;
    $tip.css({ left: Math.max(4, x) + "px", top: Math.max(4, y) + "px" });
}

// Cumulative in-tree points needed before this tier opens (5/6/11/12/17).
function keystoneTierThreshold(treeDef, tierNumber) {
    var needed = 0;
    for (var i = 0; i < treeDef.tiers.length; i++) {
        var t = treeDef.tiers[i];
        if (t.isKeystone || t.tier >= tierNumber) continue;
        needed += keystoneTierPool(t);
    }
    return needed;
}

function showKeystoneTooltip(e, tree, tierDef, mastery, ranks) {
    var $tip = keystoneTooltipEl();
    $tip.find(".lol-tooltip-title").text(mastery.name).css("color", tree.color || "");
    var sub = tierDef.isKeystone
        ? "Keystone — only one active across all trees"
        : "Rank: " + ranks + " / " + (mastery.ranks || 1);
    $tip.find(".lol-tooltip-sub").text(sub);
    var $req = $tip.find(".lol-tooltip-req");
    if (!isKeystoneTierUnlocked(tree.id, tierDef.tier)) {
        $req.text("Requires " + keystoneTierThreshold(tree, tierDef.tier)
            + " points in " + tree.name).show();
    } else {
        $req.hide();
    }
    $tip.find(".lol-tooltip-body").text(mastery.desc);
    $tip.show();
    positionLolTooltip($tip, e);
}

function hideKeystoneTooltip() {
    $("#keystone-tooltip").hide();
}

// ---------- Rendering --------------------------------------------------------

// Public entry point — calculator.js calls this when switching to a
// keystone-system dataset. `dataSet` is optional; when provided, switch to
// it before rendering.
function drawKeystoneCalculator(dataSet) {
    if (dataSet && keystoneActiveDataSetId !== dataSet.id) {
        keystoneActiveDataSetId = dataSet.id;
        keystoneActiveDataSet = dataSet;
        initKeystoneState(dataSet);
    }
    var $area = $("#keystone-calculator").empty();
    if (!keystoneActiveDataSet) return;
    keystoneActiveDataSet.data.trees.forEach(function(tree){
        var $col = $("<div>").addClass("keystone-tree").attr("data-tree", tree.id);
        $col.append(
            $("<div>").addClass("keystone-tree-title")
                .append($("<span>").text(tree.name))
                .append($("<span>").addClass("keystone-tree-points")
                    .text(keystoneTreePoints(tree.id))));
        // Tiers render in tier order; the keystone tier (6) lands at the
        // bottom, matching the in-game layout.
        tree.tiers.forEach(function(tierDef){
            var $tier = $("<div>").addClass("keystone-tier");
            if (tierDef.isKeystone) $tier.addClass("keystone-tier-keystone");
            else $tier.attr("data-tier", tierDef.tier);
            tierDef.masteries.forEach(function(m){
                $tier.append(buildKeystonePick(tree, tierDef, m));
            });
            $col.append($tier);
        });
        $area.append($col);
    });
    updateKeystonePointsLabel();
}

function buildKeystonePick(tree, tierDef, mastery) {
    var s = keystoneState[tree.id];
    var ranks, selected;
    if (tierDef.isKeystone) {
        ranks = (s.keystone === mastery.id) ? 1 : 0;
        selected = ranks > 0;
    } else {
        ranks = s.tiers[tierDef.tier][mastery.id] || 0;
        selected = ranks > 0;
    }
    var tierLocked = !isKeystoneTierUnlocked(tree.id, tierDef.tier);
    // A 5-point row whose pool is exhausted dims its untouched option.
    var capped = !tierDef.isKeystone && !selected
        && keystoneTierTotal(tree.id, tierDef.tier) >= keystoneTierPool(tierDef)
        && keystoneTierPool(tierDef) > 1;
    var budgetSpent = getKeystoneTotalPoints() >= keystoneActiveDataSet.maxPoints;

    // Original calculator state semantics: gold when maxed, green when a
    // point can go in, gray otherwise.
    var maxRanks = mastery.ranks || 1;
    var status;
    if (ranks >= maxRanks) status = "full";
    else if (!tierLocked && !capped && !(budgetSpent && ranks === 0)) status = "available";
    else status = "unavailable";

    var $pick = $("<div>")
        .addClass("keystone-pick")
        .addClass(status)
        .attr("data-tree", tree.id)
        .attr("data-tier", tierDef.tier)
        .attr("data-mastery", mastery.id)
        .toggleClass("selected", selected)
        .toggleClass("locked", tierLocked && !selected)
        .toggleClass("capped", capped && !tierLocked);

    $pick.on("mouseenter mousemove", function(e){
        showKeystoneTooltip(e, tree, tierDef, mastery,
            tierDef.isKeystone ? (selected ? 1 : 0) : ranks);
    });
    $pick.on("mouseleave", hideKeystoneTooltip);

    var iconUrl = keystoneIconUrl(mastery);
    if (iconUrl) {
        $pick.addClass("has-icon").append($("<img>").addClass("keystone-pick-icon")
            .attr("src", iconUrl).attr("alt", mastery.name));
    }
    $pick.append($("<div>").addClass("keystone-pick-name").text(mastery.name));
    if (!tierDef.isKeystone) {
        $pick.append($("<div>")
            .addClass("counter")
            .addClass("num-" + status)
            .text(ranks + "/" + maxRanks));
    }

    $pick.on("click", function(){ handleKeystonePickClick(tree.id, tierDef, mastery); });
    $pick.on("contextmenu", function(e){
        e.preventDefault();
        handleKeystonePickRightClick(tree.id, tierDef, mastery);
    });
    return $pick;
}

// ---------- Interaction ------------------------------------------------------

function handleKeystonePickClick(treeId, tierDef, mastery) {
    var s = keystoneState[treeId];
    if (!isKeystoneTierUnlocked(treeId, tierDef.tier)) return;

    if (tierDef.isKeystone) {
        if (s.keystone === mastery.id) {
            // Re-click deselects.
            s.keystone = null;
            keystoneState.__activeKeystone = null;
        } else {
            // Selecting a keystone clears any other active keystone
            // (across all trees) — only one may be active.
            if (keystoneState.__activeKeystone) {
                keystoneState[keystoneState.__activeKeystone.treeId].keystone = null;
            }
            if (getKeystoneTotalPoints() >= keystoneActiveDataSet.maxPoints && !keystoneState.__activeKeystone) {
                // No spare point and nothing was refunded by the swap.
                keystoneRefreshAll();
                return;
            }
            s.keystone = mastery.id;
            keystoneState.__activeKeystone = { treeId: treeId, masteryId: mastery.id };
        }
    } else {
        var tier = s.tiers[tierDef.tier];
        var cur = tier[mastery.id] || 0;
        var pool = keystoneTierPool(tierDef);
        var total = keystoneTierTotal(treeId, tierDef.tier);

        if (pool === 1) {
            // Radio row: clicking a different option moves the point.
            if (cur === 1) { keystoneRefreshAll(); return; }
            if (total === 0 && getKeystoneTotalPoints() >= keystoneActiveDataSet.maxPoints) return;
            s.tiers[tierDef.tier] = {};
            s.tiers[tierDef.tier][mastery.id] = 1;
        } else {
            // Shared 5-point pool; splitting between the two options is allowed.
            if (total >= pool) return;
            if (cur >= (mastery.ranks || 1)) return;
            if (getKeystoneTotalPoints() >= keystoneActiveDataSet.maxPoints) return;
            tier[mastery.id] = cur + 1;
        }
    }
    keystoneRefreshAll();
}

function handleKeystonePickRightClick(treeId, tierDef, mastery) {
    var s = keystoneState[treeId];
    if (tierDef.isKeystone) {
        if (s.keystone === mastery.id) {
            s.keystone = null;
            keystoneState.__activeKeystone = null;
        }
    } else {
        var tier = s.tiers[tierDef.tier];
        var cur = tier[mastery.id] || 0;
        if (cur > 0) {
            if (cur === 1) delete tier[mastery.id];
            else tier[mastery.id] = cur - 1;
            // Dropping below a full row breaks the unlock chain above it.
            cascadeKeystoneRelock(treeId, tierDef.tier);
        }
    }
    keystoneRefreshAll();
}

// If tier N is no longer filled, every tier above it (and the keystone)
// loses its unlock and gets refunded.
function cascadeKeystoneRelock(treeId, fromTier) {
    var s = keystoneState[treeId];
    for (var t = fromTier + 1; t <= 5; t++) {
        if (!isKeystoneTierUnlocked(treeId, t)) s.tiers[t] = {};
    }
    if (!isKeystoneTierUnlocked(treeId, 6) && s.keystone) {
        if (keystoneState.__activeKeystone &&
            keystoneState.__activeKeystone.treeId === treeId) {
            keystoneState.__activeKeystone = null;
        }
        s.keystone = null;
    }
}

function keystoneRefreshAll() {
    // A redraw replaces the hovered element, so mouseleave never fires —
    // hide explicitly; the next mousemove re-shows it with fresh state.
    hideKeystoneTooltip();
    drawKeystoneCalculator();
    updateKeystoneLink();
}

function updateKeystonePointsLabel() {
    var total = getKeystoneTotalPoints();
    var max = keystoneActiveDataSet.maxPoints;
    $("#points>.count").text(max - total);
}

// ---------- Share hash -------------------------------------------------------
// Code format (one segment per tree, ";"-separated; tiers ","-separated):
//   minor tier — "<masteryIdx><ranks>" pairs joined by "+", e.g. "05" is
//                5 points in option 0, "03+12" is a 3/2 split
//   keystone   — "k<masteryIdx>"
// Empty tiers serialize as "". A build with nothing spent has no code.

function exportKeystones() {
    if (!keystoneActiveDataSet) return "";
    var code = keystoneActiveDataSet.data.trees.map(function(tree){
        var s = keystoneState[tree.id];
        return tree.tiers.map(function(tierDef){
            if (tierDef.isKeystone) {
                if (!s.keystone) return "";
                for (var i = 0; i < tierDef.masteries.length; i++)
                    if (tierDef.masteries[i].id === s.keystone) return "k" + i;
                return "";
            }
            var pairs = [];
            tierDef.masteries.forEach(function(m, idx){
                var r = s.tiers[tierDef.tier][m.id] || 0;
                if (r > 0) pairs.push(String(idx) + String(r));
            });
            return pairs.join("+");
        }).join(",");
    }).join(";");
    return /[^;,]/.test(code) ? code : "";
}

function importKeystones(code) {
    if (!keystoneActiveDataSet) return;
    initKeystoneState(keystoneActiveDataSet);
    if (code) {
        var treeParts = code.split(";");
        keystoneActiveDataSet.data.trees.forEach(function(tree, treeIdx){
            var tierParts = (treeParts[treeIdx] || "").split(",");
            tree.tiers.forEach(function(tierDef, tierIdx){
                var part = tierParts[tierIdx];
                if (!part) return;
                if (!isKeystoneTierUnlocked(tree.id, tierDef.tier)) return;
                if (tierDef.isKeystone) {
                    if (part.charAt(0) !== "k" || keystoneState.__activeKeystone) return;
                    var kIdx = parseInt(part.slice(1), 10);
                    var km = tierDef.masteries[kIdx];
                    if (!km) return;
                    if (getKeystoneTotalPoints() >= keystoneActiveDataSet.maxPoints) return;
                    keystoneState[tree.id].keystone = km.id;
                    keystoneState.__activeKeystone = { treeId: tree.id, masteryId: km.id };
                    return;
                }
                var pool = keystoneTierPool(tierDef);
                part.split("+").forEach(function(pair){
                    if (!/^\d\d$/.test(pair)) return;
                    var mIdx = +pair.charAt(0);
                    var r = +pair.charAt(1);
                    var m = tierDef.masteries[mIdx];
                    if (!m) return;
                    r = Math.min(r, m.ranks || 1);
                    var room = pool - keystoneTierTotal(tree.id, tierDef.tier);
                    var budget = keystoneActiveDataSet.maxPoints - getKeystoneTotalPoints();
                    r = Math.min(r, room, budget);
                    if (r > 0) keystoneState[tree.id].tiers[tierDef.tier][m.id] = r;
                });
            });
        });
    }
    drawKeystoneCalculator();
}

function updateKeystoneLink() {
    var code = exportKeystones();
    var hash = "#" + keystoneActiveDataSetId + "|" + code;
    $("#exportLink").attr("href", document.location.pathname + hash);
    if (document.location.hash !== hash) {
        document.location.replace(hash);
        // Same unbind/rebind dance as the classic updateLink() so our own
        // replace() doesn't re-trigger an import.
        $(window).unbind("hashchange");
        setTimeout(function(){ $(window).bind("hashchange", updateMasteries); }, 500);
    }
}

function resetKeystones() {
    if (!keystoneActiveDataSet) return;
    initKeystoneState(keystoneActiveDataSet);
    drawKeystoneCalculator();
    updateKeystoneLink();
}
