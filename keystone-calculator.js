// Keystone mastery system calculator (Ferocity / Cunning / Resolve,
// V5.22 – V7.21). Runs when the active masteryDataSet has
// `system: "keystone"`. The dataset stores the tree definition in its
// `data` field (an object with `trees`), not the array shape used by the
// classic 30-point system.
//
// Rules implemented (matching the 2016-2017 client):
//   - The dataset's maxPoints per page (30); a tree holds at most 18.
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
//   - Click model per client: AIR +1 / -1 per click (the AIR help box), the
//     LCU fills / empties a mastery per click (see "LCU click model").
//
// Two skins (see "Skins" below): the AIR client (V5.22, V6.22) inside the
// shared AIR sheet + sidebar, and the League Client mastery panel (V7.21).
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

// ---------- Skins -------------------------------------------------------------
// Two client screens, picked by the client era of the dataset (nav.js
// clientEraFor → body[data-client]):
//   air  V5.22 / V6.22 — the Adobe AIR client's Masteries tab: the shared AIR
//        sheet + sidebar (air-sheet.css / air-sheet.js), a 827x479 native px
//        tree panel (css/masteries-keystone.css §AIR). Every mastery is
//        absolutely placed on the capture grid (KS_AIR below; native px,
//        CSS multiplies by --u).
//   lcu  V7.21 — the League Client rcp-fe-lol-mastery-panel (7.21 CSS 1:1):
//        info bar, three 322px trees with header / glow / square + ring
//        frames (css/masteries-keystone.css §LCU).
// The DOM is built once per dataset + skin (buildKeystoneView) and updated
// in place on every change (updateKeystoneView), so hover states, the open
// tooltip and LCU transitions survive clicks.

// AIR panel grid, measured on refs/keystone/Masteries2016.png (1:1) and
// nerf_tankmasteries.png (V6.22): columns every 275 px, rows every 71 px
// from y=21. 5-rank icons are 49x49 boxes, 1-rank / keystone icons 56x56.
// 1-rank rows: 3 options at x 44/111/178, 2 options at 78/145. 5-rank rows
// sit at the column edges (44/178) in V5.22 - V6.x and on the centred pair
// (78/145) from V6.22 (dataset airFiveRankLayout).
var KS_AIR = {
    colX: 275, rowY: 21, rowPitch: 71,
    pos3: [44, 111, 178], pos2: [78, 145], edge5: [44, 178],
    labelX: [28, 25, 22]
};
// Tooltip title colours per tree (AIR: sampled from the 2015/16 captures;
// LCU titles are #f0e6d2 for every tree).
var KS_TREE_TITLE = { ferocity: "#c83c32", cunning: "#a060c0", resolve: "#6a6ad2" };

var keystoneView = null;   // { skin, dsId, root, picks: [...], trees: {...}, info }
var keystoneHover = null;  // { pick, evt } while the pointer is on a mastery

function keystoneSkin() {
    if (!keystoneActiveDataSet) return "air";
    return typeof clientEraFor === "function" ? clientEraFor(keystoneActiveDataSet.id) : "air";
}

// ---------- Icons ------------------------------------------------------------
// Icons are bundled under images/masteries/<ddragonVersion>/ (from Data
// Dragon; see embed-mastery-icon-ids.js). gray_<id>.png is DDragon's pre-baked
// greyscale (Rec.601 luma) that the AIR client showed for unranked masteries.

// `airIconVersion` (optional, per mastery): the icon art the AIR client
// actually drew when it differs from the dataset's DDragon version — the
// V6.22 AIR client kept the 5.22.3 art for Fresh Blood and Double-Edged
// Sword (nerf_tankmasteries.png); the LCU skin keeps the DDragon art.
function keystoneIconUrl(mastery, gray, skin) {
    if (!mastery.iconId || !keystoneActiveDataSet || !keystoneActiveDataSet.ddragonVersion)
        return null;
    var ver = (skin === "air" && mastery.airIconVersion) || keystoneActiveDataSet.ddragonVersion;
    return "images/masteries/" + ver + "/" + (gray ? "gray_" : "") + mastery.iconId + ".png";
}

// ---------- Tooltip (LolTooltip: air-mastery / lcu skins) --------------------

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

// The description at a given rank: every "a/b/c/d/e" list with one entry
// per rank collapses to that rank's value ("+0.8/1.6/2.4/3.2/4% Attack
// Speed" at rank 3 → "+2.4% Attack Speed").
function keystoneDescAt(mastery, rank) {
    var ranks = mastery.ranks || 1;
    var desc = String(mastery.desc || "");
    if (ranks < 2) return desc;
    var r = Math.min(Math.max(rank, 1), ranks) - 1;
    return desc.replace(/-?\d+(?:\.\d+)?(?:\/-?\d+(?:\.\d+)?)+/g, function(list){
        var parts = list.split("/");
        return parts.length === ranks ? parts[r] : list;
    });
}

function keystoneTipHtml(pick, skin) {
    var esc = typeof lolEscapeHtml === "function" ? lolEscapeHtml : function(s){ return String(s); };
    var tree = pick.tree, tierDef = pick.tierDef, mastery = pick.mastery;
    var ranks = keystoneMasteryRanks(pick), max = mastery.ranks || 1;
    var locked = !isKeystoneTierUnlocked(tree.id, tierDef.tier);
    var req = locked ? "Requires " + keystoneTierThreshold(tree, tierDef.tier) + " points in " + tree.name : "";
    var showNext = ranks > 0 && ranks < max;
    if (skin === "lcu") {
        // mastery-panel-mastery-tooltip template + en_US strings of the 7.21
        // client (rcp-fe-lol-l10n trans.json): "Requires {{ranks}} points in
        // {{type}}", "Next Point:", mastery_click_instructions_label.
        var x = ksLcuCtx(pick);
        var html = '<div class="ks-tt">'
            + '<header class="ks-tt-head"><span>' + esc(mastery.name) + '</span>'
            + '<span class="ks-tt-points">' + ranks + '/' + max + '</span></header>';
        if (locked) {
            var need = keystoneTierThreshold(tree, tierDef.tier);
            html += '<div class="ks-tt-req">Requires ' + need + ' point' + (need === 1 ? '' : 's')
                + ' in <span class="mastery-type">' + esc(tree.name) + '</span></div>';
        }
        html += '<p class="ks-tt-desc">' + esc(keystoneDescAt(mastery, ranks || 1)) + '</p>';
        if (showNext)
            html += '<p class="ks-tt-desc ks-tt-next"><span class="prefix">Next Point:</span> '
                + esc(keystoneDescAt(mastery, ranks + 1)) + '</p>';
        // showMasteryClickInstructions / masteryClickInstructionsText. The
        // client's count, min(ranks - assigned, page left + row points),
        // overstates a click on a full page whose row the mastery already
        // holds alone (click does nothing there); use what a click adds.
        var n = ksLcuWouldAdd(pick) ? ksLcuClickTarget(x) - ranks : 0;
        if (n > 0 && !locked) {
            html += '<hr /><p class="ks-tt-click">' + (n === 1
                ? '<span class="click-instruction">Click to add one point.</span>'
                : '<span class="click-instruction">Click to add ' + n + ' points.</span>'
                  + '<span class="click-instruction">Shift-click to add one point.</span>') + '</p>';
        }
        return html + '</div>';
    }
    var out = '<div class="tt-title" style="--tt-title-color:' + (KS_TREE_TITLE[tree.id] || "#fff") + '">'
        + esc(mastery.name) + '</div>'
        + '<div class="tt-rank">Rank: ' + ranks + '/' + max + '</div>';
    if (req) out += '<div class="tt-req">' + esc(req) + '</div>';
    out += '<div class="tt-body">' + esc(keystoneDescAt(mastery, ranks || 1)) + '</div>';
    if (showNext)
        out += '<div class="tt-next"><div>Next Rank:</div>' + esc(keystoneDescAt(mastery, ranks + 1)) + '</div>';
    return out;
}

function showKeystoneTooltip(pick, evt) {
    if (!window.LolTooltip || !pick) return;
    var skin = keystoneView ? keystoneView.skin : keystoneSkin();
    if (skin === "lcu") {
        LolTooltip.show(pick.icon, keystoneTipHtml(pick, "lcu"), "lcu",
            { position: "top", width: 280, className: "ks-tt-lcu" });
    } else {
        // The 2015/16 client tooltip is a fixed ~290 native px wide box
        // (E9Sw2am5I2I_sd2 / qhylFA4fvQo_sd1, even for one-line content),
        // scaled like the sheet: k = on-screen px per native px (--u times
        // the stage scale), measured off the 827 native px panel.
        var k = keystoneAirScale();
        var e = evt && (evt.originalEvent || evt);
        LolTooltip.show(e && typeof e.clientX === "number" ? e : pick.el,
            '<div class="ks-tt-air-in" style="--ks-u:' + k.toFixed(4) + 'px">'
                + keystoneTipHtml(pick, "air") + '</div>',
            "air-mastery", { className: "ks-tt-air", width: Math.round(290 * k) });
    }
}

function keystoneAirScale() {
    var root = keystoneView && keystoneView.root;
    var w = root ? root.getBoundingClientRect().width : 0;
    return w > 0 ? w / 827 : 1.1;
}

function hideKeystoneTooltip() {
    keystoneHover = null;
    if (window.LolTooltip) LolTooltip.hide();
}

// ---------- State per mastery -------------------------------------------------

function keystoneMasteryRanks(pick) {
    var s = keystoneState[pick.tree.id];
    if (pick.tierDef.isKeystone) return s.keystone === pick.mastery.id ? 1 : 0;
    return s.tiers[pick.tierDef.tier][pick.mastery.id] || 0;
}

function keystoneTierTotal0(pick) {
    var s = keystoneState[pick.tree.id];
    if (pick.tierDef.isKeystone) return s.keystone ? 1 : 0;
    return keystoneTierTotal(pick.tree.id, pick.tierDef.tier);
}

// Would a left-click add a point (the click rules of handleKeystonePickClick)?
function keystoneCanAdd(pick) {
    var ranks = keystoneMasteryRanks(pick), max = pick.mastery.ranks || 1;
    if (ranks >= max || !isKeystoneTierUnlocked(pick.tree.id, pick.tierDef.tier)) return false;
    var budget = keystoneActiveDataSet.maxPoints - getKeystoneTotalPoints();
    if (pick.tierDef.isKeystone) return budget > 0 || !!keystoneState.__activeKeystone;
    var pool = keystoneTierPool(pick.tierDef), total = keystoneTierTotal0(pick);
    if (pool === 1) return total > 0 || budget > 0;         // radio row: moves the point
    return total < pool && budget > 0;
}

// AIR frame / counter state: ranked (yellow), available (blue: the tier is
// open and either points remain or the row already holds some — the sibling
// of a 5/5 stays blue), locked (grey).
function keystoneAirState(pick) {
    if (keystoneMasteryRanks(pick) > 0) return "ranked";
    if (!isKeystoneTierUnlocked(pick.tree.id, pick.tierDef.tier)) return "locked";
    var budget = keystoneActiveDataSet.maxPoints - getKeystoneTotalPoints();
    return (budget > 0 || keystoneTierTotal0(pick) > 0) ? "available" : "locked";
}

// ---------- Rendering --------------------------------------------------------

// Public entry point — calculator.js calls this when switching to a
// keystone-system dataset. `dataSet` is optional; when provided, switch to
// it before rendering.
function drawKeystoneCalculator(dataSet) {
    if (dataSet && keystoneActiveDataSetId !== dataSet.id) {
        keystoneActiveDataSetId = dataSet.id;
        keystoneActiveDataSet = dataSet;
        if (typeof setClientEra === "function") setClientEra(clientEraFor(dataSet.id));
        initKeystoneState(dataSet);
    }
    if (!keystoneActiveDataSet) { $("#keystone-calculator").empty(); keystoneView = null; return; }
    var skin = keystoneSkin();
    if (!keystoneView || keystoneView.dsId !== keystoneActiveDataSet.id || keystoneView.skin !== skin
            || !document.body.contains(keystoneView.root))
        buildKeystoneView(skin);
    updateKeystoneView();
    updateKeystonePointsLabel();
}

function ksEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function buildKeystoneView(skin) {
    hideKeystoneTooltip();
    var root = document.getElementById("keystone-calculator");
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    var ds = keystoneActiveDataSet;
    root.setAttribute("data-skin", skin);
    root.setAttribute("data-dataset", ds.id);
    var view = { skin: skin, dsId: ds.id, root: root, picks: [], trees: {}, info: null };

    if (skin === "lcu") view.info = buildKeystoneInfoBar(root);

    var trees = ksEl("div", "ks-trees");
    var five = ds.data.airFiveRankLayout === "pair" ? KS_AIR.pos2 : KS_AIR.edge5;
    ds.data.trees.forEach(function(tree, ti){
        var col = ksEl("div", "ks-tree ks-tree-" + tree.id);
        col.setAttribute("data-tree", tree.id);
        var t = { el: col, points: null, name: null, reset: null, label: null };
        if (skin === "lcu") {
            var head = ksEl("header", "ks-tree-header");
            t.points = ksEl("div", "ks-tree-points", "0");
            t.name = ksEl("div", "ks-tree-name", tree.name);
            t.reset = ksEl("a", "ks-tree-reset");
            t.reset.setAttribute("role", "button");
            t.reset.setAttribute("tabindex", "0");
            t.reset.setAttribute("aria-label", "Reset " + tree.name + " points");
            t.reset.setAttribute("data-lol-tip", "Reset points in this tree");
            t.reset.addEventListener("click", function(){
                if (!t.reset.classList.contains("disabled")) resetKeystoneTree(tree.id);
            });
            head.appendChild(t.points); head.appendChild(t.name); head.appendChild(t.reset);
            col.appendChild(head);
        } else {
            col.style.setProperty("--col", ti);
        }
        tree.tiers.forEach(function(tierDef, rowIdx){
            var pool = tierDef.isKeystone ? 1 : keystoneTierPool(tierDef);
            var level = ksEl("div", "ks-level " + (pool > 1 ? "ks-level-5" : "ks-level-1")
                + (pool > 1 ? "" : " is-keystone") + " level-" + rowIdx);
            level.setAttribute("data-tier", tierDef.tier);
            var n = tierDef.masteries.length;
            var xs = pool > 1 ? five : (n >= 3 ? KS_AIR.pos3 : KS_AIR.pos2);
            // Display order: the optional per-mastery `slot` (client position
            // when it differs from the data / share-hash order).
            var order = tierDef.masteries.map(function(m, mi){ return { m: m, pos: m.slot != null ? m.slot : mi }; })
                .sort(function(a, b){ return a.pos - b.pos; });
            order.forEach(function(o){
                var mastery = o.m, mi = o.pos;
                var pick = buildKeystonePick(tree, tierDef, mastery, pool, skin);
                pick.pos = mi;
                if (skin === "air") {
                    pick.el.style.setProperty("--x", xs[Math.min(mi, xs.length - 1)]);
                    pick.el.style.setProperty("--y", KS_AIR.rowY + KS_AIR.rowPitch * rowIdx);
                }
                pick.level = level;
                level.appendChild(pick.el);
                view.picks.push(pick);
            });
            col.appendChild(level);
        });
        if (skin === "air") {
            t.label = ksEl("div", "ks-tree-label");
            t.label.style.setProperty("--lx", KS_AIR.labelX[ti] != null ? KS_AIR.labelX[ti] : 24);
            col.appendChild(t.label);
        }
        view.trees[tree.id] = t;
        trees.appendChild(col);
    });
    root.appendChild(trees);
    keystoneView = view;
}

function buildKeystonePick(tree, tierDef, mastery, pool, skin) {
    var el = ksEl("div", "ks-mastery ks-" + tree.id + (pool > 1 ? " is-five" : " is-one"));
    el.setAttribute("data-tree", tree.id);
    el.setAttribute("data-tier", tierDef.tier);
    el.setAttribute("data-mastery", mastery.id);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", mastery.name);
    var icon = ksEl("div", "ks-icon");
    var img = document.createElement("img");
    img.className = "ks-img";
    img.alt = "";
    img.draggable = false;
    icon.appendChild(img);
    icon.appendChild(ksEl("span", "ks-fallback", mastery.name));
    el.appendChild(icon);
    el.appendChild(ksEl("div", "ks-mask"));
    var value = null;
    if (pool > 1) { value = ksEl("div", "ks-value", "0/" + (mastery.ranks || 1)); el.appendChild(value); }
    var pick = { el: el, icon: icon, img: img, value: value, tree: tree, tierDef: tierDef, mastery: mastery, src: null };
    el.addEventListener("mouseenter", function(e){ keystoneHover = { pick: pick, evt: e }; showKeystoneTooltip(pick, e); });
    el.addEventListener("mousemove", function(e){
        if (keystoneHover && keystoneHover.pick === pick) keystoneHover.evt = e;
        if (window.LolTooltip && (!keystoneView || keystoneView.skin !== "lcu")) LolTooltip.move(e);
    });
    el.addEventListener("mouseleave", hideKeystoneTooltip);
    // Two click models: AIR = +1 / -1 per click (the AIR help box), LCU =
    // the 7.21 mastery-icon component (see "LCU click model" below).
    function lcu() { return !!keystoneView && keystoneView.skin === "lcu"; }
    el.addEventListener("click", function(e){
        if (!lcu()) { handleKeystonePickClick(tree.id, tierDef, mastery); return; }
        if (e.shiftKey) ksLcuAddOne(pick); else ksLcuAddMax(pick);
        keystoneRefreshAll();
    });
    el.addEventListener("contextmenu", function(e){
        e.preventDefault();
        if (!lcu()) { handleKeystonePickRightClick(tree.id, tierDef, mastery); return; }
        if (e.shiftKey) ksLcuRemove(pick, false); else ksLcuRemove(pick, true);
        keystoneRefreshAll();
    });
    // Mouse wheel (the AIR help box: "...or using the mouse wheel"; LCU
    // _mouseWheelHandler: up on an empty row fills it, else +1; down -1).
    el.addEventListener("wheel", function(e){
        if (!e.deltaY) return;
        e.preventDefault();
        if (lcu()) {
            if (e.deltaY < 0) {
                var x = ksLcuCtx(pick);
                if (x.L === 0) ksLcuAddMax(pick); else ksLcuAddOne(pick);
            } else ksLcuRemove(pick, false);
            keystoneRefreshAll();
            return;
        }
        if (e.deltaY < 0) handleKeystonePickClick(tree.id, tierDef, mastery);
        else handleKeystonePickRightClick(tree.id, tierDef, mastery);
    }, { passive: false });
    return pick;
}

function lolEscapeHtmlSafe(v) {
    return typeof lolEscapeHtml === "function" ? lolEscapeHtml(v)
        : String(v).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}

function ksToggle(el, cls, on) { if (el) el.classList.toggle(cls, !!on); }

function updateKeystoneView() {
    var view = keystoneView;
    if (!view || !keystoneActiveDataSet) return;
    var air = view.skin === "air";
    var budget = keystoneActiveDataSet.maxPoints - getKeystoneTotalPoints();
    view.root.classList.toggle("no-points-remaining", budget <= 0);
    view.picks.forEach(function(pick){
        var ranks = keystoneMasteryRanks(pick), max = pick.mastery.ranks || 1;
        var unlocked = isKeystoneTierUnlocked(pick.tree.id, pick.tierDef.tier);
        var tierTotal = keystoneTierTotal0(pick);
        var el = pick.el;
        ksToggle(el, "has-points", ranks > 0);
        ksToggle(el, "is-complete", ranks >= max);
        ksToggle(el, "is-disabled", !unlocked);
        ksToggle(el, "level-no-point", tierTotal === 0);
        var st = keystoneAirState(pick);
        el.setAttribute("data-state", st);
        ksToggle(el, "can-add", air ? keystoneCanAdd(pick) : ksLcuWouldAdd(pick));
        if (pick.value) pick.value.textContent = ranks + "/" + max;
        var src = keystoneIconUrl(pick.mastery, air && ranks === 0, view.skin);
        if (src && pick.src !== src) { pick.img.src = src; pick.src = src; }
        ksToggle(el, "no-icon", !src);
    });
    // 5-rank connectors (LCU): chevrons point at the option holding more.
    if (!air) view.root.querySelectorAll(".ks-level-5").forEach(function(level){
        var picks = view.picks.filter(function(p){ return p.level === level; })
            .sort(function(x, y){ return x.pos - y.pos; });
        var a = picks[0] ? keystoneMasteryRanks(picks[0]) : 0, b = picks[1] ? keystoneMasteryRanks(picks[1]) : 0;
        var dir = (a === 0 && b === 0) ? "" : (a === b ? "split" : (a > b ? "left-side" : "right-side"));
        ["split", "left-side", "right-side"].forEach(function(c){ level.classList.toggle(c, c === dir); });
    });
    keystoneActiveDataSet.data.trees.forEach(function(tree){
        var t = view.trees[tree.id];
        if (!t) return;
        var pts = keystoneTreePoints(tree.id);
        var comp = pts >= 18 ? 3 : (pts >= 12 ? 2 : (pts >= 6 ? 1 : 0));
        var el = t.el;
        for (var c = 0; c <= 3; c++) el.classList.toggle("completeness-" + c, c === comp);
        ksToggle(el, "no-points", pts === 0);
        ksToggle(el, "is-complete", pts >= 18);
        if (t.points) t.points.textContent = String(pts);
        if (t.reset) ksToggle(t.reset, "disabled", pts === 0);
        if (t.label) t.label.innerHTML = lolEscapeHtmlSafe(tree.name.toUpperCase() + ":") + " "
            + '<span class="ks-num">' + pts + '</span>';
    });
    if (view.info) syncKeystoneInfoBar();
    // A change under the pointer refreshes the open tooltip in place.
    if (keystoneHover && keystoneHover.pick && document.body.contains(keystoneHover.pick.el))
        showKeystoneTooltip(keystoneHover.pick, keystoneHover.evt);
}

// ---------- LCU info bar (page name · POINTS AVAILABLE · + trash ≡× SAVE) ----
// The page name and saved / unsaved state live in AirMasterySidebar (the AIR
// sidebar markup stays in the DOM, hidden in the LCU era), so SAVE / reset /
// delete behave exactly like the AIR buttons: SAVE = copy link (#share).

function buildKeystoneInfoBar(root) {
    var bar = ksEl("div", "ks-info");
    var main = ksEl("div", "ks-info-main");
    var edit = ksEl("a", "lcu-circle-btn ks-btn-edit");
    edit.setAttribute("role", "button"); edit.setAttribute("tabindex", "0");
    edit.setAttribute("aria-label", "Edit page name");
    edit.setAttribute("data-lol-tip", "Edit page name");
    var name = ksEl("div", "ks-page-name");
    var dot = ksEl("span", "ks-page-incomplete", "•");
    var text = ksEl("span", "ks-page-name-text", "Mastery Page 1");
    name.appendChild(dot); name.appendChild(text);
    var input = document.createElement("input");
    input.className = "ks-page-name-input";
    input.type = "text"; input.maxLength = 30; input.spellcheck = false;
    input.setAttribute("aria-label", "Mastery page name");
    main.appendChild(edit); main.appendChild(name); main.appendChild(input);
    var pts = ksEl("div", "ks-points-available");
    var ctrls = ksEl("div", "ks-info-controls");
    function circle(cls, label, tip, fn) {
        var b = ksEl("a", "lcu-circle-btn " + cls);
        b.setAttribute("role", "button"); b.setAttribute("tabindex", "0");
        b.setAttribute("aria-label", label);
        b.setAttribute("data-lol-tip", tip);
        b.addEventListener("click", function(){ if (!b.classList.contains("disabled")) fn(); });
        b.addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " ") { e.preventDefault(); b.click(); } });
        ctrls.appendChild(b);
        return b;
    }
    // Labels: the 7.21 en_US strings (mastery_page_*_label, refs mp721/l10n).
    var sb = function(){ return window.AirMasterySidebar || null; };
    // One page is modelled: "+" starts a fresh page (points returned, next
    // default name), like creating a page in the client.
    circle("ks-btn-add", "Add new page", "Add new page", function(){
        var m = sb();
        if (!m) { resetKeystones(); return; }
        var n = /^Mastery Page (\d+)$/.exec(m.pageName());
        m.ret();
        m.pageName("Mastery Page " + (n ? (+n[1] + 1) : 2));
    });
    circle("ks-btn-delete", "Delete page", "Delete page", function(){
        if (sb()) sb().del(); else resetKeystones();
    });
    circle("ks-btn-reset", "Reset points in this page", "Reset points in this page", function(){
        if (sb()) sb().ret(); else resetKeystones();
    });
    var save = ksEl("button", "lcu-btn ks-btn-save", "Save");
    save.type = "button";
    save.addEventListener("click", function(){
        if (sb()) sb().save(); else { var s = document.getElementById("share"); if (s) s.click(); }
        syncKeystoneInfoBar();
    });
    ctrls.appendChild(save);
    bar.appendChild(main); bar.appendChild(pts); bar.appendChild(ctrls);
    root.appendChild(bar);

    function startEdit() {
        if (bar.classList.contains("is-editing")) return;
        input.value = sb() ? sb().pageName() : text.textContent;
        bar.classList.add("is-editing");
        input.focus(); input.select();
    }
    function endEdit(commit) {
        if (!bar.classList.contains("is-editing")) return;
        bar.classList.remove("is-editing");
        if (commit && sb()) sb().pageName(input.value);
        syncKeystoneInfoBar();
    }
    edit.addEventListener("mousedown", function(e){ if (bar.classList.contains("is-editing")) e.preventDefault(); });
    edit.addEventListener("click", function(){ if (bar.classList.contains("is-editing")) endEdit(true); else startEdit(); });
    edit.addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit.click(); } });
    input.addEventListener("keydown", function(e){
        if (e.key === "Enter") { e.preventDefault(); endEdit(true); }
        else if (e.key === "Escape") { e.preventDefault(); endEdit(false); }
    });
    input.addEventListener("blur", function(){ endEdit(true); });

    // AirMasterySidebar repaints its (hidden) aside on every build change,
    // save, revert and rename: mirror that into the bar.
    var aside = document.getElementById("mastery-sidebar");
    if (aside && window.MutationObserver && !aside._ksObserved) {
        aside._ksObserved = true;
        new MutationObserver(function(){
            if (keystoneView && keystoneView.info) syncKeystoneInfoBar();
        }).observe(aside, { attributes: true, attributeFilter: ["data-dirty"], subtree: true, childList: true, characterData: true });
    }
    return { bar: bar, name: text, dot: dot, points: pts, save: save };
}

function syncKeystoneInfoBar() {
    var info = keystoneView && keystoneView.info;
    if (!info || !keystoneActiveDataSet) return;
    var left = keystoneActiveDataSet.maxPoints - getKeystoneTotalPoints();
    info.points.textContent = "Points Available: " + left;
    info.points.classList.toggle("points-left", left > 0);
    info.dot.style.display = left > 0 ? "" : "none";
    var sb = window.AirMasterySidebar;
    info.name.textContent = sb ? sb.pageName() : "Mastery Page 1";
    var dirty = sb ? sb.isDirty() : true;
    info.save.disabled = !dirty;
    if (!dirty) info.save.setAttribute("data-lol-tip", "No changes to save");
    else info.save.setAttribute("data-lol-tip", "Save this page (copies its link)");
}

// ---------- Interaction ------------------------------------------------------

// --- LCU click model: the 7.21 mastery-icon component + mastery / level
// models (refs/keystone/mp721/panel.js):
//   click          addMaxMasteryPoints — fill the mastery: min(ranks, row
//                  points + min(row room, page points)); a sibling's points
//                  move over first (giveMaxPointsToSibling).
//   shift+click    addMasteryPoint — +1, or take one from a sibling when
//                  the row (or the page) has no room left.
//   right-click    removeAllMasteryPoints; shift+right-click removeMasteryPoint.
//   wheel          up: empty row → fill, else +1; down: -1.
// Removing is refused while higher rows hold points (canRemovePoint: tree
// points > level.pointsRequired + ranks); those rows flash (highlight()).
// canAddPoint: page full → only a row that already holds points; otherwise
// a row that holds points or is unlocked.

function ksPts(treeId, tierDef, masteryId) {
    var s = keystoneState[treeId];
    if (tierDef.isKeystone) return s.keystone === masteryId ? 1 : 0;
    return s.tiers[tierDef.tier][masteryId] || 0;
}

function ksSetPts(treeId, tierDef, masteryId, n) {
    var s = keystoneState[treeId];
    if (tierDef.isKeystone) {
        if (n > 0) {
            var act = keystoneState.__activeKeystone;
            if (act && act.treeId !== treeId) keystoneState[act.treeId].keystone = null;
            s.keystone = masteryId;
            keystoneState.__activeKeystone = { treeId: treeId, masteryId: masteryId };
        } else if (s.keystone === masteryId) {
            s.keystone = null;
            keystoneState.__activeKeystone = null;
        }
        return;
    }
    if (n > 0) s.tiers[tierDef.tier][masteryId] = n;
    else delete s.tiers[tierDef.tier][masteryId];
}

function ksLcuCtx(pick) {
    var td = pick.tierDef;
    return {
        tid: pick.tree.id, td: td, id: pick.mastery.id,
        c: keystoneMasteryRanks(pick),               // mastery.pointsAssigned
        R: pick.mastery.ranks || 1,                  // mastery.ranks
        P: td.isKeystone ? 1 : keystoneTierPool(td), // level.maxPointsInRow
        L: keystoneTierTotal0(pick),                 // level.levelPointsAssigned
        B: keystoneActiveDataSet.maxPoints - getKeystoneTotalPoints(), // page.pointsRemaining
        unlocked: isKeystoneTierUnlocked(pick.tree.id, td.tier)
    };
}

function ksLcuCanAdd(x) { return x.B <= 0 ? x.L > 0 : (x.L > 0 || x.unlocked); }

// Points the mastery holds after a plain click (siblings' points move over,
// the rest of the row fills from the page's points).
function ksLcuClickTarget(x) {
    return Math.min(x.R, x.L + Math.min(x.P - x.L, Math.max(0, x.B)));
}

// Would a plain click change anything (cursor / .can-add / tooltip)?
function ksLcuWouldAdd(pick) {
    var x = ksLcuCtx(pick);
    return ksLcuCanAdd(x) && ksLcuClickTarget(x) > x.c;
}

function ksLcuAddMax(pick) {
    var x = ksLcuCtx(pick);
    if (!ksLcuCanAdd(x)) return false;
    var target = ksLcuClickTarget(x);
    if (target <= x.c) return false;
    x.td.masteries.forEach(function(m){ if (m.id !== x.id) ksSetPts(x.tid, x.td, m.id, 0); });
    ksSetPts(x.tid, x.td, x.id, target);
    return true;
}

function ksLcuAddOne(pick) {
    var x = ksLcuCtx(pick);
    if (!ksLcuCanAdd(x)) return false;
    if (Math.min(x.P - x.L, x.B) <= 0) {             // getPointFromSibling
        var sib = null;
        x.td.masteries.forEach(function(m){
            if (!sib && m.id !== x.id && ksPts(x.tid, x.td, m.id) > 0) sib = m;
        });
        if (!sib || x.c >= x.R) return false;
        ksSetPts(x.tid, x.td, sib.id, ksPts(x.tid, x.td, sib.id) - 1);
        ksSetPts(x.tid, x.td, x.id, x.c + 1);
        return true;
    }
    if (x.c >= x.R) return false;
    ksSetPts(x.tid, x.td, x.id, x.c + 1);
    return true;
}

function ksLcuRemove(pick, all) {
    var x = ksLcuCtx(pick);
    if (x.c === 0) return false;
    if (keystoneTreePoints(x.tid) > keystoneTierThreshold(pick.tree, x.td.tier) + x.R) {
        ksHighlightLevelsAbove(pick);
        return false;
    }
    ksSetPts(x.tid, x.td, x.id, all ? 0 : x.c - 1);
    return true;
}

// mastery-highlight (750ms): the higher rows that still hold points.
function ksHighlightLevelsAbove(pick) {
    var t = keystoneView && keystoneView.trees[pick.tree.id];
    if (!t) return;
    Array.prototype.forEach.call(t.el.querySelectorAll(".ks-level"), function(level){
        var tier = +level.getAttribute("data-tier");
        if (tier <= pick.tierDef.tier) return;
        var td = keystoneTierDef(pick.tree, tier);
        var pts = td.isKeystone ? (keystoneState[pick.tree.id].keystone ? 1 : 0)
            : keystoneTierTotal(pick.tree.id, tier);
        if (pts <= 0 || level.classList.contains("ks-highlight")) return;
        level.classList.add("ks-highlight");
        var done = function(e){
            if (e && (e.target !== level || e.animationName !== "ks-highlight")) return;
            level.classList.remove("ks-highlight");
            level.removeEventListener("animationend", done);
        };
        level.addEventListener("animationend", done);
        setTimeout(done, 2000);
    });
}

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
    // In-place update: the hovered mastery keeps its element, so its
    // tooltip is refreshed rather than closed.
    drawKeystoneCalculator();
    updateKeystoneLink();
}

function updateKeystonePointsLabel() {
    var total = getKeystoneTotalPoints();
    var max = keystoneActiveDataSet.maxPoints;
    $("#points>.count").text(max - total);
    // AIR sidebar emblem counts / Points Available / Save-Revert state.
    if (typeof updateMasterySidebar === "function") updateMasterySidebar();
    if (keystoneView && keystoneView.info) syncKeystoneInfoBar();
}

// Sidebar emblem double-click / LCU tree reset: refund one tree (and its
// keystone).
function resetKeystoneTree(treeId) {
    if (!keystoneActiveDataSet || !keystoneState[treeId]) return;
    var s = keystoneState[treeId];
    for (var t in s.tiers) s.tiers[t] = {};
    if (keystoneState.__activeKeystone && keystoneState.__activeKeystone.treeId === treeId)
        keystoneState.__activeKeystone = null;
    s.keystone = null;
    keystoneRefreshAll();
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
